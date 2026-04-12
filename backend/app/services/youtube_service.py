"""
YouTube Intelligence Service
─────────────────────────────
Fetches video search results + statistics via the YouTube Data API v3,
then applies a set of NLP / signal-analysis techniques (all zero-dependency —
only stdlib + googleapiclient) to surface actionable insights for the campaign graph.

NLP pipeline applied to the video corpus:
  1. TF-IDF on title corpus        — identifies terms that discriminate high-engagement videos
  2. Engagement-weighted n-gram    — bigrams & trigrams common in top-performing titles
  3. Format / intent detection     — classifies videos: review / tutorial / comparison / vlog / ad
  4. Sentiment scoring             — positive vs negative title signals via lexicon matching
  5. Channel authority bucketing   — brand official / creator / media / generic
  6. Temporal publish patterns     — day-of-week + hour patterns weighted by view count
  7. Keyword co-occurrence scoring — finds co-occurring term pairs (proto topic clusters)

All functions are synchronous; wrap with asyncio.to_thread for async contexts.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

# ── Positive / negative title signal lexicons (quick sentiment proxy) ─────────
_POS_TERMS = {
    "best", "top", "amazing", "ultimate", "perfect", "great", "love", "awesome",
    "must", "incredible", "brilliant", "win", "success", "guide", "how", "tips",
    "easy", "simple", "fast", "honest", "review",
}
_NEG_TERMS = {
    "worst", "fail", "bad", "terrible", "scam", "fraud", "hate", "broken",
    "misleading", "disappointing", "poor", "problem", "issue", "never", "avoid",
    "waste", "fake",
}

# ── Format / intent keyword maps ──────────────────────────────────────────────
_FORMAT_MAP: dict[str, list[str]] = {
    "review":      ["review", "honest review", "unboxing", "first impression"],
    "tutorial":    ["how to", "tutorial", "guide", "tips", "step by step", "learn"],
    "comparison":  ["vs", "versus", "compared", "which is better", "comparison"],
    "vlog":        ["vlog", "day in", "behind the scenes", "my experience"],
    "ad_promo":    ["official", "ad", "launch", "introducing", "new"],
}

_STOP_WORDS = {
    "the", "a", "an", "in", "on", "at", "to", "of", "for", "and", "is", "are",
    "was", "be", "with", "this", "that", "it", "as", "by", "from", "but", "or",
    "i", "my", "me", "we", "our", "you", "your", "he", "she", "they", "his",
    "her", "their", "its", "what", "when", "how", "why", "who", "not", "no",
    "yes", "get", "got", "do", "did", "have", "has", "will", "can", "about",
    "just", "so", "if", "than", "then", "new",
}

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# ─────────────────────────────────────────────────────────────────────────────
# Low-level API helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_client(api_key: str):
    """Build a YouTube Data API v3 client (lazy; raises ImportError if missing)."""
    try:
        from googleapiclient.discovery import build  # type: ignore[import]
        return build("youtube", "v3", developerKey=api_key)
    except ImportError as exc:
        raise ImportError(
            "google-api-python-client is not installed. "
            "Run: pip install google-api-python-client"
        ) from exc


def search_videos(youtube: Any, keyword: str, max_results: int = 15) -> list[str]:
    """Return video IDs for `keyword`, ordered by view count."""
    resp = (
        youtube.search()
        .list(part="snippet", q=keyword, type="video",
              maxResults=max_results, order="viewCount")
        .execute()
    )
    return [item["id"]["videoId"] for item in resp.get("items", [])]


def get_video_stats(youtube: Any, video_ids: list[str]) -> list[dict[str, Any]]:
    """Fetch snippet + statistics for up to 50 video IDs in one call."""
    if not video_ids:
        return []
    resp = (
        youtube.videos()
        .list(part="snippet,statistics", id=",".join(video_ids[:50]))
        .execute()
    )
    out: list[dict[str, Any]] = []
    for item in resp.get("items", []):
        stats = item.get("statistics", {})
        snippet = item.get("snippet", {})
        views    = int(stats.get("viewCount",   0) or 0)
        likes    = int(stats.get("likeCount",   0) or 0)
        comments = int(stats.get("commentCount", 0) or 0)
        eng_rate = (likes + comments) / (views + 1)
        published = snippet.get("publishedAt") or ""
        out.append({
            "video_id":        item.get("id", ""),
            "title":           snippet.get("title", ""),
            "channel":         snippet.get("channelTitle", ""),
            "published_at":    published,
            "views":           views,
            "likes":           likes,
            "comments":        comments,
            "engagement_score": round(eng_rate, 6),
        })
    return out


# ─────────────────────────────────────────────────────────────────────────────
# NLP analysis helpers (pure Python, zero-dependency)
# ─────────────────────────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """Lowercase + remove non-alpha, drop stop words."""
    return [t for t in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split()
            if len(t) > 2 and t not in _STOP_WORDS]


def _ngrams(tokens: list[str], n: int) -> list[str]:
    return [" ".join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]


def compute_tfidf(videos: list[dict[str, Any]]) -> dict[str, float]:
    """
    TF-IDF over the title corpus.
    Engagement-weights each document's TF so high-engagement titles score higher.
    Returns {term: tfidf_score}.
    """
    if not videos:
        return {}
    n_docs = len(videos)
    df: Counter[str] = Counter()
    doc_tf: list[dict[str, float]] = []

    for v in videos:
        tokens = _tokenize(v.get("title", ""))
        eng_w = math.log1p(v.get("engagement_score", 0) * 1e4 + 1)
        tf: dict[str, float] = defaultdict(float)
        for t in tokens:
            tf[t] += eng_w
        doc_tf.append(dict(tf))
        for t in set(tokens):
            df[t] += 1

    global_tfidf: dict[str, float] = defaultdict(float)
    for tf in doc_tf:
        for term, tf_val in tf.items():
            idf = math.log((n_docs + 1) / (df[term] + 1)) + 1
            global_tfidf[term] += tf_val * idf

    return dict(global_tfidf)


def extract_top_ngrams(
    videos: list[dict[str, Any]],
    n: int,
    top_k: int = 12,
) -> list[dict[str, Any]]:
    """
    Engagement-weighted n-gram frequencies across all video titles.
    Returns [{"ngram": str, "score": float}] sorted by score.
    """
    ng_score: dict[str, float] = defaultdict(float)
    for v in videos:
        tokens = _tokenize(v.get("title", ""))
        eng_w = math.log1p(v.get("engagement_score", 0) * 1e4 + 1)
        for ng in _ngrams(tokens, n):
            ng_score[ng] += eng_w
    ranked = sorted(ng_score, key=lambda x: ng_score[x], reverse=True)[:top_k]
    return [{"ngram": ng, "score": round(ng_score[ng], 4)} for ng in ranked]


def detect_formats(videos: list[dict[str, Any]]) -> dict[str, int]:
    """
    Count how many videos fall into each format bucket.
    A video can match multiple formats.
    """
    counts: dict[str, int] = {f: 0 for f in _FORMAT_MAP}
    for v in videos:
        title_lower = (v.get("title") or "").lower()
        for fmt, kws in _FORMAT_MAP.items():
            if any(kw in title_lower for kw in kws):
                counts[fmt] += 1
    return counts


def score_title_sentiment(title: str) -> float:
    """
    Simple lexicon-based sentiment: +1 per positive term, -1 per negative term.
    Returns a float in roughly [-1, 1].
    """
    tokens = set(re.sub(r"[^a-z\s]", " ", title.lower()).split())
    pos = sum(1 for t in tokens if t in _POS_TERMS)
    neg = sum(1 for t in tokens if t in _NEG_TERMS)
    total = pos + neg
    if total == 0:
        return 0.0
    return round((pos - neg) / total, 3)


def bucket_channels(videos: list[dict[str, Any]], brand_name: str) -> dict[str, list[str]]:
    """
    Categorise channel names into: brand_official / creator / media / generic.
    brand_name is used to flag the brand's own channel.
    """
    brand_lower = brand_name.lower().replace(" ", "")
    buckets: dict[str, list[str]] = {
        "brand_official": [], "creator": [], "media": [], "generic": []
    }
    seen: set[str] = set()
    _MEDIA_KW = {"news", "media", "magazine", "times", "post", "daily", "channel"}
    _CREATOR_KW = {"official", "vlogs", "vlog", "life", "studio", "tv", "productions"}

    for v in videos:
        ch = (v.get("channel") or "").strip()
        if not ch or ch in seen:
            continue
        seen.add(ch)
        ch_lower = ch.lower().replace(" ", "")
        if brand_lower and brand_lower in ch_lower:
            buckets["brand_official"].append(ch)
        elif any(kw in ch_lower for kw in _MEDIA_KW):
            buckets["media"].append(ch)
        elif any(kw in ch_lower for kw in _CREATOR_KW):
            buckets["creator"].append(ch)
        else:
            buckets["generic"].append(ch)
    return buckets


def analyse_publish_timing(
    videos: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Extract day-of-week and hour-of-day patterns, weighted by view count (log-scale).
    Useful for scheduling the video channel.
    """
    day_acc: dict[int, float] = defaultdict(float)
    hour_acc: dict[int, float] = defaultdict(float)
    used = 0

    for v in videos:
        ts = v.get("published_at") or ""
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            continue
        w = math.log1p(v.get("views", 0))
        day_acc[dt.weekday()] += w
        hour_acc[dt.hour] += w
        used += 1

    if not day_acc:
        return {"best_days": [], "best_hours": [], "posts_used": 0}

    best_days  = sorted(day_acc,  key=lambda d: day_acc[d],  reverse=True)[:3]
    best_hours = sorted(hour_acc, key=lambda h: hour_acc[h], reverse=True)[:3]
    return {
        "day_scores":  dict(day_acc),
        "hour_scores": dict(hour_acc),
        "best_days":   sorted(best_days),
        "best_hours":  sorted(best_hours),
        "posts_used":  used,
    }


