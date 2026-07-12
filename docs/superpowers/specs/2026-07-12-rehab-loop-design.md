# Mentis 康复闭环加固设计

日期：2026-07-12
范围：聊天记录持久化、动作推荐一致性、多动作推荐、计划打卡、重建膝关节康复动作库

---

## 背景：两个已确认的缺陷

### 缺陷 1：刷新页面聊天记录全丢

聊天消息从头到尾没上传过后端。

- `apps/web/src/App.tsx:709-716` — 前端 POST `/memory/cases` 时手动只挑 6 个字段（id / categoryId / title / summary / status / createdAt），`messages` 没发。
- `apps/api/src/types.ts:120` — 后端 `MemoryCaseSummary` 类型里没有 `messages` 字段。
- `apps/web/src/caseUtils.ts:13` — 刷新后重建病例时写死 `messages: existingCase?.messages ?? []`，`existingCases` 为空，必然得到空数组。

后端确实没有数据库（全内存 + `platform-state.json` 落盘），但落盘本身是好的——病例、计划、用户都存住了。丢的只有消息。

### 缺陷 2：正文说拉腘绳肌，卡片给股四头肌拉伸

三个环节叠加：

1. **膝盖类目下总共只有 5 个动作可选。** 1112 个导入动作的 `bodyRegion` 分布：肩 494、脊柱 387、髋 168、踝足 36、膝盖 3。加 2 个手写 seed 共 5 个。库里 4 个腘绳肌动作全被分到 spine / hip / ankle_foot——膝盖类目下一个腘绳肌拉伸都没有。
2. **Prompt 在逼模型硬凑。** `chat.ts:160` 写着"优先使用可用动作库里的 actionId"，而 `formatActionLibraryContext` 只给模型看 `id: title；bodyRegion；phase；剂量`，连目标肌群都没有。模型想推荐腘绳肌拉伸，那 5 个里唯一带 stretch 的就是 `lying (side) quads stretch`，于是填了这个 id。
3. **后端拿到 id 后整条覆盖模型的答案。** `consultations.ts:424-429` 的 `resolveRecommendedActions` 只要 `actionId` 命中，就 `actionFromLibraryItem(...)` 整体替换 title / instructions / 剂量。且没有任何一层校验 `content` 与 `recommendedActions` 是否一致。

结论：不是模型依从性差。模型在 `content` 里说对了，是管道把它的答案换成了错的。

---

## 阶段 A：聊天记录持久化

**存储**：新增 `platform.caseMessages: Record<caseId, ChatMessage[]>`，独立于 `userMemories`，加入 `storage.ts` 的 `PERSISTABLE_KEYS`。

不塞进 `MemoryCaseSummary`，因为该结构会被 `buildUserMemoryContext` 压缩后喂进每轮 prompt，也会被 `GET /memory` 整体返回；塞进去等于每次登录都拖一大坨，还会污染上下文。

**上限**：每个病例保留最近 200 条，超出从头截断。

**路由**：
- `GET /v1/users/:id/cases/:caseId/messages` — 打开病例时按需拉取
- `POST /v1/users/:id/cases/:caseId/messages` — 追加消息

两者都走 `requireMemoryAccess`。当前仅本人可访问（康复师访问走 `caseAuthorizations`，本期不做）。

**前端**：
- `caseUtils.ts:13` 的 `hydrateCasesFromMemory` 不再强制清空 messages，改为留空 + 懒加载标记。
- `selectCase` 时若该病例消息未加载，异步拉取。
- 发送用户消息、收到助手回复时各追加一条。

**AI 上下文不变**：仍只喂压缩摘要（profileSummary / clinicalSummary / activePlanSummary / recentEvents），加当前会话最近 8 条（`App.tsx:340` 已如此）。不把 200 条原始消息灌进 prompt。

---

## 阶段 B：推荐一致性 + 多动作推荐

### B1. Prompt 侧（`chat.ts`）

- `formatActionLibraryContext` 注入行补上动作类型与目标肌群：`id: title；类型；目标肌群；阶段；剂量`。
- 候选不再 `slice(0, 12)` 无脑取前 12，改为按当前对话关键词做本地 TF 打分召回 Top-15（复用 `rag.ts` 已有打分思路，不引外部依赖）。
- 措辞反转：从"优先使用库里的 actionId"改为"**只有当库里某个动作就是你在 content 里描述的那个动作时**才填 actionId；哪怕只是部位相近也不要填，直接按格式生成新动作"。
- 数量交给模型：明确"推荐 1-5 个动作，数量你自己定"。`normalizeRecommendedActions` 上限从 4 放到 5。
- `recommendedActions` 新增两个必填字段：`targetMuscles: string[]`、`actionType`。

### B2. 服务端校验（`resolveRecommendedActions`）

这是真正的兜底。id 命中后**先比对**模型自报的 `actionType` 和 `targetMuscles` 与库里那条：

- `actionType` 不一致，或 `targetMuscles` 交集为空 → **丢弃该 id**，改用模型自己描述的动作新建一条入库（`source: "ai"`）。
- 相符 → 用库里那条（instructions / 剂量是审过的、以后要挂视频），但保留模型写的 `reason`。

