from __future__ import annotations

import urllib.parse

import httpx
from openai import AsyncOpenAI

from app.config import Settings


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


async def generate_campaign_images(
    *,
    client: AsyncOpenAI,
    settings: Settings,
    prompts: list[str],
) -> list[str]:
    """
    Returns loadable image URLs. Default: HTTP GET to Pix (raw image/webp). Use IMAGE_PROVIDER=openai for DALL·E.
    """
    cap = max(0, settings.max_image_variants)
    trimmed = [p.strip() for p in prompts[:cap] if p.strip()]
    if not trimmed:
        return []

    if settings.image_provider.lower() == "http":
        return await _images_via_http(settings, trimmed)

    urls: list[str] = []
    for p in trimmed:
        try:
            img = await client.images.generate(
                model=settings.image_model,
                prompt=p[:3900],
                size="1024x1024",
                quality="standard",
                n=1,
            )
        except Exception:  # noqa: BLE001
            continue
        u = img.data[0].url if img.data else None
        if u:
            urls.append(u)
    return urls


async def _images_via_http(settings: Settings, prompts: list[str]) -> list[str]:
    tpl = (settings.image_http_template or "").strip()
    if "{prompt}" not in tpl and "{prompt_raw}" not in tpl:
        return []
    urls: list[str] = []
    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": "CampaignEngine/1.0"},
    ) as http:
        for p in prompts:
            enc = urllib.parse.quote(p[:3900], safe="")
            url = tpl.replace("{prompt}", enc).replace("{prompt_raw}", p[:3900])
            try:
                resp = await http.get(url)
            except Exception:  # noqa: BLE001
                continue
            if _is_image_response(resp):
                urls.append(str(resp.url))
                continue
            if resp.status_code in (301, 302, 303, 307, 308):
                loc = resp.headers.get("location")
                if loc:
                    urls.append(loc)
    return urls
