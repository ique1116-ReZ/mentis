import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "./App";

describe("MessageBubble", () => {
  it("renders a supplemental composer after assistant-generated options", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={{
          role: "assistant",
          content: "我想再了解你的运动习惯。",
          question: "你平时的运动习惯是怎样的？",
          options: [
            { id: "run", label: "有跑步习惯", value: "我有跑步习惯" },
            { id: "strength", label: "会做力量训练", value: "我会做力量训练" },
          ],
        }}
      />,
    );

    expect(html).toContain("补充描述");
    expect(html).toContain("如果没有合适选项，可以自己补充");
  });

  it("renders recommended rehab actions as compact cards without exercise details", () => {
    const html = renderToStaticMarkup(
      <MessageBubble
        message={{
          role: "assistant",
          content: "可以先尝试两个低刺激动作。",
          recommendedActions: [
            {
              actionId: "ai_rehab_knee_123",
              title: "坐姿伸膝",
              bodyRegion: "knee",
              phase: "镇痛与激活",
              defaultDosage: "2 组 x 10 次",
              instructions: ["坐稳后慢慢伸直膝盖", "停 2 秒再放下"],
              contraindications: ["伸膝时疼痛超过 3/10"],
              progressionCriteria: ["次日无明显加重"],
              tags: ["ai-generated", "rehab"],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("坐姿伸膝");
    expect(html).toContain("镇痛与激活 · 2 组 x 10 次");
    expect(html).toContain("加入今日计划");
    expect(html).not.toContain("坐稳后慢慢伸直膝盖");
    expect(html).not.toContain("伸膝时疼痛超过 3/10");
  });
});
