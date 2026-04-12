"""
Data-driven Campaign Timing Optimizer — 30-day scheduler.

No ML model. Uses real engagement data from brand + competitor Instagram posts
(timestamp × likes + comments) to derive best posting windows per channel.
Falls back to category-level defaults when no post data is available.

Pipeline:
  1. analyse_post_timing()  — score day-of-week and hour-of-day from raw posts
  2. merge_brand_competitor()  — weighted blend of brand (60%) + competitor (40%) signals
  3. build_channel_config()  — produce per-channel best_days / best_hours / cadence
  4. build_campaign_calendar()  — same structured 30-day calendar output as before
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Hardcoded category baselines (fallback when no IG data)
# ---------------------------------------------------------------------------

CHANNEL_DEFAULTS: dict[str, dict[str, Any]] = {
    "linkedin":          {"best_days": [0, 1, 2, 3],          "best_hours": [8, 10, 17],     "cadence_per_week": 3, "format": "post"},
    "instagram":         {"best_days": [0, 1, 2, 3, 4],       "best_hours": [9, 12, 19],     "cadence_per_week": 4, "format": "carousel / reel"},
    "twitter":           {"best_days": [0, 1, 2, 3, 4, 5],    "best_hours": [9, 12, 15, 18], "cadence_per_week": 7, "format": "post / thread"},
    "push_notification": {"best_days": [0, 1, 2, 3, 4, 5, 6], "best_hours": [9, 12, 19],     "cadence_per_week": 4, "format": "push"},
    "blog":              {"best_days": [1, 3],                 "best_hours": [9],             "cadence_per_week": 1, "format": "article"},
    "email":             {"best_days": [1, 3],                 "best_hours": [10],            "cadence_per_week": 1, "format": "newsletter"},
    "whatsapp":          {"best_days": [0, 2, 4],              "best_hours": [10, 18],        "cadence_per_week": 2, "format": "broadcast"},
    "seo":               {"best_days": [0, 2, 4],              "best_hours": [9],             "cadence_per_week": 2, "format": "optimization task"},
    "video":             {"best_days": [2, 4],                 "best_hours": [12],            "cadence_per_week": 1, "format": "hero/demo video"},
}

# Minimum posts needed before we trust the data over generic defaults
_MIN_POSTS_TO_TRUST = 4

# Blend weights: brand signal / competitor signal
_BRAND_WEIGHT = 0.60
_COMPETITOR_WEIGHT = 0.40

# Sentiment modifier: positive sentiment at a time-slot lifts score by this factor
_SENTIMENT_BOOST = 0.15


# ---------------------------------------------------------------------------
# Core analytics helpers
# ---------------------------------------------------------------------------

def _parse_ts(raw: Any) -> datetime | None:
    """Parse ISO timestamp string to a UTC datetime."""
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def analyse_post_timing(
    posts: list[dict[str, Any]],
    sentiment_signal: dict[str, Any] | None = None,
    source_label: str = "posts",
) -> dict[str, Any]:
    """
    Input: list of post dicts with at least timestamp, like_count, comment_count.
    Output:
      day_scores   — {0..6: float}  (Mon=0) — engagement-weighted counts
      hour_scores  — {0..23: float}
      best_days    — top-3 day indices by score
      best_hours   — top-3 hour values by score
      posts_used   — how many contributed
      reasoning    — human-readable explanation
    """
    day_acc: dict[int, float] = defaultdict(float)
    hour_acc: dict[int, float] = defaultdict(float)
    used = 0

    for p in posts:
        dt = _parse_ts(p.get("timestamp"))
        if dt is None:
            continue
        eng = float(p.get("engagement") or
                    (p.get("like_count", 0) or 0) + (p.get("comment_count", 0) or 0))
        if eng <= 0:
            eng = 1.0            # still count the slot, just with weight 1

        # log-scale so viral outliers don't dominate the distribution
        score = math.log1p(eng)
        day_acc[dt.weekday()] += score
        hour_acc[dt.hour] += score
        used += 1

    if not day_acc:
        return {
            "day_scores": {},
            "hour_scores": {},
            "best_days": [],
            "best_hours": [],
            "posts_used": 0,
            "reasoning": f"No valid timestamps in {source_label}.",
        }

    # Optional: boost hours that correlate with positive sentiment
    if sentiment_signal:
        stat = sentiment_signal.get("statistics") or {}
        pct_pos = float(stat.get("pct_positive") or 0)
        if pct_pos >= 50:
            # If overall sentiment is positive we don't have per-hour sentiment,
            # but we can gently boost the top engagement hours.
            top_h = sorted(hour_acc, key=lambda h: hour_acc[h], reverse=True)[:3]
            for h in top_h:
                hour_acc[h] *= (1 + _SENTIMENT_BOOST)

    best_days = sorted(day_acc, key=lambda d: day_acc[d], reverse=True)[:4]
    best_days.sort()                          # keep chronological order in week
    best_hours = sorted(hour_acc, key=lambda h: hour_acc[h], reverse=True)[:3]
    best_hours.sort()

    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    reasoning = (
        f"Analysed {used} {source_label}. "
        f"Peak engagement days: {', '.join(day_names[d] for d in best_days)}. "
        f"Peak hours (UTC): {', '.join(f'{h:02d}:00' for h in best_hours)}. "
        "Scores are log(1+engagement) to dampen viral outliers."
    )
    if sentiment_signal:
        reasoning += (
            f" Positive comment rate "
            f"{(sentiment_signal.get('statistics') or {}).get('pct_positive', '?')}% — "
            "top hours mildly boosted."
        )

    return {
        "day_scores": dict(day_acc),
        "hour_scores": dict(hour_acc),
        "best_days": best_days,
        "best_hours": best_hours,
        "posts_used": used,
        "reasoning": reasoning,
    }


def _weighted_merge(
    brand: dict[str, float],
    competitor: dict[str, float],
    brand_w: float = _BRAND_WEIGHT,
    comp_w: float = _COMPETITOR_WEIGHT,
) -> dict[str, float]:
    """Merge two score dicts with given weights, normalizing competitor volume."""
    merged: dict[str, float] = defaultdict(float)
    brand_total = sum(brand.values()) or 1.0
    comp_total = sum(competitor.values()) or 1.0
    for k, v in brand.items():
        merged[k] += brand_w * (v / brand_total)
    for k, v in competitor.items():
        merged[k] += comp_w * (v / comp_total)
    return dict(merged)


def build_channel_config(
    brand_ig: dict[str, Any] | None,
    competitor_ig: dict[str, Any] | None,
    sentiment_signal: dict[str, Any] | None = None,
    channels: list[str] | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """
    Build a per-channel config dict (same shape as CHANNEL_DEFAULTS) plus
    a reasoning bundle explaining what data drove the Instagram settings.

    brand_ig          — output of node_brand_instagram_agent → `instagram_data`
    competitor_ig     — output of _competitor_instagram_agent → `competitor_instagram`
    sentiment_signal  — brand_instagram_analysis.sentiment blob
    channels          — which channels to configure

    Returns (channel_cfg, reasoning_bundle).
    """
    active = set(channels or list(CHANNEL_DEFAULTS.keys()))
    cfg: dict[str, dict[str, Any]] = {
        ch: dict(CHANNEL_DEFAULTS.get(ch, CHANNEL_DEFAULTS["linkedin"]))
        for ch in active
    }
    reasoning_bundle: dict[str, Any] = {
        "method": "data_driven_when_available",
        "brand_posts_used": 0,
        "competitor_posts_used": 0,
        "instagram_overridden": False,
        "details": [],
    }

    if "instagram" not in active:
        return cfg, reasoning_bundle

    # ── Gather raw post lists ──────────────────────────────────────────────
    brand_posts: list[dict] = []
    if brand_ig and isinstance(brand_ig, dict):
        brand_posts = brand_ig.get("all_posts") or brand_ig.get("top_posts") or []
        # top_posts_with_comments also accepted
        if not brand_posts:
            brand_posts = [
                {k: v for k, v in p.items() if k != "comments_text"}
                for p in (brand_ig.get("top_posts_with_comments") or [])
            ]

    comp_posts: list[dict] = []
    if competitor_ig and isinstance(competitor_ig, dict):
        raw_data = competitor_ig.get("raw_data") or []
        for comp in raw_data:
            for p in (comp.get("all_posts") or comp.get("top_posts_with_comments") or []):
                comp_posts.append({k: v for k, v in p.items() if k != "comments_text"})

    reasoning_bundle["brand_posts_used"] = len(brand_posts)
    reasoning_bundle["competitor_posts_used"] = len(comp_posts)

    # ── Analyse each corpus ────────────────────────────────────────────────
    brand_analysis = analyse_post_timing(brand_posts, sentiment_signal, "brand posts")
    comp_analysis  = analyse_post_timing(comp_posts,  None,            "competitor posts")

    reasoning_bundle["details"].append(brand_analysis.get("reasoning"))
    reasoning_bundle["details"].append(comp_analysis.get("reasoning"))

    enough_brand = brand_analysis["posts_used"] >= _MIN_POSTS_TO_TRUST
    enough_comp  = comp_analysis["posts_used"]  >= _MIN_POSTS_TO_TRUST

    if not enough_brand and not enough_comp:
        reasoning_bundle["details"].append(
            "Not enough timestamped posts to override defaults — keeping category baselines."
        )
        return cfg, reasoning_bundle

    # ── Merge scores ──────────────────────────────────────────────────────
    if enough_brand and enough_comp:
        merged_days  = _weighted_merge(brand_analysis["day_scores"],  comp_analysis["day_scores"])
        merged_hours = _weighted_merge(brand_analysis["hour_scores"], comp_analysis["hour_scores"])
        source_note  = f"Brand ({brand_analysis['posts_used']} posts, 60%) + competitor ({comp_analysis['posts_used']} posts, 40%) blend."
    elif enough_brand:
        merged_days  = brand_analysis["day_scores"]
        merged_hours = brand_analysis["hour_scores"]
        source_note  = f"Brand only ({brand_analysis['posts_used']} posts) — not enough competitor data."
    else:
        merged_days  = comp_analysis["day_scores"]
        merged_hours = comp_analysis["hour_scores"]
        source_note  = f"Competitor only ({comp_analysis['posts_used']} posts) — no brand post timestamps available."

    best_days  = sorted(merged_days,  key=lambda d: merged_days[d],  reverse=True)[:4]
    best_days.sort()
    best_hours = sorted(merged_hours, key=lambda h: merged_hours[h], reverse=True)[:3]
    best_hours.sort()

    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    reasoning_bundle["instagram_overridden"] = True
    reasoning_bundle["instagram_best_days"]  = [day_names[d] for d in best_days]
    reasoning_bundle["instagram_best_hours"] = [f"{h:02d}:00" for h in best_hours]
    reasoning_bundle["details"].append(source_note)
    reasoning_bundle["details"].append(
        f"Instagram config → days: {[day_names[d] for d in best_days]}, "
        f"hours: {[f'{h:02d}:00' for h in best_hours]}."
    )

    cfg["instagram"] = {
        **cfg.get("instagram", CHANNEL_DEFAULTS["instagram"]),
        "best_days":  best_days,
        "best_hours": best_hours,
    }

    return cfg, reasoning_bundle


# ---------------------------------------------------------------------------
# Calendar builder (same output shape, now data-driven config)
# ---------------------------------------------------------------------------

def build_campaign_calendar(
    *,
    channels: list[str] | None = None,
    start_date: date | None = None,
    duration_days: int = 30,
    phases: list[dict[str, Any]] | None = None,
    brand_ig: dict[str, Any] | None = None,
    competitor_ig: dict[str, Any] | None = None,
    sentiment_signal: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Returns a 30-day calendar:
      days: [{date, weekday, phase, events: [{channel, time, format, phase, priority}]}]
      summary: {total_events, by_channel, duration_days, start_date,
                timing_reasoning: {...}}
    """
    if start_date is None:
        start_date = date.today()

    active_channels = channels or list(CHANNEL_DEFAULTS.keys())

    channel_cfg, timing_reasoning = build_channel_config(
        brand_ig=brand_ig,
        competitor_ig=competitor_ig,
        sentiment_signal=sentiment_signal,
        channels=active_channels,
    )

    phase_map = _build_phase_map(phases, start_date, duration_days)

    days: list[dict[str, Any]] = []
    channel_slots: dict[str, int] = {ch: 0 for ch in active_channels}
    total = 0

    for offset in range(duration_days):
        d = start_date + timedelta(days=offset)
        weekday = d.weekday()
        weekday_name = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekday]
        phase_label = phase_map.get(offset, "Sustain")
        events: list[dict[str, Any]] = []

        for ch in active_channels:
            cfg = channel_cfg.get(ch, CHANNEL_DEFAULTS.get(ch, CHANNEL_DEFAULTS["linkedin"]))
            if weekday not in cfg["best_days"]:
                continue
            slots_needed = cfg["cadence_per_week"]
            week_num = offset // 7
            max_so_far = slots_needed * (week_num + 1)
            if channel_slots[ch] >= max_so_far:
                continue
            hour = cfg["best_hours"][offset % len(cfg["best_hours"])]
            events.append({
                "channel": ch,
                "time": f"{hour:02d}:00",
                "format": cfg.get("format", "post"),
                "phase": phase_label,
                "priority": "high" if offset < 7 else ("medium" if offset < 21 else "low"),
            })
            channel_slots[ch] += 1
            total += 1

        days.append({
            "date": d.isoformat(),
            "weekday": weekday_name,
            "phase": phase_label,
            "events": events,
        })

    by_channel = {ch: channel_slots.get(ch, 0) for ch in active_channels}

    return {
        "days": days,
        "summary": {
            "total_events": total,
            "duration_days": duration_days,
            "start_date": start_date.isoformat(),
            "by_channel": by_channel,
            "timing_reasoning": timing_reasoning,
        },
    }


def _build_phase_map(
    phases: list[dict[str, Any]] | None,
    start: date,
    total: int,
) -> dict[int, str]:
    if not phases:
        return {
            **{i: "Launch"  for i in range(0, min(7, total))},
            **{i: "Amplify" for i in range(7, min(21, total))},
            **{i: "Sustain" for i in range(21, total)},
        }
    mapping: dict[int, str] = {}
    offset = 0
    for p in phases:
        name = p.get("name", "Phase")
        dur = int(p.get("duration_days", 7))
        for d in range(dur):
            if offset + d < total:
                mapping[offset + d] = name
        offset += dur
    for i in range(offset, total):
        mapping[i] = phases[-1].get("name", "Sustain") if phases else "Sustain"
    return mapping
