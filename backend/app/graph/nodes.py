from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings
from app.schemas.campaign import AgentActivity, AgentTraceStep, CampaignArtifacts, CampaignRequest, SourceRef, ToolInvocation
from app.services.fetch import fetch_url_text
from app.services.image_store import persist_remote_images
from app.services.images import generate_campaign_images
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


def _req(state: CampaignState) -> CampaignRequest:
    return CampaignRequest.model_validate(state["request"])


def build_node_context(state: CampaignState) -> str:
    r = _req(state)
    parts = [
        f"Brand name: {r.brand_name}",
        f"Primary geography: {r.geography_primary}",
        f"Secondary geography: {r.geography_secondary}",
    ]
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
                 detail=f"Setting target geographies: {r.geography_primary}, {r.geography_secondary}"),
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
                "geographies": [r.geography_primary, r.geography_secondary],
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
    pkt = await run_responses_web_research(
        client=client, settings=settings, instructions=instructions, user_input=user
    )
    # Emit sources found live
    for s in pkt.sources[:5]:
        a = _act(phase="research", agent="competitor_intelligence", action="reading_source",
                 detail=f"Reading: {s.get('title', s['url'])}", url=s["url"], tool="web_search")
        _emit_live(state, a)
        acts.append(a)
    _emit_live(state, _act(phase="research", agent="competitor_intelligence", action="llm_call",
                           detail=f"Structuring competitive landscape for {r.brand_name}", tool="gpt-4o-mini"))
    structured = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Convert the research narrative into concise JSON. Schema keys: "
            "competitors (array of {name, positioning, differentiators, evidence_urls, threat_level}), "
            "white_space_opportunities (array of strings), risks (array of strings), "
            "reasoning_summary (string)."
        ),
        user="Research output:\n" + pkt.text[:14_000],
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
        "LinkedIn, Instagram, TikTok, YouTube, and community forums. Identify hooks, formats, and "
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
    pkt = await run_responses_web_research(
        client=client, settings=settings, instructions=instructions, user_input=user
    )
    for s in pkt.sources[:4]:
        a = _act(phase="research", agent="social_media_intelligence", action="reading_source",
                 detail=f"Analyzing: {s.get('title', s['url'])}", url=s["url"])
        _emit_live(state, a)
        acts.append(a)
    _emit_live(state, _act(phase="research", agent="social_media_intelligence", action="llm_call",
                           detail=f"Extracting social engagement patterns for {r.brand_name}", tool="gpt-4o-mini"))
    structured = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Schema: winning_content_patterns (array of {platform, pattern, why_it_works, example_urls}), "
            "influencer_or_creator_trends (array of strings), community_tensions (array of strings), "
            "recommended_formats (array of strings), reasoning_summary (string)."
        ),
        user="Social research:\n" + pkt.text[:12_000],
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
    pkt = await run_responses_web_research(
        client=client, settings=settings, instructions=instructions, user_input=user
    )
    for s in pkt.sources[:4]:
        a = _act(phase="research", agent="market_trends", action="reading_source",
                 detail=f"Analyzing: {s.get('title', s['url'])}", url=s["url"])
        _emit_live(state, a)
        acts.append(a)
    _emit_live(state, _act(phase="research", agent="market_trends", action="llm_call",
                           detail=f"Synthesizing trend impact analysis for {r.brand_name}", tool="gpt-4o-mini"))
    structured = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Schema: trends (array of {name, timeframe, impact, evidence_urls, activation_idea}), "
            "headwinds (array of strings), tailwinds (array of strings), reasoning_summary (string)."
        ),
        user="Trend narrative:\n" + pkt.text[:12_000],
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

    sentiment_blob: dict[str, Any] = {}
    if all_comments:
        sentiment_blob = await chat_json_object(
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
        )

    # ── Overall Instagram performance summary ─────────────────────────────
    post_summary = await chat_json_object(
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
    )

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
    }


