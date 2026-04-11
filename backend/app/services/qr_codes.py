"""PNG QR codes for campaign landing URLs."""

from __future__ import annotations

import io

import segno


def qr_png_bytes(data: str, scale: int = 8) -> bytes:
    qr = segno.make(data, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=scale, dark="#0f172a", light="#ffffff")
    return buf.getvalue()
