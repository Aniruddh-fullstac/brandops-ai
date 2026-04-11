from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import Settings


def _same_domain(url: str, base: str) -> bool:
    try:
        u = urlparse(url)
        b = urlparse(base)
        return u.netloc == b.netloc or u.netloc.endswith("." + b.netloc)
    except Exception:
        return False


def extract_readable_text(html: str, base_url: str, max_chars: int) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    chunks: list[str] = []
    for sel in ("title", "meta[name='description']", "h1", "h2", "h3", "p", "li"):
        for el in soup.select(sel):
            if el.name == "meta":
                content = el.get("content")
                if content:
                    chunks.append(content.strip())
            else:
                t = el.get_text(" ", strip=True)
                if t:
                    chunks.append(t)
    # Prefer same-domain links as weak IA signal
    internal = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("http") and _same_domain(href, base_url):
            internal.append(href.split("#", 1)[0])
    if internal:
        uniq = list(dict.fromkeys(internal))[:15]
        chunks.append("Internal links sampled: " + ", ".join(uniq))
    text = "\n".join(chunks)
    text = re.sub(r"\s+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_chars]


async def fetch_url_text(url: str, settings: Settings) -> tuple[str, str | None]:
    """
    Returns (extracted_text, content_type). Raises on hard failures.
    """
    headers = {
        "User-Agent": "CampaignEngineBot/1.0 (+https://openai.com)",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    }
    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        follow_redirects=True,
        headers=headers,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
        if "html" in ctype:
            text = extract_readable_text(resp.text, url, settings.max_brand_page_chars)
            return text, ctype
        # Plain text / json-ish fallback
        body = resp.text[: settings.max_brand_page_chars]
        return body, ctype
