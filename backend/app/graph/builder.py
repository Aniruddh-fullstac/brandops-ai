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

    async def strategy(s: CampaignState):
        return await nodes.node_strategy(s, client=client, settings=settings)

    async def creatives(s: CampaignState):
        return await nodes.node_creative_suite(s, client=client, settings=settings)

    async def critic(s: CampaignState):
        return await nodes.node_critic(s, client=client, settings=settings)

    async def refine(s: CampaignState):
        return await nodes.node_refine(s, client=client, settings=settings)

    async def post_critic_parallel(s: CampaignState):
        return await nodes.node_post_critic_parallel(s, client=client, settings=settings)

    async def parallel_schedule_bundle(s: CampaignState):
        return await nodes.node_parallel_schedule_bundle(s, client=client, settings=settings)

    async def finalize(s: CampaignState):
        return await nodes.node_finalize(s, client=client, settings=settings)

    g.add_node("ingest", ingest)
    g.add_node("brand_fetch", brand_fetch)
    g.add_node("parallel_research", parallel_research)
    g.add_node("strategy", strategy)
    g.add_node("creatives", creatives)
    g.add_node("critic", critic)
    g.add_node("refine", refine)
    g.add_node("post_critic_parallel", post_critic_parallel)
    g.add_node("parallel_schedule_bundle", parallel_schedule_bundle)
    g.add_node("finalize", finalize)

    # Main pipeline
    g.add_edge(START, "ingest")
    g.add_edge("ingest", "brand_fetch")
    g.add_edge("brand_fetch", "parallel_research")
    g.add_edge("parallel_research", "strategy")
    g.add_edge("strategy", "creatives")
    g.add_edge("creatives", "critic")

    # Conditional refinement: if critic scores low → refine → parallel wave, else → parallel wave
    g.add_conditional_edges(
        "critic",
        nodes.should_refine,
        {"refine": "refine", "post_critic_parallel": "post_critic_parallel"},
    )
    g.add_edge("refine", "post_critic_parallel")

    # Localize + keyword graph + timing + audience (parallel), then schedule + perf + visuals (parallel)
    g.add_edge("post_critic_parallel", "parallel_schedule_bundle")
    g.add_edge("parallel_schedule_bundle", "finalize")
    g.add_edge("finalize", END)

    return g.compile()
