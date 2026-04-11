"""Approximate geo from visitor IP (server-side). Uses ip-api.com free tier."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

IP_API_FIELDS = "status,message,country,countryCode,regionName,city,lat,lon,isp,org,query"


async def lookup_ip(ip: str) -> dict[str, Any]:
    if not ip or ip in ("127.0.0.1", "::1", "unknown"):
        return {}
    url = f"http://ip-api.com/json/{ip}?fields={IP_API_FIELDS}"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception as exc:  # noqa: BLE001
        logger.debug("geo lookup failed for %s: %s", ip, exc)
        return {}
    if data.get("status") != "success":
        return {}
    return {
        "country": data.get("country") or "",
        "country_code": data.get("countryCode") or "",
        "region": data.get("regionName") or "",
        "city": data.get("city") or "",
        "lat": data.get("lat"),
        "lon": data.get("lon"),
        "isp": data.get("isp") or "",
        "org": data.get("org") or "",
        "ip": data.get("query") or ip,
    }
