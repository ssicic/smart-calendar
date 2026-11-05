"""Embeddings: a list of numbers that stands for the meaning of a text, so
texts about the same thing ("gym", "workout") end up close together.

VoyageEmbedder calls Voyage AI (key VOYAGE_API_KEY, server-side only, like
ANTHROPIC_API_KEY). FakeEmbedder needs no key and no network: it hashes words
into a fixed-size vector, so tests, CI and AI_FAKE demos still run. It only
matches shared words, not meaning, so it says nothing about real quality.
"""

from __future__ import annotations

import hashlib
import math
import os
from typing import Literal, Protocol

import httpx

from .retrieval import tokenize

InputType = Literal["document", "query"]

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = os.environ.get("VOYAGE_MODEL", "voyage-3.5-lite")
DIMENSIONS = 512  # smaller than the default 1024: plenty for a few hundred weeks, half the storage


class EmbeddingError(Exception):
    """The embedding service failed; the message is fine to show."""


class Embedder(Protocol):
    model: str

    def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]: ...


class VoyageEmbedder:
    model = f"{VOYAGE_MODEL}-{DIMENSIONS}"

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]:
        try:
            r = httpx.post(
                VOYAGE_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"input": texts, "model": VOYAGE_MODEL, "input_type": input_type, "output_dimension": DIMENSIONS},
                timeout=30,
            )
        except httpx.HTTPError:
            raise EmbeddingError("The AI service can't reach Voyage AI. Check the internet connection.")
        if r.status_code == 401:
            raise EmbeddingError("The AI service has no valid Voyage key. Check VOYAGE_API_KEY.")
        if r.status_code == 429:
            raise EmbeddingError("Too many requests right now. Try again in a minute.")
        if r.status_code >= 400:
            raise EmbeddingError(f"Voyage AI returned an error ({r.status_code}).")
        data = sorted(r.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]


class FakeEmbedder:
    """Feature hashing: each word (and each 3-letter piece of it) adds 1 to one of
    `dims` slots, chosen by a stable hash; then the vector is scaled to length 1."""

    def __init__(self, dims: int = 256) -> None:
        self.dims = dims
        self.model = f"fake-hash-{dims}"

    def _slot(self, feature: str) -> int:
        return int(hashlib.md5(feature.encode()).hexdigest()[:8], 16) % self.dims

    def embed_one(self, text: str) -> list[float]:
        v = [0.0] * self.dims
        for word in tokenize(text):
            v[self._slot(word)] += 1.0
            padded = f"#{word}#"
            for i in range(len(padded) - 2):
                v[self._slot("3:" + padded[i : i + 3])] += 0.3
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    def embed(self, texts: list[str], input_type: InputType) -> list[list[float]]:
        return [self.embed_one(t) for t in texts]


def default_embedder() -> Embedder | None:
    """Fake with AI_FAKE=1 or EMBED_FAKE=1, Voyage when its key is set, else None."""
    if os.environ.get("AI_FAKE") == "1" or os.environ.get("EMBED_FAKE") == "1":
        return FakeEmbedder()
    key = os.environ.get("VOYAGE_API_KEY")
    return VoyageEmbedder(key) if key else None
