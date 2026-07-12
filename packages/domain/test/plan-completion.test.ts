import { describe, expect, it } from "vitest";
import { completionPercentForDate, dateKey, doneKeysForDate, planItemKey } from "../src/index";
import type { PlanCheckable } from "../src/index";

const plan: PlanCheckable = {
  items: [
    { actionId: "action_quad_iso", title: "股四头肌等长收缩" },
    { title: "坐姿腘绳肌拉伸" },
  ],
  completions: [{ date: "2026-07-12", doneKeys: ["action_quad_iso"] }],
};

describe("plan completion", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(dateKey(new Date("2026-07-12T10:00:00.000Z"))).toBe("2026-07-12");
  });

  it("keys items by actionId, falling back to title", () => {
    expect(planItemKey(plan.items[0])).toBe("action_quad_iso");
    expect(planItemKey(plan.items[1])).toBe("坐姿腘绳肌拉伸");
  });

  it("reads back the keys completed on a given day", () => {
    expect(doneKeysForDate(plan, "2026-07-12").has("action_quad_iso")).toBe(true);
    expect(doneKeysForDate(plan, "2026-07-12").has("坐姿腘绳肌拉伸")).toBe(false);
  });

  it("resets across days — yesterday's completions do not count today", () => {
    expect(completionPercentForDate(plan, "2026-07-12")).toBe(50);
    expect(completionPercentForDate(plan, "2026-07-13")).toBe(0);
    expect(doneKeysForDate(plan, "2026-07-13").size).toBe(0);
  });

  it("ignores done keys that no longer match any item in the plan", () => {
    const stale: PlanCheckable = {
      items: [{ actionId: "action_quad_iso", title: "股四头肌等长收缩" }],
      completions: [{ date: "2026-07-12", doneKeys: ["action_quad_iso", "action_removed"] }],
    };
    expect(completionPercentForDate(stale, "2026-07-12")).toBe(100);
  });

  it("reports zero for an empty plan rather than dividing by zero", () => {
    expect(completionPercentForDate({ items: [], completions: [] }, "2026-07-12")).toBe(0);
  });
});
