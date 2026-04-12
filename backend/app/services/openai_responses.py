from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings


def usage_dict_from_responses(response: Any, *, phase: str) -> dict[str, Any]:
    """Normalize Responses API usage (input/output tokens) for the same rollup shape as chat completions."""
    u = getattr(response, "usage", None)
    if not u:
        return {"phase": phase, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    inp = getattr(u, "input_tokens", None)
    if inp is None:
        inp = getattr(u, "prompt_tokens", None)
    out = getattr(u, "output_tokens", None)
    if out is None:
        out = getattr(u, "completion_tokens", None)
    pt = int(inp or 0)
    ct = int(out or 0)
    tt = getattr(u, "total_tokens", None)
    if tt is None:
        tt = pt + ct
    else:
        tt = int(tt)
    return {"phase": phase, "prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}


@dataclass
class WebResearchPacket:
    text: str
    sources: list[dict[str, str]] = field(default_factory=list)
    web_queries: list[str] = field(default_factory=list)
    output_items: list[Any] = field(default_factory=list)


def _tool_spec(settings: Settings) -> dict[str, Any]:
    t = settings.web_search_tool.strip()
    if t in ("web_search", "web_search_preview"):
        return {"type": t}
    return {"type": "web_search_preview"}


def _extract_from_response(response: Any) -> WebResearchPacket:
    text_parts: list[str] = []
    sources: list[dict[str, str]] = []
    queries: list[str] = []
    items = list(getattr(response, "output", None) or getattr(response, "output_text", None) or [])
    if isinstance(items, str):
        return WebResearchPacket(text=items, output_items=[])

    for item in items:
        itype = getattr(item, "type", None) or (item.get("type") if isinstance(item, dict) else None)
        if itype == "web_search_call":
            action = getattr(item, "action", None) or (isinstance(item, dict) and item.get("action"))
            if isinstance(action, dict):
                if action.get("type") == "search":
                    for q in action.get("queries") or []:
                        if isinstance(q, str):
                            queries.append(q)
            elif action is not None:
                raw = getattr(action, "queries", None)
                if raw:
                    queries.extend([str(x) for x in raw])
        if itype == "message":
            content = getattr(item, "content", None) or (
                isinstance(item, dict) and item.get("content")
            )
            if not content:
                continue
            for block in content:
                btype = getattr(block, "type", None) or (
                    isinstance(block, dict) and block.get("type")
                )
                if btype in ("output_text", "text"):
                    t = getattr(block, "text", None) or (
                        isinstance(block, dict) and block.get("text")
                    )
                    if t:
                        text_parts.append(t)
                    anns = getattr(block, "annotations", None) or (
                        isinstance(block, dict) and block.get("annotations")
                    ) or []
                    for ann in anns:
                        at = getattr(ann, "type", None) or (
                            isinstance(ann, dict) and ann.get("type")
                        )
                        if at == "url_citation":
                            url = getattr(ann, "url", None) or (
                                isinstance(ann, dict) and ann.get("url")
                            )
                            title = getattr(ann, "title", None) or (
                                isinstance(ann, dict) and ann.get("title")
                            )
                            if url:
                                sources.append({"url": str(url), "title": str(title or "")})
    # Deduplicate sources by URL
    seen: set[str] = set()
    deduped: list[dict[str, str]] = []
    for s in sources:
        u = s.get("url") or ""
        if u and u not in seen:
            seen.add(u)
            deduped.append(s)
    return WebResearchPacket(
        text="\n\n".join(text_parts).strip(),
        sources=deduped,
        web_queries=list(dict.fromkeys(queries)),
        output_items=items if isinstance(items, list) else [],
    )


async def run_responses_web_research(
    *,
    client: AsyncOpenAI,
    settings: Settings,
    instructions: str,
    user_input: str,
    model: str | None = None,
    phase: str = "research",
) -> tuple[WebResearchPacket, dict[str, Any]]:
    """
    Single-shot Responses API call with built-in web search tool.
    Returns packet and a usage dict (same shape as chat completions, for token rollups).
    """
    m = model or settings.openai_model
    tools = [_tool_spec(settings)]
    try:
        response = await client.responses.create(
            model=m,
            instructions=instructions,
            input=user_input,
            tools=tools,
        )
    except Exception:
        # Retry with alternate tool name if account expects the other variant
        alt = (
            {"type": "web_search"}
            if tools[0]["type"] == "web_search_preview"
            else {"type": "web_search_preview"}
        )
        response = await client.responses.create(
            model=m,
            instructions=instructions,
            input=user_input,
            tools=[alt],
        )
    return _extract_from_response(response), usage_dict_from_responses(response, phase=phase)
