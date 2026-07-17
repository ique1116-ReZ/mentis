import { describe, expect, it } from "vitest";
import { isChatPromptAnswered, mergeFetchedMessages, shouldShowCaseSummary } from "./caseUtils";
import type { ChatMessage } from "./types";

const userMessage = (content: string): ChatMessage => ({ role: "user", content });
const assistantMessage = (content: string): ChatMessage => ({ role: "assistant", content });

describe("mergeFetchedMessages", () => {
  it("takes the fetched history when it is longer than local state", () => {
    const local = [assistantMessage("欢迎")];
    const fetched = [assistantMessage("欢迎"), userMessage("我膝盖疼"), assistantMessage("请描述一下疼痛部位")];

    expect(mergeFetchedMessages(local, fetched)).toBe(fetched);
  });

  it("keeps local state when the fetch resolves with a stale, shorter snapshot", () => {
    const local = [assistantMessage("欢迎"), userMessage("我膝盖疼"), assistantMessage("请描述一下疼痛部位")];
    const fetched = [assistantMessage("欢迎")];

    expect(mergeFetchedMessages(local, fetched)).toBe(local);
  });

  it("returns an empty array when both local and fetched are empty", () => {
    expect(mergeFetchedMessages([], [])).toEqual([]);
  });

  it("takes fetched when lengths are equal (treats fetched as authoritative for equal-length snapshots)", () => {
    const local = [assistantMessage("欢迎")];
    const fetched = [assistantMessage("欢迎（服务端版本）")];

    expect(mergeFetchedMessages(local, fetched)).toBe(fetched);
  });
});

describe("shouldShowCaseSummary", () => {
  it("hides a summary that duplicates the case title", () => {
    expect(shouldShowCaseSummary("跑步后疼，怀疑是ITB综合症", "跑步后疼，怀疑是ITB综合症")).toBe(false);
  });

  it("keeps an additional non-empty summary", () => {
    expect(shouldShowCaseSummary("跑步后膝盖疼", "下楼时更明显，已持续两天")).toBe(true);
  });
});

describe("isChatPromptAnswered", () => {
  const prompt: ChatMessage = {
    role: "assistant",
    content: "需要确认疼痛位置。",
    options: [{ id: "outside", label: "膝盖外侧", value: "膝盖外侧" }],
  };

  it("locks an option prompt after the user has replied", () => {
    expect(isChatPromptAnswered([prompt, userMessage("膝盖外侧"), assistantMessage("收到")], 0)).toBe(true);
  });

  it("keeps the latest unanswered option prompt active", () => {
    expect(isChatPromptAnswered([assistantMessage("收到"), prompt], 1)).toBe(false);
  });
});
