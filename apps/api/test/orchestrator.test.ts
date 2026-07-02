import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  acceptConsultationPlan,
  authenticateDemoUser,
  buildChatSystemPrompt,
  buildChatRagContext,
  buildGuidedChatResponse,
  chatWithQwen,
  createClinicianPlanForConsultation,
  createConsultationSession,
  createPlatformDemo,
  deleteRememberedCase,
  declineConsultationPlan,
  getClinicianConsultations,
  getConsultationSnapshot,
  joinConsultationSession,
  listActionLibrary,
  rememberCase,
  rememberTrainingPlan,
  registerDemoUser,
  runAssessmentWorkflow,
  searchLocalRag,
  sendConsultationMessage,
  QwenChatClient,
  resolveCorsOrigin,
  type RegistrationInput,
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
  it("allows registration for any username with the invite code and basic body metrics", () => {
    const platform = createPlatformDemo();

    const session = registerDemoUser(platform, {
      username: "new_runner",
      password: "secret",
      displayName: "ReZ",
      inviteCode: "ique1116",
      heightCm: "175",
      weightKg: "68",
    });

    expect(session.user.id).toBe("user_new_runner");
    expect(session.user.displayName).toBe("ReZ");
    expect(session.user.profile).toMatchObject({
      heightCm: "175",
      weightKg: "68",
    });
    expect(session.user.profile).not.toHaveProperty("sportLevel");
    expect(session.user.profile).not.toHaveProperty("weeklyFrequency");
    expect(session.user.profile).not.toHaveProperty("primaryGoal");
    expect(session.memory.notes).toEqual([]);

    const loginSession = authenticateDemoUser(platform, { username: "new_runner", password: "secret" });
    expect(loginSession.user.id).toBe("user_new_runner");
  });

  it("rejects registration without the required invite code", () => {
    const platform = createPlatformDemo();

    expect(() =>
      registerDemoUser(platform, {
        username: "someone",
        password: "secret",
        displayName: "Other",
        inviteCode: "wrong-code",
        heightCm: "180",
        weightKg: "72",
      }),
    ).toThrow("Invalid invite code");
  });

  it("rejects runtime-shaped registration input with a controlled missing invite error", () => {
    const platform = createPlatformDemo();

    expect(() =>
      registerDemoUser(platform, {
        username: "missing_invite",
        password: "secret",
        displayName: "No Invite",
        heightCm: "180",
        weightKg: "72",
      } as RegistrationInput),
    ).toThrow("Invalid invite code");
  });
});

