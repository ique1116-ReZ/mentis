import { useEffect, useRef, useState } from "react";
import { completionPercentForDate, dateKey, doneKeysForDate, planItemKey } from "@mentis/domain";
import rezLogo from "./assets/rez-logo.png";
import { loadStoredSession, storeSession, validateStoredSession } from "./authSession";
import { API_BASE } from "./apiBase";
import { clientBuildId } from "./buildInfo";
import { consultCategories, pendingComplaintTitle, quickReplies } from "./consultCategories";
import {
  canDeleteCase,
  displayTrainingPlans,
  hydrateCasesFromMemory,
  isComplaintPending,
  isCompletePlanPatch,
  makeComplaintSummary,
  makeComplaintTitle,
  mergeFetchedMessages,
  mergePlanGoals,
  trainingPlanToCasePlan,
} from "./caseUtils";
import { AdminDashboard } from "./AdminDashboard";
import { ClinicianDashboard } from "./ClinicianDashboard";
import { CategoryChooser } from "./components/CategoryChooser";
import { ConsultationPanel } from "./components/ConsultationPanel";
import { LoginScreen } from "./components/LoginScreen";
import { MessageBubble } from "./components/MessageBubble";
import { readApiErrorMessage } from "./apiError";
import { PlansPage } from "./components/PlansPage";
import { RecordsPage } from "./components/RecordsPage";
import { Panel, PendingRecommendation, TinyIcon, TypingIndicator } from "./components/Shared";
import type {
  AppPage,
  AuthSession,
  CasePlan,
  ChatMessage,
  ChatOption,
  ChatPlanPatch,
  ChatRecommendedAction,
  ClinicianAvailabilitySlot,
  ClinicianDirectoryEntry,
  ConsultationSession,
  ConsultationSnapshot,
  PatientCase,
  RegisterInput,
  RehabConsultCategory,
  TrainingPlan,
  UserMemory,
} from "./types";

