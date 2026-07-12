# Mentis 康复闭环加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让聊天记录跨刷新留存、让 AI 推荐的动作和它自己说的话一致、让用户能按天勾选完成训练、并把 1112 个健身动作换成手写的膝关节康复动作库。

**Architecture:** 后端是零框架 Node `http` server，全内存 `PlatformDemo` 对象 + 单个 JSON 文件落盘（`storage.ts`）。所有业务逻辑是纯函数，routes 在 `server.ts` 里顺序匹配。新增能力一律做成纯函数模块 + 在 `server.ts` 加分支 + 在 `apps/api/test/` 加 vitest。前端 React 19，改动集中在 `App.tsx` / `PlansPage.tsx` / `MessageBubble.tsx` / `caseUtils.ts`。

**Tech Stack:** TypeScript, Node 原生 http, React 19 + Vite, vitest, npm workspaces。LLM 走 DashScope OpenAI 兼容接口（`chat.ts`）。

## Global Constraints

- **构建顺序**：`npm run build -w @mentis/domain` 必须先跑，api/web 才能解析到 `@mentis/domain` 的 `dist`。改了 `packages/domain/src/index.ts` 之后必须重新 build domain。
- **UI 约定**：扁平描边，**不要投影/阴影**。
- **中文优先**：所有面向用户的文案、动作名、步骤说明一律中文。
- **动作库数据源**：本计划完成后，动作库的唯一数据源是 `apps/api/src/action-library.seed.ts`（手写）。`exercise-library.generated.ts` 被删除，其生成脚本本就不在仓库里。
- **不要碰生产**：所有任务在本地开发环境完成。唯一动生产数据的是 Task 14 的迁移脚本，它**只写脚本、不执行**；执行时机由用户单独确认。
- **新增字段一律 optional**：`platform-state.json` 里已有大量旧数据，`hydrateFromDisk` 会把它们合并回来。任何新增的 interface 字段必须是可选的，否则旧数据反序列化后就是非法状态。
- **测试命令**：api 测试 `npm test -w @mentis/api`，web 测试 `npm test -w @mentis/web`，全量 `npm test`。

## File Structure

**新建：**
- `apps/api/src/text-scoring.ts` — tf-idf 分词与打分工具（从 `rag.ts` 抽出，供 rag 和动作召回共用）
- `apps/api/src/case-messages.ts` — 病例聊天消息的存取（纯函数）
- `apps/api/src/action-retrieval.ts` — 按对话内容从动作库召回候选动作
- `apps/api/src/action-library.seed.ts` — 手写的膝关节康复动作种子库（Task 12）
- `apps/api/test/case-messages.test.ts`
- `apps/api/test/action-retrieval.test.ts`
- `apps/api/test/recommended-actions.test.ts`
- `apps/api/test/plan-completions.test.ts`
- `apps/web/src/planProgress.ts` — 今日完成度计算（纯函数，好测）
- `apps/web/src/planProgress.test.ts`
- `scripts/purge-fitness-library.mjs` — 生产数据迁移脚本（Task 14）

**修改：**
- `packages/domain/src/index.ts` — `ActionLibraryItem` 扩展字段
- `apps/api/src/types.ts` — `PlatformDemo.caseMessages`、`StoredCaseMessage`、`ChatRecommendedAction` 扩展、`MemoryTrainingPlan` 对齐 + `completions`
- `apps/api/src/storage.ts` — 持久化白名单加 `caseMessages`
- `apps/api/src/platform.ts` — 初始化 `caseMessages`；换掉种子动作库
- `apps/api/src/rag.ts` — 改为 import `text-scoring.ts`
- `apps/api/src/chat.ts` — prompt 注入格式、候选召回、措辞反转、多动作、解析新字段
- `apps/api/src/consultations.ts` — `resolveRecommendedActions` 一致性校验
- `apps/api/src/memory.ts` — 打卡记录 + 依从性摘要
- `apps/api/src/server.ts` — 3 条新路由
- `apps/web/src/types.ts`、`caseUtils.ts`、`App.tsx`、`components/MessageBubble.tsx`、`components/PlansPage.tsx`、`styles.css`

---

## 阶段 A：聊天记录持久化

### Task 1: 后端聊天消息存储

**Files:**
- Modify: `apps/api/src/types.ts`（新增 `StoredCaseMessage`，`PlatformDemo` 加 `caseMessages`）
- Modify: `apps/api/src/platform.ts:133` 附近（初始化 `caseMessages: {}`）
- Modify: `apps/api/src/storage.ts:7-22`（`PERSISTABLE_KEYS` 加 `caseMessages`）、`hydrateFromDisk`
- Create: `apps/api/src/case-messages.ts`
- Modify: `apps/api/src/index.ts`（re-export）
- Test: `apps/api/test/case-messages.test.ts`

**Interfaces:**
- Consumes: `PlatformDemo`、`notFound()`（`helpers.ts`）
- Produces:
  - `interface StoredCaseMessage { role: ChatRole; content: string; question?: string; assessmentStep?: string; options?: ChatOption[]; recommendedActions?: ChatRecommendedAction[]; createdAt: string }`
  - `const MAX_CASE_MESSAGES = 200`
  - `listCaseMessages(platform: PlatformDemo, caseId: string): StoredCaseMessage[]`
  - `appendCaseMessages(platform: PlatformDemo, caseId: string, messages: StoredCaseMessage[]): StoredCaseMessage[]`

注意：不存 `planPatch`。后端的 `GuidedChatResult` 从来没有这个字段，前端 `App.tsx:361` 读的 `data.planPatch` 恒为 undefined，是死代码。

- [ ] **Step 1: 写失败的测试**

创建 `apps/api/test/case-messages.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { appendCaseMessages, createPlatformDemo, listCaseMessages, MAX_CASE_MESSAGES } from "../src/index";
import type { StoredCaseMessage } from "../src/index";

function message(content: string, role: StoredCaseMessage["role"] = "user"): StoredCaseMessage {
  return { role, content, createdAt: new Date().toISOString() };
}

describe("case messages", () => {
  it("returns an empty list for a case with no messages", () => {
    const platform = createPlatformDemo();
    expect(listCaseMessages(platform, "case_unknown")).toEqual([]);
  });

  it("appends messages in order and reads them back", () => {
    const platform = createPlatformDemo();
    appendCaseMessages(platform, "case_1", [message("膝盖下楼梯疼")]);
    appendCaseMessages(platform, "case_1", [message("疼多久了？", "assistant")]);

    const stored = listCaseMessages(platform, "case_1");
    expect(stored.map((entry) => entry.content)).toEqual(["膝盖下楼梯疼", "疼多久了？"]);
    expect(stored[1].role).toBe("assistant");
  });

  it("keeps assistant options and recommended actions so the UI can restore them", () => {
    const platform = createPlatformDemo();
    appendCaseMessages(platform, "case_1", [
      {
        role: "assistant",
        content: "试试腘绳肌拉伸",
        createdAt: new Date().toISOString(),
        options: [{ id: "opt_1", label: "有缓解", value: "有明显缓解" }],
        recommendedActions: [
          {
            title: "坐姿腘绳肌拉伸",
            bodyRegion: "knee",
            phase: "活动度与拉伸",
            defaultDosage: "3 组 x 30 秒",
            instructions: ["坐在椅子边缘"],
            contraindications: ["疼痛加重立即停止"],
            progressionCriteria: ["牵拉感可耐受"],
            tags: ["膝盖"],
          },
        ],
      },
    ]);

    const [stored] = listCaseMessages(platform, "case_1");
    expect(stored.options?.[0].label).toBe("有缓解");
    expect(stored.recommendedActions?.[0].title).toBe("坐姿腘绳肌拉伸");
  });

  it("truncates from the front once the cap is exceeded", () => {
    const platform = createPlatformDemo();
    const overflow = MAX_CASE_MESSAGES + 5;
    appendCaseMessages(
      platform,
      "case_1",
      Array.from({ length: overflow }, (_unused, index) => message(`m${index}`)),
    );

    const stored = listCaseMessages(platform, "case_1");
    expect(stored).toHaveLength(MAX_CASE_MESSAGES);
    expect(stored[0].content).toBe("m5");
    expect(stored[MAX_CASE_MESSAGES - 1].content).toBe(`m${overflow - 1}`);
  });

  it("isolates messages per case", () => {
    const platform = createPlatformDemo();
    appendCaseMessages(platform, "case_1", [message("左膝")]);
    appendCaseMessages(platform, "case_2", [message("右膝")]);

    expect(listCaseMessages(platform, "case_1").map((entry) => entry.content)).toEqual(["左膝"]);
    expect(listCaseMessages(platform, "case_2").map((entry) => entry.content)).toEqual(["右膝"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/api -- case-messages`
Expected: FAIL — `appendCaseMessages is not exported` / 找不到模块。

- [ ] **Step 3: 加类型**

在 `apps/api/src/types.ts` 的 `PlatformDemo` 接口里（`types.ts:34-50`）加一行：

```ts
  caseMessages: Record<string, StoredCaseMessage[]>;
```

在同文件 `ChatMessage`（`types.ts:244`）附近新增：

```ts
export interface StoredCaseMessage {
  role: ChatRole;
  content: string;
  question?: string;
  assessmentStep?: string;
  options?: ChatOption[];
  recommendedActions?: ChatRecommendedAction[];
  createdAt: string;
}
```

- [ ] **Step 4: 实现 case-messages.ts**

创建 `apps/api/src/case-messages.ts`：

```ts
import type { PlatformDemo, StoredCaseMessage } from "./types.js";

export const MAX_CASE_MESSAGES = 200;

export function listCaseMessages(platform: PlatformDemo, caseId: string): StoredCaseMessage[] {
  return platform.caseMessages[caseId] ?? [];
}

export function appendCaseMessages(
  platform: PlatformDemo,
  caseId: string,
  messages: StoredCaseMessage[],
): StoredCaseMessage[] {
  const existing = platform.caseMessages[caseId] ?? [];
  const next = [...existing, ...messages];
  platform.caseMessages[caseId] = next.slice(-MAX_CASE_MESSAGES);
  return platform.caseMessages[caseId];
}
```

- [ ] **Step 5: 接进 platform / storage / index**

`apps/api/src/platform.ts` — 在 `createPlatformDemo` 返回的对象里（`platform.ts:133` 附近，紧挨 `actionLibrary`）加：

```ts
    caseMessages: {},
```

`apps/api/src/storage.ts` — `PERSISTABLE_KEYS`（`storage.ts:7-22`）里 `"userMemories",` 后面加一行：

```ts
  "caseMessages",
```

同文件 `hydrateFromDisk`，在 `platform.userMemories = ...`（`storage.ts:84`）下面加一行（按 caseId 合并，磁盘优先）：

```ts
  platform.caseMessages = { ...platform.caseMessages, ...(persisted.caseMessages ?? {}) };
```

`apps/api/src/index.ts` — 在 `export * from "./memory.js";` 后面加：

```ts
export * from "./case-messages.js";
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -w @mentis/api -- case-messages`
Expected: PASS，5 个用例全绿。

- [ ] **Step 7: 跑全量 api 测试确认没打破别的**

Run: `npm test -w @mentis/api`
Expected: PASS（`orchestrator.test.ts` 也要全绿）。

- [ ] **Step 8: 提交**

```bash
git add apps/api/src/types.ts apps/api/src/platform.ts apps/api/src/storage.ts \
        apps/api/src/case-messages.ts apps/api/src/index.ts apps/api/test/case-messages.test.ts
git commit -m "feat(api): persist chat messages per case"
```

---

### Task 2: 聊天消息的读写路由

**Files:**
- Modify: `apps/api/src/server.ts`（在 `deleteCaseMemoryMatch` 分支后、`trainingPlanMemoryMatch` 分支前插入，即 `server.ts:348` 附近）

**Interfaces:**
- Consumes: `listCaseMessages`、`appendCaseMessages`、`StoredCaseMessage`（Task 1）；`requireMemoryAccess`（`server.ts` 内已有）；`badRequest`（`helpers.ts`）
- Produces:
  - `GET /v1/users/:userId/cases/:caseId/messages` → `StoredCaseMessage[]`
  - `POST /v1/users/:userId/cases/:caseId/messages`，body `{ messages: StoredCaseMessage[] }` → `StoredCaseMessage[]`（追加后的全量，已截断）

- [ ] **Step 1: 加路由**

在 `apps/api/src/server.ts` 顶部的 import 块（`server.ts:7-46` 那个从 `./index.js` 的大 import）里补上：

```ts
  appendCaseMessages,
  listCaseMessages,
  type StoredCaseMessage,
```

在 `server.ts:348`（`deleteCaseMemoryMatch` 分支的结束大括号之后、`trainingPlanMemoryMatch` 之前）插入：

