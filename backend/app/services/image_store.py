from __future__ import annotations

import base64
import re
from pathlib import Path

import httpx

from app.config import Settings

_RUN_ID_RE = re.compile(r"^[a-f0-9]{8,64}$")
_FILENAME_RE = re.compile(r"^image_\d{2}\.(png|jpg|jpeg|webp)$", re.I)


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


def _mime_from_ext(ext: str) -> str:
    return {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(ext, "image/webp")


async def persist_remote_images(
    *,
    urls: list[str],
    run_id: str,
    settings: Settings,
) -> list[str]:
    """
    Download remote image URLs, save locally AND encode as base64 data URIs.
    Returns base64 data URIs for direct embedding (stored in Firestore).
    Also persists to disk as fallback.
    """
    if not urls or not is_safe_run_id(run_id):
        return []
    out_dir = run_media_dir(settings, run_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": "CampaignEngine/1.0"},
    ) as client:
        for i, url in enumerate(urls):
            if not url.startswith("http"):
                continue
            try:
                r = await client.get(url)
                r.raise_for_status()
            except Exception:  # noqa: BLE001
                continue
            if not (r.content and len(r.content) > 8):
                continue
            ext = _suffix_from_response(r)
            # Save to disk (fallback)
            path = out_dir / f"image_{i:02d}{ext}"
            path.write_bytes(r.content)
            # Encode as base64 data URI for Firestore storage
            mime = _mime_from_ext(ext)
            b64 = base64.b64encode(r.content).decode("ascii")
            data_uri = f"data:{mime};base64,{b64}"
            saved.append(data_uri)
    return saved
