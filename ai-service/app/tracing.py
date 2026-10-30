"""Langfuse tracing: every agent run becomes a trace (model calls, tool calls,
tokens, cost, time). On only when LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY
are set (LANGFUSE_BASE_URL picks the region, e.g. https://cloud.langfuse.com);
without them nothing is sent anywhere."""

from __future__ import annotations

import os


def enabled() -> bool:
    return bool(os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"))


def callbacks() -> list:
    if not enabled():
        return []
    from langfuse.langchain import CallbackHandler

    return [CallbackHandler()]


def flush() -> None:
    """Serverless functions can stop right after the response: send traces first."""
    if enabled():
        from langfuse import get_client

        get_client().flush()
