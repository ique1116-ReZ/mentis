# Mentis 开发文档

> 一句话：面向 C 端运动康复用户的 AI Agent 平台，用户先跟 AI 做引导式问诊 / 出康复训练计划，需要时再转给真人康复师做付费远程会诊；另有康复师端和管理员端。产品当前先跑通「膝盖」这条闭环。

这份文档是给「下次直接看这个就懂项目」用的。部署细节不在这里重复，见文末「部署」一节直接指到 `infra/`。

---

## 1. 技术栈与仓库结构

npm workspaces 单仓（monorepo），TypeScript 全栈，前端 React 19 + Vite，后端是**零框架的 Node 原生 `http` server**（没有 Express 之类）。

```
Mentis AI Agent/
├── packages/
│   └── domain/          @mentis/domain — 纯类型 + 领域模型/临床规则，前后端共享
├── apps/
│   ├── api/             @mentis/api — 后端 HTTP 服务（Node 原生 http，端口 3001）
│   ├── web/             @mentis/web — React 前端（Vite，dev 端口 5173）
│   └── ai-service/      ⚠️ 遗留/废弃：只剩 Python __pycache__，无源码、无任何地方引用。
│                          真正的 LLM 调用在 apps/api（见下）。可忽略，别照着它开发。
├── infra/               部署（systemd + nginx + GitHub Pages），见文末
├── docs/                architecture.md（几乎空）+ superpowers/ 下的历史 plan/spec
├── .env.local           本地 LLM key（DASHSCOPE_*），git 忽略
└── package.json         workspaces 根，脚本见下
```

**根脚本**（`package.json`）：
- `npm run build` — 依次 build domain → api → web
- `npm test` — 依次跑三个包的 vitest
- `npm run dev:api` — `tsx src/server.ts` 起后端
- `npm run dev:web` — `vite --host 127.0.0.1` 起前端

构建顺序有依赖：`@mentis/domain` 必须先 build，api/web 才能解析到它的 `dist`。

---

## 2. 三端角色

同一个后端 + 同一个前端 App 承载三种登录角色（`user` / `clinician` / `admin`），前端按角色渲染不同界面：

- **患者端（user）**：`App.tsx` 主体。选部位分类 → AI 引导问诊 → 生成/维护训练计划 → 预约康复师会诊。
- **康复师端（clinician）**：`ClinicianDashboard.tsx`。看排班/会诊、给患者开正式训练计划。注册后 `credentialStatus` 为 `pending`，需管理员审核。
- **管理员端（admin）**：`AdminDashboard.tsx`。审核康复师资质、控制是否进公开目录。

注册需邀请码，当前硬编码为 `ique1116`（`auth.ts`）。

---

## 3. 后端（apps/api）

### 3.1 形态
- 入口 `src/server.ts`：一个大 `createServer` 回调，用 `if (method && url.pathname.match(...))` 顺序匹配路由。加路由就在这里加分支。
- `src/index.ts` 把各模块 re-export，`server.ts` 从 `./index.js` 统一 import。
- 监听 `127.0.0.1:${PORT ?? 3001}`，只绑本地回环——**生产靠 nginx 反代**，Node 不直接对外。
- 模块划分（都是纯函数 + 一个 in-memory `PlatformDemo` 状态对象）：
  - `platform.ts` — 种子数据、康复分类 `REHAB_CONSULT_CATEGORIES`、CORS 逻辑
  - `auth.ts` — 登录/注册/会话（bearer token → `demoSessions`），会话 TTL 30 天
  - `memory.ts` — 用户「记忆」（病例摘要、训练计划、事件时间线）
  - `consultations.ts` — 会诊全流程（排班、预约、消息、康复师开计划、患者接受/拒绝、支付字段）
  - `assessments.ts` — 结构化评估工作流（triage 分诊 → AI 草稿 → 转诊建议）
  - `chat.ts` — LLM 网关（见 3.3）
  - `rag.ts` — 本地 RAG 证据检索（见 3.4）
  - `storage.ts` — 状态持久化（见 3.2）
  - `helpers.ts` — 密码散列、错误构造（`badRequest/unauthorized/...`）、工具
  - `types.ts` — API 层类型
  - `action-library.seed.ts` — 手写的膝关节康复动作种子库（46 条）。改动作内容直接改这里。

