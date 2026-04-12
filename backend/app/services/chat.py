"""
Chat Agent Router — picks the right agent(s) for a user query,
runs them, and streams results back.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.config import Settings
from app.services.llm import chat_json_object, chat_text
from app.services.openai_responses import run_responses_web_research
from app.services.fetch import fetch_url_text


# ── Agent registry ───────────────────────────────────────────────
AGENT_REGISTRY = [
    {
        "id": "competitor_intel",
        "name": "Competitor Intelligence",
        "icon": "swords",
        "description": "Searches the web for competing brands, pricing posture, positioning, and notable campaigns.",
        "triggers": ["competitor", "competition", "rival", "versus", "vs", "compare", "benchmark", "market share", "who else"],
    },
    {
        "id": "social_intel",
        "name": "Social Media Intelligence",
        "icon": "share-2",
        "description": "Analyzes Reddit discussions, platform-native tactics on LinkedIn/Instagram/YouTube, engagement patterns and influencer trends.",
        "triggers": ["social media", "reddit", "linkedin", "instagram", "youtube", "influencer", "engagement", "viral", "content strategy", "hashtag"],
    },
    {
        "id": "market_trends",
        "name": "Market Trends Analyst",
        "icon": "trending-up",
        "description": "Identifies macro trends, seasonal moments, regulatory shifts in the next 90 days.",
        "triggers": ["trend", "trending", "market", "seasonal", "regulation", "industry", "macro", "forecast", "outlook", "growth"],
    },
    {
        "id": "brand_analyst",
        "name": "Brand Site Analyst",
        "icon": "globe",
        "description": "Crawls and analyzes a brand's website for positioning, tone, product information, and IA signals.",
        "triggers": ["website", "site", "brand page", "landing page", "positioning", "brand identity", "brand analysis", "url"],
    },
    {
        "id": "strategy",
        "name": "Strategy Synthesizer",
        "icon": "target",
        "description": "Synthesizes research into positioning, audience definition, messaging pillars, and channel strategy.",
        "triggers": ["strategy", "positioning", "audience", "messaging", "channel plan", "go-to-market", "gtm", "campaign plan"],
    },
    {
        "id": "creative_suite",
        "name": "Creative Suite",
        "icon": "palette",
        "description": "Generates creative concepts: SEO copy, social posts, video concepts, WhatsApp messaging.",
        "triggers": ["creative", "copy", "content", "seo", "ad copy", "headline", "hook", "caption", "email", "whatsapp", "video script"],
    },
    {
        "id": "keyword_engine",
        "name": "Keyword Graph Engine",
        "icon": "network",
        "description": "Builds co-occurrence keyword graphs using PageRank to identify keyword clusters and strategic importance.",
        "triggers": ["keyword", "seo keywords", "search terms", "keyword cluster", "pagerank", "search strategy"],
    },
    {
        "id": "performance_sim",
        "name": "Performance Simulator",
        "icon": "bar-chart-3",
        "description": "Estimates reach, engagement, and conversions per channel with confidence-weighted forecasts.",
        "triggers": ["performance", "forecast", "projection", "roi", "reach", "conversion", "ctr", "engagement rate", "kpi"],
    },
]


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"data: {json.dumps({'event': event, 'payload': payload}, default=str)}\n\n"


async def route_query(
    *,
    client: AsyncOpenAI,
    settings: Settings,
    query: str,
    brand_name: str | None = None,
    brand_url: str | None = None,
    campaign_context: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    """
    Stream SSE events:
      - chat_started
      - agents_selected (which agents were picked)
      - agent_working (real-time agent activity)
      - agent_result (individual agent output)
      - chat_answer (final synthesized answer)
      - chat_failed
    """
    chat_id = uuid.uuid4().hex[:12]
    yield _sse("chat_started", {"chat_id": chat_id})

    # ── Step 1: Route the query to the right agent(s) ────────────
    agent_descriptions = "\n".join(
        f"- {a['id']}: {a['description']}" for a in AGENT_REGISTRY
    )

    # Build context from existing campaign data if available
    context_summary = ""
    if campaign_context:
        artifacts = campaign_context.get("artifacts", {})
        context_parts = []
        if artifacts.get("executive_summary"):
            context_parts.append(f"Executive Summary: {str(artifacts['executive_summary'])[:500]}")
        if artifacts.get("positioning"):
            context_parts.append(f"Positioning: {json.dumps(artifacts['positioning'], default=str)[:400]}")
        if artifacts.get("competitor_landscape"):
            context_parts.append(f"Competitor Landscape: {json.dumps(artifacts['competitor_landscape'], default=str)[:400]}")
        if artifacts.get("audience_and_messaging"):
            context_parts.append(f"Audience & Messaging: {json.dumps(artifacts['audience_and_messaging'], default=str)[:400]}")
        if artifacts.get("memory_resolution"):
            context_parts.append(f"Memory / conflict resolution: {json.dumps(artifacts['memory_resolution'], default=str)[:400]}")
        if artifacts.get("channel_strategy"):
            context_parts.append(f"Channel Strategy: {json.dumps(artifacts['channel_strategy'], default=str)[:300]}")
        if artifacts.get("seo"):
            context_parts.append(f"SEO: {json.dumps(artifacts['seo'], default=str)[:300]}")
        if artifacts.get("social"):
            context_parts.append(f"Social: {json.dumps(artifacts['social'], default=str)[:300]}")
        if context_parts:
            context_summary = "\n\n--- EXISTING CAMPAIGN KNOWLEDGE BASE ---\n" + "\n".join(context_parts)

    routing_prompt = f"""You are an intelligent agent router. Given a user query about a brand or marketing topic,
