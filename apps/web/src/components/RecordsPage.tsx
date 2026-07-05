import { useState } from "react";
import { canDeleteCase } from "../caseUtils";
import type { PatientCase, RehabConsultCategory } from "../types";

export function RecordsPage({
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
