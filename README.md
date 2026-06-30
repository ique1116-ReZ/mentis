# Mentis Rehab Platform

运动康复 AI Agent 平台第一版工程骨架：B2C 用户平台、专家协作网络，以及未来机构工作台的多租户基础。

## What Is Implemented

- `packages/domain`: 共享领域模型、安全红旗规则、康复草案、证据引用排序、多租户病例访问和审计事件。
- `apps/api`: Node/NestJS-style 业务服务骨架，包含用户评估工作流、专家转诊和审计事件。
- `apps/ai-service`: Python AI/RAG 服务骨架，包含红旗分诊、非诊断康复草案、Qwen/DeepSeek 路由和现有本地 RAG 适配器。
- `apps/web`: 响应式 Web 工作台，覆盖用户病例、AI 评估、RAG 证据、康复计划、专家咨询和机构承接入口。
- `infra`: 本地 Postgres/MinIO 基础设施草案。

## Run

```bash
npm install --cache .npm-cache
npm test
npm run build
npm run dev:web
```

Web app:

```text
http://127.0.0.1:5173/
```

API service:

```bash
npm run dev:api
curl http://127.0.0.1:3001/health
```

AI service package tests:

```bash
PYTHONPATH=apps/ai-service python3 -m unittest discover -s apps/ai-service/tests -p 'test_*.py'
```

## Current Product Boundary

AI 输出是康复教育、风险分层、病例摘要和康复计划草案，不直接下诊断、不替代医生/康复师、不解释术后限制为正式医嘱。红旗风险优先触发线下就医或专家转诊。

