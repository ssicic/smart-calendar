"""Questions for the "Ask your past weeks" evals, over evals/rag_history.py.

`expected`: the doc(s) that hold the answer (empty = not in the history: the
answer should say it couldn't find it). `kind` says what the question tests:
"keyword" shares words with its week, "meaning" uses other words for the same
thing (where vector search should help), "summary" needs a month summary.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RagCase:
    question: str
    expected: tuple[str, ...]
    kind: str


TODAY = "2026-10-28"

CASES = [
    RagCase("When did I last go to the gym before work?", ("week:2026-10-12",), "keyword"),
    RagCase("When was my dentist appointment?", ("week:2026-09-28",), "keyword"),
    RagCase("When did I renew my passport?", ("week:2026-07-13",), "keyword"),
    RagCase("Which week was mum's birthday dinner?", ("week:2026-08-24",), "keyword"),
    RagCase("When did I go to the concert at Tvornica?", ("week:2026-10-19",), "keyword"),
    RagCase("When did I get the car serviced?", ("week:2026-09-07",), "keyword"),
    RagCase("When did I do a yoga class?", ("week:2026-07-27",), "keyword"),
    RagCase("Which week did I finish both Spanish lessons?", ("week:2026-09-21",), "keyword"),
    RagCase("When was I on vacation?", ("week:2026-08-10",), "meaning"),
    RagCase("Which week was I unwell?", ("week:2026-10-05",), "meaning"),
    RagCase("When did I first go for a jog?", ("week:2026-08-17",), "meaning"),
    RagCase("When did I go walking in the mountains?", ("week:2026-10-12",), "meaning"),
    RagCase("When did I stay sober the whole week?", ("week:2026-10-05",), "meaning"),
    RagCase("How did August go overall?", ("month:2026-08",), "summary"),
    RagCase("What slipped in September?", ("month:2026-09",), "summary"),
    RagCase("When did I go skiing?", (), "not in history"),
    RagCase("When did I see my therapist?", (), "not in history"),
]
