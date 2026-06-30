import { describe, expect, it } from "vitest";
import {
  chatWithQwen,
  createPlatformDemo,
  runAssessmentWorkflow,
  QwenChatClient,
  resolveCorsOrigin,
  type RehabConsultCategory,
} from "../src/index";

describe("business API orchestration", () => {
  it("routes safe user assessment to AI rehab draft and expert referral option", async () => {
    const platform = createPlatformDemo();

    const result = await runAssessmentWorkflow(platform, {
      userId: "user_1",
      bodyRegion: "knee",
      conditionFocus: "patellofemoral_pain",
      painScore: 4,
      durationDays: 28,
      symptoms: ["跑步下坡痛"],
      trainingLoad: "每周跑量 35km",
    });

    expect(result.triage.level).toBe("self_management_with_review_option");
    expect(result.aiDraft.plan.stages[0].name).toBe("镇痛与负荷管理");
    expect(result.referral.available).toBe(true);
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      "assessment_submitted",
      "ai_rehab_draft_created",
    ]);
  });

  it("blocks rehab plan generation when urgent red flags are present", async () => {
    const platform = createPlatformDemo();

    const result = await runAssessmentWorkflow(platform, {
      userId: "user_1",
      bodyRegion: "knee",
      conditionFocus: "running_knee_pain",
      painScore: 9,
      durationDays: 0,
      symptoms: ["严重外伤", "无法承重"],
      trainingLoad: "比赛摔倒后",
    });

    expect(result.triage.level).toBe("urgent_referral");
    expect(result.aiDraft).toBeNull();
    expect(result.referral.reason).toContain("红旗");
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      "assessment_submitted",
      "urgent_referral_triggered",
    ]);
  });
});

describe("Qwen chat client", () => {
  it("calls DashScope compatible chat API without exposing the API key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "先把跑步暂停到可耐受范围，并观察 24 小时疼痛反应。" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new QwenChatClient({
      apiKey: "secret-key",
      model: "qwen3.7-plus",
      fetcher,
    });

    const result = await client.chat([
      { role: "user", content: "膝盖跑步后疼，今天还能跑吗？" },
    ]);

    expect(result.content).toContain("24 小时");
    expect(calls[0].url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect(calls[0].init.body).not.toContain("secret-key");
    expect(calls[0].init.body).toContain("qwen3.7-plus");
  });

  it("fails safely when the DashScope key is missing", async () => {
    const client = new QwenChatClient({ apiKey: "" });

    await expect(client.chat([{ role: "user", content: "你好" }])).rejects.toThrow("DASHSCOPE_API_KEY");
  });

  it("scopes answers to the selected rehab category without pretending RAG is enabled", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: "请描述膝盖症状。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher });

    await client.chat([{ role: "user", content: "肩膀也疼，可以一起问吗？" }], { category: "knee" });

    const body = JSON.parse(String(calls[0].init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toContain("当前咨询类别：膝盖");
    expect(systemPrompt).toContain("只围绕膝盖");
    expect(systemPrompt).toContain("不要编造 RAG 引用");
  });

  it("can receive future RAG snippets in the chat context", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: "可先降低负荷。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher });

    await client.chat([{ role: "user", content: "还能跑吗？" }], {
      category: "knee",
      ragContext: [
        {
          source: "Patellofemoral Pain 2019 LOGO.pdf",
          page: 20,
          text: "Monitor pain during and 24 hours after activity.",
        },
      ],
    });

    const body = JSON.parse(String(calls[0].init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0].content).toContain("Patellofemoral Pain 2019 LOGO.pdf, page 20");
    expect(body.messages[0].content).toContain("Monitor pain during and 24 hours after activity.");
  });

  it("aborts slow DashScope requests instead of hanging the chat UI", async () => {
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")));
      });
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher, timeoutMs: 1 });

    await expect(client.chat([{ role: "user", content: "你好" }], { category: "ankle" })).rejects.toThrow(
      "DashScope chat timed out",
    );
  });
});

describe("chat orchestration", () => {
  it("passes category context into the chat client", async () => {
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(body.messages[0].content).toContain("当前咨询类别：脚踝");
      return new Response(JSON.stringify({ choices: [{ message: { content: "先记录脚踝疼痛位置。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "跑步后脚踝疼" }],
      { category: "ankle" satisfies RehabConsultCategory },
      { apiKey: "secret-key", fetcher },
    );

    expect(result.content).toContain("脚踝");
  });
});

describe("CORS origin resolution", () => {
  it("allows localhost dev server ports without opening arbitrary origins", () => {
    expect(resolveCorsOrigin("http://127.0.0.1:5174")).toBe("http://127.0.0.1:5174");
    expect(resolveCorsOrigin("http://localhost:5179")).toBe("http://localhost:5179");
    expect(resolveCorsOrigin("https://example.com")).toBe("http://127.0.0.1:5173");
  });
});