```ts
    const caseMessagesMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/cases\/([^/]+)\/messages$/);
    if (caseMessagesMatch) {
      const userId = decodeURIComponent(caseMessagesMatch[1]);
      const caseId = decodeURIComponent(caseMessagesMatch[2]);
      requireMemoryAccess(actor, userId);

      if (method === "GET") {
        finish(response, method, listCaseMessages(platform, caseId));
        return;
      }

      if (method === "POST") {
        const body = await readJson(request);
        if (!Array.isArray(body.messages)) {
          throw badRequest("messages must be an array");
        }
        const incoming = (body.messages as StoredCaseMessage[]).map((entry) => ({
          ...entry,
          createdAt: entry.createdAt || new Date().toISOString(),
        }));
        finish(response, method, appendCaseMessages(platform, caseId, incoming));
        return;
      }
    }
```

`badRequest` 如果还没在 import 块里，一并补上。

- [ ] **Step 2: 起后端，手工验证鉴权和读写**

一个终端：

```bash
npm run build -w @mentis/domain && npm run dev:api
```

另一个终端（先拿 token，用户名密码见 `.env.local` / `MENTIS_DEMO_*`，本地默认 dev 凭据）：

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
echo "$TOKEN"
```

未认证必须 401：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/v1/users/user_1/cases/case_1/messages
```
Expected: `401`

写入再读回：

```bash
curl -s -X POST http://127.0.0.1:3001/v1/users/user_1/cases/case_1/messages \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"膝盖下楼梯疼","createdAt":"2026-07-12T02:00:00.000Z"}]}'

curl -s http://127.0.0.1:3001/v1/users/user_1/cases/case_1/messages \
  -H "Authorization: Bearer $TOKEN"
```
Expected: 第二条命令返回含 `"content":"膝盖下楼梯疼"` 的数组。

重启后端再读一次，确认落盘生效：

```bash
# Ctrl-C 停掉 dev:api，重新 npm run dev:api，然后
curl -s http://127.0.0.1:3001/v1/users/user_1/cases/case_1/messages -H "Authorization: Bearer $TOKEN"
```
Expected: 消息还在（证明进了 `data/platform-state.json`）。

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): add case message read/write routes"
```

---

### Task 3: 前端懒加载聊天记录

**Files:**
- Modify: `apps/web/src/types.ts`（`PatientCase` 加 `messagesLoaded?: boolean`）
- Modify: `apps/web/src/caseUtils.ts:8-17`（`hydrateCasesFromMemory` 不再吞掉 messages）
- Modify: `apps/web/src/App.tsx`（新增 `loadCaseMessages`、`persistCaseMessages`；`selectCase` 触发加载；发消息/收回复后持久化）

**Interfaces:**
- Consumes: Task 2 的两条路由；`API_BASE`（`apiBase.ts`）；`session`（`authSession.ts`）
- Produces: `PatientCase.messagesLoaded`，供 `selectCase` 判断是否需要拉取

- [ ] **Step 1: 加 messagesLoaded 字段**

`apps/web/src/types.ts` 的 `PatientCase`（`types.ts:144-152`）加一行：

```ts
  messagesLoaded?: boolean;
```

- [ ] **Step 2: 改 hydrateCasesFromMemory 的失败模式**

`apps/web/src/caseUtils.ts:8-17` 整体替换为：

```ts
export function hydrateCasesFromMemory(memory: UserMemory, existingCases: PatientCase[] = []): PatientCase[] {
  return memory.cases.map((memoryCase) => {
    const existingCase = existingCases.find((patientCase) => patientCase.id === memoryCase.id);
    return {
      ...memoryCase,
      messages: existingCase?.messages ?? [],
      messagesLoaded: existingCase?.messagesLoaded ?? false,
      plan: existingCase?.plan ?? planForCase(memory, memoryCase.id),
    };
  });
}
```

关键区别：`messages: []` 现在只是「还没加载」的初始态，配 `messagesLoaded: false` 让调用方知道要去拉。之前它是「就是没有」的终态，这是 bug 的根。

- [ ] **Step 3: 在 App.tsx 里加拉取和持久化**

在 `apps/web/src/App.tsx` 的 `rememberCaseForCurrentUser`（`App.tsx:697`）旁边新增两个函数：

```ts
  async function loadCaseMessages(caseId: string) {
    if (!session) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/cases/${encodeURIComponent(caseId)}/messages`,
        { headers: { Authorization: `Bearer ${session.token}` } },
      );
      if (!response.ok) {
        return;
      }
      const messages = (await response.json()) as ChatMessage[];
      setCases((currentCases) =>
        currentCases.map((patientCase) =>
          patientCase.id === caseId ? { ...patientCase, messages, messagesLoaded: true } : patientCase,
        ),
      );
    } catch {
      // 拉取失败就保持未加载状态，下次进入病例会重试
    }
  }

  async function persistCaseMessages(caseId: string, messages: ChatMessage[]) {
    if (!session || messages.length === 0) {
      return;
    }
    try {
      await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/cases/${encodeURIComponent(caseId)}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        },
      );
    } catch {
      // 持久化失败不阻断对话
    }
  }
```

- [ ] **Step 4: selectCase 时触发加载**

`App.tsx:185-190` 的 `selectCase` 改为：

```ts
  function selectCase(patientCase: PatientCase) {
    setActiveCaseId(patientCase.id);
    setActivePage("home");
    setInput("");
    if (!patientCase.messagesLoaded) {
      void loadCaseMessages(patientCase.id);
    }
    syncViewportAfterChatChange();
  }
```

- [ ] **Step 5: 发消息与收回复后各持久化一条**

`App.tsx:310` 那段：`const nextMessages: ChatMessage[] = [...sendingCase.messages, { role: "user", content }];` 之后，紧跟着已有的 `updateCaseMessages(...)` 调用，追加一行：

```ts
    void persistCaseMessages(sendingCase.id, [{ role: "user", content }]);
```

`App.tsx:363` 的 `updateCaseMessages(sendingCase.id, [...nextMessages, assistantMessage]);` 之后追加一行：

```ts
      void persistCaseMessages(sendingCase.id, [assistantMessage]);
```

只发增量（一条），不发全量——后端是 append 语义，发全量会重复。

- [ ] **Step 6: 首次进入时加载当前病例**

在 `App.tsx` 里找到设置 `activeCaseId` 的初始化逻辑（登录后 `hydrateCasesFromMemory` 之后）。加一个 effect：

```ts
  useEffect(() => {
    const current = cases.find((patientCase) => patientCase.id === activeCaseId);
    if (current && !current.messagesLoaded) {
      void loadCaseMessages(current.id);
    }
  }, [activeCaseId, cases]);
```

- [ ] **Step 7: 端到端验证（这是这个任务的核心验收）**

```bash
npm run dev:api    # 终端 1
npm run dev:web    # 终端 2
```

浏览器开 `http://127.0.0.1:5173`：
1. 登录，开一个膝盖病例，发 2-3 条消息，等 AI 回复（回复里最好带选项按钮和动作卡）。
2. **刷新页面**。
3. 从左侧「病例记录」点回那个病例。

Expected: 之前的对话全部回来，包括 AI 回复下方的选项按钮和动作卡片。这正是截图里丢失的东西。

- [ ] **Step 8: 跑 web 测试**

Run: `npm test -w @mentis/web`
Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/types.ts apps/web/src/caseUtils.ts apps/web/src/App.tsx
git commit -m "feat(web): restore chat history after refresh"
```

---

## 阶段 B：推荐一致性 + 多动作推荐

### Task 4: 扩展动作与推荐的类型

**Files:**
- Modify: `packages/domain/src/index.ts:191-202`（`ActionLibraryItem`）
- Modify: `apps/api/src/types.ts:275-286`（`ChatRecommendedAction`）

**Interfaces:**
- Produces:
  - `type RehabActionType = "stretch" | "strength" | "activation" | "mobility" | "balance"`（domain 导出）
  - `ActionLibraryItem` 新增可选字段：`bodyRegions?`、`actionType?`、`targetMuscles?`、`source?`、`videoUrl?`
  - `ChatRecommendedAction` 新增可选字段：`actionType?`、`targetMuscles?`

全部 optional。`platform-state.json` 里有存量旧动作，必填字段会让反序列化后的数据非法。

- [ ] **Step 1: 改 domain**

`packages/domain/src/index.ts:191` 的 `ActionLibraryItem` 前面加类型，接口内加字段：

```ts
export type RehabActionType = "stretch" | "strength" | "activation" | "mobility" | "balance";

export interface ActionLibraryItem {
  id: string;
  title: string;
  bodyRegion: Assessment["bodyRegion"];
  /** 多归属。腘绳肌拉伸同时属于 knee 和 hip——单归属正是动作推荐错配的根源。 */
  bodyRegions?: Assessment["bodyRegion"][];
  actionType?: RehabActionType;
  targetMuscles?: string[];
  /** seed = 人工审过；ai = 模型现场生成，未审、未录视频。 */
  source?: "seed" | "ai";
  videoUrl?: string;
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  mediaUrl?: string;
  tags: string[];
}
```

- [ ] **Step 2: 改 api 的 ChatRecommendedAction**

`apps/api/src/types.ts:275-286` 改为：

```ts
export interface ChatRecommendedAction {
  actionId?: string;
  title: string;
  bodyRegion: ActionLibraryItem["bodyRegion"];
  actionType?: RehabActionType;
  targetMuscles?: string[];
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  tags: string[];
  reason?: string;
}
```

确保 `RehabActionType` 从 `@mentis/domain` import 进来并被 `types.ts` re-export（`types.ts` 顶部已有从 domain 的 import，跟着加）。

- [ ] **Step 3: 重新 build domain 并跑全量测试**

Run: `npm run build -w @mentis/domain && npm test`
Expected: PASS。新字段全是 optional，不应该打破任何现有测试。

- [ ] **Step 4: 提交**

```bash
git add packages/domain/src/index.ts apps/api/src/types.ts
git commit -m "feat(domain): add action type, target muscles, multi-region to action library"
```

---

### Task 5: 抽出打分工具 + 动作召回

**Files:**
- Create: `apps/api/src/text-scoring.ts`
- Modify: `apps/api/src/rag.ts:118-158`（删掉私有打分函数，改为 import）
- Create: `apps/api/src/action-retrieval.ts`
- Modify: `apps/api/src/index.ts`（re-export `action-retrieval.js`）
- Test: `apps/api/test/action-retrieval.test.ts`

**Interfaces:**
- Consumes: `ActionLibraryItem`、`ChatMessage`、`RehabConsultCategory`
- Produces（`text-scoring.ts`）：
  - `tokenizeText(text: string): string[]`
  - `termCounts(tokens: string[]): Map<string, number>`
  - `tfidfVector(terms: Map<string, number>, docFreq: Map<string, number>, docCount: number): Map<string, number>`
  - `vectorNorm(vector: Map<string, number>): number`
  - `dotProduct(left: Map<string, number>, right: Map<string, number>): number`
- Produces（`action-retrieval.ts`）：
  - `actionBodyRegionForCategory(category?: RehabConsultCategory): ActionLibraryItem["bodyRegion"]`（从 `chat.ts` / `consultations.ts` 的两份重复实现统一到这里）
  - `actionMatchesRegion(action: ActionLibraryItem, region: ActionLibraryItem["bodyRegion"]): boolean`
  - `rankActionsForChat(actions: ActionLibraryItem[], messages: ChatMessage[], category?: RehabConsultCategory, topK?: number): ActionLibraryItem[]`

- [ ] **Step 1: 写失败的测试**

创建 `apps/api/test/action-retrieval.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { actionMatchesRegion, rankActionsForChat } from "../src/index";
import type { ActionLibraryItem, ChatMessage } from "../src/index";

const hamstringStretch: ActionLibraryItem = {
  id: "action_hamstring_stretch",
  title: "坐姿腘绳肌拉伸",
  bodyRegion: "knee",
  bodyRegions: ["knee", "hip"],
  actionType: "stretch",
  targetMuscles: ["腘绳肌"],
  source: "seed",
  phase: "活动度与拉伸",
  defaultDosage: "3 组 x 30 秒",
  instructions: ["坐在椅子边缘，患侧腿向前伸直"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["牵拉感可耐受"],
  tags: ["膝盖", "拉伸"],
};

const quadStretch: ActionLibraryItem = {
  id: "action_quad_stretch",
  title: "俯卧股四头肌拉伸",
  bodyRegion: "knee",
  bodyRegions: ["knee"],
  actionType: "stretch",
  targetMuscles: ["股四头肌"],
  source: "seed",
  phase: "活动度与拉伸",
  defaultDosage: "3 组 x 30 秒",
  instructions: ["俯卧，屈膝把脚跟拉向臀部"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["牵拉感可耐受"],
  tags: ["膝盖", "拉伸"],
};

const shoulderPress: ActionLibraryItem = {
  id: "action_shoulder_press",
  title: "肩上推举",
  bodyRegion: "shoulder",
  bodyRegions: ["shoulder"],
  actionType: "strength",
  targetMuscles: ["三角肌"],
  source: "seed",
  phase: "力量",
  defaultDosage: "3 组 x 10 次",
  instructions: ["坐姿推举"],
  contraindications: ["肩峰撞击痛"],
  progressionCriteria: ["无痛完成"],
  tags: ["肩膀"],
};

describe("action retrieval", () => {
  it("treats an action as in-region when any of its bodyRegions matches", () => {
    expect(actionMatchesRegion(hamstringStretch, "knee")).toBe(true);
    expect(actionMatchesRegion(hamstringStretch, "hip")).toBe(true);
    expect(actionMatchesRegion(hamstringStretch, "shoulder")).toBe(false);
  });

  it("falls back to the single bodyRegion field for legacy actions without bodyRegions", () => {
    const legacy: ActionLibraryItem = { ...quadStretch, bodyRegions: undefined };
    expect(actionMatchesRegion(legacy, "knee")).toBe(true);
    expect(actionMatchesRegion(legacy, "hip")).toBe(false);
  });

  it("excludes actions from other body regions", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "膝盖后方紧绷" }];
    const ranked = rankActionsForChat([hamstringStretch, quadStretch, shoulderPress], messages, "knee");
    expect(ranked.map((action) => action.id)).not.toContain("action_shoulder_press");
  });

  it("ranks the action matching the complaint above an unrelated one in the same region", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "膝盖后方腘绳肌很紧，想拉伸大腿后侧" }];
    const ranked = rankActionsForChat([quadStretch, hamstringStretch], messages, "knee");
    expect(ranked[0].id).toBe("action_hamstring_stretch");
  });

  it("returns in-region actions unranked when there is no user message to score against", () => {
    const ranked = rankActionsForChat([hamstringStretch, quadStretch, shoulderPress], [], "knee", 10);
    expect(ranked.map((action) => action.id)).toEqual(["action_hamstring_stretch", "action_quad_stretch"]);
  });

  it("honours topK", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "膝盖疼" }];
    const ranked = rankActionsForChat([hamstringStretch, quadStretch], messages, "knee", 1);
    expect(ranked).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/api -- action-retrieval`
Expected: FAIL — 找不到 `rankActionsForChat`。

- [ ] **Step 3: 抽出 text-scoring.ts**

创建 `apps/api/src/text-scoring.ts`，把 `rag.ts:118-158` 的五个私有函数原样搬过来并导出（`tokenizeForLocalRag` 更名为 `tokenizeText`，因为现在不只 RAG 用）：

```ts
export function tokenizeText(text: string): string[] {
  const rawTokens = text.toLowerCase().match(/[a-zA-Z0-9_]+|[一-鿿]/gu) ?? [];
  const cjkChars = rawTokens.filter((token) => token.length === 1 && token >= "一" && token <= "鿿");
  const cjkBigrams = cjkChars.slice(0, -1).map((token, index) => `${token}${cjkChars[index + 1]}`);
  return [...rawTokens, ...cjkBigrams];
}

