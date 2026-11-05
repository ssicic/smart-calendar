"""Ask your past weeks: answer a question from the few weeks search found.

The app finds the best 5 documents on the phone (hybrid search) and sends
them with the question. Claude may only use those documents and must cite
them; clean() drops any citation that isn't one of them.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field


class Doc(BaseModel):
    id: str = Field(max_length=40)  # "week:2026-10-12" or "month:2026-10"
    title: str = Field(max_length=60)  # "Week of 12 Oct"
    text: str = Field(max_length=6000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    today: str  # "2026-11-05", so "last time" and "this month" make sense
    docs: list[Doc] = Field(max_length=8)


class WeeksAnswer(BaseModel):
    answer: str  # 2-3 sentences
    found: bool  # False when the weeks don't hold the answer
    citations: list[str]  # doc ids the answer rests on


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=128)
    input_type: Literal["document", "query"] = "document"


class EmbedResponse(BaseModel):
    model: str
    vectors: list[list[float]]


SYSTEM_PROMPT = """You answer questions about someone's past weeks in their planning app.

You get the question, today's date, and a few documents: weeks (each day with times, \
what was done, flexible sessions, to-dos, habits, time by group) and maybe month \
summaries. Search picked them; some may not be relevant.

Rules:
- Use only these documents. Never guess or add facts that aren't in them.
- answer: 2-3 short, plain sentences. Name days, dates and times when they matter \
("Tuesday 13 Oct, 07:00, before work at 09:00"). "Last time" means the most recent \
matching week before today.
- citations: the ids of the documents your answer rests on (e.g. "week:2026-10-12"), \
most important first, at most 3. Only ids from the documents given.
- If the documents don't contain the answer, set found to false, say briefly that \
you couldn't find it in these weeks, and leave citations empty.
- Be kind: no scolding about missed things."""


def build_user_message(req: AskRequest) -> str:
    docs = "\n\n".join(f"<doc id=\"{d.id}\">\n{d.text}\n</doc>" for d in req.docs)
    return f"Question and documents:\n{json.dumps({'question': req.question, 'today': req.today})}\n\n{docs}"


def clean(answer: WeeksAnswer, req: AskRequest) -> WeeksAnswer:
    """Keep only citations of documents that were sent (each once, at most 3)."""
    given = {d.id for d in req.docs}
    cited = list(dict.fromkeys(c.strip() for c in answer.citations if c.strip() in given))[:3]
    found = answer.found and bool(req.docs)
    return WeeksAnswer(answer=answer.answer.strip(), found=found, citations=cited if found else [])
