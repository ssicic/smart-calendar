"""Evals for "Ask your past weeks": retrieval and answers, over a fixed demo history.

    .venv/bin/python -m evals.rag_run --fake                     # no API calls at all (CI)
    .venv/bin/python -m evals.rag_run --embeddings voyage        # real Voyage + Claude; fills the cache
    .venv/bin/python -m evals.rag_run --embeddings cache         # cached Voyage vectors + Claude

Retrieval: recall@5 (share of the right weeks in the top 5) and MRR (1 / rank
of the first right week, averaged), for keyword-only (BM25), vector-only and
hybrid (both, merged with reciprocal rank fusion). The search is the same as
the app's (src/ui/weekSearch.ts, kept in sync by tests/fixtures/search_golden.json).

Answers (hybrid top 5 → /ask-weeks prompt): citation precision (cited weeks
that are right), citation hit (at least one right week cited), "doesn't know"
on questions the history can't answer, dates/times in the answer found in the
cited weeks, and faithfulness (a Claude judge: every claim supported by the
weeks given; skipped with --fake).

Embeddings: "fake" hashes words (no key; matches shared words only, so its
vector numbers say nothing about real meaning search), "voyage" calls Voyage
(VOYAGE_API_KEY) and saves the vectors in evals/rag_embeddings.json, "cache"
reads only that file, so CI can run with real vectors and no key.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from pydantic import BaseModel

from app.ask_weeks import SYSTEM_PROMPT, AskRequest, Doc, WeeksAnswer, build_user_message, clean
from app.embeddings import FakeEmbedder, VoyageEmbedder
from app.llm import MODEL, ClaudeLLM, DemoLLM
from app.retrieval import bm25, hybrid_search, vector_search

from .rag_cases import CASES, TODAY, RagCase
from .rag_history import docs as history_docs

K = 5
CACHE = Path(__file__).with_name("rag_embeddings.json")


# ---- Embeddings (fake, Voyage, or cached Voyage) ----


class CachedEmbedder:
    """Voyage vectors from evals/rag_embeddings.json; with `live`, missing ones are fetched and saved."""

    def __init__(self, live: VoyageEmbedder | None) -> None:
        self.live = live
        self.data = json.loads(CACHE.read_text()) if CACHE.exists() else {"model": VoyageEmbedder.model, "vectors": {}}
        self.model = self.data["model"]
        if live and self.model != live.model:
            self.data = {"model": live.model, "vectors": {}}
            self.model = live.model

    @staticmethod
    def _key(text: str, input_type: str) -> str:
        return input_type + ":" + hashlib.sha1(text.encode()).hexdigest()

    def embed(self, texts: list[str], input_type: str) -> list[list[float]]:
        missing = [t for t in texts if self._key(t, input_type) not in self.data["vectors"]]
        if missing:
            if not self.live:
                raise SystemExit(f"{len(missing)} text(s) aren't in {CACHE.name}. Run once with --embeddings voyage.")
            for t, v in zip(missing, self.live.embed(missing, input_type)):  # type: ignore[arg-type]
                self.data["vectors"][self._key(t, input_type)] = [round(x, 6) for x in v]
            CACHE.write_text(json.dumps(self.data))
        return [self.data["vectors"][self._key(t, input_type)] for t in texts]


def make_embedder(kind: str):
    if kind == "fake":
        return FakeEmbedder()
    if kind == "voyage":
        key = os.environ.get("VOYAGE_API_KEY")
        if not key:
            raise SystemExit("Set VOYAGE_API_KEY (in ai-service/.env) for --embeddings voyage.")
        return CachedEmbedder(VoyageEmbedder(key))
    return CachedEmbedder(None)


# ---- Metrics ----


def recall_at(ranked: list[str], expected: tuple[str, ...], k: int = K) -> float:
    return sum(e in ranked[:k] for e in expected) / len(expected)


def reciprocal_rank(ranked: list[str], expected: tuple[str, ...]) -> float:
    return next((1 / (i + 1) for i, r in enumerate(ranked) if r in expected), 0.0)


MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"


def grounded(answer: str, cited_texts: list[str]) -> bool:
    """Every clock time and "12 Oct"-style date in the answer appears in a cited week."""
    facts = re.findall(r"\b\d{1,2}:\d{2}\b", answer) + re.findall(rf"\b\d{{1,2}} (?:{MONTHS})", answer)
    text = "\n".join(cited_texts)
    return all(f.zfill(5) in text if ":" in f else f in text for f in facts)


class Faithfulness(BaseModel):
    faithful: bool
    unsupported_claims: list[str]


JUDGE_PROMPT = """You check an answer against the documents it was written from.
faithful = true only if every factual claim in the answer (days, dates, times, counts, \
what happened) is supported by the documents. Saying the answer isn't in the documents \
is faithful when that's true. List any unsupported claims."""


# ---- Running ----


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fake", action="store_true", help="demo model for answers (no Claude calls)")
    parser.add_argument("--embeddings", choices=["fake", "voyage", "cache"], default=None)
    parser.add_argument("--out", default=str(Path(__file__).with_name("rag_results.md")))
    args = parser.parse_args()
    emb_kind = args.embeddings or ("cache" if CACHE.exists() else "fake")
    embedder = make_embedder(emb_kind)
    llm = DemoLLM() if args.fake else ClaudeLLM()

    docs = history_docs()
    pairs = [(d["id"], d["text"]) for d in docs]
    texts = {d["id"]: d["text"] for d in docs}
    doc_vectors = dict(zip(texts, embedder.embed([d["text"] for d in docs], "document")))
    query_vectors = embedder.embed([c.question for c in CASES], "query")

    rows = []
    for case, qv in zip(CASES, query_vectors):
        ranked = {
            "keyword": [r.id for r in bm25(case.question, pairs)],
            "vector": [r.id for r in vector_search(qv, doc_vectors)],
            "hybrid": [r.id for r in hybrid_search(case.question, pairs, qv, doc_vectors, k=len(pairs))],
        }
        top = ranked["hybrid"][:K]
        req = AskRequest(question=case.question, today=TODAY, docs=[Doc(id=i, title=i, text=texts[i]) for i in top])
        answer = clean(llm.structured(SYSTEM_PROMPT, build_user_message(req), WeeksAnswer), req)
        judge = None
        if not args.fake:
            judged = llm.structured(JUDGE_PROMPT, build_user_message(req) + f"\n\nAnswer to check:\n{answer.answer}", Faithfulness)
            judge = judged.faithful
        rows.append({"case": case, "ranked": ranked, "answer": answer, "faithful": judge,
                     "grounded": grounded(answer.answer, [texts[c] for c in answer.citations])})
        print(f"{case.kind:<15} {case.question:<50} hybrid top: {top[:2]}  cited: {answer.citations}")

    lines = report(rows, emb_kind, embedder.model, "demo (no API)" if args.fake else MODEL)
    Path(args.out).write_text("\n".join(lines) + "\n")
    print("\n" + "\n".join(lines[:16]))
    return 0


# What changed between runs (kept by hand, so the file tells the story).
NOTES = [
    "Changes so far:",
    "",
    "- 2026-11-05, first run (fake embeddings): hybrid recall@5 0.73, MRR 0.58. \"Gym before work\" failed:",
    "  docs had only clock times, so no search could tell 07:00 is before work.",
    "- Week docs now say \"before Work\" when a fixed event starts within 3h after a session:",
    "  keyword recall@5 0.60 → 0.67, hybrid 0.73 → 0.80, and that question is answered.",
    "- Open: meaning questions (vacation/holiday, jog/run, sober/no alcohol) need real embeddings.",
    "",
]


def report(rows: list[dict], emb_kind: str, emb_model: str, llm_model: str) -> list[str]:
    answerable = [r for r in rows if r["case"].expected]
    unanswerable = [r for r in rows if not r["case"].expected]

    def avg(values: list[float]) -> str:
        return f"{sum(values) / len(values):.2f}" if values else "n/a"

    lines = [
        "# Ask your past weeks: eval results",
        "",
        f"History: 16 weeks + 2 month summaries (`evals/rag_history.py`) · {len(rows)} questions "
        f"({len(answerable)} answerable, {len(unanswerable)} not in the history) · today = {TODAY}",
        f"Embeddings: `{emb_model}` ({emb_kind}) · answers: `{llm_model}` · top {K} docs go to the model",
        "",
    ]
    if emb_kind == "fake":
        lines += [
            "> Fake embeddings hash words, so vector search here only matches shared words. "
            "Run `python -m evals.rag_run --embeddings voyage` for real meaning-search numbers.",
            "",
        ]
    lines += NOTES + ["## Retrieval", "", f"| Search | Recall@{K} | MRR |", "|---|---|---|"]
    for mode in ("keyword", "vector", "hybrid"):
        lines.append(
            f"| {mode} | {avg([recall_at(r['ranked'][mode], r['case'].expected) for r in answerable])} "
            f"| {avg([reciprocal_rank(r['ranked'][mode], r['case'].expected) for r in answerable])} |"
        )
    kinds = sorted({r["case"].kind for r in answerable})
    lines += ["", f"Recall@{K} by question kind:", "", "| Kind | n | keyword | vector | hybrid |", "|---|---|---|---|---|"]
    for kind in kinds:
        sub = [r for r in answerable if r["case"].kind == kind]
        cells = " | ".join(avg([recall_at(r["ranked"][m], r["case"].expected) for r in sub]) for m in ("keyword", "vector", "hybrid"))
        lines.append(f"| {kind} | {len(sub)} | {cells} |")

    cited = [c for r in answerable for c in r["answer"].citations]
    right = [c for r in answerable for c in r["answer"].citations if c in r["case"].expected]
    faithful = [r["faithful"] for r in rows if r["faithful"] is not None]
    lines += [
        "",
        "## Answers",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Citation precision (all cited docs that are expected ones) | {len(right)}/{len(cited)} = {avg([c in r['case'].expected for r in answerable for c in r['answer'].citations])} |",
        f"| First citation right | {sum(bool(r['answer'].citations) and r['answer'].citations[0] in r['case'].expected for r in answerable)}/{len(answerable)} |",
        f"| Citation hit (a right week cited) | {sum(any(c in r['case'].expected for c in r['answer'].citations) for r in answerable)}/{len(answerable)} |",
        f"| Says it doesn't know (not in history) | {sum(not r['answer'].found for r in unanswerable)}/{len(unanswerable)} |",
        f"| Dates/times found in cited weeks | {sum(r['grounded'] for r in rows)}/{len(rows)} |",
        f"| Faithful (Claude judge) | {f'{sum(faithful)}/{len(faithful)}' if faithful else 'n/a (--fake)'} |",
        "",
        "## Per question",
        "",
        "| Kind | Question | Expected | Hybrid rank | Cited | Answer |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        c = r["case"]
        rank = next((i + 1 for i, d in enumerate(r["ranked"]["hybrid"]) if d in c.expected), "-")
        ans = r["answer"].answer.replace("|", "/").replace("\n", " ")
        lines.append(f"| {c.kind} | {c.question} | {', '.join(c.expected) or '(none)'} | {rank} | {', '.join(r['answer'].citations) or '-'} | {ans} |")
    return lines


if __name__ == "__main__":
    sys.exit(main())
