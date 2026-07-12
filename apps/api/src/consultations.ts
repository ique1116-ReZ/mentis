import {
  activateConsultationSession,
  buildCaseAuthorization,
  canAccessAuthorizedCase,
  canSendConsultationMessage,
  createTrainingPlan,
} from "@mentis/domain";
import type {
  ActionLibraryItem,
  CaseAuthorization,
  ClinicianAvailabilitySlot,
  ConsultationMessage,
  ConsultationSession,
  TrainingPlan,
} from "@mentis/domain";
import { actionBodyRegionForCategory } from "./action-retrieval.js";
import { resolveFreshConsultationActor, requireVerifiedClinicianForConsultation } from "./auth.js";
import {
  addDaysIso,
  badRequest,
  conflict,
  forbidden,
  generateEntityId,
  isPublicDirectoryClinician,
  notFound,
  rangesOverlap,
  requireCanonicalIso,
  sanitizeActionText,
} from "./helpers.js";
import { rememberTrainingPlan } from "./memory.js";
import type {
  AdminClinicianReviewInput,
  AdminClinicianReviewItem,
  AuthenticatedActor,
  AvailabilitySlotInput,
  ChatRecommendedAction,
  ClinicianDirectoryEntry,
  ClinicianPlanInput,
  ConsultationCreateInput,
  ConsultationMessageInput,
  ConsultationSnapshot,
  DemoClinician,
  PlatformDemo,
  ProfiledUser,
  RehabConsultCategory,
} from "./types.js";

function toAdminClinicianReviewItem(clinician: DemoClinician): AdminClinicianReviewItem {
  return {
    id: clinician.id,
    displayName: clinician.displayName,
    discipline: clinician.discipline,
    credentialSummary: clinician.credentialSummary,
    organizationName: clinician.organizationName,
    specialties: clinician.specialties,
    credentialStatus: clinician.credentialStatus,
    publicDirectoryVisible: clinician.publicDirectoryVisible !== false,
    reviewedAt: clinician.reviewedAt,
    reviewedBy: clinician.reviewedBy,
    reviewNote: clinician.reviewNote,
    registeredAt: clinician.registeredAt,
  };
}

export function listAdminClinicianReviews(platform: PlatformDemo, actor: AuthenticatedActor): AdminClinicianReviewItem[] {
  if (actor.role !== "admin") {
    throw forbidden("Admin access denied");
  }
  return platform.clinicians
    .map(toAdminClinicianReviewItem)
    .sort((left, right) => {
      if (left.credentialStatus === "pending" && right.credentialStatus !== "pending") {
        return -1;
      }
      if (left.credentialStatus !== "pending" && right.credentialStatus === "pending") {
        return 1;
      }
      return (right.registeredAt ?? "").localeCompare(left.registeredAt ?? "");
    });
}

export function reviewClinicianCredential(
  platform: PlatformDemo,
  clinicianId: string,
  actor: AuthenticatedActor,
  input: AdminClinicianReviewInput,
): AdminClinicianReviewItem {
  if (actor.role !== "admin") {
    throw forbidden("Admin access denied");
  }
  const clinician = platform.clinicians.find((candidate) => candidate.id === clinicianId);
  if (!clinician) {
    throw notFound(`Unknown clinician: ${clinicianId}`);
  }
  const reviewedAt = input.reviewedAt ? requireCanonicalIso(input.reviewedAt, "reviewedAt") : new Date().toISOString();
  const publicDirectoryVisible =
    input.credentialStatus === "verified"
      ? input.publicDirectoryVisible ?? true
      : false;
  const reviewed: DemoClinician = {
    ...clinician,
    credentialStatus: input.credentialStatus,
    publicDirectoryVisible,
    reviewedAt,
    reviewedBy: actor.id,
    reviewNote: input.reviewNote?.trim() || undefined,
  };
  platform.clinicians = platform.clinicians.map((candidate) => (candidate.id === clinicianId ? reviewed : candidate));
  return toAdminClinicianReviewItem(reviewed);
}

