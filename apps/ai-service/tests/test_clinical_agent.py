import unittest

from mentis_ai.agent import assess_case, generate_rehab_draft
from mentis_ai.llm_gateway import choose_model
from mentis_ai.rag_service import format_citations


class ClinicalAgentTests(unittest.TestCase):
    def test_red_flags_prevent_rehab_plan_generation(self):
        case = {
            "body_region": "knee",
            "condition_focus": "running_knee_pain",
            "pain_score": 9,
            "symptoms": ["无法承重", "严重外伤"],
            "training_load": "比赛摔倒后",
        }

        result = assess_case(case)

        self.assertEqual(result["triage"]["level"], "urgent_referral")
        self.assertIsNone(result["rehab_draft"])
        self.assertIn("线下就医", result["triage"]["message"])

    def test_safe_knee_case_gets_non_diagnostic_rehab_draft(self):
        case = {
            "body_region": "knee",
            "condition_focus": "patellofemoral_pain",
            "pain_score": 4,
            "symptoms": ["跑步下坡痛", "久坐后膝前痛"],
            "training_load": "每周跑量 35km",
        }

        draft = generate_rehab_draft(case)

        self.assertIn("不构成诊断", draft["disclaimer"])
        self.assertEqual(draft["stages"][0]["name"], "镇痛与负荷管理")
        self.assertIn("疼痛 NPRS <= 3/10", draft["progression_criteria"])

    def test_llm_gateway_routes_by_task_risk(self):
        self.assertEqual(choose_model("routine_chat", high_risk=False)["provider"], "qwen")
        self.assertEqual(choose_model("clinical_reasoning", high_risk=True)["provider"], "deepseek")

    def test_rag_citations_keep_source_page_and_evidence_rank(self):
        citations = format_citations(
            [
                {
                    "source": "Patellofemoral Pain 2019 LOGO.pdf",
                    "page": 20,
                    "evidence_type": "clinical_practice_guideline",
                    "score": 0.82,
                }
            ]
        )

        self.assertEqual(citations[0]["label"], "Patellofemoral Pain 2019 LOGO.pdf, page 20")
        self.assertEqual(citations[0]["evidence_rank"], 1)


if __name__ == "__main__":
    unittest.main()

