const RED_FLAGS = [
    "严重外伤",
    "进行性神经症状",
    "胸痛",
    "呼吸困难",
    "无法承重",
    "大小便异常",
    "夜间持续加重疼痛",
    "感染迹象",
    "发热",
    "小腿肿胀",
    "DVT",
];
const EVIDENCE_RANK = {
    clinical_practice_guideline: 1,
    consensus_statement: 2,
    systematic_review: 3,
    textbook: 4,
    narrative_review: 5,
    protocol_or_presentation: 6,
    other: 7,
};
export function buildInitialAssessment(input) {
    return {
        ...input,
        painScore: clamp(input.painScore, 0, 10),
        createdAt: new Date().toISOString(),
    };
}
export function assessRedFlags(assessment) {
    const symptomsText = assessment.symptoms.join(" ");
    const matchedRedFlags = RED_FLAGS.filter((flag) => symptomsText.includes(flag));
    if (matchedRedFlags.length > 0) {
        return {
            level: "urgent_referral",
            matchedRedFlags,
            allowedAiActions: ["education", "prepare_clinician_summary"],
            message: "检测到可能需要优先处理的红旗风险，请尽快线下就医或联系医生/康复师。AI 只能帮助整理情况，不能替代诊断。",
        };
    }
    if (assessment.painScore >= 7 || assessment.durationDays > 90) {
        return {
            level: "clinician_review_recommended",
            matchedRedFlags: [],
            allowedAiActions: ["education", "rehab_draft", "prepare_clinician_summary"],
            message: "建议预约医生或康复师复核，AI 可先生成非诊断性的康复教育和计划草案。",
        };
    }
    return {
        level: "self_management_with_review_option",
        matchedRedFlags: [],
        allowedAiActions: ["education", "rehab_draft", "prepare_clinician_summary"],
        message: "未发现红旗风险，可先进行教育性康复管理，并保留专家咨询入口。",
    };
}
export function draftKneeRunningPlan(assessment) {
    const triage = assessRedFlags(assessment);
    if (triage.level === "urgent_referral") {
        return {
            title: "需优先线下评估",
            disclaimer: "以下内容不构成诊断、处方或替代线下医疗建议。",
            redFlagGate: "blocked",
            stages: [],
            progressionCriteria: [],
        };
    }
    return {
        title: `膝/跑步损伤康复草案：${assessment.conditionFocus}`,
        disclaimer: "本计划为康复教育和训练建议草案，不构成诊断、处方或术后限制解释。",
        redFlagGate: "clear",
        stages: [
            {
                name: "镇痛与负荷管理",
                window: "第 1 周起",
                goals: ["降低刺激源", "维持可耐受活动", "建立疼痛监测"],
                homework: ["等长股四头肌收缩", "髋外展激活", "步行或骑行低冲击有氧"],
            },
            {
                name: "负荷提升",
                window: "第 2-4 周",
                goals: ["恢复膝伸肌容量", "提升髋-膝控制", "减少跑步诱发痛"],
                homework: ["西班牙深蹲或靠墙静蹲", "台阶下放", "臀桥与侧向弹力带行走"],
            },
            {
                name: "力量与功能期",
                window: "第 5-8 周",
                goals: ["提高单腿力量", "建立跳跃/落地准备", "接近跑步专项需求"],
                homework: ["分腿蹲", "单腿罗马尼亚硬拉", "小幅度弹跳准备"],
            },
            {
                name: "跑步回归",
                window: "第 9-12 周+",
                goals: ["渐进跑量", "监测 24 小时反应", "回到目标训练"],
                homework: ["跑走结合", "坡度和速度分层回归", "每周跑量递增不超过可耐受范围"],
            },
        ],
        progressionCriteria: [
            "疼痛 NPRS <= 3/10",
            "训练后 24 小时无明显加重",
            "单腿下蹲控制可接受",
            "医生/康复师对术后或复杂病例的限制已确认",
        ],
    };
}
export function canAccessCase(actor, record) {
    if (actor.role === "admin") {
        return true;
    }
    if (actor.role === "user") {
        return record.ownerUserId === actor.id;
    }
    if (actor.role === "clinician") {
        return record.authorizedClinicianIds.includes(actor.id);
    }
    if (actor.role === "organization") {
        return record.authorizedOrganizationIds.includes(actor.id);
    }
    return false;
}
export function createAuditEvent(input) {
    return {
        ...input,
        id: `audit_${cryptoSafeId()}`,
        sensitiveDataCategory: "medical_health",
        createdAt: new Date().toISOString(),
    };
}
export function summarizeEvidence(citations) {
    const sorted = [...citations.map((citation) => ({
            ...citation,
            evidenceRank: EVIDENCE_RANK[citation.evidenceType],
            label: formatCitationLabel(citation),
        }))]
        .sort((left, right) => left.evidenceRank - right.evidenceRank || right.score - left.score);
    return {
        primaryCitation: sorted[0]?.label ?? "No citation",
        citations: sorted,
        conflictPolicy: "When sources disagree, prefer newer clinical guidelines and consensus statements, then systematic reviews, textbooks, and local protocols.",
    };
}
function formatCitationLabel(citation) {
    return citation.page ? `${citation.source}, page ${citation.page}` : citation.source;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function cryptoSafeId() {
    return Math.random().toString(36).slice(2, 10);
}
