import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { REHAB_CONSULT_CATEGORIES } from "./platform.js";
import { sanitizeActionText, truncateForMemory } from "./helpers.js";
import { buildChatRagContext } from "./rag.js";
import { rankActionsForChat } from "./action-retrieval.js";
import type {
  ActionLibraryItem,
  ChatContext,
  ChatMessage,
  ChatOption,
  ChatRecommendedAction,
  GuidedChatResult,
  QwenChatClientOptions,
  RagEvidenceSnippet,
  RehabActionType,
  RehabConsultCategory,
  UserMemory,
} from "./types.js";

export class UpstreamChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamChatError";
  }
}

export class QwenChatClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: QwenChatClientOptions = {}) {
    loadLocalEnv();
    this.apiKey = options.apiKey ?? process.env.DASHSCOPE_API_KEY ?? "";
    this.model = options.model ?? process.env.DASHSCOPE_MODEL ?? "qwen3.7-plus";
    this.baseUrl =
      options.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.DASHSCOPE_TIMEOUT_MS ?? 60000);
  }

  async chat(messages: ChatMessage[], context: ChatContext = {}): Promise<GuidedChatResult> {
    const localSafetyResponse = buildLocalSafetyResponse(messages, context);
    if (localSafetyResponse) {
      return localSafetyResponse;
    }

    if (!this.apiKey) {
      throw new UpstreamChatError("DASHSCOPE_API_KEY is required for Qwen chat.");
    }

    const effectiveContext =
      context.ragContext && context.ragContext.length > 0
        ? context
        : { ...context, ragContext: buildChatRagContext(messages, context.category) };

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetcher(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: buildChatSystemPrompt(effectiveContext, messages),
            },
            ...messages,
          ],
          temperature: 0.2,
          // Qwen3 思考模型默认每轮生成一长串推理链，导致 15s+ 延迟甚至超时。
          // 引导式问诊不需要显式思考，关掉后延迟降到 ~1s。
          enable_thinking: false,
        }),
      });
    } catch (error) {
      if (timedOut) {
        throw new UpstreamChatError(`DashScope chat timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new UpstreamChatError(`DashScope chat failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new UpstreamChatError("DashScope chat returned an empty response.");
    }
    return {
      ...buildGuidedChatResponse(messages, effectiveContext, content),
      model: this.model,
    };
  }
}

let sharedDefaultQwenChatClient: QwenChatClient | null = null;

export async function chatWithQwen(
  messages: ChatMessage[],
  context: ChatContext = {},
  options: QwenChatClientOptions = {},
): Promise<GuidedChatResult> {
  if (Object.keys(options).length === 0) {
    sharedDefaultQwenChatClient ??= new QwenChatClient();
    return sharedDefaultQwenChatClient.chat(messages, context);
  }
  return new QwenChatClient(options).chat(messages, context);
}

