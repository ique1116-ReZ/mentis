export type ActorRole = "user" | "clinician" | "organization" | "admin";

export interface PlatformActor {
  id: string;
  role: ActorRole;
  displayName: string;
}

export interface User extends PlatformActor {
  role: "user";
}

export interface Clinician extends PlatformActor {
  role: "clinician";
  credentialStatus: "pending" | "verified" | "rejected";
  specialties: string[];
}

export interface Organization extends PlatformActor {
  role: "organization";
  memberClinicianIds: string[];
}

export type ConditionFocus =
  | "acl_reconstruction"
  | "meniscus"
  | "patellofemoral_pain"
  | "achilles_tendinopathy"
  | "ankle_sprain"
  | "running_knee_pain";

export interface Assessment {
  bodyRegion: "knee" | "ankle_foot" | "hip" | "spine" | "shoulder" | "other";
  conditionFocus: ConditionFocus;
  painScore: number;
  durationDays: number;
  symptoms: string[];
  trainingLoad: string;
  createdAt: string;
}

export type TriageLevel =
  | "urgent_referral"
  | "clinician_review_recommended"
  | "self_management_with_review_option";

export interface TriageResult {
  level: TriageLevel;
  matchedRedFlags: string[];
  allowedAiActions: Array<"education" | "rehab_draft" | "prepare_clinician_summary">;
  message: string;
}

export interface RehabStage {
  name: string;
  window: string;
  goals: string[];
  homework: string[];
}

export interface RehabPlan {
  title: string;
  disclaimer: string;
  redFlagGate: "clear" | "blocked";
  stages: RehabStage[];
  progressionCriteria: string[];
}

export interface TimelineEvent {
  id: string;
  type: "assessment" | "upload" | "ai_draft" | "expert_review" | "homework" | "follow_up";
  title: string;
  createdAt: string;
}

export interface CaseRecord {
  id: string;
  ownerUserId: string;
  authorizedClinicianIds: string[];
  authorizedOrganizationIds: string[];
  conditionFocus: ConditionFocus;
  timeline: TimelineEvent[];
}

export type ConsultationStatus = "scheduled" | "waiting_clinician" | "active" | "expired" | "closed" | "cancelled";
export type ConsultationPaymentStatus = "unpaid" | "paid" | "refunded";

export interface ConsultationSession {
  id: string;
  patientUserId: string;
  clinicianId: string;
  caseId: string;
  status: ConsultationStatus;
  paymentStatus: ConsultationPaymentStatus;
  scheduledStartAt: string;
  scheduledEndAt: string;
  activatedAt?: string;
  expiresAt?: string;
  closedAt?: string;
  durationMinutes: number;
  createdAt: string;
}

export type CaseAuthorizationScope =
  | "profile"
  | "assessment_summary"
  | "case_timeline"
  | "reports"
  | "current_plans"
  | "chat_history";

export type CaseAuthorizationAccessMode = "read" | "comment" | "plan_create";

export interface CaseAuthorization {
  id: string;
  caseId: string;
  patientUserId: string;
  clinicianId: string;
  consultationSessionId: string;
  scope: CaseAuthorizationScope[];
  accessMode: CaseAuthorizationAccessMode[];
  startsAt: string;
  endsAt: string;
  revokedAt?: string;
  createdAt: string;
}

export type ConsultationMessageKind = "text" | "system_notice" | "plan_offer";

export interface ConsultationMessage {
  id: string;
  consultationSessionId: string;
  senderId: string;
  senderRole: "user" | "clinician" | "system";
  content: string;
  kind: ConsultationMessageKind;
  createdAt: string;
  readAt?: string;
}

export type TrainingPlanSource = "ai_generated" | "clinician_custom" | "clinician_reviewed_ai";
export type TrainingPlanStatus = "draft" | "sent_to_patient" | "accepted" | "declined" | "archived";

export interface TrainingPlanItem {
  title: string;
  meta: string;
  state: "done" | "todo";
}