async def _competitor_instagram_agent(
    state: CampaignState, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """
    Discover competitor Instagram handles via LLM web search,
    fetch their posts + comments, and surface what works for them.
    """
    r = _req(state)
    ctx = build_node_context(state)

    # Step 1: find competitor handles with a web-search-backed LLM call
    handles_resp = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "You are a competitive intelligence researcher. "
            "Identify the 3 most direct competitors for this brand and find their Instagram handles. "
            "Return JSON: competitors (array of {name, instagram_handle, reason})."
        ),
        user=(
            ctx
            + f"\n\nBrand: {r.brand_name}. Industry hint: {r.industry_hint or 'unknown'}. "
            "Provide ONLY real handles that exist on Instagram (no placeholders)."
        ),
        temperature=0.2,
    )

    competitors_meta = (handles_resp.get("competitors") or [])[:3]

    # Step 2: fetch each competitor's posts + comments concurrently
    async def _fetch_one(meta: dict[str, Any]) -> dict[str, Any]:
        name = meta.get("name", "")
        raw_handle = (meta.get("instagram_handle") or "").strip().lstrip("@")
        if not raw_handle:
            return {"name": name, "handle": None, "error": "no handle"}
        try:
            from app.services.instagrapi_service import get_trending_posts_with_comments
            raw = await asyncio.to_thread(
                get_trending_posts_with_comments,
                raw_handle,
                15,   # max_posts
                3,    # top_n for comments
                30,   # max_comments
                30,   # threshold
            )
            return {"name": name, "handle": raw_handle, **raw}
        except Exception as exc:
            return {"name": name, "handle": raw_handle, "error": str(exc)}

    competitor_raw_list = await asyncio.gather(*[_fetch_one(m) for m in competitors_meta])

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
        competitor_analysis = await chat_json_object(
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
        )

    return {
        "competitor_instagram": {
            "competitors_found": [m.get("name") for m in competitors_meta],
            "raw_data": [
                {k: v for k, v in c.items() if k not in ("all_posts", "top_posts_with_comments")}
                for c in competitor_raw_list
            ],
            "analysis": competitor_analysis,
        },
        "trace": [
            AgentTraceStep(
                id=_tid(),
                agent="competitor_instagram_analyst",
                phase="research",
                title="Competitor Instagram benchmarking",
                summary=competitor_analysis.get("reasoning_summary"),
                reasoning=(
                    f"Searched for Instagram handles of {len(competitors_meta)} competitors; "
                    f"successfully fetched data for {sum(1 for c in competitor_raw_list if not c.get('error'))}. "
                    "Engagement benchmarks and gap opportunities will inform creative differentiation strategy."
                ),
                structured={
                    "competitors": competitor_analysis.get("competitor_profiles"),
                    "gap_opportunities": competitor_analysis.get("gap_opportunities"),
                    "benchmarks": competitor_analysis.get("industry_engagement_benchmarks"),
                },
            ).model_dump()
        ],
    }


