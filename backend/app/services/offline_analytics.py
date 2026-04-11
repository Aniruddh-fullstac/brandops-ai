"""Aggregate offline campaign responses for dashboard insights."""

from __future__ import annotations

from collections import Counter
from typing import Any


def build_analytics(responses: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(responses)
    if n == 0:
        return {
            "totals": {"responses": 0, "unique_sessions": 0, "return_visits": 0},
            "geo": {"by_country": [], "by_city": []},
            "products": [],
            "interests": [],
            "ratings": {"avg": None, "distribution": {}},
            "age_ranges": [],
            "engagement": {"new_visitors": 0, "returning_visitors": 0},
            "affinity": [],
            "retargeting": {"eligible_emails": 0, "with_marketing_consent": 0},
            "locations": [],
        }

    sessions = {r.get("session_id") or "" for r in responses}
    sessions.discard("")
    return_visits = sum(1 for r in responses if r.get("is_return_visit"))

    countries = Counter()
    cities = Counter()
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

    # Simple affinity: co-occurrence of product pairs (for "users who liked X also liked Y")
    pair_counts: Counter[tuple[str, str]] = Counter()
    for r in responses:
        prods = [str(x) for x in (r.get("survey") or {}).get("selected_products") or []]
        for i, a in enumerate(prods):
            for b in prods[i + 1 :]:
                key = tuple(sorted((a, b)))
                pair_counts[key] += 1

    affinity = [
        {"a": a, "b": b, "count": c}
        for (a, b), c in pair_counts.most_common(12)
        if c > 0
    ]

    new_v = n - return_visits

    return {
        "totals": {
            "responses": n,
            "unique_sessions": len(sessions) if sessions else n,
            "return_visits": return_visits,
        },
        "geo": {
            "by_country": [{"name": k, "count": v} for k, v in countries.most_common(12)],
            "by_city": [{"name": k, "count": v} for k, v in cities.most_common(12)],
        },
        "products": [{"name": k, "count": v} for k, v in products.most_common(16)],
        "interests": [{"name": k, "count": v} for k, v in interest_c.most_common(16)],
        "ratings": {
            "avg": avg_rating,
            "distribution": {str(k): rating_dist[k] for k in sorted(rating_dist.keys())},
        },
        "age_ranges": [{"name": k, "count": v} for k, v in age_c.most_common(12)],
        "engagement": {
            "new_visitors": max(0, new_v),
            "returning_visitors": return_visits,
        },
        "affinity": affinity,
        "retargeting": {
            "eligible_emails": marketing_emails,
            "with_marketing_consent": consent_emails,
        },
        "locations": [{"name": k, "count": v} for k, v in loc_c.most_common(16)],
    }
