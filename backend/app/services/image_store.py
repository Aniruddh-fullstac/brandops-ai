from __future__ import annotations

import asyncio
import re
from pathlib import Path

import httpx

from app.config import Settings

_RUN_ID_RE = re.compile(r"^[a-f0-9]{8,64}$")
_FILENAME_RE = re.compile(
    r"^(image_\d{2}|sch_[a-zA-Z0-9._-]{1,80})\.(png|jpg|jpeg|webp)$",
    re.I,
)


def is_safe_run_id(run_id: str) -> bool:
    return bool(_RUN_ID_RE.match(run_id))


def is_safe_media_filename(name: str) -> bool:
    return bool(_FILENAME_RE.match(name))


def run_media_dir(settings: Settings, run_id: str) -> Path:
    return Path(settings.media_root) / "runs" / run_id


def _suffix_from_response(r: httpx.Response) -> str:
    ct = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
    if "webp" in ct:
        return ".webp"
    if "png" in ct:
        return ".png"
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    body = r.content[:12]
    if len(body) >= 12 and body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return ".webp"
    if len(body) >= 8 and body[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if len(body) >= 3 and body[:3] == b"\xff\xd8\xff":
        return ".jpg"
    return ".webp"


def _media_url(run_id: str, filename: str) -> str:
    """URL path served by ``GET /api/media/runs/{run_id}/{filename}`` (not stored as base64 in Firestore)."""
    return f"/api/media/runs/{run_id}/{filename}"


async def persist_remote_image(
    *,
    url: str,
    run_id: str,
    settings: Settings,
    basename: str,
) -> str | None:
    """Download one URL, save under ``media_root/runs/{run_id}/``, return API path (no base64)."""
    if not url.startswith("http") or not is_safe_run_id(run_id):
        return None
    safe_base = re.sub(r"[^a-zA-Z0-9._-]+", "_", basename).strip("._")[:80] or "img"
    out_dir = run_media_dir(settings, run_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": "CampaignEngine/1.0"},
    ) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except Exception:  # noqa: BLE001
            return None
        if not (r.content and len(r.content) > 8):
            return None
        ext = _suffix_from_response(r)
        filename = f"{safe_base}{ext}"
        path = out_dir / filename
        path.write_bytes(r.content)
        return _media_url(run_id, filename)


async def persist_remote_images(
    *,
    urls: list[str],
    run_id: str,
    settings: Settings,
) -> list[str]:
    """
    Download remote image URLs to ``media_root/runs/{run_id}/``.
    Returns ``/api/media/runs/...`` paths only (small strings safe for Firestore — not base64).
    """
    if not urls or not is_safe_run_id(run_id):
        return []
    out_dir = run_media_dir(settings, run_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    indexed = [(i, u) for i, u in enumerate(urls) if u.startswith("http")]

    async def fetch_one(client: httpx.AsyncClient, i: int, url: str) -> tuple[int, str] | None:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except Exception:  # noqa: BLE001
            return None
        if not (r.content and len(r.content) > 8):
            return None
        ext = _suffix_from_response(r)
        filename = f"image_{i:02d}{ext}"
        path = out_dir / filename
        path.write_bytes(r.content)
        return (i, _media_url(run_id, filename))

    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": "CampaignEngine/1.0"},
    ) as client:
        parts = await asyncio.gather(
            *[fetch_one(client, i, url) for i, url in indexed],
            return_exceptions=True,
        )
    ok: list[tuple[int, str]] = []
    for p in parts:
        if isinstance(p, Exception) or p is None:
            continue
        ok.append(p)
    ok.sort(key=lambda t: t[0])
    return [path for _, path in ok]
