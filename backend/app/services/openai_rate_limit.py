"""
Retry wrapper for OpenAI TPM/RPM rate limits (HTTP 429) with backoff from the error message or Retry-After header.
"""
from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from typing import TypeVar

from openai import APIStatusError, RateLimitError

logger = logging.getLogger(__name__)

T = TypeVar("T")

_DEFAULT_BACKOFF_S = 6.0
_MAX_SLEEP_S = 120.0


def _is_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError) and getattr(exc, "status_code", None) == 429:
        return True
    msg = str(exc).lower()
    return "rate_limit" in msg or "rate limit" in msg or "tokens per min" in msg


def _retry_after_seconds(exc: BaseException) -> float:
    """Prefer server hint, else parse 'try again in 11.896s' from OpenAI TPM messages."""
    if isinstance(exc, APIStatusError) and exc.response is not None:
        h = exc.response.headers.get("retry-after")
        if h:
            try:
                return float(h)
            except ValueError:
                pass
    msg = str(exc)
    for pattern in (
        r"try again in ([\d.]+)\s*s",
        r"try again in ([\d.]+)\s*seconds",
        r"retry after ([\d.]+)",
    ):
        m = re.search(pattern, msg, re.I)
        if m:
            return max(float(m.group(1)), 0.5)
    return _DEFAULT_BACKOFF_S


async def run_with_rate_limit_retry(
    call: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 14,
    label: str = "openai",
) -> T:
    """
    Run an async OpenAI call, retrying on 429 / TPM rate limits with sleep from the error or a default backoff.
    """
    last: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            return await call()
        except Exception as exc:
            last = exc
            if not _is_rate_limit(exc) or attempt >= max_attempts - 1:
                raise
            wait = min(max(_retry_after_seconds(exc), 1.0), _MAX_SLEEP_S)
            logger.warning(
                "%s rate limit (attempt %s/%s); sleeping %.1fs — %s",
                label,
                attempt + 1,
                max_attempts,
                wait,
                str(exc)[:280],
            )
            await asyncio.sleep(wait)
    assert last is not None
    raise last
