from __future__ import annotations

import asyncio
import operator
from typing import Annotated, Any, TypedDict


class CampaignState(TypedDict, total=False):
    # Real-time activity queue — nodes push, stream handler drains
    _activity_queue: asyncio.Queue  # type: ignore[type-arg]
    request: dict[str, Any]
    run_id: str
    generate_images: bool

    brand_url: str | None
    brand_page_text: str | None
    brand_page_content_type: str | None

    competitor_research: dict[str, Any]
    social_research: dict[str, Any]
    trends_research: dict[str, Any]
    reddit_snapshot: dict[str, Any]
    brand_instagram_analysis: dict[str, Any]
    competitor_instagram_analysis: dict[str, Any]

    strategy: dict[str, Any]
    audience_segments: dict[str, Any]
    memory_resolution: dict[str, Any]
    creatives: dict[str, Any]
    critique: dict[str, Any]
    critique_post_refine: dict[str, Any]
    refined_creatives: dict[str, Any]
    refine_round: int
    localized: dict[str, Any]

    keyword_graph: dict[str, Any]
    campaign_calendar: dict[str, Any]
    content_schedule: dict[str, Any]
    performance_sim: dict[str, Any]

    image_prompts: list[str]
    image_urls: list[str]

    final_artifacts: dict[str, Any]

    trace: Annotated[list[dict[str, Any]], operator.add]
    errors: Annotated[list[str], operator.add]
    activities: Annotated[list[dict[str, Any]], operator.add]
