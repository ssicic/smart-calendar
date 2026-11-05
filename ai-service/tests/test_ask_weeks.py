"""Tests for "Ask your past weeks": /embed, /ask-weeks and the search, with a
fake LLM and fake embeddings (offline, no cost)."""

import json
from pathlib import Path

import httpx
import pytest

from app import embeddings
from app.ask_weeks import WeeksAnswer
from app.embeddings import EmbeddingError, FakeEmbedder, VoyageEmbedder
from app.llm import DemoLLM
from app.main import app, get_embedder
from app.retrieval import bm25, cosine, hybrid_search, rrf, tokenize, vector_search

from .test_review import FakeLLM, client_with

DOCS = [
    {"id": "week:2026-10-12", "title": "Week of 12 Oct", "text": "Tue 13 Oct: Gym 07:00-08:00 (done); Work 09:00-17:00."},
    {"id": "week:2026-10-05", "title": "Week of 5 Oct", "text": "Mon 5 Oct: Work 09:00-17:00; Gym 18:00-19:00 (done)."},
]
ASK = {"question": "When did I last go to the gym before work?", "today": "2026-11-05", "docs": DOCS}


def embed_client(embedder):
    client = client_with(FakeLLM())
    app.dependency_overrides[get_embedder] = lambda: embedder
    return client


@pytest.fixture(autouse=True)
def _reset():
    yield
    app.dependency_overrides.clear()


# ---- /ask-weeks ----


def test_answers_with_citations_and_sends_the_weeks():
    llm = FakeLLM(WeeksAnswer(answer="Tuesday 13 Oct at 07:00.", found=True, citations=["week:2026-10-12"]))
    r = client_with(llm).post("/ask-weeks", json=ASK)
    assert r.status_code == 200
    assert r.json() == {"answer": "Tuesday 13 Oct at 07:00.", "found": True, "citations": ["week:2026-10-12"]}
    assert "Gym 07:00-08:00" in llm.calls[0] and "2026-11-05" in llm.calls[0]


def test_drops_citations_that_were_not_given_and_duplicates():
    made_up = WeeksAnswer(answer=" Hi ", found=True, citations=["week:2025-01-01", "week:2026-10-05", "week:2026-10-05"])
    body = client_with(FakeLLM(made_up)).post("/ask-weeks", json=ASK).json()
    assert body == {"answer": "Hi", "found": True, "citations": ["week:2026-10-05"]}


def test_not_found_has_no_citations():
    llm = FakeLLM(WeeksAnswer(answer="I couldn't find that.", found=False, citations=["week:2026-10-12"]))
    assert client_with(llm).post("/ask-weeks", json=ASK).json()["citations"] == []


def test_no_docs_answers_without_calling_the_model():
    llm = FakeLLM()
    body = client_with(llm).post("/ask-weeks", json={**ASK, "docs": []}).json()
    assert body["found"] is False and llm.calls == []


def test_question_must_not_be_empty():
    assert client_with(FakeLLM()).post("/ask-weeks", json={**ASK, "question": ""}).status_code == 422


def test_demo_mode_cites_the_first_week():
    body = client_with(DemoLLM()).post("/ask-weeks", json=ASK).json()
    assert body["citations"] == ["week:2026-10-12"] and body["found"] is True


# ---- /embed ----


def test_embed_returns_one_vector_per_text():
    body = embed_client(FakeEmbedder(dims=32)).post("/embed", json={"texts": ["gym", "work"], "input_type": "document"}).json()
    assert body["model"] == "fake-hash-32"
    assert len(body["vectors"]) == 2 and len(body["vectors"][0]) == 32


def test_embed_without_a_key_says_so():
    r = embed_client(None).post("/embed", json={"texts": ["gym"]})
    assert r.status_code == 503 and "VOYAGE_API_KEY" in r.json()["detail"]


def test_embed_errors_become_messages():
    class Broken:
        model = "x"

        def embed(self, texts, input_type):
            raise EmbeddingError("Too many requests right now. Try again in a minute.")

    r = embed_client(Broken()).post("/embed", json={"texts": ["gym"]})
    assert r.status_code == 503 and r.json()["detail"].startswith("Too many")


def test_voyage_request_shape(monkeypatch):
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return httpx.Response(200, json={"data": [{"index": 1, "embedding": [0.0, 1.0]}, {"index": 0, "embedding": [1.0, 0.0]}]})

    monkeypatch.setattr(embeddings.httpx, "post", fake_post)
    out = VoyageEmbedder("secret").embed(["a", "b"], "query")
    assert out == [[1.0, 0.0], [0.0, 1.0]]  # back in input order
    assert sent["json"]["input_type"] == "query" and sent["json"]["output_dimension"] == 512
    assert sent["headers"]["Authorization"] == "Bearer secret"


def test_voyage_bad_key(monkeypatch):
    monkeypatch.setattr(embeddings.httpx, "post", lambda *a, **k: httpx.Response(401, json={}))
    with pytest.raises(EmbeddingError, match="VOYAGE_API_KEY"):
        VoyageEmbedder("bad").embed(["a"], "document")


def test_fake_embeddings_are_stable_and_find_shared_words():
    e = FakeEmbedder()
    gym, gyms, dentist = e.embed(["Gym at 7", "gym sessions", "Dentist appointment"], "document")
    assert gym == e.embed_one("Gym at 7")
    assert cosine(gym, gyms) > cosine(gym, dentist)


# ---- retrieval (same algorithm as src/ui/weekSearch.ts) ----

GOLDEN = json.loads((Path(__file__).parent / "fixtures" / "search_golden.json").read_text())


@pytest.mark.parametrize("q", GOLDEN["queries"], ids=lambda q: q["query"])
def test_matches_the_golden_file(q):
    docs = [(d["id"], d["text"]) for d in GOLDEN["docs"]]
    assert [r.id for r in bm25(q["query"], docs)] == q["bm25"]
    assert [r.id for r in vector_search(q["vector"], GOLDEN["vectors"])] == q["vector_ranked"]
    assert [r.id for r in hybrid_search(q["query"], docs, q["vector"], GOLDEN["vectors"], k=3)] == q["hybrid"]


def test_tokenize_and_rrf():
    assert tokenize("When did I go to the Gym sessions?") == ["go", "gym", "session"]
    fused = rrf([[type("R", (), {"id": "a"})(), type("R", (), {"id": "b"})()], [type("R", (), {"id": "b"})()]])
    assert [r.id for r in fused] == ["b", "a"]
