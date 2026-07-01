import { describe, expect, it } from "vitest";
import {
  authenticateDemoUser,
  buildChatSystemPrompt,
  buildGuidedChatResponse,
  chatWithQwen,
  createPlatformDemo,
  registerDemoUser,
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

describe("auth and registration", () => {
  it("only allows ique1116 to register with profile data", () => {
    const platform = createPlatformDemo();

    const session = registerDemoUser(platform, {
      username: "ique1116",
      password: "secret",
      displayName: "ReZ",
      heightCm: "175",
      weightKg: "68",
      sportLevel: "中级跑者",
      weeklyFrequency: "4-5 次",
      primaryGoal: "安全恢复跑步",
    });

    expect(session.user.id).toBe("user_ique1116");
    expect(session.user.displayName).toBe("ReZ");
    expect(session.user.profile).toMatchObject({
      heightCm: "175",
      weightKg: "68",
      sportLevel: "中级跑者",
      weeklyFrequency: "4-5 次",
      primaryGoal: "安全恢复跑步",
    });
    expect(session.memory.notes).toContain("中级跑者，每周训练 4-5 次，目标是安全恢复跑步。");

    const loginSession = authenticateDemoUser(platform, { username: "ique1116", password: "secret" });
    expect(loginSession.user.id).toBe("user_ique1116");
  });

  it("rejects registration for non-allowlisted usernames", () => {
    const platform = createPlatformDemo();

    expect(() =>
      registerDemoUser(platform, {
        username: "someone_else",
        password: "secret",
        displayName: "Other",
        heightCm: "180",
        weightKg: "72",
        sportLevel: "初级",
        weeklyFrequency: "2 次",
        primaryGoal: "恢复训练",
      }),
    ).toThrow("Registration is currently limited to ique1116");
  });
});

describe("Qwen chat client", () => {
  it("uses concise no-markdown style rules in the rehab chat prompt", () => {
    const prompt = buildChatSystemPrompt({ category: "ankle" });

    expect(prompt).toContain("不要使用 Markdown");
    expect(prompt).toContain("一次只问一个主要问题");
    expect(prompt).toContain("优先给出可点击选项");
    expect(prompt).toContain("Mentis 特调的 AI 康复模型");
    expect(prompt).toContain("不要提及千问");
  });

  it("builds guided ankle assessment options before giving training advice", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "昨天崴脚了，今天有点肿" }],
      { category: "ankle" },
      "**第一步**：请先排查红旗症状。",
    );

    expect(guided.assessmentStep).toBe("ankle_weight_bearing");
    expect(guided.question).toBe("现在能连续走 4 步吗？");
    expect(guided.options?.map((option) => option.label)).toEqual(["能", "不能", "不确定"]);
    expect(guided.content).not.toMatch(/\*\*|#{1,6}\s|\|/);
    expect(guided.planPatch).toBeUndefined();
  });

  it("builds guided knee assessment options as a single next question", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "跑步后膝盖肿了，上下楼疼" }],
      { category: "knee" },
    );

    expect(guided.assessmentStep).toBe("knee_weight_bearing");
    expect(guided.question).toBe("现在能正常承重走路吗？");
    expect(guided.options?.map((option) => option.label)).toEqual(["能", "不能", "不确定"]);
    expect(guided.content.split("\n").filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("does not create plan patches when red flag answers require offline assessment", () => {
    const guided = buildGuidedChatResponse(
      [
        { role: "user", content: "昨天崴脚了，今天有点肿" },
        { role: "assistant", content: "先确认能不能走。" },
        { role: "user", content: "不能" },
      ],
      { category: "ankle" },
    );

    expect(guided.assessmentStep).toBe("ankle_urgent_referral");
    expect(guided.content).toContain("线下评估");
    expect(guided.planPatch).toBeUndefined();
  });

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

  it("wraps model content with guided assessment fields for the chat UI", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "**第一步**：先确认能不能走。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "跑步后脚踝外侧疼" }],
      { category: "ankle" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.content).not.toContain("**");
    expect(result.question).toBe("现在能连续走 4 步吗？");
    expect(result.options?.length).toBe(3);
    expect(result.planPatch).toBeUndefined();
  });

  it("returns local guided options for acute ankle screening without waiting for the model", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "模型不应被调用" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "昨天崴脚了，今天有点肿" }],
      { category: "ankle" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(0);
    expect(result.assessmentStep).toBe("ankle_weight_bearing");
    expect(result.question).toBe("现在能连续走 4 步吗？");
    expect(result.options?.map((option) => option.label)).toEqual(["能", "不能", "不确定"]);
  });

  it("returns local urgent guidance for red flag option answers without waiting for the model", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "模型不应被调用" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [
        { role: "user", content: "昨天崴脚了，今天有点肿" },
        { role: "assistant", content: "现在能连续走 4 步吗？" },
        { role: "user", content: "不能" },
      ],
      { category: "ankle" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(0);
    expect(result.assessmentStep).toBe("ankle_urgent_referral");
    expect(result.content).toContain("线下评估");
    expect(result.planPatch).toBeUndefined();
  });

  it("answers model identity questions locally without exposing the provider", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "不应调用模型" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "你用的是什么大模型？" }],
      { category: "knee" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(0);
    expect(result.content).toBe("我使用的是 Mentis 特调的 AI 康复模型。");
    expect(result.content).not.toMatch(/千问|Qwen|DashScope|OpenAI|DeepSeek/);
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
