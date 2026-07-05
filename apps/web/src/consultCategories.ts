import type { ActionBodyPartFilter, RehabConsultCategory } from "./types";

export const actionBodyPartFilters: ActionBodyPartFilter[] = [
  { id: "all", label: "全部" },
  { id: "cardio", label: "心肺", tags: ["cardio", "cardiovascular system"] },
  { id: "chest", label: "胸部", tags: ["chest", "pectorals"] },
  { id: "back", label: "背部", bodyRegions: ["spine"], tags: ["back", "lats", "traps", "upper back", "lower back"] },
  { id: "shoulders", label: "肩部", bodyRegions: ["shoulder"], tags: ["shoulders", "delts"] },
  { id: "arms", label: "手臂", tags: ["upper arms", "lower arms", "biceps", "triceps", "forearms"] },
  { id: "core", label: "核心", bodyRegions: ["spine"], tags: ["waist", "abs", "obliques"] },
  { id: "glutes", label: "臀部", bodyRegions: ["hip"], tags: ["glutes", "abductors", "adductors"] },
  { id: "quads", label: "股四头", bodyRegions: ["knee"], tags: ["quads"] },
  { id: "hamstrings", label: "腘绳肌", bodyRegions: ["knee"], tags: ["hamstrings"] },
  { id: "calves", label: "小腿", bodyRegions: ["ankle_foot"], tags: ["calves", "lower legs"] },
];

export const consultCategories: RehabConsultCategory[] = [
  {
    id: "knee",
    label: "膝盖",
    description: "跑步膝、膝前痛、上下楼疼、深蹲不适",
    examples: ["跑步后膝前痛", "上下楼疼", "深蹲时不舒服"],
    mark: "膝",
    enabled: true,
  },
  {
    id: "ankle",
    label: "脚踝",
    description: "崴脚、跑后踝痛、踝稳定性、跟腱周围不适",
    examples: ["崴脚后多久能跑", "跑后外踝疼", "跟腱附近紧"],
    mark: "踝",
    enabled: false,
  },
  {
    id: "shoulder",
    label: "肩膀",
    description: "肩袖不适、举手疼、卧推或过顶动作疼痛",
    examples: ["卧推肩痛", "举手疼", "游泳后肩不舒服"],
    mark: "肩",
    enabled: false,
  },
  {
    id: "lower_back",
    label: "腰背",
    description: "训练后腰背疼、久坐腰痛、核心负荷管理",
    examples: ["硬拉后腰酸", "久坐腰痛", "跑步后下背紧"],
    mark: "腰",
    enabled: false,
  },
  {
    id: "hip",
    label: "髋部",
    description: "髋外侧痛、臀部深处痛、髋活动度与力量",
    examples: ["跑步髋外侧疼", "臀部深处痛", "髋前侧夹挤感"],
    mark: "髋",
    enabled: false,
  },
];

export const quickReplies = ["调整今日计划", "疼痛管理建议", "如何判断是否过度训练", "联系康复师"];
export const pendingComplaintTitle = "主诉待补充";
