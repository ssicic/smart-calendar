"""The app token: required only when APP_TOKEN is set (as on Vercel)."""

from app.llm import DemoLLM

from .test_review import FACTS, client_with


def test_open_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("APP_TOKEN", raising=False)
    assert client_with(DemoLLM()).post("/weekly-review", json=FACTS).status_code == 200


def test_needs_the_right_token_when_configured(monkeypatch):
    monkeypatch.setenv("APP_TOKEN", "s3cret")
    client = client_with(DemoLLM())
    assert client.post("/weekly-review", json=FACTS).status_code == 401
    assert client.post("/weekly-review", json=FACTS, headers={"X-App-Token": "nope"}).status_code == 401
    assert client.post("/weekly-review", json=FACTS, headers={"X-App-Token": "s3cret"}).status_code == 200
    assert client.get("/health").status_code == 200  # health stays open
