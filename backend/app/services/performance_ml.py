"""
Machine-learning performance projections (no LLM).

Uses multi-output Ridge regression (closed form, NumPy only) fit once on synthetic
training data whose labels follow explicit reach / impression / CTR heuristics.
At inference, features are extracted from campaign state (calendar, brand Instagram
metrics, keyword graph, Reddit snapshot).

Swap `_build_training()` for fits on real labeled outcomes when available.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

import numpy as np

# Impression reach-per-post as a fraction of followers, by channel family
_CHANNEL_IMP_FRAC: dict[str, tuple[float, float]] = {
    "instagram": (0.12, 0.42),
    "twitter": (0.06, 0.22),
    "linkedin": (0.04, 0.14),
    "video": (0.03, 0.12),
    "youtube": (0.03, 0.12),
    "blog": (0.02, 0.08),
    "email": (0.15, 0.35),
    "seo": (0.05, 0.15),
    "push_notification": (0.08, 0.20),
    "whatsapp": (0.10, 0.28),
}
_DEFAULT_IMP_FRAC = (0.05, 0.18)


def _imp_frac(channel: str) -> tuple[float, float]:
    ch = channel.lower().strip()
    return _CHANNEL_IMP_FRAC.get(ch, _DEFAULT_IMP_FRAC)


def _stable_channel_idx(channel: str, n_slots: int = 32) -> float:
    h = int(hashlib.md5(channel.lower().encode(), usedforsecurity=False).hexdigest()[:8], 16)
    return (h % n_slots) / float(n_slots)


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return default
        return float(x)
    except (TypeError, ValueError):
        return default


def _safe_int(x: Any, default: int = 0) -> int:
    try:
        if x is None:
            return default
        return int(x)
    except (TypeError, ValueError):
        return default


def _extract_brand_metrics(state: dict[str, Any]) -> dict[str, float]:
    ig = state.get("brand_instagram_analysis") or {}
    prof = (ig.get("profile") or {}) if isinstance(ig, dict) else {}
    followers = _safe_float(prof.get("followers"), 0.0)
    avg_likes = _safe_float(ig.get("average_likes"), 0.0)
    posts_fetched = _safe_int(ig.get("posts_fetched"), 0)
    if followers <= 0:
        followers = max(avg_likes * 120.0, 500.0)
    er_proxy = min(100.0 * avg_likes / max(followers, 1.0), 25.0)
    return {
        "followers": followers,
        "avg_likes": avg_likes,
        "posts_fetched": float(posts_fetched),
        "er_proxy": er_proxy,
    }


def _calendar_summary(state: dict[str, Any]) -> dict[str, Any]:
    cal = state.get("campaign_calendar") or {}
    if not isinstance(cal, dict):
        return {}
    summ = cal.get("summary")
    return summ if isinstance(summ, dict) else {}


def _keyword_proxy(state: dict[str, Any]) -> float:
    kg = state.get("keyword_graph") or {}
    if not isinstance(kg, dict):
        return 0.0
    n = _safe_float(kg.get("total_nodes"), 0.0)
    e = _safe_float(kg.get("total_edges"), 0.0)
    return math.log1p(n + 0.25 * e)


def _reddit_proxy(state: dict[str, Any]) -> float:
    r = state.get("reddit_snapshot") or {}
    if not isinstance(r, dict):
        return 0.0
    posts = r.get("posts") or []
    if isinstance(posts, list):
        return math.log1p(len(posts))
    return 0.0


def _competitor_er_proxy(state: dict[str, Any]) -> float:
    comp = state.get("competitor_instagram_analysis") or {}
    if not isinstance(comp, dict):
        return 0.0
    raw = comp.get("raw_data") or []
    if not isinstance(raw, list):
        return 0.0
    ratios: list[float] = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        foll = _safe_float(c.get("followers"), 0.0)
        avg_l = _safe_float(c.get("average_likes"), 0.0)
        if foll > 100 and avg_l > 0:
            ratios.append(min(100.0 * avg_l / foll, 30.0))
    if not ratios:
        return 0.0
    return float(np.median(np.array(ratios, dtype=np.float64)))


def _feature_row(
    *,
    brand: dict[str, float],
    channel: str,
    events_ch: int,
    total_events: int,
    n_active_channels: int,
    demand: float,
) -> np.ndarray:
    lo, hi = _imp_frac(channel)
    mid = (lo + hi) / 2.0
    share = events_ch / max(total_events, 1)
    return np.array(
        [
            math.log1p(brand["followers"]),
            math.log1p(float(events_ch)),
            math.log1p(float(total_events)),
            _stable_channel_idx(channel),
            mid,
            min(brand["er_proxy"], 20.0),
            demand,
            min(n_active_channels / 12.0, 1.0),
            share,
        ],
        dtype=np.float64,
    )


def _feature_row_full(state: dict[str, Any], channel: str, events_ch: int, total_events: int, n_active: int) -> np.ndarray:
    brand = _extract_brand_metrics(state)
    demand = _keyword_proxy(state) + 0.5 * _reddit_proxy(state)
    return _feature_row(
        brand=brand,
        channel=channel,
        events_ch=events_ch,
        total_events=total_events,
        n_active_channels=n_active,
        demand=demand,
    )


def _heuristic_targets(row: np.ndarray) -> np.ndarray:
    followers = math.expm1(row[0])
    ev_ch = max(math.expm1(row[1]), 0.0)
    imp_mid = float(row[4])
    er = float(row[5])
    demand = float(row[6])
    share = float(row[8])

    demand_boost = 1.0 + 0.12 * min(demand, 3.0)
    cadence_boost = 1.0 + 0.08 * share
    imp_per_post = followers * imp_mid * demand_boost * cadence_boost
    impressions = ev_ch * imp_per_post
    reach_cap = followers * (0.18 + 0.35 * share) * demand_boost
    reach = min(reach_cap, impressions * 0.82)

    ctr = min(max(er * (0.06 + 0.02 * min(demand, 2.0)), 0.02), 2.5)
    leads = impressions * (ctr / 100.0) * (0.008 + 0.004 * min(demand, 2.0))

    return np.array(
        [max(impressions, 0.0), max(reach, 0.0), er, ctr, max(leads, 0.0)],
        dtype=np.float64,
    )


def _ridge_fit_multioutput(X: np.ndarray, Y: np.ndarray, alpha: float = 2.5) -> np.ndarray:
    """Shape (n_features, n_targets) — Y is (n_samples, n_targets)."""
    n_features = X.shape[1]
    a = X.T @ X + alpha * np.eye(n_features, dtype=np.float64)
    b = X.T @ Y
    return np.linalg.solve(a, b)


def _build_training(n_samples: int = 1800, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = np.zeros((n_samples, 9), dtype=np.float64)
    Y = np.zeros((n_samples, 5), dtype=np.float64)
    for i in range(n_samples):
        followers = rng.lognormal(mean=math.log(5000), sigma=1.6)
        followers = float(np.clip(followers, 200, 5_000_000))
        ev_ch = rng.integers(1, 45)
        total_ev = max(ev_ch, int(rng.integers(ev_ch, ev_ch + 80)))
        imp_mid = rng.uniform(0.03, 0.35)
        er = rng.uniform(0.15, 12.0)
        demand = rng.uniform(0, 3.5)
        n_act = rng.integers(1, 11)
        share = rng.uniform(0.05, 0.95)
        ch_hash = rng.uniform(0, 1)
        X[i] = [
            math.log1p(followers),
            math.log1p(ev_ch),
            math.log1p(total_ev),
            ch_hash,
            imp_mid,
            er,
            demand,
            min(n_act / 12.0, 1.0),
            share,
        ]
        y = _heuristic_targets(X[i]) * (1.0 + rng.normal(0, 0.04, size=5))
        Y[i] = np.clip(y, [0, 0, 0.05, 0.02, 0], [1e12, 1e12, 25.0, 8.0, 1e7])
    return X, Y


_ridge_weights: np.ndarray | None = None


def _get_ridge_weights() -> np.ndarray:
    global _ridge_weights
    if _ridge_weights is None:
        X, Y = _build_training()
        _ridge_weights = _ridge_fit_multioutput(X, Y)
    return _ridge_weights


def _ridge_predict_row(row: np.ndarray) -> np.ndarray:
    W = _get_ridge_weights()
    return row @ W


def _confidence(brand: dict[str, float], total_events: int) -> str:
    if brand["followers"] >= 8000 and total_events >= 12 and brand["posts_fetched"] >= 6:
        return "high"
    if brand["followers"] >= 1500 and total_events >= 5:
        return "medium"
    return "low"


def _trend_snippet(state: dict[str, Any]) -> str:
    tr = state.get("trends_research") or {}
    if isinstance(tr, dict):
        pkt = tr.get("packet")
        if isinstance(pkt, dict):
            for key in ("summary", "overview", "narrative", "reasoning_summary", "text"):
                v = pkt.get(key)
                if isinstance(v, str) and v.strip():
                    return v.strip()[:520]
        for key in ("summary", "overview", "narrative", "reasoning_summary", "text"):
            v = tr.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()[:520]
        blob = json.dumps(tr, default=str)[:520]
        if len(blob) > 40:
            return blob
    return "No structured trend narrative was available; seasonality uplift is treated as neutral."


def _risks_and_tips(brand: dict[str, float], total_events: int, channels_n: int) -> tuple[list[str], list[str]]:
    risks: list[str] = []
    tips: list[str] = []
    if brand["followers"] < 2000:
        risks.append("Audience scale is modest — organic reach may be capped until growth or paid support kicks in.")
        tips.append("Test paid boosts on top organic posts to validate efficient CPM before scaling.")
    if total_events < 8:
        risks.append("Calendar cadence is light for a 30-day sprint; signal may be noisy week-to-week.")
        tips.append("Add 1–2 extra touchpoints on your strongest channel to stabilize learnings.")
    if brand["er_proxy"] < 0.4 and brand["followers"] > 500:
        risks.append("Engagement rate vs followers looks soft — creative/message fit may need iteration.")
        tips.append("Iterate hooks and formats on the channel with the best historical engagement first.")
    if channels_n > 6:
        risks.append("Many parallel channels dilute execution — measurement gets harder.")
        tips.append("Prioritize 2–3 channels for depth; keep others in maintenance mode.")
    if not risks:
        risks.append("Standard execution risk: external algorithm shifts and competitor activity are not modeled.")
    if len(tips) < 2:
        tips.append("Re-check posting times against the timing optimizer after the first week of results.")
    return risks[:5], tips[:5]


def predict_performance_sim(state: dict[str, Any]) -> dict[str, Any]:
    """
    Build the `performance_sim` artifact using Ridge regression only (no LLM calls).
    """
    brand = _extract_brand_metrics(state)
    summ = _calendar_summary(state)
    by_ch = summ.get("by_channel") if isinstance(summ.get("by_channel"), dict) else {}
    total_events = _safe_int(summ.get("total_events"), 0)

    active = [(ch, _safe_int(c, 0)) for ch, c in by_ch.items() if _safe_int(c, 0) > 0]
    if not any(ev > 0 for _, ev in active):
        total_events = max(total_events, 8)
        active = [("instagram", total_events)]
    n_active = max(len([x for x in active if x[1] > 0]), 1)

    comp_er = _competitor_er_proxy(state)

    channels_out: list[dict[str, Any]] = []
    for channel, ev in active:
        if ev <= 0:
            continue
        x = _feature_row_full(state, channel, ev, max(total_events, ev), n_active)
        preds = _ridge_predict_row(x)
        heur = _heuristic_targets(x)
        blended = 0.55 * preds + 0.45 * heur
        impressions = float(max(blended[0], 0.0))
        reach = float(max(min(blended[1], impressions * 0.95), 0.0))
        er = float(np.clip(blended[2], 0.05, 20.0))
        if comp_er > 0 and channel.lower() in ("instagram", "twitter", "linkedin"):
            er = float(er * 0.85 + comp_er * 0.15)
        ctr = float(np.clip(blended[3], 0.02, 5.0))
        leads = float(max(blended[4], 0.0))

        lo, hi = _imp_frac(channel)
        methodology = (
            f"Multi-output Ridge regression on nine engineered features, blended with explicit heuristics: "
            f"30d posts≈{ev}, imp./post fraction ∈ [{lo:.2f},{hi:.2f}] of follower scale, "
            f"demand proxy from keyword graph + Reddit."
        )
        reach_methodology = (
            f"Reach capped by estimated unique audience (~{reach / max(impressions, 1.0):.0%} of modeled impressions) "
            f"with follower ceiling {brand['followers']:.0f}."
        )
        eng_basis = (
            f"ER proxy from brand avg likes / followers ({brand['er_proxy']:.2f}%); "
            f"competitor median ER blended when available ({comp_er:.2f}% median)."
            if comp_er > 0
            else f"ER proxy from brand avg likes / followers ({brand['er_proxy']:.2f}%)."
        )

        channels_out.append(
            {
                "name": channel,
                "impressions_estimate": int(round(impressions)),
                "estimated_reach_30d": int(round(reach)),
                "reach_methodology": reach_methodology,
                "engagement_rate": round(er, 2),
                "engagement_rate_basis": eng_basis,
                "click_through_rate": round(ctr, 2),
                "estimated_leads": int(round(leads)),
                "confidence": _confidence(brand, total_events),
                "methodology": methodology,
            }
        )

    overall_impr = int(sum(c["impressions_estimate"] for c in channels_out))
    overlap = 0.74 if len(channels_out) > 1 else 1.0
    overall_reach = int(sum(c["estimated_reach_30d"] for c in channels_out) * overlap)

    grounding = (
        f"Multi-output Ridge regression (closed-form, NumPy) on nine engineered features: "
        f"log followers, cadence, channel hash, typical impression fraction for channel family, "
        f"brand ER proxy, keyword/reddit demand proxy, active-channel pressure, and calendar share. "
        f"Blended 55/45 with explicit heuristics to limit extrapolation. "
        f"Calendar total_events={total_events}, brand_followers≈{brand['followers']:.0f}."
    )

    past_sig = {
        "instagram_followers": brand["followers"],
        "avg_likes_if_known": brand["avg_likes"],
        "engagement_proxy_pct": round(brand["er_proxy"], 3),
        "calendar_total_events": total_events,
        "competitor_median_er_proxy_pct": round(comp_er, 3) if comp_er > 0 else None,
        "keyword_demand_proxy": round(float(_keyword_proxy(state)), 4),
    }

    risks, opts = _risks_and_tips(brand, total_events, len(channels_out))

    reasoning = (
        "Projections use multi-output Ridge regression trained on synthetic labels from documented "
        "reach/impression heuristics; inference uses live features from this run (calendar, Instagram metrics, "
        "keyword graph, Reddit snapshot). Directional planning only — not a guarantee."
    )

    return {
        "grounding_summary": grounding,
        "past_performance_signals": past_sig,
        "monthly_trend_notes": _trend_snippet(state),
        "channels": channels_out,
        "overall_projected_reach": overall_reach,
        "overall_projected_impressions": overall_impr,
        "key_risks": risks,
        "optimization_suggestions": opts,
        "reasoning_summary": reasoning,
    }
