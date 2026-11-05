"""Hybrid search over week documents: BM25 + vector (cosine), merged with
reciprocal rank fusion.

The app runs this on the phone (src/ui/weekSearch.ts); this is the same
algorithm in Python so the evals can measure it. Both are checked against
tests/fixtures/search_golden.json, so they can't drift apart.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

STOP = set(
    (
        "a an and are as at be by did do does for from had has have how i in is it its last me my of on or "
        "the this that to was were what when where which who will with week weeks"
    ).split()
)
WORD = re.compile(r"[^\W_]+")


@dataclass
class Ranked:
    id: str
    score: float


def tokenize(text: str) -> list[str]:
    """Lowercase words without stop words; a plural "s" is dropped."""
    words = [w for w in WORD.findall(text.lower()) if w not in STOP]
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]


def _sorted(items: list[Ranked]) -> list[Ranked]:
    return sorted(items, key=lambda r: (-r.score, r.id))


def bm25(query: str, docs: list[tuple[str, str]], k1: float = 1.2, b: float = 0.75) -> list[Ranked]:
    """`docs`: (id, text). Docs without any query word are left out."""
    terms = list(dict.fromkeys(tokenize(query)))
    tokens = [tokenize(text) for _, text in docs]
    avg = sum(len(t) for t in tokens) / max(1, len(tokens))
    df: dict[str, int] = {}
    for t in tokens:
        for w in set(t):
            df[w] = df.get(w, 0) + 1
    n = len(docs)
    out = []
    for (doc_id, _), t in zip(docs, tokens):
        tf: dict[str, int] = {}
        for w in t:
            tf[w] = tf.get(w, 0) + 1
        score = 0.0
        for term in terms:
            f = tf.get(term, 0)
            if not f:
                continue
            dft = df.get(term, 0)
            idf = math.log(1 + (n - dft + 0.5) / (dft + 0.5))
            score += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len(t) / (avg or 1)))
        if score > 0:
            out.append(Ranked(doc_id, score))
    return _sorted(out)


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a)
    nb = sum(y * y for y in b)
    return dot / math.sqrt(na * nb) if na and nb else 0.0


def vector_search(query_vector: list[float], vectors: dict[str, list[float]]) -> list[Ranked]:
    return _sorted([Ranked(doc_id, cosine(query_vector, v)) for doc_id, v in vectors.items()])


def rrf(lists: list[list[Ranked]], k: int = 60) -> list[Ranked]:
    scores: dict[str, float] = {}
    for ranked in lists:
        for rank, r in enumerate(ranked):
            scores[r.id] = scores.get(r.id, 0.0) + 1 / (k + rank + 1)
    return _sorted([Ranked(doc_id, s) for doc_id, s in scores.items()])


def hybrid_search(
    query: str,
    docs: list[tuple[str, str]],
    query_vector: list[float] | None = None,
    vectors: dict[str, list[float]] | None = None,
    k: int = 5,
) -> list[Ranked]:
    keyword = bm25(query, docs)
    if query_vector is None or not vectors:
        return keyword[:k]
    return rrf([keyword, vector_search(query_vector, vectors)])[:k]
