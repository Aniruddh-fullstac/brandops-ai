from __future__ import annotations

from urllib.parse import quote_plus

import httpx


async def reddit_search_posts(
    query: str,
    limit: int = 12,
    timeout_s: float = 20.0,
) -> list[dict]:
    """
    Public Reddit JSON search (no API key). Best-effort social listening.
    """
    q = quote_plus(query)
    url = f"https://www.reddit.com/search.json?q={q}&sort=relevance&limit={limit}"
    headers = {"User-Agent": "CampaignEngine/1.0 (brand research)"}
    async with httpx.AsyncClient(timeout=timeout_s, headers=headers) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()
    out: list[dict] = []
    for child in data.get("data", {}).get("children", []):
        p = child.get("data") or {}
        out.append(
            {
                "title": p.get("title"),
                "subreddit": p.get("subreddit"),
                "permalink": "https://www.reddit.com" + p.get("permalink", ""),
                "score": p.get("score"),
                "num_comments": p.get("num_comments"),
                "selftext": (p.get("selftext") or "")[:800],
            }
        )
    return out
