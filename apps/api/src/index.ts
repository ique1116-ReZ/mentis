import {
  activateConsultationSession,
  assessRedFlags,
  buildCaseAuthorization,
  buildInitialAssessment,
  canAccessAuthorizedCase,
  canSendConsultationMessage,
  createAuditEvent,
  createTrainingPlan,
  draftKneeRunningPlan,
  type Assessment,
  type ActionLibraryItem,
  type AuditEvent,
  type CaseAuthorization,
  type Clinician,
  type ClinicianAvailabilitySlot,
  type ConsultationMessage,
  type ConsultationPaymentMode,
  type ConsultationSession,
  type PlatformActor,
  type RehabPlan,
  type TriageResult,
  type TrainingPlan,
  type User,
} from "@mentis/domain";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { importedExerciseLibrary } from "./exercise-library.generated.js";

export interface PlatformDemo {
  users: User[];
  clinicians: DemoClinician[];
  admins: DemoAdmin[];
  demoCredentials: DemoCredential[];
  userMemories: Record<string, UserMemory>;
  consultations: ConsultationSession[];
  caseAuthorizations: CaseAuthorization[];
  consultationMessages: ConsultationMessage[];
  trainingPlans: TrainingPlan[];
  actionLibrary: ActionLibraryItem[];
  clinicianAvailabilitySlots: ClinicianAvailabilitySlot[];
  clinicianPresence: Record<string, ClinicianPresenceStatus>;
  presence: Record<string, ConsultationPresence>;
  demoSessions: Record<string, DemoSessionRecord>;
}

export interface UserProfile {
  heightCm: string;
  weightKg: string;
}

export type ProfiledUser = User & {
  profile?: UserProfile;
};

export type DemoClinician = Clinician & {
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
  publicDirectoryVisible?: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  registeredAt?: string;
};

export type DemoAdmin = PlatformActor & {
  role: "admin";
};

export type AuthenticatedActor = ProfiledUser | DemoClinician | DemoAdmin;

export type AssessmentWorkflowInput = Omit<Assessment, "createdAt"> & {
  userId: string;
};

export interface DemoCredential {
  username: string;
  password: string;
  actorId: string;
  actorRole: "user" | "clinician" | "admin";
}