export function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function tfidfVector(
  terms: Map<string, number>,
  docFreq: Map<string, number>,
  docCount: number,
): Map<string, number> {
  const total = Array.from(terms.values()).reduce((sum, value) => sum + value, 0);
  const vector = new Map<string, number>();
  if (total === 0) {
    return vector;
  }
  for (const [term, count] of terms.entries()) {
    const tf = count / total;
    const idf = Math.log((docCount + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;
    vector.set(term, tf * idf);
  }
  return vector;
}

export function vectorNorm(vector: Map<string, number>): number {
  return Math.sqrt(Array.from(vector.values()).reduce((sum, value) => sum + value * value, 0));
}

export function dotProduct(left: Map<string, number>, right: Map<string, number>): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let total = 0;
  for (const [term, value] of small.entries()) {
    total += value * (large.get(term) ?? 0);
  }
  return total;
}
```

然后从 `apps/api/src/rag.ts` 删除这五个函数（`rag.ts:118-158`），在文件顶部加：

```ts
import { dotProduct, termCounts, tfidfVector, tokenizeText, vectorNorm } from "./text-scoring.js";
```

并把 `rag.ts` 里两处 `tokenizeForLocalRag(...)` 调用改成 `tokenizeText(...)`（`rag.ts:63` 和 `rag.ts:98`）。

- [ ] **Step 4: 实现 action-retrieval.ts**

创建 `apps/api/src/action-retrieval.ts`：

```ts
import { dotProduct, termCounts, tfidfVector, tokenizeText, vectorNorm } from "./text-scoring.js";
import type { ActionLibraryItem, ChatMessage, RehabConsultCategory } from "./types.js";

export function actionBodyRegionForCategory(category?: RehabConsultCategory): ActionLibraryItem["bodyRegion"] {
  switch (category) {
    case "knee":
      return "knee";
    case "ankle":
      return "ankle_foot";
    case "shoulder":
      return "shoulder";
    case "lower_back":
      return "spine";
    case "hip":
      return "hip";
    default:
      return "other";
  }
}

export function actionMatchesRegion(
  action: ActionLibraryItem,
  region: ActionLibraryItem["bodyRegion"],
): boolean {
  if (region === "other") {
    return true;
  }
  const regions = action.bodyRegions?.length ? action.bodyRegions : [action.bodyRegion];
  return regions.includes(region);
}

function searchableActionText(action: ActionLibraryItem): string {
  return [
    action.title,
    action.actionType ?? "",
    ...(action.targetMuscles ?? []),
    action.phase,
    ...action.tags,
  ].join(" ");
}

export function rankActionsForChat(
  actions: ActionLibraryItem[],
  messages: ChatMessage[],
  category?: RehabConsultCategory,
  topK = 15,
): ActionLibraryItem[] {
  const region = actionBodyRegionForCategory(category);
  const candidates = actions.filter((action) => actionMatchesRegion(action, region));
  if (candidates.length === 0 || topK <= 0) {
    return [];
  }

  const query = [...messages]
    .reverse()
    .filter((message) => message.role === "user")
    .slice(0, 2)
    .map((message) => message.content)
    .join(" ")
    .trim();
  if (!query) {
    return candidates.slice(0, topK);
  }

  const docFreq = new Map<string, number>();
  const docTerms = candidates.map((action) => {
    const terms = termCounts(tokenizeText(searchableActionText(action)));
    for (const term of terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
    return terms;
  });
  const docVectors = docTerms.map((terms) => tfidfVector(terms, docFreq, candidates.length));
  const docNorms = docVectors.map((vector) => vectorNorm(vector));

  const queryVector = tfidfVector(termCounts(tokenizeText(query)), docFreq, candidates.length);
  const queryNorm = vectorNorm(queryVector);
  if (queryNorm === 0) {
    return candidates.slice(0, topK);
  }

  return candidates
    .map((action, index) => {
      const norm = docNorms[index];
      const score = norm === 0 ? 0 : dotProduct(queryVector, docVectors[index]) / (queryNorm * norm);
      return { action, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, topK)
    .map((entry) => entry.action);
}
```

注意 sort 的 tiebreak 用原始下标，保证打分全 0 时顺序稳定、可测。

- [ ] **Step 5: re-export**

`apps/api/src/index.ts` 加两行：

```ts
export * from "./text-scoring.js";
export * from "./action-retrieval.js";
```

- [ ] **Step 6: 跑测试**

Run: `npm test -w @mentis/api -- action-retrieval`
Expected: PASS，6 个用例全绿。

Run: `npm test -w @mentis/api`
Expected: PASS（`rag.ts` 重构后 `orchestrator.test.ts` 里的 `searchLocalRag` / `buildChatRagContext` 用例必须还是绿的）。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/text-scoring.ts apps/api/src/action-retrieval.ts apps/api/src/rag.ts \
        apps/api/src/index.ts apps/api/test/action-retrieval.test.ts
git commit -m "feat(api): rank action library candidates by conversation relevance"
```

---

### Task 6: 重写动作库的 prompt 注入

**Files:**
- Modify: `apps/api/src/chat.ts:131-170`（`buildChatSystemPrompt`）、`chat.ts:157-161`（输出格式说明）、`chat.ts:300-339`（`normalizeRecommendedActions`）、`chat.ts:373-405`（删掉 `formatActionLibraryContext` 里的 slice、删掉重复的 `actionBodyRegionForCategory`）
- Modify: `apps/api/src/types.ts`（`ChatContext` 加 `messages` 不需要——见下）
- Test: `apps/api/test/orchestrator.test.ts`（补 prompt 断言）

**Interfaces:**
- Consumes: `rankActionsForChat`、`actionBodyRegionForCategory`（Task 5）；`RehabActionType`（Task 4）
- Produces: `buildChatSystemPrompt(context: ChatContext, messages?: ChatMessage[]): string`（**签名变了**，多一个可选的 messages 参数，用来做候选召回）

- [ ] **Step 1: 写失败的测试**

在 `apps/api/test/orchestrator.test.ts` 末尾追加一个 describe：

```ts
describe("chat action library prompt", () => {
  const library: ActionLibraryItem[] = [
    {
      id: "action_hamstring_stretch",
      title: "坐姿腘绳肌拉伸",
      bodyRegion: "knee",
      bodyRegions: ["knee", "hip"],
      actionType: "stretch",
      targetMuscles: ["腘绳肌"],
      source: "seed",
      phase: "活动度与拉伸",
      defaultDosage: "3 组 x 30 秒",
      instructions: ["坐在椅子边缘"],
      contraindications: ["疼痛加重立即停止"],
      progressionCriteria: ["牵拉感可耐受"],
      tags: ["膝盖"],
    },
  ];

  it("injects action type and target muscles so the model knows what each action stretches", () => {
    const prompt = buildChatSystemPrompt(
      { category: "knee", actionLibrary: library },
      [{ role: "user", content: "膝盖后方紧" }],
    );
    expect(prompt).toContain("action_hamstring_stretch");
    expect(prompt).toContain("腘绳肌");
    expect(prompt).toContain("stretch");
  });

  it("tells the model to invent a new action rather than force-fit a mismatched actionId", () => {
    const prompt = buildChatSystemPrompt({ category: "knee", actionLibrary: library }, []);
    expect(prompt).toContain("直接生成新动作");
    expect(prompt).not.toContain("优先使用可用动作库里的 actionId");
  });

  it("lets the model choose how many actions to recommend", () => {
    const prompt = buildChatSystemPrompt({ category: "knee", actionLibrary: library }, []);
    expect(prompt).toContain("1-5 个");
  });

  it("parses actionType and targetMuscles out of the model response", () => {
    const result = buildGuidedChatResponse(
      [{ role: "user", content: "膝盖后方紧" }],
      { category: "knee" },
      JSON.stringify({
        content: "试试拉伸大腿后侧。",
        recommendedActions: [
          {
            title: "坐姿腘绳肌拉伸",
            bodyRegion: "knee",
            actionType: "stretch",
            targetMuscles: ["腘绳肌"],
            phase: "活动度与拉伸",
            defaultDosage: "3 组 x 30 秒",
            instructions: ["坐在椅子边缘"],
            contraindications: ["疼痛加重立即停止"],
            progressionCriteria: ["牵拉感可耐受"],
            tags: ["膝盖"],
          },
        ],
      }),
    );
    expect(result.recommendedActions?.[0].actionType).toBe("stretch");
    expect(result.recommendedActions?.[0].targetMuscles).toEqual(["腘绳肌"]);
  });

  it("keeps up to five recommended actions", () => {
    const actions = Array.from({ length: 6 }, (_unused, index) => ({
      title: `动作${index}`,
      bodyRegion: "knee",
      actionType: "strength",
      targetMuscles: ["股四头肌"],
      phase: "力量",
      defaultDosage: "3 组 x 10 次",
      instructions: ["步骤"],
      contraindications: ["疼痛加重立即停止"],
      progressionCriteria: ["无痛完成"],
      tags: ["膝盖"],
    }));
    const result = buildGuidedChatResponse([], {}, JSON.stringify({ content: "计划", recommendedActions: actions }));
    expect(result.recommendedActions).toHaveLength(5);
  });
});
```

在该测试文件顶部的 import 里补上 `type ActionLibraryItem`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/api -- orchestrator`
Expected: FAIL — prompt 里没有「腘绳肌」/「直接生成新动作」，`actionType` 解析不出来，第 6 个动作被 slice 到 4。

- [ ] **Step 3: 改 buildChatSystemPrompt 签名与动作库段落**

`apps/api/src/chat.ts`，先在顶部 import 里加：

```ts
import { actionBodyRegionForCategory, rankActionsForChat } from "./action-retrieval.js";
```

删掉 `chat.ts:390-405` 那份重复的私有 `actionBodyRegionForCategory`（现在从 `action-retrieval.ts` 来）。

`buildChatSystemPrompt`（`chat.ts:131`）签名改为：

```ts
export function buildChatSystemPrompt(context: ChatContext = {}, messages: ChatMessage[] = []): string {
```

把它内部对 `formatActionLibraryContext(context.actionLibrary ?? [], context.category)` 的调用（`chat.ts:163`）改为：

```ts
    formatActionLibraryContext(context.actionLibrary ?? [], messages, context.category),
```

`chat.ts:43` 的 `chat()` 里，调用处（`chat.ts:79`）改为：

```ts
              content: buildChatSystemPrompt(effectiveContext, messages),
```

- [ ] **Step 4: 重写 formatActionLibraryContext**

`chat.ts:373-388` 整体替换：

```ts
function formatActionLibraryContext(
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
```

- [ ] **Step 5: 反转 prompt 措辞、放开动作数量**

`chat.ts:155-162` 的输出格式段落整体替换为：

```ts
    [
      "输出格式：只返回一个 JSON 对象，不要包裹代码块。",
      'JSON 字段：{"content":"给用户看的回答","question":"下一步只问一个问题，可省略","options":[{"label":"按钮文案","value":"点击后发送给模型的完整回答"}],"recommendedActions":[{"actionId":"库里动作 id，可省略","title":"动作名","bodyRegion":"knee","actionType":"stretch|strength|activation|mobility|balance","targetMuscles":["腘绳肌"],"phase":"阶段","defaultDosage":"剂量","instructions":["步骤"],"contraindications":["停止条件"],"progressionCriteria":["进阶标准"],"tags":["标签"],"reason":"为什么推荐"}]}',
      "如果不需要按钮，省略 question 和 options。",
      "如果推荐训练动作，必须放在 recommendedActions，不要只把动作写进 content 散文里。",
      "recommendedActions 里的动作必须和你在 content 里描述的动作完全一致。content 说拉伸大腿后侧，就不能推荐拉伸大腿前侧的动作。",
      "actionType 和 targetMuscles 必填，它们要如实描述你推荐的这个动作。",
      "关于 actionId：只有当动作库里某个动作【就是】你要推荐的那个动作时，才填它的 actionId。哪怕只是部位相近、名字相似，也不要填——直接生成新动作，把字段填完整即可。填错 actionId 比不填更糟。",
      "一次推荐 1-5 个动作，具体几个由你根据用户情况判断，不用凑数也不用只给一个。",
      "content 必须能单独成立；question 和 options 只是结构化交互辅助。",
    ].join("\n"),
```

- [ ] **Step 6: 解析新字段、放开上限到 5**

`chat.ts:300-339` 的 `normalizeRecommendedActions`：在构造 `recommendedAction` 时（`chat.ts:319-328`）加两个字段，并把末尾的 `.slice(0, 4)` 改成 `.slice(0, 5)`：

```ts
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
```

在 `normalizeActionBodyRegion`（`chat.ts:354`）旁边新增：

```ts
function normalizeActionType(value: string): RehabActionType | undefined {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "stretch" ||
    normalized === "strength" ||
    normalized === "activation" ||
    normalized === "mobility" ||
    normalized === "balance"
  ) {
    return normalized;
  }
  return undefined;
}
```

`RehabActionType` 从 `./types.js` import。

- [ ] **Step 7: 跑测试**

Run: `npm test -w @mentis/api -- orchestrator`
Expected: PASS，新加的 5 个用例全绿，原有用例不回归。

- [ ] **Step 8: 提交**

```bash
git add apps/api/src/chat.ts apps/api/test/orchestrator.test.ts
git commit -m "feat(api): ground action recommendations in retrieved candidates"
```

---

### Task 7: 服务端一致性校验（核心修复）

**Files:**
- Modify: `apps/api/src/consultations.ts:417-476`（`resolveRecommendedActions`，删掉本地重复的 `actionBodyRegionForCategory`）
- Test: `apps/api/test/recommended-actions.test.ts`

**Interfaces:**
- Consumes: `actionBodyRegionForCategory`（`action-retrieval.ts`，Task 5）；`ActionLibraryItem`、`ChatRecommendedAction`（Task 4）
- Produces: `resolveRecommendedActions` 行为变更（签名不变）；新增导出 `isLibraryActionMatch(action: ChatRecommendedAction, item: ActionLibraryItem): boolean`

**行为规则（这是整个计划的核心）：**
1. 模型给了 `actionId` 且库里命中 → 调 `isLibraryActionMatch` 校验。
2. 校验通过 → 用库里那条（instructions/剂量是审过的），但保留模型写的 `reason`。
3. 校验不通过（含「库里那条没标 actionType/targetMuscles，无法校验」）→ **丢弃 actionId**，用模型自己描述的动作新建一条入库，`source: "ai"`。
4. 无 actionId → 按标题在同部位精确匹配；匹配不到就新建入库。

规则 3 里的「无法校验即丢弃」是有意的降级：Task 7 上线时库里还是旧动作（没有新字段），所以膝盖推荐几乎全走生成分支。这正是想要的——宁可用模型自己写的正确动作，也不要库里那条错的。Task 12/13 的种子库到位后，校验开始真正生效，复用率自然回升。

- [ ] **Step 1: 写失败的测试**

创建 `apps/api/test/recommended-actions.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { createPlatformDemo, isLibraryActionMatch, resolveRecommendedActions } from "../src/index";
import type { ActionLibraryItem, ChatRecommendedAction, PlatformDemo } from "../src/index";

const quadStretchItem: ActionLibraryItem = {
  id: "action_quad_stretch",
  title: "俯卧股四头肌拉伸",
  bodyRegion: "knee",
  bodyRegions: ["knee"],
  actionType: "stretch",
  targetMuscles: ["股四头肌"],
  source: "seed",
  phase: "活动度与拉伸",
  defaultDosage: "3 组 x 30 秒",
  instructions: ["俯卧，屈膝把脚跟拉向臀部"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["牵拉感可耐受"],
  tags: ["膝盖"],
};

const legacyItem: ActionLibraryItem = {
  id: "exercise_BWnJR72",
  title: "lying (side) quads stretch",
  bodyRegion: "knee",
  phase: "下肢力量与控制",
  defaultDosage: "2-3 组 x 8-12 次",
  instructions: ["Lie on your side"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["动作质量稳定"],
  tags: ["exercise-library"],
};

function hamstringRecommendation(actionId?: string): ChatRecommendedAction {
  return {
    actionId,
    title: "坐姿腘绳肌拉伸",
    bodyRegion: "knee",
    actionType: "stretch",
    targetMuscles: ["腘绳肌"],
    phase: "活动度与拉伸",
    defaultDosage: "3 组 x 30 秒",
    instructions: ["坐在椅子边缘，患侧腿向前伸直"],
    contraindications: ["训练中疼痛明显加重"],
    progressionCriteria: ["牵拉感可耐受"],
    tags: ["膝盖"],
    reason: "缓解膝盖后方紧绷",
  };
}

function platformWith(items: ActionLibraryItem[]): PlatformDemo {
  const platform = createPlatformDemo();
  platform.actionLibrary = items;
  return platform;
}

describe("recommended action consistency", () => {
  it("rejects an actionId whose target muscles contradict the recommendation", () => {
    expect(isLibraryActionMatch(hamstringRecommendation(), quadStretchItem)).toBe(false);
  });

  it("rejects an actionId when the library entry has no labels to verify against", () => {
    expect(isLibraryActionMatch(hamstringRecommendation(), legacyItem)).toBe(false);
  });

  it("accepts an actionId when type and muscles agree", () => {
    const item: ActionLibraryItem = { ...quadStretchItem, id: "action_hs", title: "坐姿腘绳肌拉伸", targetMuscles: ["腘绳肌"] };
    expect(isLibraryActionMatch(hamstringRecommendation(), item)).toBe(true);
  });

  it("does NOT silently swap in the mismatched library action (the reported bug)", () => {
    const platform = platformWith([quadStretchItem]);
    const [resolved] = resolveRecommendedActions(platform, [hamstringRecommendation("action_quad_stretch")], "knee");

    expect(resolved.title).toBe("坐姿腘绳肌拉伸");
    expect(resolved.actionId).not.toBe("action_quad_stretch");
    expect(resolved.targetMuscles).toEqual(["腘绳肌"]);
  });

  it("stores the model's action in the library so it accumulates over time", () => {
    const platform = platformWith([quadStretchItem]);
    resolveRecommendedActions(platform, [hamstringRecommendation("action_quad_stretch")], "knee");

    const stored = platform.actionLibrary.find((item) => item.title === "坐姿腘绳肌拉伸");
    expect(stored).toBeDefined();
    expect(stored?.source).toBe("ai");
    expect(stored?.actionType).toBe("stretch");
  });

  it("reuses the library entry when the actionId genuinely matches, keeping the model's reason", () => {
    const item: ActionLibraryItem = { ...quadStretchItem, id: "action_hs", title: "坐姿腘绳肌拉伸", targetMuscles: ["腘绳肌"] };
    const platform = platformWith([item]);
    const [resolved] = resolveRecommendedActions(platform, [hamstringRecommendation("action_hs")], "knee");

    expect(resolved.actionId).toBe("action_hs");
    expect(resolved.instructions).toEqual(["俯卧，屈膝把脚跟拉向臀部"]);
    expect(resolved.reason).toBe("缓解膝盖后方紧绷");
    expect(platform.actionLibrary).toHaveLength(1);
  });

  it("resolves several recommendations in one call", () => {
    const platform = platformWith([]);
    const resolved = resolveRecommendedActions(
      platform,
      [hamstringRecommendation(), { ...hamstringRecommendation(), title: "靠墙静蹲", actionType: "strength", targetMuscles: ["股四头肌"] }],
      "knee",
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.map((action) => action.title)).toEqual(["坐姿腘绳肌拉伸", "靠墙静蹲"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/api -- recommended-actions`
Expected: FAIL — `isLibraryActionMatch` 不存在；且「does NOT silently swap」用例会失败，因为当前代码正是这么干的（这就是截图里的 bug）。

- [ ] **Step 3: 实现校验**

`apps/api/src/consultations.ts`，顶部 import 加：

```ts
import { actionBodyRegionForCategory } from "./action-retrieval.js";
```

删掉本文件里私有的 `actionBodyRegionForCategory`（`consultations.ts:461-476`）。

新增导出函数（放在 `resolveRecommendedActions` 上面）：

```ts
function musclesOverlap(left: string[], right: string[]): boolean {
  return left.some((leftMuscle) => {
    const normalizedLeft = normalizeComparableText(leftMuscle);
    return right.some((rightMuscle) => {
      const normalizedRight = normalizeComparableText(rightMuscle);
      return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
    });
  });
}

/**
 * 模型经常会为了满足「用库里的 actionId」而硬凑一个部位相近但完全不对的动作
 * （正文说拉腘绳肌、actionId 指向股四头肌拉伸）。命中 id 后必须校验，
 * 校验不了（库里那条没打标签）也一律视为不匹配——宁可用模型自己写的动作。
 */
export function isLibraryActionMatch(action: ChatRecommendedAction, item: ActionLibraryItem): boolean {
  if (!item.actionType || !item.targetMuscles?.length) {
    return false;
  }
  if (!action.actionType || !action.targetMuscles?.length) {
    return false;
  }
  if (item.actionType !== action.actionType) {
    return false;
  }
  return musclesOverlap(action.targetMuscles, item.targetMuscles);
}
```

`resolveRecommendedActions`（`consultations.ts:417-459`）整体替换：

```ts
export function resolveRecommendedActions(
  platform: PlatformDemo,
  actions: ChatRecommendedAction[] = [],
  category?: RehabConsultCategory,
): ChatRecommendedAction[] {
  const fallbackBodyRegion = actionBodyRegionForCategory(category);
  return actions.map((action) => {
    const existingById = action.actionId
      ? platform.actionLibrary.find((candidate) => candidate.id === action.actionId)
      : undefined;
    if (existingById && isLibraryActionMatch(action, existingById)) {
      return actionFromLibraryItem(existingById, action.reason);
    }

    const bodyRegion = action.bodyRegion === "other" ? fallbackBodyRegion : action.bodyRegion;
    const existingByTitle = platform.actionLibrary.find(
      (candidate) =>
        candidate.bodyRegion === bodyRegion &&
        normalizeComparableText(candidate.title) === normalizeComparableText(action.title),
    );
    if (existingByTitle) {
      return actionFromLibraryItem(existingByTitle, action.reason);
    }

    const generated: ActionLibraryItem = {
      id: generatedActionId(bodyRegion, action.title, action.defaultDosage),
      title: action.title,
      bodyRegion,
      bodyRegions: [bodyRegion],
      actionType: action.actionType,
      targetMuscles: action.targetMuscles,
      source: "ai",
      phase: action.phase,
      defaultDosage: action.defaultDosage,
      instructions: action.instructions,
      contraindications: action.contraindications,
      progressionCriteria: action.progressionCriteria,
      tags: mergeActionTags(["ai-generated", "rehab", bodyRegion, ...action.tags]),
    };
    const duplicateId = platform.actionLibrary.find((candidate) => candidate.id === generated.id);
    const stored = duplicateId ?? generated;
    if (!duplicateId) {
      platform.actionLibrary = [stored, ...platform.actionLibrary];
    }
    return actionFromLibraryItem(stored, action.reason);
  });
}
```

- [ ] **Step 4: actionFromLibraryItem 要带上新字段**

找到 `actionFromLibraryItem`（`consultations.ts` 内，`resolveRecommendedActions` 下方）。它构造 `ChatRecommendedAction` 时补上：

```ts
    actionType: item.actionType,
    targetMuscles: item.targetMuscles,
```

否则「用库里那条」的返回值会丢掉这两个字段，前端和 Task 6 的测试都看不到。

- [ ] **Step 5: 跑测试**

Run: `npm test -w @mentis/api -- recommended-actions`
Expected: PASS，7 个用例全绿。

Run: `npm test -w @mentis/api`
Expected: PASS。`orchestrator.test.ts` 里如果有断言旧的「id 命中就整条替换」行为的用例，它现在是错的——按新规则改掉，并在 commit message 里说明。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/consultations.ts apps/api/test/recommended-actions.test.ts apps/api/test/orchestrator.test.ts
git commit -m "fix(api): reject actionIds that contradict the recommendation"
```

---

### Task 8: 前端「全部加入今日计划」

**Files:**
- Modify: `apps/web/src/types.ts`（`ChatRecommendedAction` 加 `actionType?` / `targetMuscles?`，与后端对齐）
- Modify: `apps/web/src/components/MessageBubble.tsx`（多动作时渲染「全部加入」；已加入的卡置灰）
- Modify: `apps/web/src/App.tsx:221-270`（`addRecommendedActionToPlan` 支持批量；新增 `isActionInActivePlan`）
- Modify: `apps/web/src/styles.css`（新按钮样式，扁平描边，无阴影）
- Test: `apps/web/src/MessageBubble.test.tsx`

**Interfaces:**
- Consumes: `ChatRecommendedAction`（含 Task 4 的新字段）
- Produces:
  - `addRecommendedActionsToPlan(actions: ChatRecommendedAction[]): void`（批量版，`addRecommendedActionToPlan` 变成它的单元素调用）
  - `isActionInActivePlan(action: ChatRecommendedAction): boolean`
  - `MessageBubble` 新增 props：`onAddRecommendedActions: (actions: ChatRecommendedAction[]) => void`、`isActionInPlan: (action: ChatRecommendedAction) => boolean`

- [ ] **Step 1: 前端类型对齐**

`apps/web/src/types.ts:17-27` 的 `ChatRecommendedAction` 加两个字段：

```ts
  actionType?: "stretch" | "strength" | "activation" | "mobility" | "balance";
  targetMuscles?: string[];
```

- [ ] **Step 2: 写失败的测试**

在 `apps/web/src/MessageBubble.test.tsx` 追加：

```tsx
it("offers a bulk add button when the assistant recommends more than one action", () => {
  const added: ChatRecommendedAction[][] = [];
  render(
    <MessageBubble
      message={{
        role: "assistant",
        content: "先做这两个",
        recommendedActions: [
          { title: "坐姿腘绳肌拉伸", bodyRegion: "knee", phase: "拉伸", defaultDosage: "3 组 x 30 秒", instructions: [], contraindications: [], progressionCriteria: [], tags: [] },
          { title: "靠墙静蹲", bodyRegion: "knee", phase: "力量", defaultDosage: "3 组 x 30 秒", instructions: [], contraindications: [], progressionCriteria: [], tags: [] },
        ],
      }}
      onAddRecommendedActions={(actions) => added.push(actions)}
      isActionInPlan={() => false}
      onSelectOption={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "全部加入今日计划" }));
  expect(added[0]).toHaveLength(2);
});

it("marks actions already in the plan as non-actionable", () => {
  render(
    <MessageBubble
      message={{
        role: "assistant",
        content: "加上这个",
        recommendedActions: [
          { title: "靠墙静蹲", bodyRegion: "knee", phase: "力量", defaultDosage: "3 组 x 30 秒", instructions: [], contraindications: [], progressionCriteria: [], tags: [] },
        ],
      }}
      onAddRecommendedActions={() => {}}
      isActionInPlan={() => true}
      onSelectOption={() => {}}
    />,
  );

  expect(screen.getByText("已在计划中")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "加入今日计划" })).toBeNull();
});
```

按该测试文件已有的 import 风格补上需要的 import（`fireEvent`、`screen`、`ChatRecommendedAction` 等）。

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -w @mentis/web -- MessageBubble`
Expected: FAIL — `MessageBubble` 不认识 `onAddRecommendedActions` / `isActionInPlan`，找不到「全部加入今日计划」按钮。

- [ ] **Step 4: 改 App.tsx 的加入逻辑为批量**

`apps/web/src/App.tsx:221-270`，把 `addRecommendedActionToPlan` 改造为批量版。核心：把单个动作转成 plan item 的逻辑抽成 `toPlanItem`，然后一次性折叠所有动作，只 setState 一次、只 POST 一次。

```ts
  function toPlanItem(action: ChatRecommendedAction) {
    return {
      actionId: action.actionId,
      title: action.title,
      meta: action.defaultDosage,
      state: "todo" as const,
      phase: action.phase,
      instructions: action.instructions,
      contraindications: action.contraindications,
      progressionCriteria: action.progressionCriteria,
    };
  }

  function isActionInActivePlan(action: ChatRecommendedAction): boolean {
    const items = activeCase?.plan?.items ?? [];
    return items.some((item) => (action.actionId ? item.actionId === action.actionId : item.title === action.title));
  }

  function addRecommendedActionsToPlan(actions: ChatRecommendedAction[]) {
    if (!activeCase || actions.length === 0) {
      return;
    }

    const existingPlan = activeCase.plan;
    const startingItems = existingPlan?.items ?? [];
    const nextItems = [...startingItems];
    for (const action of actions) {
      const isDuplicate = nextItems.some((item) =>
        action.actionId ? item.actionId === action.actionId : item.title === action.title,
      );
      if (!isDuplicate) {
        nextItems.push(toPlanItem(action));
      }
    }
    if (nextItems.length === startingItems.length) {
      return;
    }

    const mergedGoals = actions.reduce(
      (goals, action) => mergePlanGoals(goals, action.progressionCriteria),
      existingPlan?.stage.goals ?? [],
    );
    const [firstAction] = actions;
    const nextPlan: CasePlan = existingPlan
      ? { ...existingPlan, items: nextItems, stage: { ...existingPlan.stage, goals: mergedGoals } }
      : {
          title: `${activeCase.title === pendingComplaintTitle ? "康复" : activeCase.title}训练计划`,
          dayLabel: "今日训练",
          completionPercent: 0,
          items: nextItems,
          stage: {
            name: firstAction.phase,
            progressLabel: "第 1 天",
            progressPercent: 0,
            goals: mergedGoals.length > 0 ? mergedGoals.slice(0, 3) : ["完成后 24 小时无明显加重"],
          },
        };

    setCases((currentCases) =>
      currentCases.map((patientCase) =>
        patientCase.id === activeCase.id
          ? { ...patientCase, plan: nextPlan, status: "运动处方已接受" }
          : patientCase,
      ),
    );
    void rememberTrainingPlanForCurrentUser({ ...activeCase, plan: nextPlan, status: "运动处方已接受" }, nextPlan);
  }
```

`App.tsx:929` 传给 `MessageBubble` 的 prop 从 `onAddRecommendedAction={addRecommendedActionToPlan}` 改为：

```tsx
                    onAddRecommendedActions={addRecommendedActionsToPlan}
                    isActionInPlan={isActionInActivePlan}
```

- [ ] **Step 5: 改 MessageBubble**

`apps/web/src/components/MessageBubble.tsx`，props 换成新的两个，动作卡区域改为：

```tsx
      {recommendedActions.length > 0 ? (
        <div className="action-card-group">
          {recommendedActions.length > 1 ? (
            <button
              className="action-add-all"
              onClick={() => onAddRecommendedActions(recommendedActions.filter((action) => !isActionInPlan(action)))}
              type="button"
            >
              全部加入今日计划
            </button>
          ) : null}
          {recommendedActions.map((action) => (
            <div className="action-card" key={action.actionId ?? action.title}>
              <div>
                <strong>{action.title}</strong>
                <small>{action.phase} · {action.defaultDosage}</small>
              </div>
              {isActionInPlan(action) ? (
                <span className="action-added">已在计划中</span>
              ) : (
                <button onClick={() => onAddRecommendedActions([action])} type="button">
                  加入今日计划
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
```

保留该文件原有的 class 名和结构，只替换按钮/状态部分。

- [ ] **Step 6: 样式**

`apps/web/src/styles.css` 追加（扁平描边、无阴影）：

```css
.action-add-all {
  align-self: flex-start;
  padding: 6px 12px;
  border: 1px solid var(--accent, #b0543c);
  border-radius: 6px;
  background: transparent;
  color: var(--accent, #b0543c);
  cursor: pointer;
}

.action-added {
  color: #9a9a92;
  font-size: 13px;
}
```

如果 `styles.css` 里已有 `--accent` 之外的强调色变量名，改用现有的那个，不要新引入变量。

- [ ] **Step 7: 跑测试**

Run: `npm test -w @mentis/web`
Expected: PASS。

- [ ] **Step 8: 端到端看一眼**

起 `npm run dev:api` + `npm run dev:web`，在膝盖问诊里问一个会触发多动作推荐的问题（例如「给我一套今天能做的膝盖康复动作」）。

Expected: 出现多张动作卡 + 顶部「全部加入今日计划」；点完之后卡片变「已在计划中」；去「我的计划」页能看到这些动作。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/types.ts apps/web/src/App.tsx apps/web/src/components/MessageBubble.tsx \
        apps/web/src/styles.css apps/web/src/MessageBubble.test.tsx
git commit -m "feat(web): add all recommended actions to today's plan at once"
```

---

## 阶段 C：计划打卡

### Task 9: 后端打卡记录与依从性摘要

**Files:**
- Modify: `apps/api/src/types.ts:129-149`（`MemoryTrainingPlan` 对齐 item 结构 + 加 `completions`）
- Modify: `apps/api/src/memory.ts`（新增打卡函数；`summarizeActivePlans` 带上依从性）
- Test: `apps/api/test/plan-completions.test.ts`

**Interfaces:**
- Consumes: `getUserMemory`（`memory.ts:25`）、`notFound`（`helpers.ts`）
- Produces:
  - `interface MemoryTrainingPlanItem { actionId?: string; title: string; meta: string; state: "done" | "todo"; phase?: string; instructions?: string[]; contraindications?: string[]; progressionCriteria?: string[] }`
  - `interface PlanCompletion { date: string; doneKeys: string[] }`
  - `const MAX_PLAN_COMPLETION_DAYS = 30`
  - `planItemKey(item: MemoryTrainingPlanItem): string` → `actionId ?? title`
  - `recordPlanCompletion(platform: PlatformDemo, userId: string, planId: string, key: string, done: boolean, today?: Date): UserMemory`
  - `completionPercentForDate(plan: MemoryTrainingPlan, date: string): number`
  - `summarizeAdherence(plans: MemoryTrainingPlan[], today?: Date): string` → 形如 `最近 7 天完成训练 3 天`

**注意**：现在 api 的 `MemoryTrainingPlan.items` 是 `Array<{ title; meta; state }>`，比前端 `CasePlanItem` 窄（缺 `actionId`）。前端一直在发更宽的对象，运行时留存了，只是类型没对上。打卡要用 `actionId` 做 key，所以这一步必须把类型补齐。

- [ ] **Step 1: 写失败的测试**

创建 `apps/api/test/plan-completions.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  completionPercentForDate,
  createPlatformDemo,
  recordPlanCompletion,
  rememberCase,
  rememberTrainingPlan,
  summarizeAdherence,
} from "../src/index";
import type { MemoryTrainingPlan, MemoryTrainingPlanInput, PlatformDemo } from "../src/index";

function seedPlan(platform: PlatformDemo): MemoryTrainingPlan {
  rememberCase(platform, "user_1", {
    id: "case_1",
    categoryId: "knee",
    title: "下楼梯膝盖疼",
    summary: "下楼梯膝盖疼",
    status: "咨询中",
    createdAt: new Date().toISOString(),
  });

  const input: MemoryTrainingPlanInput = {
    id: "plan_1",
    caseId: "case_1",
    categoryId: "knee",
    title: "膝盖康复训练计划",
    status: "active",
    dayLabel: "今日训练",
    completionPercent: 0,
    items: [
      { actionId: "action_quad_iso", title: "股四头肌等长收缩", meta: "3 组 x 30 秒", state: "todo" },
      { title: "坐姿腘绳肌拉伸", meta: "3 组 x 30 秒", state: "todo" },
    ],
    stage: { name: "镇痛与激活", progressLabel: "第 1 天", progressPercent: 0, goals: ["无痛完成"] },
  };
  const memory = rememberTrainingPlan(platform, "user_1", input);
  return memory.trainingPlans[0];
}

describe("plan completions", () => {
  it("records a completion under today's date, keyed by actionId when present", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);

    const today = new Date("2026-07-12T10:00:00.000Z");
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const plan = memory.trainingPlans[0];

    expect(plan.completions).toEqual([{ date: "2026-07-12", doneKeys: ["action_quad_iso"] }]);
  });

  it("falls back to the title as key for items without an actionId", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);

    const today = new Date("2026-07-12T10:00:00.000Z");
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "坐姿腘绳肌拉伸", true, today);

    expect(memory.trainingPlans[0].completions?.[0].doneKeys).toEqual(["坐姿腘绳肌拉伸"]);
  });

  it("unchecking removes the key without dropping the day's record", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    const today = new Date("2026-07-12T10:00:00.000Z");

    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", false, today);

    expect(memory.trainingPlans[0].completions?.[0].doneKeys).toEqual([]);
  });

  it("is idempotent — checking twice does not duplicate the key", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    const today = new Date("2026-07-12T10:00:00.000Z");

    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);

    expect(memory.trainingPlans[0].completions?.[0].doneKeys).toEqual(["action_quad_iso"]);
  });

  it("computes today's percent and reports zero for a day with no record (cross-day reset)", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    const today = new Date("2026-07-12T10:00:00.000Z");
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const plan = memory.trainingPlans[0];

    expect(completionPercentForDate(plan, "2026-07-12")).toBe(50);
    expect(completionPercentForDate(plan, "2026-07-13")).toBe(0);
  });

  it("keeps at most 30 days of completions", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);

    for (let dayOffset = 0; dayOffset < 35; dayOffset += 1) {
      const day = new Date(Date.UTC(2026, 5, 1 + dayOffset, 10));
      recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, day);
    }

    const completions = platform.userMemories.user_1.trainingPlans[0].completions ?? [];
    expect(completions).toHaveLength(30);
    expect(completions[0].date).toBe("2026-07-05");
  });

  it("summarizes the last 7 days of adherence for the AI to see", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, new Date("2026-07-12T10:00:00.000Z"));
    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, new Date("2026-07-10T10:00:00.000Z"));
    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, new Date("2026-07-01T10:00:00.000Z"));

    const plans = platform.userMemories.user_1.trainingPlans;
    expect(summarizeAdherence(plans, new Date("2026-07-12T10:00:00.000Z"))).toBe("最近 7 天完成训练 2 天");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/api -- plan-completions`
Expected: FAIL — `recordPlanCompletion` 不存在。

- [ ] **Step 3: 改类型**

`apps/api/src/types.ts:129-145` 的 `MemoryTrainingPlan` 替换为：

```ts
export interface MemoryTrainingPlanItem {
  actionId?: string;
  title: string;
  meta: string;
  state: "done" | "todo";
  phase?: string;
  instructions?: string[];
  contraindications?: string[];
  progressionCriteria?: string[];
}

export interface PlanCompletion {
  /** YYYY-MM-DD，服务端日期，不接受客户端传入 */
  date: string;
  doneKeys: string[];
}

export interface MemoryTrainingPlan {
  id: string;
  caseId: string;
  categoryId: RehabConsultCategory;
  title: string;
  status: "active" | "paused" | "completed";
  dayLabel: string;
  completionPercent: number;
  items: MemoryTrainingPlanItem[];
  completions?: PlanCompletion[];
  stage: {
    name: string;
    progressLabel: string;
    progressPercent: number;
    goals: string[];
  };
  updatedAt: string;
}
```

- [ ] **Step 4: 实现打卡函数**

`apps/api/src/memory.ts` 追加：

```ts
export const MAX_PLAN_COMPLETION_DAYS = 30;

export function planItemKey(item: MemoryTrainingPlanItem): string {
  return item.actionId ?? item.title;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function recordPlanCompletion(
  platform: PlatformDemo,
  userId: string,
  planId: string,
  key: string,
  done: boolean,
  today: Date = new Date(),
): UserMemory {
  const memory = getUserMemory(platform, userId);
  const plan = memory.trainingPlans.find((candidate) => candidate.id === planId);
  if (!plan) {
    throw notFound(`Unknown training plan: ${planId}`);
  }

  const date = toDateKey(today);
  const completions = [...(plan.completions ?? [])];
  const index = completions.findIndex((entry) => entry.date === date);
  const existing = index >= 0 ? completions[index] : { date, doneKeys: [] };
  const doneKeys = done
    ? Array.from(new Set([...existing.doneKeys, key]))
    : existing.doneKeys.filter((candidate) => candidate !== key);
  const entry = { date, doneKeys };

  if (index >= 0) {
    completions[index] = entry;
  } else {
    completions.push(entry);
  }

  plan.completions = completions
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_PLAN_COMPLETION_DAYS);
  plan.completionPercent = completionPercentForDate(plan, date);
  plan.updatedAt = new Date().toISOString();

  memory.activePlanSummary = summarizeActivePlans(memory.trainingPlans);
  memory.updatedAt = new Date().toISOString();
  return memory;
}

export function completionPercentForDate(plan: MemoryTrainingPlan, date: string): number {
  if (plan.items.length === 0) {
    return 0;
  }
  const entry = plan.completions?.find((candidate) => candidate.date === date);
  if (!entry) {
    return 0;
  }
  const validKeys = new Set(plan.items.map(planItemKey));
  const doneCount = entry.doneKeys.filter((key) => validKeys.has(key)).length;
  return Math.round((doneCount / plan.items.length) * 100);
}

export function summarizeAdherence(plans: MemoryTrainingPlan[], today: Date = new Date()): string {
  const windowDays = 7;
  const cutoff = new Date(today.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
  const cutoffKey = toDateKey(cutoff);
  const activeDates = new Set<string>();

  for (const plan of plans) {
    for (const entry of plan.completions ?? []) {
      if (entry.date >= cutoffKey && entry.doneKeys.length > 0) {
        activeDates.add(entry.date);
      }
    }
  }
  return `最近 ${windowDays} 天完成训练 ${activeDates.size} 天`;
}
```

需要的 import：`MemoryTrainingPlanItem`、`MemoryTrainingPlan`、`PlanCompletion` 从 `./types.js`。

- [ ] **Step 5: 把依从性喂进 AI 记忆**

`apps/api/src/memory.ts:110-114` 的 `summarizeActivePlans` 改为把依从性拼进去：

```ts
function summarizeActivePlans(plans: MemoryTrainingPlan[]): string {
  const activePlans = plans.filter((plan) => plan.status === "active").slice(0, 2);
  const summaries = activePlans.map((plan) => `${plan.title}，${plan.dayLabel}，动作：${summarizePlanItems(plan.items)}`);
  const adherence = summarizeAdherence(plans);
  return truncateForMemory([...summaries, adherence].filter(Boolean).join("；"), 320);
}
```

这样 `buildUserMemoryContext`（`chat.ts:181`）每轮注入的「当前计划」里就带上了「最近 7 天完成训练 2 天」，AI 问诊时能看到真实依从性，而不是假设用户完美执行。

- [ ] **Step 6: 跑测试**

Run: `npm test -w @mentis/api -- plan-completions`
Expected: PASS，7 个用例全绿。

Run: `npm test -w @mentis/api`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/types.ts apps/api/src/memory.ts apps/api/test/plan-completions.test.ts
git commit -m "feat(api): track daily plan completions and feed adherence to the model"
```

---

### Task 10: 打卡路由

**Files:**
- Modify: `apps/api/src/server.ts`（在 `trainingPlanMemoryMatch` 分支之后加新分支）

**Interfaces:**
- Consumes: `recordPlanCompletion`（Task 9）、`requireMemoryAccess`、`badRequest`
- Produces: `POST /v1/users/:userId/memory/training-plans/:planId/completions`，body `{ key: string; done: boolean }` → `UserMemory`

日期由服务端 `new Date()` 决定，**不接受**客户端传入，防止改本地时间刷打卡。

- [ ] **Step 1: 加路由**

`apps/api/src/server.ts`，import 块加 `recordPlanCompletion`。在 `trainingPlanMemoryMatch` 分支（`server.ts:349-357`）之后插入：

```ts
    const planCompletionMatch = url.pathname.match(
      /^\/v1\/users\/([^/]+)\/memory\/training-plans\/([^/]+)\/completions$/,
    );
    if (method === "POST" && planCompletionMatch) {
      const userId = decodeURIComponent(planCompletionMatch[1]);
      const planId = decodeURIComponent(planCompletionMatch[2]);
      requireMemoryAccess(actor, userId);
      const body = await readJson(request);
      if (typeof body.key !== "string" || typeof body.done !== "boolean") {
        throw badRequest("key must be a string and done must be a boolean");
      }
      const result = recordPlanCompletion(platform, userId, planId, body.key, body.done);
      finish(response, method, result);
      return;
    }
```

**注意路由顺序**：这条必须放在 `trainingPlanMemoryMatch`（匹配 `/memory/training-plans$`）之后。两个正则不冲突（一个有 `$` 结尾在 `training-plans`，一个还要接 `/:planId/completions`），但保持从窄到宽的习惯。

- [ ] **Step 2: 手工验证**

起 `npm run dev:api`，拿 token（同 Task 2），先通过前端或 curl 造一个计划，然后：

```bash
curl -s -X POST http://127.0.0.1:3001/v1/users/user_1/memory/training-plans/plan_1/completions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"key":"action_quad_iso","done":true}'
```
Expected: 返回的 `UserMemory` 里，`trainingPlans[0].completions` 有今天的日期和这个 key；`activePlanSummary` 末尾带「最近 7 天完成训练 1 天」。

非法 body 要 400：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://127.0.0.1:3001/v1/users/user_1/memory/training-plans/plan_1/completions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"key":123}'
```
Expected: `400`

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): add plan completion route"
```

---

### Task 11: 计划页打勾交互

**Files:**
- Create: `apps/web/src/planProgress.ts`
- Create: `apps/web/src/planProgress.test.ts`
- Modify: `apps/web/src/types.ts`（`MemoryTrainingPlan` 加 `completions?`；`CasePlanItem` 已有 `actionId`，无需改）
- Modify: `apps/web/src/components/PlansPage.tsx:66-90`（勾选框替换死文本）
- Modify: `apps/web/src/App.tsx`（`togglePlanItem` + 乐观更新 + 失败回滚）
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: Task 10 的路由；`MemoryTrainingPlan`（带 `completions`）
- Produces:
  - `todayKey(now?: Date): string` → `YYYY-MM-DD`
  - `planItemKey(item: CasePlanItem): string` → `actionId ?? title`
  - `doneKeysForToday(plan: MemoryTrainingPlan, today: string): Set<string>`
  - `completionPercentToday(plan: MemoryTrainingPlan, today: string): number`
  - `PlansPage` 新增 prop：`onToggleItem: (planId: string, key: string, done: boolean) => void`

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/planProgress.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { completionPercentToday, doneKeysForToday, planItemKey, todayKey } from "./planProgress";
import type { MemoryTrainingPlan } from "./types";

const plan: MemoryTrainingPlan = {
  id: "plan_1",
  caseId: "case_1",
  categoryId: "knee",
  title: "膝盖康复训练计划",
  status: "active",
  dayLabel: "今日训练",
  completionPercent: 0,
  items: [
    { actionId: "action_quad_iso", title: "股四头肌等长收缩", meta: "3 组 x 30 秒", state: "todo" },
    { title: "坐姿腘绳肌拉伸", meta: "3 组 x 30 秒", state: "todo" },
  ],
  completions: [{ date: "2026-07-12", doneKeys: ["action_quad_iso"] }],
  stage: { name: "镇痛与激活", progressLabel: "第 1 天", progressPercent: 0, goals: [] },
  updatedAt: "2026-07-12T10:00:00.000Z",
};

describe("plan progress", () => {
  it("formats today as YYYY-MM-DD", () => {
    expect(todayKey(new Date("2026-07-12T10:00:00.000Z"))).toBe("2026-07-12");
  });

  it("keys items by actionId, falling back to title", () => {
    expect(planItemKey(plan.items[0])).toBe("action_quad_iso");
    expect(planItemKey(plan.items[1])).toBe("坐姿腘绳肌拉伸");
  });

  it("reads back the keys completed today", () => {
    expect(doneKeysForToday(plan, "2026-07-12").has("action_quad_iso")).toBe(true);
    expect(doneKeysForToday(plan, "2026-07-12").has("坐姿腘绳肌拉伸")).toBe(false);
  });

  it("resets across days — yesterday's completions do not count today", () => {
    expect(completionPercentToday(plan, "2026-07-12")).toBe(50);
    expect(completionPercentToday(plan, "2026-07-13")).toBe(0);
    expect(doneKeysForToday(plan, "2026-07-13").size).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/web -- planProgress`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 planProgress.ts**

```ts
import type { CasePlanItem, MemoryTrainingPlan } from "./types";

export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function planItemKey(item: CasePlanItem): string {
  return item.actionId ?? item.title;
}

export function doneKeysForToday(plan: MemoryTrainingPlan, today: string): Set<string> {
  const entry = plan.completions?.find((completion) => completion.date === today);
  return new Set(entry?.doneKeys ?? []);
}

export function completionPercentToday(plan: MemoryTrainingPlan, today: string): number {
  if (plan.items.length === 0) {
    return 0;
  }
  const doneKeys = doneKeysForToday(plan, today);
  const doneCount = plan.items.filter((item) => doneKeys.has(planItemKey(item))).length;
  return Math.round((doneCount / plan.items.length) * 100);
}
```

`apps/web/src/types.ts` 的 `MemoryTrainingPlan` 加一行（和后端对齐）：

```ts
  completions?: { date: string; doneKeys: string[] }[];
```

- [ ] **Step 4: App.tsx 里加 toggle（乐观更新 + 失败回滚）**

```ts
  async function togglePlanItem(planId: string, key: string, done: boolean) {
    if (!session) {
      return;
    }
    const previousMemory = session.memory;

    const today = todayKey();
    const optimisticPlans = session.memory.trainingPlans.map((plan) => {
      if (plan.id !== planId) {
        return plan;
      }
      const completions = [...(plan.completions ?? [])];
      const index = completions.findIndex((entry) => entry.date === today);
      const existing = index >= 0 ? completions[index] : { date: today, doneKeys: [] };
      const doneKeys = done
        ? Array.from(new Set([...existing.doneKeys, key]))
        : existing.doneKeys.filter((candidate) => candidate !== key);
      const entry = { date: today, doneKeys };
      if (index >= 0) {
        completions[index] = entry;
      } else {
        completions.push(entry);
      }
      return { ...plan, completions };
    });
    setSession({ ...session, memory: { ...session.memory, trainingPlans: optimisticPlans } });

    try {
      const response = await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/memory/training-plans/${encodeURIComponent(planId)}/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ key, done }),
        },
      );
      if (!response.ok) {
        throw new Error(`completion_failed_${response.status}`);
      }
      const memory = (await response.json()) as UserMemory;
      setSession({ ...session, memory });
    } catch {
      setSession({ ...session, memory: previousMemory });
    }
  }
```

把 `onToggleItem={togglePlanItem}` 传给 `<PlansPage ... />`。`todayKey` 从 `./planProgress` import。

- [ ] **Step 5: PlansPage 换成真勾选框**

`apps/web/src/components/PlansPage.tsx`：props 加 `onToggleItem`；顶部算 `const today = todayKey();`、`const doneKeys = activePlan ? doneKeysForToday(activePlan, today) : new Set<string>();`。

进度条那行（`PlansPage.tsx:37-42`）的 `activePlan.completionPercent` 换成 `completionPercentToday(activePlan, today)`（两处：宽度和数字）。

训练列表（`PlansPage.tsx:66-90`）里，把末尾的 `<em>{item.state === "done" ? "已完成" : "待完成"}</em>` 换成：

```tsx
                    <label className="training-check">
                      <input
                        checked={doneKeys.has(planItemKey(item))}
                        onChange={(event) => onToggleItem(activePlan.id, planItemKey(item), event.target.checked)}
                        type="checkbox"
                      />
                      <span>{doneKeys.has(planItemKey(item)) ? "已完成" : "标记完成"}</span>
                    </label>
```

标题栏（`PlansPage.tsx:63-65`）的日期从 `activePlan.updatedAt.slice(0, 10)` 改为 `today`——显示的是「今天」的训练，不是计划的更新时间。

- [ ] **Step 6: 样式（扁平描边，无阴影）**

`apps/web/src/styles.css` 追加：

```css
.training-check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #6f6f68;
}

.training-check input[type="checkbox"] {
  appearance: none;
  width: 18px;
  height: 18px;
  border: 1px solid #cfcabd;
  border-radius: 50%;
  cursor: pointer;
}

.training-check input[type="checkbox"]:checked {
  border-color: var(--accent, #b0543c);
  background: var(--accent, #b0543c);
}
```

- [ ] **Step 7: 跑测试**

Run: `npm test -w @mentis/web`
Expected: PASS。

- [ ] **Step 8: 端到端验证跨天重置**

起前后端，在「我的计划」勾几个动作，确认进度条动了；刷新页面，勾选状态还在（这证明它落了后端，不是本地 state）。

跨天重置的验证不改系统时间——改用后端单测已覆盖（Task 9 的 `completionPercentForDate(plan, "2026-07-13") === 0`）+ 前端单测（Task 11 Step 1 的 `completionPercentToday(plan, "2026-07-13") === 0`）。手工只需确认「今天勾的，今天还在」。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/planProgress.ts apps/web/src/planProgress.test.ts apps/web/src/types.ts \
        apps/web/src/App.tsx apps/web/src/components/PlansPage.tsx apps/web/src/styles.css
git commit -m "feat(web): check off plan items daily"
```

---

## 阶段 D：洗库 + 重建膝关节康复动作库

### Task 12: 手写膝关节康复种子库

**Files:**
- Create: `apps/api/src/action-library.seed.ts`
- Test: `apps/api/test/action-library-seed.test.ts`

**Interfaces:**
- Produces: `export const kneeRehabActionLibrary: ActionLibraryItem[]`

**每条动作必须满足的规则（测试会强制）：**
- `id` 以 `action_` 开头，全局唯一
- `title` 中文
- `source: "seed"`
- `actionType` 和 `targetMuscles`（≥1 项，中文肌群名）必填——**没有这两个字段，Task 7 的一致性校验就永远判不匹配，整个种子库等于白写**
- `bodyRegions` 至少含 `"knee"`；跨关节动作追加 `"hip"` / `"ankle_foot"` / `"spine"`
- `bodyRegion` 设为 `"knee"`（主归属，兼容旧过滤逻辑）
- `instructions` 3-5 条中文步骤
- `contraindications` 至少含一条「训练中疼痛超过 4/10 立即停止」
- `progressionCriteria` 1-2 条
- `phase` 取五个之一：`镇痛与激活` / `活动度与拉伸` / `力量` / `神经肌肉控制` / `回归活动`

**动作清单（45 个，实现时逐条按上面规则展开）：**

| phase | id | title | actionType | targetMuscles | bodyRegions |
|---|---|---|---|---|---|
| 镇痛与激活 | action_quad_iso | 股四头肌等长收缩 | activation | 股四头肌 | knee |
| 镇痛与激活 | action_straight_leg_raise | 直腿抬高 | activation | 股四头肌、髂腰肌 | knee, hip |
| 镇痛与激活 | action_ankle_pump | 踝泵 | activation | 小腿三头肌、胫骨前肌 | knee, ankle_foot |
| 镇痛与激活 | action_glute_set | 臀肌等长收缩 | activation | 臀大肌 | knee, hip |
| 镇痛与激活 | action_quad_over_towel | 毛巾下压伸膝 | activation | 股四头肌 | knee |
| 镇痛与激活 | action_heel_prop | 足跟垫高伸膝 | mobility | 腘绳肌 | knee |
| 镇痛与激活 | action_short_arc_quad | 小弧度伸膝 | activation | 股四头肌 | knee |
| 镇痛与激活 | action_bridge | 臀桥 | activation | 臀大肌、腘绳肌 | knee, hip |
| 活动度与拉伸 | action_heel_slide | 足跟滑动屈膝 | mobility | 股四头肌 | knee |
| 活动度与拉伸 | action_prone_hang | 俯卧垂腿伸膝 | mobility | 腘绳肌 | knee |
| 活动度与拉伸 | action_seated_hamstring_stretch | 坐姿腘绳肌拉伸 | stretch | 腘绳肌 | knee, hip |
| 活动度与拉伸 | action_supine_hamstring_strap | 仰卧弹力带腘绳肌拉伸 | stretch | 腘绳肌 | knee, hip |
| 活动度与拉伸 | action_prone_quad_stretch | 俯卧股四头肌拉伸 | stretch | 股四头肌 | knee, hip |
| 活动度与拉伸 | action_standing_quad_stretch | 站姿股四头肌拉伸 | stretch | 股四头肌 | knee, hip |
| 活动度与拉伸 | action_gastroc_stretch | 腓肠肌拉伸 | stretch | 小腿三头肌 | knee, ankle_foot |
| 活动度与拉伸 | action_soleus_stretch | 比目鱼肌拉伸 | stretch | 小腿三头肌 | knee, ankle_foot |
| 活动度与拉伸 | action_itb_stretch | 髂胫束拉伸 | stretch | 阔筋膜张肌、髂胫束 | knee, hip |
| 活动度与拉伸 | action_hip_flexor_stretch | 髂腰肌拉伸 | stretch | 髂腰肌 | knee, hip |
| 活动度与拉伸 | action_calf_wall_stretch | 靠墙小腿拉伸 | stretch | 小腿三头肌 | knee, ankle_foot |
| 活动度与拉伸 | action_patellar_mobilization | 髌骨松动 | mobility | 髌周软组织 | knee |
| 活动度与拉伸 | action_seated_knee_flexion | 坐姿主动屈膝 | mobility | 腘绳肌 | knee |
| 力量 | action_wall_sit | 靠墙静蹲 | strength | 股四头肌、臀大肌 | knee, hip |
| 力量 | action_mini_squat | 微蹲 | strength | 股四头肌、臀大肌 | knee, hip |
| 力量 | action_sit_to_stand | 坐起站立 | strength | 股四头肌、臀大肌 | knee, hip |
| 力量 | action_terminal_knee_extension | 弹力带末端伸膝 | strength | 股四头肌 | knee |
| 力量 | action_leg_press_light | 轻负荷腿举 | strength | 股四头肌、臀大肌 | knee, hip |
| 力量 | action_hamstring_curl | 俯卧腿弯举 | strength | 腘绳肌 | knee |
| 力量 | action_nordic_eccentric | 北欧腿弯举（离心渐进） | strength | 腘绳肌 | knee |
| 力量 | action_romanian_deadlift | 单腿硬拉 | strength | 腘绳肌、臀大肌 | knee, hip |
| 力量 | action_clamshell | 蚌式开合 | strength | 臀中肌 | knee, hip |
| 力量 | action_side_lying_abduction | 侧卧髋外展 | strength | 臀中肌 | knee, hip |
| 力量 | action_monster_walk | 弹力带侧向行走 | strength | 臀中肌 | knee, hip |
| 力量 | action_calf_raise | 提踵 | strength | 小腿三头肌 | knee, ankle_foot |
| 力量 | action_step_up | 上台阶 | strength | 股四头肌、臀大肌 | knee, hip |
| 力量 | action_split_squat | 分腿蹲 | strength | 股四头肌、臀大肌 | knee, hip |
| 力量 | action_plank | 平板支撑 | strength | 核心肌群 | knee, spine |
| 力量 | action_side_plank | 侧平板支撑 | strength | 核心肌群、臀中肌 | knee, spine, hip |
| 神经肌肉控制 | action_single_leg_stand | 单腿站立 | balance | 股四头肌、臀中肌 | knee, hip |
| 神经肌肉控制 | action_single_leg_stand_eyes_closed | 闭眼单腿站立 | balance | 股四头肌、臀中肌 | knee, hip |
| 神经肌肉控制 | action_step_down_control | 台阶控制下落 | balance | 股四头肌、臀大肌 | knee, hip |
| 神经肌肉控制 | action_y_balance | Y 字平衡触地 | balance | 股四头肌、臀中肌 | knee, hip |
| 神经肌肉控制 | action_single_leg_rdl_balance | 单腿平衡前伸 | balance | 腘绳肌、臀大肌 | knee, hip |
| 回归活动 | action_stair_descent | 下台阶控制 | strength | 股四头肌 | knee |
| 回归活动 | action_walk_jog_intervals | 走跑交替 | strength | 股四头肌、小腿三头肌 | knee, ankle_foot |
| 回归活动 | action_forward_hop | 向前单腿跳 | balance | 股四头肌、小腿三头肌 | knee, ankle_foot |
| 回归活动 | action_lateral_hop | 侧向单腿跳 | balance | 臀中肌、股四头肌 | knee, hip |

- [ ] **Step 1: 写失败的测试**

创建 `apps/api/test/action-library-seed.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { kneeRehabActionLibrary } from "../src/action-library.seed";

describe("knee rehab seed library", () => {
  it("has no duplicate ids", () => {
    const ids = kneeRehabActionLibrary.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every action with a type and target muscles", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.actionType, `${action.id} missing actionType`).toBeDefined();
      expect(action.targetMuscles?.length, `${action.id} missing targetMuscles`).toBeGreaterThan(0);
    }
  });

  it("marks every action as a knee-region seed", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.source).toBe("seed");
      expect(action.bodyRegion).toBe("knee");
      expect(action.bodyRegions).toContain("knee");
    }
  });

  it("gives every action usable instructions and a hard stop rule", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.instructions.length, `${action.id} needs 3-5 steps`).toBeGreaterThanOrEqual(3);
      expect(action.instructions.length).toBeLessThanOrEqual(5);
      expect(action.contraindications.some((rule) => rule.includes("4/10")), `${action.id} missing pain stop rule`).toBe(true);
      expect(action.progressionCriteria.length).toBeGreaterThan(0);
    }
  });

  it("covers all five rehab phases", () => {
    const phases = new Set(kneeRehabActionLibrary.map((action) => action.phase));
    expect(phases).toEqual(new Set(["镇痛与激活", "活动度与拉伸", "力量", "神经肌肉控制", "回归活动"]));
  });

  it("has a hamstring stretch reachable from the knee category — the gap that caused the wrong recommendation", () => {
    const hamstringStretch = kneeRehabActionLibrary.find(
      (action) => action.actionType === "stretch" && action.targetMuscles?.includes("腘绳肌"),
    );
    expect(hamstringStretch).toBeDefined();
    expect(hamstringStretch?.bodyRegions).toContain("knee");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -w @mentis/api -- action-library-seed`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 按清单逐条写出 45 个动作**

创建 `apps/api/src/action-library.seed.ts`。模板（以第一条为例，其余 44 条同构）：

```ts
import type { ActionLibraryItem } from "@mentis/domain";

export const kneeRehabActionLibrary: ActionLibraryItem[] = [
  {
    id: "action_quad_iso",
    title: "股四头肌等长收缩",
    bodyRegion: "knee",
    bodyRegions: ["knee"],
    actionType: "activation",
    targetMuscles: ["股四头肌"],
    source: "seed",
    phase: "镇痛与激活",
    defaultDosage: "3 组 x 10 次，每次保持 5 秒",
    instructions: [
      "仰卧或坐位，患侧腿伸直放平",
      "缓慢绷紧大腿前侧，把膝盖后方向下压向床面",
      "保持 5 秒，正常呼吸不要憋气",
      "缓慢放松，休息 3 秒后重复",
    ],
    contraindications: ["训练中疼痛超过 4/10 立即停止", "术后负重限制未经确认前不要加量"],
    progressionCriteria: ["完成后 24 小时内症状无明显反跳", "可无痛完成 3 组 x 10 次"],
    tags: ["膝盖", "等长", "低刺激"],
  },
  {
    id: "action_seated_hamstring_stretch",
    title: "坐姿腘绳肌拉伸",
    bodyRegion: "knee",
    bodyRegions: ["knee", "hip"],
    actionType: "stretch",
    targetMuscles: ["腘绳肌"],
    source: "seed",
    phase: "活动度与拉伸",
    defaultDosage: "3 组 x 30 秒",
    instructions: [
      "坐在椅子边缘，患侧腿向前伸直，脚跟轻触地面",
      "保持腰背挺直，从髋部开始身体缓慢前倾",
      "感到大腿后方有轻微牵拉感即停，不要追求疼痛",
      "保持 30 秒，缓慢回正，换边或重复",
    ],
    contraindications: ["训练中疼痛超过 4/10 立即停止", "出现放射到小腿的麻木感立即停止"],
    progressionCriteria: ["牵拉感可耐受且无放射痛", "膝关节伸直角度较前改善"],
    tags: ["膝盖", "拉伸", "腘绳肌"],
  },
  // ... 按上面的清单表格补齐剩余 43 条，字段规则同上
];
```

**这条动作（`action_seated_hamstring_stretch`）就是截图里 AI 想推荐、但库里根本不存在的那个。** 它到位之后，`resolveRecommendedActions` 才有正确答案可复用。

- [ ] **Step 4: 跑测试**

Run: `npm test -w @mentis/api -- action-library-seed`
Expected: PASS，6 个用例全绿。任何一条动作漏字段都会在这里被抓出来。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/action-library.seed.ts apps/api/test/action-library-seed.test.ts
git commit -m "feat(api): add hand-written knee rehab action library"
```

---

### Task 13: 换掉种子库、删除健身库

**Files:**
- Delete: `apps/api/src/exercise-library.generated.ts`
- Modify: `apps/api/src/platform.ts:160-187`（`buildSeedActionLibrary`）
- Modify: `apps/api/test/orchestrator.test.ts`（凡是依赖旧库规模/旧 id 的断言）
- Modify: `DEVELOPMENT.md:67`、`DEVELOPMENT.md:168-170`（动作库那两条约定过时了）

**Interfaces:**
- Consumes: `kneeRehabActionLibrary`（Task 12）
- Produces: `buildSeedActionLibrary(): ActionLibraryItem[]` 现在返回 45 条手写动作，不再拼接 1112 条健身动作

- [ ] **Step 1: 换掉种子库**

`apps/api/src/platform.ts`：删掉 `importedExerciseLibrary` 的 import，改为：

```ts
import { kneeRehabActionLibrary } from "./action-library.seed.js";
```

`buildSeedActionLibrary`（`platform.ts:160-187`）整体替换为：

```ts
function buildSeedActionLibrary(): ActionLibraryItem[] {
  return kneeRehabActionLibrary;
}
```

原来那两条手写 seed（`action_quad_iso`、`action_wall_sit`）已经在 Task 12 的清单里，不会丢。

- [ ] **Step 2: 删文件**

```bash
git rm apps/api/src/exercise-library.generated.ts
```

- [ ] **Step 3: 跑全量测试，修掉依赖旧库的断言**

Run: `npm test -w @mentis/api`

`orchestrator.test.ts` 里 `listActionLibrary` 相关的用例可能断言了库的规模或某个 `exercise_*` id。把它们改成断言新库的语义，例如：

```ts
  it("exposes the knee rehab action library", () => {
    const platform = createPlatformDemo();
    const library = listActionLibrary(platform);

    expect(library.length).toBeGreaterThan(40);
    expect(library.every((action) => action.source === "seed")).toBe(true);
    expect(library.some((action) => action.id === "action_seated_hamstring_stretch")).toBe(true);
  });
```

Expected: 全绿。

- [ ] **Step 4: 端到端验证——这是整个计划要证明的东西**

起前后端，**用一个干净的数据文件**（别用有存量脏数据的那个）：

```bash
rm -f apps/api/data/platform-state.json   # 仅本地开发数据
npm run dev:api
npm run dev:web
```

在膝盖问诊里复刻截图里的场景：说「最近下楼梯膝盖疼，膝盖后方有紧绷牵拉感」，等 AI 推荐拉伸动作。

Expected:
1. AI 的正文说拉伸大腿后侧/腘绳肌时，动作卡也是**腘绳肌**动作（`坐姿腘绳肌拉伸`），不再是 `lying (side) quads stretch`。
2. 剂量是 `3 组 x 30 秒`（拉伸的剂量），不再是 `2-3 组 x 8-12 次`（力量训练的模板剂量）。
3. 可能一次推荐多个动作，卡组顶部有「全部加入今日计划」。

- [ ] **Step 5: 更新 DEVELOPMENT.md**

`DEVELOPMENT.md:67` 那行改为：

```
  - `action-library.seed.ts` — 手写的膝关节康复动作种子库（45 条）。改动作内容直接改这里。
```

`DEVELOPMENT.md:168` 的「动作库数据源」那条改为：

```
- **动作库数据源**是手写的 `action-library.seed.ts`。原来那份 1112 条健身动作的生成文件已删除（生成脚本本就不在仓库里）。AI 现场生成的动作会以 `source: "ai"` 落库积累。
```

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/platform.ts apps/api/test/orchestrator.test.ts DEVELOPMENT.md
git commit -m "feat(api): replace fitness exercise dump with knee rehab library"
```

---

### Task 14: 生产数据迁移脚本（只写，不跑）

**Files:**
- Create: `scripts/purge-fitness-library.mjs`
- Modify: `infra/DEPLOY.md`（加一节说明这次一次性迁移怎么做）

**Interfaces:**
- Produces: `node scripts/purge-fitness-library.mjs <path-to-platform-state.json> [--apply]`
  - 默认 dry-run，只打印会删掉多少条、保留多少条
  - `--apply` 才真写，且写之前先自动备份成 `<path>.bak-<timestamp>`

**为什么必须有这个脚本**：`storage.ts:77` 的 `mergeSeedWins` 是增量合并——磁盘上多出来的条目会被并回内存。所以那 1112 条已经写进 `platform-state.json` 的健身动作，**光删代码删不掉**，重启后还会回来。

已存在的用户计划不受影响：计划的 item 自带 `title` / `instructions`，是快照而非对库的引用。

- [ ] **Step 1: 写脚本**

创建 `scripts/purge-fitness-library.mjs`：

```js
#!/usr/bin/env node
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const [, , dataPath, ...flags] = process.argv;
const apply = flags.includes("--apply");

if (!dataPath) {
  console.error("用法: node scripts/purge-fitness-library.mjs <platform-state.json> [--apply]");
  process.exit(1);
}

const state = JSON.parse(readFileSync(dataPath, "utf-8"));
const library = Array.isArray(state.actionLibrary) ? state.actionLibrary : [];

const isFitnessImport = (action) =>
  Array.isArray(action.tags) && action.tags.includes("exercise-library");

const removed = library.filter(isFitnessImport);
const kept = library.filter((action) => !isFitnessImport(action));

console.log(`动作库总数: ${library.length}`);
console.log(`将删除(健身导入): ${removed.length}`);
console.log(`将保留: ${kept.length}`);
console.log(`  其中 source=ai (模型生成，要留): ${kept.filter((action) => action.source === "ai").length}`);
console.log(`  其中 source=seed: ${kept.filter((action) => action.source === "seed").length}`);
console.log(`  其中无 source 标记: ${kept.filter((action) => !action.source).length}`);

if (!apply) {
  console.log("\n这是 dry-run，没有改动任何文件。确认无误后加 --apply 再跑一次。");
  process.exit(0);
}

const backupPath = `${dataPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(dataPath, backupPath);
console.log(`\n已备份到 ${backupPath}`);

state.actionLibrary = kept;
writeFileSync(dataPath, JSON.stringify(state), "utf-8");
console.log(`已写回 ${dataPath}，动作库剩 ${kept.length} 条。`);
```

判据用 `tags` 含 `exercise-library` 而不是 `source`——那 1112 条旧数据里根本没有 `source` 字段，但 `exercise-library.generated.ts` 每条的 tags 第一项都是 `"exercise-library"`（见该文件）。`source: "ai"` 的动作是模型生成的、要留下。

- [ ] **Step 2: 在本地数据文件上 dry-run 验证**

```bash
node scripts/purge-fitness-library.mjs apps/api/data/platform-state.json
```
Expected: 打印出「将删除(健身导入): 1112」之类的数字，且明确说这是 dry-run、没动文件。

- [ ] **Step 3: 在本地副本上验证 --apply**

```bash
cp apps/api/data/platform-state.json /tmp/state-test.json
node scripts/purge-fitness-library.mjs /tmp/state-test.json --apply
node -e "const s=require('/tmp/state-test.json'); console.log('剩余动作:', s.actionLibrary.length); console.log('用户计划条数:', Object.values(s.userMemories ?? {}).reduce((n,m)=>n+(m.trainingPlans?.length ?? 0),0));"
```
Expected: 动作库大幅缩小；**用户计划条数不变**（证明计划没被打碎）。

- [ ] **Step 4: 写进部署文档**

`infra/DEPLOY.md` 追加一节：

```markdown
## 一次性迁移：清理健身动作库（2026-07）

动作库从 1112 条导入的健身动作换成了手写的膝关节康复库。`storage.ts` 的合并策略是
「磁盘上多出来的条目增量并回」，所以只删代码不够——必须清一次生产数据文件。

在服务器上：

1. 停服务：`sudo systemctl stop mentis-api`
2. dry-run 看看会删多少：
   `node scripts/purge-fitness-library.mjs /opt/mentis-rehab-platform/data/platform-state.json`
3. 确认数字合理后再执行（脚本会自动先备份）：
   `node scripts/purge-fitness-library.mjs /opt/mentis-rehab-platform/data/platform-state.json --apply`
4. 起服务：`sudo systemctl start mentis-api`
5. 自检：`curl https://api.aimentis.site/health` → `{"ok":true,...}`；
   登录后 `GET /v1/action-library` 应只剩康复动作，没有 `exercise_*` 开头的 id。

出问题就把备份文件 `mv` 回原名再 restart。
```

- [ ] **Step 5: 提交**

```bash
git add scripts/purge-fitness-library.mjs infra/DEPLOY.md
git commit -m "chore: add one-off migration to purge the fitness action library"
```

- [ ] **Step 6: 停在这里，不要碰生产**

这个脚本**不要**在生产上跑。跑的时机、是否先备份 `platform-state.json` 到 iCloud、走不走夜间窗口，都由用户单独确认。

---

## 收尾

- [ ] **全量测试**

Run: `npm run build -w @mentis/domain && npm test && npm run build`
Expected: 三个包的测试全绿，build 通过。

- [ ] **回归验收清单**（对着最初的两张截图逐条核）

1. 刷新页面后点回病例，聊天记录、选项按钮、动作卡都还在。
2. 说「膝盖后方紧绷」时，AI 给的动作卡是腘绳肌拉伸，不是 `lying (side) quads stretch`。
3. AI 会一次推荐多个动作，卡组顶部有「全部加入今日计划」。
4. 「我的计划」里能勾选完成，进度条跟着动；刷新后勾选状态还在。
5. `GET /v1/action-library` 里没有 `exercise_*` 开头的 id。
