from __future__ import annotations

RED_FLAGS = (
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
)


def assess_red_flags(case: dict) -> dict:
    symptoms_text = " ".join(case.get("symptoms", []))
    matched = [flag for flag in RED_FLAGS if flag in symptoms_text]
    if matched:
        return {
            "level": "urgent_referral",
            "matched_red_flags": matched,
            "allowed_ai_actions": ["education", "prepare_clinician_summary"],
            "message": "检测到红旗风险，请尽快线下就医或联系医生/康复师。AI 不能替代诊断。",
        }

    if int(case.get("pain_score", 0)) >= 7:
        return {
            "level": "clinician_review_recommended",
            "matched_red_flags": [],
            "allowed_ai_actions": ["education", "rehab_draft", "prepare_clinician_summary"],
            "message": "建议预约医生/康复师复核，AI 可先生成非诊断性康复教育草案。",
        }

    return {
        "level": "self_management_with_review_option",
        "matched_red_flags": [],
        "allowed_ai_actions": ["education", "rehab_draft", "prepare_clinician_summary"],
        "message": "未发现红旗风险，可先进行教育性康复管理，并保留专家咨询入口。",
    }

