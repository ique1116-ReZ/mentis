export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  question?: string;
  options?: ChatOption[];
  recommendedActions?: ChatRecommendedAction[];
  assessmentStep?: string;
  planPatch?: ChatPlanPatch;
};

export type ChatOption = {
  id: string;
  label: string;
  value: string;
};

export type ChatRecommendedAction = {
  actionId?: string;
  title: string;
  bodyRegion: ActionBodyRegion;
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  tags: string[];
  reason?: string;
  actionType?: "stretch" | "strength" | "activation" | "mobility" | "balance";
  targetMuscles?: string[];
};

export type ChatPlanPatch = Partial<CasePlan>;

export type AppPage = "home" | "plans" | "records";
export type ClinicianPage = "home" | "calendar" | "training";

export type AuthRole = "user" | "clinician" | "organization" | "admin";

export type AuthUser = {
  id: string;
  role: AuthRole;
  displayName: string;
  profile?: UserProfile;
  credentialStatus?: "pending" | "verified" | "rejected" | "suspended";
  publicDirectoryVisible?: boolean;
};

export type UserProfile = {
  heightCm: string;
  weightKg: string;
};

export type RegisterInput = UserProfile & {
  accountRole: "user" | "clinician";
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
};

export type MemoryCaseSummary = {
  id: string;
  categoryId: RehabConsultCategoryId;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
};

export type UserMemory = {
  userId: string;
  profileSummary: string;
  clinicalSummary: string;
  activePlanSummary: string;
  recentEvents: MemoryEvent[];
  cases: MemoryCaseSummary[];
  trainingPlans: MemoryTrainingPlan[];
  notes: string[];
  updatedAt: string;
};

export type MemoryEvent = {
  id: string;
  type: "case_updated" | "plan_updated" | "note_updated";
  summary: string;
  createdAt: string;
};

export type MemoryTrainingPlan = {
  id: string;
  caseId: string;
  categoryId: RehabConsultCategoryId;
  title: string;
  status: "active" | "paused" | "completed";
  dayLabel: string;
  completionPercent: number;
  items: CasePlanItem[];
  stage: CasePlan["stage"];
  updatedAt: string;
  completions?: { date: string; doneKeys: string[] }[];
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  memory: UserMemory;
};

export type RehabConsultCategoryId = "knee" | "ankle" | "shoulder" | "lower_back" | "hip";

export type RehabConsultCategory = {
  id: RehabConsultCategoryId;
  label: string;
  description: string;
  examples: string[];
  mark: string;
  enabled: boolean;
};

export type CasePlanItem = {
  actionId?: string;
  title: string;
  meta: string;
  state: "done" | "todo";
  phase?: string;
  instructions?: string[];
  contraindications?: string[];
  progressionCriteria?: string[];
};

export type CasePlan = {
  title: string;
  dayLabel: string;
  completionPercent: number;
  items: CasePlanItem[];
  stage: {
    name: string;
    progressLabel: string;
    progressPercent: number;
    goals: string[];
  };
};

export type PatientCase = {
  id: string;
  categoryId: RehabConsultCategoryId;
  title: string;
  summary: string;
  createdAt: string;
  status: string;
  messages: ChatMessage[];
  messagesLoaded?: boolean;
  plan: CasePlan | null;
};

export type ConsultationSession = {
  id: string;
  patientUserId: string;
  clinicianId: string;
  caseId: string;
  status: "scheduled" | "waiting_clinician" | "active" | "expired" | "closed" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "paid" | "waived" | "refunded";
  paymentMode: "free_test" | "paid";
  paymentAmountCents?: number;
  paymentOrderId?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  activatedAt?: string;
  expiresAt?: string;
};

export type ClinicianDirectoryEntry = {
  id: string;
  displayName: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
  specialties: string[];
  isOnline: boolean;
  nextAvailableAt?: string;
};

export type ClinicianAvailabilitySlot = {
  id: string;
  clinicianId: string;
  startsAt: string;
  endsAt: string;
  status: "available" | "booked" | "blocked";
  createdAt: string;
  bookedConsultationSessionId?: string;
};

export type ConsultationMessage = {
  id: string;
  consultationSessionId: string;
  senderId: string;
  senderRole: "user" | "clinician" | "system";
  content: string;
  kind: "text" | "system_notice" | "plan_offer";
  createdAt: string;
};

export type TrainingPlan = {
  id: string;
  caseId: string;
  patientUserId: string;
  source: "ai_generated" | "clinician_custom";
  authorId: string;
  authorRole: "ai" | "clinician";
  status: "draft" | "sent_to_patient" | "accepted" | "declined" | "archived";
  title: string;
  dayLabel: string;
  items: CasePlanItem[];
  stage: CasePlan["stage"];
  precautions: string[];
  progressionCriteria: string[];
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
};

export type ActionLibraryItem = {
  id: string;
  title: string;
  bodyRegion: ActionBodyRegion;
  phase: string;
  defaultDosage: string;
  instructions: string[];
  precautions: string[];
  progressionCriteria: string[];
  tags: string[];
};

export type ActionBodyRegion = "knee" | "ankle_foot" | "hip" | "spine" | "shoulder" | "other";

export type ActionBodyPartFilter = {
  id: string;
  label: string;
  bodyRegions?: ActionBodyRegion[];
  tags?: string[];
};

export type ClinicianWorkoutItem = {
  id: string;
  actionId: string;
  sets: number;
  reps: string;
  load: string;
  notes: string;
};

export type ClinicianWorkoutTemplate = {
  id: string;
  name: string;
  summary: string;
  items: ClinicianWorkoutItem[];
  updatedAt: string;
};

export type AdminClinicianReviewItem = {
  id: string;
  displayName: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
  specialties: string[];
  credentialStatus: "pending" | "verified" | "rejected" | "suspended";
  publicDirectoryVisible: boolean;
  registeredAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

export type ConsultationSnapshot = {
  session: ConsultationSession;
  patient: Pick<AuthUser, "id" | "displayName" | "profile">;
  caseSummary?: MemoryCaseSummary;
  messages: ConsultationMessage[];
  plans: TrainingPlan[];
  // Omitted from the SSE stream to keep polling ticks small; only present on the one-shot GET.
  actionLibrary?: ActionLibraryItem[];
};
