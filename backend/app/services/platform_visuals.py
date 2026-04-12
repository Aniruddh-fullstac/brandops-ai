"""Map social platforms to DALL·E 3 sizes (1024x1024 | 1024x1792 | 1792x1024) and human-readable specs."""

from __future__ import annotations

# OpenAI image API accepts exactly these three for dall-e-3
DalleSize = str


def normalize_platform_key(platform: str | None) -> str:
    if not platform:
        return "other"
    return str(platform).lower().strip().replace(" ", "_").replace("-", "_")


def dalle_size_and_label(platform: str | None) -> tuple[DalleSize, str]:
    """
    Return (openai_size, display_label_for_ui).
    Portrait: Stories/Reels/TikTok-style vertical.
    Landscape: LinkedIn/Twitter/blog headers.
    """
    p = normalize_platform_key(platform)
    if p in ("instagram", "tiktok", "video", "youtube"):
        return "1024x1792", "9:16 vertical (Stories/Reels-style)"
    if p in ("linkedin", "twitter", "blog", "seo"):
        return "1792x1024", "16:9 landscape"
    if p in ("email", "whatsapp", "push_notification"):
        return "1024x1024", "1:1 square (in-app / email hero)"
    return "1024x1024", "1:1 square"


def aspect_hint_for_http(size: DalleSize) -> str:
    """When using HTTP image backends, reinforce composition since size may not be controllable."""
    if size == "1024x1792":
        return "vertical9:16 portrait framing, mobile full-bleed, subject centered"
    if size == "1792x1024":
        return "wide16:9 landscape, safe space for text overlay on sides"
    return "square 1:1 balanced composition"