export interface TrainingPlanStage {
  name: string;
  progressLabel: string;
  progressPercent: number;
  goals: string[];
}

export interface TrainingPlan {
  id: string;
  caseId: string;
  patientUserId: string;
  source: TrainingPlanSource;
  authorId: string;
  authorRole: "assistant" | "clinician";
  status: TrainingPlanStatus;
  title: string;
  dayLabel: string;
  items: TrainingPlanItem[];
  stage: TrainingPlanStage;
  precautions: string[];
  progressionCriteria: string[];
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
}

export interface ActionLibraryItem {
  id: string;
  title: string;
  bodyRegion: Assessment["bodyRegion"];
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  mediaUrl?: string;
  tags: string[];
}

export type EvidenceType =
  | "clinical_practice_guideline"
  | "consensus_statement"
  | "systematic_review"
  | "textbook"
  | "narrative_review"
  | "protocol_or_presentation"
  | "other";

export interface EvidenceCitation {
  source: string;
  page?: number;
  evidenceType: EvidenceType;
  quote?: string;
  score: number;
}

export interface EvidenceSummary {
  primaryCitation: string;
  citations: Array<EvidenceCitation & { label: string; evidenceRank: number }>;
  conflictPolicy: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorRole: ActorRole;
  caseId: string;
  action:
    | "assessment_submitted"
    | "ai_rehab_draft_created"
    | "urgent_referral_triggered"
    | "expert_review_submitted"
    | "case_accessed"
    | "authorization_changed";
  sensitiveDataCategory: "medical_health";
  metadata: Record<string, unknown>;
  createdAt: string;
}

const RED_FLAGS = [
  "严重外伤",
  "进行性神经症状",
  "胸痛",
  "呼吸困难",
  "无法承重",
  "大小便异常",
  "夜间持续加重疼痛",
  "感染迹象",
  "发热",
  "小腿肿胀",
  "DVT",
] as const;

const EVIDENCE_RANK: Record<EvidenceType, number> = {
  clinical_practice_guideline: 1,
  consensus_statement: 2,
  systematic_review: 3,
  textbook: 4,
  narrative_review: 5,
  protocol_or_presentation: 6,
  other: 7,
};

export function buildInitialAssessment(input: Omit<Assessment, "createdAt">): Assessment {
  return {
    ...input,
    painScore: clamp(input.painScore, 0, 10),
    createdAt: new Date().toISOString(),
  };
}

export function assessRedFlags(assessment: Assessment): TriageResult {
  const symptomsText = assessment.symptoms.join(" ");
  const matchedRedFlags = RED_FLAGS.filter((flag) => symptomsText.includes(flag));

  if (matchedRedFlags.length > 0) {
    return {
      level: "urgent_referral",
      matchedRedFlags,
      allowedAiActions: ["education", "prepare_clinician_summary"],
      message:
        "检测到可能需要优先处理的红旗风险，请尽快线下就医或联系医生/康复师。AI 只能帮助整理情况，不能替代诊断。",
    };
  }

  if (assessment.painScore >= 7 || assessment.durationDays > 90) {
    return {
      level: "clinician_review_recommended",
      matchedRedFlags: [],
      allowedAiActions: ["education", "rehab_draft", "prepare_clinician_summary"],
      message: "建议预约医生或康复师复核，AI 可先生成非诊断性的康复教育和计划草案。",
    };
  }

  return {
    level: "self_management_with_review_option",
    matchedRedFlags: [],
    allowedAiActions: ["education", "rehab_draft", "prepare_clinician_summary"],
    message: "未发现红旗风险，可先进行教育性康复管理，并保留专家咨询入口。",
  };
}

