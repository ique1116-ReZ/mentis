import type {
  Assessment,
  ActionLibraryItem,
  AuditEvent,
  CaseAuthorization,
  Clinician,
  ClinicianAvailabilitySlot,
  ConsultationMessage,
  ConsultationPaymentMode,
  ConsultationSession,
  PlatformActor,
  RehabPlan,
  TriageResult,
  TrainingPlan,
  User,
} from "@mentis/domain";

export type {
  ActionLibraryItem,
  AuditEvent,
  CaseAuthorization,
  Clinician,
  ClinicianAvailabilitySlot,
  ConsultationMessage,
  ConsultationPaymentMode,
  ConsultationSession,
  PlatformActor,
  RehabPlan,
  TriageResult,
  TrainingPlan,
  User,
} from "@mentis/domain";

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
  auditEvents: AuditEvent[];
  caseMessages: Record<string, StoredCaseMessage[]>;
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
  expiresAt: string;
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

export interface MemoryEvent {
  id: string;
  type: "case_updated" | "plan_updated" | "note_updated";
  summary: string;
  createdAt: string;
}

export interface UserMemory {
  userId: string;
  profileSummary: string;
  clinicalSummary: string;
  activePlanSummary: string;
  recentEvents: MemoryEvent[];
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

export interface StoredCaseMessage {
  role: ChatRole;
  content: string;
  question?: string;
  assessmentStep?: string;
  options?: ChatOption[];
  recommendedActions?: ChatRecommendedAction[];
  createdAt: string;
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

export interface ChatRecommendedAction {
  actionId?: string;
  title: string;
  bodyRegion: ActionLibraryItem["bodyRegion"];
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  tags: string[];
  reason?: string;
}

export interface GuidedChatResult extends ChatResult {
  question?: string;
  options?: ChatOption[];
  assessmentStep?: string;
  planPatch?: ChatPlanPatch;
  recommendedActions?: ChatRecommendedAction[];
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
  actionLibrary?: ActionLibraryItem[];
  userMemory?: UserMemory;
}

export interface QwenChatClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
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

export interface ClinicianPlanInput {
  title: string;
  dayLabel: string;
  actionIds: string[];
  precautions: string[];
  progressionCriteria: string[];
  createdAt?: string;
}

export interface LocalRagSearchOptions {
  indexPath?: string;
  topK?: number;
}
