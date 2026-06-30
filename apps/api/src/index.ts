import {
  assessRedFlags,
  buildInitialAssessment,
  createAuditEvent,
  draftKneeRunningPlan,
  type Assessment,
  type AuditEvent,
  type Clinician,
  type RehabPlan,
  type TriageResult,
  type User,
} from "@mentis/domain";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

export interface PlatformDemo {
  users: User[];
  clinicians: Clinician[];
  demoCredentials: DemoCredential[];
  userMemories: Record<string, UserMemory>;
}

export type AssessmentWorkflowInput = Omit<Assessment, "createdAt"> & {
  userId: string;
};

export interface DemoCredential {
  username: string;
  password: string;
  userId: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthenticatedSession {
  token: string;
  user: User;
  memory: UserMemory;
}

export interface MemoryCaseSummary {
  id: string;
  categoryId: RehabConsultCategory;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
}

export interface MemoryTrainingPlan {
  id: string;
  title: string;
  status: "active" | "paused" | "completed";
  updatedAt: string;
}

export interface UserMemory {
  userId: string;
  cases: MemoryCaseSummary[];
  trainingPlans: MemoryTrainingPlan[];
  notes: string[];
  updatedAt: string;
}

export interface AssessmentWorkflowResult {
  triage: TriageResult;
  aiDraft: { plan: RehabPlan } | null;
  referral: {
    available: boolean;
    reason: string;
    clinicianIds: string[];
  };
  auditEvents: AuditEvent[];
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatResult {
  content: string;
  model: string;
}

export type RehabConsultCategory = "knee" | "ankle" | "shoulder" | "lower_back" | "hip";

export interface RehabConsultCategoryConfig {
  id: RehabConsultCategory;
  label: string;
  scope: string;
  examples: string[];
}

export interface RagEvidenceSnippet {
  source: string;
  page?: number | string;
  text: string;
  score?: number;
}

export interface ChatContext {
  category?: RehabConsultCategory;
  ragContext?: RagEvidenceSnippet[];
}

export interface QwenChatClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_WEB_ORIGIN = "http://127.0.0.1:5173";

export const REHAB_CONSULT_CATEGORIES: Record<RehabConsultCategory, RehabConsultCategoryConfig> = {
  knee: {
    id: "knee",
    label: "膝盖",
    scope: "膝关节、髌股疼痛、跑步膝、髌腱/髌下区域不适、膝关节负荷管理与康复训练",
    examples: ["跑步后膝前痛", "上下楼疼", "深蹲时膝盖不舒服"],
  },
  ankle: {
    id: "ankle",
    label: "脚踝",
    scope: "踝关节扭伤、跑步后踝部疼痛、跟腱周围不适、踝稳定性与活动度训练",
    examples: ["崴脚后多久能跑", "跑步后外踝疼", "跟腱附近紧"],
  },
  shoulder: {
    id: "shoulder",
    label: "肩膀",
    scope: "肩关节疼痛、肩袖相关不适、过顶动作疼痛、肩胛控制与上肢训练调整",
    examples: ["卧推肩痛", "举手疼", "游泳后肩膀不舒服"],
  },
  lower_back: {
    id: "lower_back",
    label: "腰背",
    scope: "腰背疼痛、训练后腰部不适、髋腰控制、核心负荷管理与恢复建议",
    examples: ["硬拉后腰酸", "久坐腰痛", "跑步后下背紧"],
  },
  hip: {
    id: "hip",
    label: "髋部",
    scope: "髋部疼痛、臀肌/髋屈肌相关不适、跑步髋部负荷、髋活动度与力量训练",
    examples: ["跑步髋外侧疼", "臀部深处痛", "髋前侧夹挤感"],
  },
};

export function resolveCorsOrigin(
  requestOrigin?: string | null,
  configuredOrigin = process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
): string {
  const allowedOrigins = configuredOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const fallbackOrigin = allowedOrigins[0] ?? DEFAULT_WEB_ORIGIN;

  if (!requestOrigin) {
    return fallbackOrigin;
  }
  if (allowedOrigins.includes("*")) {
    return "*";
  }
  if (allowedOrigins.includes(requestOrigin) || isLocalDevOrigin(requestOrigin)) {
    return requestOrigin;
  }
  return fallbackOrigin;
}

export function createPlatformDemo(): PlatformDemo {
  return {
    users: [{ id: "user_1", role: "user", displayName: "张运动" }],
    clinicians: [
      {
        id: "clinician_1",
        role: "clinician",
        displayName: "李康复师",
        credentialStatus: "verified",
        specialties: ["knee", "running"],
      },
    ],
    demoCredentials: [{ username: "zhang", password: "mentis2026", userId: "user_1" }],
    userMemories: {
      user_1: {
        userId: "user_1",
        cases: [],
        trainingPlans: [],
        notes: ["中级跑者，每周训练 4-5 次，目标是安全恢复跑步。"],
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function authenticateDemoUser(platform: PlatformDemo, input: LoginInput): AuthenticatedSession {
  const credential = platform.demoCredentials.find(
    (candidate) => candidate.username === input.username && candidate.password === input.password,
  );
  if (!credential) {
    throw new Error("Invalid username or password");
  }

  const user = platform.users.find((candidate) => candidate.id === credential.userId);
  if (!user) {
    throw new Error(`Unknown user: ${credential.userId}`);
  }

  return {
    token: `demo_${user.id}_${demoTokenId()}`,
    user,
    memory: getUserMemory(platform, user.id),
  };
}

export function getUserMemory(platform: PlatformDemo, userId: string): UserMemory {
  const user = platform.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`Unknown user: ${userId}`);
  }

  platform.userMemories[userId] ??= {
    userId,
    cases: [],
    trainingPlans: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };

  return platform.userMemories[userId];
}

export function rememberCase(platform: PlatformDemo, userId: string, input: MemoryCaseSummary): UserMemory {
  const memory = getUserMemory(platform, userId);
  const nextCase = { ...input, createdAt: input.createdAt || new Date().toISOString() };
  memory.cases = [nextCase, ...memory.cases.filter((candidate) => candidate.id !== nextCase.id)];
  memory.updatedAt = new Date().toISOString();
  return memory;
}

function demoTokenId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export async function runAssessmentWorkflow(
  platform: PlatformDemo,
  input: AssessmentWorkflowInput,
): Promise<AssessmentWorkflowResult> {
  const user = platform.users.find((candidate) => candidate.id === input.userId);
  if (!user) {
    throw new Error(`Unknown user: ${input.userId}`);
  }

  const assessment = buildInitialAssessment({
    bodyRegion: input.bodyRegion,
    conditionFocus: input.conditionFocus,
    painScore: input.painScore,
    durationDays: input.durationDays,
    symptoms: input.symptoms,
    trainingLoad: input.trainingLoad,
  });
  const triage = assessRedFlags(assessment);
  const auditEvents: AuditEvent[] = [
    createAuditEvent({
      actorId: user.id,
      actorRole: "user",
      caseId: "case_demo",
      action: "assessment_submitted",
      metadata: {
        bodyRegion: assessment.bodyRegion,
        conditionFocus: assessment.conditionFocus,
      },
    }),
  ];

  if (triage.level === "urgent_referral") {
    auditEvents.push(
      createAuditEvent({
        actorId: "system",
        actorRole: "admin",
        caseId: "case_demo",
        action: "urgent_referral_triggered",
        metadata: { matchedRedFlags: triage.matchedRedFlags },
      }),
    );
    return {
      triage,
      aiDraft: null,
      referral: {
        available: true,
        reason: "检测到红旗风险，建议优先线下就医或联系医生/康复师。",
        clinicianIds: platform.clinicians
          .filter((clinician) => clinician.credentialStatus === "verified")
          .map((clinician) => clinician.id),
      },
      auditEvents,
    };
  }

  const plan = draftKneeRunningPlan(assessment);
  auditEvents.push(
    createAuditEvent({
      actorId: "system",
      actorRole: "admin",
      caseId: "case_demo",
      action: "ai_rehab_draft_created",
      metadata: {
        stages: plan.stages.length,
        disclaimer: plan.disclaimer,
      },
    }),
  );

  return {
    triage,
    aiDraft: { plan },
    referral: {
      available: true,
      reason: "可预约医生/康复师复核 AI 康复草案。",
      clinicianIds: platform.clinicians
        .filter((clinician) => clinician.credentialStatus === "verified")
        .map((clinician) => clinician.id),
    },
    auditEvents,
  };
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
    this.timeoutMs = options.timeoutMs ?? Number(process.env.DASHSCOPE_TIMEOUT_MS ?? 25000);
  }

  async chat(messages: ChatMessage[], context: ChatContext = {}): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new Error("DASHSCOPE_API_KEY is required for Qwen chat.");
    }

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
              content: buildChatSystemPrompt(context),
            },
            ...messages,
          ],
          temperature: 0.2,
        }),
      });
    } catch (error) {
      if (timedOut) {
        throw new Error(`DashScope chat timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DashScope chat failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("DashScope chat returned an empty response.");
    }
    return { content, model: this.model };
  }
}

export async function chatWithQwen(
  messages: ChatMessage[],
  context: ChatContext = {},
  options: QwenChatClientOptions = {},
): Promise<ChatResult> {
  return new QwenChatClient(options).chat(messages, context);
}

export function buildChatSystemPrompt(context: ChatContext = {}): string {
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
    categoryScope,
    ragContext
      ? `可用 RAG 证据：\n${ragContext}\n回答应优先使用这些证据，并在需要时提及来源。`
      : "当前第一版还没有接入实时 RAG 检索。不要编造 RAG 引用、论文名、页码或不存在的证据来源。",
  ].join("\n\n");
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

function loadLocalEnv() {
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

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
