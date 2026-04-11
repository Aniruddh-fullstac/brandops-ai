from __future__ import annotations

import asyncio
import uuid
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings
from app.schemas.campaign import AgentTraceStep, CampaignArtifacts, CampaignRequest, SourceRef, ToolInvocation
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
    try:
        text, ctype = await fetch_url_text(url, settings)
        tools[0].result_summary = f"Fetched {len(text)} chars ({ctype or 'unknown'})."
        excerpt = text[:1200] + ("…" if len(text) > 1200 else "")
        summary = "Extracted readable text and light IA signals from the live site."
        return {
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
    pkt = await run_responses_web_research(
        client=client, settings=settings, instructions=instructions, user_input=user
    )
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
    pkt = await run_responses_web_research(
        client=client, settings=settings, instructions=instructions, user_input=user
    )
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
    pkt = await run_responses_web_research(
        client=client, settings=settings, instructions=instructions, user_input=user
    )
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


async def node_parallel_research(
    state: CampaignState, *, client: AsyncOpenAI, settings: Settings
) -> dict[str, Any]:
    c, s, t = await asyncio.gather(
        _competitor_agent(state, client, settings),
        _social_agent(state, client, settings),
        _trends_agent(state, client, settings),
    )
    trace = c["trace"] + s["trace"] + t["trace"]
    return {
        "trace": trace,
        "competitor_research": c["packet"],
        "social_research": s["packet"],
        "trends_research": t["packet"],
        "reddit_snapshot": s.get("reddit", {}),
    }


def _research_digest(state: CampaignState) -> str:
    parts: list[str] = []
    for key in ("competitor_research", "social_research", "trends_research"):
        blob = state.get(key) or {}
        parts.append(f"## {key}\n" + (blob.get("narrative") or "")[:5000])
        parts.append("Structured JSON:\n" + str(blob.get("structured"))[:4000])
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
    structured = await chat_json_object(
        client=client, model=settings.openai_model, system=system, user=user, temperature=0.35
    )
    return {
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


async def node_creative_suite(state: CampaignState, *, client: AsyncOpenAI, settings: Settings) -> dict[str, Any]:
    r = _req(state)
    base = build_node_context(state) + "\n\nStrategy JSON:\n" + str(state.get("strategy"))[:10_000]
    digest = _research_digest(state)[:8000]

    seo_task = _creative_json(
        client=client,
        settings=settings,
        role="You are an SEO & editorial lead.",
        system_schema=(
            "Return JSON: pillar_topics (array), cluster_map, target_keywords (array of {keyword, intent, page_type}), "
            "blog_outline (array of sections), meta_templates, internal_linking_plan, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest,
    )
    social_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a social creative director.",
        system_schema=(
            "Return JSON: linkedin (array of posts with hook, body, cta), instagram (array of carousel ideas), "
            "tiktok_or_reels (array of {hook, beat_sheet, on_screen_text}), reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest,
    )
    video_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a film-first storyteller.",
        system_schema=(
            "Return JSON: hero_spot (object with logline, scenes), product_demo_variants (array), "
            "ugc_briefs (array), production_notes, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest,
    )
    msg_task = _creative_json(
        client=client,
        settings=settings,
        role="You are a lifecycle & WhatsApp campaign designer.",
        system_schema=(
            "Return JSON: whatsapp_sequences (array of {name, messages:[{text, timing, cta}]}), "
            "sms_companion (array), compliance_notes, reasoning_summary."
        ),
        user_blob=base + "\nResearch:\n" + digest,
    )
    seo, social, video, msg = await asyncio.gather(seo_task, social_task, video_task, msg_task)
    bundle = {"seo": seo, "social": social, "video_concepts": video, "messaging_whatsapp": msg}
    return {
        **_trace_step(
            agent="creative_suite_orchestrator",
            phase="creative",
            title="Parallel channel copy generation",
            summary="SEO, social, video beats, and WhatsApp flows generated with shared strategy context.",
            reasoning="Runs four specialists concurrently after research-backed strategy to protect brand coherence.",
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
        return "localize"
    avg = sum(scores.values()) / max(len(scores), 1)
    if avg < 75 or any(v < 60 for v in scores.values()):
        return "refine"
    return "localize"


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
        channels = ["linkedin", "instagram", "blog", "email", "whatsapp"]

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
        image_prompts=state.get("image_prompts") or [],
        image_urls=state.get("image_urls") or [],
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
