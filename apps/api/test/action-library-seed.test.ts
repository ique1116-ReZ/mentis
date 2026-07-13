import { describe, expect, it } from "vitest";
import { kneeRehabActionLibrary } from "../src/action-library.seed";
import { formatActionLibraryContext, normalizeActionType } from "../src/chat";

// Ids that were deliberately gated by encoding a clearance requirement into
// title / phase / defaultDosage — the only fields `formatActionLibraryContext`
// exposes to the model at selection time. `contraindications` is invisible
// until after the AI has already endorsed the action, so it cannot carry the
// gate on its own.
//
// A structural rule ("any entry whose contraindications mention 许可/禁用/负重限制
// must also signal the gate in title or defaultDosage") was tried first and
// rejected: it flagged 13 pre-existing, out-of-scope entries (e.g.
// action_wall_sit, action_mini_squat, action_leg_press_light) that carry a
// generic "术后负重限制未解除前不做" precaution shared by nearly every closed-chain
// strength-phase exercise. Gating all of those was never asked for and would
// make every strength action look forbidden. So this locks in the specific
// set that was actually gated, by id.
const GATED_ACTION_IDS = [
  "action_nordic_eccentric",
  "action_gastroc_stretch",
  "action_soleus_stretch",
  "action_calf_wall_stretch",
  "action_hip_flexor_stretch",
  "action_hamstring_curl",
] as const;

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

  it("prefixes every id with action_", () => {
    for (const action of kneeRehabActionLibrary) {
      expect(action.id, `${action.id} must start with action_`).toMatch(/^action_/);
    }
  });

  it("gives every stretch a time-based dosage — a stretch holding reps instead of seconds is the modality/dosage mismatch users complained about", () => {
    const stretches = kneeRehabActionLibrary.filter((action) => action.actionType === "stretch");
    expect(stretches.length).toBeGreaterThan(0);
    for (const action of stretches) {
      expect(action.defaultDosage, `${action.id} stretch dosage must be held in 秒`).toContain("秒");
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

  it("keeps the Nordic curl gated: 回归活动 phase, 需治疗师许可 in the title, dosage prefixed with the clearance gate", () => {
    const nordic = kneeRehabActionLibrary.find((action) => action.id === "action_nordic_eccentric");
    expect(nordic).toBeDefined();
    expect(nordic?.phase).toBe("回归活动");
    expect(nordic?.title).toContain("需治疗师许可");
    expect(nordic?.defaultDosage.startsWith("须经治疗师许可后再做：")).toBe(true);
  });

  it("gates EVERY 回归活动 entry — a structural rule a future return-to-sport action cannot silently violate", () => {
    // 回归活动 = 跑跳、回归运动。术后两周的病人问「什么时候能跑步」时，TF-IDF 会把
    // 走跑交替顶到候选列表第一位；prompt 里只看得到 `标题；类型；肌群；阶段；剂量`。
    // 所以这一阶段的每一条都必须在标题或剂量里带上放行条件，靠 id 白名单挡不住新增动作。
    const gateSignal = /许可|禁用|负重限制/;
    const returnToSport = kneeRehabActionLibrary.filter((action) => action.phase === "回归活动");
    expect(returnToSport.length).toBeGreaterThanOrEqual(5);
    for (const action of returnToSport) {
      const signaled = gateSignal.test(action.title) || gateSignal.test(action.defaultDosage);
      expect(
        signaled,
        `${action.id}（回归活动）没有放行门槛：标题和剂量里都没有许可/禁用/负重限制的信号`,
      ).toBe(true);
    }
  });

  it("renders the clearance gate for the return-to-sport actions into the prompt line the model reads", () => {
    for (const action of kneeRehabActionLibrary.filter((entry) => entry.phase === "回归活动")) {
      const rendered = formatActionLibraryContext([action], [], undefined);
      const line = rendered.split("\n").find((entry) => entry.startsWith(`- ${action.id}:`));
      expect(line, `${action.id} did not render a prompt line`).toBeDefined();
      expect(/许可|禁用|负重限制/.test(line!), `${action.id}'s rendered prompt line lost its gate: ${line}`).toBe(true);
    }
  });

  it("keeps every deliberately-gated action's clearance signal in title or defaultDosage — the only fields visible at selection time", () => {
    const gateSignal = /许可|禁用|负重限制/;
    for (const id of GATED_ACTION_IDS) {
      const action = kneeRehabActionLibrary.find((entry) => entry.id === id);
      expect(action, `${id} must exist in the seed library`).toBeDefined();
      const signaled = gateSignal.test(action!.title) || gateSignal.test(action!.defaultDosage);
      expect(signaled, `${id} lost its clearance gate — neither title nor defaultDosage signals it anymore`).toBe(
        true,
      );
    }
  });

  it("renders the clearance gate into the one prompt line the model actually reads", () => {
    // formatActionLibraryContext is what buildChatSystemPrompt feeds the model: one line per
    // action, `id: title；type；muscles；phase；dosage`. contraindications never appear here.
    // Render each gated action in isolation (empty messages, no category) so ranking can't drop it.
    for (const id of GATED_ACTION_IDS) {
      const action = kneeRehabActionLibrary.find((entry) => entry.id === id);
      expect(action).toBeDefined();
      const rendered = formatActionLibraryContext([action!], [], undefined);
      const line = rendered.split("\n").find((entry) => entry.startsWith(`- ${id}:`));
      expect(line, `${id} did not render a prompt line`).toBeDefined();
      expect(/许可|禁用|负重限制/.test(line!), `${id}'s rendered prompt line lost its gate: ${line}`).toBe(true);
    }
  });

  it("normalizeActionType accepts the widened enum (plyometric, conditioning) and rejects garbage", () => {
    expect(normalizeActionType("stretch")).toBe("stretch");
    expect(normalizeActionType("strength")).toBe("strength");
    expect(normalizeActionType("activation")).toBe("activation");
    expect(normalizeActionType("mobility")).toBe("mobility");
    expect(normalizeActionType("balance")).toBe("balance");
    expect(normalizeActionType("plyometric")).toBe("plyometric");
    expect(normalizeActionType("conditioning")).toBe("conditioning");
    // case/whitespace tolerant, same as the model's raw string output
    expect(normalizeActionType("  Plyometric ")).toBe("plyometric");
    expect(normalizeActionType("CONDITIONING")).toBe("conditioning");
    // garbage must round-trip to undefined, not silently coerce to a real type
    expect(normalizeActionType("cardio")).toBeUndefined();
    expect(normalizeActionType("")).toBeUndefined();
  });
});