export function buildChatSystemPrompt(context: ChatContext = {}, messages: ChatMessage[] = []): string {
  const category = context.category ? REHAB_CONSULT_CATEGORIES[context.category] : undefined;
  const categoryScope = category
    ? [
        `当前咨询类别：${category.label}`,
        `类别范围：${category.scope}`,
        `回答时只围绕${category.label}相关的运动康复教育、风险分层、训练调整和就医提醒。`,
        "如果用户的问题明显超出该类别，请先说明当前对话已锁定此类别，并建议用户切换咨询类别后再继续。",
      ].join("\n")
    : "当前咨询类别：未选择。请先引导用户选择膝盖、脚踝、肩膀、腰背或髋部等咨询类别。";
  const ragContext = formatRagContext(context.ragContext ?? []);

  return [
    "你是 Mentis Rehab 的运动康复 AI 助手。你提供康复教育、风险分层、训练建议和就医提醒；不能下诊断、不能替代医生或康复师。遇到红旗症状时，优先建议线下就医。",
    [
      "说话规则：使用中文，简短、温和、实用。",
      "不要使用 Markdown、加粗符号、标题、表格或长编号列表。",
      "一次只问一个主要问题。",
      "像认真问诊的康复医生一样先理解用户原话；不要机械推进流程，不要忽略用户临时插入的问题。",
      "需要继续评估时，由你根据当前上下文生成 2-6 个可点击选项；选项必须贴合用户这一轮内容，不能使用固定模板。",
      "如果用户点选了选项，也要把它当作新的用户回答重新思考，再决定下一步。",
      "如果用户询问你使用的模型、底层大模型、供应商或技术来源，只回答：我使用的是 Mentis 特调的 AI 康复模型。",
      "不要提及千问、Qwen、DashScope、DeepSeek、OpenAI 或任何底层模型/供应商名称。",
    ].join("\n"),
    [
      "输出格式：只返回一个 JSON 对象，不要包裹代码块。",
      'JSON 字段：{"content":"给用户看的回答","question":"下一步只问一个问题，可省略","options":[{"label":"按钮文案","value":"点击后发送给模型的完整回答"}],"recommendedActions":[{"actionId":"库里动作 id，可省略","title":"动作名","bodyRegion":"knee","actionType":"stretch|strength|activation|mobility|balance|plyometric|conditioning","targetMuscles":["腘绳肌"],"phase":"阶段","defaultDosage":"剂量","instructions":["步骤"],"contraindications":["停止条件"],"progressionCriteria":["进阶标准"],"tags":["标签"],"reason":"为什么推荐"}]}',
      "如果不需要按钮，省略 question 和 options。",
      "如果推荐训练动作，必须放在 recommendedActions，不要只把动作写进 content 散文里。",
      "recommendedActions 里的动作必须和你在 content 里描述的动作完全一致。content 说拉伸大腿后侧，就不能推荐拉伸大腿前侧的动作。",
      "actionType 和 targetMuscles 必填，它们要如实描述你推荐的这个动作。",
      "关于 actionId：只有当动作库里某个动作【就是】你要推荐的那个动作时，才填它的 actionId。哪怕只是部位相近、名字相似，也不要填——直接生成新动作，把字段填完整即可。填错 actionId 比不填更糟。",
      "一次推荐 1-5 个动作，具体几个由你根据用户情况判断，不用凑数也不用只给一个。",
      "content 必须能单独成立；question 和 options 只是结构化交互辅助。",
    ].join("\n"),
    formatActionLibraryContext(context.actionLibrary ?? [], messages, context.category),
    buildUserMemoryContext(context.userMemory),
    categoryScope,
    ragContext
      ? `可用 RAG 证据：\n${ragContext}\n回答必须优先使用这些证据；如果证据不足，明确说明需要补充信息，不要编造来源。`
      : "当前第一版还没有接入实时 RAG 检索。不要编造 RAG 引用、论文名、页码或不存在的证据来源。",
  ].join("\n\n");
}

export function buildUserMemoryContext(memory?: UserMemory): string {
  if (!memory) {
    return "用户记忆摘要：暂无。";
  }

  const profileSummary = memory.profileSummary || memory.notes.slice(0, 2).join("；");
  const sections = [
    "用户记忆摘要（压缩版，仅供个性化问诊使用，不代表诊断）：",
    profileSummary ? `画像：${truncateForMemory(profileSummary, 220)}` : "",
    memory.clinicalSummary ? `康复摘要：${truncateForMemory(memory.clinicalSummary, 320)}` : "",
    memory.activePlanSummary ? `当前计划：${truncateForMemory(memory.activePlanSummary, 320)}` : "",
    ...(memory.recentEvents ?? [])
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5)
      .map((event) => `最近事件：${truncateForMemory(event.summary, 70)}`),
  ].filter(Boolean);
  return truncateForMemory(sections.join("\n"), 1200);
}

