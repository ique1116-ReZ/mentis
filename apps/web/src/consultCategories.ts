import type { ActionBodyPartFilter, RehabConsultCategory } from "./types";

// 康复阶段是这套种子库真正带的轴：46 条全是 bodyRegion:"knee"，健身部位分类（胸/背/心肺…）
// 迁移后 7 个筛选永远空、另 2 个匹配全部 46 条，对临床医生排计划毫无用处。改用 phase 分档。
export const actionBodyPartFilters: ActionBodyPartFilter[] = [
  { id: "all", label: "全部" },
  { id: "镇痛与激活", label: "镇痛与激活", phase: "镇痛与激活" },
  { id: "活动度与拉伸", label: "活动度与拉伸", phase: "活动度与拉伸" },
  { id: "力量", label: "力量", phase: "力量" },
  { id: "神经肌肉控制", label: "神经肌肉控制", phase: "神经肌肉控制" },
  { id: "回归活动", label: "回归活动", phase: "回归活动" },
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