select the 1-3 most relevant agents to answer the query. Also decide if the existing campaign knowledge base
already contains enough information to answer directly without running agents.

Available agents:
{agent_descriptions}

{f"Brand name: {brand_name}" if brand_name else ""}
{f"Brand URL: {brand_url}" if brand_url else ""}
{context_summary}

User query: "{query}"

Return JSON with:
- "agents": list of agent IDs to activate (1-3 max, empty if knowledge base suffices)
- "can_answer_from_context": boolean — true if the existing knowledge base already has the answer
- "search_queries": list of 1-2 web search queries to run for each agent
- "reasoning": brief explanation of why you picked these agents"""

    try:
        routing, _u_route = await chat_json_object(
            client=client,
            model=settings.openai_model_fast,
            system="You are an agent routing system. Pick the right agents for the user query.",
            user=routing_prompt,
            phase="chat",
        )
    except Exception as exc:
        yield _sse("chat_failed", {"error": f"Routing failed: {exc}"})
        return

    selected_ids = routing.get("agents", [])
    can_answer = routing.get("can_answer_from_context", False)
    search_queries = routing.get("search_queries", [])
    reasoning = routing.get("reasoning", "")

    selected_agents = [a for a in AGENT_REGISTRY if a["id"] in selected_ids]

    yield _sse("agents_selected", {
        "agents": [{"id": a["id"], "name": a["name"], "icon": a["icon"]} for a in selected_agents],
        "reasoning": reasoning,
        "can_answer_from_context": can_answer,
    })

    # ── Step 2: If context is sufficient, answer directly ────────
    if can_answer and context_summary:
        yield _sse("agent_working", {
            "agent_id": "knowledge_base",
            "agent_name": "Knowledge Base",
            "status": "Analyzing existing campaign data...",
        })

        answer, _u_kb = await chat_text(
            client=client,
            model=settings.openai_model,
            system=f"""You are a marketing intelligence assistant. Answer the user's question using the campaign
knowledge base below. Be specific, data-driven, and actionable. Format with markdown.
{context_summary}""",
            user=query,
            phase="chat",
        )

        yield _sse("agent_result", {
            "agent_id": "knowledge_base",
            "agent_name": "Knowledge Base",
            "icon": "database",
            "output": answer,
            "sources": [],
        })
        yield _sse("chat_answer", {"answer": answer, "sources": []})
        return

    # ── Step 3: Run selected agents in parallel ──────────────────
    all_sources: list[dict[str, str]] = []
    agent_outputs: list[dict[str, Any]] = []

    async def run_agent(agent: dict[str, Any]) -> dict[str, Any]:
        agent_id = agent["id"]
        agent_name = agent["name"]

        brand_ctx = f"Brand: {brand_name}" if brand_name else ""
        if brand_url:
            brand_ctx += f" | URL: {brand_url}"

        instructions = f"""You are the {agent_name} agent. {agent['description']}
{brand_ctx}
{context_summary}

Provide a thorough, data-driven analysis. Use markdown formatting. Include specific findings,
numbers, and actionable recommendations. Be concise but comprehensive."""

        user_input = f"""Query: {query}

Research this topic thoroughly. Provide specific findings with evidence and sources."""

        try:
            packet, _u_wr = await run_responses_web_research(
                client=client,
                settings=settings,
                instructions=instructions,
                user_input=user_input,
                phase="chat",
            )
            return {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "icon": agent["icon"],
                "output": packet.text,
                "sources": packet.sources,
                "web_queries": packet.web_queries,
            }
        except Exception as exc:
            return {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "icon": agent["icon"],
                "output": f"Agent encountered an error: {exc}",
                "sources": [],
                "web_queries": [],
            }

    # Run agents and stream their progress
    if selected_agents:
        tasks = []
        for agent in selected_agents:
            yield _sse("agent_working", {
                "agent_id": agent["id"],
                "agent_name": agent["name"],
                "status": "Searching the web and analyzing data...",
            })
            tasks.append(run_agent(agent))

        results = await asyncio.gather(*tasks)

        for res in results:
            agent_outputs.append(res)
            all_sources.extend(res.get("sources", []))
            yield _sse("agent_result", res)

    # ── Step 4: Synthesize final answer ──────────────────────────
    if agent_outputs:
        yield _sse("agent_working", {
            "agent_id": "synthesizer",
            "agent_name": "Answer Synthesizer",
            "status": "Combining insights from all agents...",
        })

        agent_findings = "\n\n".join(
            f"## {r['agent_name']} Findings:\n{r['output']}" for r in agent_outputs
        )

        final_answer, _u_syn = await chat_text(
            client=client,
            model=settings.openai_model,
            system=f"""You are a senior marketing strategist synthesizing research from multiple specialist agents.
Provide a cohesive, actionable answer. Use markdown. Highlight key insights, data points, and recommendations.
Structure with clear sections. Be specific and strategic.
{context_summary}""",
            user=f"""Original question: {query}

Agent findings:
{agent_findings}

Synthesize these findings into a comprehensive, well-structured answer.
Include key takeaways and specific action items.""",
            phase="chat",
        )

        # Deduplicate sources
        seen_urls: set[str] = set()
        unique_sources = []
        for s in all_sources:
            url = s.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_sources.append(s)

        yield _sse("chat_answer", {
            "answer": final_answer,
            "sources": unique_sources[:10],
        })
    else:
        # No agents selected, try a direct answer
        answer, _u_direct = await chat_text(
            client=client,
            model=settings.openai_model,
            system="You are a marketing intelligence assistant. Provide helpful, actionable advice.",
            user=query,
            phase="chat",
        )
        yield _sse("chat_answer", {"answer": answer, "sources": []})
