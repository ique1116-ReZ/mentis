import { describe, expect, it } from "vitest";
import { actionMatchesRegion, rankActionsForChat } from "../src/index";
import type { ActionLibraryItem, ChatMessage } from "../src/index";

const hamstringStretch: ActionLibraryItem = {
  id: "action_hamstring_stretch",
  title: "坐姿腘绳肌拉伸",
  bodyRegion: "knee",
  bodyRegions: ["knee", "hip"],
  actionType: "stretch",
  targetMuscles: ["腘绳肌"],
  source: "seed",
  phase: "活动度与拉伸",
  defaultDosage: "3 组 x 30 秒",
  instructions: ["坐在椅子边缘，患侧腿向前伸直"],
  contraindications: ["训练中疼痛明显加重"],
  progressionCriteria: ["牵拉感可耐受"],
  tags: ["膝盖", "拉伸"],
};

const quadStretch: ActionLibraryItem = {
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
  tags: ["膝盖", "拉伸"],
};

const shoulderPress: ActionLibraryItem = {
  id: "action_shoulder_press",
  title: "肩上推举",
  bodyRegion: "shoulder",
  bodyRegions: ["shoulder"],
  actionType: "strength",
  targetMuscles: ["三角肌"],
  source: "seed",
  phase: "力量",
  defaultDosage: "3 组 x 10 次",
  instructions: ["坐姿推举"],
  contraindications: ["肩峰撞击痛"],
  progressionCriteria: ["无痛完成"],
  tags: ["肩膀"],
};

describe("action retrieval", () => {
  it("treats an action as in-region when any of its bodyRegions matches", () => {
    expect(actionMatchesRegion(hamstringStretch, "knee")).toBe(true);
    expect(actionMatchesRegion(hamstringStretch, "hip")).toBe(true);
    expect(actionMatchesRegion(hamstringStretch, "shoulder")).toBe(false);
  });

  it("falls back to the single bodyRegion field for legacy actions without bodyRegions", () => {
    const legacy: ActionLibraryItem = { ...quadStretch, bodyRegions: undefined };
    expect(actionMatchesRegion(legacy, "knee")).toBe(true);
    expect(actionMatchesRegion(legacy, "hip")).toBe(false);
  });

  it("excludes actions from other body regions", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "膝盖后方紧绷" }];
    const ranked = rankActionsForChat([hamstringStretch, quadStretch, shoulderPress], messages, "knee");
    expect(ranked.map((action) => action.id)).not.toContain("action_shoulder_press");
  });

  it("ranks the action matching the complaint above an unrelated one in the same region", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "膝盖后方腘绳肌很紧，想拉伸大腿后侧" }];
    const ranked = rankActionsForChat([quadStretch, hamstringStretch], messages, "knee");
    expect(ranked[0].id).toBe("action_hamstring_stretch");
  });

  it("returns in-region actions unranked when there is no user message to score against", () => {
    const ranked = rankActionsForChat([hamstringStretch, quadStretch, shoulderPress], [], "knee", 10);
    expect(ranked.map((action) => action.id)).toEqual(["action_hamstring_stretch", "action_quad_stretch"]);
  });

  it("honours topK", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "膝盖疼" }];
    const ranked = rankActionsForChat([hamstringStretch, quadStretch], messages, "knee", 1);
    expect(ranked).toHaveLength(1);
  });
});