export function App() {
  const [initialAppState] = useState(() => {
    const storedSession = loadStoredSession<AuthSession>();
    return {
      storedSession,
    };
  });
  const [session, setSession] = useState<AuthSession | null>(null);
  const [cases, setCases] = useState<PatientCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"checking" | "ready">(
    initialAppState.storedSession ? "checking" : "ready",
  );
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
  const loadingCaseMessageIdsRef = useRef<Set<string>>(new Set());
  const planToggleRequestIdRef = useRef(0);
  const activeCase = cases.find((patientCase) => patientCase.id === activeCaseId) ?? null;
  const selectedCategory = activeCase ? consultCategories.find((category) => category.id === activeCase.categoryId) ?? null : null;
  const messages = activeCase?.messages ?? [];
  const hasPrimaryComplaint = activeCase ? !isComplaintPending(activeCase) : false;
  // 与"我的计划"页同源：都从 displayTrainingPlans(session.memory.trainingPlans, cases) 里按 caseId 取计划，
  // 再用 domain 的 completions-by-date helper 算今日完成度，避免首页面板和计划页各算一套、互相不同步。
  const todayKey = dateKey(new Date());
  const activeCasePlan = activeCase
    ? displayTrainingPlans(session?.memory.trainingPlans ?? [], cases).find((plan) => plan.caseId === activeCase.id) ?? null
    : null;
  const todayDoneKeys = activeCasePlan ? doneKeysForDate(activeCasePlan, todayKey) : new Set<string>();
  const todayCompletionPercent = activeCasePlan ? completionPercentForDate(activeCasePlan, todayKey) : 0;
  const displayName = session?.user.displayName ?? "张运动";
  const profile = session?.user.profile;

  useEffect(() => {
    return () => {
      consultationStreamRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const storedSession = initialAppState.storedSession;
    if (!storedSession) {
      return;
    }

    let cancelled = false;
    validateStoredSession(storedSession, { apiBase: API_BASE }).then((validSession) => {
      if (cancelled) {
        return;
      }

      if (!validSession) {
        storeSession(null);
        setAuthStatus("ready");
        return;
      }

      const hydratedCases = validSession.user.role === "user" ? hydrateCasesFromMemory(validSession.memory) : [];
      setSession(validSession);
      setCases(hydratedCases);
      setActiveCaseId(hydratedCases[0]?.id ?? null);
      setAuthStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [initialAppState.storedSession]);

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

  useEffect(() => {
    const current = cases.find((patientCase) => patientCase.id === activeCaseId);
    if (current && !current.messagesLoaded) {
      void loadCaseMessages(current.id);
    }
  }, [activeCaseId, cases]);

  if (session?.user.role === "clinician") {
    return <ClinicianDashboard session={session} onLogout={logout} />;
  }

  if (session?.user.role === "admin") {
    return <AdminDashboard session={session} onLogout={logout} />;
  }

  if (authStatus === "checking") {
    return (
      <main className="login-page" data-build-id={clientBuildId}>
        <section className="login-shell">
          <div className="login-brand">
            <div className="brand-mark">
              <img src={rezLogo} alt="Mentis Rehab" />
            </div>
            <div>
              <strong>Mentis Rehab</strong>
              <span>正在确认登录状态</span>
            </div>
          </div>
        </section>
      </main>
    );
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
      // 新建病例本地已有欢迎语，且尚未持久化到消息接口；标记为已加载，
      // 避免下面的懒加载 effect 用空数组把这条欢迎语覆盖掉。
      messagesLoaded: true,
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
    // 消息拉取交给下面依赖 [activeCaseId, cases] 的 effect 统一触发，
    // 避免这里再显式调用一次导致同一病例并发发出两个相同的 GET。
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

  function toPlanItem(action: ChatRecommendedAction) {
    return {
      actionId: action.actionId,
      title: action.title,
      meta: action.defaultDosage,
      state: "todo" as const,
      phase: action.phase,
      instructions: action.instructions,
      contraindications: action.contraindications,
      progressionCriteria: action.progressionCriteria,
    };
  }

  function isActionInActivePlan(action: ChatRecommendedAction): boolean {
    const items = activeCase?.plan?.items ?? [];
    return items.some((item) => (action.actionId ? item.actionId === action.actionId : item.title === action.title));
  }

  function addRecommendedActionsToPlan(actions: ChatRecommendedAction[]) {
    if (!activeCase || actions.length === 0) {
      return;
    }

    const existingPlan = activeCase.plan;
    const startingItems = existingPlan?.items ?? [];
    const nextItems = [...startingItems];
    for (const action of actions) {
      const isDuplicate = nextItems.some((item) =>
        action.actionId ? item.actionId === action.actionId : item.title === action.title,
      );
      if (!isDuplicate) {
        nextItems.push(toPlanItem(action));
      }
    }
    if (nextItems.length === startingItems.length) {
      return;
    }

    const mergedGoals = actions.reduce(
      (goals, action) => mergePlanGoals(goals, action.progressionCriteria),
      existingPlan?.stage.goals ?? [],
    );
    const [firstAction] = actions;
    const nextPlan: CasePlan = existingPlan
      ? { ...existingPlan, items: nextItems, stage: { ...existingPlan.stage, goals: mergedGoals } }
      : {
          title: `${activeCase.title === pendingComplaintTitle ? "康复" : activeCase.title}训练计划`,
          dayLabel: "今日训练",
          completionPercent: 0,
          items: nextItems,
          stage: {
            name: firstAction.phase,
            progressLabel: "第 1 天",
            progressPercent: 0,
            goals: mergedGoals.length > 0 ? mergedGoals.slice(0, 3) : ["完成后 24 小时无明显加重"],
          },
        };

    setCases((currentCases) =>
      currentCases.map((patientCase) =>
        patientCase.id === activeCase.id
          ? { ...patientCase, plan: nextPlan, status: "运动处方已接受" }
          : patientCase,
      ),
    );
    void rememberTrainingPlanForCurrentUser({ ...activeCase, plan: nextPlan, status: "运动处方已接受" }, nextPlan);
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
    void persistCaseMessages(sendingCase.id, [{ role: "user", content }]);
    if (shouldCaptureComplaint) {
      void rememberCaseForCurrentUser({ ...caseAfterUserInput, messages: nextMessages });
    }

    try {
      const response = await fetch(`${API_BASE}/v1/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        recommendedActions?: ChatRecommendedAction[];
        assessmentStep?: string;
        planPatch?: ChatPlanPatch;
      };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.content,
        question: data.question,
        options: Array.isArray(data.options) ? data.options : undefined,
        recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions : undefined,
        assessmentStep: data.assessmentStep,
        planPatch: data.planPatch,
      };
      updateCaseMessages(sendingCase.id, [...nextMessages, assistantMessage]);
      void persistCaseMessages(sendingCase.id, [assistantMessage]);
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
      throw new Error(await readApiErrorMessage(response, "登录失败，请检查账号密码或后端服务。"));
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
      throw new Error(await readApiErrorMessage(response, "注册失败，请检查邀请码、网络或后端服务。"));
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

  async function loadCaseMessages(caseId: string) {
    if (!session) {
      return;
    }
    // 单飞守卫：同一病例的拉取正在进行时直接跳过，避免选中病例后连续发送消息
    // 触发多个并发 GET，最终让先发出、后返回的过期响应把最新对话冲掉。
    if (loadingCaseMessageIdsRef.current.has(caseId)) {
      return;
    }
    loadingCaseMessageIdsRef.current.add(caseId);
    try {
      const response = await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/cases/${encodeURIComponent(caseId)}/messages`,
        { headers: { Authorization: `Bearer ${session.token}` } },
      );
      if (!response.ok) {
        return;
      }
      const fetchedMessages = (await response.json()) as ChatMessage[];
      setCases((currentCases) =>
        currentCases.map((patientCase) =>
          patientCase.id === caseId
            ? { ...patientCase, messages: mergeFetchedMessages(patientCase.messages, fetchedMessages), messagesLoaded: true }
            : patientCase,
        ),
      );
    } catch {
      // 拉取失败就保持未加载状态，下次进入病例会重试
    } finally {
      loadingCaseMessageIdsRef.current.delete(caseId);
    }
  }

  async function persistCaseMessages(caseId: string, messages: ChatMessage[]) {
    if (!session || messages.length === 0) {
      return;
    }
    try {
      await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(session.user.id)}/cases/${encodeURIComponent(caseId)}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        },
      );
    } catch {
      // 持久化失败不阻断对话
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

  async function togglePlanItem(planId: string, key: string, done: boolean) {
    if (!session) {
      return;
    }
    // 请求计数器：每次打勾都会推进它，异步响应回来时先比对是不是还是"最新一次"。
    // 用户可能连续快速打勾 A、B 两个动作，两个请求都在飞行中，网络抖动可能让 A 的响应
    // 晚于 B 落地——这时 A 的响应（不含 B 的勾选）是过期快照，不能用它整体覆盖 memory，
    // 否则会把 B 已经打上的勾从界面上冲掉。同理，失败回滚也不能用调用发起时捕获的
    // session 快照——那个快照可能比后来的乐观更新还旧。所以下面全程只用函数式
    // setSession(prev => ...)，从不 spread 闭包捕获的 session。
    const requestId = ++planToggleRequestIdRef.current;
    const userId = session.user.id;
    const token = session.token;
    const today = dateKey(new Date());

    setSession((prev) => {
      if (!prev) {
        return prev;
      }
      const optimisticPlans = prev.memory.trainingPlans.map((plan) => {
        if (plan.id !== planId) {
          return plan;
        }
        const completions = [...(plan.completions ?? [])];
        const index = completions.findIndex((entry) => entry.date === today);
        const existing = index >= 0 ? completions[index] : { date: today, doneKeys: [] };
        const doneKeys = done
          ? Array.from(new Set([...existing.doneKeys, key]))
          : existing.doneKeys.filter((candidate) => candidate !== key);
        const entry = { date: today, doneKeys };
        if (index >= 0) {
          completions[index] = entry;
        } else {
          completions.push(entry);
        }
        return { ...plan, completions };
      });
      const nextSession = { ...prev, memory: { ...prev.memory, trainingPlans: optimisticPlans } };
      storeSession(nextSession);
      return nextSession;
    });

    try {
      const response = await fetch(
        `${API_BASE}/v1/users/${encodeURIComponent(userId)}/memory/training-plans/${encodeURIComponent(planId)}/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ key, done }),
        },
      );
      if (!response.ok) {
        throw new Error(`completion_failed_${response.status}`);
      }
      const memory = (await response.json()) as UserMemory;
      if (requestId !== planToggleRequestIdRef.current) {
        // 期间已经又发起了更新的打勾请求，那次请求自己的乐观状态/响应更能代表当前
        // 状态，这里就不要用这份过期响应去覆盖它了。
        return;
      }
      setSession((prev) => {
        if (!prev) {
          return prev;
        }
        const nextSession = { ...prev, memory };
        storeSession(nextSession);
        return nextSession;
      });
    } catch {
      if (requestId !== planToggleRequestIdRef.current) {
        return;
      }
      // 不用捕获的快照回滚（可能已经过期），改为向服务端重新拉取权威状态。
      // refreshMemoryForCurrentUser 失败时本身会安全地什么都不做。
      await refreshMemoryForCurrentUser();
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
                    onAddRecommendedActions={addRecommendedActionsToPlan}
                    isActionInPlan={isActionInActivePlan}
                    onSelectOption={(option) => sendMessage(option.value || option.label)}
                    onSubmitSupplement={(content) => sendMessage(content)}
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
            action={activeCasePlan ? "查看完整计划" : undefined}
            onAction={activeCasePlan ? () => navigatePage("plans") : undefined}
          >
            {activeCasePlan ? (
              <div className="today-plan">
                <div className="stage-box">
                  <strong>{activeCasePlan.title} · {activeCasePlan.dayLabel}</strong>
                  <div className="progress-line amber">
                    <span style={{ width: `${todayCompletionPercent}%` }} />
                  </div>
                  <span>完成度 {todayCompletionPercent}%</span>
                </div>
                <ol className="plan-list">
                  {activeCasePlan.items.map((item, index) => (
                    <li className={todayDoneKeys.has(planItemKey(item)) ? "done" : "todo"} key={planItemKey(item)}>
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
          onToggleItem={togglePlanItem}
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

export { MessageBubble };
