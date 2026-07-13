import { describe, expect, it } from "vitest";
import { kneeRehabActionLibrary } from "../src/action-library.seed";

describe("knee rehab seed library", () => {
  it("has no duplicate ids", () => {
    const ids = kneeRehabActionLibrary.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every action with a type and target muscles", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.actionType, `${action.id} missing actionType`).toBeDefined();
      expect(action.targetMuscles?.length, `${action.id} missing targetMuscles`).toBeGreaterThan(0);
    }
  });

  it("marks every action as a knee-region seed", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.source).toBe("seed");
      expect(action.bodyRegion).toBe("knee");
      expect(action.bodyRegions).toContain("knee");
    }
  });

  it("gives every action usable instructions and a hard stop rule", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.instructions.length, `${action.id} needs 3-5 steps`).toBeGreaterThanOrEqual(3);
      expect(action.instructions.length).toBeLessThanOrEqual(5);
      expect(action.contraindications.some((rule) => rule.includes("4/10")), `${action.id} missing pain stop rule`).toBe(true);
      expect(action.progressionCriteria.length).toBeGreaterThan(0);
    }
  });

  it("covers all five rehab phases", () => {
    const phases = new Set(kneeRehabActionLibrary.map((action) => action.phase));
    expect(phases).toEqual(new Set(["镇痛与激活", "活动度与拉伸", "力量", "神经肌肉控制", "回归活动"]));
  });

  it("has a hamstring stretch reachable from the knee category — the gap that caused the wrong recommendation", () => {
    const hamstringStretch = kneeRehabActionLibrary.find(
      (action) => action.actionType === "stretch" && action.targetMuscles?.includes("腘绳肌"),
    );
    expect(hamstringStretch).toBeDefined();
    expect(hamstringStretch?.bodyRegions).toContain("knee");
  });
});