export interface DemoSessionRecord {
  actorId: string;
  actorRole: "user" | "clinician" | "admin";
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthenticatedSession {
  token: string;
  user: AuthenticatedActor;
  memory: UserMemory;
}

export interface RegistrationInput {
  accountRole?: "user" | "clinician";
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
  heightCm: string;
  weightKg: string;
  discipline?: string;
  credentialSummary?: string;
  specialties?: string[];
  organizationName?: string;
}

export interface MemoryCaseSummary {
  id: string;
  categoryId: RehabConsultCategory;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
}

export interface MemoryTrainingPlan {
  id: string;
  caseId: string;
  categoryId: RehabConsultCategory;
  title: string;
  status: "active" | "paused" | "completed";
  dayLabel: string;
  completionPercent: number;
  items: Array<{ title: string; meta: string; state: "done" | "todo" }>;
  stage: {
    name: string;
    progressLabel: string;
    progressPercent: number;
    goals: string[];
  };
  updatedAt: string;
}

export type MemoryTrainingPlanInput = Omit<MemoryTrainingPlan, "updatedAt"> & {
  updatedAt?: string;
};

export interface UserMemory {
  userId: string;
  cases: MemoryCaseSummary[];
  trainingPlans: MemoryTrainingPlan[];
  notes: string[];
  updatedAt: string;
}

export interface ConsultationPresence {
  patientPresent: boolean;
  clinicianPresent: boolean;
}

export interface ClinicianPresenceStatus {
  isOnline: boolean;
  lastSeenAt: string;
}

export interface ClinicianDirectoryEntry {
  id: string;
  displayName: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
  specialties: string[];
  isOnline: boolean;
  nextAvailableAt?: string;
}

export interface AdminClinicianReviewItem {
  id: string;
  displayName: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
  specialties: string[];
  credentialStatus: DemoClinician["credentialStatus"];
  publicDirectoryVisible: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  registeredAt?: string;
}

export interface AdminClinicianReviewInput {
  credentialStatus: DemoClinician["credentialStatus"];
  publicDirectoryVisible?: boolean;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface AvailabilitySlotInput {
  startsAt: string;
  endsAt: string;
  createdAt?: string;
}

export interface ConsultationMessageInput {
  content: string;
  createdAt?: string;
}

export interface ConsultationPaymentInput {
  paymentMode?: ConsultationPaymentMode;
  paymentStatus?: ConsultationSession["paymentStatus"];
  paymentAmountCents?: number;
  paymentOrderId?: string;
}

export interface AssessmentWorkflowResult {
  triage: TriageResult;
  aiDraft: { plan: RehabPlan } | null;
  referral: {
    available: boolean;
    reason: string;
    clinicianIds: string[];
  };
  auditEvents: AuditEvent[];
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  question?: string;
  assessmentStep?: string;
}

export interface ChatResult {
  content: string;
  model: string;
}

export interface ChatOption {
  id: string;
  label: string;
  value: string;
}

export interface ChatPlanPatch {
  title?: string;
  dayLabel?: string;
  completionPercent?: number;
  items?: Array<{ title: string; meta: string; state: "done" | "todo" }>;
  stage?: {
    name: string;
    progressLabel: string;
    progressPercent: number;
    goals: string[];
  };
}

export interface GuidedChatResult extends ChatResult {
  question?: string;
  options?: ChatOption[];
  assessmentStep?: string;
  planPatch?: ChatPlanPatch;
}

export type RehabConsultCategory = "knee" | "ankle" | "shoulder" | "lower_back" | "hip";

export interface RehabConsultCategoryConfig {
  id: RehabConsultCategory;
  label: string;
  scope: string;
  examples: string[];
}

export interface RagEvidenceSnippet {
  source: string;
  page?: number | string;
  text: string;
  score?: number;
  evidenceType?: string;
}

export interface ChatContext {
  category?: RehabConsultCategory;
  ragContext?: RagEvidenceSnippet[];
}

export interface QwenChatClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_WEB_ORIGIN = "http://127.0.0.1:5173";

export const REHAB_CONSULT_CATEGORIES: Record<RehabConsultCategory, RehabConsultCategoryConfig> = {
  knee: {
    id: "knee",
    label: "膝盖",
    scope: "膝关节、髌股疼痛、跑步膝、髌腱/髌下区域不适、膝关节负荷管理与康复训练",
    examples: ["跑步后膝前痛", "上下楼疼", "深蹲时膝盖不舒服"],
  },
  ankle: {
    id: "ankle",
    label: "脚踝",
    scope: "踝关节扭伤、跑步后踝部疼痛、跟腱周围不适、踝稳定性与活动度训练",
    examples: ["崴脚后多久能跑", "跑步后外踝疼", "跟腱附近紧"],
  },
  shoulder: {
    id: "shoulder",
    label: "肩膀",
    scope: "肩关节疼痛、肩袖相关不适、过顶动作疼痛、肩胛控制与上肢训练调整",
    examples: ["卧推肩痛", "举手疼", "游泳后肩膀不舒服"],
  },
  lower_back: {
    id: "lower_back",
    label: "腰背",
    scope: "腰背疼痛、训练后腰部不适、髋腰控制、核心负荷管理与恢复建议",
    examples: ["硬拉后腰酸", "久坐腰痛", "跑步后下背紧"],
  },
  hip: {
    id: "hip",
    label: "髋部",
    scope: "髋部疼痛、臀肌/髋屈肌相关不适、跑步髋部负荷、髋活动度与力量训练",
    examples: ["跑步髋外侧疼", "臀部深处痛", "髋前侧夹挤感"],
  },
};

export function resolveCorsOrigin(
  requestOrigin?: string | null,
  configuredOrigin = process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
): string {
  const allowedOrigins = configuredOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const fallbackOrigin = allowedOrigins[0] ?? DEFAULT_WEB_ORIGIN;

  if (!requestOrigin) {
    return fallbackOrigin;
  }
  if (allowedOrigins.includes("*")) {
    return "*";
  }
  if (allowedOrigins.includes(requestOrigin) || isLocalDevOrigin(requestOrigin)) {
    return requestOrigin;
  }
  return fallbackOrigin;
}

export function createPlatformDemo(): PlatformDemo {
  return {
    users: [{ id: "user_1", role: "user", displayName: "张运动" }],
    admins: [{ id: "admin_1", role: "admin", displayName: "平台管理员" }],
    clinicians: [
      {
        id: "clinician_1",
        role: "clinician",
        displayName: "李康复师",
        credentialStatus: "verified",
        specialties: ["knee", "running"],
        discipline: "运动康复师",
        credentialSummary: "跑步损伤与膝关节负荷管理",
        organizationName: "Mentis Rehab",
        publicDirectoryVisible: false,
      },
    ],
    demoCredentials: [
      ...getDemoCredentials(),
      {
        username: "clinician_demo",
        password: "mentis_clinician",
        actorId: "clinician_1",
        actorRole: "clinician",
      },
      {
        username: "admin_demo",
        password: "mentis_admin",
        actorId: "admin_1",
        actorRole: "admin",
      },
    ],
    userMemories: {
      user_1: {
        userId: "user_1",
        cases: [],
        trainingPlans: [],
        notes: ["中级跑者，每周训练 4-5 次，目标是安全恢复跑步。"],
        updatedAt: new Date().toISOString(),
      },
    },
    consultations: [],
    caseAuthorizations: [],
    consultationMessages: [],
    trainingPlans: [],
    actionLibrary: buildSeedActionLibrary(),
    clinicianAvailabilitySlots: buildSeedAvailabilitySlots("clinician_1"),
    clinicianPresence: {
      clinician_1: {
        isOnline: true,
        lastSeenAt: new Date().toISOString(),
      },
    },
    presence: {},
    demoSessions: {},
  };
}

function buildSeedAvailabilitySlots(clinicianId: string): ClinicianAvailabilitySlot[] {
  const now = new Date();
  const slotStarts = [1, 3, 26].map((hoursAhead) => new Date(now.getTime() + hoursAhead * 60 * 60 * 1000));
  return slotStarts.map((startsAt, index) => ({
    id: `slot_seed_${index + 1}`,
    clinicianId,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString(),
    status: "available",
    createdAt: now.toISOString(),
  }));
}

function buildSeedActionLibrary(): ActionLibraryItem[] {
  const rehabSeedActions: ActionLibraryItem[] = [
    {
      id: "action_quad_iso",
      title: "股四头肌等长收缩",
      bodyRegion: "knee",
      phase: "镇痛与激活",
      defaultDosage: "3 组 x 30 秒",
      instructions: ["坐位或仰卧位伸直膝盖", "轻轻绷紧大腿前侧", "保持呼吸，不要憋气"],
      contraindications: ["训练中疼痛明显加重", "术后限制未确认"],
      progressionCriteria: ["完成后 24 小时无明显加重"],
      tags: ["膝盖", "等长", "低刺激"],
    },
    {
      id: "action_wall_sit",
      title: "靠墙静蹲",
      bodyRegion: "knee",
      phase: "负荷控制",
      defaultDosage: "4 组 x 20 秒",
      instructions: ["背靠墙缓慢下蹲到可耐受角度", "膝盖对齐脚尖", "保持疼痛不超过 3/10"],
      contraindications: ["明显肿胀", "无法承重", "急性外伤后未评估"],
      progressionCriteria: ["可完成 4 组且次日无加重"],
      tags: ["膝盖", "股四头肌", "静态"],
    },
  ];

  return [...rehabSeedActions, ...importedExerciseLibrary];
}

function getDemoCredentials(): DemoCredential[] {
  const username = process.env.MENTIS_DEMO_USERNAME?.trim();
  const password = process.env.MENTIS_DEMO_PASSWORD?.trim();

  if (!username || !password) {
    return [];
  }

  return [{ username, password, actorId: "user_1", actorRole: "user" }];
}

export function authenticateDemoUser(platform: PlatformDemo, input: LoginInput): AuthenticatedSession {
  const credential = platform.demoCredentials.find(
    (candidate) => candidate.username === input.username && candidate.password === input.password,
  );
  if (!credential) {
    throw new Error("Invalid username or password");
  }

  if (credential.actorRole === "clinician") {
    const clinician = platform.clinicians.find((candidate) => candidate.id === credential.actorId);
    if (!clinician) {
      throw new Error(`Unknown clinician: ${credential.actorId}`);
    }

    return createAuthenticatedSession(platform, clinician, emptyUserMemory(clinician.id));
  }

  if (credential.actorRole === "admin") {
    const admin = platform.admins.find((candidate) => candidate.id === credential.actorId);
    if (!admin) {
      throw new Error(`Unknown admin: ${credential.actorId}`);
    }

    return createAuthenticatedSession(platform, admin, emptyUserMemory(admin.id));
  }

  const user = platform.users.find((candidate) => candidate.id === credential.actorId) as ProfiledUser | undefined;
  if (!user) {
    throw new Error(`Unknown user: ${credential.actorId}`);
  }

  return createAuthenticatedSession(platform, user, getUserMemory(platform, user.id));
}

export function resolveAuthenticatedActor(platform: PlatformDemo, token: string): AuthenticatedActor {
  const session = platform.demoSessions[token];
  if (!session) {
    throw new Error("Invalid or expired demo session");
  }
  return resolveActorById(platform, session.actorId, session.actorRole);
}

export function registerDemoUser(platform: PlatformDemo, input: RegistrationInput): AuthenticatedSession {
  const username = trimRegistrationField(input.username);
  if (!username) {
    throw new Error("Username is required");
  }
  if (trimRegistrationField(input.inviteCode) !== "ique1116") {
    throw new Error("Invalid invite code");
  }
  if (!trimRegistrationField(input.password)) {
    throw new Error("Password is required");
  }

  if ((input.accountRole ?? "user") === "clinician") {
    const clinicianId = `clinician_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const clinician: DemoClinician = {
      id: clinicianId,
      role: "clinician",
      displayName: trimRegistrationField(input.displayName) || "待审核康复师",
      credentialStatus: "pending",
      specialties: normalizeSpecialties(input.specialties, input.discipline),
      discipline: trimRegistrationField(input.discipline) || undefined,
      credentialSummary: trimRegistrationField(input.credentialSummary) || undefined,
      organizationName: trimRegistrationField(input.organizationName) || undefined,
      publicDirectoryVisible: false,
      registeredAt: new Date().toISOString(),
    };

    platform.clinicians = [
      clinician,
      ...platform.clinicians.filter((candidate) => candidate.id !== clinician.id),
    ];
    platform.demoCredentials = [
      { username, password: trimRegistrationField(input.password), actorId: clinician.id, actorRole: "clinician" },
      ...platform.demoCredentials.filter((candidate) => candidate.username !== username),
    ];

    return createAuthenticatedSession(platform, clinician, emptyUserMemory(clinician.id));
  }

  const userId = `user_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const user: ProfiledUser = {
    id: userId,
    role: "user",
    displayName: trimRegistrationField(input.displayName) || "ique1116",
    profile: {
      heightCm: trimRegistrationField(input.heightCm),
      weightKg: trimRegistrationField(input.weightKg),
    },
  };

  platform.users = [user, ...platform.users.filter((candidate) => candidate.id !== user.id)];
  platform.demoCredentials = [
    { username, password: trimRegistrationField(input.password), actorId: user.id, actorRole: "user" },
    ...platform.demoCredentials.filter((candidate) => candidate.username !== username),
  ];
  platform.userMemories[user.id] = emptyUserMemory(user.id);

  return createAuthenticatedSession(platform, user, getUserMemory(platform, user.id));
}

function createAuthenticatedSession(
  platform: PlatformDemo,
  actor: AuthenticatedActor,
  memory: UserMemory,
): AuthenticatedSession {
  const token = `demo_${actor.id}_${demoTokenId()}`;
  platform.demoSessions[token] = {
    actorId: actor.id,
    actorRole: actor.role,
  };
  return {
    token,
    user: actor,
    memory,
  };
}

function resolveActorById(
  platform: PlatformDemo,
  actorId: string,
  actorRole: "user" | "clinician" | "admin",
): AuthenticatedActor {
  if (actorRole === "clinician") {
    const clinician = platform.clinicians.find((candidate) => candidate.id === actorId);
    if (!clinician) {
      throw new Error(`Unknown clinician: ${actorId}`);
    }
    return clinician;
  }

  if (actorRole === "admin") {
    const admin = platform.admins.find((candidate) => candidate.id === actorId);
    if (!admin) {
      throw new Error(`Unknown admin: ${actorId}`);
    }
    return admin;
  }

  const user = platform.users.find((candidate) => candidate.id === actorId) as ProfiledUser | undefined;
  if (!user) {
    throw new Error(`Unknown user: ${actorId}`);
  }
  return user;
}

function trimRegistrationField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyUserMemory(userId: string): UserMemory {
  return {
    userId,
    cases: [],
    trainingPlans: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSpecialties(specialties: string[] | undefined, discipline: string | undefined): string[] {
  const normalized = (specialties ?? [])
    .map((specialty) => specialty.trim())
    .filter(Boolean);
  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }
  const fallback = discipline?.trim();
  return fallback ? [fallback] : [];
}

export function getUserMemory(platform: PlatformDemo, userId: string): UserMemory {
  const user = platform.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`Unknown user: ${userId}`);
  }

  platform.userMemories[userId] ??= {
    userId,
    cases: [],
    trainingPlans: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };

  return platform.userMemories[userId];
}

export function rememberCase(platform: PlatformDemo, userId: string, input: MemoryCaseSummary): UserMemory {
  const memory = getUserMemory(platform, userId);
  const nextCase = { ...input, createdAt: input.createdAt || new Date().toISOString() };
  memory.cases = [nextCase, ...memory.cases.filter((candidate) => candidate.id !== nextCase.id)];
  memory.updatedAt = new Date().toISOString();
  return memory;
}

export function deleteRememberedCase(platform: PlatformDemo, userId: string, caseId: string): UserMemory {
  const memory = getUserMemory(platform, userId);
  const target = memory.cases.find((candidate) => candidate.id === caseId);
  if (!target) {
    return memory;
  }
  if (isAcceptedPrescriptionStatus(target.status)) {
    throw new Error("Accepted prescription cases cannot be deleted");
  }

  memory.cases = memory.cases.filter((candidate) => candidate.id !== caseId);
  memory.updatedAt = new Date().toISOString();
  return memory;
}

export function rememberTrainingPlan(
  platform: PlatformDemo,
  userId: string,
  input: MemoryTrainingPlanInput,
): UserMemory {
  const memory = getUserMemory(platform, userId);
  const now = new Date().toISOString();
  const nextPlan: MemoryTrainingPlan = {
    ...input,
    updatedAt: input.updatedAt || now,
  };

  memory.trainingPlans = [
    nextPlan,
    ...memory.trainingPlans.filter((candidate) => candidate.id !== nextPlan.id),
  ];
  memory.cases = memory.cases.map((candidate) =>
    candidate.id === nextPlan.caseId ? { ...candidate, status: "运动处方已接受" } : candidate,
  );
  memory.updatedAt = now;
  return memory;
}

export interface ConsultationCreateInput {
  patientUserId: string;
  clinicianId: string;
  caseId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  createdAt?: string;
  payment?: ConsultationPaymentInput;
}

export interface ConsultationSnapshot {
  session: ConsultationSession;
  authorization: CaseAuthorization;
  patient: Pick<ProfiledUser, "id" | "displayName" | "profile">;
  caseSummary?: MemoryCaseSummary;
  messages: ConsultationMessage[];
  plans: TrainingPlan[];
  actionLibrary: ActionLibraryItem[];
}

function isPublicDirectoryClinician(clinician: DemoClinician) {
  return clinician.credentialStatus === "verified" && clinician.publicDirectoryVisible !== false;
}

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
    throw new Error("Admin access denied");
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
    throw new Error("Admin access denied");
  }
  const clinician = platform.clinicians.find((candidate) => candidate.id === clinicianId);
  if (!clinician) {
    throw new Error(`Unknown clinician: ${clinicianId}`);
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
    reviewNote: trimRegistrationField(input.reviewNote) || undefined,
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
    throw new Error("Unknown verified clinician");
  }
  if (options.publicOnly && !isPublicDirectoryClinician(clinician)) {
    throw new Error("Unknown public clinician");
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
    throw new Error("Clinician availability access denied");
  }
  requireVerifiedClinicianForConsultation(resolvedActor);
  const startsAt = requireCanonicalIso(input.startsAt, "startsAt");
  const endsAt = requireCanonicalIso(input.endsAt, "endsAt");
  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw new Error("Availability endsAt must be after startsAt");
  }
  if (
    platform.clinicianAvailabilitySlots.some(
      (slot) => slot.clinicianId === clinicianId && slot.status !== "blocked" && rangesOverlap(startsAt, endsAt, slot.startsAt, slot.endsAt),
    )
  ) {
    throw new Error("Availability slot overlaps existing schedule");
  }
  const createdAt = input.createdAt ? requireCanonicalIso(input.createdAt, "createdAt") : new Date().toISOString();
  const slot: ClinicianAvailabilitySlot = {
    id: `slot_${demoTokenId()}`,
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
    throw new Error(`Unknown patient: ${input.patientUserId}`);
  }
  if (!clinician) {
    throw new Error(`Unknown clinician: ${input.clinicianId}`);
  }
  if (clinician.credentialStatus !== "verified") {
    throw new Error("Consultation clinician must be verified");
  }

  const scheduledStartAt = requireCanonicalIso(input.scheduledStartAt, "scheduledStartAt");
  const scheduledEndAt = requireCanonicalIso(input.scheduledEndAt, "scheduledEndAt");
  if (new Date(scheduledStartAt).getTime() >= new Date(scheduledEndAt).getTime()) {
    throw new Error("Consultation scheduledEndAt must be after scheduledStartAt");
  }

  const now = input.createdAt ? requireCanonicalIso(input.createdAt, "createdAt") : new Date().toISOString();
  const paymentMode = input.payment?.paymentMode ?? "free_test";
  const paymentStatus = input.payment?.paymentStatus ?? (paymentMode === "free_test" ? "waived" : "unpaid");
  const session: ConsultationSession = {
    id: `consult_${demoTokenId()}`,
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
      id: `msg_${demoTokenId()}`,
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
  input: { patientUserId: string; caseId: string; availabilitySlotId: string; createdAt?: string; payment?: ConsultationPaymentInput },
): ConsultationSession {
  const slot = platform.clinicianAvailabilitySlots.find((candidate) => candidate.id === input.availabilitySlotId);
  if (!slot) {
    throw new Error(`Unknown availability slot: ${input.availabilitySlotId}`);
  }
  if (slot.status !== "available") {
    throw new Error("Availability slot is not bookable");
  }
  const clinician = platform.clinicians.find((candidate) => candidate.id === slot.clinicianId);
  if (!clinician || !isPublicDirectoryClinician(clinician)) {
    throw new Error("Availability slot is not public");
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
    throw new Error("Consultation access denied");
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
    throw new Error("Patient is not assigned to consultation");
  }
  if (resolvedActor.role === "clinician" && resolvedActor.id !== session.clinicianId) {
    throw new Error("Clinician is not assigned to consultation");
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
    throw new Error("Consultation chat is not active");
  }
  if (resolvedActor.role === "user" && resolvedActor.id !== session.patientUserId) {
    throw new Error("Patient is not assigned to consultation");
  }
  if (resolvedActor.role === "clinician" && resolvedActor.id !== session.clinicianId) {
    throw new Error("Clinician is not assigned to consultation");
  }

  const message: ConsultationMessage = {
    id: `msg_${demoTokenId()}`,
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

export interface ClinicianPlanInput {
  title: string;
  dayLabel: string;
  actionIds: string[];
  precautions: string[];
  progressionCriteria: string[];
  createdAt?: string;
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
    throw new Error("Consultation has not been activated");
  }
  if (
    resolvedActor.role !== "clinician" ||
    resolvedActor.credentialStatus !== "verified" ||
    session.clinicianId !== resolvedActor.id ||
    !authorization.accessMode.includes("plan_create") ||
    !canAccessAuthorizedCase(resolvedActor, authorization, session.caseId, createdAt)
  ) {
    throw new Error("Clinician cannot create plan for consultation");
  }

  const actions = input.actionIds.map((id) => {
    const action = platform.actionLibrary.find((candidate) => candidate.id === id);
    if (!action) {
      throw new Error(`Unknown action: ${id}`);
    }
    return action;
  });
  if (actions.length === 0) {
    throw new Error("At least one action is required");
  }

  const plan = createTrainingPlan({
    id: `plan_${demoTokenId()}`,
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
      id: `msg_${demoTokenId()}`,
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
    throw new Error("Plan access denied");
  }
  if (plan.status !== "sent_to_patient") {
    throw new Error("Plan is not awaiting patient confirmation");
  }

  const accepted = { ...plan, status: "accepted" as const, acceptedAt: canonicalAcceptedAt };
  platform.trainingPlans = platform.trainingPlans.map((candidate) => (candidate.id === planId ? accepted : candidate));
  rememberTrainingPlan(platform, resolvedActor.id, {
    id: accepted.id,
    caseId: accepted.caseId,
    categoryId: inferCategoryFromTrainingPlan(accepted),
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
    throw new Error("Plan access denied");
  }
  if (plan.status !== "sent_to_patient") {
    throw new Error("Plan is not awaiting patient confirmation");
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
    throw new Error(`Unknown patient: ${patientUserId}`);
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
    throw new Error(`Unknown consultation: ${sessionId}`);
  }
  return session;
}

function resolveFreshConsultationActor(platform: PlatformDemo, actor: unknown): AuthenticatedActor {
  if (!actor || typeof actor !== "object") {
    throw new Error("Invalid consultation actor");
  }
  const candidate = actor as { id?: unknown; role?: unknown };
  if (typeof candidate.id !== "string") {
    throw new Error("Invalid consultation actor");
  }
  if (candidate.role !== "user" && candidate.role !== "clinician") {
    throw new Error("Invalid consultation actor");
  }
  return resolveActorById(platform, candidate.id, candidate.role);
}

function requireVerifiedClinicianForConsultation(actor: AuthenticatedActor): void {
  if (actor.role === "clinician" && actor.credentialStatus !== "verified") {
    throw new Error("Clinician credential is not verified");
  }
}

function requireAuthorization(platform: PlatformDemo, sessionId: string): CaseAuthorization {
  const authorization = platform.caseAuthorizations.find(
    (candidate) => candidate.consultationSessionId === sessionId,
  );
  if (!authorization) {
    throw new Error(`Missing authorization for consultation: ${sessionId}`);
  }
  return authorization;
}

function replaceConsultation(platform: PlatformDemo, session: ConsultationSession): void {
  platform.consultations = platform.consultations.map((candidate) =>
    candidate.id === session.id ? session : candidate,
  );
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function rangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return (
    new Date(leftStart).getTime() < new Date(rightEnd).getTime() &&
    new Date(rightStart).getTime() < new Date(leftEnd).getTime()
  );
}

function requireCanonicalIso(value: string, label: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function inferCategoryFromTrainingPlan(_plan: TrainingPlan): RehabConsultCategory {
  return "knee";
}

function demoTokenId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export async function runAssessmentWorkflow(
  platform: PlatformDemo,
  input: AssessmentWorkflowInput,
): Promise<AssessmentWorkflowResult> {
  const user = platform.users.find((candidate) => candidate.id === input.userId);
  if (!user) {
    throw new Error(`Unknown user: ${input.userId}`);
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

export class QwenChatClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: QwenChatClientOptions = {}) {
    loadLocalEnv();
    this.apiKey = options.apiKey ?? process.env.DASHSCOPE_API_KEY ?? "";
    this.model = options.model ?? process.env.DASHSCOPE_MODEL ?? "qwen3.7-plus";
    this.baseUrl =
      options.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.DASHSCOPE_TIMEOUT_MS ?? 25000);
  }

  async chat(messages: ChatMessage[], context: ChatContext = {}): Promise<GuidedChatResult> {
    const localSafetyResponse = buildLocalSafetyResponse(messages, context);
    if (localSafetyResponse) {
      return localSafetyResponse;
    }

    if (!this.apiKey) {
      throw new Error("DASHSCOPE_API_KEY is required for Qwen chat.");
    }

    const effectiveContext =
      context.ragContext && context.ragContext.length > 0
        ? context
        : { ...context, ragContext: buildChatRagContext(messages, context.category) };

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetcher(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: buildChatSystemPrompt(effectiveContext),
            },
            ...messages,
          ],
          temperature: 0.2,
        }),
      });
    } catch (error) {
      if (timedOut) {
        throw new Error(`DashScope chat timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DashScope chat failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("DashScope chat returned an empty response.");
    }
    return {
      ...buildGuidedChatResponse(messages, effectiveContext, content),
      model: this.model,
    };
  }
}

export async function chatWithQwen(
  messages: ChatMessage[],
  context: ChatContext = {},
  options: QwenChatClientOptions = {},
): Promise<GuidedChatResult> {
  return new QwenChatClient(options).chat(messages, context);
}

export function buildChatSystemPrompt(context: ChatContext = {}): string {
  const category = context.category ? REHAB_CONSULT_CATEGORIES[context.category] : undefined;
  const categoryScope = category
    ? [
        `当前咨询类别：${category.label}`,
        `类别范围：${category.scope}`,
        `回答时只围绕${category.label}相关的运动康复教育、风险分层、训练调整和就医提醒。`,
        "如果用户的问题明显超出该类别，请先说明当前对话已锁定此类别，并建议用户切换咨询类别后再继续。",
      ].join("\n")
    : "当前咨询类别：未选择。请先引导用户选择膝盖、脚踝、肩膀、腰背或髋部等咨询类别。";
  const ragContext = formatRagContext(context.ragContext ?? []);

  return [
    "你是 Mentis Rehab 的运动康复 AI 助手。你提供康复教育、风险分层、训练建议和就医提醒；不能下诊断、不能替代医生或康复师。遇到红旗症状时，优先建议线下就医。",
    [
      "说话规则：使用中文，简短、温和、实用。",
      "不要使用 Markdown、加粗符号、标题、表格或长编号列表。",
      "一次只问一个主要问题。",
      "需要继续评估时，优先给出可点击选项。",
      "如果用户询问你使用的模型、底层大模型、供应商或技术来源，只回答：我使用的是 Mentis 特调的 AI 康复模型。",
      "不要提及千问、Qwen、DashScope、DeepSeek、OpenAI 或任何底层模型/供应商名称。",
    ].join("\n"),
    categoryScope,
    ragContext
      ? `可用 RAG 证据：\n${ragContext}\n回答应优先使用这些证据，并在需要时提及来源。`
      : "当前第一版还没有接入实时 RAG 检索。不要编造 RAG 引用、论文名、页码或不存在的证据来源。",
  ].join("\n\n");
}

export function buildGuidedChatResponse(
  messages: ChatMessage[],
  context: ChatContext = {},
  modelContent = "",
): GuidedChatResult {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestUserContent = latestUserMessage?.content.trim() ?? "";
  const category = context.category;
  const content = sanitizeAssistantContent(
    modelContent || initialGuidedContent(category, latestUserContent),
  );

  if (category === "ankle") {
    if (isNegativeChoice(latestUserContent)) {
      return {
        content: "这个情况需要先排除骨折或较重韧带损伤。请暂停训练，尽快做线下评估。",
        model: "guided-template",
        assessmentStep: "ankle_urgent_referral",
      };
    }

    return {
      content,
      model: "guided-template",
      assessmentStep: "ankle_weight_bearing",
      question: "现在能连续走 4 步吗？",
      options: yesNoUnsureOptions("ankle_weight_bearing"),
    };
  }

  if (category === "knee") {
    return buildKneeGuidedChatResponse(messages, latestUserContent, content);
  }

  return {
    content,
    model: "guided-template",
  };
}

export function sanitizeAssistantContent(content: string): string {
  return content
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\|/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
}

function initialGuidedContent(category: RehabConsultCategory | undefined, latestUserContent: string): string {
  if (category === "ankle") {
    return latestUserContent.includes("肿")
      ? "了解，崴脚后肿胀很常见。我们先确认有没有需要线下评估的信号。"
      : "先从安全筛查开始，确认脚踝能不能承重。";
  }
  if (category === "knee") {
    if (shouldAskKneeWeightBearingFirst(latestUserContent)) {
      return "先确认一个安全问题，再决定是否适合继续做训练调整。";
    }
    return "伸直时疼痛位置很关键。先把位置分清，再判断疼痛强度和诱发动作。";
  }
  return "我先帮你做一个简短安全筛查。";
}

function yesNoUnsureOptions(step: string): ChatOption[] {
  return [
    { id: `${step}_yes`, label: "能", value: "能" },
    { id: `${step}_no`, label: "不能", value: "不能" },
    { id: `${step}_unsure`, label: "不确定", value: "不确定" },
  ];
}

function buildKneeGuidedChatResponse(
  messages: ChatMessage[],
  latestUserContent: string,
  content: string,
): GuidedChatResult {
  const previousStep = latestAssistantAssessmentStep(messages);

  if (previousStep === "knee_plan_offer") {
    if (isAcceptChoice(latestUserContent)) {
      return {
        content: "已加入今日计划。先按低刺激方案执行，训练中疼痛控制在可接受范围，第二天不明显加重再推进。",
        model: "guided-template",
        assessmentStep: "knee_plan_accepted",
        planPatch: buildConservativeKneePlanPatch(),
      };
    }
    return {
      content: "好的，先不加入计划。你可以继续补充疼痛变化，或等症状更稳定后再生成训练安排。",
      model: "guided-template",
      assessmentStep: "knee_plan_declined",
    };
  }

  if (previousStep === "knee_training_load") {
    return {
      content:
        "信息够做一个保守版起步方案了：先降低跑跳和下楼刺激，保留不加重疼痛的活动度与轻力量训练。",
      model: "guided-template",
      assessmentStep: "knee_plan_offer",
      question: "要把这份膝盖保守运动处方加入今日计划吗？",
      options: [
        { id: "knee_plan_accept", label: "接受", value: "接受" },
        { id: "knee_plan_decline", label: "先不接受", value: "先不接受" },
      ],
    };
  }

  if (previousStep === "knee_trigger") {
    return {
      content: "明白了。再确认训练背景，方便把建议限定在合适负荷。",
      model: "guided-template",
      assessmentStep: "knee_training_load",
      question: "最近 7 天跑步、跳跃或下肢训练量有没有明显增加？",
      options: [
        { id: "knee_load_increased", label: "明显增加", value: "最近训练量明显增加" },
        { id: "knee_load_same", label: "差不多", value: "最近训练量差不多" },
        { id: "knee_load_decreased", label: "已经减少", value: "最近已经减少训练" },
        { id: "knee_load_none", label: "基本没训练", value: "最近基本没训练" },
      ],
    };
  }

  if (previousStep === "knee_pain_score") {
    return {
      content: "收到。接下来确认诱发动作，这比单看疼痛分数更能帮助调整训练。",
      model: "guided-template",
      assessmentStep: "knee_trigger",
      question: "哪个动作最容易诱发这次膝盖疼？",
      options: [
        { id: "knee_trigger_extension", label: "伸直膝盖", value: "伸直膝盖时疼" },
        { id: "knee_trigger_stairs", label: "上下楼", value: "上下楼时疼" },
        { id: "knee_trigger_squat", label: "深蹲", value: "深蹲时疼" },
        { id: "knee_trigger_run", label: "跑步", value: "跑步时疼" },
        { id: "knee_trigger_after", label: "运动后", value: "运动后疼" },
      ],
    };
  }

  if (previousStep === "knee_pain_location") {
    return {
      content: "位置先记下。现在用疼痛分数判断刺激强度。",
      model: "guided-template",
      assessmentStep: "knee_pain_score",
      question: "按 0-10 分算，现在或诱发时大概几分？",
      options: [
        { id: "knee_score_mild", label: "0-3 分", value: "0-3 分" },
        { id: "knee_score_moderate", label: "4-6 分", value: "4-6 分" },
        { id: "knee_score_high", label: "7-10 分", value: "7-10 分" },
        { id: "knee_score_unsure", label: "说不准", value: "疼痛分数说不准" },
      ],
    };
  }

  if (previousStep === "knee_weight_bearing") {
    if (isNegativeChoice(latestUserContent)) {
      return {
        content: "如果现在不能承重走路，需要先排除较重损伤。请暂停训练，优先线下评估。",
        model: "guided-template",
        assessmentStep: "knee_urgent_referral",
      };
    }
    return kneePainLocationStep(content, hasExtensionPain(messages));
  }

  if (mentionsCannotBearWeight(latestUserContent)) {
    return {
      content: "不能正常承重走路属于需要谨慎处理的信号。请先暂停训练，优先线下评估。",
      model: "guided-template",
      assessmentStep: "knee_urgent_referral",
    };
  }

  if (shouldAskKneeWeightBearingFirst(latestUserContent)) {
    return {
      content,
      model: "guided-template",
      assessmentStep: "knee_weight_bearing",
      question: "现在能正常承重走路吗？",
      options: yesNoUnsureOptions("knee_weight_bearing"),
    };
  }

  return kneePainLocationStep(content, hasExtensionPain(messages));
}

function kneePainLocationStep(content: string, extensionPain: boolean): GuidedChatResult {
  return {
    content,
    model: "guided-template",
    assessmentStep: "knee_pain_location",
    question: extensionPain ? "伸直膝盖时，最明显疼痛位置在哪里？" : "现在膝盖最明显疼痛位置在哪里？",
    options: [
      { id: "knee_location_front", label: "膝盖前方", value: "膝盖前方疼" },
      { id: "knee_location_back", label: "膝盖后方", value: "膝盖后方疼" },
      { id: "knee_location_inside", label: "内侧", value: "膝盖内侧疼" },
      { id: "knee_location_outside", label: "外侧", value: "膝盖外侧疼" },
      { id: "knee_location_deep", label: "关节里面", value: "感觉在关节里面疼" },
      { id: "knee_location_unsure", label: "说不清", value: "疼痛位置说不清" },
    ],
  };
}

function buildConservativeKneePlanPatch(): ChatPlanPatch {
  return {
    title: "膝盖保守恢复计划",
    dayLabel: "第 1 天",
    completionPercent: 0,
    items: [
      { title: "暂停跑跳与深蹲刺激", meta: "24-48 小时观察疼痛和肿胀反应", state: "todo" },
      { title: "温和膝关节活动", meta: "坐姿伸屈或脚跟滑动 2 组，每组 10-12 次", state: "todo" },
      { title: "低负荷股四头肌激活", meta: "无痛范围等长收缩 5 秒 x 8-10 次", state: "todo" },
    ],
    stage: {
      name: "镇痛与负荷管理",
      progressLabel: "起步观察期",
      progressPercent: 12,
      goals: ["疼痛不超过 3/10", "第二天不明显加重", "恢复可控伸直与日常步行"],
    },
  };
}

function latestAssistantAssessmentStep(messages: ChatMessage[]): string | undefined {
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!latestAssistant) {
    return undefined;
  }
  if (latestAssistant.assessmentStep) {
    return latestAssistant.assessmentStep;
  }
  const text = `${latestAssistant.content}\n${latestAssistant.question ?? ""}`;
  if (/承重|走路/.test(text)) {
    return "knee_weight_bearing";
  }
  if (/位置|哪里疼/.test(text)) {
    return "knee_pain_location";
  }
  if (/几分|0-10|疼痛分数/.test(text)) {
    return "knee_pain_score";
  }
  if (/诱发|动作/.test(text)) {
    return "knee_trigger";
  }
  if (/训练量|最近 7 天/.test(text)) {
    return "knee_training_load";
  }
  if (/加入今日计划|运动处方/.test(text)) {
    return "knee_plan_offer";
  }
  return undefined;
}

function shouldAskKneeWeightBearingFirst(content: string): boolean {
  return /摔|撞|扭|崴|外伤|受伤|肿|肿胀|积液|突然/.test(content);
}

function hasExtensionPain(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === "user" && /伸直|打直|伸膝/.test(message.content));
}

function mentionsCannotBearWeight(content: string): boolean {
  return /(不能|无法|没法|走不了).{0,6}(承重|走路|走|站)|(?:承重|走路|站).{0,6}(不能|无法|没法)/.test(content);
}

function isAcceptChoice(content: string): boolean {
  return /接受|加入|可以|确认|同意/.test(content);
}

function isNegativeChoice(content: string): boolean {
  return /不能|不行|走不了|无法/.test(content);
}

function isAcceptedPrescriptionStatus(status: string): boolean {
  return /处方已接受|已接受运动处方|计划已接受/.test(status);
}

function buildLocalSafetyResponse(messages: ChatMessage[], context: ChatContext): GuidedChatResult | null {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestUserContent = latestUserMessage?.content.trim() ?? "";
  if (isModelIdentityQuestion(latestUserContent)) {
    return {
      content: "我使用的是 Mentis 特调的 AI 康复模型。",
      model: "mentis-rehab",
    };
  }
  if (context.category === "ankle" && isAcuteAnkleScreening(latestUserContent)) {
    return buildGuidedChatResponse(messages, context);
  }
  if (context.category === "knee" && isKneeGuidedAssessment(messages, latestUserContent)) {
    return buildGuidedChatResponse(messages, context);
  }
  if (!isNegativeChoice(latestUserContent)) {
    return null;
  }
  if (context.category !== "ankle" && context.category !== "knee") {
    return null;
  }
  return buildGuidedChatResponse(messages, context);
}

function isAcuteAnkleScreening(content: string): boolean {
  return /崴脚|扭伤|扭了|肿/.test(content);
}

function isKneeGuidedAssessment(messages: ChatMessage[], latestUserContent: string): boolean {
  return Boolean(
    latestAssistantAssessmentStep(messages) ||
      /膝|伸直|打直|伸膝|上下楼|下楼|深蹲|跑步|跑后|髌|半月板|前方疼|后方疼|内侧疼|外侧疼/.test(
        latestUserContent,
      ),
  );
}

function isModelIdentityQuestion(content: string): boolean {
  return /什么.*模型|哪个.*模型|模型.*来源|底层.*模型|用.*模型|供应商|千问|Qwen|DashScope|OpenAI|DeepSeek/i.test(content);
}

function formatRagContext(snippets: RagEvidenceSnippet[]): string {
  return snippets
    .filter((snippet) => snippet.text.trim())
    .slice(0, 5)
    .map((snippet, index) => {
      const page = snippet.page ? `, page ${snippet.page}` : "";
      return `${index + 1}. ${snippet.source}${page}\n${snippet.text.trim()}`;
    })
    .join("\n\n");
}

export interface LocalRagSearchOptions {
  indexPath?: string;
  topK?: number;
}

type LocalRagChunk = {
  id: string;
  source: string;
  text: string;
  metadata?: Record<string, unknown>;
};

type LoadedLocalRagIndex = {
  chunks: LocalRagChunk[];
  chunkTerms: Map<string, number>[];
  docFreq: Map<string, number>;
};

const DEFAULT_RAG_INDEX_PATH = "/Users/rez/Documents/RAG/rag/data/rehab_books_index.json";
const loadedRagIndexes = new Map<string, LoadedLocalRagIndex>();

export function buildChatRagContext(
  messages: ChatMessage[],
  category?: RehabConsultCategory,
  options: LocalRagSearchOptions = {},
): RagEvidenceSnippet[] {
  if (category !== "knee") {
    return [];
  }
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const query = [
    latestUserMessage?.content ?? "",
    "knee patellofemoral pain extension extensor load exercise rehabilitation",
  ]
    .join(" ")
    .trim();
  return searchLocalRag(query, options);
}

export function searchLocalRag(query: string, options: LocalRagSearchOptions = {}): RagEvidenceSnippet[] {
  const topK = options.topK ?? 4;
  if (topK <= 0 || !query.trim()) {
    return [];
  }
  const indexPath = options.indexPath ?? process.env.MENTIS_RAG_INDEX_PATH ?? DEFAULT_RAG_INDEX_PATH;
  if (!existsSync(indexPath)) {
    return [];
  }

  const index = loadLocalRagIndex(indexPath);
  const queryTerms = termCounts(tokenizeForLocalRag(query));
  const queryVector = tfidfVector(queryTerms, index.docFreq, index.chunks.length);
  const queryNorm = vectorNorm(queryVector);
  if (queryNorm === 0) {
    return [];
  }

  return index.chunks
    .map((chunk, indexNumber) => {
      const chunkVector = tfidfVector(index.chunkTerms[indexNumber], index.docFreq, index.chunks.length);
      const chunkNorm = vectorNorm(chunkVector);
      const score = chunkNorm === 0 ? 0 : dotProduct(queryVector, chunkVector) / (queryNorm * chunkNorm);
      return { chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({
      source: String(chunk.metadata?.file ?? chunk.source),
      page: typeof chunk.metadata?.page === "string" || typeof chunk.metadata?.page === "number" ? chunk.metadata.page : undefined,
      text: chunk.text,
      score,
      evidenceType: typeof chunk.metadata?.evidence_type === "string" ? chunk.metadata.evidence_type : undefined,
    }));
}

function loadLocalRagIndex(indexPath: string): LoadedLocalRagIndex {
  const cached = loadedRagIndexes.get(indexPath);
  if (cached) {
    return cached;
  }
  const payload = JSON.parse(readFileSync(indexPath, "utf-8")) as { chunks?: LocalRagChunk[] };
  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  const docFreq = new Map<string, number>();
  const chunkTerms = chunks.map((chunk) => {
    const terms = termCounts(tokenizeForLocalRag(searchableRagChunkText(chunk)));
    for (const term of terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
    return terms;
  });
  const loaded = { chunks, chunkTerms, docFreq };
  loadedRagIndexes.set(indexPath, loaded);
  return loaded;
}

function searchableRagChunkText(chunk: LocalRagChunk): string {
  const metadataText = Object.values(chunk.metadata ?? {})
    .filter(Boolean)
    .join(" ");
  return `${chunk.source}\n${metadataText}\n${chunk.text}`;
}

function tokenizeForLocalRag(text: string): string[] {
  const rawTokens = text.toLowerCase().match(/[a-zA-Z0-9_]+|[\u4e00-\u9fff]/gu) ?? [];
  const cjkChars = rawTokens.filter((token) => token.length === 1 && token >= "\u4e00" && token <= "\u9fff");
  const cjkBigrams = cjkChars.slice(0, -1).map((token, index) => `${token}${cjkChars[index + 1]}`);
  return [...rawTokens, ...cjkBigrams];
}

function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function tfidfVector(terms: Map<string, number>, docFreq: Map<string, number>, docCount: number): Map<string, number> {
  const total = Array.from(terms.values()).reduce((sum, value) => sum + value, 0);
  const vector = new Map<string, number>();
  if (total === 0) {
    return vector;
  }
  for (const [term, count] of terms.entries()) {
    const tf = count / total;
    const idf = Math.log((docCount + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;
    vector.set(term, tf * idf);
  }
  return vector;
}

function vectorNorm(vector: Map<string, number>): number {
  return Math.sqrt(Array.from(vector.values()).reduce((sum, value) => sum + value * value, 0));
}

function dotProduct(left: Map<string, number>, right: Map<string, number>): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let total = 0;
  for (const [term, value] of small.entries()) {
    total += value * (large.get(term) ?? 0);
  }
  return total;
}

function loadLocalEnv() {
  const envPath = findUp(".env.local", process.cwd());
  if (!existsSync(envPath)) {
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function findUp(fileName: string, startDir: string): string {
  let current = resolve(startDir);
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return candidate;
    }
    current = dirname(current);
  }
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
