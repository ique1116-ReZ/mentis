import { describe, expect, it } from "vitest";
import {
  assessRedFlags,
  buildInitialAssessment,
  canAccessCase,
  createAuditEvent,
  draftKneeRunningPlan,
  summarizeEvidence,
  type CaseRecord,
  type Clinician,
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
});

