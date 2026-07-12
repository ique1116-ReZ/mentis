import { describe, expect, it } from "vitest";
import { appendCaseMessages, createPlatformDemo, listCaseMessages, MAX_CASE_MESSAGES } from "../src/index";
import type { StoredCaseMessage } from "../src/index";

function message(content: string, role: StoredCaseMessage["role"] = "user"): StoredCaseMessage {
  return { role, content, createdAt: new Date().toISOString() };
}

describe("case messages", () => {
  it("returns an empty list for a case with no messages", () => {
    const platform = createPlatformDemo();
    expect(listCaseMessages(platform, "case_unknown")).toEqual([]);
  });

  it("appends messages in order and reads them back", () => {
    const platform = createPlatformDemo();
    appendCaseMessages(platform, "case_1", [message("膝盖下楼梯疼")]);
    appendCaseMessages(platform, "case_1", [message("疼多久了？", "assistant")]);

    const stored = listCaseMessages(platform, "case_1");
    expect(stored.map((entry) => entry.content)).toEqual(["膝盖下楼梯疼", "疼多久了？"]);
    expect(stored[1].role).toBe("assistant");
  });

  it("keeps assistant options and recommended actions so the UI can restore them", () => {
    const platform = createPlatformDemo();
    appendCaseMessages(platform, "case_1", [
      {
        role: "assistant",
        content: "试试腘绳肌拉伸",
        createdAt: new Date().toISOString(),
        options: [{ id: "opt_1", label: "有缓解", value: "有明显缓解" }],
        recommendedActions: [
          {
            title: "坐姿腘绳肌拉伸",
            bodyRegion: "knee",
            phase: "活动度与拉伸",
            defaultDosage: "3 组 x 30 秒",
            instructions: ["坐在椅子边缘"],
            contraindications: ["疼痛加重立即停止"],
            progressionCriteria: ["牵拉感可耐受"],
            tags: ["膝盖"],
          },
        ],
      },
    ]);

    const [stored] = listCaseMessages(platform, "case_1");
    expect(stored.options?.[0].label).toBe("有缓解");
    expect(stored.recommendedActions?.[0].title).toBe("坐姿腘绳肌拉伸");
  });

  it("truncates from the front once the cap is exceeded", () => {
    const platform = createPlatformDemo();
    const overflow = MAX_CASE_MESSAGES + 5;
    appendCaseMessages(
      platform,
      "case_1",
      Array.from({ length: overflow }, (_unused, index) => message(`m${index}`)),
    );

    const stored = listCaseMessages(platform, "case_1");
    expect(stored).toHaveLength(MAX_CASE_MESSAGES);
    expect(stored[0].content).toBe("m5");
    expect(stored[MAX_CASE_MESSAGES - 1].content).toBe(`m${overflow - 1}`);
  });

  it("isolates messages per case", () => {
    const platform = createPlatformDemo();
    appendCaseMessages(platform, "case_1", [message("左膝")]);
    appendCaseMessages(platform, "case_2", [message("右膝")]);

    expect(listCaseMessages(platform, "case_1").map((entry) => entry.content)).toEqual(["左膝"]);
    expect(listCaseMessages(platform, "case_2").map((entry) => entry.content)).toEqual(["右膝"]);
  });
});