def keyword_cooccurrence(
    videos: list[dict[str, Any]],
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """
    Find pairs of terms that co-occur frequently across high-engagement titles.
    Returns sorted [{pair: str, score: float}].
    """
    pair_score: dict[str, float] = defaultdict(float)
    for v in videos:
        tokens = _tokenize(v.get("title", ""))
        eng_w = math.log1p(v.get("engagement_score", 0) * 1e4 + 1)
        unique = sorted(set(tokens))
        for i in range(len(unique)):
            for j in range(i + 1, min(i + 5, len(unique))):
                key = f"{unique[i]} × {unique[j]}"
                pair_score[key] += eng_w
    ranked = sorted(pair_score, key=lambda x: pair_score[x], reverse=True)[:top_k]
    return [{"pair": p, "score": round(pair_score[p], 3)} for p in ranked]


# ─────────────────────────────────────────────────────────────────────────────
# Main analysis function
# ─────────────────────────────────────────────────────────────────────────────

def analyse_keyword(
    youtube: Any,
    keyword: str,
    max_results: int = 15,
) -> list[dict[str, Any]]:
    """Fetch + enrich videos for a single keyword query."""
    ids = search_videos(youtube, keyword, max_results)
    videos = get_video_stats(youtube, ids)
    return sorted(videos, key=lambda x: x["engagement_score"], reverse=True)


def run_youtube_intelligence(
    api_key: str,
    brand_name: str,
    industry_hint: str | None,
    geo_primary: str,
    geo_secondary: str,
) -> dict[str, Any]:
    """
    Entry point called from the campaign graph node.

    Runs 3 complementary searches:
      • Brand + geo          → own-channel / press / creator signal
      • Brand + competitor keywords   → category signal
      • Industry + trend terms        → macro video trends

    Returns a structured dict consumed by `_youtube_agent`.
    """
    youtube = _build_client(api_key)
    r = _req_queries(brand_name, industry_hint, geo_primary, geo_secondary)

    all_videos: list[dict[str, Any]] = []
    query_results: dict[str, list[dict]] = {}

    for label, query in r.items():
        try:
            vids = analyse_keyword(youtube, query, max_results=12)
            query_results[label] = vids
            all_videos.extend(vids)
        except Exception as exc:  # noqa: BLE001
            query_results[label] = []
            query_results[f"{label}_error"] = str(exc)

    # Deduplicate by video_id
    seen_ids: set[str] = set()
    unique_videos: list[dict[str, Any]] = []
    for v in all_videos:
        if v["video_id"] not in seen_ids:
            seen_ids.add(v["video_id"])
            unique_videos.append(v)

    if not unique_videos:
        return {
            "queries": list(r.values()),
            "total_videos": 0,
            "error": "No videos returned from any query.",
            "tfidf_top_terms": [],
            "top_bigrams": [],
            "top_trigrams": [],
            "format_distribution": {},
            "sentiment_distribution": {"positive": 0, "neutral": 0, "negative": 0},
            "channel_buckets": {},
            "timing": {},
            "cooccurrence": [],
            "top_videos": [],
        }

    # ── NLP pipeline ──────────────────────────────────────────────────────
    tfidf = compute_tfidf(unique_videos)
    top_tfidf = sorted(tfidf, key=lambda t: tfidf[t], reverse=True)[:20]

    bigrams  = extract_top_ngrams(unique_videos, n=2, top_k=10)
    trigrams = extract_top_ngrams(unique_videos, n=3, top_k=8)

    formats = detect_formats(unique_videos)
    dominant_format = max(formats, key=lambda f: formats[f]) if formats else "unknown"

    sentiments = {"positive": 0, "neutral": 0, "negative": 0}
    for v in unique_videos:
        s = score_title_sentiment(v.get("title", ""))
        if s > 0.1:
            sentiments["positive"] += 1
        elif s < -0.1:
            sentiments["negative"] += 1
        else:
            sentiments["neutral"] += 1

    buckets   = bucket_channels(unique_videos, brand_name)
    timing    = analyse_publish_timing(unique_videos)
    cooccur   = keyword_cooccurrence(unique_videos, top_k=8)

    top5 = unique_videos[:5]

    # ── Reasoning summary ─────────────────────────────────────────────────
    day_names_hit = [DAY_NAMES[d] for d in timing.get("best_days", [])]
    hour_hits     = [f"{h:02d}:00" for h in timing.get("best_hours", [])]
    reasoning = (
        f"Analysed {len(unique_videos)} unique videos across {len(r)} queries for '{brand_name}'. "
        f"Top TF-IDF terms: {', '.join(top_tfidf[:8])}. "
        f"Dominant format: {dominant_format}. "
        f"Sentiment: {sentiments['positive']} positive / {sentiments['neutral']} neutral / {sentiments['negative']} negative titles. "
        f"Best publish days (by view-weighted timestamp): {day_names_hit}. "
        f"Best hours: {hour_hits}."
    )

    return {
        "queries":              list(r.values()),
        "total_videos":         len(unique_videos),
        "tfidf_top_terms":      top_tfidf,
        "top_bigrams":          bigrams,
        "top_trigrams":         trigrams,
        "format_distribution":  formats,
        "dominant_format":      dominant_format,
        "sentiment_distribution": sentiments,
        "channel_buckets":      buckets,
        "timing":               timing,
        "cooccurrence":         cooccur,
        "top_videos":           top5,
        "reasoning_summary":    reasoning,
    }


def _req_queries(
    brand_name: str,
    industry_hint: str | None,
    geo_primary: str,
    geo_secondary: str,
) -> dict[str, str]:
    ind = industry_hint or ""
    return {
        "brand_geo":    f"{brand_name} {geo_primary}",
        "brand_review": f"{brand_name} {ind} review".strip(),
        "industry_trend": f"{ind or brand_name} trends {geo_secondary}".strip(),
    }