### 3.2 状态与持久化
- 运行时全部状态在内存里的一个 `PlatformDemo` 对象（users / clinicians / consultations / userMemories / trainingPlans / auditEvents 等）。**没有数据库。**
- `storage.ts` 把它序列化成一个 JSON 文件（`MENTIS_DATA_FILE`，生产为 `/opt/mentis-rehab-platform/data/platform-state.json`），写入是 debounce 500ms + 临时文件 rename 原子替换。
- 启动时 `hydrateFromDisk` 把磁盘状态叠加到新种子上：**实体集合（用户/会诊等）以磁盘为准**（保留真实运行数据），**凭据和动作库以种子/代码为准**（让 env 和代码更新继续生效），磁盘里多出来的条目再增量并进来。改这套合并策略前先读 `storage.ts` 的注释。

### 3.3 LLM（真正的 AI 在这里，不在 ai-service）
- `chat.ts` 的 `QwenChatClient` 直接调**阿里云 DashScope 的 OpenAI 兼容接口**（`qwen3.7-plus`）。
- 需要 `DASHSCOPE_API_KEY` / `DASHSCOPE_MODEL` / `DASHSCOPE_TIMEOUT_MS`（本地放 `.env.local`，生产放 systemd drop-in）。没有 key 会抛 `UpstreamChatError`。
- 引导式问诊会把 RAG 证据、动作库、用户记忆拼进上下文（`ChatContext`），返回结构化的 `GuidedChatResult`（可带 `question` / `options` / `planPatch` / `recommendedActions`）。
- 有本地安全兜底：某些危险信号先由 `buildLocalSafetyResponse` 拦截，不进 LLM。

### 3.4 RAG
- `rag.ts` 是**纯本地、无外部向量库**：读一个 JSON chunk 索引，做 TF/词频 + 余弦相似度打分。
- 需要 `MENTIS_RAG_INDEX_PATH` 指向索引文件；**没配就直接禁用**（只 warn 一次，不报错）。
- 当前只对 `category === "knee"` 生效——和「先跑膝盖闭环」的产品定位一致。

### 3.5 认证与安全
- 密码用 `scrypt` + 随机盐散列（`helpers.ts`，格式 `scrypt:salt:hash`，`timingSafeEqual` 校验）。
- 登录发 bearer token（存 `demoSessions`），受保护路由都要带；`/health`、`/v1/auth/login`、`/v1/auth/register` 是公开的，SSE 的 `.../events` 允许 query token。
- 生产（`NODE_ENV=production`）**强制**要求 `MENTIS_CLINICIAN_DEMO_*` 和 `MENTIS_ADMIN_DEMO_*`，用内置 dev 默认密码会拒绝启动。
- CORS 由 `resolveCorsOrigin` 按 `WEB_ORIGINS` 白名单控制。

### 3.6 实时
- 会诊消息走 **SSE**（`/v1/consultations/:id/events`，`writeSse`），前端用 `EventSource`。

### 3.7 主要路由（前缀 `/v1`，全在 server.ts）
- `POST /auth/login`、`POST /auth/register`
- `GET /clinicians`、`GET /admin/clinicians`、`POST /admin/clinicians/:id/review`
- `GET/POST /clinicians/:id/availability`、`GET /clinicians/:id/consultations`
- `POST /consultations`、`GET /users/:id/consultations`、`GET /consultations/:id`
- `POST /consultations/:id/join` `/messages` `/plans` `/events`
- `POST /plans/:id/accept` `/decline`
- `GET /action-library`
- `GET/POST/DELETE /users/:id/memory[/cases[/:id]][/training-plans]`
- `POST /assessments`、`POST /chat`
- `GET /health`（公开）

---

## 4. 前端（apps/web）

- React 19 + Vite，入口 `src/main.tsx` → `App.tsx`（患者端主逻辑，含分类选择、聊天、计划、会诊面板）。
- 角色分派：`ClinicianDashboard.tsx` / `AdminDashboard.tsx`。
- 组件在 `src/components/`（LoginScreen、CategoryChooser、ConsultationPanel、PlansPage、RecordsPage、MessageBubble 等）。
- API 地址来自 `API_BASE`（`apiBase.ts`），由构建期环境变量 `VITE_API_BASE` 注入（生产 `https://api.aimentis.site`）。
- 会话存本地（`authSession.ts`），启动时校验。
- 单元测试 vitest：`apiError.test.ts`、`authSession.test.ts`、`MessageBubble.test.tsx`。
- UI 风格：扁平描边，**不要投影/阴影**。

