import { describe, expect, it } from "vitest";
import { createPlatformDemo, isLibraryActionMatch, resolveRecommendedActions } from "../src/index";
import type { ActionLibraryItem, ChatRecommendedAction, PlatformDemo } from "../src/index";

const quadStretchItem: ActionLibraryItem = {
  id: "action_quad_stretch",
  title: "俯卧股四头肌拉伸",
  bodyRegion: "knee",
  bodyRegions: ["knee"],
  actionType: "stretch",
  targetMuscles: ["股四头肌"],
  source: "seed",
  phase: "活动度与拉伸",
  defaultDosage: "3 组 x 30 秒",
  instructions: ["俯卧，屈膝把脚跟拉向臀部"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["牵拉感可耐受"],
  tags: ["膝盖"],
};

const legacyItem: ActionLibraryItem = {
  id: "exercise_BWnJR72",
  title: "lying (side) quads stretch",
  bodyRegion: "knee",
  phase: "下肢力量与控制",
  defaultDosage: "2-3 组 x 8-12 次",
  instructions: ["Lie on your side"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["动作质量稳定"],
  tags: ["exercise-library"],
};

function hamstringRecommendation(actionId?: string): ChatRecommendedAction {
  return {
    actionId,
    title: "坐姿腘绳肌拉伸",
    bodyRegion: "knee",
    actionType: "stretch",
    targetMuscles: ["腘绳肌"],
    phase: "活动度与拉伸",
    defaultDosage: "3 组 x 30 秒",
    instructions: ["坐在椅子边缘，患侧腿向前伸直"],
    contraindications: ["训练中疼痛明显加重"],
    progressionCriteria: ["牵拉感可耐受"],
    tags: ["膝盖"],
    reason: "缓解膝盖后方紧绷",
  };
}

function platformWith(items: ActionLibraryItem[]): PlatformDemo {
  const platform = createPlatformDemo();
  platform.actionLibrary = items;
  return platform;
}

describe("recommended action consistency", () => {
  it("rejects an actionId whose target muscles contradict the recommendation", () => {
    expect(isLibraryActionMatch(hamstringRecommendation(), quadStretchItem)).toBe(false);
  });

  it("rejects an actionId when the library entry has no labels to verify against", () => {
    expect(isLibraryActionMatch(hamstringRecommendation(), legacyItem)).toBe(false);
  });

  it("accepts an actionId when type and muscles agree", () => {
    const item: ActionLibraryItem = { ...quadStretchItem, id: "action_hs", title: "坐姿腘绳肌拉伸", targetMuscles: ["腘绳肌"] };
    expect(isLibraryActionMatch(hamstringRecommendation(), item)).toBe(true);
  });

  it("does NOT silently swap in the mismatched library action (the reported bug)", () => {
    const platform = platformWith([quadStretchItem]);
    const [resolved] = resolveRecommendedActions(platform, [hamstringRecommendation("action_quad_stretch")], "knee");

    expect(resolved.title).toBe("坐姿腘绳肌拉伸");
    expect(resolved.actionId).not.toBe("action_quad_stretch");
    expect(resolved.targetMuscles).toEqual(["腘绳肌"]);
  });

  it("stores the model's action in the library so it accumulates over time", () => {
    const platform = platformWith([quadStretchItem]);
    resolveRecommendedActions(platform, [hamstringRecommendation("action_quad_stretch")], "knee");

    const stored = platform.actionLibrary.find((item) => item.title === "坐姿腘绳肌拉伸");
    expect(stored).toBeDefined();
    expect(stored?.source).toBe("ai");
    expect(stored?.actionType).toBe("stretch");
  });

  it("reuses the library entry when the actionId genuinely matches, keeping the model's reason", () => {
    const item: ActionLibraryItem = { ...quadStretchItem, id: "action_hs", title: "坐姿腘绳肌拉伸", targetMuscles: ["腘绳肌"] };
    const platform = platformWith([item]);
    const [resolved] = resolveRecommendedActions(platform, [hamstringRecommendation("action_hs")], "knee");

    expect(resolved.actionId).toBe("action_hs");
    expect(resolved.instructions).toEqual(["俯卧，屈膝把脚跟拉向臀部"]);
    expect(resolved.reason).toBe("缓解膝盖后方紧绷");
    expect(platform.actionLibrary).toHaveLength(1);
  });

  it("does NOT substitute a same-title library entry whose type/muscles contradict the model (the second door)", () => {
    // 同名但内容对不上：库里这条叫「坐姿腘绳肌拉伸」，实际却被标成股四头肌力量训练。
    // 模型没填 actionId，靠 bodyRegion + 标题也不能把它顶替上来。
    const mislabeledSameTitle: ActionLibraryItem = {
      ...quadStretchItem,
      id: "action_mislabeled",
      title: "坐姿腘绳肌拉伸",
      actionType: "strength",
      targetMuscles: ["股四头肌"],
      instructions: ["坐姿伸膝，负重抬起小腿"],
    };
    const platform = platformWith([mislabeledSameTitle]);

    const [resolved] = resolveRecommendedActions(platform, [hamstringRecommendation()], "knee");

    expect(resolved.actionId).not.toBe("action_mislabeled");
    expect(resolved.actionType).toBe("stretch");
    expect(resolved.targetMuscles).toEqual(["腘绳肌"]);
    expect(resolved.instructions).toEqual(["坐在椅子边缘，患侧腿向前伸直"]);
  });

  it("still reuses a same-title library entry when its type and muscles agree", () => {
    const matchingSameTitle: ActionLibraryItem = {
      ...quadStretchItem,
      id: "action_hs_seed",
      title: "坐姿腘绳肌拉伸",
      targetMuscles: ["腘绳肌"],
    };
    const platform = platformWith([matchingSameTitle]);

    const [resolved] = resolveRecommendedActions(platform, [hamstringRecommendation()], "knee");

    expect(resolved.actionId).toBe("action_hs_seed");
    expect(platform.actionLibrary).toHaveLength(1);
  });

  it("resolves several recommendations in one call", () => {
    const platform = platformWith([]);
    const resolved = resolveRecommendedActions(
      platform,
      [hamstringRecommendation(), { ...hamstringRecommendation(), title: "靠墙静蹲", actionType: "strength", targetMuscles: ["股四头肌"] }],
      "knee",
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.map((action) => action.title)).toEqual(["坐姿腘绳肌拉伸", "靠墙静蹲"]);
  });
});
