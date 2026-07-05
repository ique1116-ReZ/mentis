import { consultationStatusLabel, formatDateTimeShort, formatTime } from "../format";
import type {
  ClinicianAvailabilitySlot,
  ClinicianDirectoryEntry,
  ConsultationSnapshot,
  PatientCase,
} from "../types";

export function ConsultationPanel({
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
