"""Offline QR campaign — create, public view, survey submit."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:48] or "campaign"


class OfflineCampaignCreate(BaseModel):
    """When `source_campaign_id` is set, the client ties this QR bundle to the main (agent) campaign selected in the app."""

    title: str = Field(..., min_length=2, max_length=120)
    headline: str = Field("", max_length=200)
    description: str = Field("", max_length=2000)
    brand_name: str = Field("", max_length=120)
    source_campaign_id: str = Field("", max_length=80)
    promo_image_urls: list[str] = Field(default_factory=list, max_length=12)
    product_options: list[str] = Field(
        default_factory=list,
        description="Labels visitors can pick (likes / product interest).",
        max_length=24,
    )
    interest_tags: list[str] = Field(default_factory=list, max_length=24)
    collect_name: bool = True
    collect_email: bool = True
    collect_phone: bool = False
    collect_age_range: bool = True
    status: Literal["draft", "active"] = "draft"
    # If set, generated QR + dashboard links include ?loc=… (placement / store id).
    default_qr_location: str = Field("", max_length=120)


class OfflineCampaignPublic(BaseModel):
    id: str
    slug: str
    title: str
    headline: str
    description: str
    brand_name: str
    promo_image_urls: list[str]
    product_options: list[str]
    interest_tags: list[str]
    collect_name: bool
    collect_email: bool
    collect_phone: bool
    collect_age_range: bool


class OfflineSurveySubmit(BaseModel):
    session_id: str | None = Field(None, max_length=80)
    location_label: str | None = Field(None, max_length=120)
    selected_products: list[str] = Field(default_factory=list, max_length=32)
    rating: int | None = Field(None, ge=1, le=5)
    interests: list[str] = Field(default_factory=list, max_length=32)
    name: str | None = Field(None, max_length=120)
    email: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=40)
    age_range: str | None = Field(None, max_length=40)
    consent_marketing: bool = False
    consent_analytics: bool = True

    @field_validator("selected_products", "interests", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> Any:
        if not isinstance(v, list):
            return v
        out: list[str] = []
        for x in v:
            if isinstance(x, str) and x.strip():
                out.append(x.strip()[:200])
        return out[:32]


class OfflineSubmitResult(BaseModel):
    ok: bool = True
    session_id: str
    is_return_visit: bool


class OfflineEventIn(BaseModel):
    """Public telemetry: page views, carousel, taps (no PII in meta)."""

    session_id: str = Field(..., max_length=80)
    location_label: str | None = Field(None, max_length=120)
    event_type: str = Field(
        ...,
        max_length=48,
        description="e.g. page_view, carousel_next, rating_select, interest_toggle",
    )
    meta: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_type")
    @classmethod
    def normalize_event(cls, v: str) -> str:
        t = (v or "").strip().lower().replace(" ", "_")
        if not t or len(t) > 48:
            raise ValueError("invalid event_type")
        return t[:48]


class OfflineEventResult(BaseModel):
    ok: bool = True