---

## 5. 本地开发

```bash
npm ci
npm run build -w @mentis/domain     # 必须先 build 共享包
npm run dev:api                     # 后端 http://127.0.0.1:3001
npm run dev:web                     # 前端 http://127.0.0.1:5173
```

- 前端默认把请求打到 `VITE_API_BASE`，本地联调时确保它指向 `http://127.0.0.1:3001`（或让 web 的默认值生效）。
- LLM 要能用：把 `DASHSCOPE_API_KEY` 放进根 `.env.local`（已 git 忽略，`chat.ts` 会 `loadLocalEnv` 读取）。
- 跑测试：`npm test`（三个包）。

---

## 6. 部署（详见 infra/）

**部署方法已经写好，权威文档是 `infra/DEPLOY.md`（日常发布）和 `infra/server/README.md`（新服务器一次性 bootstrap）。下面只是速查，坐标/命令以那两个文件为准。**

坐标：
- **Web**：GitHub Pages，域名 `aimentis.site` / `www.aimentis.site`。
- **API**：`43.167.196.40`（DNS `api.aimentis.site`），nginx + HTTPS 反代到本地 Node:3001，跑 `systemd` 服务 `mentis-api`，应用以非特权用户 `mentis` 运行。
- **SSH**：`ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40`（私钥只在本机，绝不入库/入聊天）。
- **仓库**：`github.com/ique1116-ReZ/mentis`，默认分支 `main`。

前端发布（全自动）：
```bash
git push origin main    # 触发 .github/workflows/deploy-web.yml，build @mentis/web 并发到 GitHub Pages
```

后端发布（release 目录 + symlink 切换，不是原地 git pull）：
- 在服务器 `/opt/mentis-rehab-platform/` 下每次 clone 一个 `releases/<时间戳>-<shortsha>/`，`npm ci` + build domain/api，再把 `current` 软链指过去，`systemctl restart mentis-api`。
- 数据文件 `data/platform-state.json` **在 releases/ 之外**，切版本不丢数据。
- 回滚只需把 `current` 软链指回上一个 release 再 restart（旧目录原封不动，无需重建）。
- 完整命令直接照抄 `infra/DEPLOY.md` 的「Backend deploy」段。

生产必需 env（systemd drop-in，别 commit）：`DASHSCOPE_API_KEY/MODEL/TIMEOUT_MS`、`MENTIS_DEMO_*`、`MENTIS_CLINICIAN_DEMO_*`、`MENTIS_ADMIN_DEMO_*`、`MENTIS_DATA_FILE`（指向 releases 外的持久路径）。改完 drop-in 要 `daemon-reload` 再 restart。

部署完成自检（照 `infra/DEPLOY.md` 末尾清单）：
1. `curl https://api.aimentis.site/health` → `{"ok":true,...}`
2. 未认证访问受保护路由 → `401`（不是 200，确认鉴权没退化）
3. `https://aimentis.site/` → `200` 且 JS bundle 文件名变了
4. `systemctl status mentis-api` 为 `active (running)` 且启动时间是刚才（确认真的重启了）

---

## 7. 约定 / 坑

- **动作库数据源**是手写的 `action-library.seed.ts`。原来那份 1112 条健身动作的生成文件已删除（生成脚本本就不在仓库里，删了不损失任何可恢复的东西）。AI 现场生成的动作会以 `source: "ai"` 落库积累。
- **ai-service（Python）是死代码**，只剩 pyc，无引用。AI 全在 `apps/api/chat.ts`，别被误导。
- **RAG 当前只对膝盖生效**，且没配 `MENTIS_RAG_INDEX_PATH` 就静默禁用。
- 后端无数据库，全靠单个 JSON 文件持久化——涉及数据结构变更时注意 `storage.ts` 的种子/磁盘合并策略。
- 生产用内置 dev 默认密码会拒绝启动，这是有意的。
- git `main` 有时落后线上（rsync/release 部署 + 不勤 commit），动手前先 `git status`。
