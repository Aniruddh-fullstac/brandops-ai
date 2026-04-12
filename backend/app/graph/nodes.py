from __future__ import annotations

import asyncio
import copy
import json
import re
import uuid
from collections import defaultdict
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings
from app.schemas.campaign import AgentActivity, AgentTraceStep, CampaignArtifacts, CampaignRequest, SourceRef, ToolInvocation
from app.services.fetch import fetch_url_text
from app.services.image_store import persist_remote_image, persist_remote_images
from app.services.images import generate_campaign_images, generate_one_image
from app.services.platform_visuals import dalle_size_and_label, normalize_platform_key
from app.services.llm import chat_json_object, chat_text
from app.services.openai_responses import run_responses_web_research
from app.services.reddit import reddit_search_posts

from .state import CampaignState


def _tid() -> str:
    return uuid.uuid4().hex[:12]


def _trace_step(
    *,
    agent: str,
    phase: str,
    title: str,
    summary: str | None = None,
    reasoning: str | None = None,
    sources: list[SourceRef] | None = None,
    web_queries: list[str] | None = None,
    tool_calls: list[ToolInvocation] | None = None,
    structured: dict[str, Any] | None = None,
    raw_text_excerpt: str | None = None,
) -> dict[str, Any]:
    step = AgentTraceStep(
        id=_tid(),
        agent=agent,
        phase=phase,
        title=title,
        summary=summary,
        reasoning=reasoning,
        sources=sources or [],
        web_queries=web_queries or [],
        tool_calls=tool_calls or [],
        structured=structured,
        raw_text_excerpt=raw_text_excerpt,
    )
    return {"trace": [step.model_dump()]}


def _act(
    *,
    phase: str,
    agent: str,
    action: str,
    detail: str,
    url: str | None = None,
    tool: str | None = None,
    progress: str | None = None,
) -> dict[str, Any]:
    """Create a single activity entry dict (not wrapped in state key)."""
    return AgentActivity(
        id=_tid(), phase=phase, agent=agent, action=action,
        detail=detail, url=url, tool=tool, progress=progress,
    ).model_dump()


def _activities(*acts: dict[str, Any]) -> dict[str, Any]:
    """Return a state patch that appends multiple activity entries."""
    return {"activities": list(acts)}


def _emit_live(state: Any, act: dict[str, Any]) -> None:
    """Push an activity to the real-time queue if available."""
    q = state.get("_activity_queue") if isinstance(state, dict) else None
    if q is not None:
        try:
            q.put_nowait(act)
        except Exception:  # noqa: BLE001
            pass