export function draftKneeRunningPlan(assessment: Assessment): RehabPlan {
  const triage = assessRedFlags(assessment);
  if (triage.level === "urgent_referral") {
    return {
      title: "需优先线下评估",
      disclaimer: "以下内容不构成诊断、处方或替代线下医疗建议。",
      redFlagGate: "blocked",
      stages: [],
      progressionCriteria: [],
    };
  }

  return {
    title: `膝/跑步损伤康复草案：${assessment.conditionFocus}`,
    disclaimer: "本计划为康复教育和训练建议草案，不构成诊断、处方或术后限制解释。",
    redFlagGate: "clear",
    stages: [
      {
        name: "镇痛与负荷管理",
        window: "第 1 周起",
        goals: ["降低刺激源", "维持可耐受活动", "建立疼痛监测"],
        homework: ["等长股四头肌收缩", "髋外展激活", "步行或骑行低冲击有氧"],
      },
      {
        name: "负荷提升",
        window: "第 2-4 周",
        goals: ["恢复膝伸肌容量", "提升髋-膝控制", "减少跑步诱发痛"],
        homework: ["西班牙深蹲或靠墙静蹲", "台阶下放", "臀桥与侧向弹力带行走"],
      },
      {
        name: "力量与功能期",
        window: "第 5-8 周",
        goals: ["提高单腿力量", "建立跳跃/落地准备", "接近跑步专项需求"],
        homework: ["分腿蹲", "单腿罗马尼亚硬拉", "小幅度弹跳准备"],
      },
      {
        name: "跑步回归",
        window: "第 9-12 周+",
        goals: ["渐进跑量", "监测 24 小时反应", "回到目标训练"],
        homework: ["跑走结合", "坡度和速度分层回归", "每周跑量递增不超过可耐受范围"],
      },
    ],
    progressionCriteria: [
      "疼痛 NPRS <= 3/10",
      "训练后 24 小时无明显加重",
      "单腿下蹲控制可接受",
      "医生/康复师对术后或复杂病例的限制已确认",
    ],
  };
}

export function canAccessCase(actor: PlatformActor, record: CaseRecord): boolean {
  if (actor.role === "admin") {
    return true;
  }
  if (actor.role === "user") {
    return record.ownerUserId === actor.id;
  }
  if (actor.role === "clinician") {
    return record.authorizedClinicianIds.includes(actor.id);
  }
  if (actor.role === "organization") {
    return record.authorizedOrganizationIds.includes(actor.id);
  }
  return false;
}

