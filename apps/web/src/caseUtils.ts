import { pendingComplaintTitle } from "./consultCategories";
import type { CasePlan, ChatMessage, ChatPlanPatch, MemoryTrainingPlan, PatientCase, TrainingPlan, UserMemory } from "./types";

export function isComplaintPending(patientCase: PatientCase) {
  return patientCase.title === pendingComplaintTitle;
}

export function hydrateCasesFromMemory(memory: UserMemory, existingCases: PatientCase[] = []): PatientCase[] {
  return memory.cases.map((memoryCase) => {
    const existingCase = existingCases.find((patientCase) => patientCase.id === memoryCase.id);
    return {
      ...memoryCase,
      messages: existingCase?.messages ?? [],
      messagesLoaded: existingCase?.messagesLoaded ?? false,
      plan: existingCase?.plan ?? planForCase(memory, memoryCase.id),
    };
  });
}

export function planForCase(memory: UserMemory, caseId: string): CasePlan | null {
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

export function displayTrainingPlans(memoryPlans: MemoryTrainingPlan[], cases: PatientCase[]): MemoryTrainingPlan[] {
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

export function mergePlanGoals(currentGoals: string[], nextGoals: string[]): string[] {
  return Array.from(new Set([...currentGoals, ...nextGoals].filter(Boolean))).slice(0, 5);
}

export function makeComplaintTitle(content: string) {
  return truncateText(content, 18);
}

export function makeComplaintSummary(content: string) {
  return truncateText(content, 34);
}

export function shouldShowCaseSummary(title: string, summary: string) {
  return Boolean(summary.trim()) && title.trim() !== summary.trim();
}

export function isChatPromptAnswered(messages: ChatMessage[], messageIndex: number) {
  const message = messages[messageIndex];
  if (message?.role !== "assistant" || !message.options?.length) {
    return false;
  }
  return messages.slice(messageIndex + 1).some((candidate) => candidate.role === "user");
}

export function truncateText(content: string, maxLength: number) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function canDeleteCase(patientCase: PatientCase) {
  return !patientCase.plan && !/处方已接受|已接受运动处方|计划已接受/.test(patientCase.status);
}

export function isCompletePlanPatch(planPatch: ChatPlanPatch): planPatch is CasePlan {
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

// 消息接口是只追加的：一次拉取如果比本地已有的消息少，说明这是一次过期的响应
// （在拉取进行期间，本地又追加了新消息）。此时保留本地状态，避免把正在进行的
// 对话用旧快照覆盖掉；否则以拉取结果为准（服务端持久化了更完整的历史）。
export function mergeFetchedMessages(local: ChatMessage[], fetched: ChatMessage[]): ChatMessage[] {
  return fetched.length >= local.length ? fetched : local;
}

export function trainingPlanToCasePlan(plan: TrainingPlan): CasePlan {
  return {
    title: plan.title,
    dayLabel: plan.dayLabel,
    completionPercent: plan.stage.progressPercent,
    items: plan.items,
    stage: plan.stage,
  };
}
