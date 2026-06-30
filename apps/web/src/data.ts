import { buildInitialAssessment, draftKneeRunningPlan, summarizeEvidence } from "@mentis/domain";

export const assessment = buildInitialAssessment({
  bodyRegion: "knee",
  conditionFocus: "patellofemoral_pain",
  painScore: 4,
  durationDays: 28,
  symptoms: ["跑步下坡痛", "久坐后膝前痛"],
  trainingLoad: "每周跑量 35km，准备半马恢复训练",
});

export const rehabPlan = draftKneeRunningPlan(assessment);

export const evidence = summarizeEvidence([
  {
    source: "Patellofemoral Pain 2019 LOGO.pdf",
    page: 20,
    evidenceType: "clinical_practice_guideline",
    quote: "Exercise therapy is recommended.",
    score: 0.82,
  },
  {
    source: "Front_Rehabil_Sci_2025_patellofemoral_pain_knee_extensor_training_review.pdf",
    page: 7,
    evidenceType: "systematic_review",
    quote: "Knee extensor training can be progressed by irritability.",
    score: 0.77,
  },
  {
    source: "ACSMs Guidelines for Exercise Testing and Prescription 12th ed 2025.pdf",
    page: 166,
    evidenceType: "textbook",
    quote: "Exercise prescription requires individual risk screening.",
    score: 0.61,
  },
]);

export const reports = [
  { name: "右膝 MRI 报告.pdf", type: "PDF", date: "2026-06-22", size: "2.4 MB" },
  { name: "膝关节超声检查.pdf", type: "PDF", date: "2026-06-18", size: "1.8 MB" },
  { name: "正侧位 X 光片.jpg", type: "JPG", date: "2026-06-16", size: "3.2 MB" },
];

export const timeline = [
  { label: "病史采集", date: "06-18", status: "done" },
  { label: "症状评估", date: "06-18", status: "done" },
  { label: "功能测试", date: "06-19", status: "done" },
  { label: "影像与报告", date: "06-22", status: "done" },
  { label: "AI 综合评估", date: "06-30", status: "active" },
  { label: "专家复核", date: "待预约", status: "next" },
];
