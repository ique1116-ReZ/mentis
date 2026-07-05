import { assessRedFlags, buildInitialAssessment, createAuditEvent, draftKneeRunningPlan } from "@mentis/domain";
import type { AuditEvent } from "@mentis/domain";
import { isPublicDirectoryClinician, notFound } from "./helpers.js";
import type { AssessmentWorkflowInput, AssessmentWorkflowResult, PlatformDemo } from "./types.js";

const MAX_STORED_AUDIT_EVENTS = 500;

function recordAuditEvents(platform: PlatformDemo, events: AuditEvent[]): void {
  platform.auditEvents = [...platform.auditEvents, ...events].slice(-MAX_STORED_AUDIT_EVENTS);
}

export async function runAssessmentWorkflow(
  platform: PlatformDemo,
  input: AssessmentWorkflowInput,
): Promise<AssessmentWorkflowResult> {
  const user = platform.users.find((candidate) => candidate.id === input.userId);
  if (!user) {
    throw notFound(`Unknown user: ${input.userId}`);
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
    recordAuditEvents(platform, auditEvents);
    return {
      triage,
      aiDraft: null,
      referral: {
        available: true,
        reason: "检测到红旗风险，建议优先线下就医或联系医生/康复师。",
        clinicianIds: platform.clinicians
          .filter(isPublicDirectoryClinician)
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
  recordAuditEvents(platform, auditEvents);

  return {
    triage,
    aiDraft: { plan },
    referral: {
      available: true,
      reason: "可预约医生/康复师复核 AI 康复草案。",
      clinicianIds: platform.clinicians
        .filter(isPublicDirectoryClinician)
        .map((clinician) => clinician.id),
    },
    auditEvents,
  };
}
