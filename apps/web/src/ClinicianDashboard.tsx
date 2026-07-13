import { useEffect, useRef, useState } from "react";
import rezLogo from "./assets/rez-logo.png";
import { API_BASE } from "./apiBase";
import { actionBodyPartFilters } from "./consultCategories";
import { clientBuildId } from "./buildInfo";
import { TinyIcon } from "./components/Shared";
import {
  actionLibraryMetaLine,
  actionMatchesBodyPartFilter,
  availabilityStatusLabel,
  buildLegalHolidayMap,
  buildMonthCalendar,
  consultationStatusLabel,
  credentialStatusLabel,
  formatDateKey,
  formatDateTimeShort,
  formatTime,
  isSameDate,
  isSameLocalDay,
  startOfMonth,
} from "./format";
import type {
  ActionLibraryItem,
  AuthSession,
  ClinicianAvailabilitySlot,
  ClinicianPage,
  ClinicianWorkoutItem,
  ClinicianWorkoutTemplate,
  ConsultationSession,
  ConsultationSnapshot,
} from "./types";

export function ClinicianDashboard({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
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
    return matchesKeyword && matchesBodyPart;
  });
  const visibleActions = filteredActions.slice(0, 120);
  const hasMoreFilteredActions = filteredActions.length > visibleActions.length;

  function selectActionBodyPartFilter(filterId: string) {
    setSelectedActionBodyPartFilter(filterId);
    setActionFilter("");
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
              <span>阶段</span>
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
