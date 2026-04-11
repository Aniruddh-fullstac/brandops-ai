"""Aggregate offline campaign responses + telemetry events for dashboard insights."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any


def _parse_iso(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if not isinstance(val, str):
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:  # noqa: BLE001
        return None


def _utc_date_key(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def _utc_hour(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).hour


def _aggregate_responses_only(responses: list[dict[str, Any]]) -> dict[str, Any]:
    """Original survey aggregates (submissions)."""
    n = len(responses)
    if n == 0:
        return {
            "totals": {"responses": 0, "unique_sessions": 0, "return_visits": 0},
            "geo": {"by_country": [], "by_city": [], "by_region": [], "top_isp": []},
            "products": [],
            "interests": [],
            "ratings": {"avg": None, "distribution": {}},
            "age_ranges": [],
            "engagement": {"new_visitors": 0, "returning_visitors": 0},
            "affinity": [],
            "retargeting": {"eligible_emails": 0, "with_marketing_consent": 0},
            "locations_from_submissions": [],
        }

    sessions = {r.get("session_id") or "" for r in responses}
    sessions.discard("")
    return_visits = sum(1 for r in responses if r.get("is_return_visit"))

    countries = Counter()
    cities = Counter()
    regions = Counter()
    isps = Counter()
    products = Counter()
    interest_c = Counter()
    age_c = Counter()
    loc_c = Counter()
    ratings: list[int] = []
    rating_dist: Counter[int] = Counter()

    marketing_emails = 0
    consent_emails = 0

    for r in responses:
        geo = r.get("geo") or {}
        if geo.get("country"):
            countries[geo["country"]] += 1
        city_key = geo.get("city") or ""
        if city_key:
            cities[f"{city_key}, {geo.get('country') or ''}".strip(", ")] += 1
        if geo.get("region"):
            regions[str(geo["region"])] += 1
        if geo.get("isp"):
            isps[str(geo["isp"])] += 1

        survey = r.get("survey") or {}
        for p in survey.get("selected_products") or []:
            products[str(p)] += 1
        for i in survey.get("interests") or []:
            interest_c[str(i)] += 1
        ar = survey.get("age_range")
        if ar:
            age_c[str(ar)] += 1

        rt = survey.get("rating")
        if isinstance(rt, int) and 1 <= rt <= 5:
            ratings.append(rt)
            rating_dist[rt] += 1

        ll = r.get("location_label")
        if ll:
            loc_c[str(ll)] += 1

        em = survey.get("email")
        if em and str(em).strip():
            marketing_emails += 1
            if survey.get("consent_marketing"):
                consent_emails += 1

    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None

    pair_counts: Counter[tuple[str, str]] = Counter()
    for r in responses:
        prods = [str(x) for x in (r.get("survey") or {}).get("selected_products") or []]
        for i, a in enumerate(prods):
            for b in prods[i + 1 :]:
                pair_counts[tuple(sorted((a, b)))] += 1

    affinity = [{"a": a, "b": b, "count": c} for (a, b), c in pair_counts.most_common(16) if c > 0]
    new_v = n - return_visits

    return {
        "totals": {
            "responses": n,
            "unique_sessions": len(sessions) if sessions else n,
            "return_visits": return_visits,
        },
        "geo": {
            "by_country": [{"name": k, "count": v} for k, v in countries.most_common(24)],
            "by_city": [{"name": k, "count": v} for k, v in cities.most_common(24)],
            "by_region": [{"name": k, "count": v} for k, v in regions.most_common(24)],
            "top_isp": [{"name": k, "count": v} for k, v in isps.most_common(12)],
        },
        "products": [{"name": k, "count": v} for k, v in products.most_common(24)],
        "interests": [{"name": k, "count": v} for k, v in interest_c.most_common(24)],
        "ratings": {
            "avg": avg_rating,
            "distribution": {str(k): rating_dist[k] for k in sorted(rating_dist.keys())},
        },
        "age_ranges": [{"name": k, "count": v} for k, v in age_c.most_common(16)],
        "engagement": {"new_visitors": max(0, new_v), "returning_visitors": return_visits},
        "affinity": affinity,
        "retargeting": {
            "eligible_emails": marketing_emails,
            "with_marketing_consent": consent_emails,
        },
        "locations_from_submissions": [{"name": k, "count": v} for k, v in loc_c.most_common(32)],
    }


def build_full_analytics(
    responses: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    base = _aggregate_responses_only(responses)
    loc_sub_only = base.pop("locations_from_submissions", [])
    ev = events or []

    page_views = sum(1 for e in ev if (e.get("event_type") or "") == "page_view")
    event_types = Counter(str(e.get("event_type") or "unknown") for e in ev)

    sess_submit = {r.get("session_id") or "" for r in responses}
    sess_submit.discard("")
    sess_pv = {e.get("session_id") or "" for e in ev if (e.get("event_type") or "") == "page_view"}
    sess_pv.discard("")

    countries_v = Counter()
    cities_v = Counter()
    loc_ev = Counter()
    for e in ev:
        if (e.get("event_type") or "") != "page_view":
            continue
        g = e.get("geo") or {}
        if g.get("country"):
            countries_v[g["country"]] += 1
        ck = g.get("city") or ""
        if ck:
            cities_v[f"{ck}, {g.get('country') or ''}".strip(", ")] += 1
        ll = e.get("location_label")
        if ll:
            loc_ev[str(ll)] += 1

    loc_merged = Counter()
    for x in loc_sub_only or []:
        if x.get("name"):
            loc_merged[x["name"]] += x["count"]
    for k, v in loc_ev.items():
        loc_merged[k] += v

    conversion = round(100.0 * base["totals"]["responses"] / page_views, 2) if page_views else None

    # Timeline: last 60 days UTC
    today = datetime.now(timezone.utc).date()
    day_keys = [(today - timedelta(days=i)).isoformat() for i in range(59, -1, -1)]
    views_by_day: Counter[str] = Counter()
    submits_by_day: Counter[str] = Counter()
    hour_views: Counter[int] = Counter()
    hour_submits: Counter[int] = Counter()

    for e in ev:
        if (e.get("event_type") or "") != "page_view":
            continue
        dt = _parse_iso(e.get("created_at"))
        if dt:
            views_by_day[_utc_date_key(dt)] += 1
            hour_views[_utc_hour(dt)] += 1

    for r in responses:
        dt = _parse_iso(r.get("submitted_at"))
        if dt:
            submits_by_day[_utc_date_key(dt)] += 1
            hour_submits[_utc_hour(dt)] += 1

    by_day = []
    for d in day_keys:
        by_day.append(
            {
                "date": d,
                "views": int(views_by_day.get(d, 0)),
                "submits": int(submits_by_day.get(d, 0)),
            }
        )

    by_hour = []
    for h in range(24):
        by_hour.append(
            {
                "hour": h,
                "views": int(hour_views.get(h, 0)),
                "submits": int(hour_submits.get(h, 0)),
            }
        )

    funnel = [
        {"step": "Landing views (telemetry)", "count": page_views},
        {"step": "Survey submissions", "count": base["totals"]["responses"]},
    ]

    merged_geo_views = [{"name": k, "count": v} for k, v in countries_v.most_common(24)]

    out = {
        **base,
        "totals": {
            **base["totals"],
            "page_views": page_views,
            "unique_sessions_page_views": len(sess_pv),
            "conversion_pct": conversion,
            "total_tracked_events": len(ev),
        },
        "funnel": funnel,
        "events": {
            "by_type": [{"name": k, "count": v} for k, v in event_types.most_common(32)],
            "clicks_and_interactions": max(0, len(ev) - page_views),
        },
        "timeline": {"by_day": by_day, "by_hour_utc": by_hour},
        "geo": {
            **base["geo"],
            "by_country_from_views": merged_geo_views,
            "by_city_from_views": [{"name": k, "count": v} for k, v in cities_v.most_common(20)],
        },
        "locations": [{"name": k, "count": v} for k, v in loc_merged.most_common(32)],
        "locations_from_page_views_only": [{"name": k, "count": v} for k, v in loc_ev.most_common(32)],
        "locations_from_submissions_only": loc_sub_only,
    }
    return out


def build_analytics(responses: list[dict[str, Any]]) -> dict[str, Any]:
    """Backward-compatible: submissions only (no events)."""
    return build_full_analytics(responses, [])
