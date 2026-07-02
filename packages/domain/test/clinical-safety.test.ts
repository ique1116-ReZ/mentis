import { describe, expect, it } from "vitest";
import {
  assessRedFlags,
  activateConsultationSession,
  buildCaseAuthorization,
  buildInitialAssessment,
  canAccessAuthorizedCase,
  canAccessCase,
  canSendConsultationMessage,
  createAuditEvent,
  createTrainingPlan,
  draftKneeRunningPlan,
  expireConsultationSession,
  summarizeEvidence,
  type CaseRecord,
  type Clinician,
  type ConsultationSession,
  type Organization,
  type User,
} from "../src/index";

describe("clinical safety and case access", () => {
  it("escalates red-flag symptoms before generating rehab advice", () => {
    const assessment = buildInitialAssessment({
      bodyRegion: "knee",
      conditionFocus: "running_knee_pain",
      painScore: 8,
      durationDays: 1,
      symptoms: ["无法承重", "夜间持续加重疼痛"],
      trainingLoad: "half marathon block",
    });

    const triage = assessRedFlags(assessment);

    expect(triage.level).toBe("urgent_referral");
    expect(triage.matchedRedFlags).toEqual(["无法承重", "夜间持续加重疼痛"]);
    expect(triage.allowedAiActions).toEqual(["education", "prepare_clinician_summary"]);
    expect(triage.message).toContain("线下就医");
  });

  it("generates a non-diagnostic knee/running rehab draft when no red flags are present", () => {
    const assessment = buildInitialAssessment({
      bodyRegion: "knee",
      conditionFocus: "patellofemoral_pain",
      painScore: 4,
      durationDays: 28,
      symptoms: ["跑步下坡痛", "久坐后膝前痛"],
      trainingLoad: "每周跑量 35km",
    });

    const plan = draftKneeRunningPlan(assessment);

    expect(plan.disclaimer).toContain("不构成诊断");
    expect(plan.stages.map((stage) => stage.name)).toEqual([
      "镇痛与负荷管理",
      "负荷提升",
      "力量与功能期",
      "跑步回归",
    ]);
    expect(plan.redFlagGate).toBe("clear");
    expect(plan.progressionCriteria).toContain("疼痛 NPRS <= 3/10");
  });

  it("keeps organization access behind explicit user authorization", () => {
    const user: User = { id: "user_1", role: "user", displayName: "张运动" };
    const clinician: Clinician = {
      id: "clinician_1",
      role: "clinician",
      displayName: "李康复师",
      credentialStatus: "verified",
      specialties: ["knee", "running"],
    };
    const organization: Organization = {
      id: "org_1",
      role: "organization",
      displayName: "远翰运动康复中心",
      memberClinicianIds: [clinician.id],
    };
    const record: CaseRecord = {
      id: "case_1",
      ownerUserId: user.id,
      authorizedClinicianIds: [clinician.id],
      authorizedOrganizationIds: [],
      conditionFocus: "patellofemoral_pain",
      timeline: [],
    };

    expect(canAccessCase(user, record)).toBe(true);
    expect(canAccessCase(clinician, record)).toBe(true);
    expect(canAccessCase(organization, record)).toBe(false);

    const authorized = { ...record, authorizedOrganizationIds: [organization.id] };
    expect(canAccessCase(organization, authorized)).toBe(true);
  });

  it("records auditable sensitive-health-data events", () => {
    const event = createAuditEvent({
      actorId: "clinician_1",
      actorRole: "clinician",
      caseId: "case_1",
      action: "expert_review_submitted",
      metadata: { modelDraftId: "draft_1" },
    });

    expect(event.sensitiveDataCategory).toBe("medical_health");
    expect(event.action).toBe("expert_review_submitted");
    expect(event.metadata).toEqual({ modelDraftId: "draft_1" });
    expect(new Date(event.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("summarizes RAG evidence with citations and conflict policy", () => {
    const summary = summarizeEvidence([
      {
        source: "Patellofemoral Pain 2019 LOGO.pdf",
        page: 20,
        evidenceType: "clinical_practice_guideline",
        quote: "Exercise therapy is recommended.",
        score: 0.81,
      },
      {
        source: "Older protocol.pdf",
        page: 4,
        evidenceType: "protocol_or_presentation",
        quote: "Rest first.",
        score: 0.42,
      },
    ]);

    expect(summary.primaryCitation).toBe("Patellofemoral Pain 2019 LOGO.pdf, page 20");
    expect(summary.conflictPolicy).toContain("newer clinical guidelines");
    expect(summary.citations).toHaveLength(2);
  });

  it("limits clinician case access to explicit consultation authorization", () => {
    const authorization = buildCaseAuthorization({
      caseId: "case_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      consultationSessionId: "consult_1",
      scope: ["profile", "assessment_summary", "current_plans"],
      accessMode: ["read", "plan_create"],
      startsAt: "2026-07-02T02:00:00.000Z",
      endsAt: "2026-07-02T03:00:00.000Z",
    });

    const clinician: Clinician = {
      id: "clinician_1",
      role: "clinician",
      displayName: "李康复师",
      credentialStatus: "verified",
      specialties: ["knee"],
    };
    const otherClinician: Clinician = {
      id: "clinician_2",
      role: "clinician",
      displayName: "王医生",
      credentialStatus: "verified",
      specialties: ["shoulder"],
    };

    expect(canAccessAuthorizedCase(clinician, authorization, "case_1", "2026-07-02T02:30:00.000Z")).toBe(true);
    expect(canAccessAuthorizedCase(otherClinician, authorization, "case_1", "2026-07-02T02:30:00.000Z")).toBe(
      false,
    );
    expect(canAccessAuthorizedCase(clinician, authorization, "case_2", "2026-07-02T02:30:00.000Z")).toBe(false);
    expect(canAccessAuthorizedCase(clinician, authorization, "case_1", "2026-07-02T01:59:59.000Z")).toBe(false);
    expect(canAccessAuthorizedCase(clinician, authorization, "case_1", "2026-07-02T03:00:00.000Z")).toBe(false);
    expect(
      canAccessAuthorizedCase(
        clinician,
        { ...authorization, startsAt: "not-a-date" },
        "case_1",
        "2026-07-02T02:30:00.000Z",
      ),
    ).toBe(false);
    expect(
      canAccessAuthorizedCase(
        clinician,
        { ...authorization, endsAt: "not-a-date" },
        "case_1",
        "2026-07-02T02:30:00.000Z",
      ),
    ).toBe(false);
    expect(canAccessAuthorizedCase(clinician, authorization, "case_1", "not-a-date")).toBe(false);
    expect(
      canAccessAuthorizedCase(
        clinician,
        { ...authorization, startsAt: "2026-02-30T00:00:00.000Z" },
        "case_1",
        "2026-07-02T02:30:00.000Z",
      ),
    ).toBe(false);
    expect(canAccessAuthorizedCase(clinician, authorization, "case_1", "2026-02-30T00:00:00.000Z")).toBe(false);
    expect(
      canAccessAuthorizedCase(
        clinician,
        {
          ...authorization,
          startsAt: "2026-07-02T02:00:00.000Z",
          endsAt: "2026-07-02T02:00:00.000Z",
        },
        "case_1",
        "2026-07-02T02:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      canAccessAuthorizedCase(
        clinician,
        {
          ...authorization,
          startsAt: "2026-07-02T03:00:00.000Z",
          endsAt: "2026-07-02T02:00:00.000Z",
        },
        "case_1",
        "2026-07-02T02:30:00.000Z",
      ),
    ).toBe(false);
  });

  it("opens a 15 minute consultation when both parties are present", () => {
    const session: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "scheduled",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    const active = activateConsultationSession(session, "2026-07-02T02:03:00.000Z");

    expect(active.status).toBe("active");
    expect(active.activatedAt).toBe("2026-07-02T02:03:00.000Z");
    expect(active.expiresAt).toBe("2026-07-02T02:18:00.000Z");
    expect(canSendConsultationMessage(active, "2026-07-02T02:17:59.000Z")).toBe(true);
    expect(canSendConsultationMessage(active, "2026-07-02T02:18:00.000Z")).toBe(false);
  });

  it("rejects consultation activation when duration is invalid", () => {
    const session: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "scheduled",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    expect(() =>
      activateConsultationSession({ ...session, durationMinutes: 0 }, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Consultation duration must be positive");
    expect(() =>
      activateConsultationSession({ ...session, durationMinutes: -15 }, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Consultation duration must be positive");
    expect(() =>
      activateConsultationSession({ ...session, durationMinutes: Number.NaN }, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Consultation duration must be positive");
    expect(() =>
      activateConsultationSession(
        {
          ...session,
          status: "active",
          activatedAt: "2026-07-02T02:03:00.000Z",
          expiresAt: "2026-07-02T02:18:00.000Z",
          durationMinutes: 0,
        },
        "2026-07-02T02:10:00.000Z",
      ),
    ).toThrow("Consultation duration must be positive");
  });

  it("rejects consultation activation outside the scheduled window", () => {
    const session: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "scheduled",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    expect(() => activateConsultationSession(session, "2026-07-02T01:59:59.000Z")).toThrow(
      "Consultation can only be activated within its scheduled window",
    );
    expect(() => activateConsultationSession(session, "2026-07-02T02:30:00.000Z")).toThrow(
      "Consultation can only be activated within its scheduled window",
    );
    expect(() => activateConsultationSession(session, "2026-07-02T02:31:00.000Z")).toThrow(
      "Consultation can only be activated within its scheduled window",
    );
  });

  it("rejects consultation activation when schedule dates are invalid", () => {
    const session: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "scheduled",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    expect(() =>
      activateConsultationSession({ ...session, scheduledStartAt: "not-a-date" }, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Consultation schedule contains invalid dates");
    expect(() =>
      activateConsultationSession({ ...session, scheduledEndAt: "not-a-date" }, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Consultation schedule contains invalid dates");
    expect(() => activateConsultationSession(session, "not-a-date")).toThrow(
      "Consultation schedule contains invalid dates",
    );
    expect(() =>
      activateConsultationSession(
        {
          ...session,
          scheduledStartAt: "2026-02-30T00:00:00.000Z",
          scheduledEndAt: "2026-03-03T00:00:00.000Z",
        },
        "2026-03-02T00:00:00.000Z",
      ),
    ).toThrow("Consultation schedule contains invalid dates");
    expect(() =>
      activateConsultationSession(
        {
          ...session,
          scheduledStartAt: "2026-03-01T00:00:00.000Z",
          scheduledEndAt: "2026-03-03T00:00:00.000Z",
        },
        "2026-02-30T00:00:00.000Z",
      ),
    ).toThrow("Consultation schedule contains invalid dates");
    expect(() =>
      activateConsultationSession(
        {
          ...session,
          scheduledStartAt: "2026-07-02T02:00:00.000Z",
          scheduledEndAt: "2026-07-02T02:00:00.000Z",
        },
        "2026-07-02T02:00:00.000Z",
      ),
    ).toThrow("Consultation schedule contains invalid dates");
    expect(() =>
      activateConsultationSession(
        {
          ...session,
          scheduledStartAt: "2026-07-02T02:30:00.000Z",
          scheduledEndAt: "2026-07-02T02:00:00.000Z",
        },
        "2026-07-02T02:15:00.000Z",
      ),
    ).toThrow("Consultation schedule contains invalid dates");
  });

  it("keeps active consultation expiry fixed on repeated activation", () => {
    const active: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "active",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      activatedAt: "2026-07-02T02:03:00.000Z",
      expiresAt: "2026-07-02T02:18:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    const rejoined = activateConsultationSession(active, "2026-07-02T02:10:00.000Z");

    expect(rejoined).toBe(active);
    expect(rejoined.expiresAt).toBe("2026-07-02T02:18:00.000Z");
  });

  it("expires inactive or elapsed consultations and rejects chat", () => {
    const active: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "active",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      activatedAt: "2026-07-02T02:03:00.000Z",
      expiresAt: "2026-07-02T02:18:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    const expired = expireConsultationSession(active, "2026-07-02T02:20:00.000Z");

    expect(expired.status).toBe("expired");
    expect(expired.closedAt).toBe("2026-07-02T02:20:00.000Z");
    expect(canSendConsultationMessage(expired, "2026-07-02T02:20:01.000Z")).toBe(false);
  });

  it("requires a paid active consultation window before chat is allowed", () => {
    const active: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "active",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      activatedAt: "2026-07-02T02:03:00.000Z",
      expiresAt: "2026-07-02T02:18:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    expect(canSendConsultationMessage(active, "2026-07-02T02:02:59.000Z")).toBe(false);
    expect(canSendConsultationMessage({ ...active, paymentStatus: "unpaid" }, "2026-07-02T02:04:00.000Z")).toBe(
      false,
    );
    expect(canSendConsultationMessage(active, "2026-07-02T02:18:00.000Z")).toBe(false);
    expect(canSendConsultationMessage({ ...active, expiresAt: "not-a-date" }, "2026-07-02T02:04:00.000Z")).toBe(
      false,
    );
    expect(canSendConsultationMessage(active, "not-a-date")).toBe(false);
    expect(canSendConsultationMessage({ ...active, activatedAt: "not-a-date" }, "2026-07-02T02:04:00.000Z")).toBe(
      false,
    );
    expect(
      canSendConsultationMessage(
        { ...active, expiresAt: "2026-07-02T02:19:00.000Z" },
        "2026-07-02T02:18:30.000Z",
      ),
    ).toBe(false);
    expect(canSendConsultationMessage({ ...active, durationMinutes: 0 }, "2026-07-02T02:04:00.000Z")).toBe(false);
    expect(canSendConsultationMessage({ ...active, durationMinutes: -15 }, "2026-07-02T02:04:00.000Z")).toBe(false);
    expect(
      canSendConsultationMessage({ ...active, durationMinutes: Number.NaN }, "2026-07-02T02:04:00.000Z"),
    ).toBe(false);
    expect(
      canSendConsultationMessage(
        {
          ...active,
          activatedAt: "2026-07-02T01:59:59.000Z",
          expiresAt: "2026-07-02T02:14:59.000Z",
        },
        "2026-07-02T02:04:00.000Z",
      ),
    ).toBe(false);
    expect(
      canSendConsultationMessage(
        {
          ...active,
          activatedAt: "2026-07-02T02:30:00.000Z",
          expiresAt: "2026-07-02T02:45:00.000Z",
        },
        "2026-07-02T02:35:00.000Z",
      ),
    ).toBe(false);
  });

  it("allows valid late activation to chat for the full active duration", () => {
    const active = activateConsultationSession(
      {
        id: "consult_1",
        patientUserId: "user_1",
        clinicianId: "clinician_1",
        caseId: "case_1",
        status: "scheduled",
        paymentStatus: "paid",
        scheduledStartAt: "2026-07-02T02:00:00.000Z",
        scheduledEndAt: "2026-07-02T02:30:00.000Z",
        durationMinutes: 15,
        createdAt: "2026-07-02T01:50:00.000Z",
      },
      "2026-07-02T02:29:00.000Z",
    );

    expect(active.expiresAt).toBe("2026-07-02T02:44:00.000Z");
    expect(canSendConsultationMessage(active, "2026-07-02T02:35:00.000Z")).toBe(true);
  });

  it("keeps AI and clinician plans as separate patient-confirmed records", () => {
    const aiPlan = createTrainingPlan({
      id: "plan_ai",
      caseId: "case_1",
      patientUserId: "user_1",
      source: "ai_generated",
      authorId: "assistant",
      authorRole: "assistant",
      status: "accepted",
      title: "AI 膝盖保守计划",
      dayLabel: "第 1 天",
      items: [{ title: "等长伸膝", meta: "3 组 x 30 秒", state: "todo" }],
      stage: { name: "镇痛与负荷管理", progressLabel: "第 1 周", progressPercent: 10, goals: ["疼痛可控"] },
      precautions: ["疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:00:00.000Z",
      acceptedAt: "2026-07-02T02:01:00.000Z",
    });
    const clinicianPlan = createTrainingPlan({
      id: "plan_clinician",
      caseId: "case_1",
      patientUserId: "user_1",
      source: "clinician_custom",
      authorId: "clinician_1",
      authorRole: "clinician",
      status: "sent_to_patient",
      title: "康复师定制膝前痛计划",
      dayLabel: "第 1 天",
      items: [{ title: "靠墙静蹲", meta: "4 组 x 20 秒", state: "todo" }],
      stage: { name: "负荷控制", progressLabel: "第 1 周", progressPercent: 15, goals: ["恢复下楼耐受"] },
      precautions: ["不做跳跃"],
      progressionCriteria: ["下楼疼痛不超过 3/10"],
      createdAt: "2026-07-02T02:10:00.000Z",
      sentAt: "2026-07-02T02:12:00.000Z",
    });

    expect(aiPlan.source).toBe("ai_generated");
    expect(clinicianPlan.source).toBe("clinician_custom");
    expect(aiPlan.id).not.toBe(clinicianPlan.id);
    expect(clinicianPlan.status).toBe("sent_to_patient");
  });
});
