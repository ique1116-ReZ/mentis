import { useEffect, useRef, useState } from "react";
import mentisMark from "./assets/mentis-mark-transparent.png";
import rezLogo from "./assets/rez-logo.png";
import { evidence } from "./data";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  question?: string;
  options?: ChatOption[];
  assessmentStep?: string;
  planPatch?: ChatPlanPatch;
};

type ChatOption = {
  id: string;
  label: string;
  value: string;
};

type ChatPlanPatch = Partial<CasePlan>;

type AppPage = "home" | "plans" | "records";
type ClinicianPage = "home" | "calendar" | "training";

type AuthRole = "user" | "clinician" | "organization" | "admin";

type AuthUser = {
  id: string;
  role: AuthRole;
  displayName: string;
  profile?: UserProfile;
  credentialStatus?: "pending" | "verified" | "rejected" | "suspended";
  publicDirectoryVisible?: boolean;
};

type UserProfile = {
  heightCm: string;
  weightKg: string;
};

type RegisterInput = UserProfile & {
  accountRole: "user" | "clinician";
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
};

type MemoryCaseSummary = {
  id: string;
  categoryId: RehabConsultCategoryId;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
};

type UserMemory = {
  userId: string;
  cases: MemoryCaseSummary[];
  trainingPlans: MemoryTrainingPlan[];
  notes: string[];
  updatedAt: string;
};

type MemoryTrainingPlan = {
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
};

type AuthSession = {
  token: string;
  user: AuthUser;
  memory: UserMemory;
};

type RehabConsultCategoryId = "knee" | "ankle" | "shoulder" | "lower_back" | "hip";

type RehabConsultCategory = {
  id: RehabConsultCategoryId;
  label: string;
  description: string;
  examples: string[];
  mark: string;
  enabled: boolean;
};

type CasePlanItem = {
  title: string;
  meta: string;
  state: "done" | "todo";
};

