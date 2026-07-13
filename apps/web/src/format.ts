import type {
  ActionBodyPartFilter,
  ActionBodyRegion,
  ActionLibraryItem,
  AdminClinicianReviewItem,
  ClinicianAvailabilitySlot,
  ConsultationSession,
} from "./types";

export function consultationStatusLabel(status: ConsultationSession["status"]) {
  const labels: Record<ConsultationSession["status"], string> = {
    active: "咨询中",
    cancelled: "已取消",
    closed: "已结束",
    completed: "已完成",
    expired: "已过期",
    scheduled: "已预约",
    waiting_clinician: "等待康复师",
  };
  return labels[status];
}

export function availabilityStatusLabel(status: ClinicianAvailabilitySlot["status"]) {
  const labels: Record<ClinicianAvailabilitySlot["status"], string> = {
    available: "可预约",
    blocked: "不可约",
    booked: "已预约",
  };
  return labels[status];
}

export function credentialStatusLabel(status: AdminClinicianReviewItem["credentialStatus"]) {
  const labels: Record<AdminClinicianReviewItem["credentialStatus"], string> = {
    pending: "待审核",
    verified: "已通过",
    rejected: "已驳回",
    suspended: "已下架",
  };
  return labels[status];
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatDateTimeShort(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function buildMonthCalendar(anchor: Date): Array<{ date: Date; inMonth: boolean; key: string }> {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      inMonth: date.getMonth() === anchor.getMonth(),
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    };
  });
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildLegalHolidayMap(year: number): Record<string, string> {
  const fixedHolidays: Record<string, string> = {
    [`${year}-01-01`]: "元旦",
    [`${year}-05-01`]: "劳动节",
    [`${year}-05-02`]: "劳动节",
    [`${year}-10-01`]: "国庆",
    [`${year}-10-02`]: "国庆",
    [`${year}-10-03`]: "国庆",
  };

  // Lunar and solar-term holidays are year-specific; seed 2026 until this is server-driven.
  if (year === 2026) {
    return {
      ...fixedHolidays,
      "2026-02-16": "除夕",
      "2026-02-17": "春节",
      "2026-02-18": "春节",
      "2026-02-19": "春节",
      "2026-04-05": "清明",
      "2026-06-19": "端午",
      "2026-09-25": "中秋",
    };
  }

  return fixedHolidays;
}

export function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isSameLocalDay(value: string, date: Date) {
  const candidate = new Date(value);
  return isSameDate(candidate, date);
}

export function actionBodyRegionLabel(region: ActionBodyRegion) {
  switch (region) {
    case "knee":
      return "膝 / 下肢";
    case "ankle_foot":
      return "踝足 / 小腿";
    case "hip":
      return "髋 / 臀";
    case "spine":
      return "核心 / 脊柱";
    case "shoulder":
      return "肩 / 上肢";
    case "other":
      return "综合";
  }
}

export function actionLibraryMetaLine(action: ActionLibraryItem) {
  const priorityTags = (action.tags ?? []).slice(0, 4).join(" / ");
  return priorityTags ? `${actionBodyRegionLabel(action.bodyRegion)} · ${priorityTags}` : actionBodyRegionLabel(action.bodyRegion);
}

export function actionMatchesBodyPartFilter(action: ActionLibraryItem, filter: ActionBodyPartFilter) {
  if (filter.id === "all") {
    return true;
  }
  if (filter.phase) {
    return action.phase === filter.phase;
  }
  // 部位匹配读 bodyRegions（回退到单值 bodyRegion）：一个动作可以横跨膝/踝/髋。
  if (filter.bodyRegions) {
    const regions = action.bodyRegions ?? [action.bodyRegion];
    return filter.bodyRegions.some((region) => regions.includes(region));
  }
  return false;
}
