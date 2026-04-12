from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI

# OpenAI requires the word "json" to appear in messages when using response_format json_object.
_JSON_MODE_HINT = (
    "\n\nReply with a single valid JSON object only (no markdown). "
    "The response format is JSON."
)


def usage_dict_from_chat_completion(response: Any, *, phase: str) -> dict[str, Any]:
    """Normalize Chat Completions usage for storage (per-phase rollups)."""
    u = getattr(response, "usage", None)
    if not u:
        return {"phase": phase, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    pt = int(getattr(u, "prompt_tokens", None) or 0)
    ct = int(getattr(u, "completion_tokens", None) or 0)
    tt = getattr(u, "total_tokens", None)
    if tt is None:
        tt = pt + ct
    else:
        tt = int(tt)
    return {"phase": phase, "prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}


def aggregate_token_usage(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Roll up per-call events into totals and per-phase sums for Firestore / admin UI."""
    by_phase: dict[str, dict[str, int]] = {}
    total = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for e in events:
        ph = str(e.get("phase") or "unknown")
        pt = int(e.get("prompt_tokens") or 0)
        ct = int(e.get("completion_tokens") or 0)
        tt = int(e.get("total_tokens") or (pt + ct))
        total["prompt_tokens"] += pt
        total["completion_tokens"] += ct
        total["total_tokens"] += tt
        if ph not in by_phase:
            by_phase[ph] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        by_phase[ph]["prompt_tokens"] += pt
        by_phase[ph]["completion_tokens"] += ct
        by_phase[ph]["total_tokens"] += tt
    return {"total": total, "by_phase": by_phase, "call_count": len(events)}


async def chat_json_object(
    *,
    client: AsyncOpenAI,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    phase: str = "unknown",
) -> tuple[dict[str, Any], dict[str, Any]]:
    system_with_json = system.strip() + _JSON_MODE_HINT
    r = await client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_with_json},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
    )
    raw = r.choices[0].message.content or "{}"
    return json.loads(raw), usage_dict_from_chat_completion(r, phase=phase)


async def chat_text(
    *,
    client: AsyncOpenAI,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.4,
    phase: str = "unknown",
) -> tuple[str, dict[str, Any]]:
    r = await client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    text = (r.choices[0].message.content or "").strip()
    return text, usage_dict_from_chat_completion(r, phase=phase)
