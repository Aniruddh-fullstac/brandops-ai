from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


class SourceRef(BaseModel):
    url: str
    title: str | None = None


class ToolInvocation(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result_summary: str | None = None


class AgentTraceStep(BaseModel):
    id: str
    agent: str
    phase: Literal[
        "ingest",
        "brand_fetch",
        "research",
        "strategy",
        "creative",
        "critic",
        "refine",
        "localize",
        "keyword_graph",
        "timing",
        "content_schedule",
        "audience",
        "performance",
        "visual",
        "finalize",
        "memory",
        "critic_recheck",
        "seo_website",
    ]
    title: str
    summary: str | None = None
    reasoning: str | None = None
    sources: list[SourceRef] = Field(default_factory=list)
    web_queries: list[str] = Field(default_factory=list)
    tool_calls: list[ToolInvocation] = Field(default_factory=list)
    structured: dict[str, Any] | None = None
    raw_text_excerpt: str | None = None


class CampaignRequest(BaseModel):
    brand_name: str = Field(..., min_length=1, max_length=200)
    brand_url: HttpUrl | None = None
    instagram_handle: str | None = Field(
        None,
        max_length=100,
        description="Brand's Instagram handle (without @). Used for post + comment analysis.",
    )
    additional_context: str | None = Field(None, max_length=120_000)
    geography_primary: str = Field("United States", max_length=120)
    geography_secondary: str = Field("India", max_length=120)
    industry_hint: str | None = Field(None, max_length=200)
    generate_images: bool = Field(True)
    locations: list[str] = Field(
        default_factory=list,
        max_length=24,
        description="Target markets / storefronts (client profile). Syncs geography_primary/secondary when set.",
    )
    company_tagline: str | None = Field(None, max_length=500)
    target_audience_hint: str | None = Field(None, max_length=4000)

    @field_validator("locations", mode="before")
    @classmethod
    def _normalize_locations(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            parts = [p.strip() for p in v.replace(";", ",").split(",") if p.strip()]
            return parts[:24]
        if isinstance(v, list):
            out: list[str] = []
            for x in v:
                s = str(x).strip()
                if s and s not in out:
                    out.append(s)
            return out[:24]
        return []

    @model_validator(mode="after")
    def _sync_geographies_from_locations(self) -> CampaignRequest:
        locs = [x.strip() for x in self.locations if x and str(x).strip()]
        if not locs:
            return self
        object.__setattr__(self, "geography_primary", locs[0][:120])
        if len(locs) >= 2:
            object.__setattr__(self, "geography_secondary", locs[1][:120])
        else:
            object.__setattr__(self, "geography_secondary", locs[0][:120])
        return self


class CampaignArtifacts(BaseModel):
    executive_summary: str
    positioning: dict[str, Any]
    competitor_landscape: dict[str, Any]
    audience_and_messaging: dict[str, Any]
    channel_strategy: dict[str, Any]
    seo_website_optimization: dict[str, Any] = Field(
        default_factory=dict,
        description="Web-researched, site-grounded SEO audit with prioritized actions and reasoning.",
    )
    seo: dict[str, Any]
    social: dict[str, Any]
    video_concepts: dict[str, Any]
    messaging_whatsapp: dict[str, Any]
    creative_critique: dict[str, Any]
    creative_critique_post_refine: dict[str, Any] = Field(
        default_factory=dict,
        description="Second QA pass on refined creatives (present when refinement ran).",
    )
    original_creatives: dict[str, Any] = Field(
        default_factory=dict,
        description="Pre-refinement creative bundle for diffing against delivered copy.",
    )
    memory_resolution: dict[str, Any] = Field(
        default_factory=dict,
        description="Cross-agent conflict detection and unified guardrails for creatives.",
    )
    refined_creatives: dict[str, Any] = Field(default_factory=dict)
    localized: dict[str, Any]
    keyword_graph: dict[str, Any] = Field(default_factory=dict)
    campaign_calendar: dict[str, Any] = Field(default_factory=dict)
    audience_segments: dict[str, Any] = Field(default_factory=dict)
    performance_sim: dict[str, Any] = Field(default_factory=dict)
    content_schedule: dict[str, Any] = Field(
        default_factory=dict,
        description="Unified per-platform copy + timeline (captions, hashtags, email, WhatsApp, push).",
    )
    image_prompts: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list)
    brand_instagram_analysis: dict[str, Any] = Field(
        default_factory=dict,
        description="Brand's own Instagram: post metrics, top-post vision analysis, sentiment from comments.",
    )
    competitor_instagram_analysis: dict[str, Any] = Field(
        default_factory=dict,
        description="Competitor Instagram handles, engagement benchmarks, and comment sentiment.",
    )


class CampaignResult(BaseModel):
    request: CampaignRequest
    trace: list[AgentTraceStep]
    artifacts: CampaignArtifacts


class AgentActivity(BaseModel):
    """Lightweight progress update emitted while a node is working."""

    id: str
    phase: str
    agent: str
    action: str  # e.g. "fetching_url", "web_search", "llm_call", "tool_call", "generating_image"
    detail: str  # brand-specific description e.g. "Searching: Napptix competitors India gaming"
    url: str | None = None  # the URL being fetched/visited
    tool: str | None = None  # tool name if applicable
    progress: str | None = None  # e.g. "2/4 images generated"


class SSEEnvelope(BaseModel):
    event: Literal[
        "run_started",
        "step_completed",
        "graph_node_finished",
        "artifact_partial",
        "agent_activity",
        "run_completed",
        "run_failed",
    ]
    payload: dict[str, Any]