export function listClinicians(platform: PlatformDemo, at = new Date().toISOString()): ClinicianDirectoryEntry[] {
  const accessAt = requireCanonicalIso(at, "at");
  return platform.clinicians
    .filter(isPublicDirectoryClinician)
    .map((clinician) => {
      const nextSlot = platform.clinicianAvailabilitySlots
        .filter(
          (slot) =>
            slot.clinicianId === clinician.id &&
            slot.status === "available" &&
            new Date(slot.startsAt).getTime() >= new Date(accessAt).getTime(),
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0];
      const presence = platform.clinicianPresence[clinician.id];
      return {
        id: clinician.id,
        displayName: clinician.displayName,
        discipline: clinician.discipline,
        credentialSummary: clinician.credentialSummary,
        organizationName: clinician.organizationName,
        specialties: clinician.specialties,
        isOnline: Boolean(presence?.isOnline),
        nextAvailableAt: nextSlot?.startsAt,
      };
    });
}

export function listClinicianAvailability(
  platform: PlatformDemo,
  clinicianId: string,
  options: { includeBooked?: boolean; publicOnly?: boolean; at?: string } = {},
): ClinicianAvailabilitySlot[] {
  const accessAt = options.at ? requireCanonicalIso(options.at, "at") : new Date().toISOString();
  const clinician = platform.clinicians.find((candidate) => candidate.id === clinicianId);
  if (!clinician || clinician.credentialStatus !== "verified") {
    throw notFound("Unknown verified clinician");
  }
  if (options.publicOnly && !isPublicDirectoryClinician(clinician)) {
    throw notFound("Unknown public clinician");
  }
  return platform.clinicianAvailabilitySlots
    .filter((slot) => {
      if (slot.clinicianId !== clinicianId) {
        return false;
      }
      if (!options.includeBooked && slot.status !== "available") {
        return false;
      }
      return new Date(slot.endsAt).getTime() >= new Date(accessAt).getTime();
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function createClinicianAvailabilitySlot(
  platform: PlatformDemo,
  clinicianId: string,
  actor: AuthenticatedActor,
  input: AvailabilitySlotInput,
): ClinicianAvailabilitySlot {
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  if (resolvedActor.role !== "clinician" || resolvedActor.id !== clinicianId) {
    throw forbidden("Clinician availability access denied");
  }
  requireVerifiedClinicianForConsultation(resolvedActor);
  const startsAt = requireCanonicalIso(input.startsAt, "startsAt");
  const endsAt = requireCanonicalIso(input.endsAt, "endsAt");
  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw badRequest("Availability endsAt must be after startsAt");
  }
  if (
    platform.clinicianAvailabilitySlots.some(
      (slot) => slot.clinicianId === clinicianId && slot.status !== "blocked" && rangesOverlap(startsAt, endsAt, slot.startsAt, slot.endsAt),
    )
  ) {
    throw conflict("Availability slot overlaps existing schedule");
  }
  const createdAt = input.createdAt ? requireCanonicalIso(input.createdAt, "createdAt") : new Date().toISOString();
  const slot: ClinicianAvailabilitySlot = {
    id: `slot_${generateEntityId()}`,
    clinicianId,
    startsAt,
    endsAt,
    status: "available",
    createdAt,
  };
  platform.clinicianAvailabilitySlots = [
    slot,
    ...platform.clinicianAvailabilitySlots.filter((candidate) => candidate.id !== slot.id),
  ];
  return slot;
}

export function createConsultationSession(platform: PlatformDemo, input: ConsultationCreateInput): ConsultationSession {
  const patient = platform.users.find((candidate) => candidate.id === input.patientUserId);
  const clinician = platform.clinicians.find((candidate) => candidate.id === input.clinicianId);
  if (!patient) {
    throw notFound(`Unknown patient: ${input.patientUserId}`);
  }
  if (!clinician) {
    throw notFound(`Unknown clinician: ${input.clinicianId}`);
  }
  if (clinician.credentialStatus !== "verified") {
    throw badRequest("Consultation clinician must be verified");
  }

  const scheduledStartAt = requireCanonicalIso(input.scheduledStartAt, "scheduledStartAt");
  const scheduledEndAt = requireCanonicalIso(input.scheduledEndAt, "scheduledEndAt");
  if (new Date(scheduledStartAt).getTime() >= new Date(scheduledEndAt).getTime()) {
    throw badRequest("Consultation scheduledEndAt must be after scheduledStartAt");
  }

  const now = input.createdAt ? requireCanonicalIso(input.createdAt, "createdAt") : new Date().toISOString();
  const paymentMode = input.payment?.paymentMode ?? "free_test";
  const paymentStatus = input.payment?.paymentStatus ?? (paymentMode === "free_test" ? "waived" : "unpaid");
  const session: ConsultationSession = {
    id: `consult_${generateEntityId()}`,
    patientUserId: input.patientUserId,
    clinicianId: input.clinicianId,
    caseId: input.caseId,
    status: "scheduled",
    paymentStatus,
    paymentMode,
    paymentAmountCents: input.payment?.paymentAmountCents,
    paymentOrderId: input.payment?.paymentOrderId,
    scheduledStartAt,
    scheduledEndAt,
    durationMinutes: 15,
    createdAt: now,
  };
  const authorization = buildCaseAuthorization({
    caseId: input.caseId,
    patientUserId: input.patientUserId,
    clinicianId: input.clinicianId,
    consultationSessionId: session.id,
    scope: ["profile", "assessment_summary", "case_timeline", "current_plans", "chat_history"],
    accessMode: ["read", "plan_create"],
    startsAt: scheduledStartAt,
    endsAt: addDaysIso(scheduledEndAt, 7),
    createdAt: now,
  });

  platform.consultations = [session, ...platform.consultations.filter((candidate) => candidate.id !== session.id)];
  platform.caseAuthorizations = [
    authorization,
    ...platform.caseAuthorizations.filter((candidate) => candidate.consultationSessionId !== session.id),
  ];
  platform.presence[session.id] = { patientPresent: false, clinicianPresent: false };
  platform.consultationMessages = [
    {
      id: `msg_${generateEntityId()}`,
      consultationSessionId: session.id,
      senderId: "system",
      senderRole: "system",
      content: "问诊已预约成功，双方进入后开启 15 分钟实时聊天。",
      kind: "system_notice",
      createdAt: now,
    },
    ...platform.consultationMessages,
  ];
  return session;
}

export function bookConsultationFromAvailability(
  platform: PlatformDemo,
  input: { patientUserId: string; caseId: string; availabilitySlotId: string; createdAt?: string; payment?: ConsultationCreateInput["payment"] },
): ConsultationSession {
  const slot = platform.clinicianAvailabilitySlots.find((candidate) => candidate.id === input.availabilitySlotId);
  if (!slot) {
    throw notFound(`Unknown availability slot: ${input.availabilitySlotId}`);
  }
  if (slot.status !== "available") {
    throw conflict("Availability slot is not bookable");
  }
  const clinician = platform.clinicians.find((candidate) => candidate.id === slot.clinicianId);
  if (!clinician || !isPublicDirectoryClinician(clinician)) {
    throw forbidden("Availability slot is not public");
  }
  const session = createConsultationSession(platform, {
    patientUserId: input.patientUserId,
    clinicianId: slot.clinicianId,
    caseId: input.caseId,
    scheduledStartAt: slot.startsAt,
    scheduledEndAt: slot.endsAt,
    createdAt: input.createdAt,
    payment: input.payment,
  });
  const bookedSlot: ClinicianAvailabilitySlot = {
    ...slot,
    status: "booked",
    bookedConsultationSessionId: session.id,
  };
  platform.clinicianAvailabilitySlots = platform.clinicianAvailabilitySlots.map((candidate) =>
    candidate.id === slot.id ? bookedSlot : candidate,
  );
  return session;
}

export function getClinicianConsultations(platform: PlatformDemo, clinicianId: string): ConsultationSession[] {
  return platform.consultations.filter((session) => session.clinicianId === clinicianId);
}

export function getPatientConsultations(platform: PlatformDemo, patientUserId: string): ConsultationSession[] {
  return platform.consultations.filter((session) => session.patientUserId === patientUserId);
}

export function getConsultationSnapshot(
  platform: PlatformDemo,
  sessionId: string,
  actor: AuthenticatedActor,
  accessAt?: string,
): ConsultationSnapshot {
  const session = requireConsultation(platform, sessionId);
  const authorization = requireAuthorization(platform, sessionId);
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  requireVerifiedClinicianForConsultation(resolvedActor);
  const authorizationCheckAt = accessAt ?? new Date().toISOString();
  if (!canAccessAuthorizedCase(resolvedActor, authorization, session.caseId, authorizationCheckAt)) {
    throw forbidden("Consultation access denied");
  }

  return {
    session,
    authorization,
    patient: pickPatientSnapshot(platform, session.patientUserId),
    caseSummary: platform.userMemories[session.patientUserId]?.cases.find(
      (patientCase) => patientCase.id === session.caseId,
    ),
    messages: platform.consultationMessages
      .filter((message) => message.consultationSessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    plans: platform.trainingPlans.filter(
      (plan) => plan.caseId === session.caseId && plan.patientUserId === session.patientUserId,
    ),
    actionLibrary: platform.actionLibrary,
  };
}

export function joinConsultationSession(
  platform: PlatformDemo,
  sessionId: string,
  actor: AuthenticatedActor,
  joinedAt = new Date().toISOString(),
): ConsultationSession {
  const session = requireConsultation(platform, sessionId);
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  requireVerifiedClinicianForConsultation(resolvedActor);
  const canonicalJoinedAt = requireCanonicalIso(joinedAt, "joinedAt");
  if (resolvedActor.role === "user" && resolvedActor.id !== session.patientUserId) {
    throw forbidden("Patient is not assigned to consultation");
  }
  if (resolvedActor.role === "clinician" && resolvedActor.id !== session.clinicianId) {
    throw forbidden("Clinician is not assigned to consultation");
  }

  const presence = platform.presence[sessionId] ?? { patientPresent: false, clinicianPresent: false };
  const nextPresence = {
    patientPresent: presence.patientPresent || resolvedActor.role === "user",
    clinicianPresent: presence.clinicianPresent || resolvedActor.role === "clinician",
  };

  const nextSession =
    nextPresence.patientPresent && nextPresence.clinicianPresent
      ? activateConsultationSession(session, canonicalJoinedAt)
      : { ...session, status: "waiting_clinician" as const };
  platform.presence[sessionId] = nextPresence;
  replaceConsultation(platform, nextSession);
  return nextSession;
}

export function sendConsultationMessage(
  platform: PlatformDemo,
  sessionId: string,
  actor: AuthenticatedActor,
  input: ConsultationMessageInput,
): ConsultationMessage {
  const session = requireConsultation(platform, sessionId);
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  requireVerifiedClinicianForConsultation(resolvedActor);
  const createdAt = input.createdAt ? requireCanonicalIso(input.createdAt, "createdAt") : new Date().toISOString();
  if (!canSendConsultationMessage(session, createdAt)) {
    throw conflict("Consultation chat is not active");
  }
  if (resolvedActor.role === "user" && resolvedActor.id !== session.patientUserId) {
    throw forbidden("Patient is not assigned to consultation");
  }
  if (resolvedActor.role === "clinician" && resolvedActor.id !== session.clinicianId) {
    throw forbidden("Clinician is not assigned to consultation");
  }

  const message: ConsultationMessage = {
    id: `msg_${generateEntityId()}`,
    consultationSessionId: sessionId,
    senderId: resolvedActor.id,
    senderRole: resolvedActor.role === "clinician" ? "clinician" : "user",
    content: input.content.trim(),
    kind: "text",
    createdAt,
  };
  platform.consultationMessages = [...platform.consultationMessages, message];
  return message;
}

export function listActionLibrary(platform: PlatformDemo): ActionLibraryItem[] {
  return platform.actionLibrary;
}

function musclesOverlap(left: string[], right: string[]): boolean {
  return left.some((leftMuscle) => {
    const normalizedLeft = normalizeComparableText(leftMuscle);
    return right.some((rightMuscle) => {
      const normalizedRight = normalizeComparableText(rightMuscle);
      return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
    });
  });
}

/**
 * 模型经常会为了满足「用库里的 actionId」而硬凑一个部位相近但完全不对的动作
 * （正文说拉腘绳肌、actionId 指向股四头肌拉伸）。命中 id 后必须校验，
 * 校验不了（库里那条没打标签）也一律视为不匹配——宁可用模型自己写的动作。
 */
export function isLibraryActionMatch(action: ChatRecommendedAction, item: ActionLibraryItem): boolean {
  if (!item.actionType || !item.targetMuscles?.length) {
    return false;
  }
  if (!action.actionType || !action.targetMuscles?.length) {
    return false;
  }
  if (item.actionType !== action.actionType) {
    return false;
  }
  return musclesOverlap(action.targetMuscles, item.targetMuscles);
}

export function resolveRecommendedActions(
  platform: PlatformDemo,
  actions: ChatRecommendedAction[] = [],
  category?: RehabConsultCategory,
): ChatRecommendedAction[] {
  const fallbackBodyRegion = actionBodyRegionForCategory(category);
  return actions.map((action) => {
    const existingById = action.actionId
      ? platform.actionLibrary.find((candidate) => candidate.id === action.actionId)
      : undefined;
    if (existingById && isLibraryActionMatch(action, existingById)) {
      return actionFromLibraryItem(existingById, action.reason);
    }

    const bodyRegion = action.bodyRegion === "other" ? fallbackBodyRegion : action.bodyRegion;
    const existingByTitle = platform.actionLibrary.find(
      (candidate) =>
        candidate.bodyRegion === bodyRegion &&
        normalizeComparableText(candidate.title) === normalizeComparableText(action.title),
    );
    if (existingByTitle) {
      return actionFromLibraryItem(existingByTitle, action.reason);
    }

    const generated: ActionLibraryItem = {
      id: generatedActionId(bodyRegion, action.title, action.defaultDosage),
      title: action.title,
      bodyRegion,
      bodyRegions: [bodyRegion],
      actionType: action.actionType,
      targetMuscles: action.targetMuscles,
      source: "ai",
      phase: action.phase,
      defaultDosage: action.defaultDosage,
      instructions: action.instructions,
      contraindications: action.contraindications,
      progressionCriteria: action.progressionCriteria,
      tags: mergeActionTags(["ai-generated", "rehab", bodyRegion, ...action.tags]),
    };
    const duplicateId = platform.actionLibrary.find((candidate) => candidate.id === generated.id);
    const stored = duplicateId ?? generated;
    if (!duplicateId) {
      platform.actionLibrary = [stored, ...platform.actionLibrary];
    }
    return actionFromLibraryItem(stored, action.reason);
  });
}

function actionFromLibraryItem(action: ActionLibraryItem, reason?: string): ChatRecommendedAction {
  return {
    actionId: action.id,
    title: action.title,
    bodyRegion: action.bodyRegion,
    actionType: action.actionType,
    targetMuscles: action.targetMuscles,
    phase: action.phase,
    defaultDosage: action.defaultDosage,
    instructions: action.instructions,
    contraindications: action.contraindications,
    progressionCriteria: action.progressionCriteria,
    tags: action.tags,
    reason,
  };
}

function mergeActionTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags
    .map((tag) => sanitizeActionText(tag).toLowerCase())
    .filter((tag) => tag && tag !== "needs-video")
    .filter((tag) => {
      if (seen.has(tag)) {
        return false;
      }
      seen.add(tag);
      return true;
    })
    .slice(0, 12);
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function generatedActionId(bodyRegion: ActionLibraryItem["bodyRegion"], title: string, dosage: string): string {
  return `ai_rehab_${bodyRegion}_${hashActionKey(`${title}:${dosage}`)}`;
}

function hashActionKey(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createClinicianPlanForConsultation(
  platform: PlatformDemo,
  sessionId: string,
  actor: AuthenticatedActor,
  input: ClinicianPlanInput,
): TrainingPlan {
  const session = requireConsultation(platform, sessionId);
  const authorization = requireAuthorization(platform, sessionId);
  const createdAt = input.createdAt ? requireCanonicalIso(input.createdAt, "createdAt") : new Date().toISOString();
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  if (!session.activatedAt) {
    throw conflict("Consultation has not been activated");
  }
  if (
    resolvedActor.role !== "clinician" ||
    resolvedActor.credentialStatus !== "verified" ||
    session.clinicianId !== resolvedActor.id ||
    !authorization.accessMode.includes("plan_create") ||
    !canAccessAuthorizedCase(resolvedActor, authorization, session.caseId, createdAt)
  ) {
    throw forbidden("Clinician cannot create plan for consultation");
  }

  const actions = input.actionIds.map((id) => {
    const action = platform.actionLibrary.find((candidate) => candidate.id === id);
    if (!action) {
      throw notFound(`Unknown action: ${id}`);
    }
    return action;
  });
  if (actions.length === 0) {
    throw badRequest("At least one action is required");
  }

  const plan = createTrainingPlan({
    id: `plan_${generateEntityId()}`,
    caseId: session.caseId,
    patientUserId: session.patientUserId,
    source: "clinician_custom",
    authorId: resolvedActor.id,
    authorRole: "clinician",
    status: "sent_to_patient",
    title: input.title.trim(),
    dayLabel: input.dayLabel.trim(),
    items: actions.map((action) => ({ title: action.title, meta: action.defaultDosage, state: "todo" })),
    stage: {
      name: actions[0]?.phase ?? "康复训练",
      progressLabel: input.dayLabel.trim(),
      progressPercent: 10,
      goals: actions.flatMap((action) => action.progressionCriteria).slice(0, 3),
    },
    precautions: input.precautions,
    progressionCriteria: input.progressionCriteria,
    createdAt,
    sentAt: createdAt,
  });

  platform.trainingPlans = [plan, ...platform.trainingPlans.filter((candidate) => candidate.id !== plan.id)];
  platform.consultationMessages = [
    ...platform.consultationMessages,
    {
      id: `msg_${generateEntityId()}`,
      consultationSessionId: sessionId,
      senderId: resolvedActor.id,
      senderRole: "clinician",
      content: `我给你发送了一份定制计划：${plan.title}`,
      kind: "plan_offer",
      createdAt,
    },
  ];
  return plan;
}

export function acceptConsultationPlan(
  platform: PlatformDemo,
  planId: string,
  actor: AuthenticatedActor,
  acceptedAt = new Date().toISOString(),
): TrainingPlan {
  const canonicalAcceptedAt = requireCanonicalIso(acceptedAt, "acceptedAt");
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  const plan = platform.trainingPlans.find((candidate) => candidate.id === planId);
  if (resolvedActor.role !== "user" || !plan || plan.patientUserId !== resolvedActor.id) {
    throw forbidden("Plan access denied");
  }
  if (plan.status !== "sent_to_patient") {
    throw conflict("Plan is not awaiting patient confirmation");
  }

  const accepted = { ...plan, status: "accepted" as const, acceptedAt: canonicalAcceptedAt };
  platform.trainingPlans = platform.trainingPlans.map((candidate) => (candidate.id === planId ? accepted : candidate));
  rememberTrainingPlan(platform, resolvedActor.id, {
    id: accepted.id,
    caseId: accepted.caseId,
    categoryId: inferCategoryFromTrainingPlan(platform, accepted),
    title: accepted.title,
    status: "active",
    dayLabel: accepted.dayLabel,
    completionPercent: accepted.stage.progressPercent,
    items: accepted.items,
    stage: accepted.stage,
    updatedAt: canonicalAcceptedAt,
  });
  return accepted;
}

export function declineConsultationPlan(
  platform: PlatformDemo,
  planId: string,
  actor: AuthenticatedActor,
): TrainingPlan {
  const resolvedActor = resolveFreshConsultationActor(platform, actor);
  const plan = platform.trainingPlans.find((candidate) => candidate.id === planId);
  if (resolvedActor.role !== "user" || !plan || plan.patientUserId !== resolvedActor.id) {
    throw forbidden("Plan access denied");
  }
  if (plan.status !== "sent_to_patient") {
    throw conflict("Plan is not awaiting patient confirmation");
  }

  const declined = { ...plan, status: "declined" as const };
  platform.trainingPlans = platform.trainingPlans.map((candidate) => (candidate.id === planId ? declined : candidate));
  return declined;
}

function pickPatientSnapshot(
  platform: PlatformDemo,
  patientUserId: string,
): Pick<ProfiledUser, "id" | "displayName" | "profile"> {
  const patient = platform.users.find((candidate) => candidate.id === patientUserId) as ProfiledUser | undefined;
  if (!patient) {
    throw notFound(`Unknown patient: ${patientUserId}`);
  }
  return {
    id: patient.id,
    displayName: patient.displayName,
    profile: patient.profile,
  };
}

function requireConsultation(platform: PlatformDemo, sessionId: string): ConsultationSession {
  const session = platform.consultations.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw notFound(`Unknown consultation: ${sessionId}`);
  }
  return session;
}

function requireAuthorization(platform: PlatformDemo, sessionId: string): CaseAuthorization {
  const authorization = platform.caseAuthorizations.find(
    (candidate) => candidate.consultationSessionId === sessionId,
  );
  if (!authorization) {
    throw notFound(`Missing authorization for consultation: ${sessionId}`);
  }
  return authorization;
}

function replaceConsultation(platform: PlatformDemo, session: ConsultationSession): void {
  platform.consultations = platform.consultations.map((candidate) =>
    candidate.id === session.id ? session : candidate,
  );
}

function inferCategoryFromTrainingPlan(platform: PlatformDemo, plan: TrainingPlan): RehabConsultCategory {
  for (const memory of Object.values(platform.userMemories)) {
    const matchedCase = memory.cases.find((candidate) => candidate.id === plan.caseId);
    if (matchedCase) {
      return matchedCase.categoryId;
    }
  }
  return "knee";
}
