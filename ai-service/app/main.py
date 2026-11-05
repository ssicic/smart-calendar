"""Smart Calendar AI service.

The phone app never holds the API key: it sends facts here, this service asks
Claude, checks the answer and sends back suggestions.

Run:  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787 --env-file .env
"""

from __future__ import annotations

import os
from contextlib import contextmanager

import anthropic
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .llm import LLM, ClaudeLLM, DemoLLM, LLMRefused
from . import agent, ask_weeks, brain_dump, coach, journey, monthly, tracing
from .embeddings import Embedder, EmbeddingError, default_embedder
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


def check_token(x_app_token: str | None = Header(default=None)) -> None:
    """When APP_TOKEN is set (on Vercel), only requests carrying it may use Claude.
    It keeps strangers who find the URL from spending the credit. It ships inside
    the app, so it's a lock against casual misuse, not a vault: the spend limit in
    the Claude Console is the real cap."""
    expected = os.environ.get("APP_TOKEN")
    if expected and x_app_token != expected:
        raise HTTPException(401, "This app isn't allowed to use the AI service. Check the app token.")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@contextmanager
def claude_errors():
    """Turn API problems into messages the app can show."""
    try:
        yield
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


def ask(llm: LLM, system: str, user: str, schema):
    with claude_errors():
        return llm.structured(system, user, schema)


@app.post("/weekly-review", response_model=WeeklyReview)
def weekly_review(req: ReviewRequest, llm: LLM = Depends(get_llm), _: None = Depends(check_token)) -> WeeklyReview:
    return clean(ask(llm, SYSTEM_PROMPT, build_user_message(req), WeeklyReview), req)


@app.post("/monthly-summary", response_model=monthly.MonthlySummary)
def monthly_summary(
    req: monthly.MonthRequest, llm: LLM = Depends(get_llm), _: None = Depends(check_token)
) -> monthly.MonthlySummary:
    return monthly.clean(ask(llm, monthly.SYSTEM_PROMPT, monthly.build_user_message(req), monthly.MonthlySummary))


@app.post("/journey-plan", response_model=journey.JourneyPlan)
def journey_plan(
    req: journey.JourneyRequest, llm: LLM = Depends(get_llm), _: None = Depends(check_token)
) -> journey.JourneyPlan:
    return journey.clean(ask(llm, journey.SYSTEM_PROMPT, journey.build_user_message(req), journey.JourneyPlan))


@app.post("/journey-checkin", response_model=coach.Checkin)
def journey_checkin(
    req: coach.CheckinRequest, llm: LLM = Depends(get_llm), _: None = Depends(check_token)
) -> coach.Checkin:
    return coach.clean(ask(llm, coach.SYSTEM_PROMPT, coach.build_user_message(req), coach.Checkin), req)


@app.post("/brain-dump", response_model=brain_dump.BrainDumpPlan)
def brain_dump_plan(
    req: brain_dump.BrainDumpRequest, llm: LLM = Depends(get_llm), _: None = Depends(check_token)
) -> brain_dump.BrainDumpPlan:
    return brain_dump.clean(ask(llm, brain_dump.SYSTEM_PROMPT, brain_dump.build_user_message(req), brain_dump.BrainDumpPlan), req)


def get_embedder() -> Embedder | None:
    """Dependency: Voyage with VOYAGE_API_KEY, the fake one with AI_FAKE=1; tests swap it."""
    return default_embedder()


@app.post("/embed", response_model=ask_weeks.EmbedResponse)
def embed(
    req: ask_weeks.EmbedRequest, embedder: Embedder | None = Depends(get_embedder), _: None = Depends(check_token)
) -> ask_weeks.EmbedResponse:
    """Embeddings for week documents or a question. The app stores the week ones on the phone."""
    if embedder is None:
        # The app then searches by keywords only.
        raise HTTPException(503, "Embeddings aren't set up: add VOYAGE_API_KEY to the AI service.")
    if any(len(t) > 8000 for t in req.texts):
        raise HTTPException(422, "One of the texts is too long.")
    try:
        return ask_weeks.EmbedResponse(model=embedder.model, vectors=embedder.embed(req.texts, req.input_type))
    except EmbeddingError as e:
        raise HTTPException(503, str(e))


@app.post("/ask-weeks", response_model=ask_weeks.WeeksAnswer)
def ask_weeks_endpoint(
    req: ask_weeks.AskRequest, llm: LLM = Depends(get_llm), _: None = Depends(check_token)
) -> ask_weeks.WeeksAnswer:
    if not req.docs:
        return ask_weeks.WeeksAnswer(answer="There are no past weeks to look at yet.", found=False, citations=[])
    return ask_weeks.clean(ask(llm, ask_weeks.SYSTEM_PROMPT, ask_weeks.build_user_message(req), ask_weeks.WeeksAnswer), req)


def get_plan_model():
    """Dependency: None = Claude (or the demo model with AI_FAKE=1); tests swap in a script."""
    return None


@app.post("/plan-week", response_model=agent.PlanResult)
def plan_week(
    req: agent.PlanRequest, model=Depends(get_plan_model), _: None = Depends(check_token)
) -> agent.PlanResult:
    try:
        with claude_errors():
            return agent.plan_week(req, model, tracing.callbacks())
    finally:
        tracing.flush()