export function buildGuidedChatResponse(
  messages: ChatMessage[],
  context: ChatContext = {},
  modelContent = "",
): GuidedChatResult {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestUserContent = latestUserMessage?.content.trim() ?? "";
  const parsed = parseModelGuidedChatOutput(modelContent);

  return {
    content: parsed.content || sanitizeAssistantContent(initialOpenQuestion(context.category, latestUserContent)),
    model: "llm",
    question: parsed.question,
    options: parsed.options,
    recommendedActions: parsed.recommendedActions,
  };
}

export function sanitizeAssistantContent(content: string): string {
  return content
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\|/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
}

function initialOpenQuestion(category: RehabConsultCategory | undefined, latestUserContent: string): string {
  if (latestUserContent) {
    return "我看到了你的问题。请再补充一下最主要的不适、持续时间和诱发动作。";
  }
  if (category) {
    return "请直接告诉我你今天最想咨询的不适、持续多久了，以及什么动作会诱发。";
  }
  return "请先选择咨询部位，或直接描述你的不适。";
}

function parseModelGuidedChatOutput(
  rawContent: string,
): Pick<GuidedChatResult, "content" | "question" | "options" | "recommendedActions"> {
  const raw = rawContent.trim();
  const jsonText = stripJsonCodeFence(raw);
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const content = sanitizeAssistantContent(readFirstString(parsed, ["content", "answer", "message"]));
    const question = sanitizeAssistantContent(readFirstString(parsed, ["question"]));
    const options = normalizeModelOptions(parsed.options);
    const recommendedActions = normalizeRecommendedActions(parsed.recommendedActions);
    return {
      content,
      question: question || undefined,
      options: options.length > 0 ? options : undefined,
      recommendedActions: recommendedActions.length > 0 ? recommendedActions : undefined,
    };
  } catch {
    return { content: sanitizeAssistantContent(raw) };
  }
}

function stripJsonCodeFence(content: string): string {
  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = fenced ? fenced[1].trim() : content;
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start >= 0 && end > start ? unfenced.slice(start, end + 1).trim() : unfenced;
}

function readFirstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function normalizeModelOptions(value: unknown): ChatOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => {
      if (typeof entry === "string") {
        const label = sanitizeOptionText(entry);
        return label ? { id: `llm_option_${index + 1}`, label, value: label } : null;
      }
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const option = entry as Record<string, unknown>;
      const label = sanitizeOptionText(
        typeof option.label === "string" ? option.label : typeof option.text === "string" ? option.text : "",
      );
      if (!label) {
        return null;
      }
      const rawValue = typeof option.value === "string" && option.value.trim() ? option.value : label;
      const id = typeof option.id === "string" && option.id.trim() ? option.id.trim() : `llm_option_${index + 1}`;
      return { id, label, value: sanitizeOptionText(rawValue) || label };
    })
    .filter((option): option is ChatOption => Boolean(option))
    .slice(0, 6);
}

function normalizeRecommendedActions(value: unknown): ChatRecommendedAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const action = entry as Record<string, unknown>;
      const title = sanitizeActionText(readFirstString(action, ["title", "name"]));
      const phase = sanitizeActionText(readFirstString(action, ["phase"]));
      const defaultDosage = sanitizeActionText(readFirstString(action, ["defaultDosage", "dosage", "meta"]));
      const bodyRegion = normalizeActionBodyRegion(readFirstString(action, ["bodyRegion"]));
      if (!title || !phase || !defaultDosage) {
        return null;
      }
      const actionId = sanitizeActionId(readFirstString(action, ["actionId", "id"]));
      const reason = sanitizeActionText(readFirstString(action, ["reason", "rationale"]));
      const recommendedAction: ChatRecommendedAction = {
        title,
        bodyRegion,
        phase,
        defaultDosage,
        instructions: normalizeStringList(action.instructions).slice(0, 5),
        contraindications: normalizeStringList(action.contraindications).slice(0, 5),
        progressionCriteria: normalizeStringList(action.progressionCriteria).slice(0, 5),
        tags: normalizeStringList(action.tags).slice(0, 10),
      };
      const actionType = normalizeActionType(readFirstString(action, ["actionType", "type"]));
      if (actionType) {
        recommendedAction.actionType = actionType;
      }
      const targetMuscles = normalizeStringList(action.targetMuscles).slice(0, 5);
      if (targetMuscles.length > 0) {
        recommendedAction.targetMuscles = targetMuscles;
      }
      if (actionId) {
        recommendedAction.actionId = actionId;
      }
      if (reason) {
        recommendedAction.reason = reason;
      }
      return recommendedAction;
    })
    .filter((action): action is ChatRecommendedAction => Boolean(action))
    .slice(0, 5);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? sanitizeActionText(item) : ""))
    .filter(Boolean);
}

