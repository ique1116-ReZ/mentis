import { useRef, useState } from "react";
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

type AuthRole = "user" | "clinician" | "organization" | "admin";

type AuthUser = {
  id: string;
  role: AuthRole;
  displayName: string;
  profile?: UserProfile;
};

type UserProfile = {
  heightCm: string;
  weightKg: string;
  sportLevel: string;
  weeklyFrequency: string;
  primaryGoal: string;
};

type RegisterInput = UserProfile & {
  username: string;
  password: string;
  displayName: string;
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
  trainingPlans: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  notes: string[];
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

const consultCategories: RehabConsultCategory[] = [
  {
    id: "knee",
    label: "膝盖",
    description: "跑步膝、膝前痛、上下楼疼、深蹲不适",
    examples: ["跑步后膝前痛", "上下楼疼", "深蹲时不舒服"],
    mark: "膝",
  },
  {
    id: "ankle",
    label: "脚踝",
    description: "崴脚、跑后踝痛、踝稳定性、跟腱周围不适",
    examples: ["崴脚后多久能跑", "跑后外踝疼", "跟腱附近紧"],
    mark: "踝",
  },
  {
    id: "shoulder",
    label: "肩膀",
    description: "肩袖不适、举手疼、卧推或过顶动作疼痛",
    examples: ["卧推肩痛", "举手疼", "游泳后肩不舒服"],
    mark: "肩",
  },
  {
    id: "lower_back",
    label: "腰背",
    description: "训练后腰背疼、久坐腰痛、核心负荷管理",
    examples: ["硬拉后腰酸", "久坐腰痛", "跑步后下背紧"],
    mark: "腰",
  },
  {
    id: "hip",
    label: "髋部",
    description: "髋外侧痛、臀部深处痛、髋活动度与力量",
    examples: ["跑步髋外侧疼", "臀部深处痛", "髋前侧夹挤感"],
    mark: "髋",
  },
];

const quickReplies = ["调整今日计划", "疼痛管理建议", "如何判断是否过度训练", "联系康复师"];

const caseDefaults: Record<RehabConsultCategoryId, Pick<PatientCase, "title" | "summary">> = {
  knee: { title: "右膝跑步后疼痛", summary: "跑步膝、上下楼痛、深蹲不适" },
  ankle: { title: "脚踝稳定性咨询", summary: "崴脚恢复、踝痛、跟腱周围紧张" },
  shoulder: { title: "肩膀训练疼痛", summary: "举手疼、肩袖不适、过顶动作疼痛" },
  lower_back: { title: "腰背负荷管理", summary: "训练后腰背疼、久坐腰痛" },
  hip: { title: "髋部活动度咨询", summary: "髋外侧痛、臀部深处痛" },
};

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
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [cases, setCases] = useState<PatientCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const activeCase = cases.find((patientCase) => patientCase.id === activeCaseId) ?? null;
  const selectedCategory = activeCase ? consultCategories.find((category) => category.id === activeCase.categoryId) ?? null : null;
  const messages = activeCase?.messages ?? [];
  const displayName = session?.user.displayName ?? "张运动";
  const profile = session?.user.profile;

  function chooseCategory(category: RehabConsultCategory) {
    const id = `${category.id}-${Date.now()}`;
    const newCase: PatientCase = {
      id,
      categoryId: category.id,
      title: caseDefaults[category.id].title,
      summary: caseDefaults[category.id].summary,
      createdAt: new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date()),
      status: "咨询中",
      plan: null,
      messages: [
        {
          role: "assistant",
          content: `你好，${displayName}。先说说你的${category.label}现在最明显的问题。`,
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
    setInput("");
    syncViewportAfterChatChange();
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
        patientCase.id === caseId ? { ...patientCase, plan: planPatch } : patientCase,
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

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content || isSending || !activeCase || !selectedCategory) {
      return;
    }

    const sendingCase = activeCase;
    const sendingCategory = selectedCategory;
    const nextMessages: ChatMessage[] = [...sendingCase.messages, { role: "user", content }];
    updateCaseMessages(sendingCase.id, nextMessages);
    setInput("");
    setIsSending(true);
    syncViewportAfterChatChange();

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
    setSession(nextSession);
    storeSession(nextSession);
    setCases(
      nextSession.memory.cases.map((patientCase) => ({
        ...patientCase,
        messages: [],
        plan: null,
      })),
    );
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
    setInput("");
  }

  function logout() {
    setSession(null);
    storeSession(null);
    setCases([]);
    setActiveCaseId(null);
    setInput("");
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

  if (!session) {
    return <LoginScreen onLogin={login} onRegister={register} />;
  }

  return (
    <main className="app-page">
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
          <button className="active">
            <TinyIcon name="spark" />
            AI对话
          </button>
          <button>
            <TinyIcon name="plan" />
            我的计划
          </button>
          <button>
            <TinyIcon name="calendar" />
            评估记录
          </button>
          <button>
            <TinyIcon name="book" />
            知识库
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

      <section className="layout-grid">
        <aside className="left-column">
          <Panel title="个人数据">
            <dl className="profile-data">
              <div><dt>用户</dt><dd>{displayName}</dd></div>
              <div><dt>身高 / 体重</dt><dd>{profile ? `${profile.heightCm}cm / ${profile.weightKg}kg` : "175cm / 68kg"}</dd></div>
              <div><dt>运动水平</dt><dd>{profile?.sportLevel ?? "中级跑者"}</dd></div>
              <div><dt>周运动频率</dt><dd>{profile?.weeklyFrequency ?? "4-5 次"}</dd></div>
              <div><dt>主要目标</dt><dd>{profile?.primaryGoal ?? "安全恢复跑步"}</dd></div>
            </dl>
          </Panel>

          <Panel title="当前病例">
            {activeCase && selectedCategory ? (
              <div className="case-card current-case">
                <div>
                  <span className="case-tag">{selectedCategory.label}咨询</span>
                  <strong>{activeCase.title}</strong>
                  <span>{activeCase.summary}</span>
                  <small>{activeCase.createdAt} · {activeCase.status}</small>
                </div>
              </div>
            ) : (
              <div className="empty-case">
                <strong>还没有当前病例</strong>
                <span>先在中间选择咨询部位，系统会自动创建病例。</span>
              </div>
            )}
          </Panel>

          <Panel title="病例记录">
            {cases.length > 0 ? (
              <div className="case-list">
                {cases.map((patientCase) => {
                  const category = consultCategories.find((item) => item.id === patientCase.categoryId);

                  return (
                    <button
                      className={patientCase.id === activeCaseId ? "case-list-item active" : "case-list-item"}
                      key={patientCase.id}
                      onClick={() => selectCase(patientCase)}
                    >
                      <span>{category?.mark ?? "病"}</span>
                      <div>
                        <strong>{patientCase.title}</strong>
                        <small>{patientCase.createdAt}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-case compact">
                <span>新咨询会出现在这里。</span>
              </div>
            )}
          </Panel>
        </aside>

        <section className="chat-workspace">
          <div className="chat-title">
            <div>
              <h1>{selectedCategory ? `${selectedCategory.label}咨询` : "选择咨询部位"}</h1>
              <span>{selectedCategory ? "围绕当前部位回答" : "从最接近的不适位置开始"}</span>
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

              <div className="quick-actions">
                {quickReplies.map((reply) => (
                  <button key={reply} onClick={() => sendMessage(reply)}>
                    {reply}
                  </button>
                ))}
              </div>

              <form
                className="chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={`描述你的${selectedCategory.label}问题，例如“${selectedCategory.examples[0]}”`}
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
          <Panel title="今日计划" action={activeCase?.plan ? "查看完整计划" : undefined}>
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
                title={activeCase ? "问诊后生成今日计划" : "选择病例后生成今日计划"}
                description={activeCase ? "先补充疼痛位置、诱发动作、疼痛评分和最近训练量，AI 会基于病例生成计划草案。" : "当前还没有病例，选择咨询部位后再开始问诊。"}
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
                description="康复阶段需要基于完整问诊和风险分层生成，未问诊前不展示默认阶段。"
              />
            )}
          </Panel>

          <Panel title="需要专业支持?">
            <p className="support-copy">如果症状持续或加重，建议及时与康复师沟通。</p>
            <div className="clinician-card">
              <span className="avatar photo">李</span>
              <div>
                <strong>李康复师</strong>
                <small>运动康复师 · 关节与跑步损伤</small>
                <small>10年经验</small>
              </div>
              <em>在线</em>
            </div>
            <div className="support-actions">
              <button className="green-button">在线咨询</button>
              <button>预约面诊</button>
            </div>
            <p className="emergency">紧急情况请立即就医 ⓘ</p>
          </Panel>
        </aside>
      </section>
    </main>
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
      <div className="category-copy">
        <span>AI 专项咨询</span>
        <h2>你想先咨询哪个部位?</h2>
        <p>告诉我最主要的不适位置，我会从疼痛表现、训练负荷和风险信号开始问起。</p>
      </div>
      <div className="category-grid">
        {categories.map((category) => (
          <button className="category-card" key={category.id} onClick={() => onSelect(category)}>
            <span className="category-mark">{category.mark}</span>
            <strong>{category.label}</strong>
            <small>{category.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({
  onLogin,
  onRegister,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (input: RegisterInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("ReZ");
  const [heightCm, setHeightCm] = useState("175");
  const [weightKg, setWeightKg] = useState("68");
  const [sportLevel, setSportLevel] = useState("中级跑者");
  const [weeklyFrequency, setWeeklyFrequency] = useState("4-5 次");
  const [primaryGoal, setPrimaryGoal] = useState("安全恢复跑步");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isRegistering = mode === "register";

  return (
    <main className="login-page">
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
          <h1>{isRegistering ? "创建用户档案" : "运动康复 AI 用户端"}</h1>
          <p>{isRegistering ? "目前仅开放 ique1116 注册。基础信息会用于问诊和训练计划展示。" : "登录后进入你的病例、训练计划和 AI 咨询记录。"}</p>
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
                  username: username.trim(),
                  password,
                  displayName: displayName.trim(),
                  heightCm: heightCm.trim(),
                  weightKg: weightKg.trim(),
                  sportLevel: sportLevel.trim(),
                  weeklyFrequency: weeklyFrequency.trim(),
                  primaryGoal: primaryGoal.trim(),
                })
              : onLogin(username.trim(), password);
            action
              .catch(() => setError(isRegistering ? "注册暂未开放给该账号，请使用 ique1116。" : "登录失败，请检查账号密码或后端服务。"))
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
              <label>
                运动水平
                <input value={sportLevel} onChange={(event) => setSportLevel(event.target.value)} />
              </label>
              <label>
                周运动频率
                <input value={weeklyFrequency} onChange={(event) => setWeeklyFrequency(event.target.value)} />
              </label>
              <label>
                主要目标
                <input value={primaryGoal} onChange={(event) => setPrimaryGoal(event.target.value)} />
              </label>
            </>
          ) : null}
          {error ? <p className="login-error">{error}</p> : null}
          <button className="login-submit" disabled={isLoggingIn || !username.trim() || !password} type="submit">
            {isLoggingIn ? "处理中..." : isRegistering ? "保存并进入" : "进入用户端"}
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