async def node_parallel_research(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    c, s, t, b_ig, comp_ig = await asyncio.gather(
        _competitor_agent(state, client, settings),
        _social_agent(state, client, settings),
        _trends_agent(state, client, settings),
        _brand_instagram_agent(state, client, settings),
        _competitor_instagram_agent(state, client, settings),
    )
    trace = (
        c["trace"] + s["trace"] + t["trace"]
        + b_ig["trace"] + comp_ig["trace"]
    )
    return {
        "trace": trace,
        "competitor_research": c["packet"],
        "social_research": s["packet"],
        "trends_research": t["packet"],
        "reddit_snapshot": s.get("reddit", {}),
        "brand_instagram_analysis": b_ig.get("instagram_data", {}),
        "competitor_instagram_analysis": comp_ig.get("competitor_instagram", {}),
    }


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

    return "\n\n".join(parts)


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
    user = ctx + "\n\nGrounding research digest:\n" + digest[:18_000]
    _emit_live(state, _act(phase="strategy", agent="campaign_strategy_architect", action="llm_call",
                           detail=f"Building go-to-market strategy for {r.brand_name}", tool=settings.openai_model))
    structured = await chat_json_object(
        client=client, model=settings.openai_model, system=system, user=user, temperature=0.35
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
    }


async def _creative_json(
    *,
    client: AsyncOpenAI,
    settings: Settings,
    role: str,
    system_schema: str,
    user_blob: str,
) -> dict[str, Any]:
    return await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=role + " " + system_schema,
        user=user_blob[:24_000],
        temperature=0.55,
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
    base = build_node_context(state) + "\n\nStrategy JSON:\n" + str(state.get("strategy"))[:10_000]
    digest = _research_digest(state)[:8000]
    ig_ctx = _instagram_creative_context(state)

    ig_instruction = (
        "\n\nINSTAGRAM INTELLIGENCE (use this to inform creative decisions and cite it in reasoning_summary):\n"
        + ig_ctx
    ) if ig_ctx else ""

    seo_task = _creative_json(
        client=client,
        settings=settings,
        role="You are an SEO & editorial lead.",
        system_schema=(
            "Return JSON: pillar_topics (array), cluster_map, target_keywords (array of {keyword, intent, page_type}), "
            "blog_outline (array of sections), meta_templates, internal_linking_plan, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest + ig_instruction,
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
            "(c) how audience sentiment shaped the tone."
        ),
        system_schema=(
            "Return JSON: linkedin (array of posts with hook, body, cta), "
            "instagram (array of {idea, caption, hashtags, format, visual_direction, reasoning — "
            "  reasoning must cite brand Instagram data and competitor gaps}), "
            "tiktok_or_reels (array of {hook, beat_sheet, on_screen_text}), "
            "twitter (array of {text, hashtags}), "
            "email_broadcasts (array of {subject, preheader, body}), "
            "push_notifications (array of {title, body, trigger_context}), "
            "reasoning_summary (must reference Instagram sentiment findings and competitor gaps)."
        ),
        user_blob=base + "\nResearch:\n" + digest + ig_instruction,
    )
    video_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a film-first storyteller.",
        system_schema=(
            "Return JSON: hero_spot (object with logline, scenes), product_demo_variants (array), "
            "ugc_briefs (array), production_notes, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest + ig_instruction,
    )
    msg_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a lifecycle & WhatsApp campaign designer.",
        system_schema=(
            "Return JSON: whatsapp_sequences (array of {name, messages:[{text, timing, cta}]}), "
            "sms_companion (array), compliance_notes, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest + ig_instruction,
    )
    seo, social, video, msg = await asyncio.gather(seo_task, social_task, video_task, msg_task)
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
    }


async def node_critic(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    critique = await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=(
            "You are a skeptical creative director + brand lawyer lite. "
            "Score JSON outputs for consistency with strategy and research. "
            "Return JSON: scores (object of channel:0-100), issues (array of {channel, severity, fix}), "
            "revision_directives (array), final_verdict (string)."
        ),
        user=(
            build_node_context(state)
            + "\nStrategy:\n"
            + str(state.get("strategy"))[:8000]
            + "\nCreatives:\n"
            + str(state.get("creatives"))[:12_000]
        ),
        temperature=0.25,
    )
    return {
        **_trace_step(
            agent="creative_director_critic",
            phase="critic",
            title="Cross-channel QA & critique",
            summary=critique.get("final_verdict"),
            reasoning="Explicit scoring makes trade-offs visible for client governance.",
            structured=critique,
        ),
        "critique": critique,
    }


