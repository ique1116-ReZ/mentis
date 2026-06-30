from __future__ import annotations


def choose_model(task: str, *, high_risk: bool) -> dict:
    if high_risk or task in {"clinical_reasoning", "expert_review"}:
        return {
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "temperature": 0.1,
            "reason": "clinical review or high-risk routing",
        }

    return {
        "provider": "qwen",
        "model": "qwen3.7-plus",
        "temperature": 0.2,
        "reason": "routine Chinese rehab education and conversation",
    }