def _usage_events(*usage_dicts: dict[str, Any] | None) -> dict[str, Any]:
    """Collect non-empty LLM usage dicts for LangGraph token_usage_events reducer."""
    events: list[dict[str, Any]] = []
    for u in usage_dicts:
        if not u:
            continue
        pt = int(u.get("prompt_tokens") or 0)
        ct = int(u.get("completion_tokens") or 0)
        tt = int(u.get("total_tokens") or (pt + ct))
        if tt <= 0 and pt <= 0 and ct <= 0:
            continue
        events.append({**u, "prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt})
    return {"token_usage_events": events} if events else {}


def _req(state: CampaignState) -> CampaignRequest:
    return CampaignRequest.model_validate(state["request"])


def _effective_geographies(r: CampaignRequest) -> list[str]:
    locs = [x.strip() for x in (r.locations or []) if x and str(x).strip()]
    if locs:
        return locs
    return [r.geography_primary, r.geography_secondary]


_IG_HANDLE_RE = re.compile(r"^[a-z0-9._]{1,30}$")

# Creative bundle keys — critic scores and refine output must align with these.
_CREATIVE_BUNDLE_KEYS = ("seo", "social", "video_concepts", "messaging_whatsapp")


def _score_value_as_float(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _coerced_score_entries(scores: Any) -> list[tuple[str, float]]:
    if not isinstance(scores, dict):
        return []
    out: list[tuple[str, float]] = []
    for k, v in scores.items():
        f = _score_value_as_float(v)
        if f is not None:
            out.append((str(k), max(0.0, min(100.0, f))))
    return out


def _needs_refine_scores(vals: list[float], settings: Settings) -> bool:
    if not vals:
        return False
    avg = sum(vals) / len(vals)
    if avg < settings.critic_score_threshold_avg:
        return True
    return any(v < settings.critic_score_threshold_min for v in vals)


def _normalize_refined_creatives(refined: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    """Ensure each channel key exists after refine — LLMs sometimes drop keys or nest extras only."""
    out = dict(refined)
    for k in _CREATIVE_BUNDLE_KEYS:
        cur = out.get(k)
        empty = cur is None or cur == "" or (isinstance(cur, dict) and not cur)
        if empty and k in base and base.get(k) is not None:
            out[k] = copy.deepcopy(base[k])
    return out


def _bundle_has_any_channel(d: dict[str, Any]) -> bool:
    return any(bool(d.get(k)) for k in _CREATIVE_BUNDLE_KEYS)


def _qa_metadata_for_critique(critique: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Deterministic QA metadata + confidence (rubric completeness × outcome). Not LLM self-report."""
    entries = _coerced_score_entries(critique.get("scores"))
    vals = [v for _, v in entries]
    canonical = _CREATIVE_BUNDLE_KEYS
    scored_keys = {k for k, _ in entries}
    n_canon = sum(1 for k in canonical if k in scored_keys)
    coverage = n_canon / len(canonical) if canonical else 0.0
    avg = sum(vals) / len(vals) if vals else None
    min_v = min(vals) if vals else None
    max_v = max(vals) if vals else None
    rubric_confidence = round(100 * coverage)
    outcome_component = round(avg) if avg is not None else 0
    blended = int(round(0.45 * rubric_confidence + 0.55 * outcome_component)) if vals else 0
    blended = max(0, min(100, blended))
    refine_triggers = _needs_refine_scores(vals, settings) if vals else False
    passes = not refine_triggers if vals else False
    return {
        "qa_metadata": {
            "rubric_confidence": rubric_confidence,
            "blended_confidence": blended,
            "coverage_canonical_channels": round(coverage, 2),
            "canonical_channels_present": n_canon,
            "score_stats": {
                "avg": round(avg, 2) if avg is not None else None,
                "min": round(min_v, 2) if min_v is not None else None,
                "max": round(max_v, 2) if max_v is not None else None,
                "channels_scored": len(entries),
            },
            "passes_threshold": passes,
            "refine_recommended": refine_triggers,
            "thresholds": {
                "avg_min": settings.critic_score_threshold_avg,
                "per_channel_min": settings.critic_score_threshold_min,
            },
        }
    }


def _enrich_critique(critique: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Attach normalized scores + qa_metadata; keep original keys for backward compatibility."""
    out = dict(critique)
    raw_scores = out.get("scores")
    if isinstance(raw_scores, dict):
        norm: dict[str, float] = {}
        for k, v in raw_scores.items():
            f = _score_value_as_float(v)
            if f is not None:
                norm[str(k)] = round(max(0.0, min(100.0, f)), 1)
        if norm:
            out["scores_normalized"] = norm
    meta = _qa_metadata_for_critique(out, settings)["qa_metadata"]
    out["qa_metadata"] = meta
    return out


def _normalize_ig_handle(raw: str | None) -> str | None:
    """Lowercase Instagram username without @; None if invalid."""
    if not raw:
        return None
    h = str(raw).strip().lstrip("@").lower()
    if not h or not _IG_HANDLE_RE.match(h):
        return None
    return h


def _needs_refine(critique: dict[str, Any] | None, settings: Settings) -> bool:
    """True if critic scores warrant another refinement pass."""
    if not critique:
        return False
    entries = _coerced_score_entries(critique.get("scores"))
    vals = [v for _, v in entries]
    return _needs_refine_scores(vals, settings)


def build_node_context(state: CampaignState) -> str:
    r = _req(state)
    markets = _effective_geographies(r)
    parts = [
        f"Brand name: {r.brand_name}",
        f"Target market(s): {', '.join(markets)}",
    ]
    if r.company_tagline:
        parts.append(f"Company tagline: {r.company_tagline}")
    if r.target_audience_hint:
        parts.append("Target audience (client profile): " + r.target_audience_hint[:4000])
    if r.industry_hint:
        parts.append(f"Industry hint: {r.industry_hint}")
    if r.brand_url:
        parts.append(f"Official URL: {r.brand_url}")
    if r.instagram_handle:
        parts.append(f"Brand Instagram: @{r.instagram_handle.lstrip('@')}")
    if r.additional_context:
        parts.append("User-provided documents/context:\n" + r.additional_context[:8000])
    if state.get("brand_page_text"):
        parts.append(
            "Extracted on-site copy (truncated):\n" + state["brand_page_text"][:6000]
        )
    return "\n\n".join(parts)


async def node_ingest(state: CampaignState) -> dict[str, Any]:
    r = _req(state)
    return {
        **_activities(
            _act(phase="ingest", agent="ingest_orchestrator", action="parsing",
                 detail=f"Parsing campaign brief for {r.brand_name}"),
            _act(phase="ingest", agent="ingest_orchestrator", action="configuring",
                 detail=f"Target markets: {', '.join(_effective_geographies(r))}"),
        ),
        **_trace_step(
            agent="ingest_orchestrator",
            phase="ingest",
            title="Normalized campaign brief",
            summary=f"Prepared run for {r.brand_name} with dual-geo adaptation.",
            reasoning="Validates inputs and attaches geography targets for downstream localization.",
            structured={
                "brand_name": r.brand_name,
                "brand_url": str(r.brand_url) if r.brand_url else None,
                "geographies": _effective_geographies(r),
                "locations": list(r.locations or []),
            },
        ),
        "generate_images": r.generate_images,
        "brand_url": str(r.brand_url) if r.brand_url else None,
    }


async def node_brand_fetch(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    r = _req(state)
    url = state.get("brand_url")
    if not url:
        return {
            **_trace_step(
                agent="brand_site_analyst",
                phase="brand_fetch",
                title="Skipped on-site crawl",
                summary="No brand URL supplied; relying on documents and live research.",
            ),
            "brand_page_text": None,
            "brand_page_content_type": None,
        }
    tools = [
        ToolInvocation(name="fetch_url", args={"url": url}, result_summary=None),
    ]
    # Emit live activity BEFORE the slow fetch
    _emit_live(state, _act(phase="brand_fetch", agent="brand_site_analyst", action="fetching_url",
                           detail=f"Crawling {url}", url=url, tool="fetch_url"))
    acts = []
    try:
        text, ctype = await fetch_url_text(url, settings)
        tools[0].result_summary = f"Fetched {len(text)} chars ({ctype or 'unknown'})."
        excerpt = text[:1200] + ("…" if len(text) > 1200 else "")
        summary = "Extracted readable text and light IA signals from the live site."
        acts.append(_act(
            phase="brand_fetch", agent="brand_site_analyst", action="analyzing",
            detail=f"Extracted {len(text):,} chars of content from {url}",
            url=url, tool="text_extraction",
        ))
        acts.append(_act(
            phase="brand_fetch", agent="brand_site_analyst", action="llm_call",
            detail=f"Analyzing brand positioning and tone from {r.brand_name} website",
            tool="gpt-4o-mini",
        ))
        return {
            **_activities(*acts),
            **_trace_step(
                agent="brand_site_analyst",
                phase="brand_fetch",
                title="Live brand site understanding",
                summary=summary,
                reasoning="Primary-source crawl grounds later agents in actual product language, claims, and navigation emphasis.",
                tool_calls=tools,
                raw_text_excerpt=excerpt,
                structured={"content_type": ctype, "char_count": len(text)},
            ),
            "brand_page_text": text,
            "brand_page_content_type": ctype,
        }
    except Exception as exc:  # noqa: BLE001
        tools[0].result_summary = f"fetch failed: {exc}"
        return {
            **_trace_step(
                agent="brand_site_analyst",
                phase="brand_fetch",
                title="Brand site fetch failed",
                summary="Could not reliably read the URL; continuing with search-heavy agents.",
                tool_calls=tools,
                reasoning=str(exc),
            ),
            "errors": [f"brand_fetch:{exc}"],
            "brand_page_text": None,
            "brand_page_content_type": None,
        }


async def _competitor_agent(state: CampaignState, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    ctx = build_node_context(state)
    r = _req(state)
    instructions = (
        "You are a competitive intelligence analyst. Use web search to identify direct and adjacent "
        "competitors, their positioning, pricing posture if visible, and notable campaigns. "
        "Prioritize recent sources. Explain what evidence supports each conclusion."
    )
    user = (
        ctx
        + f"\n\nFocus: map the competitive set around `{r.brand_name}`. "
        "Include both global and regional players where relevant."
    )
    # Emit live BEFORE the slow web search
    _emit_live(state, _act(phase="research", agent="competitor_intelligence", action="web_search",
                           detail=f"Searching web for {r.brand_name} competitors and market positioning",
                           tool="web_search"))
    acts: list[dict[str, Any]] = []
    pkt, u_resp = await run_responses_web_research(
        client=client,
        settings=settings,
        instructions=instructions,
        user_input=user,
        phase="research",
    )
    # Emit sources found live
    for s in pkt.sources[:5]:
        a = _act(phase="research", agent="competitor_intelligence", action="reading_source",
                 detail=f"Reading: {s.get('title', s['url'])}", url=s["url"], tool="web_search")
        _emit_live(state, a)
        acts.append(a)
    _emit_live(state, _act(phase="research", agent="competitor_intelligence", action="llm_call",
                           detail=f"Structuring competitive landscape for {r.brand_name}", tool="gpt-4o-mini"))
    structured, u_chat = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Convert the research narrative into concise JSON. Schema keys: "
            "competitors (array of {name, positioning, differentiators, evidence_urls, threat_level}), "
            "white_space_opportunities (array of strings), risks (array of strings), "
            "reasoning_summary (string)."
        ),
        user="Research output:\n" + pkt.text[:14_000],
        phase="research",
    )
    sources = [SourceRef(url=s["url"], title=s.get("title")) for s in pkt.sources[:40]]
    return {
        **_activities(*acts),
        "packet": {
            "narrative": pkt.text,
            "structured": structured,
            "sources": [s.model_dump() for s in sources],
            "web_queries": pkt.web_queries,
        },
        "trace": [
            AgentTraceStep(
                id=_tid(),
                agent="competitor_intelligence",
                phase="research",
                title="Competitor landscape with citations",
                summary=structured.get("reasoning_summary"),
                reasoning="Web search identifies named competitors and verifies claims with URLs.",
                sources=sources,
                web_queries=pkt.web_queries,
                structured=structured,
                raw_text_excerpt=pkt.text[:900] + ("…" if len(pkt.text) > 900 else ""),
            ).model_dump()
        ],
        **_usage_events(u_resp, u_chat),
    }


async def _social_agent(state: CampaignState, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    ctx = build_node_context(state)
    reddit_q = f"{r.brand_name} {r.industry_hint or ''} review OR experience"
    _emit_live(state, _act(phase="research", agent="social_media_intelligence", action="reddit_search",
                           detail=f"Searching Reddit for \"{reddit_q}\"", tool="reddit_search"))
    acts: list[dict[str, Any]] = []
    reddit_posts: list[dict] = []
    reddit_err: str | None = None
    try:
        reddit_posts = await reddit_search_posts(reddit_q, limit=10, timeout_s=settings.http_timeout_s)
    except Exception as exc:  # noqa: BLE001
        reddit_err = str(exc)
    tools = [
        ToolInvocation(
            name="reddit_search",
            args={"query": reddit_q},
            result_summary=(
                f"{len(reddit_posts)} posts" if reddit_posts else f"failed: {reddit_err}"
            ),
        )
    ]
    digest = {"query": reddit_q, "posts": reddit_posts, "error": reddit_err}
    instructions = (
        "You are a social listening strategist. Use web search to find how similar brands show up on "
        "LinkedIn, Instagram, YouTube, and community forums. Identify hooks, formats, and "
        "creator patterns that drive engagement. Cross-check with the Reddit snapshot provided."
    )
    user = (
        ctx
        + "\n\nReddit snapshot (JSON):\n"
        + str(digest)[:8000]
        + "\n\nInfer platform-native tactics for this category."
    )
    _emit_live(state, _act(phase="research", agent="social_media_intelligence", action="web_search",
                           detail=f"Searching social platforms for {r.brand_name} content patterns", tool="web_search"))
    pkt, u_resp = await run_responses_web_research(
        client=client,
        settings=settings,
        instructions=instructions,
        user_input=user,
        phase="research",
    )
    for s in pkt.sources[:4]:
        a = _act(phase="research", agent="social_media_intelligence", action="reading_source",
                 detail=f"Analyzing: {s.get('title', s['url'])}", url=s["url"])
        _emit_live(state, a)
        acts.append(a)
    _emit_live(state, _act(phase="research", agent="social_media_intelligence", action="llm_call",
                           detail=f"Extracting social engagement patterns for {r.brand_name}", tool="gpt-4o-mini"))
    structured, u_chat = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Schema: winning_content_patterns (array of {platform, pattern, why_it_works, example_urls}), "
            "influencer_or_creator_trends (array of strings), community_tensions (array of strings), "
            "recommended_formats (array of strings), reasoning_summary (string)."
        ),
        user="Social research:\n" + pkt.text[:12_000],
        phase="research",
    )
    sources = [SourceRef(url=s["url"], title=s.get("title")) for s in pkt.sources[:40]]
    return {
        **_activities(*acts),
        "packet": {"narrative": pkt.text, "structured": structured, "sources": [s.model_dump() for s in sources], "web_queries": pkt.web_queries},
        "reddit": digest,
        "trace": [
            AgentTraceStep(
                id=_tid(),
                agent="social_media_intelligence",
                phase="research",
                title="Social + community signals",
                summary=structured.get("reasoning_summary"),
                reasoning="Combines open web social traces with anonymous Reddit discussions for unfiltered language.",
                sources=sources,
                web_queries=pkt.web_queries,
                tool_calls=tools,
                structured=structured,
                raw_text_excerpt=pkt.text[:900] + ("…" if len(pkt.text) > 900 else ""),
            ).model_dump()
        ],
        **_usage_events(u_resp, u_chat),
    }


async def _trends_agent(state: CampaignState, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    ctx = build_node_context(state)
    r = _req(state)
    instructions = (
        "You are a cultural & market trends analyst. Search for macro trends, seasonal moments, "
        "regulatory or technology shifts affecting this space in the next 90 days."
    )
    user = ctx + f"\n\nAnchor brand: {r.brand_name}. Surface trend evidence with URLs."
    _emit_live(state, _act(phase="research", agent="market_trends", action="web_search",
                           detail=f"Searching for market trends affecting {r.brand_name}", tool="web_search"))
    acts: list[dict[str, Any]] = []
    pkt, u_resp = await run_responses_web_research(
        client=client,
        settings=settings,
        instructions=instructions,
        user_input=user,
        phase="research",
    )
    for s in pkt.sources[:4]:
        a = _act(phase="research", agent="market_trends", action="reading_source",
                 detail=f"Analyzing: {s.get('title', s['url'])}", url=s["url"])
        _emit_live(state, a)
        acts.append(a)
    _emit_live(state, _act(phase="research", agent="market_trends", action="llm_call",
                           detail=f"Synthesizing trend impact analysis for {r.brand_name}", tool="gpt-4o-mini"))
    structured, u_chat = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Schema: trends (array of {name, timeframe, impact, evidence_urls, activation_idea}), "
            "headwinds (array of strings), tailwinds (array of strings), reasoning_summary (string)."
        ),
        user="Trend narrative:\n" + pkt.text[:12_000],
        phase="research",
    )
    sources = [SourceRef(url=s["url"], title=s.get("title")) for s in pkt.sources[:40]]
    return {
        **_activities(*acts),
        "packet": {"narrative": pkt.text, "structured": structured, "sources": [s.model_dump() for s in sources], "web_queries": pkt.web_queries},
        "trace": [
            AgentTraceStep(
                id=_tid(),
                agent="market_trends",
                phase="research",
                title="Live trend synthesis",
                summary=structured.get("reasoning_summary"),
                reasoning="Trend claims must be tied to external publishers or data sources, not speculation.",
                sources=sources,
                web_queries=pkt.web_queries,
                structured=structured,
                raw_text_excerpt=pkt.text[:900] + ("…" if len(pkt.text) > 900 else ""),
            ).model_dump()
        ],
        **_usage_events(u_resp, u_chat),
    }


async def _brand_instagram_agent(
    state: CampaignState, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """
    Fetch brand's own Instagram: post metrics, comment sentiment,
    and vision analysis of top-performing posts.
    """
    r = _req(state)
    handle = (r.instagram_handle or "").strip().lstrip("@")

    if not handle:
        return {
            "instagram_data": {},
            "trace": [
                AgentTraceStep(
                    id=_tid(),
                    agent="brand_instagram_analyst",
                    phase="research",
                    title="Brand Instagram skipped",
                    summary="No Instagram handle provided; skipping brand social analysis.",
                ).model_dump()
            ],
        }

    _emit_live(
        state,
        _act(
            phase="research",
            agent="brand_instagram_analyst",
            action="instagram_fetch",
            detail=f"Fetching posts and comments for @{handle} (instagrapi)",
            tool="instagrapi",
        ),
    )

    # Run sync instagrapi calls in a thread
    try:
        from app.services.instagrapi_service import get_trending_posts_with_comments
        raw = await asyncio.to_thread(
            get_trending_posts_with_comments,
            handle,
            20,   # max_posts
            5,    # top_n for comment fetch
            40,   # max_comments per post
            50,   # engagement threshold
        )
    except Exception as exc:
        return {
            "instagram_data": {"error": str(exc)},
            "trace": [
                AgentTraceStep(
                    id=_tid(),
                    agent="brand_instagram_analyst",
                    phase="research",
                    title="Brand Instagram fetch failed",
                    summary=str(exc),
                    reasoning="instagrapi could not reach the account; analysis skipped.",
                ).model_dump()
            ],
        }

    top_posts = raw.get("top_posts_with_comments") or []
    all_posts = raw.get("all_posts") or []
    fetch_error = raw.get("error")

    # ── Sentiment analysis on collected comments ──────────────────────────
    all_comments: list[str] = []
    for p in top_posts:
        for c in p.get("comments_text") or []:
            txt = (c.get("text") or "").strip()
            if txt:
                all_comments.append(txt)

    usage_ig: list[dict[str, Any]] = []
    sentiment_blob: dict[str, Any] = {}
    if all_comments:
        sentiment_blob, u_sent = await chat_json_object(
            client=client,
            model=settings.openai_model_fast,
            system=(
                "You are a social media sentiment analyst. Analyse the Instagram comments "
                "for this brand. Return JSON: "
                "overall_sentiment (positive/mixed/negative), "
                "sentiment_score (float -1 to 1), "
                "positive_themes (array of strings), "
                "negative_themes (array of strings), "
                "neutral_themes (array of strings), "
                "top_praised_aspects (array), "
                "top_complaints (array), "
                "audience_language_patterns (array of strings — recurring phrases/slang), "
                "emotional_tone (string), "
                "statistics (object: total_comments_analysed, pct_positive, pct_negative, pct_neutral), "
                "reasoning_summary (string)."
            ),
            user=(
                f"Brand: {r.brand_name}\n"
                f"Total comments analysed: {len(all_comments)}\n\n"
                "Comments (newest first):\n"
                + "\n".join(f"- {c}" for c in all_comments[:200])
            ),
            temperature=0.2,
            phase="research",
        )
        usage_ig.append(u_sent)

    # ── Overall Instagram performance summary ─────────────────────────────
    post_summary, u_post = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are an Instagram content strategist. Summarise this brand's Instagram performance. "
            "Return JSON: content_themes (array), top_performing_formats (array), "
            "avg_engagement (string), visual_style_notes (string), "
            "caption_patterns (array), best_posting_patterns (array), "
            "growth_signals (array), strategic_recommendations (array), "
            "reasoning_summary (string)."
        ),
        user=(
            f"Handle: @{handle}\n"
            f"Followers: {raw.get('followers')}\n"
            f"Total posts sampled: {raw.get('posts_fetched')}\n"
            f"Average likes: {raw.get('average_likes')}\n\n"
            "Top posts (by engagement):\n"
            + json.dumps(
                [
                    {k: v for k, v in p.items() if k != "comments_text"}
                    for p in top_posts
                ],
                default=str,
            )[:8000]
        ),
        temperature=0.3,
        phase="research",
    )
    usage_ig.append(u_post)

    analysis = {
        "handle": handle,
        "profile": {
            "followers": raw.get("followers"),
            "following": raw.get("following"),
            "bio": raw.get("bio"),
        },
        "posts_fetched": raw.get("posts_fetched", 0),
        "average_likes": raw.get("average_likes", 0),
        "total_video_views": raw.get("total_video_views", 0),
        "top_posts": [
            {k: v for k, v in p.items() if k != "comments_text"}
            for p in top_posts
        ],
        "all_posts_ranked": [
            {k: v for k, v in p.items() if k != "comments_text"}
            for p in (all_posts[:12])
        ],
        "comments_analysed": len(all_comments),
        "sentiment": sentiment_blob,
        "post_strategy_summary": post_summary,
        "fetch_error": fetch_error,
    }

    return {
        "instagram_data": analysis,
        "trace": [
            AgentTraceStep(
                id=_tid(),
                agent="brand_instagram_analyst",
                phase="research",
                title=f"Brand Instagram deep-dive — @{handle}",
                summary=post_summary.get("reasoning_summary"),
                reasoning=(
                    f"Fetched {raw.get('posts_fetched', 0)} posts; "
                    f"analysed {len(all_comments)} comments across top {len(top_posts)} posts. "
                    f"Sentiment: {sentiment_blob.get('overall_sentiment', 'n/a')} "
                    f"(score {sentiment_blob.get('sentiment_score', 'n/a')}). "
                    "Instagram data will anchor visual style choices and caption tone in the creative phase."
                ),
                structured={
                    "sentiment": sentiment_blob.get("statistics"),
                    "top_formats": post_summary.get("top_performing_formats"),
                    "avg_likes": raw.get("average_likes"),
                    "followers": raw.get("followers"),
                },
            ).model_dump()
        ],
        **_usage_events(*usage_ig),
    }


async def _competitor_instagram_agent(
    state: CampaignState, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """
    Discover competitor Instagram handles via OpenAI web search, then fetch posts + comments
    through instagrapi (private API — same stack as test.py / get_handle_stats).
    """
    r = _req(state)
    ctx = build_node_context(state)
    brand_ig = _normalize_ig_handle(r.instagram_handle)

    seen: set[str] = set()
    competitors_meta: list[dict[str, Any]] = []
    web_queries: list[str] = []
    research_sources: list[SourceRef] = []
    research_excerpt = ""
    web_failed: str | None = None
    usage_ci: list[dict[str, Any]] = []

    def _push_from_json(raw: dict[str, Any]) -> None:
        for item in (raw.get("competitors") or [])[:8]:
            h = _normalize_ig_handle(item.get("instagram_handle"))
            if not h or h in seen:
                continue
            if brand_ig and h == brand_ig:
                continue
            seen.add(h)
            competitors_meta.append(
                {
                    "name": (item.get("name") or "").strip() or h,
                    "instagram_handle": h,
                    "reason": (item.get("reason") or "").strip(),
                }
            )
            if len(competitors_meta) >= 3:
                break

    # Step 1a: web search for real competitor names + Instagram evidence
    try:
        _emit_live(
            state,
            _act(
                phase="research",
                agent="competitor_instagram_analyst",
                action="web_search",
                detail=f"Searching the web for competitors to {r.brand_name} and their Instagram handles",
                tool="web_search",
            ),
        )
        pkt, u_pkt = await run_responses_web_research(
            client=client,
            settings=settings,
            instructions=(
                "You are a competitive intelligence researcher. Use web search to find the 3 most direct "
                "competitors to the brand described. For each competitor, locate the official Instagram "
                "username (handle only). Prefer instagram.com profile URLs, company About pages, or "
                "verified news/press. Do not invent handles — if a handle cannot be verified from sources, "
                "say it is unknown. One short sentence per competitor explaining why they compete."
            ),
            user=(
                ctx
                + f"\n\nBrand: {r.brand_name}. Industry hint: {r.industry_hint or 'unknown'}. "
                "Focus on overlapping product category and geography."
            ),
            phase="research",
        )
        usage_ci.append(u_pkt)
        web_queries = list(pkt.web_queries or [])
        research_sources = [
            SourceRef(url=s["url"], title=s.get("title")) for s in (pkt.sources or [])[:40]
        ]
        research_excerpt = (pkt.text or "")[:1200]

        for s in (pkt.sources or [])[:5]:
            _emit_live(
                state,
                _act(
                    phase="research",
                    agent="competitor_instagram_analyst",
                    action="reading_source",
                    detail=f"Reading: {s.get('title', s.get('url', 'source'))}",
                    url=s.get("url"),
                    tool="web_search",
                ),
            )

        handles_resp, u_handles = await chat_json_object(
            client=client,
            model=settings.openai_model_fast,
            system=(
                "From the research narrative, extract JSON: "
                "competitors (array of up to 3: name, instagram_handle, reason). "
                "instagram_handle must be lowercase without @, or empty string if not verified in the text."
            ),
            user="Research output:\n" + (pkt.text or "")[:14_000],
            temperature=0.1,
            phase="research",
        )
        usage_ci.append(u_handles)
        _push_from_json(handles_resp)
    except Exception as exc:  # noqa: BLE001
        web_failed = str(exc)[:280]

    # Step 1b: if web search failed or returned no verifiable handles, fall back to LLM-only (legacy)
    if len(competitors_meta) < 1:
        _emit_live(
            state,
            _act(
                phase="research",
                agent="competitor_instagram_analyst",
                action="llm_call",
                detail="Inferring competitor Instagram handles from brand context (no web hits)",
                tool="gpt-4o-mini",
            ),
        )
        handles_resp, u_fallback = await chat_json_object(
            client=client,
            model=settings.openai_model_fast,
            system=(
                "You are a competitive intelligence researcher. "
                "Identify the 3 most direct competitors for this brand and their Instagram handles. "
                "Return JSON: competitors (array of {name, instagram_handle, reason}). "
                "Use only plausible real handles (lowercase, no @)."
            ),
            user=(
                ctx
                + f"\n\nBrand: {r.brand_name}. Industry hint: {r.industry_hint or 'unknown'}."
            ),
            temperature=0.2,
            phase="research",
        )
        usage_ci.append(u_fallback)
        _push_from_json(handles_resp)

    competitors_meta = competitors_meta[:3]

    # Step 2: fetch each competitor's posts + comments (sequential — reduces Instagram rate limits)
    async def _fetch_one(meta: dict[str, Any]) -> dict[str, Any]:
        name = meta.get("name", "")
        nh = _normalize_ig_handle(meta.get("instagram_handle"))
        if not nh:
            return {"name": name, "handle": None, "error": "no handle"}
        _emit_live(
            state,
            _act(
                phase="research",
                agent="competitor_instagram_analyst",
                action="instagram_fetch",
                detail=f"Fetching posts and comments for @{nh} (instagrapi)",
                tool="instagrapi",
            ),
        )
        try:
            from app.services.instagrapi_service import get_trending_posts_with_comments

            raw = await asyncio.to_thread(
                get_trending_posts_with_comments,
                nh,
                15,  # max_posts
                3,  # top_n for comments
                30,  # max_comments
                30,  # engagement threshold
            )
            return {"name": name, "handle": nh, **raw}
        except Exception as exc:  # noqa: BLE001
            return {"name": name, "handle": nh, "error": str(exc)}

    competitor_raw_list: list[dict[str, Any]] = []
    for m in competitors_meta:
        competitor_raw_list.append(await _fetch_one(m))

    # Step 3: LLM sentiment + "what works" analysis
    analysis_input = []
    for comp in competitor_raw_list:
        if comp.get("error"):
            continue
        all_comments: list[str] = []
        for p in (comp.get("top_posts_with_comments") or []):
            for c in (p.get("comments_text") or []):
                if c.get("text"):
                    all_comments.append(c["text"])
        analysis_input.append(
            {
                "name": comp["name"],
                "handle": comp["handle"],
                "followers": comp.get("followers"),
                "average_likes": comp.get("average_likes"),
                "top_posts": [
                    {k: v for k, v in p.items() if k != "comments_text"}
                    for p in (comp.get("top_posts_with_comments") or [])
                ],
                "sample_comments": all_comments[:60],
            }
        )

    competitor_analysis: dict[str, Any] = {}
    if analysis_input:
        competitor_analysis, u_cia = await chat_json_object(
            client=client,
            model=settings.openai_model_fast,
            system=(
                "You are a competitive Instagram strategist. Analyse competitor data and surface actionable insights. "
                "Return JSON: "
                "competitor_profiles (array of {name, handle, followers, avg_likes, "
                "content_themes, caption_style, what_resonates, audience_sentiment, sentiment_score}), "
                "industry_engagement_benchmarks (object: avg_likes, avg_comments, top_content_type), "
                "winning_tactics (array of strings — what competitors do that drives engagement), "
                "gap_opportunities (array of strings — angles competitors miss that this brand could own), "
                "hashtag_patterns (array), "
                "reasoning_summary (string)."
            ),
            user="Competitor Instagram data:\n" + json.dumps(analysis_input, default=str)[:12_000],
            temperature=0.25,
            phase="research",
        )
        usage_ci.append(u_cia)

    reasoning_parts = [
        f"Resolved {len(competitors_meta)} competitor handle(s); "
        f"fetched posts/comments for "
        f"{sum(1 for c in competitor_raw_list if not c.get('error'))} via instagrapi. "
        "Engagement benchmarks inform creative differentiation."
    ]
    if web_failed:
        reasoning_parts.append(f"Web-search step error (fallback may have been used): {web_failed}")

    return {
        "competitor_instagram": {
            "competitors_found": [m.get("name") for m in competitors_meta],
            "raw_data": [
                {k: v for k, v in c.items() if k not in ("all_posts", "top_posts_with_comments")}
                for c in competitor_raw_list
            ],
            "analysis": competitor_analysis,
            "web_search_queries": web_queries,
        },
        "trace": [
            AgentTraceStep(
                id=_tid(),
                agent="competitor_instagram_analyst",
                phase="research",
                title="Competitor Instagram benchmarking",
                summary=competitor_analysis.get("reasoning_summary"),
                reasoning=" ".join(reasoning_parts),
                sources=research_sources[:20],
                web_queries=web_queries,
                raw_text_excerpt=research_excerpt or None,
                structured={
                    "competitors": competitor_analysis.get("competitor_profiles"),
                    "gap_opportunities": competitor_analysis.get("gap_opportunities"),
                    "benchmarks": competitor_analysis.get("industry_engagement_benchmarks"),
                    "handles_resolved": [m.get("instagram_handle") for m in competitors_meta],
                },
            ).model_dump()
        ],
        **_usage_events(*usage_ci),
    }


async def _youtube_agent(state: CampaignState, settings: Settings) -> dict[str, Any]:
    """Fetch + NLP-analyse YouTube videos for this brand (zero-LLM, pure data)."""
    r = _req(state)
    api_key = settings.youtube_api_key
    if not api_key:
        return {
            "trace": [AgentTraceStep(
                id=_tid(), agent="youtube_intelligence", phase="research",
                title="YouTube research skipped",
                summary="YOUTUBE_API_KEY not configured.",
            ).model_dump()],
            "youtube_data": {},
        }

    _emit_live(state, _act(
        phase="research", agent="youtube_intelligence", action="web_search",
        detail=f"Querying YouTube for '{r.brand_name}' content patterns & trends",
        tool="youtube_data_api_v3",
    ))

    try:
        data = await asyncio.to_thread(
            __import__("app.services.youtube_service", fromlist=["run_youtube_intelligence"])
            .run_youtube_intelligence,
            api_key,
            r.brand_name,
            r.industry_hint,
            r.geography_primary,
            r.geography_secondary,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "trace": [AgentTraceStep(
                id=_tid(), agent="youtube_intelligence", phase="research",
                title="YouTube research failed",
                summary=str(exc),
                reasoning="Check YOUTUBE_API_KEY and quota limits.",
            ).model_dump()],
            "youtube_data": {"error": str(exc)},
        }

    _emit_live(state, _act(
        phase="research", agent="youtube_intelligence", action="analyzing",
        detail=(
            f"NLP complete: {data.get('total_videos', 0)} videos · "
            f"top terms: {', '.join((data.get('tfidf_top_terms') or [])[:5])} · "
            f"dominant format: {data.get('dominant_format', 'unknown')}"
        ),
        tool="youtube_nlp_pipeline",
    ))

    return {
        "trace": [AgentTraceStep(
            id=_tid(),
            agent="youtube_intelligence",
            phase="research",
            title=f"YouTube intelligence — {data.get('total_videos', 0)} videos analysed",
            summary=data.get("reasoning_summary"),
            reasoning=(
                "NLP pipeline: TF-IDF · engagement-weighted n-grams · format detection · "
                "sentiment scoring · channel bucketing · publish-time analysis · "
                "keyword co-occurrence — all zero-LLM, deterministic."
            ),
            web_queries=data.get("queries") or [],
            structured={
                "tfidf_top_terms":   data.get("tfidf_top_terms", [])[:10],
                "top_bigrams":       data.get("top_bigrams", [])[:5],
                "format_dist":       data.get("format_distribution"),
                "dominant_format":   data.get("dominant_format"),
                "sentiment":         data.get("sentiment_distribution"),
                "timing_best_days":  [["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d]
                                      for d in data.get("timing", {}).get("best_days", [])],
                "timing_best_hours": [f"{h:02d}:00" for h in data.get("timing", {}).get("best_hours", [])],
                "top_videos":        data.get("top_videos", [])[:3],
            },
        ).model_dump()],
        "youtube_data": data,
    }


async def _google_trends_agent(state: CampaignState) -> dict[str, Any]:
    """
    Pull Google Trends data via PyTrends:
    interest classification, rising queries, related topics, competitor comparison,
    today's trending searches, and keyword suggestions.
    All zero-LLM — purely deterministic signal extraction.
    """
    r = _req(state)

    _emit_live(state, _act(
        phase="research", agent="google_trends_intelligence", action="web_search",
        detail=f"Fetching Google Trends interest signals for '{r.brand_name}' ({r.geography_primary})",
        tool="pytrends",
    ))

    # Gather competitor names from competitor_research if already available
    comp_research = state.get("competitor_research") or {}
    comp_structured = comp_research.get("structured") or {}
    comp_names: list[str] = []
    for c in (comp_structured.get("competitors") or [])[:4]:
        cname = c.get("name") or c.get("brand") or ""
        if cname:
            comp_names.append(cname)

    try:
        from app.services.google_trends_service import run_google_trends_intelligence
        data = await asyncio.to_thread(
            run_google_trends_intelligence,
            r.brand_name,
            r.industry_hint,
            r.geography_primary,
            r.geography_secondary,
            comp_names or None,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "trace": [AgentTraceStep(
                id=_tid(), agent="google_trends_intelligence", phase="research",
                title="Google Trends research failed",
                summary=str(exc),
                reasoning="Install pytrends: pip install pytrends pandas",
            ).model_dump()],
            "google_trends_data": {"error": str(exc)},
        }

    bd = data.get("brand_analysis") or {}
    rising_qs = [q.get("query", "") for q in (bd.get("rising_related_queries") or [])[:5]]

    _emit_live(state, _act(
        phase="research", agent="google_trends_intelligence", action="analyzing",
        detail=(
            f"Trends: {bd.get('classification', 'unknown')} "
            f"(5yr mean={bd.get('mean_interest_5yr', 0)}, YoY={bd.get('yoy_pct_change', 0):+.1f}%). "
            + (f"Rising: {', '.join(rising_qs)}" if rising_qs else "No rising queries detected.")
        ),
        tool="pytrends_nlp",
    ))

    return {
        "trace": [AgentTraceStep(
            id=_tid(),
            agent="google_trends_intelligence",
            phase="research",
            title=f"Google Trends — '{r.brand_name}' is {bd.get('classification', 'analysed')}",
            summary=data.get("reasoning_summary"),
            reasoning=(
                "Multi-timeframe interest scoring (5yr/12m) → YoY momentum → "
                "automated trend classification (stable/rising/declining/seasonal/cyclical) → "
                "rising related queries → rising topics → competitor interest comparison → "
                "real-time trending searches → keyword suggestions. All deterministic via PyTrends."
            ),
            web_queries=[f"pytrends:{r.brand_name}", f"pytrends:{r.industry_hint or 'industry'}"],
            structured={
                "classification":         bd.get("classification"),
                "mean_interest_5yr":      bd.get("mean_interest_5yr"),
                "mean_interest_12m":      bd.get("mean_interest_12m"),
                "yoy_pct_change":         bd.get("yoy_pct_change"),
                "peak_months":            bd.get("peak_months"),
                "rising_related_queries": bd.get("rising_related_queries", [])[:6],
                "top_related_queries":    bd.get("top_related_queries", [])[:6],
                "rising_related_topics":  bd.get("rising_related_topics", [])[:5],
                "competitor_comparison":  data.get("competitor_comparison", []),
                "trending_today":         (data.get("trending_today") or [])[:10],
                "keyword_suggestions":    data.get("keyword_suggestions", []),
            },
        ).model_dump()],
        "google_trends_data": data,
    }


async def node_parallel_research(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    c, s, t, b_ig, comp_ig, yt, gt = await asyncio.gather(
        _competitor_agent(state, client, settings),
        _social_agent(state, client, settings),
        _trends_agent(state, client, settings),
        _brand_instagram_agent(state, client, settings),
        _competitor_instagram_agent(state, client, settings),
        _youtube_agent(state, settings),
        _google_trends_agent(state),
    )
    trace = (
        c["trace"] + s["trace"] + t["trace"]
        + b_ig["trace"] + comp_ig["trace"] + yt["trace"] + gt["trace"]
    )
    tok_merge: list[dict[str, Any]] = []
    for part in (c, s, t, b_ig, comp_ig, yt, gt):
        tok_merge.extend(part.get("token_usage_events") or [])
    out: dict[str, Any] = {
        "trace": trace,
        "competitor_research": c["packet"],
        "social_research": s["packet"],
        "trends_research": t["packet"],
        "reddit_snapshot": s.get("reddit", {}),
        "brand_instagram_analysis": b_ig.get("instagram_data", {}),
        "competitor_instagram_analysis": comp_ig.get("competitor_instagram", {}),
        "youtube_research": yt.get("youtube_data", {}),
        "google_trends_research": gt.get("google_trends_data", {}),
    }
    if tok_merge:
        out["token_usage_events"] = tok_merge
    return out


def _research_digest(state: CampaignState) -> str:
    parts: list[str] = []
    for key in ("competitor_research", "social_research", "trends_research"):
        blob = state.get(key) or {}
        parts.append(f"## {key}\n" + (blob.get("narrative") or "")[:5000])
        parts.append("Structured JSON:\n" + str(blob.get("structured"))[:4000])

    # Brand Instagram
    b_ig = state.get("brand_instagram_analysis") or {}
    if b_ig and not b_ig.get("fetch_error"):
        parts.append(
            "## Brand Instagram Analysis\n"
            f"Handle: @{b_ig.get('handle', 'n/a')}  |  "
            f"Followers: {b_ig.get('profile', {}).get('followers', 'n/a')}  |  "
            f"Avg likes: {b_ig.get('average_likes', 'n/a')}\n"
            f"Comments analysed: {b_ig.get('comments_analysed', 0)}\n"
            "Sentiment: " + json.dumps(b_ig.get("sentiment", {}), default=str)[:2000] + "\n"
            "Post strategy summary: " + json.dumps(b_ig.get("post_strategy_summary", {}), default=str)[:2000]
        )

    # Competitor Instagram
    comp_ig = state.get("competitor_instagram_analysis") or {}
    if comp_ig:
        parts.append(
            "## Competitor Instagram Analysis\n"
            + json.dumps(comp_ig.get("analysis", {}), default=str)[:4000]
        )

    # Google Trends intelligence
    gt = state.get("google_trends_research") or {}
    if gt and not gt.get("error"):
        bd = gt.get("brand_analysis") or {}
        ind = gt.get("industry_analysis") or {}
        rising_qs = [q.get("query", "") for q in (bd.get("rising_related_queries") or [])[:8]]
        rising_ts = [t.get("topic", "") for t in (bd.get("rising_related_topics") or [])[:5]]
        trending  = (gt.get("trending_today") or [])[:8]
        parts.append(
            "## Google Trends Intelligence\n"
            f"Brand classification: {bd.get('classification', 'unknown')} "
            f"(5yr mean={bd.get('mean_interest_5yr', 0)}, 12m mean={bd.get('mean_interest_12m', 0)}, "
            f"YoY={bd.get('yoy_pct_change', 0):+.1f}%)\n"
            + (f"Peak interest months: {', '.join(bd.get('peak_months') or [])}\n" if bd.get("peak_months") else "")
            + (f"Rising related queries: {', '.join(rising_qs)}\n" if rising_qs else "")
            + (f"Rising related topics: {', '.join(rising_ts)}\n" if rising_ts else "")
            + (f"Keyword suggestions: {', '.join(gt.get('keyword_suggestions') or [])}\n" if gt.get("keyword_suggestions") else "")
            + (f"Today's trending searches (same geo): {', '.join(trending)}\n" if trending else "")
            + (f"Industry '{ind.get('keyword', '')}': {ind.get('classification', '')} "
               f"(YoY={ind.get('yoy_pct_change', 0):+.1f}%)\n" if ind else "")
            + (f"Competitor comparison: {json.dumps(gt.get('competitor_comparison', []))[:1000]}\n"
               if gt.get("competitor_comparison") else "")
        )

    # YouTube NLP intelligence
    yt = state.get("youtube_research") or {}
    if yt and not yt.get("error") and yt.get("total_videos", 0) > 0:
        timing_days  = [["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d]
                        for d in (yt.get("timing") or {}).get("best_days", [])]
        timing_hours = [f"{h:02d}:00" for h in (yt.get("timing") or {}).get("best_hours", [])]
        parts.append(
            "## YouTube Intelligence\n"
            f"Videos analysed: {yt.get('total_videos', 0)}\n"
            f"Top TF-IDF terms: {', '.join((yt.get('tfidf_top_terms') or [])[:12])}\n"
            f"Top bigrams: {json.dumps((yt.get('top_bigrams') or [])[:6], default=str)}\n"
            f"Dominant format: {yt.get('dominant_format', 'unknown')}\n"
            f"Format distribution: {json.dumps(yt.get('format_distribution', {}))}\n"
            f"Sentiment: {json.dumps(yt.get('sentiment_distribution', {}))}\n"
            f"Best publish days: {timing_days}   hours: {timing_hours}\n"
            f"Top co-occurrence pairs: {json.dumps((yt.get('cooccurrence') or [])[:6], default=str)}\n"
            f"Summary: {yt.get('reasoning_summary', '')}"
        )

    return "\n\n".join(parts)


async def node_seo_website_optimizer(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """Live web research + structured website SEO plan grounded in brand URL and business context."""
    r = _req(state)
    ctx = build_node_context(state)
    digest = _research_digest(state)[:12_000]
    markets = ", ".join(_effective_geographies(r))
    industry = r.industry_hint or "general consumer"

    _emit_live(
        state,
        _act(
            phase="seo_website",
            agent="seo_website_strategist",
            action="web_search",
            detail=f"Indexing current SEO guidance for {r.brand_name} ({industry}) — {markets}",
            tool="web_search",
        ),
    )

    research_instructions = (
        "You are a principal technical and content SEO strategist with live web access. "
        "Search authoritative, current sources (search engine documentation, reputable SEO references) "
        "for guidance that applies to this company's industry, site type, and target geographies. "
        "Cover on-page signals, technical/crawl health, structured data where relevant, content & trust (E-E-A-T), "
        "internal linking and topic clusters, local or multi-market SEO if applicable, and practical measurement. "
        "Be specific to this business—not a generic checklist. Note provenance in your synthesis."
    )
    research_prompt = (
        f"Brand: {r.brand_name}\nIndustry: {industry}\nMarkets: {markets}\n"
        f"Site URL: {r.brand_url or 'not provided'}\n\n"
        "Deliver: (1) niche-relevant priorities for the next 90 days, (2) mistakes this category often makes, "
        "(3) quick wins vs deeper initiatives, (4) multi-market/local nuances if relevant."
    )
    try:
        pkt, u_seo_resp = await run_responses_web_research(
            client=client,
            settings=settings,
            instructions=research_instructions,
            user_input=(
                research_prompt
                + "\n\nBrand/site context:\n"
                + ctx[:5000]
                + "\n\nInternal research digest (grounding):\n"
                + digest[:8000]
            ),
            phase="seo_website",
        )
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:800]
        return {
            **_trace_step(
                agent="seo_website_strategist",
                phase="seo_website",
                title="Website SEO optimization (degraded)",
                summary="Web research unavailable; structured audit skipped.",
                reasoning=err,
            ),
            "seo_website_optimization": {
                "error": err,
                "executive_summary": "SEO web research step failed; re-run when the search tool is available.",
            },
        }

    research_sources = [
        SourceRef(url=str(s.get("url", "")), title=s.get("title"))
        for s in (pkt.sources or [])[:25]
        if s.get("url")
    ]
    schema = (
        "Return JSON only. Keys:\n"
        "executive_summary (string, client-ready 2–4 sentences),\n"
        "site_diagnosis (object with keys current_signals, gaps, priority_hypothesis — strings or arrays of strings),\n"
        "technical_seo (array of objects: action, priority as high|medium|low, reasoning, how_to_verify),\n"
        "on_page_seo (array of objects: page_or_section, recommendation, reasoning, suggested_title_or_meta_hint optional),\n"
        "content_and_topics (array of objects: cluster_or_topic, rationale, intent, suggested_outline optional),\n"
        "authority_and_links (array of objects: tactic, reasoning),\n"
        "local_or_multimarket (array of objects: recommendation, reasoning — use [] if not applicable),\n"
        "measurement (object: kpis array of strings, baseline_checks array of strings),\n"
        "reasoning_summary (string — how web findings map to this brand),\n"
        "risk_notes (array of strings — practices to avoid)."
    )
    structured, u_seo_chat = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=schema,
        user=(
            "Primary evidence — live web research synthesis (ground major recommendations here):\n"
            + (pkt.text or "")[:10_000]
            + "\n\nBrand and site context:\n"
            + ctx[:6000]
        ),
        temperature=0.2,
        phase="seo_website",
    )
    structured["web_research_queries_used"] = list(pkt.web_queries or [])
    n_tech = len(structured.get("technical_seo") or [])

    return {
        **_activities(
            _act(
                phase="seo_website",
                agent="seo_website_strategist",
                action="llm_call",
                detail=f"Prioritized {n_tech} technical SEO actions + on-page plan for {r.brand_name}",
                tool=settings.openai_model,
            ),
        ),
        **_trace_step(
            agent="seo_website_strategist",
            phase="seo_website",
            title="Website SEO optimization plan",
            summary=structured.get("executive_summary"),
            reasoning=structured.get("reasoning_summary") or (pkt.text[:2500] if pkt.text else None),
            sources=research_sources,
            web_queries=list(pkt.web_queries or []),
            tool_calls=[
                ToolInvocation(
                    name="web_search",
                    args={"queries": list(pkt.web_queries or [])[:12]},
                    result_summary=f"Synthesis {len(pkt.text or '')} chars; {len(research_sources)} sources",
                ),
            ],
            structured=structured,
            raw_text_excerpt=(
                (pkt.text[:2000] + "…") if pkt.text and len(pkt.text) > 2000 else pkt.text
            ),
        ),
        "seo_website_optimization": structured,
        **_usage_events(u_seo_resp, u_seo_chat),
    }


async def node_strategy(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    ctx = build_node_context(state)
    digest = _research_digest(state)
    system = (
        "You are a principal strategist. Produce JSON only. Keys: "
        "executive_summary, positioning (object with value_prop, category_frame, proof_points), "
        "audience (object with segments, jobs_to_be_done, objections), "
        "messaging_pillars (array), channel_plan (array of {channel, objective, cadence, KPI}), "
        "timeline_phases (array of {name, focus, duration_days}), "
        "measurement (object), reasoning_trace (array of {decision, because})."
    )
    user = ctx + "\n\nGrounding research digest:\n" + digest[:12_000]
    seo_w = state.get("seo_website_optimization") or {}
    if seo_w and isinstance(seo_w, dict) and not seo_w.get("error"):
        user += (
            "\n\nWebsite SEO findings (from live web research + brand context — align SEO/channel priorities):\n"
            + str(seo_w)[:4000]
        )
    _emit_live(state, _act(phase="strategy", agent="campaign_strategy_architect", action="llm_call",
                           detail=f"Building go-to-market strategy for {r.brand_name}", tool=settings.openai_model))
    structured, u_strat = await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=system,
        user=user,
        temperature=0.35,
        phase="strategy",
    )
    return {
        **_activities(
            _act(phase="strategy", agent="campaign_strategy_architect", action="analyzing",
                 detail=f"Strategy complete: {len(structured.get('messaging_pillars', []))} messaging pillars, "
                        f"{len(structured.get('channel_plan', []))} channels planned"),
        ),
        **_trace_step(
            agent="campaign_strategy_architect",
            phase="strategy",
            title="Integrated go-to-market architecture",
            summary=structured.get("executive_summary"),
            reasoning="Every pillar references the prior cited research digest to avoid generic plans.",
            structured=structured,
        ),
        "strategy": structured,
        **_usage_events(u_strat),
    }


async def _creative_json(
    *,
    client: AsyncOpenAI,
    settings: Settings,
    role: str,
    system_schema: str,
    user_blob: str,
    phase: str = "creative",
) -> tuple[dict[str, Any], dict[str, Any]]:
    return await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=role + " " + system_schema,
        user=user_blob[:16_000],
        temperature=0.55,
        phase=phase,
    )


def _instagram_creative_context(state: CampaignState) -> str:
    """
    Build a focused Instagram context block for creative prompts.
    Explains WHAT the brand's own account does well, what competitors do,
    and what the audience actually says in comments.
    """
    parts: list[str] = []

    b_ig = state.get("brand_instagram_analysis") or {}
    if b_ig and b_ig.get("post_strategy_summary"):
        ps = b_ig["post_strategy_summary"]
        sentiment = b_ig.get("sentiment") or {}
        parts.append(
            "=== BRAND INSTAGRAM INTELLIGENCE ===\n"
            f"Handle: @{b_ig.get('handle', 'n/a')}  "
            f"Followers: {b_ig.get('profile', {}).get('followers', 'n/a')}  "
            f"Avg likes: {b_ig.get('average_likes', 'n/a')}\n"
            f"Top performing formats: {ps.get('top_performing_formats', [])}\n"
            f"Visual style: {ps.get('visual_style_notes', '')}\n"
            f"Caption patterns: {ps.get('caption_patterns', [])}\n"
            f"Strategic recs from own feed: {ps.get('strategic_recommendations', [])}\n\n"
            "AUDIENCE COMMENT SENTIMENT:\n"
            f"  Overall: {sentiment.get('overall_sentiment', 'n/a')} "
            f"(score: {sentiment.get('sentiment_score', 'n/a')})\n"
            f"  Praised for: {sentiment.get('top_praised_aspects', [])}\n"
            f"  Complaints: {sentiment.get('top_complaints', [])}\n"
            f"  Audience language / slang: {sentiment.get('audience_language_patterns', [])}\n"
            f"  Emotional tone: {sentiment.get('emotional_tone', 'n/a')}\n"
            f"  Stats: {sentiment.get('statistics', {})}"
        )

    comp_ig = (state.get("competitor_instagram_analysis") or {}).get("analysis") or {}
    if comp_ig:
        parts.append(
            "=== COMPETITOR INSTAGRAM INTELLIGENCE ===\n"
            f"Winning tactics competitors use: {comp_ig.get('winning_tactics', [])}\n"
            f"Gap opportunities (angles competitors miss): {comp_ig.get('gap_opportunities', [])}\n"
            f"Industry engagement benchmarks: {comp_ig.get('industry_engagement_benchmarks', {})}\n"
            f"Hashtag patterns: {comp_ig.get('hashtag_patterns', [])}"
        )

    if not parts:
        return ""
    return "\n\n".join(parts)


async def node_creative_suite(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    _emit_live(
        state,
        _act(
            phase="creative",
            agent="creative_suite_orchestrator",
            action="analyzing",
            detail=f"Running 4 parallel specialists (SEO, social, video, WhatsApp) for {r.brand_name}",
        ),
    )
    base = build_node_context(state) + "\n\nStrategy JSON:\n" + str(state.get("strategy"))[:10_000]
    digest = _research_digest(state)[:8000]
    ig_ctx = _instagram_creative_context(state)
    seg = state.get("audience_segments") or {}
    mem = state.get("memory_resolution") or {}
    seg_blob = ("\n\nAUDIENCE SEGMENTS (produce one tailored variant per segment):\n" + str(seg)[:6000]) if seg else ""
    mem_blob = (
        "\n\nCROSS-AGENT MEMORY — RESOLVED GUARDRAILS (apply strictly; cite in reasoning_summary):\n" + str(mem)[:4000]
    ) if mem else ""

    ig_instruction = (
        "\n\nINSTAGRAM INTELLIGENCE (use this to inform creative decisions and cite it in reasoning_summary):\n"
        + ig_ctx
    ) if ig_ctx else ""

    seo_w = state.get("seo_website_optimization") or {}
    seo_audit_blob = (
        "\n\nWEBSITE SEO AUDIT (from dedicated web-research agent — keep keyword and meta recommendations consistent):\n"
        + str(seo_w)[:8000]
        if (isinstance(seo_w, dict) and seo_w and not seo_w.get("error"))
        else ""
    )

    seo_task = _creative_json(
        client=client,
        settings=settings,
        role="You are an SEO & editorial lead.",
        system_schema=(
            "Return JSON: pillar_topics (array), cluster_map, target_keywords (array of {keyword, intent, page_type}), "
            "blog_outline (array of sections), meta_templates, internal_linking_plan, reasoning_summary."
        ),
        user_blob=base + seo_audit_blob + "\nResearch:\n" + digest + seg_blob + mem_blob + ig_instruction,
    )
    social_task = _creative_json(
        client=client,
        settings=settings,
        role=(
            "You are a social creative director with deep Instagram expertise. "
            "When writing Instagram content, explicitly apply the brand's own posting patterns and "
            "audience language from the Instagram intelligence section. "
            "Call out in reasoning_summary: (a) which caption patterns you used, "
            "(b) which competitor gap you are exploiting, "
            "(c) how audience sentiment shaped the tone, "
            "(d) how each segment variant differs."
        ),
        system_schema=(
            "Return JSON: linkedin (array of posts with hook, body, cta), "
            "instagram (array of {idea, caption, hashtags, format, visual_direction, reasoning — "
            "  reasoning must cite brand Instagram data and competitor gaps}), "
            "reels_short_form (array of {hook, beat_sheet, on_screen_text}), "
            "twitter (array of {text, hashtags}), "
            "email_broadcasts (array of {subject, preheader, body}), "
            "push_notifications (array of {title, body, trigger_context}), "
            "segment_variants (array of {segment_name, linkedin, instagram, twitter, reels_short_form, "
            "  hook_angle, tone_notes} — one entry per audience segment from the brief; tailor hooks and tone), "
            "reasoning_summary (must reference Instagram sentiment, competitor gaps, segments, and memory guardrails)."
        ),
        user_blob=base + "\nResearch:\n" + digest + seg_blob + mem_blob + ig_instruction,
    )
    video_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a film-first storyteller.",
        system_schema=(
            "Return JSON: hero_spot (object with logline, scenes), product_demo_variants (array), "
            "ugc_briefs (array), production_notes, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest + seg_blob + mem_blob + ig_instruction,
    )
    msg_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a lifecycle & WhatsApp campaign designer.",
        system_schema=(
            "Return JSON: whatsapp_sequences (array of {name, messages:[{text, timing, cta}]}), "
            "sms_companion (array), compliance_notes, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest + seg_blob + mem_blob + ig_instruction,
    )
    r_seo, r_so, r_vi, r_ms = await asyncio.gather(seo_task, social_task, video_task, msg_task)
    seo, u_cseo = r_seo
    social, u_csoc = r_so
    video, u_cvid = r_vi
    msg, u_cmsg = r_ms
    bundle = {"seo": seo, "social": social, "video_concepts": video, "messaging_whatsapp": msg}

    b_ig = state.get("brand_instagram_analysis") or {}
    comp_ig = (state.get("competitor_instagram_analysis") or {}).get("analysis") or {}
    return {
        **_trace_step(
            agent="creative_suite_orchestrator",
            phase="creative",
            title="Parallel channel copy generation",
            summary="SEO, social, video beats, and WhatsApp flows generated with shared strategy context.",
            reasoning=(
                "Runs four specialists concurrently after research-backed strategy. "
                + (
                    f"Brand Instagram (@{b_ig.get('handle')}) sentiment: "
                    f"{(b_ig.get('sentiment') or {}).get('overall_sentiment', 'n/a')} — "
                    f"audience praised: {(b_ig.get('sentiment') or {}).get('top_praised_aspects', [])}. "
                    f"Competitor gaps exploited: {comp_ig.get('gap_opportunities', [])}. "
                    "Instagram intelligence shaped caption style, visual direction, and hashtag strategy."
                    if b_ig.get("handle") else
                    "No Instagram handle provided; creative strategy based on web research and strategy alone."
                )
            ),
            structured={"channels": list(bundle.keys())},
        ),
        "creatives": bundle,
        **_usage_events(u_cseo, u_csoc, u_cvid, u_cmsg),
    }


async def node_critic(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    _emit_live(
        state,
        _act(
            phase="critic",
            agent="creative_director_critic",
            action="analyzing",
            detail=f"QA scoring creatives vs strategy for {r.brand_name}",
            tool="gpt-structured",
        ),
    )
    critique_raw, u_crit = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are a skeptical creative director + brand lawyer lite. "
            "Score the creative bundle for consistency with strategy, research, and brand safety. "
            "Return a single JSON object with exactly these top-level keys: "
            "scores (object with REQUIRED keys seo, social, video_concepts, messaging_whatsapp — each an integer 0-100), "
            "issues (array of {channel, severity: low|medium|high, fix}), "
            "revision_directives (array of short strings), "
            "final_verdict (one paragraph). "
            "Do not omit any of the four score keys; use nested objects only inside each channel's creative payload when reasoning, "
            "not inside scores."
        ),
        user=(
            build_node_context(state)
            + "\nStrategy:\n"
            + str(state.get("strategy"))[:5000]
            + "\nCreatives:\n"
            + str(state.get("creatives"))[:8000]
        ),
        temperature=0.25,
        phase="critic",
    )
    critique = _enrich_critique(critique_raw, settings)
    return {
        **_trace_step(
            agent="creative_director_critic",
            phase="critic",
            title="Cross-channel QA & critique",
            summary=critique.get("final_verdict"),
            reasoning=(
                "Explicit scoring makes trade-offs visible for client governance. "
                f"Blended QA confidence: {critique.get('qa_metadata', {}).get('blended_confidence', 'n/a')}/100 "
                f"(rubric coverage × outcome vs thresholds)."
            ),
            structured=critique,
        ),
        "critique": critique,
        **_usage_events(u_crit),
    }


async def node_refine(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Refinement loop: first pass uses initial critic + creatives; later passes use recheck critique + prior refined."""
    rr = int(state.get("refine_round") or 0)
    if rr == 0:
        critique = state.get("critique") or {}
        base = state.get("creatives") or {}
        detail = "Applying critic directives — revising SEO, social, video, and WhatsApp bundles"
    else:
        critique = state.get("critique_post_refine") or state.get("critique") or {}
        base = state.get("refined_creatives") or state.get("creatives") or {}
        detail = f"Refinement round {rr + 1} — applying post-recheck directives"
    _emit_live(
        state,
        _act(
            phase="refine",
            agent="refinement_specialist",
            action="llm_call",
            detail=detail,
            tool="gpt-structured",
        ),
    )
    refined_raw, u_ref = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are a senior copywriter. Revise the campaign creatives using the critic directives. "
            "Return JSON with REQUIRED top-level keys: seo, social, video_concepts, messaging_whatsapp — each fully revised object "
            "(same general shape as the input channel). "
            "Preserve segment_variants inside social when present; update them for consistency. "
            "Also include before_after_highlights (array of {channel, issue, original_snippet, revised_snippet}). "
            "Do not rename keys; do not move channel payloads under a nested wrapper."
        ),
        user=(
            "Critique:\n" + str(critique)[:5000]
            + "\nBase creatives to revise:\n" + str(base)[:8000]
        ),
        temperature=0.4,
        phase="refine",
    )
    refined = _normalize_refined_creatives(refined_raw, base)
    n_highlights = len(refined.get("before_after_highlights") or []) if isinstance(refined.get("before_after_highlights"), list) else 0
    return {
        **_trace_step(
            agent="refinement_specialist",
            phase="refine",
            title="Critic-driven refinement loop",
            summary=f"Revised bundle ({n_highlights} before/after highlights); channels merged with base if any key was dropped.",
            reasoning="Addresses critic directives; missing channel keys are backfilled from the pre-refine bundle for downstream QA.",
            structured={"channels": list(_CREATIVE_BUNDLE_KEYS), "highlights": n_highlights},
        ),
        "refined_creatives": refined,
        "refine_round": rr + 1,
        **_usage_events(u_ref),
    }


async def node_critic_recheck(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Second QA pass on refined creatives (after refinement loop iteration)."""
    r = _req(state)
    refined_raw = state.get("refined_creatives") or {}
    base = state.get("creatives") or {}
    refined = _normalize_refined_creatives(refined_raw, base)
    if not _bundle_has_any_channel(refined):
        refined = base
    if not _bundle_has_any_channel(refined):
        return {
            **_trace_step(
                agent="creative_director_critic_recheck",
                phase="critic_recheck",
                title="Post-refinement QA recheck skipped",
                summary="No creative bundle available to score after refinement.",
                reasoning="Refine output was empty and no base creatives were present.",
            ),
            "critique_post_refine": _enrich_critique(
                {
                    "scores": {k: 0 for k in _CREATIVE_BUNDLE_KEYS},
                    "issues": [{"channel": "all", "severity": "high", "fix": "Regenerate creatives — bundle missing after refine."}],
                    "revision_directives": [],
                    "final_verdict": "Recheck skipped: empty bundle.",
                },
                settings,
            ),
        }
    _emit_live(
        state,
        _act(
            phase="critic_recheck",
            agent="creative_director_critic_recheck",
            action="analyzing",
            detail=f"Re-scoring refined creatives for {r.brand_name}",
            tool="gpt-structured",
        ),
    )
    critique2_raw, u_crec = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are a skeptical creative director + brand lawyer lite. "
            "Score the REFINED creative JSON for consistency with strategy and research. "
            "Return a single JSON object with exactly these top-level keys: "
            "scores (object with REQUIRED keys seo, social, video_concepts, messaging_whatsapp — each integer 0-100), "
            "issues (array of {channel, severity: low|medium|high, fix}), "
            "revision_directives (array of short strings), "
            "final_verdict (one paragraph)."
        ),
        user=(
            build_node_context(state)
            + "\nStrategy:\n"
            + str(state.get("strategy"))[:5000]
            + "\nRefined creatives:\n"
            + str(refined)[:8000]
        ),
        temperature=0.25,
        phase="critic_recheck",
    )
    critique2 = _enrich_critique(critique2_raw, settings)
    return {
        **_trace_step(
            agent="creative_director_critic_recheck",
            phase="critic_recheck",
            title="Post-refinement QA recheck",
            summary=critique2.get("final_verdict"),
            reasoning=(
                "Validates refined copy before localization and scheduling. "
                f"Blended QA confidence: {critique2.get('qa_metadata', {}).get('blended_confidence', 'n/a')}/100."
            ),
            structured=critique2,
        ),
        "critique_post_refine": critique2,
        **_usage_events(u_crec),
    }


def _audience_grounding_evidence(state: CampaignState) -> str:
    """Real signals already in graph state — Reddit, research packets, IG — not just the LLM inventing personas."""
    parts: list[str] = []
    max_chars = 4500

    reddit = state.get("reddit_snapshot") or {}
    if isinstance(reddit, dict) and reddit:
        parts.append("=== REDDIT (community language, subreddits) ===")
        parts.append(f"Query: {reddit.get('query', '')}")
        if reddit.get("error"):
            parts.append(f"(fetch note: {reddit['error']})")
        for p in (reddit.get("posts") or [])[:6]:
            if not isinstance(p, dict):
                continue
            title = (p.get("title") or "")[:200]
            sub = p.get("subreddit") or ""
            st = (p.get("selftext") or "")[:400]
            parts.append(f"- r/{sub}: {title}")
            if st.strip():
                parts.append(f"  {st}")

    soc_pkt = state.get("social_research") or {}
    if isinstance(soc_pkt, dict):
        nar = (soc_pkt.get("narrative") or "")[:2200]
        soc_st = soc_pkt.get("structured") if isinstance(soc_pkt.get("structured"), dict) else {}
        if nar.strip() or soc_st:
            parts.append("\n=== SOCIAL / WEB LISTENING ===")
            if nar.strip():
                parts.append(nar)
            rs = soc_st.get("reasoning_summary")
            if rs:
                parts.append(f"Structured summary: {rs}")

    comp_pkt = state.get("competitor_research") or {}
    comp_st = comp_pkt.get("structured") if isinstance(comp_pkt.get("structured"), dict) else {}
    if comp_st:
        ws = comp_st.get("white_space_opportunities") or []
        risks = comp_st.get("risks") or []
        if ws or risks:
            parts.append("\n=== COMPETITIVE (from research JSON) ===")
            if ws:
                parts.append("White space: " + "; ".join(str(x) for x in ws[:6]))
            if risks:
                parts.append("Risks: " + "; ".join(str(x) for x in risks[:6]))

    trends_pkt = state.get("trends_research") or {}
    if isinstance(trends_pkt, dict):
        tn = (trends_pkt.get("narrative") or "")[:1400]
        if tn.strip():
            parts.append("\n=== MARKET TRENDS (excerpt) ===\n" + tn)

    b_ig = state.get("brand_instagram_analysis") or {}
    if isinstance(b_ig, dict) and b_ig.get("handle"):
        sent = b_ig.get("sentiment") or {}
        praised = sent.get("top_praised_aspects") or sent.get("positive_themes") or []
        complaints = sent.get("top_complaints") or []
        lang = sent.get("audience_language_patterns") or []
        parts.append("\n=== BRAND INSTAGRAM COMMENT SIGNALS ===")
        if praised:
            parts.append("Praised: " + "; ".join(str(x) for x in praised[:6]))
        if complaints:
            parts.append("Complaints: " + "; ".join(str(x) for x in complaints[:5]))
        if lang:
            parts.append("Language patterns: " + "; ".join(str(x) for x in lang[:6]))

    # Google Trends — rising queries reveal what audiences actively search for
    gt = state.get("google_trends_research") or {}
    if isinstance(gt, dict) and not gt.get("error"):
        bd = gt.get("brand_analysis") or {}
        rising_qs = [q.get("query", "") for q in (bd.get("rising_related_queries") or [])[:6]]
        rising_ts = [t.get("topic", "") for t in (bd.get("rising_related_topics") or [])[:5]]
        trending  = (gt.get("trending_today") or [])[:6]
        kw_sugg   = (gt.get("keyword_suggestions") or [])[:8]
        parts.append("\n=== GOOGLE TRENDS AUDIENCE SIGNALS ===")
        parts.append(f"Brand interest classification: {bd.get('classification', 'unknown')} "
                     f"(YoY={bd.get('yoy_pct_change', 0):+.1f}%, peak months={bd.get('peak_months')})")
        if rising_qs:
            parts.append("Rising searches (real audience intent): " + " · ".join(rising_qs))
        if rising_ts:
            parts.append("Rising adjacent topics: " + " · ".join(rising_ts))
        if trending:
            parts.append("Today's trending searches (same geo): " + " · ".join(trending))
        if kw_sugg:
            parts.append("Google autocomplete suggestions: " + " · ".join(kw_sugg))

    yt = state.get("youtube_research") or {}
    if isinstance(yt, dict) and yt.get("total_videos", 0) > 0 and not yt.get("error"):
        tfidf_terms = (yt.get("tfidf_top_terms") or [])[:10]
        bigrams     = [b.get("ngram", "") for b in (yt.get("top_bigrams") or [])[:6]]
        sentiment   = yt.get("sentiment_distribution") or {}
        dom_format  = yt.get("dominant_format") or "unknown"
        parts.append("\n=== YOUTUBE VIDEO INTELLIGENCE ===")
        if tfidf_terms:
            parts.append("Trending terms in video titles: " + ", ".join(tfidf_terms))
        if bigrams:
            parts.append("Top title phrases: " + " · ".join(bigrams))
        if dom_format:
            parts.append(f"Dominant video format: {dom_format}")
        parts.append(f"Video title sentiment: {json.dumps(sentiment)}")

    blob = "\n".join(parts)
    if len(blob) > max_chars:
        return blob[:max_chars] + "\n…"
    return blob


async def node_audience_segments(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Audience segments: LLM synthesis grounded in Reddit, research packets, and Instagram when available."""
    _emit_live(
        state,
        _act(
            phase="audience",
            agent="audience_segmentation",
            action="llm_call",
            detail="Grounding 2–3 segments in Reddit + research + Instagram signals (not brief-only)",
        ),
    )
    grounding = _audience_grounding_evidence(state)
    user_blob = (
        build_node_context(state)
        + "\nStrategy:\n"
        + str(state.get("strategy"))[:6000]
    )
    if grounding.strip():
        user_blob += (
            "\n\n--- Evidence to ground segments (use language and tensions from here when relevant) ---\n"
            + grounding
        )
    segments, u_aud = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Segment the brand audience into 2-3 distinct groups. "
            "When the evidence block is present, tie each segment to real tensions, language, or gaps "
            "from Reddit, social listening, competitors, trends, or Instagram comments — not generic platitudes. "
            "Return JSON: "
            "segments (array of {name, description, jobs_to_be_done, pain_points, "
            "preferred_channels, tone_notes, sample_hook}), reasoning_summary."
        ),
        user=user_blob,
        temperature=0.35,
        phase="audience",
    )
    return {
        **_trace_step(
            agent="audience_segmentation",
            phase="audience",
            title="Audience micro-segmentation",
            summary=segments.get("reasoning_summary"),
            reasoning=(
                "Segments synthesize strategy with live signals when available: Reddit posts, social/trends research, "
                "competitive JSON, and brand Instagram comment themes — still LLM-structured, but evidence-grounded."
            ),
            structured=segments,
        ),
        "audience_segments": segments,
        **_usage_events(u_aud),
    }


async def node_memory_conflict_resolve(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Detect contradictory brand signals across agents and emit unified guardrails before creatives."""
    r = _req(state)
    strat = state.get("strategy") or {}
    b_ig = state.get("brand_instagram_analysis") or {}
    comp = (state.get("competitor_research") or {}).get("structured") or {}
    social = (state.get("social_research") or {}).get("structured") or {}
    aud = state.get("audience_segments") or {}
    _emit_live(
        state,
        _act(
            phase="memory",
            agent="cross_agent_memory",
            action="llm_call",
            detail=f"Reconciling strategy, research, Instagram voice, and segments for {r.brand_name}",
            tool="gpt-structured",
        ),
    )
    resolved, u_mem = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are a brand governance memory layer. Compare the strategy, audience segments, "
            "social research, competitor positioning, and brand Instagram voice (if any). "
            "Return JSON only: "
            "conflicts (array of {signal_a, signal_b, description, severity: low|medium|high}), "
            "resolution (object: unified_tone, messaging_guardrails (array of strings), "
            "segment_tone_overrides (array of {segment_name, note}), notes_for_creatives (string)), "
            "reasoning_summary (string)."
        ),
        user=(
            build_node_context(state)
            + "\n\nStrategy:\n"
            + str(strat)[:6000]
            + "\n\nAudience segments:\n"
            + str(aud)[:4000]
            + "\n\nCompetitor landscape (structured):\n"
            + str(comp)[:4000]
            + "\n\nSocial research (structured):\n"
            + str(social)[:3000]
            + "\n\nBrand Instagram analysis:\n"
            + str(b_ig)[:4000]
        ),
        temperature=0.2,
        phase="memory",
    )
    return {
        **_trace_step(
            agent="cross_agent_memory",
            phase="memory",
            title="Cross-agent memory & conflict resolution",
            summary=resolved.get("reasoning_summary"),
            reasoning="Surfaces contradictions and locks a single set of guardrails before creative generation.",
            structured=resolved,
        ),
        "memory_resolution": resolved,
        **_usage_events(u_mem),
    }


async def node_keyword_graph(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Deterministic: NetworkX + PageRank keyword graph engine."""
    from app.services.keyword_graph import build_keyword_graph

    _emit_live(
        state,
        _act(
            phase="keyword_graph",
            agent="keyword_graph_engine",
            action="analyzing",
            detail="Computing keyword co-occurrence graph (NetworkX PageRank)",
        ),
    )
    bundle_kw = state.get("refined_creatives") or state.get("creatives") or {}
    seo = bundle_kw.get("seo") or {}
    strat = state.get("strategy") or {}
    kw_list = [str(k.get("keyword", "")) for k in (seo.get("target_keywords") or []) if k.get("keyword")]
    pillars = [str(p) for p in (strat.get("messaging_pillars") or []) if p]
    brand_text = state.get("brand_page_text") or ""

    graph = build_keyword_graph(
        seo_keywords=kw_list,
        strategy_pillars=pillars,
        brand_text=brand_text[:10_000],
    )
    return {
        **_trace_step(
            agent="keyword_graph_engine",
            phase="keyword_graph",
            title="Keyword co-occurrence graph (PageRank)",
            summary=f"{graph.get('total_nodes', 0)} nodes, {graph.get('total_edges', 0)} edges — top: {', '.join(k['keyword'] for k in graph.get('top_keywords', [])[:5])}",
            reasoning="Deterministic NetworkX analysis — no LLM. Surfaces strategically linked terms.",
            structured={"top_keywords": graph.get("top_keywords", [])[:10]},
        ),
        "keyword_graph": graph,
    }


async def node_timing(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Data-driven 30-day campaign calendar.

    Instagram posting windows are derived from engagement-weighted timestamps
    of real brand + competitor posts (log-scale scoring, sentiment boost).
    All other channels fall back to category baselines when no data is available.
    """
    from app.services.timing_optimizer import build_campaign_calendar

    # ── resolve channel list from strategy ────────────────────────────────
    strat = state.get("strategy") or {}
    channels: list[str] = []
    for ch_item in (strat.get("channel_plan") or []):
        if isinstance(ch_item, dict) and ch_item.get("channel"):
            raw = str(ch_item["channel"]).lower().strip()
            channels.append("video" if raw == "tiktok" else raw)
    if not channels:
        channels = ["linkedin", "instagram", "twitter", "blog", "email",
                    "whatsapp", "push_notification", "seo", "video"]

    # ── pull brand / competitor Instagram data from state ─────────────────
    brand_ig: dict | None = state.get("brand_instagram_analysis") or None
    comp_ig_raw = state.get("competitor_instagram_analysis") or {}
    comp_ig: dict | None = comp_ig_raw if comp_ig_raw else None

    # ── YouTube timing data ───────────────────────────────────────────────
    yt_research: dict | None = state.get("youtube_research") or None

    # ── sentiment signal from brand IG ────────────────────────────────────
    sentiment_signal: dict | None = None
    if brand_ig and isinstance(brand_ig, dict):
        sentiment_signal = brand_ig.get("sentiment") or None

    # ── live log ──────────────────────────────────────────────────────────
    brand_posts_n = len((brand_ig or {}).get("all_posts") or []) if brand_ig else 0
    comp_posts_n  = sum(
        len(c.get("all_posts") or c.get("top_posts_with_comments") or [])
        for c in ((comp_ig or {}).get("raw_data") or [])
        if isinstance(c, dict)
    )
    yt_videos_n = (yt_research or {}).get("total_videos", 0)
    _emit_live(
        state,
        _act(
            phase="timing",
            agent="campaign_timing_optimizer",
            action="analyzing",
            detail=(
                f"Scoring windows: {brand_posts_n} IG brand posts + {comp_posts_n} competitor posts "
                f"+ {yt_videos_n} YouTube videos (engagement-weighted, log-scale)."
            ),
        ),
    )

    calendar = build_campaign_calendar(
        channels=channels,
        phases=strat.get("timeline_phases"),
        brand_ig=brand_ig,
        competitor_ig=comp_ig,
        sentiment_signal=sentiment_signal,
        youtube_research=yt_research,
    )

    tr = calendar["summary"].get("timing_reasoning") or {}
    override = tr.get("instagram_overridden", False)
    ig_days  = tr.get("instagram_best_days",  [])
    ig_hours = tr.get("instagram_best_hours", [])
    summary_line = (
        f"{calendar['summary']['total_events']} events over {calendar['summary']['duration_days']} days "
        f"({len(channels)} channels). "
        + (
            f"Instagram windows data-driven: {ig_days} at {ig_hours} "
            f"({tr.get('brand_posts_used', 0)} brand + {tr.get('competitor_posts_used', 0)} competitor posts)."
            if override else
            "Instagram using category defaults (no post timestamps available)."
        )
    )

    return {
        **_trace_step(
            agent="campaign_timing_optimizer",
            phase="timing",
            title="Data-driven 30-day campaign calendar",
            summary=summary_line,
            reasoning=(
                "Instagram best_days/best_hours derived from engagement-weighted (log-scale) post timestamps "
                "of brand + competitor accounts. Sentiment boost applied when positive rate ≥ 50%. "
                "Other channels use category baselines. " +
                " ".join(str(d) for d in (tr.get("details") or []) if d)
            ),
            structured={
                "total_events": calendar["summary"]["total_events"],
                "by_channel": calendar["summary"]["by_channel"],
                "timing_reasoning": tr,
            },
        ),
        "campaign_calendar": calendar,
    }


async def node_content_schedule(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Merge calendar + creatives + localization into a single cross-platform timeline with captions and hashtags."""
    r = _req(state)
    _emit_live(
        state,
        _act(
            phase="content_schedule",
            agent="unified_content_scheduler",
            action="llm_call",
            detail=f"Merging calendar + creatives into one executable schedule for {r.brand_name}",
        ),
    )
    cal = state.get("campaign_calendar") or {}
    creatives = state.get("refined_creatives") or state.get("creatives") or {}
    localized = state.get("localized") or {}
    strat = state.get("strategy") or {}
    out, u_cs = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are a senior campaign editor. Merge the 30-day calendar with channel creatives into ONE executable plan. "
            "Return JSON only:\n"
            "  overview: string (short paragraph on publishing rhythm for leadership).\n"
            "  platforms: object with keys exactly: instagram, linkedin, twitter, email, whatsapp, "
            "push_notification, blog, video. Each value is an array of objects with fields: "
            "scheduled_at (ISO 8601 datetime), headline, caption, hashtags (array of strings), cta, format, "
            "target_segment (string or null), "
            "image_needed (boolean), image_prompt (string or null — required when image_needed), "
            "extra_image_prompts (array of 0-2 alternate prompts for carousels, A/B tests, or extra angles; optional), "
            "image_variant_count (integer 1-3, default 1 — how many distinct images to produce for this post when useful), "
            "email_subject (null unless platform is email), email_preheader (null unless email), "
            "whatsapp_message (null unless whatsapp), push_title (null unless push_notification), "
            "push_body (null unless push_notification).\n"
            "  timeline: flat array of the same row shape plus id (string like cs_001), target_segment (string or null — "
            "audience segment name when the post is tailored to a segment from creatives.social.segment_variants), "
            "sorted by scheduled_at ascending. "
            "Include at least 28 rows across instagram, linkedin, twitter, email, whatsapp, push_notification, blog, video. "
            "Every timeline row MUST have a unique id (e.g. cs_001, cs_002). "
            "Use campaign_calendar days + event times to build scheduled_at. "
            "Adapt copy from creatives JSON; align tone with localized cultural notes when present. "
            "When segment_variants exist, distribute posts across segments (not all posts need a segment; use null when broad). "
            "For instagram, linkedin, twitter, blog, and video rows, set image_needed true with a concrete image_prompt "
            "(scene, style, subject) unless the row is explicitly text-only. Use extra_image_prompts + image_variant_count>1 "
            "only when multiple distinct visuals make sense (e.g. carousel, story+feed). "
            "Social posts: include 3-8 hashtags where relevant; omit hashtags for email, whatsapp, push."
        ),
        user=(
            f"Brand: {r.brand_name}\nGeos: {r.geography_primary} / {r.geography_secondary}\n\n"
            "campaign_calendar:\n"
            + str(cal)[:9000]
            + "\n\ncreatives:\n"
            + str(creatives)[:10_000]
            + "\n\nlocalized:\n"
            + str(localized)[:5000]
            + "\n\nchannel_plan:\n"
            + str(strat.get("channel_plan"))[:2500]
        ),
        temperature=0.35,
        phase="content_schedule",
    )
    timeline = out.get("timeline") or []
    return {
        **_trace_step(
            agent="unified_content_scheduler",
            phase="content_schedule",
            title="Cross-platform content & calendar merge",
            summary=(out.get("overview") or "")[:500],
            reasoning="Deterministic calendar dates anchor LLM-written platform-native copy, hashtags, and asset prompts.",
            structured={"timeline_rows": len(timeline), "platform_keys": list((out.get("platforms") or {}).keys())},
        ),
        "content_schedule": out,
        **_usage_events(u_cs),
    }


async def node_performance_sim(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Simulated performance projections via Ridge regression (no LLM) — see app.services.performance_ml."""
    from app.services.performance_ml import predict_performance_sim

    _emit_live(
        state,
        _act(
            phase="performance",
            agent="performance_simulator",
            action="ml_predict",
            detail="NumPy Ridge regression on calendar + Instagram + keyword/reddit features (no GPT)",
        ),
    )
    sim = predict_performance_sim(state)
    return {
        **_trace_step(
            agent="performance_simulator",
            phase="performance",
            title="Campaign performance simulation",
            summary=sim.get("reasoning_summary"),
            reasoning=(
                "Reach and impressions from multi-output Ridge regression (NumPy) trained on heuristic-aligned synthetic data; "
                "features from calendar cadence, brand/competitor Instagram metrics, keyword graph, and Reddit snapshot — "
                "see grounding_summary."
            ),
            structured=sim,
        ),
        "performance_sim": sim,
    }


async def node_localize(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    _emit_live(
        state,
        _act(
            phase="localize",
            agent="geo_localization_lead",
            action="llm_call",
            detail=f"Dual-geo adaptation: {r.geography_primary} ↔ {r.geography_secondary}",
        ),
    )
    creatives_to_use = state.get("refined_creatives") or state.get("creatives") or {}
    localized, u_loc = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You localize a full marketing bundle. Return JSON with keys "
            f"`{r.geography_primary}` and `{r.geography_secondary}` each containing "
            "localized_positioning, social_samples (array), whatsapp_adjustments (array), "
            "taboo_phrases_to_avoid (array), cultural_notes (string)."
        ),
        user=(
            "Strategy:\n"
            + str(state.get("strategy"))[:4000]
            + "\nCreatives:\n"
            + str(creatives_to_use)[:6000]
            + "\nCritique:\n"
            + str(state.get("critique_post_refine") or state.get("critique") or {})[:2500]
        ),
        temperature=0.45,
        phase="localize",
    )
    return {
        **_trace_step(
            agent="geo_localization_lead",
            phase="localize",
            title="Dual-geo cultural adaptation",
            summary="Localized tone, examples, and compliance notes for both target markets.",
            reasoning="Separates literal translation from cultural fit and channel nuance.",
            structured=localized,
        ),
        "localized": localized,
        **_usage_events(u_loc),
    }


async def node_visuals(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    if not state.get("generate_images", True):
        return {
            **_trace_step(
                agent="visual_design",
                phase="visual",
                title="Image generation skipped",
                summary="Disabled per request.",
            ),
            "image_prompts": [],
            "image_urls": [],
        }
    _emit_live(
        state,
        _act(
            phase="visual",
            agent="visual_design",
            action="analyzing",
            detail="Drafting image prompts from strategy + creatives (rendered via Pranav Pix)",
        ),
    )
    prompts_obj, u_vis = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Return JSON {prompts: array of distinct short image prompts for campaign key art, "
            f"at least 3 and up to {max(3, settings.max_image_variants)} items, different angles or formats."
        ),
        user="Strategy + social hooks:\n"
        + str(state.get("strategy"))[:4000]
        + "\n"
        + str(state.get("refined_creatives") or state.get("creatives") or {})[:4000],
        phase="visual",
    )
    prompts = [str(p) for p in (prompts_obj.get("prompts") or []) if str(p).strip()]
    _emit_live(
        state,
        _act(
            phase="visual",
            agent="visual_design",
            action="generating_image",
            detail=f"Generating {len(prompts)} key visual(s)…",
            progress=f"0/{len(prompts)}",
        ),
    )
    urls = await generate_campaign_images(settings=settings, prompts=prompts)
    rid = str(state.get("run_id") or "").strip()
    if urls and rid:
        persisted = await persist_remote_images(urls=urls, run_id=rid, settings=settings)
        if persisted:
            urls = persisted
    return {
        **_trace_step(
            agent="visual_design",
            phase="visual",
            title="Key visual generation",
            summary=f"Generated {len(urls)} approved renders.",
            reasoning="Prompts inherit messaging pillars to keep visual metaphors aligned.",
            structured={"prompts": prompts, "urls": urls},
        ),
        "image_prompts": prompts,
        "image_urls": urls,
        **_usage_events(u_vis),
    }


def _merge_partial_returns(*parts: dict[str, Any]) -> dict[str, Any]:
    """Merge outputs of parallel node calls (trace/errors/token_usage append; other keys last-wins)."""
    out: dict[str, Any] = {}
    traces: list[dict[str, Any]] = []
    errors: list[str] = []
    tok: list[dict[str, Any]] = []
    for p in parts:
        for k, v in p.items():
            if k == "trace":
                traces.extend(v)
            elif k == "errors":
                errors.extend(v)
            elif k == "token_usage_events":
                tok.extend(v)
            else:
                out[k] = v
    if traces:
        out["trace"] = traces
    if errors:
        out["errors"] = errors
    if tok:
        out["token_usage_events"] = tok
    return out


async def node_post_critic_parallel(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """Run localize, keyword graph, and timing in parallel (audience + memory run before creatives)."""
    loc, kw, tim = await asyncio.gather(
        node_localize(state, client=client, settings=settings),
        node_keyword_graph(state, client=client, settings=settings),
        node_timing(state, client=client, settings=settings),
    )
    return _merge_partial_returns(loc, kw, tim)


def _merge_state_patch(state: CampaignState, patch: dict[str, Any]) -> CampaignState:
    """Shallow merge for passing updated keys into a follow-up node (trace/errors/activities append)."""
    out: dict[str, Any] = dict(state)
    for k, v in patch.items():
        if k == "trace" and isinstance(v, list):
            out["trace"] = list(out.get("trace") or []) + v
        elif k == "errors" and isinstance(v, list):
            out["errors"] = list(out.get("errors") or []) + v
        elif k == "activities" and isinstance(v, list):
            out["activities"] = list(out.get("activities") or []) + v
        elif k == "token_usage_events" and isinstance(v, list):
            out["token_usage_events"] = list(out.get("token_usage_events") or []) + v
        else:
            out[k] = v
    return out  # type: ignore[return-value]


def _flatten_content_schedule_row_refs(cs: dict[str, Any]) -> list[dict[str, Any]]:
    timeline = cs.get("timeline")
    if isinstance(timeline, list) and timeline:
        return [r for r in timeline if isinstance(r, dict)]
    out: list[dict[str, Any]] = []
    pl = cs.get("platforms")
    if isinstance(pl, dict):
        for plat, arr in pl.items():
            if not isinstance(arr, list):
                continue
            for r in arr:
                if isinstance(r, dict):
                    if not r.get("platform"):
                        r["platform"] = plat
                    out.append(r)
    return out


def _schedule_row_should_image(row: dict[str, Any], budget_left: int) -> bool:
    if budget_left <= 0:
        return False
    if row.get("image_needed") is True:
        return True
    plat = normalize_platform_key(str(row.get("platform") or ""))
    return plat in (
        "instagram",
        "linkedin",
        "twitter",
        "tiktok",
        "blog",
        "video",
        "youtube",
        "seo",
    )


def _image_prompts_for_row(
    row: dict[str, Any],
    brand_name: str,
    max_variants: int,
) -> list[str]:
    raw_main = row.get("image_prompt") or row.get("headline") or row.get("caption") or ""
    main = str(raw_main).strip() if raw_main else ""
    extras_raw = row.get("extra_image_prompts")
    extras: list[str] = []
    if isinstance(extras_raw, list):
        extras = [str(e).strip() for e in extras_raw if str(e).strip()]
    n_var = row.get("image_variant_count")
    try:
        n_var_i = int(n_var) if n_var is not None else 1
    except (TypeError, ValueError):
        n_var_i = 1
    n_var_i = max(1, min(n_var_i, max_variants))
    prompts: list[str] = []
    if main:
        prompts.append(main)
    for e in extras:
        if len(prompts) >= n_var_i:
            break
        prompts.append(e)
    if not prompts and brand_name:
        prompts.append(
            f"Brand campaign visual for {brand_name}, {row.get('platform', 'social')} — {row.get('format', 'post')}"
        )
    while len(prompts) < n_var_i and main:
        prompts.append(f"Alternate visual angle, same campaign message: {main[:400]}")
        break
    return prompts[:n_var_i]


def _ensure_schedule_row_ids(cs: dict[str, Any]) -> None:
    tl = cs.get("timeline")
    if isinstance(tl, list):
        for i, r in enumerate(tl):
            if isinstance(r, dict) and not str(r.get("id") or "").strip():
                r["id"] = f"cs_tl_{i:04d}"
    pl = cs.get("platforms")
    if isinstance(pl, dict):
        for plat, arr in pl.items():
            if not isinstance(arr, list):
                continue
            pk = normalize_platform_key(str(plat))
            for i, r in enumerate(arr):
                if isinstance(r, dict) and not str(r.get("id") or "").strip():
                    r["id"] = f"cs_{pk}_{i:04d}"


def _patch_row_by_id(cs: dict[str, Any], row_id: str, urls: list[str], label: str, dsize: str) -> None:
    tl = cs.get("timeline")
    if isinstance(tl, list):
        for r in tl:
            if isinstance(r, dict) and str(r.get("id", "")) == row_id:
                r["generated_image_urls"] = urls
                r["image_size_label"] = label
                r["image_generation_size"] = dsize
                return
    pl = cs.get("platforms")
    if isinstance(pl, dict):
        for arr in pl.values():
            if not isinstance(arr, list):
                continue
            for r in arr:
                if isinstance(r, dict) and str(r.get("id", "")) == row_id:
                    r["generated_image_urls"] = urls
                    r["image_size_label"] = label
                    r["image_generation_size"] = dsize
                    return


async def node_schedule_post_images(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """Generate platform-sized images per scheduled row; patch content_schedule + aggregate image_urls."""
    if not state.get("generate_images", True):
        return {
            **_trace_step(
                agent="post_visual_generator",
                phase="visual",
                title="Post images skipped",
                summary="Disabled per request.",
            ),
            "image_urls": [],
            "image_prompts": [],
        }
    cs_raw = state.get("content_schedule")
    if not isinstance(cs_raw, dict) or not cs_raw:
        return {}
    cs_work = copy.deepcopy(cs_raw)
    _ensure_schedule_row_ids(cs_work)
    rows = _flatten_content_schedule_row_refs(cs_work)
    r = _req(state)
    run_id = str(state.get("run_id") or "").strip()
    remain = max(0, settings.max_schedule_post_images)
    all_urls: list[str] = []
    all_prompts: list[str] = []
    generated_rows = 0

    budget = remain
    _emit_live(
        state,
        _act(
            phase="visual",
            agent="post_visual_generator",
            action="generating_image",
            detail=(
                f"Rendering up to {budget} post images (platform-specific sizes, "
                f"parallel×{settings.image_generation_concurrency}) for {r.brand_name}"
            ),
            progress=f"0/{budget}",
        ),
    )

    jobs: list[tuple[str, int, str, str, str]] = []
    for row in rows:
        if len(jobs) >= budget:
            break
        if not _schedule_row_should_image(row, budget):
            continue
        row_id = str(row.get("id") or "").strip()
        if not row_id:
            continue
        plat = str(row.get("platform") or "")
        dsize, label = dalle_size_and_label(plat)
        prompts = _image_prompts_for_row(row, r.brand_name, settings.max_variants_per_post)
        for pi, prompt in enumerate(prompts):
            if len(jobs) >= budget:
                break
            jobs.append((row_id, pi, prompt, dsize, label))

    sem = asyncio.Semaphore(settings.image_generation_concurrency)

    async def _render_one(job: tuple[str, int, str, str, str]) -> tuple[str, int, str | None, str, str, str] | None:
        row_id, pi, prompt, dsize, label = job
        async with sem:
            url = await generate_one_image(settings=settings, prompt=prompt, size=dsize)
            if not url:
                return None
            final_u = url
            if run_id and url.startswith("http"):
                persisted = await persist_remote_image(
                    url=url,
                    run_id=run_id,
                    settings=settings,
                    basename=f"sch_{row_id}_{pi}",
                )
                if persisted:
                    final_u = persisted
            return (row_id, pi, final_u, prompt, label, dsize)

    raw_results = await asyncio.gather(*[_render_one(j) for j in jobs], return_exceptions=True)

    by_row: dict[str, list[tuple[int, str, str, str, str]]] = defaultdict(list)
    for item in raw_results:
        if isinstance(item, BaseException):
            continue
        if not item:
            continue
        row_id, pi, final_u, prompt, label, dsize = item
        by_row[row_id].append((pi, final_u, prompt, label, dsize))

    for row_id, items in by_row.items():
        items.sort(key=lambda t: t[0])
        urls_this = [t[1] for t in items]
        label = items[0][3]
        dsize = items[0][4]
        for t in items:
            all_urls.append(t[1])
            all_prompts.append(t[2][:300])
        _patch_row_by_id(cs_work, row_id, urls_this, label, dsize)
        generated_rows += 1

    return {
        **_trace_step(
            agent="post_visual_generator",
            phase="visual",
            title="Per-post social visuals",
            summary=f"Generated images for {generated_rows} schedule row(s); aspect hints follow platform norms (Pranav Pix).",
            reasoning="Portrait for vertical platforms; landscape for LinkedIn/X/blog; square for email/push.",
            structured={"images_total": len(all_urls), "rows_touched": generated_rows},
        ),
        "content_schedule": cs_work,
        "image_urls": all_urls,
        "image_prompts": all_prompts,
    }


async def node_parallel_schedule_bundle(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """Content schedule + performance sim, then per-post images (needs schedule first)."""
    cs, perf = await asyncio.gather(
        node_content_schedule(state, client=client, settings=settings),
        node_performance_sim(state, client=client, settings=settings),
    )
    merged = _merge_partial_returns(cs, perf)
    boosted = _merge_state_patch(state, merged)
    vis = await node_schedule_post_images(boosted, client=client, settings=settings)
    return _merge_partial_returns(merged, vis)


async def node_finalize(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    _emit_live(
        state,
        _act(
            phase="finalize",
            agent="delivery_orchestrator",
            action="llm_call",
            detail=f"Writing executive summary and assembling client bundle for {r.brand_name}",
        ),
    )
    strat = state.get("strategy") or {}
    creatives = state.get("creatives") or {}
    exec_summary, u_fin = await chat_text(
        client=client,
        model=settings.openai_model_fast,
        system="Write a tight 120-word client-ready executive summary. No markdown.",
        user=str(strat.get("executive_summary")) + "\n" + str(creatives.keys()),
        phase="finalize",
    )
    final_creatives = state.get("refined_creatives") or creatives
    artifacts = CampaignArtifacts(
        executive_summary=exec_summary,
        positioning=strat.get("positioning") or {},
        competitor_landscape=(state.get("competitor_research") or {}).get("structured") or {},
        audience_and_messaging={
            "audience": strat.get("audience"),
            "pillars": strat.get("messaging_pillars"),
        },
        channel_strategy={
            "channel_plan": strat.get("channel_plan"),
            "timeline": strat.get("timeline_phases"),
            "measurement": strat.get("measurement"),
        },
        seo_website_optimization=state.get("seo_website_optimization") or {},
        seo=final_creatives.get("seo") or creatives.get("seo") or {},
        social=final_creatives.get("social") or creatives.get("social") or {},
        video_concepts=final_creatives.get("video_concepts") or creatives.get("video_concepts") or {},
        messaging_whatsapp=final_creatives.get("messaging_whatsapp") or creatives.get("messaging_whatsapp") or {},
        creative_critique=state.get("critique") or {},
        creative_critique_post_refine=state.get("critique_post_refine") or {},
        original_creatives=creatives,
        memory_resolution=state.get("memory_resolution") or {},
        refined_creatives=state.get("refined_creatives") or {},
        localized=state.get("localized") or {},
        keyword_graph=state.get("keyword_graph") or {},
        campaign_calendar=state.get("campaign_calendar") or {},
        audience_segments=state.get("audience_segments") or {},
        performance_sim=state.get("performance_sim") or {},
        content_schedule=state.get("content_schedule") or {},
        image_prompts=state.get("image_prompts") or [],
        image_urls=state.get("image_urls") or [],
        brand_instagram_analysis=state.get("brand_instagram_analysis") or {},
        competitor_instagram_analysis=state.get("competitor_instagram_analysis") or {},
        youtube_research=state.get("youtube_research") or {},
        google_trends_research=state.get("google_trends_research") or {},
    )
    return {
        **_trace_step(
            agent="client_delivery_compiler",
            phase="finalize",
            title="Final artifact packaging",
            summary="Compiled executive summary and channel bundles for export.",
            structured={"artifact_keys": list(artifacts.model_dump().keys())},
        ),
        "final_artifacts": artifacts.model_dump(),
        **_usage_events(u_fin),
    }