function sanitizeActionId(content: string): string {
  return content.replace(/[^a-zA-Z0-9_-]/g, "").trim().slice(0, 80);
}

export function normalizeActionType(value: string): RehabActionType | undefined {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "stretch" ||
    normalized === "strength" ||
    normalized === "activation" ||
    normalized === "mobility" ||
    normalized === "balance" ||
    normalized === "plyometric" ||
    normalized === "conditioning"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeActionBodyRegion(value: string): ActionLibraryItem["bodyRegion"] {
  const normalized = value.trim();
  if (
    normalized === "knee" ||
    normalized === "ankle_foot" ||
    normalized === "hip" ||
    normalized === "spine" ||
    normalized === "shoulder" ||
    normalized === "other"
  ) {
    return normalized;
  }
  return "other";
}

function sanitizeOptionText(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function formatActionLibraryContext(
  actions: ActionLibraryItem[],
  messages: ChatMessage[],
  category?: RehabConsultCategory,
): string {
  const relevantActions = rankActionsForChat(actions, messages, category, 15);
  if (relevantActions.length === 0) {
    return [
      "可用动作库：当前类别库里还没有动作。",
      "请直接按 recommendedActions 的格式生成合适的康复动作，字段要填完整。",
    ].join("\n");
  }
  return [
    "可用动作库（下面每行是：id: 动作名；类型；目标肌群；阶段；剂量）：",
    ...relevantActions.map((action) => {
      const muscles = action.targetMuscles?.length ? action.targetMuscles.join("、") : "未标注";
      const type = action.actionType ?? "未标注";
      return `- ${action.id}: ${action.title}；${type}；${muscles}；${action.phase}；${action.defaultDosage}`;
    }),
  ].join("\n");
}

function buildLocalSafetyResponse(messages: ChatMessage[], context: ChatContext): GuidedChatResult | null {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestUserContent = latestUserMessage?.content.trim() ?? "";
  if (isModelIdentityQuestion(latestUserContent)) {
    return {
      content: "我使用的是 Mentis 特调的 AI 康复模型。",
      model: "mentis-rehab",
    };
  }
  return null;
}

function isModelIdentityQuestion(content: string): boolean {
  return /什么.*模型|哪个.*模型|模型.*来源|底层.*模型|用.*模型|供应商|千问|Qwen|DashScope|OpenAI|DeepSeek/i.test(content);
}

function formatRagContext(snippets: RagEvidenceSnippet[]): string {
  return snippets
    .filter((snippet) => snippet.text.trim())
    .slice(0, 5)
    .map((snippet, index) => {
      const page = snippet.page ? `, page ${snippet.page}` : "";
      return `${index + 1}. ${snippet.source}${page}\n${snippet.text.trim()}`;
    })
    .join("\n\n");
}

let localEnvLoaded = false;

function loadLocalEnv() {
  if (localEnvLoaded) {
    return;
  }
  localEnvLoaded = true;
  const envPath = findUp(".env.local", process.cwd());
  if (!existsSync(envPath)) {
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function findUp(fileName: string, startDir: string): string {
  let current = resolve(startDir);
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return candidate;
    }
    current = dirname(current);
  }
}
