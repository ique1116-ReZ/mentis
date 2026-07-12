import { pendingComplaintTitle } from "./consultCategories";
import type { CasePlan, ChatPlanPatch, MemoryTrainingPlan, PatientCase, TrainingPlan, UserMemory } from "./types";

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

export function trainingPlanToCasePlan(plan: TrainingPlan): CasePlan {
  return {
    title: plan.title,
    dayLabel: plan.dayLabel,
    completionPercent: plan.stage.progressPercent,
    items: plan.items,
    stage: plan.stage,
  };
}
