from __future__ import annotations

import urllib.parse

import httpx
from openai import AsyncOpenAI

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
    client: AsyncOpenAI,
    settings: Settings,
    prompt: str,
    size: str,
) -> str | None:
    """
    Single render. `size` must be 1024x1024, 1024x1792, or 1792x1024 for dall-e-3.
    HTTP provider ignores pixel size; aspect is reinforced in the prompt.
    """
    p = (prompt or "").strip()
    if not p:
        return None
    if settings.image_provider.lower() == "http":
        hint = aspect_hint_for_http(size)  # type: ignore[arg-type]
        full = f"{p[:3600]}. {hint}."
        urls = await _images_via_http(settings, [full])
        return urls[0] if urls else None
    if size not in ("1024x1024", "1024x1792", "1792x1024"):
        size = "1024x1024"
    try:
        img = await client.images.generate(
            model=settings.image_model,
            prompt=p[:3900],
            size=size,  # type: ignore[arg-type]
            quality="standard",
            n=1,
        )
    except Exception:  # noqa: BLE001
        return None
    u = img.data[0].url if img.data else None
    return str(u) if u else None


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
