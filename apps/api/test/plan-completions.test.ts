import { describe, expect, it } from "vitest";
import { completionPercentForDate } from "@mentis/domain";
import {
  createPlatformDemo,
  recordPlanCompletion,
  rememberCase,
  rememberTrainingPlan,
  summarizeAdherence,
} from "../src/index";
import type { MemoryTrainingPlan, MemoryTrainingPlanInput, PlatformDemo } from "../src/index";

function seedPlan(platform: PlatformDemo): MemoryTrainingPlan {
  rememberCase(platform, "user_1", {
    id: "case_1",
    categoryId: "knee",
    title: "下楼梯膝盖疼",
    summary: "下楼梯膝盖疼",
    status: "咨询中",
    createdAt: new Date().toISOString(),
  });

  const input: MemoryTrainingPlanInput = {
    id: "plan_1",
    caseId: "case_1",
    categoryId: "knee",
    title: "膝盖康复训练计划",
    status: "active",
    dayLabel: "今日训练",
    completionPercent: 0,
    items: [
      { actionId: "action_quad_iso", title: "股四头肌等长收缩", meta: "3 组 x 30 秒", state: "todo" },
      { title: "坐姿腘绳肌拉伸", meta: "3 组 x 30 秒", state: "todo" },
    ],
    stage: { name: "镇痛与激活", progressLabel: "第 1 天", progressPercent: 0, goals: ["无痛完成"] },
  };
  const memory = rememberTrainingPlan(platform, "user_1", input);
  return memory.trainingPlans[0];
}

describe("plan completions", () => {
  it("records a completion under today's date, keyed by actionId when present", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);

    const today = new Date("2026-07-12T10:00:00.000Z");
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const plan = memory.trainingPlans[0];

    expect(plan.completions).toEqual([{ date: "2026-07-12", doneKeys: ["action_quad_iso"] }]);
  });

  it("falls back to the title as key for items without an actionId", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);

    const today = new Date("2026-07-12T10:00:00.000Z");
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "坐姿腘绳肌拉伸", true, today);

    expect(memory.trainingPlans[0].completions?.[0].doneKeys).toEqual(["坐姿腘绳肌拉伸"]);
  });

  it("unchecking removes the key without dropping the day's record", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    const today = new Date("2026-07-12T10:00:00.000Z");

    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", false, today);

    expect(memory.trainingPlans[0].completions?.[0].doneKeys).toEqual([]);
  });

  it("is idempotent — checking twice does not duplicate the key", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    const today = new Date("2026-07-12T10:00:00.000Z");

    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);

    expect(memory.trainingPlans[0].completions?.[0].doneKeys).toEqual(["action_quad_iso"]);
  });

  it("computes today's percent and reports zero for a day with no record (cross-day reset)", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    const today = new Date("2026-07-12T10:00:00.000Z");
    const memory = recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, today);
    const plan = memory.trainingPlans[0];

    expect(completionPercentForDate(plan, "2026-07-12")).toBe(50);
    expect(completionPercentForDate(plan, "2026-07-13")).toBe(0);
  });

  it("keeps at most 30 days of completions", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);

    for (let dayOffset = 0; dayOffset < 35; dayOffset += 1) {
      const day = new Date(Date.UTC(2026, 5, 1 + dayOffset, 10));
      recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, day);
    }

    const completions = platform.userMemories.user_1.trainingPlans[0].completions ?? [];
    expect(completions).toHaveLength(30);
    // 35 distinct days recorded (2026-06-01 .. 2026-07-05); keeping the most recent 30
    // drops 2026-06-01..05, so the oldest surviving (ascending-sorted, index 0) is 06-06.
    expect(completions[0].date).toBe("2026-06-06");
  });

  it("summarizes the last 7 days of adherence for the AI to see", () => {
    const platform = createPlatformDemo();
    seedPlan(platform);
    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, new Date("2026-07-12T10:00:00.000Z"));
    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, new Date("2026-07-10T10:00:00.000Z"));
    recordPlanCompletion(platform, "user_1", "plan_1", "action_quad_iso", true, new Date("2026-07-01T10:00:00.000Z"));

    const plans = platform.userMemories.user_1.trainingPlans;
    expect(summarizeAdherence(plans, new Date("2026-07-12T10:00:00.000Z"))).toBe("最近 7 天完成训练 2 天");
  });
});
