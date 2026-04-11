from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI

# OpenAI requires the word "json" to appear in messages when using response_format json_object.
_JSON_MODE_HINT = (
    "\n\nReply with a single valid JSON object only (no markdown). "
    "The response format is JSON."
)


async def chat_json_object(
    *,
    client: AsyncOpenAI,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
) -> dict[str, Any]:
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
    return json.loads(raw)


async def chat_text(
    *,
    client: AsyncOpenAI,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.4,
) -> str:
    r = await client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return (r.choices[0].message.content or "").strip()