纯本地判断，不额外调 LLM，无延迟成本。落地后"正文说腘绳肌、卡片给股四头肌"会在服务端被拦截：模型乱填 id 的后果从"静默显示错动作"变成"用它自己描述的正确动作"。

**B 先于 D 上线时的降级行为（有意为之）**：B 阶段库里还是那批老动作，没有 `targetMuscles` / `actionType`，无法校验。此时规则是"**无法校验即丢弃 id**"——退回用模型自己描述的动作。效果是 B 上线到 D 完成之间，膝盖推荐几乎全部走 AI 生成分支。这正是想要的：宁可用模型自己写的正确动作，也不要库里那条错的。D 完成后，种子动作字段齐备，校验开始真正生效，复用率自然回升。

### B3. 前端

- 推荐 ≥2 个时，卡组顶部出现「全部加入今日计划」。
- 已加入的卡置灰显示"已在计划中"，不可再点。`addRecommendedActionToPlan`（`App.tsx:221`）已有按 `actionId ?? title` 去重的逻辑，复用。

---

## 阶段 C：计划打卡（按天）

**数据**：`MemoryTrainingPlan` 新增 `completions: { date: "YYYY-MM-DD"; doneKeys: string[] }[]`，滚动保留最近 30 天。item 的 key 取 `actionId ?? title`。

`completionPercent` 不再是手写死值，改为由**今天**的完成数 / 动作总数实时计算。跨天自然归零——查不到今天的记录即为全未完成，不需要定时任务。

**路由**：`POST /v1/users/:id/memory/training-plans/:planId/completions`，body `{ key, done }`。日期由服务端取，不接受客户端传入，防止改本地时间刷打卡。

**UI（`PlansPage.tsx`）**：
- 每个动作左侧圆形勾选框，扁平描边、无阴影（项目 UI 约定）。
- 点击乐观更新，失败回滚。
- 顶部进度条接今日完成度；标题栏显示日期。
- 现有死文本 `已完成 / 待完成`（`PlansPage.tsx:87`）替换为真交互。

**喂给 AI**：把最近 7 天打卡完成率写进 `memory.activePlanSummary`。AI 下次问诊时能知道"这人这周只练了 2 天"，据此调整计划，而不是假设完美执行。

---

## 阶段 D：洗库 + 重建膝关节康复动作库

### D1. 删

`exercise-library.generated.ts`（1.2MB / 1112 个健身动作）整个删除，`platform.ts` 移除 import。附带收益：每次写盘不再序列化这 1.2MB。

注：该文件的生成脚本不在仓库里，只有产物。新库直接手写维护，不再走生成流程。

### D2. 建

新建 `apps/api/src/action-library.seed.ts`，手写约 45 个膝关节康复动作，全中文、结构化，按阶段覆盖：

1. **镇痛与激活** — 股四头肌等长收缩、直腿抬高、踝泵、臀桥等
2. **活动度与拉伸** — 足跟滑动屈膝、俯卧垂腿伸膝、坐姿腘绳肌拉伸、俯卧股四头肌拉伸、小腿三头肌拉伸、髂胫束拉伸等
3. **力量（膝周 + 邻近关节）** — 靠墙静蹲、腘绳肌离心、蚌式、侧卧髋外展、单腿硬拉、提踵等
4. **神经肌肉控制与平衡** — 单腿站、台阶控制下落等
5. **回归活动** — 分腿蹲、上下台阶、慢跑渐进等

`ActionLibraryItem` 扩展字段：

| 字段 | 说明 |
|---|---|
| `targetMuscles: string[]` | 目标肌群（中文） |
| `actionType` | `stretch` / `strength` / `activation` / `mobility` / `balance` |
| `bodyRegions: BodyRegion[]` | 多归属。腘绳肌拉伸同时属于 knee 和 hip——单归属正是缺陷 2 的根源 |
| `source: "seed" \| "ai"` | 便于日后筛出"AI 生成、未人工审、未录视频"的动作 |
| `videoUrl?: string` | 为后续录制视频预留 |

保留原 `bodyRegion` 单值字段作为主归属，向后兼容现有过滤逻辑。

### D3. 其他部位类目

肩 / 腰背 / 髋 / 踝四个类目保持开放。库里没有动作时，AI 按格式现场生成并落库积累（`resolveRecommendedActions` 的生成分支已具备此能力，`actionLibrary` 已在持久化白名单内，`mergeSeedWins` 会把磁盘上的新条目增量并回）。

### D4. 生产数据迁移（必须做，否则白洗）

`storage.ts` 的 `mergeSeedWins` 是增量合并：磁盘上多出来的条目会被并回内存。所以那 1112 个已写入 `platform-state.json` 的健身动作，**光删代码删不掉**。

需要一次性脚本，清掉数据文件里 `tags` 含 `exercise-library` 的 `actionLibrary` 条目。

已存在的用户计划不受影响——计划的 item 自带 title / instructions，是快照而非对库的引用。

**风险控制**：这一步动生产数据文件，按项目规矩属于高风险变更。跑迁移前先备份 `platform-state.json`，并等用户确认时间窗口。

---

## 实施顺序

A → B → C → D。A / B / C 都不依赖新库，可独立发布。D 最后做，且需要单独的部署确认。
