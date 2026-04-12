from __future__ import annotations

from openai import AsyncOpenAI
from langgraph.graph import END, START, StateGraph

from app.config import Settings

from . import nodes
from .state import CampaignState


def build_campaign_graph(client: AsyncOpenAI, settings: Settings):
    g = StateGraph(CampaignState)

    async def ingest(s: CampaignState):
        return await nodes.node_ingest(s)

    async def brand_fetch(s: CampaignState):
        return await nodes.node_brand_fetch(s, client=client, settings=settings)

    async def parallel_research(s: CampaignState):
        return await nodes.node_parallel_research(s, client=client, settings=settings)

    async def seo_website(s: CampaignState):
        return await nodes.node_seo_website_optimizer(s, client=client, settings=settings)

    async def strategy(s: CampaignState):
        return await nodes.node_strategy(s, client=client, settings=settings)

    async def audience_segments(s: CampaignState):
        return await nodes.node_audience_segments(s, client=client, settings=settings)

    async def memory_resolve(s: CampaignState):
        return await nodes.node_memory_conflict_resolve(s, client=client, settings=settings)

    async def creatives(s: CampaignState):
        return await nodes.node_creative_suite(s, client=client, settings=settings)

    async def critic(s: CampaignState):
        return await nodes.node_critic(s, client=client, settings=settings)

    async def refine(s: CampaignState):
        return await nodes.node_refine(s, client=client, settings=settings)

    async def critic_recheck(s: CampaignState):
        return await nodes.node_critic_recheck(s, client=client, settings=settings)

    async def post_critic_parallel(s: CampaignState):
        return await nodes.node_post_critic_parallel(s, client=client, settings=settings)

    async def parallel_schedule_bundle(s: CampaignState):
        return await nodes.node_parallel_schedule_bundle(s, client=client, settings=settings)

    async def finalize(s: CampaignState):
        return await nodes.node_finalize(s, client=client, settings=settings)

    g.add_node("ingest", ingest)
    g.add_node("brand_fetch", brand_fetch)
    g.add_node("parallel_research", parallel_research)
    g.add_node("seo_website", seo_website)
    g.add_node("strategy", strategy)
    g.add_node("audience_segments", audience_segments)
    g.add_node("memory_resolve", memory_resolve)
    g.add_node("creatives", creatives)
    g.add_node("critic", critic)
    g.add_node("refine", refine)
    g.add_node("critic_recheck", critic_recheck)
    g.add_node("post_critic_parallel", post_critic_parallel)
    g.add_node("parallel_schedule_bundle", parallel_schedule_bundle)
    g.add_node("finalize", finalize)

    g.add_edge(START, "ingest")
    g.add_edge("ingest", "brand_fetch")
    g.add_edge("brand_fetch", "parallel_research")
    g.add_edge("parallel_research", "seo_website")
    g.add_edge("seo_website", "strategy")
    g.add_edge("strategy", "audience_segments")
    g.add_edge("audience_segments", "memory_resolve")
    g.add_edge("memory_resolve", "creatives")
    g.add_edge("creatives", "critic")

    def route_after_critic(state: CampaignState) -> str:
        if nodes._needs_refine(state.get("critique"), settings):
            return "refine"
        return "post_critic_parallel"

    g.add_conditional_edges(
        "critic",
        route_after_critic,
        {"refine": "refine", "post_critic_parallel": "post_critic_parallel"},
    )

    g.add_edge("refine", "critic_recheck")

    def route_after_recheck(state: CampaignState) -> str:
        rr = int(state.get("refine_round") or 0)
        if rr >= settings.critic_max_refine_rounds:
            return "post_critic_parallel"
        if nodes._needs_refine(state.get("critique_post_refine"), settings):
            return "refine"
        return "post_critic_parallel"

    g.add_conditional_edges(
        "critic_recheck",
        route_after_recheck,
        {"refine": "refine", "post_critic_parallel": "post_critic_parallel"},
    )

    g.add_edge("post_critic_parallel", "parallel_schedule_bundle")
    g.add_edge("parallel_schedule_bundle", "finalize")
    g.add_edge("finalize", END)

    return g.compile()
