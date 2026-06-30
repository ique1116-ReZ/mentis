from __future__ import annotations

from pathlib import Path
import sys

EVIDENCE_RANKS = {
    "clinical_practice_guideline": 1,
    "consensus_statement": 2,
    "systematic_review": 3,
    "textbook": 4,
    "narrative_review": 5,
    "protocol_or_presentation": 6,
    "other": 7,
}


def format_citations(results: list[dict]) -> list[dict]:
    citations = []
    for result in results:
        label = result["source"]
        if result.get("page"):
            label = f"{label}, page {result['page']}"
        citations.append(
            {
                **result,
                "label": label,
                "evidence_rank": EVIDENCE_RANKS.get(result.get("evidence_type", "other"), 7),
            }
        )
    return sorted(citations, key=lambda item: (item["evidence_rank"], -float(item.get("score", 0))))


class EvidenceRagService:
    """Adapter around the existing local RAG project, with a deterministic fallback."""

    def __init__(
        self,
        rag_project_path: str = "/Users/rez/Documents/RAG/rag",
        index_path: str = "/Users/rez/Documents/RAG/rag/data/rehab_books_index.json",
    ) -> None:
        self.rag_project_path = Path(rag_project_path)
        self.index_path = Path(index_path)

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        if self.rag_project_path.exists() and self.index_path.exists():
            sys.path.insert(0, str(self.rag_project_path))
            from rag.index import RagIndex  # type: ignore

            index = RagIndex.load(self.index_path)
            results = index.search(query, top_k=top_k)
            return [
                {
                    "source": result.chunk.metadata.get("file") or result.chunk.source,
                    "page": result.chunk.metadata.get("page"),
                    "evidence_type": result.chunk.metadata.get("evidence_type", "other"),
                    "score": result.score,
                    "text": result.chunk.text,
                }
                for result in results
            ]
        return []