type CasePlan = {
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

type PatientCase = {
  id: string;
  categoryId: RehabConsultCategoryId;
  title: string;
  summary: string;
  createdAt: string;
  status: string;
  messages: ChatMessage[];
  plan: CasePlan | null;
};

type ConsultationSession = {
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

type ClinicianDirectoryEntry = {
  id: string;
  displayName: string;
  discipline?: string;
  credentialSummary?: string;
  organizationName?: string;
  specialties: string[];
  isOnline: boolean;
  nextAvailableAt?: string;
};

type ClinicianAvailabilitySlot = {
  id: string;
  clinicianId: string;
  startsAt: string;
  endsAt: string;
  status: "available" | "booked" | "blocked";
  createdAt: string;
  bookedConsultationSessionId?: string;
};

type ConsultationMessage = {
  id: string;
  consultationSessionId: string;
  senderId: string;
  senderRole: "user" | "clinician" | "system";
  content: string;
  kind: "text" | "system_notice" | "plan_offer";
  createdAt: string;
};

type TrainingPlan = {
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

type ActionLibraryItem = {
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

type ActionBodyRegion = "knee" | "ankle_foot" | "hip" | "spine" | "shoulder" | "other";

type ActionBodyPartFilter = {
  id: string;
  label: string;
  bodyRegions?: ActionBodyRegion[];
  tags?: string[];
};

type ClinicianWorkoutItem = {
  id: string;
  actionId: string;
  sets: number;
  reps: string;
  load: string;
  notes: string;
};

type ClinicianWorkoutTemplate = {
  id: string;
  name: string;
  summary: string;
  items: ClinicianWorkoutItem[];
  updatedAt: string;
};

type AdminClinicianReviewItem = {
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

type ConsultationSnapshot = {
  session: ConsultationSession;
  patient: Pick<AuthUser, "id" | "displayName" | "profile">;
  caseSummary?: MemoryCaseSummary;
  messages: ConsultationMessage[];
  plans: TrainingPlan[];
  actionLibrary: ActionLibraryItem[];
};

const actionBodyPartFilters: ActionBodyPartFilter[] = [
  { id: "all", label: "全部" },
  { id: "cardio", label: "心肺", tags: ["cardio", "cardiovascular system"] },
  { id: "chest", label: "胸部", tags: ["chest", "pectorals"] },
  { id: "back", label: "背部", bodyRegions: ["spine"], tags: ["back", "lats", "traps", "upper back", "lower back"] },
  { id: "shoulders", label: "肩部", bodyRegions: ["shoulder"], tags: ["shoulders", "delts"] },
  { id: "arms", label: "手臂", tags: ["upper arms", "lower arms", "biceps", "triceps", "forearms"] },
  { id: "core", label: "核心", bodyRegions: ["spine"], tags: ["waist", "abs", "obliques"] },
  { id: "glutes", label: "臀部", bodyRegions: ["hip"], tags: ["glutes", "abductors", "adductors"] },
  { id: "quads", label: "股四头", bodyRegions: ["knee"], tags: ["quads"] },
  { id: "hamstrings", label: "腘绳肌", bodyRegions: ["knee"], tags: ["hamstrings"] },
  { id: "calves", label: "小腿", bodyRegions: ["ankle_foot"], tags: ["calves", "lower legs"] },
];

const consultCategories: RehabConsultCategory[] = [
  {
    id: "knee",
    label: "膝盖",
    description: "跑步膝、膝前痛、上下楼疼、深蹲不适",
    examples: ["跑步后膝前痛", "上下楼疼", "深蹲时不舒服"],
    mark: "膝",
    enabled: true,
  },
  {
    id: "ankle",
    label: "脚踝",
    description: "崴脚、跑后踝痛、踝稳定性、跟腱周围不适",
    examples: ["崴脚后多久能跑", "跑后外踝疼", "跟腱附近紧"],
    mark: "踝",
    enabled: false,
  },
  {
    id: "shoulder",
    label: "肩膀",
    description: "肩袖不适、举手疼、卧推或过顶动作疼痛",
    examples: ["卧推肩痛", "举手疼", "游泳后肩不舒服"],
    mark: "肩",
    enabled: false,
  },
  {
    id: "lower_back",
    label: "腰背",
    description: "训练后腰背疼、久坐腰痛、核心负荷管理",
    examples: ["硬拉后腰酸", "久坐腰痛", "跑步后下背紧"],
    mark: "腰",
    enabled: false,
  },
  {
    id: "hip",
    label: "髋部",
    description: "髋外侧痛、臀部深处痛、髋活动度与力量",
    examples: ["跑步髋外侧疼", "臀部深处痛", "髋前侧夹挤感"],
    mark: "髋",
    enabled: false,
  },
];

const quickReplies = ["调整今日计划", "疼痛管理建议", "如何判断是否过度训练", "联系康复师"];
const pendingComplaintTitle = "主诉待补充";
const clientBuildId = "2026-07-01-1353";

const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
const API_BASE = configuredApiBase || (import.meta.env.DEV ? "http://127.0.0.1:3001" : "https://api.aimentis.site");
const SESSION_STORAGE_KEY = "mentis_user_session";

function loadStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function App() {
  const [initialAppState] = useState(() => {
    const storedSession = loadStoredSession();
    const storedCases = storedSession?.user.role === "user" ? hydrateCasesFromMemory(storedSession.memory) : [];
    return {
      activeCaseId: storedCases[0]?.id ?? null,
      cases: storedCases,
      session: storedSession,
    };
  });
  const [session, setSession] = useState<AuthSession | null>(initialAppState.session);
  const [cases, setCases] = useState<PatientCase[]>(initialAppState.cases);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(initialAppState.activeCaseId);
  const [activePage, setActivePage] = useState<AppPage>("home");
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [consultationSnapshot, setConsultationSnapshot] = useState<ConsultationSnapshot | null>(null);
  const [consultationInput, setConsultationInput] = useState("");
  const [isConsultationBusy, setIsConsultationBusy] = useState(false);
  const [clinicians, setClinicians] = useState<ClinicianDirectoryEntry[]>([]);
  const [selectedClinicianId, setSelectedClinicianId] = useState<string | null>(null);
  const [clinicianAvailability, setClinicianAvailability] = useState<ClinicianAvailabilitySlot[]>([]);
  const [selectedAvailabilitySlotId, setSelectedAvailabilitySlotId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const consultationStreamRef = useRef<EventSource | null>(null);
  const activeCase = cases.find((patientCase) => patientCase.id === activeCaseId) ?? null;
  const selectedCategory = activeCase ? consultCategories.find((category) => category.id === activeCase.categoryId) ?? null : null;
  const messages = activeCase?.messages ?? [];
  const hasPrimaryComplaint = activeCase ? !isComplaintPending(activeCase) : false;
  const displayName = session?.user.displayName ?? "张运动";
  const profile = session?.user.profile;

  useEffect(() => {
    return () => {
      consultationStreamRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (session?.user.role === "user") {
      void refreshMemoryForCurrentUser();
      void loadClinicians();
      void loadPatientConsultations();
    }
  }, [session?.token, session?.user.role]);

  useEffect(() => {
    if (session?.user.role === "user" && selectedClinicianId) {
      void loadClinicianAvailability(selectedClinicianId);
    }
  }, [session?.token, session?.user.role, selectedClinicianId]);

  if (session?.user.role === "clinician") {
    return <ClinicianDashboard session={session} onLogout={logout} />;
  }

  if (session?.user.role === "admin") {
    return <AdminDashboard session={session} onLogout={logout} />;
  }

  function chooseCategory(category: RehabConsultCategory) {
    if (!category.enabled) {
      return;
    }

    const id = `${category.id}-${Date.now()}`;
    const newCase: PatientCase = {
      id,
      categoryId: category.id,
      title: pendingComplaintTitle,
      summary: "等待补充主要不适。",
      createdAt: new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date()),
      status: "咨询中",
      plan: null,
      messages: [
        {
          role: "assistant",
          content: `${displayName}，请直接输入你最想解决的不适。`,
        },
      ],
    };

    setCases((currentCases) => [newCase, ...currentCases]);
    setActiveCaseId(id);
    setInput("");
    syncViewportAfterChatChange();
    void rememberCaseForCurrentUser(newCase);
  }

  function selectCase(patientCase: PatientCase) {
    setActiveCaseId(patientCase.id);
    setActivePage("home");
    setInput("");
    syncViewportAfterChatChange();
  }

  function navigatePage(page: AppPage) {
    setActivePage(page);
    if (page !== "home") {
      void refreshMemoryForCurrentUser();
    }
  }

  function updateCaseMessages(caseId: string, nextMessages: ChatMessage[]) {
    setCases((currentCases) =>
      currentCases.map((patientCase) =>
        patientCase.id === caseId ? { ...patientCase, messages: nextMessages } : patientCase,
      ),
    );
  }

  function applyPlanPatch(caseId: string, planPatch: ChatPlanPatch) {
    if (!isCompletePlanPatch(planPatch)) {
      return;
    }

    setCases((currentCases) =>
      currentCases.map((patientCase) =>
        patientCase.id === caseId
          ? { ...patientCase, plan: planPatch, status: "运动处方已接受" }
          : patientCase,
      ),
    );
  }

  function resetCategory() {
    setActiveCaseId(null);
    setInput("");
    syncViewportAfterChatChange();
  }

  function syncViewportAfterChatChange() {
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    const restorePagePosition = () => window.scrollTo(pageX, pageY);

    requestAnimationFrame(() => {
      restorePagePosition();
      const scroller = chatScrollRef.current;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
      requestAnimationFrame(restorePagePosition);
      window.setTimeout(restorePagePosition, 80);
    });
  }

  async function sendMessage(text = input, options: { captureComplaint?: boolean } = {}) {
    const content = text.trim();
    if (!content || isSending || !activeCase || !selectedCategory) {
      return;
    }

    const sendingCase = activeCase;
    const sendingCategory = selectedCategory;
    const shouldCaptureComplaint = Boolean(options.captureComplaint) && isComplaintPending(sendingCase);
    const caseAfterUserInput = shouldCaptureComplaint
      ? {
          ...sendingCase,
          title: makeComplaintTitle(content),
          summary: makeComplaintSummary(content),
        }
      : sendingCase;
    const nextMessages: ChatMessage[] = [...sendingCase.messages, { role: "user", content }];
    setCases((currentCases) =>
      currentCases.map((patientCase) =>
        patientCase.id === sendingCase.id
          ? {
              ...patientCase,
              title: caseAfterUserInput.title,
              summary: caseAfterUserInput.summary,
              messages: nextMessages,
            }
          : patientCase,
      ),
    );
    setInput("");
    setIsSending(true);
    syncViewportAfterChatChange();
    if (shouldCaptureComplaint) {
      void rememberCaseForCurrentUser({ ...caseAfterUserInput, messages: nextMessages });
    }

    try {
      const response = await fetch(`${API_BASE}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session?.user.id,
          caseId: sendingCase.id,
          category: sendingCategory.id,
          messages: nextMessages.slice(-8),
        }),
      });
      if (!response.ok) {
        throw new Error(`chat_failed_${response.status}`);
      }
      const data = (await response.json()) as {
        content: string;
        question?: string;
        options?: ChatOption[];
        assessmentStep?: string;
        planPatch?: ChatPlanPatch;
      };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.content,
        question: data.question,
        options: Array.isArray(data.options) ? data.options : undefined,
        assessmentStep: data.assessmentStep,
        planPatch: data.planPatch,
      };
      updateCaseMessages(sendingCase.id, [...nextMessages, assistantMessage]);
      if (data.planPatch) {
        applyPlanPatch(sendingCase.id, data.planPatch);
        if (isCompletePlanPatch(data.planPatch)) {
          void rememberCaseForCurrentUser({
            ...caseAfterUserInput,
            messages: [...nextMessages, assistantMessage],
            plan: data.planPatch,
            status: "运动处方已接受",
          });
          void rememberTrainingPlanForCurrentUser(
            { ...caseAfterUserInput, messages: [...nextMessages, assistantMessage], plan: data.planPatch },
            data.planPatch,
          );
        }
      }
    } catch {
      updateCaseMessages(sendingCase.id, [
        ...nextMessages,
        {
          role: "assistant",
          content:
            "我这边暂时没有回复成功。你可以先记录疼痛评分、诱发动作和训练量；如果出现无法承重、明显肿胀或夜间加重，请优先线下就医。",
        },
      ]);
    } finally {
      setIsSending(false);
      syncViewportAfterChatChange();
    }
  }

  async function login(username: string, password: string) {
    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error("login_failed");
    }

    const nextSession = (await response.json()) as AuthSession;
    const hydratedCases = hydrateCasesFromMemory(nextSession.memory);
    setSession(nextSession);
    storeSession(nextSession);
    setCases(hydratedCases);
    setActiveCaseId(hydratedCases[0]?.id ?? null);
    setActivePage("home");
  }

  async function register(input: RegisterInput) {
    const response = await fetch(`${API_BASE}/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error("register_failed");
    }

    const nextSession = (await response.json()) as AuthSession;
    setSession(nextSession);
    storeSession(nextSession);
    setCases([]);
    setActiveCaseId(null);
    setActivePage("home");
    setInput("");
  }

  function logout() {
    consultationStreamRef.current?.close();
    setSession(null);
    storeSession(null);
    setCases([]);
    setActiveCaseId(null);
    setActivePage("home");
    setInput("");
    setActiveConsultationId(null);
    setConsultationSnapshot(null);
    setConsultationInput("");
  }

  function startConsultationStream(sessionId: string) {
    if (!session) {
      return;
    }
    consultationStreamRef.current?.close();
    const source = new EventSource(
      `${API_BASE}/v1/consultations/${encodeURIComponent(sessionId)}/events?token=${encodeURIComponent(session.token)}`,
    );
    source.addEventListener("snapshot", (event) => {
      setConsultationSnapshot(JSON.parse((event as MessageEvent).data) as ConsultationSnapshot);
    });
    source.addEventListener("error", () => {
      source.close();
    });
    consultationStreamRef.current = source;
  }

  async function bookConsultationForActiveCase() {
    if (!session || !activeCase || !selectedAvailabilitySlotId) {
      return;
    }
    setIsConsultationBusy(true);
    try {
      const response = await fetch(`${API_BASE}/v1/consultations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseId: activeCase.id,
          availabilitySlotId: selectedAvailabilitySlotId,
          paymentMode: "free_test",
          paymentStatus: "waived",
        }),
      });
      if (!response.ok) {
        throw new Error("consultation_booking_failed");
      }
      const consultation = (await response.json()) as ConsultationSession;
      setActiveConsultationId(consultation.id);
      setSelectedAvailabilitySlotId(null);
      await refreshConsultation(consultation.id);
      await loadClinicianAvailability(consultation.clinicianId);
    } finally {
      setIsConsultationBusy(false);
    }
  }

  async function loadClinicians() {
    if (!session) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/clinicians`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) {
      return;
    }
    const nextClinicians = (await response.json()) as ClinicianDirectoryEntry[];
    setClinicians(nextClinicians);
    setSelectedClinicianId((current) =>
      current && nextClinicians.some((clinician) => clinician.id === current) ? current : nextClinicians[0]?.id ?? null,
    );
    if (nextClinicians.length === 0) {
      setClinicianAvailability([]);
      setSelectedAvailabilitySlotId(null);
    }
  }

  async function loadClinicianAvailability(clinicianId: string) {
    if (!session) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/clinicians/${encodeURIComponent(clinicianId)}/availability`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) {
      setClinicianAvailability([]);
      setSelectedAvailabilitySlotId(null);
      return;
    }
    const slots = (await response.json()) as ClinicianAvailabilitySlot[];
    setClinicianAvailability(slots);
    setSelectedAvailabilitySlotId((current) =>
      current && slots.some((slot) => slot.id === current) ? current : slots[0]?.id ?? null,
    );
  }

  async function joinConsultation(sessionId = activeConsultationId) {
    if (!session || !sessionId) {
      return;
    }
    setIsConsultationBusy(true);
    try {
      const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(sessionId)}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ joinedAt: new Date().toISOString() }),
      });
      if (!response.ok) {
        throw new Error("consultation_join_failed");
      }
      setActiveConsultationId(sessionId);
      await refreshConsultation(sessionId);
      startConsultationStream(sessionId);
    } finally {
      setIsConsultationBusy(false);
    }
  }

  async function refreshConsultation(sessionId = activeConsultationId) {
    if (!session || !sessionId) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) {
      return;
    }
    setConsultationSnapshot((await response.json()) as ConsultationSnapshot);
  }

  async function sendConsultationText() {
    if (!session || !activeConsultationId || !consultationInput.trim()) {
      return;
    }
    const content = consultationInput.trim();
    setConsultationInput("");
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(activeConsultationId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, createdAt: new Date().toISOString() }),
    });
    if (response.ok) {
      await refreshConsultation(activeConsultationId);
    }
  }

  async function acceptClinicianPlan(planId: string) {
    if (!session) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/plans/${encodeURIComponent(planId)}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ acceptedAt: new Date().toISOString() }),
    });
    if (!response.ok) {
      return;
    }
    const plan = (await response.json()) as TrainingPlan;
    setCases((currentCases) =>
      currentCases.map((patientCase) =>
        patientCase.id === plan.caseId
          ? { ...patientCase, plan: trainingPlanToCasePlan(plan), status: "康复师计划已接受" }
          : patientCase,
      ),
    );
    await refreshMemoryForCurrentUser();
    await refreshConsultation(activeConsultationId);
  }

  async function declineClinicianPlan(planId: string) {
    if (!session) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/plans/${encodeURIComponent(planId)}/decline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (response.ok) {
      await refreshConsultation(activeConsultationId);
    }
  }

  async function refreshMemoryForCurrentUser() {
    if (!session) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/memory`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (!response.ok) {
        return;
      }
      const memory = (await response.json()) as UserMemory;
      const nextSession = { ...session, memory };
      setSession(nextSession);
      storeSession(nextSession);
      setCases((currentCases) => {
        const hydratedCases = hydrateCasesFromMemory(memory, currentCases);
        setActiveCaseId((currentActiveCaseId) =>
          currentActiveCaseId && hydratedCases.some((patientCase) => patientCase.id === currentActiveCaseId)
            ? currentActiveCaseId
            : hydratedCases[0]?.id ?? null,
        );
        return hydratedCases;
      });
    } catch {
      // Existing local state remains visible if the backend is briefly unavailable.
    }
  }

  async function loadPatientConsultations() {
    if (!session || session.user.role !== "user") {
      return;
    }

    const response = await fetch(`${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/consultations`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) {
      return;
    }
    const consultations = (await response.json()) as ConsultationSession[];
    const nextConsultation =
      consultations.find((consultation) => consultation.status === "active") ??
      consultations.find((consultation) => consultation.status === "waiting_clinician") ??
      consultations.find((consultation) => consultation.status === "scheduled") ??
      consultations[0];
    if (nextConsultation) {
      setActiveConsultationId(nextConsultation.id);
      await refreshConsultation(nextConsultation.id);
      startConsultationStream(nextConsultation.id);
    }
  }

  async function rememberCaseForCurrentUser(patientCase: PatientCase) {
    if (!session) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/memory/cases`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: patientCase.id,
          categoryId: patientCase.categoryId,
          title: patientCase.title,
          summary: patientCase.summary,
          status: patientCase.status,
          createdAt: patientCase.createdAt,
        }),
      });

      if (response.ok) {
        const memory = (await response.json()) as UserMemory;
        const nextSession = { ...session, memory };
        setSession(nextSession);
        storeSession(nextSession);
      }
    } catch {
      // Local case state remains usable when the API is unavailable during early validation.
    }
  }

  async function deleteCase(patientCase: PatientCase) {
    if (!session || !canDeleteCase(patientCase)) {
      return;
    }

    setCases((currentCases) => currentCases.filter((candidate) => candidate.id !== patientCase.id));
    if (activeCaseId === patientCase.id) {
      setActiveCaseId(null);
    }

    try {
      const response = await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/memory/cases/${encodeURIComponent(patientCase.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      );

      if (response.ok) {
        const memory = (await response.json()) as UserMemory;
        const nextSession = { ...session, memory };
        setSession(nextSession);
        storeSession(nextSession);
      }
    } catch {
      // Local deletion remains useful when the API is unavailable during early validation.
    }
  }

  async function rememberTrainingPlanForCurrentUser(patientCase: PatientCase, plan: CasePlan) {
    if (!session) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/memory/training-plans`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: `plan_${patientCase.id}`,
            caseId: patientCase.id,
            categoryId: patientCase.categoryId,
            status: "active",
            ...plan,
          }),
        },
      );

      if (response.ok) {
        const memory = (await response.json()) as UserMemory;
        const nextSession = { ...session, memory };
        setSession(nextSession);
        storeSession(nextSession);
        setCases((currentCases) => hydrateCasesFromMemory(memory, currentCases));
      }
    } catch {
      // The accepted plan stays in local state; backend sync can be retried by refreshing pages.
    }
  }

  if (!session) {
    return <LoginScreen onLogin={login} onRegister={register} />;
  }

  return (
    <main className="app-page" data-build-id={clientBuildId}>
      <header className="top-nav">
        <div className="brand">
          <div className="brand-mark">
            <img src={rezLogo} alt="Mentis Rehab" />
          </div>
          <div>
            <strong>Mentis Rehab</strong>
            <span>powered by ReZ</span>
          </div>
        </div>

        <nav className="main-tabs" aria-label="主导航">
          <button className={activePage === "home" ? "active" : ""} onClick={() => navigatePage("home")} type="button">
            <TinyIcon name="spark" />
            首页
          </button>
          <button className={activePage === "plans" ? "active" : ""} onClick={() => navigatePage("plans")} type="button">
            <TinyIcon name="plan" />
            我的计划
          </button>
          <button className={activePage === "records" ? "active" : ""} onClick={() => navigatePage("records")} type="button">
            <TinyIcon name="calendar" />
            评估记录
          </button>
        </nav>

        <div className="account-tools">
          <button className="tool-button notice" aria-label="通知">
            <TinyIcon name="bell" />
          </button>
          <button className="tool-button" aria-label="消息">
            <TinyIcon name="chat" />
          </button>
          <div className="user-chip">
            <span className="avatar photo">{displayName.slice(0, 1)}</span>
            <strong>{displayName}</strong>
            <button onClick={logout}>退出</button>
          </div>
        </div>
      </header>

      {activePage === "home" ? (
      <section className="layout-grid">
        <aside className="left-column">
          <Panel title="个人数据">
            <dl className="profile-data">
              <div><dt>用户</dt><dd>{displayName}</dd></div>
              <div><dt>身高 / 体重</dt><dd>{profile ? `${profile.heightCm}cm / ${profile.weightKg}kg` : "175cm / 68kg"}</dd></div>
            </dl>
          </Panel>

          <Panel title="当前病例">
            {activeCase && selectedCategory ? (
              <div className="case-card current-case">
                <div>
                  <span className="case-tag">{selectedCategory.label}</span>
                  <strong>{activeCase.title}</strong>
                  <span>{activeCase.summary}</span>
                  <small>{activeCase.createdAt} · {activeCase.status}</small>
                </div>
              </div>
            ) : (
              <div className="empty-case">
                <strong>还没有当前病例</strong>
                <span>先选择需要咨询的部位。</span>
              </div>
            )}
          </Panel>

          <Panel title="病例记录">
            {cases.length > 0 ? (
              <div className="case-list">
                {cases.map((patientCase) => {
                  const category = consultCategories.find((item) => item.id === patientCase.categoryId);
                  const isLocked = !canDeleteCase(patientCase);

                  return (
                    <div
                      className={patientCase.id === activeCaseId ? "case-list-item active" : "case-list-item"}
                      key={patientCase.id}
                    >
                      <button className="case-select" onClick={() => selectCase(patientCase)} type="button">
                        <span>{category?.mark ?? "病"}</span>
                        <div>
                          <strong>{patientCase.title}</strong>
                          <small>{patientCase.createdAt}</small>
                        </div>
                      </button>
                      <button
                        aria-label={`删除病例 ${patientCase.title}`}
                        className="case-delete"
                        disabled={isLocked}
                        onClick={() => void deleteCase(patientCase)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-case compact">
                <span>暂无病例</span>
              </div>
            )}
          </Panel>
        </aside>

        <section className="chat-workspace">
          <div className="chat-title">
            <div>
              <h1>{selectedCategory ? (hasPrimaryComplaint ? activeCase?.title : "请描述主要不适") : "你想先咨询哪个部位?"}</h1>
            </div>
            {selectedCategory ? <button onClick={resetCategory}>新开咨询</button> : null}
          </div>

          {selectedCategory ? (
            <>
              <div className="chat-scroll" ref={chatScrollRef}>
                {messages.map((message, index) => (
                  <MessageBubble
                    disabled={isSending}
                    key={`${message.role}-${index}`}
                    message={message}
                    onSelectOption={(option) => sendMessage(option.value || option.label)}
                  />
                ))}
                {isSending ? (
                  <TypingIndicator />
                ) : null}
              </div>

              {hasPrimaryComplaint ? (
                <div className="quick-actions">
                  {quickReplies.map((reply) => (
                    <button key={reply} onClick={() => sendMessage(reply)}>
                      {reply}
                    </button>
                  ))}
                </div>
              ) : null}

              <form
                className="chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(input, { captureComplaint: true });
                }}
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={`例如：${selectedCategory.examples[0]}，疼痛 4/10`}
                />
                <button type="button" aria-label="添加资料">＋</button>
                <button type="button" aria-label="语音输入">🎙</button>
                <button className="send" type="submit" disabled={isSending} aria-label="发送">
                  ➤
                </button>
              </form>
            </>
          ) : (
            <CategoryChooser categories={consultCategories} onSelect={chooseCategory} />
          )}

          <p className="chat-disclaimer">AI生成内容仅供参考，不能替代医生或康复师的专业诊断与建议。</p>
        </section>

        <aside className="right-column">
          <Panel
            title="今日计划"
            action={activeCase?.plan ? "查看完整计划" : undefined}
            onAction={activeCase?.plan ? () => navigatePage("plans") : undefined}
          >
            {activeCase?.plan ? (
              <div className="today-plan">
                <div className="stage-box">
                  <strong>{activeCase.plan.title} · {activeCase.plan.dayLabel}</strong>
                  <div className="progress-line amber">
                    <span style={{ width: `${activeCase.plan.completionPercent}%` }} />
                  </div>
                  <span>完成度 {activeCase.plan.completionPercent}%</span>
                </div>
                <ol className="plan-list">
                  {activeCase.plan.items.map((item, index) => (
                    <li className={item.state} key={item.title}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.meta}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <PendingRecommendation
                title={activeCase ? "问诊后生成今日计划" : "暂无今日计划"}
                description={activeCase ? "补充主诉、疼痛评分和训练量后生成。" : "开始咨询后再生成。"}
              />
            )}
          </Panel>

          <Panel title="康复阶段">
            {activeCase?.plan ? (
              <div className="stage-summary">
                <div>
                  <span>{activeCase.plan.stage.name}</span>
                  <strong>{activeCase.plan.stage.progressLabel}</strong>
                </div>
                <div className="progress-line">
                  <span style={{ width: `${activeCase.plan.stage.progressPercent}%` }} />
                </div>
                <p>本阶段目标</p>
                <ul>
                  {activeCase.plan.stage.goals.map((goal) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <PendingRecommendation
                title="康复阶段待评估"
                description="完成问诊后再显示。"
              />
            )}
          </Panel>

          <Panel title="需要专业支持?">
            <ConsultationPanel
              activeCase={activeCase}
              availabilitySlots={clinicianAvailability}
              busy={isConsultationBusy}
              clinicians={clinicians}
              input={consultationInput}
              onAcceptPlan={(planId) => void acceptClinicianPlan(planId)}
              onBook={() => void bookConsultationForActiveCase()}
              onClinicianChange={(clinicianId) => setSelectedClinicianId(clinicianId)}
              onDeclinePlan={(planId) => void declineClinicianPlan(planId)}
              onInputChange={setConsultationInput}
              onJoin={() => void joinConsultation()}
              onRefreshClinicians={() => void loadClinicians()}
              onRefresh={() => void refreshConsultation()}
              onSend={() => void sendConsultationText()}
              onSlotChange={setSelectedAvailabilitySlotId}
              selectedClinicianId={selectedClinicianId}
              selectedSlotId={selectedAvailabilitySlotId}
              sessionId={activeConsultationId}
              snapshot={consultationSnapshot}
            />
          </Panel>
        </aside>
      </section>
      ) : activePage === "plans" ? (
        <PlansPage
          cases={cases}
          onOpenHome={() => navigatePage("home")}
          onOpenRecords={() => navigatePage("records")}
          plans={displayTrainingPlans(session.memory.trainingPlans, cases)}
        />
      ) : (
        <RecordsPage
          cases={cases}
          categories={consultCategories}
          onDeleteCase={(patientCase) => void deleteCase(patientCase)}
          onOpenCase={selectCase}
        />
      )}
    </main>
  );
}

function PlansPage({
  cases,
  onOpenHome,
  onOpenRecords,
  plans,
}: {
  cases: PatientCase[];
  onOpenHome: () => void;
  onOpenRecords: () => void;
  plans: MemoryTrainingPlan[];
}) {
  const activePlan = plans.find((plan) => plan.status === "active") ?? plans[0] ?? null;
  const sourceCase = activePlan ? cases.find((patientCase) => patientCase.id === activePlan.caseId) ?? null : null;

  return (
    <section className="page-shell plan-page">
      <div className="page-heading">
        <div>
          <h1>我的计划</h1>
          <p>所有训练安排以后台保存的运动处方为准，首页问诊只是创建和更新入口。</p>
        </div>
        <div className="page-actions">
          <button onClick={onOpenHome} type="button">回到首页问诊</button>
          <button onClick={onOpenRecords} type="button">查看评估记录</button>
        </div>
      </div>

      {activePlan ? (
        <>
          <section className="plan-overview">
            <div className="plan-primary">
              <span>{sourceCase?.title ?? "当前运动处方"}</span>
              <h2>{activePlan.title}</h2>
              <p>{activePlan.stage.name} · {activePlan.stage.progressLabel}</p>
              <div className="plan-progress-row">
                <div className="progress-line amber">
                  <span style={{ width: `${activePlan.completionPercent}%` }} />
                </div>
                <strong>{activePlan.completionPercent}%</strong>
              </div>
            </div>
            <div className="plan-meta-grid">
              <div>
                <span>今日阶段</span>
                <strong>{activePlan.dayLabel}</strong>
              </div>
              <div>
                <span>训练动作</span>
                <strong>{activePlan.items.length} 项</strong>
              </div>
              <div>
                <span>病例状态</span>
                <strong>{sourceCase?.status ?? "运动处方已接受"}</strong>
              </div>
            </div>
          </section>

          <section className="plan-content-grid">
            <div className="plan-section wide">
              <div className="section-title-row">
                <h2>今日训练</h2>
                <span>{activePlan.updatedAt.slice(0, 10)}</span>
              </div>
              <ol className="training-task-list">
                {activePlan.items.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.meta}</small>
                    </div>
                    <em>{item.state === "done" ? "已完成" : "待完成"}</em>
                  </li>
                ))}
              </ol>
            </div>

            <div className="plan-section">
              <div className="section-title-row">
                <h2>阶段进展</h2>
                <span>{activePlan.stage.progressPercent}%</span>
              </div>
              <div className="stage-roadmap">
                {["镇痛与负荷管理", "恢复活动度", "力量恢复", "回归跑步"].map((stageName) => (
                  <div className={stageName === activePlan.stage.name ? "active" : ""} key={stageName}>
                    <span />
                    <strong>{stageName}</strong>
                  </div>
                ))}
              </div>
              <ul className="goal-list">
                {activePlan.stage.goals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
            </div>
          </section>
        </>
      ) : (
        <div className="full-empty-state">
          <strong>还没有可执行计划</strong>
          <p>完成膝盖问诊并接受 AI 生成的运动处方后，这里会显示今日训练、阶段进展和注意事项。</p>
          <button onClick={onOpenHome} type="button">去首页开始膝盖问诊</button>
        </div>
      )}
    </section>
  );
}

function RecordsPage({
  cases,
  categories,
  onDeleteCase,
  onOpenCase,
}: {
  cases: PatientCase[];
  categories: RehabConsultCategory[];
  onDeleteCase: (patientCase: PatientCase) => void;
  onOpenCase: (patientCase: PatientCase) => void;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "accepted">("all");
  const filteredCases = cases.filter((patientCase) => {
    if (filter === "active") {
      return patientCase.status === "咨询中";
    }
    if (filter === "accepted") {
      return !canDeleteCase(patientCase);
    }
    return true;
  });
  const selectedRecord = filteredCases[0] ?? null;

  return (
    <section className="page-shell records-page">
      <div className="page-heading">
        <div>
          <h1>评估记录</h1>
          <p>病例、问诊摘要、处方状态和删除权限都从后台 memory 同步。</p>
        </div>
        <div className="record-filters" aria-label="病例筛选">
          {[
            { id: "all", label: "全部" },
            { id: "active", label: "咨询中" },
            { id: "accepted", label: "已接受处方" },
          ].map((item) => (
            <button
              className={filter === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setFilter(item.id as "all" | "active" | "accepted")}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredCases.length > 0 ? (
        <div className="records-layout">
          <div className="record-list-panel">
            {filteredCases.map((patientCase) => {
              const category = categories.find((item) => item.id === patientCase.categoryId);
              const locked = !canDeleteCase(patientCase);

              return (
                <article className="record-row" key={patientCase.id}>
                  <button onClick={() => onOpenCase(patientCase)} type="button">
                    <span>{category?.mark ?? "病"}</span>
                    <div>
                      <strong>{patientCase.title}</strong>
                      <small>{category?.label ?? "病例"} · {patientCase.createdAt}</small>
                    </div>
                  </button>
                  <em>{patientCase.status}</em>
                  <button
                    className="record-delete"
                    disabled={locked}
                    onClick={() => onDeleteCase(patientCase)}
                    type="button"
                  >
                    删除
                  </button>
                </article>
              );
            })}
          </div>

          <aside className="record-detail-panel">
            {selectedRecord ? (
              <>
                <span className="case-tag">
                  {categories.find((item) => item.id === selectedRecord.categoryId)?.label ?? "病例"}
                </span>
                <h2>{selectedRecord.title}</h2>
                <p>{selectedRecord.summary}</p>
                <dl>
                  <div><dt>创建时间</dt><dd>{selectedRecord.createdAt}</dd></div>
                  <div><dt>当前状态</dt><dd>{selectedRecord.status}</dd></div>
                  <div><dt>删除权限</dt><dd>{canDeleteCase(selectedRecord) ? "可删除" : "已接受处方，不可删除"}</dd></div>
                </dl>
                <button onClick={() => onOpenCase(selectedRecord)} type="button">打开原问诊</button>
              </>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="full-empty-state">
          <strong>没有匹配的评估记录</strong>
          <p>切换筛选条件，或回到首页新建一次膝盖评估。</p>
        </div>
      )}
    </section>
  );
}

function CategoryChooser({
  categories,
  onSelect,
}: {
  categories: RehabConsultCategory[];
  onSelect: (category: RehabConsultCategory) => void;
}) {
  return (
    <div className="category-entry">
      <div className="category-grid">
        {categories.map((category) => (
          <button
            className={category.enabled ? "category-card" : "category-card disabled"}
            disabled={!category.enabled}
            key={category.id}
            onClick={() => onSelect(category)}
            type="button"
          >
            <span className="category-mark">{category.mark}</span>
            <strong>{category.label}</strong>
            <small>{category.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function isComplaintPending(patientCase: PatientCase) {
  return patientCase.title === pendingComplaintTitle;
}

function hydrateCasesFromMemory(memory: UserMemory, existingCases: PatientCase[] = []): PatientCase[] {
  return memory.cases.map((memoryCase) => {
    const existingCase = existingCases.find((patientCase) => patientCase.id === memoryCase.id);
    return {
      ...memoryCase,
      messages: existingCase?.messages ?? [],
      plan: existingCase?.plan ?? planForCase(memory, memoryCase.id),
    };
  });
}

function planForCase(memory: UserMemory, caseId: string): CasePlan | null {
  const memoryPlan = memory.trainingPlans.find((plan) => plan.caseId === caseId);
  if (!memoryPlan) {
    return null;
  }
  return {
    title: memoryPlan.title,
    dayLabel: memoryPlan.dayLabel,
    completionPercent: memoryPlan.completionPercent,
    items: memoryPlan.items,
    stage: memoryPlan.stage,
  };
}

function displayTrainingPlans(memoryPlans: MemoryTrainingPlan[], cases: PatientCase[]): MemoryTrainingPlan[] {
  const planByCaseId = new Map(memoryPlans.map((plan) => [plan.caseId, plan]));
  for (const patientCase of cases) {
    if (!patientCase.plan || planByCaseId.has(patientCase.id)) {
      continue;
    }
    planByCaseId.set(patientCase.id, {
      id: `local_plan_${patientCase.id}`,
      caseId: patientCase.id,
      categoryId: patientCase.categoryId,
      title: patientCase.plan.title,
      status: "active",
      dayLabel: patientCase.plan.dayLabel,
      completionPercent: patientCase.plan.completionPercent,
      items: patientCase.plan.items,
      stage: patientCase.plan.stage,
      updatedAt: new Date().toISOString(),
    });
  }
  return Array.from(planByCaseId.values()).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function makeComplaintTitle(content: string) {
  return truncateText(content, 18);
}

function makeComplaintSummary(content: string) {
  return truncateText(content, 34);
}

function truncateText(content: string, maxLength: number) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function canDeleteCase(patientCase: PatientCase) {
  return !patientCase.plan && !/处方已接受|已接受运动处方|计划已接受/.test(patientCase.status);
}

function LoginScreen({
  onLogin,
  onRegister,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (input: RegisterInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountRole, setAccountRole] = useState<"user" | "clinician">("user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("ReZ");
  const [heightCm, setHeightCm] = useState("175");
  const [weightKg, setWeightKg] = useState("68");
  const [discipline, setDiscipline] = useState("运动康复师");
  const [credentialSummary, setCredentialSummary] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isRegistering = mode === "register";

  return (
    <main className="login-page" data-build-id={clientBuildId}>
      <section className="login-shell">
        <div className="login-brand">
          <div className="brand-mark">
            <img src={rezLogo} alt="Mentis Rehab" />
          </div>
          <div>
            <strong>Mentis Rehab</strong>
            <span>powered by ReZ</span>
          </div>
        </div>

        <div className="login-copy">
          <h1>{isRegistering ? "创建账号" : "运动康复 AI 工作台"}</h1>
          <p>{isRegistering ? "选择患者或康复师/医生身份。不同角色登录后会进入不同面板。" : "患者进入训练与问诊，康复师进入咨询与计划管理。"}</p>
        </div>

        <div className="role-switch" aria-label="登录角色">
          <button className={!isRegistering ? "active" : ""} onClick={() => setMode("login")} type="button">登录</button>
          <button className={isRegistering ? "active" : ""} onClick={() => setMode("register")} type="button">注册</button>
        </div>

        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setIsLoggingIn(true);
            const action = isRegistering
              ? onRegister({
                  accountRole,
                  username: username.trim(),
                  password,
                  inviteCode: inviteCode.trim(),
                  displayName: displayName.trim(),
                  heightCm: heightCm.trim(),
                  weightKg: weightKg.trim(),
                  discipline: discipline.trim(),
                  credentialSummary: credentialSummary.trim(),
                  organizationName: organizationName.trim(),
                })
              : onLogin(username.trim(), password);
            action
              .catch(() => setError(isRegistering ? "注册失败，请检查邀请码是否正确。" : "登录失败，请检查账号密码或后端服务。"))
              .finally(() => setIsLoggingIn(false));
          }}
        >
          <label>
            用户名
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            密码
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {isRegistering ? (
            <>
              <div className="role-switch account-role-switch" aria-label="注册身份">
                <button
                  className={accountRole === "user" ? "active" : ""}
                  onClick={() => setAccountRole("user")}
                  type="button"
                >
                  患者
                </button>
                <button
                  className={accountRole === "clinician" ? "active" : ""}
                  onClick={() => setAccountRole("clinician")}
                  type="button"
                >
                  康复师/医生
                </button>
              </div>
              <label>
                邀请码
                <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
              </label>
              <label>
                昵称
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <div className="form-pair">
                <label>
                  身高 cm
                  <input value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="numeric" />
                </label>
                <label>
                  体重 kg
                  <input value={weightKg} onChange={(event) => setWeightKg(event.target.value)} inputMode="decimal" />
                </label>
              </div>
              {accountRole === "clinician" ? (
                <>
                  <label>
                    专业方向
                    <input value={discipline} onChange={(event) => setDiscipline(event.target.value)} />
                  </label>
                  <label>
                    资质摘要
                    <input
                      value={credentialSummary}
                      onChange={(event) => setCredentialSummary(event.target.value)}
                      placeholder="例如：物理治疗师，运动损伤方向 5 年"
                    />
                  </label>
                  <label>
                    所属机构
                    <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {error ? <p className="login-error">{error}</p> : null}
          <button
            className="login-submit"
            disabled={isLoggingIn || !username.trim() || !password || (isRegistering && !inviteCode.trim())}
            type="submit"
          >
            {isLoggingIn ? "处理中..." : isRegistering ? "保存并进入" : "登录进入"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PendingRecommendation({ title, description }: { title: string; description: string }) {
  return (
    <div className="pending-recommendation">
      <span>待生成</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function ConsultationPanel({
  activeCase,
  availabilitySlots,
  busy,
  clinicians,
  input,
  onAcceptPlan,
  onBook,
  onClinicianChange,
  onDeclinePlan,
  onInputChange,
  onJoin,
  onRefreshClinicians,
  onRefresh,
  onSend,
  onSlotChange,
  selectedClinicianId,
  selectedSlotId,
  sessionId,
  snapshot,
}: {
  activeCase: PatientCase | null;
  availabilitySlots: ClinicianAvailabilitySlot[];
  busy: boolean;
  clinicians: ClinicianDirectoryEntry[];
  input: string;
  onAcceptPlan: (planId: string) => void;
  onBook: () => void;
  onClinicianChange: (clinicianId: string) => void;
  onDeclinePlan: (planId: string) => void;
  onInputChange: (value: string) => void;
  onJoin: () => void;
  onRefreshClinicians: () => void;
  onRefresh: () => void;
  onSend: () => void;
  onSlotChange: (slotId: string) => void;
  selectedClinicianId: string | null;
  selectedSlotId: string | null;
  sessionId: string | null;
  snapshot: ConsultationSnapshot | null;
}) {
  const pendingPlans = snapshot?.plans.filter((plan) => plan.source === "clinician_custom" && plan.status === "sent_to_patient") ?? [];
  const status = snapshot?.session.status ?? (sessionId ? "scheduled" : "cancelled");
  const selectedClinician = clinicians.find((clinician) => clinician.id === selectedClinicianId) ?? clinicians[0] ?? null;

  return (
    <div className="consultation-panel">
      <p className="support-copy">测试期 15 分钟问诊免费，患者和康复师都进入后开启。正式上线后这里会接入支付。</p>
      <div className="clinician-picker">
        {clinicians.map((clinician) => (
          <button
            className={clinician.id === selectedClinician?.id ? "clinician-card active" : "clinician-card"}
            key={clinician.id}
            onClick={() => onClinicianChange(clinician.id)}
            type="button"
          >
            <span className="avatar photo">{clinician.displayName.slice(0, 1)}</span>
            <div>
              <strong>
                <span className={clinician.isOnline ? "online-dot online" : "online-dot"} />
                {clinician.displayName}
              </strong>
              <small>{clinician.discipline ?? "康复师"} · {clinician.credentialSummary ?? "运动康复"}</small>
              <small>{clinician.nextAvailableAt ? `最近 ${formatDateTimeShort(clinician.nextAvailableAt)}` : "暂无公开时段"}</small>
            </div>
            <em>{clinician.isOnline ? "在线" : "离线"}</em>
          </button>
        ))}
        {clinicians.length === 0 ? (
          <div className="empty-case compact">
            <span>暂无可预约康复师</span>
          </div>
        ) : null}
      </div>

      {selectedClinician ? (
        <div className="slot-picker">
          <div className="consultation-status-row">
            <strong>可预约时间</strong>
            <button onClick={onRefreshClinicians} type="button">刷新</button>
          </div>
          {availabilitySlots.length > 0 ? (
            <div className="slot-grid">
              {availabilitySlots.map((slot) => (
                <button
                  className={slot.id === selectedSlotId ? "slot-chip active" : "slot-chip"}
                  key={slot.id}
                  onClick={() => onSlotChange(slot.id)}
                  type="button"
                >
                  {formatDateTimeShort(slot.startsAt)}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-inline">当前没有可预约时间，稍后再看也可以。</p>
          )}
        </div>
      ) : null}

      {pendingPlans.map((plan) => (
        <div className="plan-offer" key={plan.id}>
          <span>康复师定制计划</span>
          <strong>{plan.title}</strong>
          <small>{plan.dayLabel} · {plan.items.length} 个动作</small>
          <div>
            <button className="green-button" onClick={() => onAcceptPlan(plan.id)} type="button">接受</button>
            <button onClick={() => onDeclinePlan(plan.id)} type="button">暂不接受</button>
          </div>
        </div>
      ))}

      {snapshot ? (
        <div className="consultation-chat-card">
          <div className="consultation-status-row">
            <strong>{consultationStatusLabel(status)}</strong>
            <span>{snapshot.session.expiresAt ? `截止 ${formatTime(snapshot.session.expiresAt)}` : "等待双方进入"}</span>
          </div>
          <div className="consultation-mini-messages">
            {snapshot.messages.slice(-4).map((message) => (
              <p className={message.senderRole} key={message.id}>
                <span>{message.senderRole === "clinician" ? "康复师" : message.senderRole === "user" ? "我" : "系统"}</span>
                {message.content}
              </p>
            ))}
          </div>
          <form
            className="consultation-composer"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <input
              disabled={snapshot.session.status !== "active"}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={snapshot.session.status === "active" ? "发送给康复师..." : "聊天室尚未开启"}
              value={input}
            />
            <button disabled={snapshot.session.status !== "active" || !input.trim()} type="submit">发送</button>
          </form>
        </div>
      ) : null}

      <div className="support-actions">
        {sessionId ? (
          <>
            <button className="green-button" disabled={busy} onClick={onJoin} type="button">进入问诊</button>
            <button disabled={busy} onClick={onRefresh} type="button">刷新</button>
          </>
        ) : (
          <button className="green-button" disabled={busy || !activeCase || !selectedSlotId} onClick={onBook} type="button">
            {selectedSlotId ? "预约 15 分钟免费咨询" : "选择时间后预约"}
          </button>
        )}
      </div>
      <p className="emergency">紧急情况请立即就医 ⓘ</p>
    </div>
  );
}

function AdminDashboard({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const [clinicians, setClinicians] = useState<AdminClinicianReviewItem[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    void loadClinicianReviews();
  }, []);

  async function loadClinicianReviews() {
    const response = await fetch(`${API_BASE}/v1/admin/clinicians`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (response.ok) {
      setClinicians((await response.json()) as AdminClinicianReviewItem[]);
    }
  }

  async function reviewClinician(
    clinicianId: string,
    credentialStatus: AdminClinicianReviewItem["credentialStatus"],
    publicDirectoryVisible: boolean,
  ) {
    setIsBusy(true);
    try {
      const response = await fetch(`${API_BASE}/v1/admin/clinicians/${encodeURIComponent(clinicianId)}/review`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credentialStatus,
          publicDirectoryVisible,
          reviewNote: reviewNotes[clinicianId] ?? "",
          reviewedAt: new Date().toISOString(),
        }),
      });
      if (response.ok) {
        await loadClinicianReviews();
      }
    } finally {
      setIsBusy(false);
    }
  }

  const pendingCount = clinicians.filter((clinician) => clinician.credentialStatus === "pending").length;
  const publicCount = clinicians.filter((clinician) => clinician.credentialStatus === "verified" && clinician.publicDirectoryVisible).length;

  return (
    <main className="app-page admin-page" data-build-id={clientBuildId}>
      <header className="top-nav">
        <div className="brand">
          <div className="brand-mark">
            <img src={rezLogo} alt="Mentis Rehab" />
          </div>
          <div>
            <strong>Mentis Rehab</strong>
            <span>管理员后台</span>
          </div>
        </div>
        <nav className="main-tabs clinician-tabs" aria-label="管理员导航">
          <button className="active" type="button">
            <TinyIcon name="book" />
            审核中心
          </button>
        </nav>
        <div className="user-chip">
          <span className="avatar photo">{session.user.displayName.slice(0, 1)}</span>
          <strong>{session.user.displayName}</strong>
          <button onClick={onLogout} type="button">退出</button>
        </div>
      </header>

      <section className="admin-layout">
        <aside className="admin-summary-panel">
          <div className="page-heading compact-heading">
            <div>
              <h1>审核中心</h1>
              <p>决定哪些康复师可以进入患者端公开目录。</p>
            </div>
            <button onClick={() => void loadClinicianReviews()} type="button">刷新</button>
          </div>
          <div className="admin-metric">
            <span>待审核</span>
            <strong>{pendingCount}</strong>
          </div>
          <div className="admin-metric">
            <span>公开接诊</span>
            <strong>{publicCount}</strong>
          </div>
          <p className="settings-save-note">
            当前测试期问诊免费，后端已保留支付模式、支付状态、订单号和金额字段，正式上线再接支付网关。
          </p>
        </aside>

        <section className="admin-review-list">
          {clinicians.map((clinician) => (
            <article className="admin-review-card" key={clinician.id}>
              <div>
                <span className={`review-status ${clinician.credentialStatus}`}>
                  {credentialStatusLabel(clinician.credentialStatus)}
                </span>
                {clinician.publicDirectoryVisible ? <span className="review-status public">患者端可见</span> : null}
              </div>
              <h2>{clinician.displayName}</h2>
              <p>{clinician.discipline ?? "未填写专业方向"} · {clinician.credentialSummary ?? "未填写资质摘要"}</p>
              <dl>
                <div><dt>机构</dt><dd>{clinician.organizationName ?? "个人/未填写"}</dd></div>
                <div><dt>擅长</dt><dd>{clinician.specialties.length > 0 ? clinician.specialties.join(" / ") : "未填写"}</dd></div>
                <div><dt>注册</dt><dd>{clinician.registeredAt ? formatDateTimeShort(clinician.registeredAt) : "--"}</dd></div>
              </dl>
              <label className="review-note-field">
                审核备注
                <input
                  onChange={(event) => setReviewNotes((current) => ({ ...current, [clinician.id]: event.target.value }))}
                  placeholder="驳回原因或内部备注"
                  value={reviewNotes[clinician.id] ?? ""}
                />
              </label>
              <div className="admin-review-actions">
                <button disabled={isBusy} onClick={() => void reviewClinician(clinician.id, "verified", true)} type="button">
                  通过并上架
                </button>
                <button disabled={isBusy} onClick={() => void reviewClinician(clinician.id, "verified", false)} type="button">
                  通过但暂不公开
                </button>
                <button disabled={isBusy} onClick={() => void reviewClinician(clinician.id, "rejected", false)} type="button">
                  驳回
                </button>
                <button disabled={isBusy} onClick={() => void reviewClinician(clinician.id, "suspended", false)} type="button">
                  下架
                </button>
              </div>
            </article>
          ))}
          {clinicians.length === 0 ? (
            <div className="full-empty-state compact-empty">
              <strong>暂无康复师资料</strong>
              <p>康复师/医生注册后会出现在这里。</p>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function ClinicianDashboard({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const clinicianCredentialStatus = session.user.credentialStatus ?? "pending";
  const [activeClinicianPage, setActiveClinicianPage] = useState<ClinicianPage>("home");
  const [consultations, setConsultations] = useState<ConsultationSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ConsultationSnapshot | null>(null);
  const [actions, setActions] = useState<ActionLibraryItem[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [planTitle, setPlanTitle] = useState("膝盖疼痛定制康复计划");
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<ClinicianAvailabilitySlot[]>([]);
  const [clinicStartTime, setClinicStartTime] = useState("09:00");
  const [clinicEndTime, setClinicEndTime] = useState("18:00");
  const [hasLunchBreak, setHasLunchBreak] = useState(true);
  const [lunchStartTime, setLunchStartTime] = useState("12:00");
  const [lunchEndTime, setLunchEndTime] = useState("13:30");
  const [restDays, setRestDays] = useState<number[]>([0]);
  const [scheduleSavedAt, setScheduleSavedAt] = useState<string | null>(null);
  const [calendarViewDate, setCalendarViewDate] = useState(() => startOfMonth(new Date()));
  const [templateName, setTemplateName] = useState("膝盖疼痛回归训练模板");
  const [templateSummary, setTemplateSummary] = useState("低刺激激活、负荷控制和逐步回归跑步。");
  const [draftItems, setDraftItems] = useState<ClinicianWorkoutItem[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<ClinicianWorkoutTemplate[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [selectedActionBodyPartFilter, setSelectedActionBodyPartFilter] = useState("all");
  const [selectedActionPhaseFilter, setSelectedActionPhaseFilter] = useState("all");
  const [isBusy, setIsBusy] = useState(false);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    void loadClinicianData();
    return () => streamRef.current?.close();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      void refreshSnapshot(selectedSessionId);
      openStream(selectedSessionId);
    }
  }, [selectedSessionId]);

  async function loadClinicianData() {
    const [consultationResponse, actionResponse, availabilityResponse] = await Promise.all([
      fetch(`${API_BASE}/v1/clinicians/${encodeURIComponent(session.user.id)}/consultations`, {
        headers: { Authorization: `Bearer ${session.token}` },
      }),
      fetch(`${API_BASE}/v1/action-library`, {
        headers: { Authorization: `Bearer ${session.token}` },
      }),
      fetch(`${API_BASE}/v1/clinicians/${encodeURIComponent(session.user.id)}/availability`, {
        headers: { Authorization: `Bearer ${session.token}` },
      }),
    ]);
    if (consultationResponse.ok) {
      const nextConsultations = (await consultationResponse.json()) as ConsultationSession[];
      setConsultations(nextConsultations);
      setSelectedSessionId((current) => current ?? nextConsultations[0]?.id ?? null);
      if (!selectedSessionId && nextConsultations[0]) {
        void refreshSnapshot(nextConsultations[0].id);
        openStream(nextConsultations[0].id);
      }
    }
    if (actionResponse.ok) {
      const nextActions = (await actionResponse.json()) as ActionLibraryItem[];
      setActions(nextActions);
      setSelectedActionIds((current) => (current.length > 0 ? current : nextActions.slice(0, 2).map((action) => action.id)));
    }
    if (availabilityResponse.ok) {
      setAvailabilitySlots((await availabilityResponse.json()) as ClinicianAvailabilitySlot[]);
    }
  }

  function saveScheduleSettings() {
    setScheduleSavedAt(new Date().toISOString());
  }

  async function refreshSnapshot(sessionId = selectedSessionId) {
    if (!sessionId) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (response.ok) {
      setSnapshot((await response.json()) as ConsultationSnapshot);
    }
  }

  function openStream(sessionId: string) {
    streamRef.current?.close();
    const source = new EventSource(
      `${API_BASE}/v1/consultations/${encodeURIComponent(sessionId)}/events?token=${encodeURIComponent(session.token)}`,
    );
    source.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data) as ConsultationSnapshot);
    });
    source.addEventListener("error", () => source.close());
    streamRef.current = source;
  }

  async function joinSelectedConsultation() {
    if (!selectedSessionId) {
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(selectedSessionId)}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ joinedAt: new Date().toISOString() }),
      });
      if (response.ok) {
        await refreshSnapshot(selectedSessionId);
        openStream(selectedSessionId);
        await loadClinicianData();
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function sendClinicianMessage() {
    if (!selectedSessionId || !messageInput.trim()) {
      return;
    }
    const content = messageInput.trim();
    setMessageInput("");
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(selectedSessionId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, createdAt: new Date().toISOString() }),
    });
    if (response.ok) {
      await refreshSnapshot(selectedSessionId);
    }
  }

  async function sendPlan() {
    const actionIds = draftItems.length > 0 ? draftItems.map((item) => item.actionId) : selectedActionIds;
    const title = activeClinicianPage === "training" ? templateName.trim() : planTitle.trim();
    if (!selectedSessionId || actionIds.length === 0 || !title) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(selectedSessionId)}/plans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        dayLabel: "第 1 天",
        actionIds,
        precautions: ["疼痛超过 5/10 时停止训练", "出现明显肿胀或无法承重时线下就医"],
        progressionCriteria: ["24 小时内疼痛不反跳", "动作控制稳定后再增加训练量"],
        createdAt: new Date().toISOString(),
      }),
    });
    if (response.ok) {
      await refreshSnapshot(selectedSessionId);
    }
  }

  function addActionToDraft(actionId: string) {
    setDraftItems((current) => [
      ...current,
      {
        id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actionId,
        sets: 3,
        reps: "10",
        load: "",
        notes: "",
      },
    ]);
  }

  function updateDraftItem(itemId: string, patch: Partial<ClinicianWorkoutItem>) {
    setDraftItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeDraftItem(itemId: string) {
    setDraftItems((current) => current.filter((item) => item.id !== itemId));
  }

  function saveTemplate() {
    if (!templateName.trim() || draftItems.length === 0) {
      return;
    }
    const template: ClinicianWorkoutTemplate = {
      id: `template_${Date.now()}`,
      name: templateName.trim(),
      summary: templateSummary.trim(),
      items: draftItems,
      updatedAt: new Date().toISOString(),
    };
    setSavedTemplates((current) => [template, ...current]);
  }

  function toggleRestDay(day: number) {
    setRestDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
  }

  function moveCalendarMonth(offset: number) {
    setCalendarViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function resetCalendarToToday() {
    setCalendarViewDate(startOfMonth(new Date()));
  }

  const selectedSession = consultations.find((consultation) => consultation.id === selectedSessionId) ?? null;
  const calendarDays = buildMonthCalendar(calendarViewDate);
  const legalHolidayMap = buildLegalHolidayMap(calendarViewDate.getFullYear());
  const calendarTitle = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(calendarViewDate);
  const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const actionPhaseFilters = ["all", ...Array.from(new Set(actions.map((action) => action.phase))).sort((first, second) => first.localeCompare(second, "zh-CN"))];
  const selectedBodyPartFilter =
    actionBodyPartFilters.find((filter) => filter.id === selectedActionBodyPartFilter) ?? actionBodyPartFilters[0];
  const filteredActions = actions.filter((action) => {
    const keyword = actionFilter.trim().toLowerCase();
    const searchableText = [
      action.title,
      action.phase,
      action.defaultDosage,
      action.bodyRegion,
      ...(action.tags ?? []),
    ].join(" ").toLowerCase();
    const matchesKeyword = !keyword || searchableText.includes(keyword);
    const matchesBodyPart = actionMatchesBodyPartFilter(action, selectedBodyPartFilter);
    const matchesPhase = selectedActionPhaseFilter === "all" || action.phase === selectedActionPhaseFilter;
    return matchesKeyword && matchesBodyPart && matchesPhase;
  });
  const visibleActions = filteredActions.slice(0, 120);
  const hasMoreFilteredActions = filteredActions.length > visibleActions.length;

  function selectActionBodyPartFilter(filterId: string) {
    setSelectedActionBodyPartFilter(filterId);
    setActionFilter("");
  }

  function selectActionPhaseFilter(phase: string) {
    setSelectedActionPhaseFilter(phase);
    if (phase !== "all") {
      setActionFilter("");
    }
  }

  return (
    <main className="app-page clinician-page" data-build-id={clientBuildId}>
      <header className="top-nav">
        <div className="brand">
          <div className="brand-mark">
            <img src={rezLogo} alt="Mentis Rehab" />
          </div>
          <div>
            <strong>Mentis Rehab</strong>
            <span>康复师工作台</span>
          </div>
        </div>
        <nav className="main-tabs clinician-tabs" aria-label="康复师导航">
          {[
            { id: "home", label: "首页", icon: "spark" },
            { id: "calendar", label: "日历", icon: "calendar" },
            { id: "training", label: "训练计划", icon: "plan" },
          ].map((item) => (
            <button
              className={activeClinicianPage === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setActiveClinicianPage(item.id as ClinicianPage)}
              type="button"
            >
              <TinyIcon name={item.icon as "spark" | "calendar" | "plan"} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="user-chip">
          <span className="avatar photo">{session.user.displayName.slice(0, 1)}</span>
          <strong>{session.user.displayName}</strong>
          <button onClick={onLogout} type="button">退出</button>
        </div>
      </header>

      {clinicianCredentialStatus !== "verified" ? (
        <div className={`review-banner ${clinicianCredentialStatus}`}>
          <strong>{credentialStatusLabel(clinicianCredentialStatus)}</strong>
          <span>
            {clinicianCredentialStatus === "pending"
              ? "管理员审核通过后，患者端才会显示你并允许预约。"
              : clinicianCredentialStatus === "rejected"
                ? "资料已被驳回，请根据审核意见修改后重新提交。"
                : "账号已暂停公开接诊，请联系平台管理员。"}
          </span>
        </div>
      ) : null}

      {activeClinicianPage === "home" ? (
        <section className="clinician-layout clinician-home-layout">
          <aside className="clinician-sidebar">
            <div className="page-heading compact-heading">
              <div>
                <h1>预约咨询</h1>
                <p>这里只显示与你有咨询关系的患者。</p>
              </div>
              <button onClick={() => void loadClinicianData()} type="button">刷新</button>
            </div>
            {consultations.length > 0 ? (
              consultations.map((consultation) => (
                <button
                  className={consultation.id === selectedSessionId ? "consultation-row active" : "consultation-row"}
                  key={consultation.id}
                  onClick={() => {
                    setSelectedSessionId(consultation.id);
                    void refreshSnapshot(consultation.id);
                    openStream(consultation.id);
                  }}
                  type="button"
                >
                  <strong>{consultation.caseId}</strong>
                  <span>{consultationStatusLabel(consultation.status)} · {formatTime(consultation.scheduledStartAt)}</span>
                </button>
              ))
            ) : (
              <div className="full-empty-state compact-empty">
                <strong>暂无预约</strong>
                <p>患者付费预约后会出现在这里。</p>
              </div>
            )}
          </aside>

          <section className="clinician-main">
            <div className="patient-snapshot">
              <div>
                <span className="case-tag">授权病例</span>
                <h1>{snapshot?.caseSummary?.title ?? selectedSession?.caseId ?? "选择一个咨询"}</h1>
                <p>{snapshot?.caseSummary?.summary ?? "进入咨询后可查看患者基础信息、评估摘要与历史计划。"}</p>
              </div>
              <dl>
                <div><dt>患者</dt><dd>{snapshot?.patient.displayName ?? "--"}</dd></div>
                <div><dt>身高 / 体重</dt><dd>{snapshot?.patient.profile ? `${snapshot.patient.profile.heightCm}cm / ${snapshot.patient.profile.weightKg}kg` : "--"}</dd></div>
                <div><dt>状态</dt><dd>{selectedSession ? consultationStatusLabel(selectedSession.status) : "--"}</dd></div>
              </dl>
            </div>

            <div className="clinician-chat">
              <div className="section-title-row">
                <h2>实时沟通</h2>
                <button disabled={!selectedSessionId || isBusy} onClick={() => void joinSelectedConsultation()} type="button">
                  进入问诊
                </button>
              </div>
              <div className="clinician-message-list">
                {(snapshot?.messages ?? []).map((message) => (
                  <p className={message.senderRole} key={message.id}>
                    <span>{message.senderRole === "clinician" ? "我" : message.senderRole === "user" ? "患者" : "系统"}</span>
                    {message.content}
                  </p>
                ))}
              </div>
              <form
                className="consultation-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendClinicianMessage();
                }}
              >
                <input
                  disabled={snapshot?.session.status !== "active"}
                  onChange={(event) => setMessageInput(event.target.value)}
                  placeholder={snapshot?.session.status === "active" ? "发送给患者..." : "双方进入后开启 15 分钟聊天"}
                  value={messageInput}
                />
                <button disabled={snapshot?.session.status !== "active" || !messageInput.trim()} type="submit">发送</button>
              </form>
            </div>
          </section>
        </section>
      ) : null}

      {activeClinicianPage === "calendar" ? (
        <section className="clinician-calendar-page">
          <div className="month-calendar">
            <div className="page-heading compact-heading">
              <div>
                <h1>日历</h1>
                <p>按月查看预约咨询、开放接诊时间、休息日和法定节假日。</p>
              </div>
              <button onClick={() => void loadClinicianData()} type="button">刷新</button>
            </div>
            <div className="calendar-toolbar">
              <div className="calendar-month-controls">
                <button aria-label="上个月" onClick={() => moveCalendarMonth(-1)} type="button">‹</button>
                <h2>{calendarTitle}</h2>
                <button aria-label="下个月" onClick={() => moveCalendarMonth(1)} type="button">›</button>
              </div>
              <button className="today-button" onClick={resetCalendarToToday} type="button">今天</button>
            </div>
            <div className="calendar-weekdays">
              {weekdayNames.map((day) => <span key={day}>周{day}</span>)}
            </div>
            <div className="month-grid">
              {calendarDays.map((day) => {
                const dayKey = formatDateKey(day.date);
                const holiday = day.inMonth ? legalHolidayMap[dayKey] : undefined;
                const daySlots = day.inMonth
                  ? availabilitySlots.filter((slot) => isSameLocalDay(slot.startsAt, day.date))
                  : [];
                const dayConsultations = day.inMonth
                  ? consultations.filter((consultation) => isSameLocalDay(consultation.scheduledStartAt, day.date))
                  : [];
                const resting = restDays.includes(day.date.getDay());
                const today = isSameDate(day.date, new Date());
                return (
                  <div className={day.inMonth ? "month-cell" : "month-cell muted"} key={day.key}>
                    <div className="month-cell-head">
                      <strong className={today ? "today-date" : ""}>{day.date.getDate()}</strong>
                      <div>
                        {holiday ? <span className="holiday-badge">{holiday}</span> : null}
                        {resting ? <span>休息</span> : null}
                      </div>
                    </div>
                    {dayConsultations.map((consultation) => (
                      <button
                        className="calendar-consultation"
                        key={consultation.id}
                        onClick={() => {
                          setSelectedSessionId(consultation.id);
                          setActiveClinicianPage("home");
                          void refreshSnapshot(consultation.id);
                        }}
                        type="button"
                      >
                        {formatTime(consultation.scheduledStartAt)} {consultationStatusLabel(consultation.status)}
                      </button>
                    ))}
                    {daySlots.slice(0, 3).map((slot) => (
                      <div className={`calendar-mini-slot ${slot.status}`} key={slot.id}>
                        {formatTime(slot.startsAt)} {availabilityStatusLabel(slot.status)}
                      </div>
                    ))}
                    {daySlots.length > 3 ? <span className="more-slots">+{daySlots.length - 3} 个时段</span> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="calendar-settings">
            <div className="availability-editor">
              <div className="section-title-row">
                <h2>接诊时间</h2>
                {scheduleSavedAt ? <span>已保存 {formatTime(scheduleSavedAt)}</span> : <span>未保存</span>}
              </div>
              <div className="time-settings-grid">
                <label>
                  开始接诊
                  <input type="time" value={clinicStartTime} onChange={(event) => setClinicStartTime(event.target.value)} />
                </label>
                <label>
                  结束接诊
                  <input type="time" value={clinicEndTime} onChange={(event) => setClinicEndTime(event.target.value)} />
                </label>
              </div>
              <label className="lunch-toggle">
                <input
                  checked={hasLunchBreak}
                  onChange={(event) => setHasLunchBreak(event.target.checked)}
                  type="checkbox"
                />
                午休
              </label>
              {hasLunchBreak ? (
                <div className="time-settings-grid">
                  <label>
                    午休开始
                    <input type="time" value={lunchStartTime} onChange={(event) => setLunchStartTime(event.target.value)} />
                  </label>
                  <label>
                    午休结束
                    <input type="time" value={lunchEndTime} onChange={(event) => setLunchEndTime(event.target.value)} />
                  </label>
                </div>
              ) : null}
            </div>
            <div className="availability-editor">
              <div className="section-title-row">
                <h2>每周休息</h2>
                <span>{restDays.length} 天</span>
              </div>
              <div className="rest-day-grid">
                {weekdayNames.map((label, index) => (
                  <button
                    className={restDays.includes(index) ? "active" : ""}
                    key={label}
                    onClick={() => toggleRestDay(index)}
                    type="button"
                  >
                    周{label}
                  </button>
                ))}
              </div>
              <button className="save-schedule-button" onClick={saveScheduleSettings} type="button">
                保存设置
              </button>
              <p className="settings-save-note">保存后再应用到排班，避免误触改动接诊规则。</p>
            </div>
            <div className="schedule-panel">
              <div className="section-title-row">
                <h2>近期时段</h2>
                <span>{availabilitySlots.length} 个</span>
              </div>
              <div className="calendar-slot-list">
                {availabilitySlots.map((slot) => (
                  <div className={`calendar-slot ${slot.status}`} key={slot.id}>
                    <strong>{formatDateTimeShort(slot.startsAt)}</strong>
                    <span>{formatTime(slot.startsAt)} - {formatTime(slot.endsAt)}</span>
                    <em>{availabilityStatusLabel(slot.status)}</em>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {activeClinicianPage === "training" ? (
        <section className="training-builder-page">
          <aside className="template-library-panel">
            <div className="section-title-row">
              <h2>自定义模板</h2>
              <button disabled={draftItems.length === 0} onClick={saveTemplate} type="button">保存</button>
            </div>
            {savedTemplates.length > 0 ? (
              savedTemplates.map((template) => (
                <article className="template-card-row" key={template.id}>
                  <strong>{template.name}</strong>
                  <span>{template.items.length} 个动作 · {formatDateTimeShort(template.updatedAt)}</span>
                  {template.summary ? <p>{template.summary}</p> : null}
                </article>
              ))
            ) : (
              <div className="full-empty-state compact-empty">
                <strong>暂无模板</strong>
                <p>从动作库挑动作后保存成自定义训练计划。</p>
              </div>
            )}
          </aside>

          <section className="template-editor-panel">
            <div className="section-title-row">
              <h2>制定训练计划</h2>
              <button disabled={!snapshot || draftItems.length === 0} onClick={() => void sendPlan()} type="button">发送给当前患者</button>
            </div>
            <div className="template-fields">
              <label>
                模板名称
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
              </label>
              <label>
                说明
                <input value={templateSummary} onChange={(event) => setTemplateSummary(event.target.value)} />
              </label>
            </div>
            <div className="draft-workout-list">
              {draftItems.length > 0 ? (
                draftItems.map((item, index) => {
                  const action = actions.find((candidate) => candidate.id === item.actionId);
                  return (
                    <article className="draft-workout-item" key={item.id}>
                      <div>
                        <span>{index + 1}</span>
                        <strong>{action?.title ?? item.actionId}</strong>
                        <small>{action?.phase ?? "动作"} · {action?.defaultDosage ?? "自定义剂量"}</small>
                      </div>
                      <label>
                        组数
                        <input
                          inputMode="numeric"
                          value={item.sets}
                          onChange={(event) => updateDraftItem(item.id, { sets: Number(event.target.value) || 1 })}
                        />
                      </label>
                      <label>
                        次数/时间
                        <input value={item.reps} onChange={(event) => updateDraftItem(item.id, { reps: event.target.value })} />
                      </label>
                      <label>
                        负荷
                        <input value={item.load} onChange={(event) => updateDraftItem(item.id, { load: event.target.value })} />
                      </label>
                      <label>
                        备注
                        <input value={item.notes} onChange={(event) => updateDraftItem(item.id, { notes: event.target.value })} />
                      </label>
                      <button onClick={() => removeDraftItem(item.id)} type="button">移除</button>
                    </article>
                  );
                })
              ) : (
                <div className="full-empty-state compact-empty">
                  <strong>还没有动作</strong>
                  <p>从右侧动作库选择动作，设置组数、次数、负荷和备注。</p>
                </div>
              )}
            </div>
          </section>

          <aside className="action-library-panel">
            <div className="section-title-row">
              <h2>动作库</h2>
              <span>{filteredActions.length} / {actions.length} 个</span>
            </div>
            <div className="action-filter-block">
              <span>部位</span>
              <div className="body-part-filter-grid" role="list">
                {actionBodyPartFilters.map((filter) => (
                  <button
                    className={filter.id === selectedActionBodyPartFilter ? "active" : ""}
                    key={filter.id}
                    onClick={() => selectActionBodyPartFilter(filter.id)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="action-filter-select">
              分类
              <select value={selectedActionPhaseFilter} onChange={(event) => selectActionPhaseFilter(event.target.value)}>
                {actionPhaseFilters.map((phase) => (
                  <option key={phase} value={phase}>
                    {phase === "all" ? "全部分类" : phase}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="library-search"
              placeholder="搜索动作、分类、器械或肌群"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
            <div className="action-library-list">
              {visibleActions.map((action) => (
                <button className="action-library-item" key={action.id} onClick={() => addActionToDraft(action.id)} type="button">
                  <strong>{action.title}</strong>
                  <span>{action.phase} · {action.defaultDosage}</span>
                  <small>{actionLibraryMetaLine(action)}</small>
                </button>
              ))}
              {filteredActions.length === 0 ? (
                <div className="full-empty-state compact-empty">
                  <strong>没有匹配动作</strong>
                  <p>换一个部位、分类或关键词再试。</p>
                </div>
              ) : null}
              {hasMoreFilteredActions ? (
                <p className="library-result-note">已显示前 {visibleActions.length} 个，继续输入关键词可缩小范围。</p>
              ) : null}
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

function actionMatchesBodyPartFilter(action: ActionLibraryItem, filter: ActionBodyPartFilter) {
  if (filter.id === "all") {
    return true;
  }
  if (filter.bodyRegions?.includes(action.bodyRegion)) {
    return true;
  }
  const normalizedActionTags = new Set((action.tags ?? []).map((tag) => tag.toLowerCase()));
  return filter.tags?.some((tag) => normalizedActionTags.has(tag.toLowerCase())) ?? false;
}

function actionLibraryMetaLine(action: ActionLibraryItem) {
  const priorityTags = (action.tags ?? [])
    .filter((tag) => tag !== "exercise-library")
    .slice(0, 4)
    .join(" / ");
  return priorityTags ? `${actionBodyRegionLabel(action.bodyRegion)} · ${priorityTags}` : actionBodyRegionLabel(action.bodyRegion);
}

function actionBodyRegionLabel(region: ActionBodyRegion) {
  switch (region) {
    case "knee":
      return "膝 / 下肢";
    case "ankle_foot":
      return "踝足 / 小腿";
    case "hip":
      return "髋 / 臀";
    case "spine":
      return "核心 / 脊柱";
    case "shoulder":
      return "肩 / 上肢";
    case "other":
      return "综合";
  }
}

function trainingPlanToCasePlan(plan: TrainingPlan): CasePlan {
  return {
    title: plan.title,
    dayLabel: plan.dayLabel,
    completionPercent: plan.stage.progressPercent,
    items: plan.items,
    stage: plan.stage,
  };
}

function consultationStatusLabel(status: ConsultationSession["status"]) {
  const labels: Record<ConsultationSession["status"], string> = {
    active: "咨询中",
    cancelled: "已取消",
    closed: "已结束",
    completed: "已完成",
    expired: "已过期",
    scheduled: "已预约",
    waiting_clinician: "等待康复师",
  };
  return labels[status];
}

function availabilityStatusLabel(status: ClinicianAvailabilitySlot["status"]) {
  const labels: Record<ClinicianAvailabilitySlot["status"], string> = {
    available: "可预约",
    blocked: "不可约",
    booked: "已预约",
  };
  return labels[status];
}

function credentialStatusLabel(status: AdminClinicianReviewItem["credentialStatus"]) {
  const labels: Record<AdminClinicianReviewItem["credentialStatus"], string> = {
    pending: "待审核",
    verified: "已通过",
    rejected: "已驳回",
    suspended: "已下架",
  };
  return labels[status];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTimeShort(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthCalendar(anchor: Date): Array<{ date: Date; inMonth: boolean; key: string }> {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      inMonth: date.getMonth() === anchor.getMonth(),
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    };
  });
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildLegalHolidayMap(year: number): Record<string, string> {
  const fixedHolidays: Record<string, string> = {
    [`${year}-01-01`]: "元旦",
    [`${year}-05-01`]: "劳动节",
    [`${year}-05-02`]: "劳动节",
    [`${year}-10-01`]: "国庆",
    [`${year}-10-02`]: "国庆",
    [`${year}-10-03`]: "国庆",
  };

  // Lunar and solar-term holidays are year-specific; seed 2026 until this is server-driven.
  if (year === 2026) {
    return {
      ...fixedHolidays,
      "2026-02-16": "除夕",
      "2026-02-17": "春节",
      "2026-02-18": "春节",
      "2026-02-19": "春节",
      "2026-04-05": "清明",
      "2026-06-19": "端午",
      "2026-09-25": "中秋",
    };
  }

  return fixedHolidays;
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameLocalDay(value: string, date: Date) {
  const candidate = new Date(value);
  return isSameDate(candidate, date);
}

function isCompletePlanPatch(planPatch: ChatPlanPatch): planPatch is CasePlan {
  return Boolean(
    planPatch.title &&
      planPatch.dayLabel &&
      typeof planPatch.completionPercent === "number" &&
      Array.isArray(planPatch.items) &&
      planPatch.items.length > 0 &&
      planPatch.stage &&
      typeof planPatch.stage.name === "string" &&
      typeof planPatch.stage.progressLabel === "string" &&
      typeof planPatch.stage.progressPercent === "number" &&
      Array.isArray(planPatch.stage.goals),
  );
}

function Panel({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action ? <button onClick={onAction}>{action}</button> : null}
      </div>
      {children}
    </section>
  );
}

function MessageBubble({
  disabled = false,
  message,
  onSelectOption,
}: {
  disabled?: boolean;
  message: ChatMessage;
  onSelectOption?: (option: ChatOption) => void;
}) {
  const isAssistant = message.role === "assistant";
  const options = isAssistant && Array.isArray(message.options) ? message.options : [];
  return (
    <article className={isAssistant ? "message assistant" : "message user"}>
      {isAssistant ? <AiAvatar /> : null}
      <div className="message-content">
        {message.content.split("\n").map((line, index) => (
          <p key={`${line}-${index}`}>{line || "\u00a0"}</p>
        ))}
        {isAssistant && message.question ? <p className="message-question">{message.question}</p> : null}
        {options.length > 0 ? (
          <div className="message-options">
            {options.map((option) => (
              <button
                className="message-option"
                disabled={disabled}
                key={option.id}
                onClick={() => onSelectOption?.(option)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {isAssistant && message.content.includes("参考依据") ? (
          <div className="citation-actions">
            {evidence.citations.slice(0, 2).map((citation, index) => (
              <button key={citation.label}>证据 {index + 1}</button>
            ))}
          </div>
        ) : null}
      </div>
      {!isAssistant ? <span className="avatar photo">张</span> : null}
      <time>10:21</time>
    </article>
  );
}

function AiAvatar() {
  return (
    <span className="ai-avatar" aria-hidden="true">
      <img src={mentisMark} alt="" />
    </span>
  );
}

function TypingIndicator() {
  return (
    <article className="message assistant">
      <AiAvatar />
      <div className="message-content typing-content" aria-label="AI 正在输入">
        <span />
        <span />
        <span />
      </div>
      <time>10:21</time>
    </article>
  );
}

function TinyIcon({ name }: { name: "spark" | "plan" | "calendar" | "book" | "bell" | "chat" }) {
  const paths = {
    spark: "M12 3l2 6 6 3-6 3-2 6-2-6-6-3 6-3z",
    plan: "M5 5h14v14H5zM8 9h8M8 13h5",
    calendar: "M5 5h14v15H5zM8 3v4M16 3v4M5 10h14",
    book: "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4zM5 4v12",
    bell: "M6 17h12l-1-2v-4a5 5 0 0 0-10 0v4zM10 20a2 2 0 0 0 4 0",
    chat: "M4 5h16v11H8l-4 4z",
  };
  return (
    <svg viewBox="0 0 24 24">
      <path d={paths[name]} />
    </svg>
  );
}
