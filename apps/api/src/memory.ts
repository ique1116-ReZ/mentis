import { completionPercentForDate, dateKey, MAX_PLAN_COMPLETION_DAYS } from "@mentis/domain";
import { conflict, generateEntityId, notFound, truncateForMemory } from "./helpers.js";
import type {
  MemoryCaseSummary,
  MemoryEvent,
  MemoryTrainingPlan,
  MemoryTrainingPlanInput,
  PlatformDemo,
  UserMemory,
} from "./types.js";

export function emptyUserMemory(userId: string): UserMemory {
  return {
    userId,
    profileSummary: "",
    clinicalSummary: "",
    activePlanSummary: "",
    recentEvents: [],
    cases: [],
    trainingPlans: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getUserMemory(platform: PlatformDemo, userId: string): UserMemory {
  const user = platform.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw notFound(`Unknown user: ${userId}`);
  }

  platform.userMemories[userId] ??= emptyUserMemory(userId);

  return platform.userMemories[userId];
}

export function rememberCase(platform: PlatformDemo, userId: string, input: MemoryCaseSummary): UserMemory {
  const memory = getUserMemory(platform, userId);
  const nextCase = { ...input, createdAt: input.createdAt || new Date().toISOString() };
  memory.cases = [nextCase, ...memory.cases.filter((candidate) => candidate.id !== nextCase.id)];
  memory.clinicalSummary = summarizeClinicalMemory(memory.cases);
  addMemoryEvent(memory, "case_updated", `记录病例：${nextCase.title}，${nextCase.summary || nextCase.status}`);
  memory.updatedAt = new Date().toISOString();
  return memory;
}

export function deleteRememberedCase(platform: PlatformDemo, userId: string, caseId: string): UserMemory {
  const memory = getUserMemory(platform, userId);
  const target = memory.cases.find((candidate) => candidate.id === caseId);
  if (!target) {
    return memory;
  }
  if (isAcceptedPrescriptionStatus(target.status)) {
    throw conflict("Accepted prescription cases cannot be deleted");
  }

  memory.cases = memory.cases.filter((candidate) => candidate.id !== caseId);
  memory.updatedAt = new Date().toISOString();
  return memory;
}

export function rememberTrainingPlan(
  platform: PlatformDemo,
  userId: string,
  input: MemoryTrainingPlanInput,
): UserMemory {
  const memory = getUserMemory(platform, userId);
  const now = new Date().toISOString();
  const nextPlan: MemoryTrainingPlan = {
    ...input,
    updatedAt: input.updatedAt || now,
  };

  memory.trainingPlans = [
    nextPlan,
    ...memory.trainingPlans.filter((candidate) => candidate.id !== nextPlan.id),
  ];
  memory.cases = memory.cases.map((candidate) =>
    candidate.id === nextPlan.caseId ? { ...candidate, status: "运动处方已接受" } : candidate,
  );
  memory.clinicalSummary = summarizeClinicalMemory(memory.cases);
  memory.activePlanSummary = summarizeActivePlans(memory.trainingPlans);
  addMemoryEvent(memory, "plan_updated", `接受训练计划：${nextPlan.title}，${summarizePlanItems(nextPlan.items)}`);
  memory.updatedAt = now;
  return memory;
}

export function isAcceptedPrescriptionStatus(status: string): boolean {
  return /处方已接受|已接受运动处方|计划已接受/.test(status);
}

function addMemoryEvent(memory: UserMemory, type: MemoryEvent["type"], summary: string): void {
  const event: MemoryEvent = {
    id: `memory_${generateEntityId()}`,
    type,
    summary: truncateForMemory(summary, 90),
    createdAt: new Date().toISOString(),
  };
  memory.recentEvents = [event, ...(memory.recentEvents ?? [])].slice(0, 5);
}

function summarizeClinicalMemory(cases: MemoryCaseSummary[]): string {
  const summaries = cases.slice(0, 3).map((patientCase) => {
    const status = patientCase.status ? `，${patientCase.status}` : "";
    const summary = patientCase.summary ? `：${patientCase.summary}` : "";
    return `${patientCase.title}${status}${summary}`;
  });
  return truncateForMemory(summaries.join("；"), 320);
}

function summarizeActivePlans(plans: MemoryTrainingPlan[]): string {
  const activePlans = plans.filter((plan) => plan.status === "active").slice(0, 2);
  const summaries = activePlans.map((plan) => `${plan.title}，${plan.dayLabel}，动作：${summarizePlanItems(plan.items)}`);
  const adherence = summarizeAdherence(plans);
  return truncateForMemory([...summaries, adherence].filter(Boolean).join("；"), 320);
}

export function recordPlanCompletion(
  platform: PlatformDemo,
  userId: string,
  planId: string,
  key: string,
  done: boolean,
  today: Date = new Date(),
): UserMemory {
  const memory = getUserMemory(platform, userId);
  const plan = memory.trainingPlans.find((candidate) => candidate.id === planId);
  if (!plan) {
    throw notFound(`Unknown training plan: ${planId}`);
  }

  const date = dateKey(today);
  const completions = [...(plan.completions ?? [])];
  const index = completions.findIndex((entry) => entry.date === date);
  const existing = index >= 0 ? completions[index] : { date, doneKeys: [] };
  const doneKeys = done
    ? Array.from(new Set([...existing.doneKeys, key]))
    : existing.doneKeys.filter((candidate) => candidate !== key);
  const entry = { date, doneKeys };

  if (index >= 0) {
    completions[index] = entry;
  } else {
    completions.push(entry);
  }

  plan.completions = completions
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_PLAN_COMPLETION_DAYS);
  plan.completionPercent = completionPercentForDate(plan, date);
  plan.updatedAt = new Date().toISOString();

  memory.activePlanSummary = summarizeActivePlans(memory.trainingPlans);
  memory.updatedAt = new Date().toISOString();
  return memory;
}

export function summarizeAdherence(plans: MemoryTrainingPlan[], today: Date = new Date()): string {
  const windowDays = 7;
  const cutoff = new Date(today.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
  const cutoffKey = dateKey(cutoff);
  const activeDates = new Set<string>();

  for (const plan of plans) {
    for (const entry of plan.completions ?? []) {
      if (entry.date >= cutoffKey && entry.doneKeys.length > 0) {
        activeDates.add(entry.date);
      }
    }
  }
  return `最近 ${windowDays} 天完成训练 ${activeDates.size} 天`;
}

function summarizePlanItems(items: MemoryTrainingPlan["items"]): string {
  return items
    .slice(0, 5)
    .map((item) => `${item.title} ${item.meta}`)
    .join("、");
}