export function buildCaseAuthorization(
  input: Omit<CaseAuthorization, "id" | "createdAt"> & { id?: string; createdAt?: string },
): CaseAuthorization {
  return {
    ...input,
    id: input.id ?? `auth_${cryptoSafeId()}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function canAccessAuthorizedCase(
  actor: PlatformActor,
  authorization: CaseAuthorization,
  caseId: string,
  at = new Date().toISOString(),
): boolean {
  if (authorization.revokedAt) {
    return false;
  }
  if (caseId !== authorization.caseId) {
    return false;
  }
  const accessTime = toFiniteTime(at);
  const startsAt = toFiniteTime(authorization.startsAt);
  const endsAt = toFiniteTime(authorization.endsAt);
  if (
    accessTime === undefined ||
    startsAt === undefined ||
    endsAt === undefined ||
    startsAt >= endsAt
  ) {
    return false;
  }
  if (accessTime < startsAt || accessTime >= endsAt) {
    return false;
  }
  if (actor.role === "admin") {
    return true;
  }
  if (actor.role === "user") {
    return actor.id === authorization.patientUserId;
  }
  if (actor.role === "clinician") {
    return actor.id === authorization.clinicianId;
  }
  return false;
}

export function activateConsultationSession(
  session: ConsultationSession,
  activatedAt = new Date().toISOString(),
): ConsultationSession {
  if (session.status === "active") {
    return session;
  }
  if (session.paymentStatus !== "paid") {
    throw new Error("Consultation must be paid before activation");
  }
  if (session.status === "cancelled" || session.status === "closed" || session.status === "expired") {
    throw new Error(`Cannot activate consultation with status ${session.status}`);
  }

  const activatedAtTime = toFiniteTime(activatedAt);
  const scheduledStartAt = toFiniteTime(session.scheduledStartAt);
  const scheduledEndAt = toFiniteTime(session.scheduledEndAt);
  if (
    activatedAtTime === undefined ||
    scheduledStartAt === undefined ||
    scheduledEndAt === undefined ||
    scheduledStartAt >= scheduledEndAt
  ) {
    throw new Error("Consultation schedule contains invalid dates");
  }
  if (activatedAtTime < scheduledStartAt || activatedAtTime >= scheduledEndAt) {
    throw new Error("Consultation can only be activated within its scheduled window");
  }

  const expiresAt = new Date(activatedAtTime + session.durationMinutes * 60_000).toISOString();
  return {
    ...session,
    status: "active",
    activatedAt,
    expiresAt,
  };
}

export function expireConsultationSession(
  session: ConsultationSession,
  closedAt = new Date().toISOString(),
): ConsultationSession {
  if (session.status === "closed" || session.status === "cancelled") {
    return session;
  }
  return {
    ...session,
    status: "expired",
    closedAt,
  };
}

export function canSendConsultationMessage(
  session: ConsultationSession,
  at = new Date().toISOString(),
): boolean {
  if (
    session.status !== "active" ||
    session.paymentStatus !== "paid" ||
    !session.activatedAt ||
    !session.expiresAt
  ) {
    return false;
  }
  const messageTime = toFiniteTime(at);
  const activatedAt = toFiniteTime(session.activatedAt);
  const expiresAt = toFiniteTime(session.expiresAt);
  const scheduledStartAt = toFiniteTime(session.scheduledStartAt);
  const scheduledEndAt = toFiniteTime(session.scheduledEndAt);
  if (
    messageTime === undefined ||
    activatedAt === undefined ||
    expiresAt === undefined ||
    scheduledStartAt === undefined ||
    scheduledEndAt === undefined ||
    scheduledStartAt >= scheduledEndAt ||
    activatedAt < scheduledStartAt ||
    activatedAt >= scheduledEndAt ||
    expiresAt > activatedAt + session.durationMinutes * 60_000 ||
    activatedAt >= expiresAt
  ) {
    return false;
  }
  return messageTime >= activatedAt && messageTime < expiresAt;
}

export function createTrainingPlan(input: TrainingPlan): TrainingPlan {
  return {
    ...input,
    stage: {
      ...input.stage,
      progressPercent: clamp(input.stage.progressPercent, 0, 100),
    },
  };
}

export function createAuditEvent(input: Omit<AuditEvent, "id" | "sensitiveDataCategory" | "createdAt">): AuditEvent {
  return {
    ...input,
    id: `audit_${cryptoSafeId()}`,
    sensitiveDataCategory: "medical_health",
    createdAt: new Date().toISOString(),
  };
}

export function summarizeEvidence(citations: EvidenceCitation[]): EvidenceSummary {
  const sorted = [...citations.map((citation) => ({
      ...citation,
      evidenceRank: EVIDENCE_RANK[citation.evidenceType],
      label: formatCitationLabel(citation),
    }))]
    .sort((left, right) => left.evidenceRank - right.evidenceRank || right.score - left.score);

  return {
    primaryCitation: sorted[0]?.label ?? "No citation",
    citations: sorted,
    conflictPolicy:
      "When sources disagree, prefer newer clinical guidelines and consensus statements, then systematic reviews, textbooks, and local protocols.",
  };
}

function formatCitationLabel(citation: EvidenceCitation): string {
  return citation.page ? `${citation.source}, page ${citation.page}` : citation.source;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFiniteTime(value: string): number | undefined {
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time) || date.toISOString() !== value) {
    return undefined;
  }
  return time;
}

function cryptoSafeId(): string {
  return Math.random().toString(36).slice(2, 10);
}