async def node_refine(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Refinement loop: takes critic output, fixes creatives, shows before/after."""
    critique = state.get("critique") or {}
    creatives = state.get("creatives") or {}
    refined = await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=(
            "You are a senior copywriter. Revise the campaign creatives using the critic directives. "
            "Return JSON with keys: seo, social, video_concepts, messaging_whatsapp — each revised. "
            "Also include before_after_highlights (array of {channel, issue, original_snippet, revised_snippet})."
        ),
        user=(
            "Critique:\n" + str(critique)[:8000]
            + "\nOriginal creatives:\n" + str(creatives)[:12_000]
        ),
        temperature=0.4,
    )
    return {
        **_trace_step(
            agent="refinement_specialist",
            phase="refine",
            title="Critic-driven refinement loop",
            summary=f"Revised {len(refined.get('before_after_highlights', []))} issues across channels.",
            reasoning="Addresses every critic directive; before/after diffs are preserved for transparency.",
            structured=refined,
        ),
        "refined_creatives": refined,
    }


def should_refine(state: CampaignState) -> str:
    """Conditional edge: refine if any critic score < 75, else skip."""
    critique = state.get("critique") or {}
    scores = critique.get("scores") or {}
    if not scores:
        return "post_critic_parallel"
    avg = sum(scores.values()) / max(len(scores), 1)
    if avg < 75 or any(v < 60 for v in scores.values()):
        return "refine"
    return "post_critic_parallel"


async def node_audience_segments(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """LLM-backed audience segmentation: 2-3 segments with tailored messaging."""
    segments = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Segment the brand audience into 2-3 distinct groups. Return JSON: "
            "segments (array of {name, description, jobs_to_be_done, pain_points, "
            "preferred_channels, tone_notes, sample_hook}), reasoning_summary."
        ),
        user=(
            build_node_context(state)
            + "\nStrategy:\n" + str(state.get("strategy"))[:6000]
        ),
        temperature=0.35,
    )
    return {
        **_trace_step(
            agent="audience_segmentation",
            phase="audience",
            title="Audience micro-segmentation",
            summary=segments.get("reasoning_summary"),
            reasoning="Maps distinct personas to channel affinity for targeted content delivery.",
            structured=segments,
        ),
        "audience_segments": segments,
    }


async def node_keyword_graph(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Deterministic: NetworkX + PageRank keyword graph engine."""
    from app.services.keyword_graph import build_keyword_graph

    seo = (state.get("creatives") or {}).get("seo") or {}
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
    """Deterministic: 30-day campaign calendar optimizer."""
    from app.services.timing_optimizer import build_campaign_calendar

    strat = state.get("strategy") or {}
    channels = []
    for ch_item in (strat.get("channel_plan") or []):
        if isinstance(ch_item, dict) and ch_item.get("channel"):
            channels.append(str(ch_item["channel"]).lower().strip())
    if not channels:
        channels = [
            "linkedin",
            "instagram",
            "twitter",
            "tiktok",
            "blog",
            "email",
            "whatsapp",
            "push_notification",
            "seo",
            "video",
        ]

    calendar = build_campaign_calendar(
        channels=channels,
        phases=strat.get("timeline_phases"),
    )
    return {
        **_trace_step(
            agent="campaign_timing_optimizer",
            phase="timing",
            title="30-day campaign calendar",
            summary=f"{calendar['summary']['total_events']} events across {len(channels)} channels over {calendar['summary']['duration_days']} days.",
            reasoning="Deterministic scheduler — no LLM. Aligns channel cadence to optimal posting windows.",
            structured=calendar.get("summary"),
        ),
        "campaign_calendar": calendar,
    }


async def node_content_schedule(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Merge calendar + creatives + localization into a single cross-platform timeline with captions and hashtags."""
    r = _req(state)
    cal = state.get("campaign_calendar") or {}
    creatives = state.get("refined_creatives") or state.get("creatives") or {}
    localized = state.get("localized") or {}
    strat = state.get("strategy") or {}
    out = await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=(
            "You are a senior campaign editor. Merge the 30-day calendar with channel creatives into ONE executable plan. "
            "Return JSON only:\n"
            "  overview: string (short paragraph on publishing rhythm for leadership).\n"
            "  platforms: object with keys exactly: instagram, linkedin, twitter, tiktok, email, whatsapp, "
            "push_notification, blog, video. Each value is an array of objects with fields: "
            "scheduled_at (ISO 8601 datetime), headline, caption, hashtags (array of strings), cta, format, "
            "image_needed (boolean), image_prompt (string or null), "
            "email_subject (null unless platform is email), email_preheader (null unless email), "
            "whatsapp_message (null unless whatsapp), push_title (null unless push_notification), "
            "push_body (null unless push_notification).\n"
            "  timeline: flat array of the same row shape plus id (string like cs_001), sorted by scheduled_at ascending. "
            "Include at least 28 rows across instagram, linkedin, twitter, tiktok, email, whatsapp, push_notification, blog. "
            "Use campaign_calendar days + event times to build scheduled_at. "
            "Adapt copy from creatives JSON; align tone with localized cultural notes when present. "
            "Social posts: include 3-8 hashtags where relevant; omit hashtags for email, whatsapp, push."
        ),
        user=(
            f"Brand: {r.brand_name}\nGeos: {r.geography_primary} / {r.geography_secondary}\n\n"
            "campaign_calendar:\n"
            + str(cal)[:14_000]
            + "\n\ncreatives:\n"
            + str(creatives)[:18_000]
            + "\n\nlocalized:\n"
            + str(localized)[:8000]
            + "\n\nchannel_plan:\n"
            + str(strat.get("channel_plan"))[:4000]
        ),
        temperature=0.35,
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
    }


async def node_performance_sim(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    """Simulated performance projections per channel."""
    sim = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Simulate realistic 30-day performance projections for this campaign. Return JSON: "
            "channels (array of {name, impressions_estimate, engagement_rate, click_through_rate, "
            "estimated_leads, confidence}), overall_projected_reach, key_risks (array), "
            "optimization_suggestions (array), reasoning_summary."
        ),
        user=(
            build_node_context(state)
            + "\nStrategy:\n" + str(state.get("strategy"))[:4000]
            + "\nCalendar summary:\n" + str((state.get("campaign_calendar") or {}).get("summary"))[:2000]
        ),
        temperature=0.3,
    )
    return {
        **_trace_step(
            agent="performance_simulator",
            phase="performance",
            title="Campaign performance simulation",
            summary=sim.get("reasoning_summary"),
            reasoning="Estimated projections grounded in channel plan and calendar density.",
            structured=sim,
        ),
        "performance_sim": sim,
    }


async def node_localize(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    creatives_to_use = state.get("refined_creatives") or state.get("creatives") or {}
    localized = await chat_json_object(
        client=client,
        model=settings.openai_model,
        system=(
            "You localize a full marketing bundle. Return JSON with keys "
            f"`{r.geography_primary}` and `{r.geography_secondary}` each containing "
            "localized_positioning, social_samples (array), whatsapp_adjustments (array), "
            "taboo_phrases_to_avoid (array), cultural_notes (string)."
        ),
        user=(
            "Strategy:\n"
            + str(state.get("strategy"))[:6000]
            + "\nCreatives:\n"
            + str(creatives_to_use)[:8000]
            + "\nCritique:\n"
            + str(state.get("critique"))[:4000]
        ),
        temperature=0.45,
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
    prompts_obj = await chat_json_object(
        client=client,
        model=settings.openai_model_fast,
        system=(
            "Return JSON {prompts: array of distinct short DALL·E prompts for campaign key art, "
            f"at least 3 and up to {max(3, settings.max_image_variants)} items, different angles or formats."
        ),
        user="Strategy + social hooks:\n" + str(state.get("strategy"))[:4000] + "\n" + str(state.get("creatives"))[:4000],
    )
    prompts = [str(p) for p in (prompts_obj.get("prompts") or []) if str(p).strip()]
    urls = await generate_campaign_images(client=client, settings=settings, prompts=prompts)
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
    }


def _merge_partial_returns(*parts: dict[str, Any]) -> dict[str, Any]:
    """Merge outputs of parallel node calls (trace/errors append; other keys last-wins)."""
    out: dict[str, Any] = {}
    traces: list[dict[str, Any]] = []
    errors: list[str] = []
    for p in parts:
        for k, v in p.items():
            if k == "trace":
                traces.extend(v)
            elif k == "errors":
                errors.extend(v)
            else:
                out[k] = v
    if traces:
        out["trace"] = traces
    if errors:
        out["errors"] = errors
    return out


async def node_post_critic_parallel(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """Run localize, keyword graph, timing, and audience in parallel (independent given prior state)."""
    loc, kw, tim, aud = await asyncio.gather(
        node_localize(state, client=client, settings=settings),
        node_keyword_graph(state, client=client, settings=settings),
        node_timing(state, client=client, settings=settings),
        node_audience_segments(state, client=client, settings=settings),
    )
    return _merge_partial_returns(loc, kw, tim, aud)


async def node_parallel_schedule_bundle(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    """Run unified content schedule, performance sim, and visuals in parallel."""
    cs, perf, vis = await asyncio.gather(
        node_content_schedule(state, client=client, settings=settings),
        node_performance_sim(state, client=client, settings=settings),
        node_visuals(state, client=client, settings=settings),
    )
    return _merge_partial_returns(cs, perf, vis)


async def node_finalize(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    strat = state.get("strategy") or {}
    creatives = state.get("creatives") or {}
    exec_summary = await chat_text(
        client=client,
        model=settings.openai_model_fast,
        system="Write a tight 120-word client-ready executive summary. No markdown.",
        user=str(strat.get("executive_summary")) + "\n" + str(creatives.keys()),
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
        seo=final_creatives.get("seo") or creatives.get("seo") or {},
        social=final_creatives.get("social") or creatives.get("social") or {},
        video_concepts=final_creatives.get("video_concepts") or creatives.get("video_concepts") or {},
        messaging_whatsapp=final_creatives.get("messaging_whatsapp") or creatives.get("messaging_whatsapp") or {},
        creative_critique=state.get("critique") or {},
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
    }
