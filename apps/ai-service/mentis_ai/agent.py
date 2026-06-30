from __future__ import annotations

from mentis_ai.clinical_rules import assess_red_flags


def assess_case(case: dict) -> dict:
    triage = assess_red_flags(case)
    if triage["level"] == "urgent_referral":
        return {
            "triage": triage,
            "rehab_draft": None,
            "clinician_summary": build_clinician_summary(case, triage),
        }

    return {
        "triage": triage,
        "rehab_draft": generate_rehab_draft(case),
        "clinician_summary": build_clinician_summary(case, triage),
    }


def generate_rehab_draft(case: dict) -> dict:
    triage = assess_red_flags(case)
    if triage["level"] == "urgent_referral":
        return {
            "title": "需优先线下评估",
            "disclaimer": "以下内容不构成诊断、处方或替代线下医疗建议。",
            "stages": [],
            "progression_criteria": [],
        }

    return {
        "title": f"膝/跑步损伤康复草案：{case.get('condition_focus', 'knee_running')}",
        "disclaimer": "本计划为康复教育和训练建议草案，不构成诊断、处方或术后限制解释。",
        "stages": [
            {
                "name": "镇痛与负荷管理",
                "window": "第 1 周起",
                "homework": ["等长股四头肌收缩", "髋外展激活", "低冲击有氧"],
            },
            {
                "name": "负荷提升",
                "window": "第 2-4 周",
                "homework": ["西班牙深蹲或靠墙静蹲", "台阶下放", "臀桥"],
            },
            {
                "name": "力量与功能期",
                "window": "第 5-8 周",
                "homework": ["分腿蹲", "单腿罗马尼亚硬拉", "小幅度弹跳准备"],
            },
            {
                "name": "跑步回归",
                "window": "第 9-12 周+",
                "homework": ["跑走结合", "坡度和速度分层回归", "24 小时反应监测"],
            },
        ],
        "progression_criteria": [
            "疼痛 NPRS <= 3/10",
            "训练后 24 小时无明显加重",
            "单腿下蹲控制可接受",
            "复杂或术后病例需医生/康复师确认限制",
        ],
    }


def build_clinician_summary(case: dict, triage: dict) -> dict:
    return {
        "body_region": case.get("body_region"),
        "condition_focus": case.get("condition_focus"),
        "pain_score": case.get("pain_score"),
        "training_load": case.get("training_load"),
        "triage_level": triage["level"],
        "matched_red_flags": triage["matched_red_flags"],
    }

