"""Smart Calendar AI service.

The phone app never holds the API key: it sends facts here, this service asks
Claude, checks the answer and sends back suggestions.

Run:  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787 --env-file .env
"""

from __future__ import annotations

import os

import anthropic
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .llm import LLM, ClaudeLLM, DemoLLM, LLMRefused
from . import monthly
from .review import SYSTEM_PROMPT, ReviewRequest, WeeklyReview, build_user_message, clean

app = FastAPI(title="Smart Calendar AI")

# The web version of the app runs on another port (Expo, 8081), so the browser
# needs permission to call this service.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_llm: LLM | None = None


def get_llm() -> LLM:
    """Dependency: tests swap this for a fake, so they never call the real API."""
    global _llm
    if _llm is None:
        _llm = DemoLLM() if os.environ.get("AI_FAKE") == "1" else ClaudeLLM()
    return _llm


@app.get("/health")
def health() -> dict:
    return {"ok": True}


def ask(llm: LLM, system: str, user: str, schema):
    """Call the model and turn API problems into messages the app can show."""
    try:
        return llm.structured(system, user, schema)
    except LLMRefused:
        raise HTTPException(502, "The assistant couldn't answer this time. Try again later.")
    except anthropic.AuthenticationError:
        raise HTTPException(500, "The AI service has no valid API key. Add ANTHROPIC_API_KEY to ai-service/.env.")
    except anthropic.RateLimitError:
        raise HTTPException(503, "Too many requests right now. Try again in a minute.")
    except anthropic.APIConnectionError:
        raise HTTPException(503, "The AI service can't reach Claude. Check the internet connection.")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"Claude returned an error ({e.status_code}).")


@app.post("/weekly-review", response_model=WeeklyReview)
def weekly_review(req: ReviewRequest, llm: LLM = Depends(get_llm)) -> WeeklyReview:
    return clean(ask(llm, SYSTEM_PROMPT, build_user_message(req), WeeklyReview), req)


@app.post("/monthly-summary", response_model=monthly.MonthlySummary)
def monthly_summary(req: monthly.MonthRequest, llm: LLM = Depends(get_llm)) -> monthly.MonthlySummary:
    return monthly.clean(ask(llm, monthly.SYSTEM_PROMPT, monthly.build_user_message(req), monthly.MonthlySummary))