describe("consultation orchestration", () => {
  it("authenticates a demo clinician into the clinician role", () => {
    const platform = createPlatformDemo();

    const session = authenticateDemoUser(platform, {
      username: "clinician_demo",
      password: "mentis_clinician",
    });

    expect(session.user.id).toBe("clinician_1");
    expect(session.user.role).toBe("clinician");
    expect(session.user.displayName).toBe("李康复师");
    expect(session.memory.cases).toEqual([]);
    expect(session.memory.trainingPlans).toEqual([]);
  });

  it("registers patients and pending clinicians through the same auth endpoint", () => {
    const platform = createPlatformDemo();

    const patient = registerDemoUser(platform, {
      username: "patient_new",
      password: "secret",
      displayName: "新患者",
      inviteCode: "ique1116",
      heightCm: "176",
      weightKg: "70",
    });

    const clinician = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "clinician_new",
      password: "secret",
      displayName: "新康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      discipline: "运动康复师",
      credentialSummary: "三年跑步损伤康复经验",
      specialties: [" knee ", "running", ""],
      organizationName: "个人执业",
    });

    expect(patient.user.role).toBe("user");
    expect(clinician.user.role).toBe("clinician");
    expect(clinician.user).toMatchObject({
      credentialStatus: "pending",
      specialties: ["knee", "running"],
    });
    expect(clinician.memory.notes).toEqual([]);
    expect(getClinicianConsultations(platform, clinician.user.id)).toHaveLength(0);
  });

  it("does not assign consultations to pending clinicians", () => {
    const platform = createPlatformDemo();
    const clinician = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "pending_assignment",
      password: "secret",
      displayName: "待审核康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      specialties: ["knee"],
    });

    expect(() =>
      createConsultationSession(platform, {
        patientUserId: "user_1",
        clinicianId: clinician.user.id,
        caseId: "case_demo",
        scheduledStartAt: "2026-07-02T02:00:00.000Z",
        scheduledEndAt: "2026-07-02T02:30:00.000Z",
      }),
    ).toThrow("Consultation clinician must be verified");
  });

  it("creates paid sessions and shows clinicians only their assigned consultations", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    expect(session.paymentStatus).toBe("paid");
    expect(session.durationMinutes).toBe(15);
    expect(getClinicianConsultations(platform, "clinician_1").map((candidate) => candidate.id)).toEqual([
      session.id,
    ]);
    expect(getClinicianConsultations(platform, "clinician_missing")).toHaveLength(0);
  });

  it("activates chat only after clinician and patient join, then validates message timestamps", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    const patientWaiting = joinConsultationSession(platform, session.id, "user_1", "user", "2026-07-02T02:01:00.000Z");
    expect(patientWaiting.status).toBe("waiting_clinician");
    expect(() =>
      sendConsultationMessage(platform, session.id, {
        senderId: "user_1",
        senderRole: "user",
        content: "先发一条会被拦截。",
        createdAt: "2026-07-02T02:01:30.000Z",
      }),
    ).toThrow("Consultation chat is not active");

    const active = joinConsultationSession(
      platform,
      session.id,
      "clinician_1",
      "clinician",
      "2026-07-02T02:02:00.000Z",
    );
    expect(active.status).toBe("active");
    expect(active.expiresAt).toBe("2026-07-02T02:17:00.000Z");

    const message = sendConsultationMessage(platform, session.id, {
      senderId: "user_1",
      senderRole: "user",
      content: "我今天下楼还是疼。",
      createdAt: "2026-07-02T02:03:00.000Z",
    });
    expect(message.content).toContain("下楼");

    expect(() =>
      sendConsultationMessage(platform, session.id, {
        senderId: "clinician_1",
        senderRole: "clinician",
        content: "超时消息不应发送。",
        createdAt: "2026-07-02T02:17:00.000Z",
      }),
    ).toThrow("Consultation chat is not active");
  });

  it("does not keep clinician presence when early activation fails", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    const patientEarly = joinConsultationSession(
      platform,
      session.id,
      "user_1",
      "user",
      "2026-07-02T01:58:00.000Z",
    );
    expect(patientEarly.status).toBe("waiting_clinician");

    expect(() =>
      joinConsultationSession(platform, session.id, "clinician_1", "clinician", "2026-07-02T01:59:00.000Z"),
    ).toThrow("Consultation can only be activated within its scheduled window");
    expect(platform.presence[session.id].clinicianPresent).toBe(false);

    const patientOnlyLater = joinConsultationSession(
      platform,
      session.id,
      "user_1",
      "user",
      "2026-07-02T02:01:00.000Z",
    );
    expect(patientOnlyLater.status).toBe("waiting_clinician");
  });

  it("does not expose system notices through public message creation", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    joinConsultationSession(platform, session.id, "user_1", "user", "2026-07-02T02:01:00.000Z");
    joinConsultationSession(platform, session.id, "clinician_1", "clinician", "2026-07-02T02:02:00.000Z");

    expect(() =>
      sendConsultationMessage(platform, session.id, {
        senderId: "system",
        senderRole: "system",
        content: "伪造系统消息",
        createdAt: "2026-07-02T02:03:00.000Z",
      }),
    ).toThrow("System messages must be created internally");
  });

  it("denies default snapshot access after authorization ends", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_historical",
      scheduledStartAt: "2000-01-01T00:00:00.000Z",
      scheduledEndAt: "2000-01-01T00:30:00.000Z",
    });
    const authorization = platform.caseAuthorizations.find((candidate) => candidate.consultationSessionId === session.id);
    if (!authorization) {
      throw new Error("Expected authorization fixture");
    }
    authorization.endsAt = "2000-01-02T00:00:00.000Z";

    expect(() => getConsultationSnapshot(platform, session.id, "user_1", "user")).toThrow(
      "Consultation access denied",
    );
  });

  it("lets a clinician send, accept, and decline plans without deleting source-separated plans", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });
    joinConsultationSession(platform, session.id, "user_1", "user", "2026-07-02T02:01:00.000Z");
    joinConsultationSession(platform, session.id, "clinician_1", "clinician", "2026-07-02T02:02:00.000Z");

    platform.trainingPlans.push({
      id: "plan_ai_existing",
      caseId: "case_demo",
      patientUserId: "user_1",
      source: "ai_generated",
      authorId: "assistant",
      authorRole: "assistant",
      status: "accepted",
      title: "AI 膝盖保守计划",
      dayLabel: "第 1 天",
      items: [{ title: "等长伸膝", meta: "3 组 x 30 秒", state: "todo" }],
      stage: {
        name: "镇痛与负荷管理",
        progressLabel: "第 1 周",
        progressPercent: 10,
        goals: ["疼痛可控"],
      },
      precautions: ["疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:00:00.000Z",
      acceptedAt: "2026-07-02T02:01:00.000Z",
    });

    const [action, declineAction] = listActionLibrary(platform);
    expect(action.bodyRegion).toBe("knee");

    const plan = createClinicianPlanForConsultation(platform, session.id, "clinician_1", {
      title: "康复师定制膝前痛计划",
      dayLabel: "第 1 天",
      actionIds: [action.id],
      precautions: ["训练中疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:12:00.000Z",
    });
    const declinedPlan = createClinicianPlanForConsultation(platform, session.id, "clinician_1", {
      title: "可选负荷进阶计划",
      dayLabel: "第 2 天",
      actionIds: [declineAction.id],
      precautions: ["急性肿胀时暂停"],
      progressionCriteria: ["可完成 4 组且次日无加重"],
      createdAt: "2026-07-02T02:13:00.000Z",
    });

    expect(plan.status).toBe("sent_to_patient");
    expect(plan.source).toBe("clinician_custom");
    expect(declineConsultationPlan(platform, declinedPlan.id, "user_1").status).toBe("declined");

    const accepted = acceptConsultationPlan(platform, plan.id, "user_1", "2026-07-02T02:20:00.000Z");
    const snapshot = getConsultationSnapshot(
      platform,
      session.id,
      "user_1",
      "user",
      "2026-07-04T02:20:00.000Z",
    );

    expect(accepted.status).toBe("accepted");
    expect(snapshot.plans.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(["plan_ai_existing", plan.id, declinedPlan.id]),
    );
    expect(snapshot.plans.find((candidate) => candidate.id === "plan_ai_existing")?.source).toBe("ai_generated");
    expect(snapshot.plans.find((candidate) => candidate.id === plan.id)?.source).toBe("clinician_custom");
    expect(snapshot.messages.some((message) => message.kind === "plan_offer")).toBe(true);
    expect(snapshot.actionLibrary).toHaveLength(2);
  });

  it("denies plan offers before activation and from pending clinicians", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });
    const [action] = listActionLibrary(platform);

    expect(() =>
      createClinicianPlanForConsultation(platform, session.id, "clinician_1", {
        title: "未激活计划",
        dayLabel: "第 1 天",
        actionIds: [action.id],
        precautions: [],
        progressionCriteria: [],
        createdAt: "2026-07-02T02:01:00.000Z",
      }),
    ).toThrow("Consultation has not been activated");

    const pending = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "pending_planner",
      password: "secret",
      displayName: "待审核康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      specialties: ["knee"],
    });
    platform.consultations.push({
      id: "consult_pending_fixture",
      patientUserId: "user_1",
      clinicianId: pending.user.id,
      caseId: "case_pending",
      status: "active",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      activatedAt: "2026-07-02T02:02:00.000Z",
      expiresAt: "2026-07-02T02:17:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    });
    platform.caseAuthorizations.push({
      id: "auth_pending_fixture",
      caseId: "case_pending",
      patientUserId: "user_1",
      clinicianId: pending.user.id,
      consultationSessionId: "consult_pending_fixture",
      scope: ["profile", "assessment_summary", "current_plans"],
      accessMode: ["read", "plan_create"],
      startsAt: "2026-07-02T02:00:00.000Z",
      endsAt: "2026-07-09T02:30:00.000Z",
      createdAt: "2026-07-02T01:50:00.000Z",
    });

    expect(() =>
      createClinicianPlanForConsultation(platform, "consult_pending_fixture", pending.user.id, {
        title: "待审核康复师计划",
        dayLabel: "第 1 天",
        actionIds: [action.id],
        precautions: [],
        progressionCriteria: [],
        createdAt: "2026-07-02T02:12:00.000Z",
      }),
    ).toThrow("Clinician cannot create plan for consultation");
  });

  it("only lets patients accept or decline plans awaiting confirmation", () => {
    const platform = createPlatformDemo();
    const basePlan = {
      caseId: "case_demo",
      patientUserId: "user_1",
      source: "clinician_custom" as const,
      authorId: "clinician_1",
      authorRole: "clinician" as const,
      title: "状态保护计划",
      dayLabel: "第 1 天",
      items: [{ title: "靠墙静蹲", meta: "4 组 x 20 秒", state: "todo" as const }],
      stage: {
        name: "负荷控制",
        progressLabel: "第 1 周",
        progressPercent: 10,
        goals: ["下楼疼痛下降"],
      },
      precautions: ["疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:12:00.000Z",
    };
    platform.trainingPlans.push(
      { ...basePlan, id: "plan_declined", status: "declined" },
      { ...basePlan, id: "plan_draft", status: "draft" },
      { ...basePlan, id: "plan_accepted", status: "accepted", acceptedAt: "2026-07-02T02:20:00.000Z" },
    );

    expect(() => acceptConsultationPlan(platform, "plan_declined", "user_1", "2026-07-02T02:21:00.000Z")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
    expect(() => acceptConsultationPlan(platform, "plan_draft", "user_1", "2026-07-02T02:21:00.000Z")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
    expect(() => acceptConsultationPlan(platform, "plan_accepted", "user_1", "2026-07-02T02:21:00.000Z")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
    expect(() => declineConsultationPlan(platform, "plan_accepted", "user_1")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
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

  it("asks knee pain location first when the complaint is non-traumatic extension pain", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "膝盖伸直的时候疼" }],
      { category: "knee" },
      "我先确认伸直时疼痛的具体位置。",
    );

    expect(guided.assessmentStep).toBe("knee_pain_location");
    expect(guided.question).toBe("伸直膝盖时，最明显疼痛位置在哪里？");
    expect(guided.options?.map((option) => option.label)).toEqual([
      "膝盖前方",
      "膝盖后方",
      "内侧",
      "外侧",
      "关节里面",
      "说不清",
    ]);
  });

  it("advances knee flow from weight-bearing answer to pain location options", () => {
    const guided = buildGuidedChatResponse(
      [
        { role: "user", content: "膝盖摔了一下，现在伸直疼" },
        {
          role: "assistant",
          content: "先确认一个安全问题。",
          assessmentStep: "knee_weight_bearing",
          question: "现在能正常承重走路吗？",
        },
        { role: "user", content: "能" },
      ],
      { category: "knee" },
      "好的，能伸直说明关节活动度还可以。那请问你伸直膝盖时，具体是哪里疼呢？",
    );

    expect(guided.assessmentStep).toBe("knee_pain_location");
    expect(guided.question).toBe("伸直膝盖时，最明显疼痛位置在哪里？");
    expect(guided.options?.map((option) => option.label)).toContain("膝盖前方");
    expect(guided.options?.map((option) => option.label)).not.toEqual(["能", "不能", "不确定"]);
  });

  it("offers a structured knee plan only after enough guided answers, then patches plan on acceptance", () => {
    const offer = buildGuidedChatResponse(
      [
        { role: "user", content: "膝盖伸直的时候疼" },
        { role: "assistant", content: "位置在哪里？", assessmentStep: "knee_pain_location" },
        { role: "user", content: "膝盖前方" },
        { role: "assistant", content: "疼痛评分？", assessmentStep: "knee_pain_score" },
        { role: "user", content: "4-6 分" },
        { role: "assistant", content: "哪些动作诱发？", assessmentStep: "knee_trigger" },
        { role: "user", content: "伸直和下楼疼" },
        { role: "assistant", content: "最近训练量？", assessmentStep: "knee_training_load" },
        { role: "user", content: "最近跑量增加了" },
      ],
      { category: "knee" },
    );

    expect(offer.assessmentStep).toBe("knee_plan_offer");
    expect(offer.question).toBe("要把这份膝盖保守运动处方加入今日计划吗？");
    expect(offer.options?.map((option) => option.label)).toEqual(["接受", "先不接受"]);
    expect(offer.planPatch).toBeUndefined();

    const accepted = buildGuidedChatResponse(
      [
        { role: "assistant", content: "要加入今日计划吗？", assessmentStep: "knee_plan_offer" },
        { role: "user", content: "接受" },
      ],
      { category: "knee" },
    );

    expect(accepted.assessmentStep).toBe("knee_plan_accepted");
    expect(accepted.planPatch?.title).toContain("膝盖");
    expect(accepted.planPatch?.items?.length).toBeGreaterThan(0);
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

  it("scopes answers to the selected rehab category and uses provided RAG evidence", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: "请描述膝盖症状。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher });

    await client.chat([{ role: "user", content: "肩膀也疼，可以一起问吗？" }], {
      category: "knee",
      ragContext: [
        {
          source: "Patellofemoral Pain 2019 LOGO.pdf",
          page: 20,
          text: "Exercise therapy and load management are recommended.",
        },
      ],
    });

    const body = JSON.parse(String(calls[0].init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toContain("当前咨询类别：膝盖");
    expect(systemPrompt).toContain("只围绕膝盖");
    expect(systemPrompt).toContain("可用 RAG 证据");
    expect(systemPrompt).toContain("Patellofemoral Pain 2019 LOGO.pdf, page 20");
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

  it("returns local guided knee assessment options without waiting for the model", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "模型不应被调用" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "膝盖伸直的时候疼" }],
      { category: "knee" },
      { apiKey: "", fetcher },
    );

    expect(fetchCalls).toBe(0);
    expect(result.content).toContain("疼痛位置");
    expect(result.assessmentStep).toBe("knee_pain_location");
    expect(result.question).toBe("伸直膝盖时，最明显疼痛位置在哪里？");
    expect(result.options?.map((option) => option.label)).toContain("膝盖前方");
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

describe("local RAG integration", () => {
  it("retrieves knee evidence from a local RAG index for chat context", () => {
    const dir = mkdtempSync(join(tmpdir(), "mentis-rag-"));
    const indexPath = join(dir, "index.json");
    writeFileSync(
      indexPath,
      JSON.stringify({
        version: 1,
        chunks: [
          {
            id: "ankle",
            source: "NATA ankle.pdf",
            text: "Acute ankle sprain should screen weight bearing.",
            start: 0,
            end: 52,
            metadata: { file: "NATA ankle.pdf", page: "4", title: "Ankle Guideline" },
          },
          {
            id: "knee",
            source: "Patellofemoral Pain 2019 LOGO.pdf",
            text: "Knee patellofemoral pain management uses exercise therapy and load management.",
            start: 0,
            end: 82,
            metadata: {
              file: "Patellofemoral Pain 2019 LOGO.pdf",
              page: "20",
              title: "Patellofemoral Pain Guideline",
              evidence_type: "clinical_practice_guideline",
            },
          },
        ],
      }),
      "utf-8",
    );

    const results = searchLocalRag("膝盖前方疼痛 exercise load", { indexPath, topK: 1 });

    expect(results[0]).toMatchObject({
      source: "Patellofemoral Pain 2019 LOGO.pdf",
      page: "20",
    });
    expect(results[0].text).toContain("load management");
  });

  it("builds chat RAG context from the latest user knee question", () => {
    const dir = mkdtempSync(join(tmpdir(), "mentis-rag-"));
    const indexPath = join(dir, "index.json");
    writeFileSync(
      indexPath,
      JSON.stringify({
        version: 1,
        chunks: [
          {
            id: "knee",
            source: "Front_Rehabil_Sci_2025_patellofemoral_pain_knee_extensor_training_review.pdf",
            text: "Knee extensor training can improve patellofemoral pain when progressed by symptoms.",
            start: 0,
            end: 95,
            metadata: { file: "knee_extensor_review.pdf", page: "3" },
          },
        ],
      }),
      "utf-8",
    );

    const context = buildChatRagContext([{ role: "user", content: "膝盖伸直的时候疼" }], "knee", {
      indexPath,
      topK: 1,
    });

    expect(context).toHaveLength(1);
    expect(context[0].text).toContain("Knee extensor training");
  });
});

describe("case memory deletion", () => {
  it("allows deleting draft consultation cases but locks accepted prescription cases", () => {
    const platform = createPlatformDemo();
    const userId = "user_1";
    platform.userMemories[userId].cases = [
      {
        id: "draft_case",
        categoryId: "knee",
        title: "伸直膝盖疼",
        summary: "待评估",
        status: "咨询中",
        createdAt: "07/01 10:21",
      },
      {
        id: "accepted_case",
        categoryId: "knee",
        title: "膝前痛计划",
        summary: "已接受运动处方",
        status: "运动处方已接受",
        createdAt: "07/01 10:30",
      },
    ];

    const afterDelete = deleteRememberedCase(platform, userId, "draft_case");
    expect(afterDelete.cases.map((patientCase) => patientCase.id)).toEqual(["accepted_case"]);

    expect(() => deleteRememberedCase(platform, userId, "accepted_case")).toThrow(
      "Accepted prescription cases cannot be deleted",
    );
  });
});

describe("training plan memory", () => {
  it("stores accepted exercise prescriptions in backend memory and locks the source case", () => {
    const platform = createPlatformDemo();
    const userId = "user_1";

    rememberCase(platform, userId, {
      id: "case_knee_1",
      categoryId: "knee",
      title: "膝盖伸直疼",
      summary: "膝盖前方疼，4-6 分",
      status: "咨询中",
      createdAt: "07/02 11:10",
    });

    const memory = rememberTrainingPlan(platform, userId, {
      id: "plan_case_knee_1",
      caseId: "case_knee_1",
      categoryId: "knee",
      title: "膝盖保守恢复计划",
      status: "active",
      dayLabel: "第 1 天",
      completionPercent: 0,
      items: [{ title: "温和膝关节活动", meta: "2 组 x 10 次", state: "todo" }],
      stage: {
        name: "镇痛与负荷管理",
        progressLabel: "起步观察期",
        progressPercent: 12,
        goals: ["疼痛不超过 3/10"],
      },
    });

    expect(memory.trainingPlans).toHaveLength(1);
    expect(memory.trainingPlans[0]).toMatchObject({
      id: "plan_case_knee_1",
      caseId: "case_knee_1",
      title: "膝盖保守恢复计划",
      status: "active",
    });
    expect(memory.cases.find((patientCase) => patientCase.id === "case_knee_1")?.status).toBe(
      "运动处方已接受",
    );
    expect(() => deleteRememberedCase(platform, userId, "case_knee_1")).toThrow(
      "Accepted prescription cases cannot be deleted",
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
