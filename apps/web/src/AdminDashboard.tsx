import { useEffect, useState } from "react";
import rezLogo from "./assets/rez-logo.png";
import { API_BASE } from "./apiBase";
import { clientBuildId } from "./buildInfo";
import { TinyIcon } from "./components/Shared";
import { credentialStatusLabel, formatDateTimeShort } from "./format";
import type { AdminClinicianReviewItem, AuthSession } from "./types";

export function AdminDashboard({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
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
