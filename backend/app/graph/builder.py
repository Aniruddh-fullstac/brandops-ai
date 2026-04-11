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

    async def audience(s: CampaignState):
        return await nodes.node_audience_segments(s, client=client, settings=settings)

    async def keyword_graph(s: CampaignState):
        return await nodes.node_keyword_graph(s, client=client, settings=settings)

    async def timing(s: CampaignState):
        return await nodes.node_timing(s, client=client, settings=settings)

    async def perf_sim(s: CampaignState):
        return await nodes.node_performance_sim(s, client=client, settings=settings)

    async def localize(s: CampaignState):
        return await nodes.node_localize(s, client=client, settings=settings)

    async def visuals(s: CampaignState):
        return await nodes.node_visuals(s, client=client, settings=settings)

    async def finalize(s: CampaignState):
        return await nodes.node_finalize(s, client=client, settings=settings)

    g.add_node("ingest", ingest)
    g.add_node("brand_fetch", brand_fetch)
    g.add_node("parallel_research", parallel_research)
    g.add_node("strategy", strategy)
    g.add_node("creatives", creatives)
    g.add_node("critic", critic)
    g.add_node("refine", refine)
    g.add_node("audience", audience)
    g.add_node("keyword_graph", keyword_graph)
    g.add_node("timing", timing)
    g.add_node("perf_sim", perf_sim)
    g.add_node("localize", localize)
    g.add_node("visuals", visuals)
    g.add_node("finalize", finalize)

    # Main pipeline
    g.add_edge(START, "ingest")
    g.add_edge("ingest", "brand_fetch")
    g.add_edge("brand_fetch", "parallel_research")
    g.add_edge("parallel_research", "strategy")
    g.add_edge("strategy", "creatives")
    g.add_edge("creatives", "critic")

    # Conditional refinement: if critic scores low → refine → localize, else → localize
    g.add_conditional_edges("critic", nodes.should_refine, {"refine": "refine", "localize": "localize"})
    g.add_edge("refine", "localize")

    # After localize: parallel deterministic engines + visuals
    g.add_edge("localize", "keyword_graph")
    g.add_edge("keyword_graph", "timing")
    g.add_edge("timing", "audience")
    g.add_edge("audience", "perf_sim")
    g.add_edge("perf_sim", "visuals")
    g.add_edge("visuals", "finalize")
    g.add_edge("finalize", END)

    return g.compile()
