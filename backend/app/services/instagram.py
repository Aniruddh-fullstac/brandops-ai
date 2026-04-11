"""Instagram public profile scraper — no auth required for public accounts."""
from __future__ import annotations

import base64
from typing import Any

import httpx

# Posts below this combined (likes + comments) are skipped for vision analysis
ENGAGEMENT_THRESHOLD = 50

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "x-ig-app-id": "936619743392459",
    "Referer": "https://www.instagram.com/",
    "Origin": "https://www.instagram.com",
}


async def fetch_instagram_posts(
    handle: str,
    max_posts: int = 12,
    timeout_s: float = 20.0,
) -> dict[str, Any]:
    """
    Fetch recent posts for a public Instagram profile.
    Returns: {profile, posts, error}.
    """
    handle = handle.strip().lstrip("@")
    url = (
        f"https://www.instagram.com/api/v1/users/web_profile_info/"
        f"?username={handle}"
    )
    try:
        async with httpx.AsyncClient(
            timeout=timeout_s,
            headers=_HEADERS,
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return {"profile": {}, "posts": [], "error": str(exc)}

    user = (data.get("data") or {}).get("user") or {}
    profile = {
        "username": user.get("username"),
        "full_name": user.get("full_name"),
        "biography": user.get("biography"),
        "followers": (user.get("edge_followed_by") or {}).get("count"),
        "following": (user.get("edge_follow") or {}).get("count"),
        "post_count": (user.get("edge_owner_to_timeline_media") or {}).get("count"),
    }

    raw_posts = (
        (user.get("edge_owner_to_timeline_media") or {}).get("edges") or []
    )
    posts: list[dict[str, Any]] = []
    for edge in raw_posts[:max_posts]:
        node = edge.get("node") or {}
        caption_edges = (node.get("edge_media_to_caption") or {}).get("edges") or []
        caption = (
            (caption_edges[0].get("node") or {}).get("text", "")
            if caption_edges
            else ""
        )
        likes: int = (
            (node.get("edge_liked_by") or {}).get("count")
            or (node.get("edge_media_preview_like") or {}).get("count")
            or 0
        )
        comments: int = (node.get("edge_media_to_comment") or {}).get("count") or 0
        posts.append(
            {
                "shortcode": node.get("shortcode"),
                "url": f"https://www.instagram.com/p/{node.get('shortcode')}/",
                "image_url": node.get("display_url"),
                "thumbnail_url": node.get("thumbnail_src") or node.get("display_url"),
                "likes": likes,
                "comments": comments,
                "engagement": likes + comments,
                "caption": caption[:500],
                "is_video": node.get("is_video", False),
                "timestamp": node.get("taken_at_timestamp"),
            }
        )

    return {"profile": profile, "posts": posts, "error": None}


async def fetch_image_base64(url: str, timeout_s: float = 15.0) -> str | None:
    """
    Download an image and return it as a base64 data URI for GPT-4o vision.
    Returns None on any error so callers can skip gracefully.
    """
    if not url:
        return None
    try:
        async with httpx.AsyncClient(
            timeout=timeout_s,
            follow_redirects=True,
            headers={"User-Agent": _HEADERS["User-Agent"]},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            b64 = base64.b64encode(resp.content).decode()
            return f"data:{ct};base64,{b64}"
    except Exception:
        return None
