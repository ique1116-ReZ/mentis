import type { MemoryTrainingPlan, PatientCase } from "../types";

export function PlansPage({
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
                      {item.instructions && item.instructions.length > 0 ? (
                        <ul className="training-detail-list">
                          {item.instructions.slice(0, 5).map((instruction) => (
                            <li key={instruction}>{instruction}</li>
                          ))}
                        </ul>
                      ) : null}
                      {item.contraindications && item.contraindications.length > 0 ? (
                        <small className="training-caution">停止条件：{item.contraindications.slice(0, 3).join("；")}</small>
                      ) : null}
                      {item.progressionCriteria && item.progressionCriteria.length > 0 ? (
                        <small className="training-caution">进阶标准：{item.progressionCriteria.slice(0, 3).join("；")}</small>
                      ) : null}
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
