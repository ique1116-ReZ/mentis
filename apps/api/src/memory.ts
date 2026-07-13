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
  today: Date = new Date(),
): UserMemory {
  const memory = getUserMemory(platform, userId);
  const now = new Date().toISOString();
  const existingPlan = memory.trainingPlans.find((candidate) => candidate.id === input.id);

  // 客户端（App.tsx rememberTrainingPlanForCurrentUser）POST 的是一个 CasePlan：没有
  // completions 字段，completionPercent 恒为 0。直接 { ...input } 覆盖会把服务端累积的
  // 打卡记录整段抹掉——病人在聊天里点一次「加入今日计划」，最多 30 天的完成历史就没了，
  // 下一轮 prompt 还会告诉模型「最近 7 天完成训练 0 天」。缺字段时一律沿用同 id 旧计划的记录。
  const completions = input.completions ?? existingPlan?.completions;
  const nextPlan: MemoryTrainingPlan = {
    ...input,
    ...(completions ? { completions } : {}),
    updatedAt: input.updatedAt || now,
  };
  // 完成度只从服务端的 completions 推导，不信客户端传来的数字。
  nextPlan.completionPercent = completionPercentForDate(nextPlan, dateKey(today));

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

/**
 * 只描述计划本身，不烘焙依从性。依从性是随时间腐烂的量：写入时算一次、之后原样存着，
 * 病人停练三周后 prompt 里还写着「最近 7 天完成训练 5 天」，模型据此继续加量。
 * 依从性改由 buildUserMemoryContext 在拼 prompt 时用 summarizeAdherence 现算。
 */
function summarizeActivePlans(plans: MemoryTrainingPlan[]): string {
  const activePlans = plans.filter((plan) => plan.status === "active").slice(0, 2);
  const summaries = activePlans.map((plan) => `${plan.title}，${plan.dayLabel}，动作：${summarizePlanItems(plan.items)}`);
  return truncateForMemory(summaries.join("；"), 320);
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
