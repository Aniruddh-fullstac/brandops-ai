from __future__ import annotations

import asyncio
import urllib.parse

import httpx

from app.config import Settings
from app.services.platform_visuals import aspect_hint_for_http


def _is_image_response(resp: httpx.Response) -> bool:
    if resp.status_code != 200:
        return False
    ct = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ct.startswith("image/"):
        return True
    # Binary WebP without proper header
    b = resp.content[:12]
    if len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return True
    if len(b) >= 8 and b[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    return False


async def generate_one_image(
    *,
    settings: Settings,
    prompt: str,
    size: str,
) -> str | None:
    """
    Single render via Pranav Pix (HTTP GET). ``size`` selects aspect hint text; pixel size is up to Pix.
    """
    p = (prompt or "").strip()
    if not p:
        return None
    hint = aspect_hint_for_http(size)  # type: ignore[arg-type]
    full = f"{p[:3600]}. {hint}."
    urls = await _images_via_http(settings, [full])
    return urls[0] if urls else None


async def generate_campaign_images(
    *,
    settings: Settings,
    prompts: list[str],
) -> list[str]:
    """
    Returns loadable image URLs from ``IMAGE_HTTP_TEMPLATE`` (Pranav Pix GET → raw image/webp).
    Requests run in parallel (bounded by ``settings.image_generation_concurrency``).
    """
    cap = max(0, settings.max_image_variants)
    trimmed = [p.strip() for p in prompts[:cap] if p.strip()]
    if not trimmed:
        return []
    return await _images_via_http(settings, trimmed)


async def _images_via_http(settings: Settings, prompts: list[str]) -> list[str]:
    tpl = (settings.image_http_template or "").strip()
    if "{prompt}" not in tpl and "{prompt_raw}" not in tpl:
        return []

    sem = asyncio.Semaphore(settings.image_generation_concurrency)

    async def fetch_one(http: httpx.AsyncClient, p: str) -> str | None:
        async with sem:
            enc = urllib.parse.quote(p[:3900], safe="")
            url = tpl.replace("{prompt}", enc).replace("{prompt_raw}", p[:3900])
            try:
                resp = await http.get(url)
            except Exception:  # noqa: BLE001
                return None
            if _is_image_response(resp):
                return str(resp.url)
            if resp.status_code in (301, 302, 303, 307, 308):
                loc = resp.headers.get("location")
                if loc:
                    return loc
            return None

    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": "CampaignEngine/1.0"},
    ) as http:
        results = await asyncio.gather(
            *[fetch_one(http, p) for p in prompts],
            return_exceptions=True,
        )
    urls: list[str] = []
    for part in results:
        if isinstance(part, Exception):
            continue
        if part:
            urls.append(part)
    return urls
