from __future__ import annotations

try:
    from fastapi import FastAPI
except ModuleNotFoundError:  # Keep core tests runnable before installing service deps.
    FastAPI = None

from mentis_ai.agent import assess_case

if FastAPI is not None:
    app = FastAPI(title="Mentis Rehab AI Service")

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "service": "mentis-ai"}

    @app.post("/v1/agent/assess")
    def assess(payload: dict) -> dict:
        return assess_case(payload)
else:
    app = None

