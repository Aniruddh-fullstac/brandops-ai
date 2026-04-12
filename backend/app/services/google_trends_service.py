"""
Google Trends Intelligence Service
────────────────────────────────────
Uses PyTrends (unofficial Google Trends API) to extract time-series interest
data, related queries, rising topics, and real-time trending searches.

Analysis pipeline applied per brand/keyword set:
  1.  Multi-timeframe interest scoring  — compare 5-yr, 12-m, 3-m, 1-m trends
  2.  Automated trend classification    — stable / rising / declining / seasonal /
                                         cyclical / new-and-trending (per blog methodology)
  3.  YoY momentum calculation          — last-52-weeks vs full 5-yr mean
  4.  Rising & top related queries      — direct hook / SEO / content ideas
  5.  Rising & top related topics       — adjacent category discovery
  6.  Real-time trending searches       — today's hot topics in brand's primary geo
  7.  Seasonal peak detection           — identify high-interest months for timing
  8.  Keyword comparison scoring        — rank brand vs competitors by interest index

All functions are synchronous; wrap with asyncio.to_thread in async contexts.
PyTrends applies rate-limiting automatically via backoff.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict
from typing import Any

# ── Trend-classification thresholds (from PyTrends / ScraperAPI methodology) ─
_CLASS_RULES: list[tuple[float, float, float, str]] = [
    # (min_mean, max_mean, max_abs_yoy, label)
    (75, 101, 5,   "stable"),
    (75, 101, 100, "stable_increasing" ),
    (60, 75,  15,  "relatively_stable"),
    (60, 75,  100, "relatively_stable_increasing"),
    (20, 60,  15,  "seasonal"),
    (20, 60,  100, "trending"),
    (5,  20,  15,  "cyclical"),
    (0,  101, 100, "declining"),   # catch-all
]

_GEO_MAP = {
    "united states": "US", "us": "US", "usa": "US",
    "india": "IN", "united kingdom": "GB", "uk": "GB",
    "australia": "AU", "canada": "CA",
    "germany": "DE", "france": "FR", "brazil": "BR",
}

TIMEFRAMES = {
    "5yr":  "today 5-y",
    "12m":  "today 12-m",
    "3m":   "today 3-m",
    "1m":   "today 1-m",
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _geo_code(geo_str: str) -> str:
    return _GEO_MAP.get((geo_str or "").strip().lower(), "")


def _classify_trend(mean_val: float, yoy_pct: float) -> str:
    """
    Apply the multi-level classification from the PyTrends methodology blog.
    mean_val  — average interest (0–100) over the longest timeframe
    yoy_pct   — % change of last-52-week mean vs full-period mean
    """
    if mean_val > 75 and abs(yoy_pct) <= 5:
        return "stable"
    if mean_val > 75 and yoy_pct > 5:
        return "stable_increasing"
    if mean_val > 75:
        return "stable_decreasing"
    if mean_val > 60 and abs(yoy_pct) <= 15:
        return "relatively_stable"
    if mean_val > 60 and yoy_pct > 15:
        return "relatively_stable_increasing"
    if mean_val > 60:
        return "relatively_stable_decreasing"
    if mean_val > 20 and abs(yoy_pct) <= 15:
        return "seasonal"
    if mean_val > 20 and yoy_pct > 15:
        return "trending"
    if mean_val > 20:
        return "significantly_decreasing"
    if mean_val > 5 and abs(yoy_pct) <= 15:
        return "cyclical"
    if mean_val > 0 and yoy_pct > 15:
        return "new_and_trending"
    if mean_val > 0:
        return "declining"
    return "no_data"


def _seasonal_peaks(series: "pd.Series") -> list[str]:  # type: ignore[type-arg]
    """Return month names of the top-3 interest peaks."""
    try:
        import pandas as pd
        monthly = series.resample("ME").mean()
        top = monthly.nlargest(3)
        return [t.strftime("%B") for t in top.index]
    except Exception:  # noqa: BLE001
        return []


def _safe_float(val: Any) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Core analysis functions
# ─────────────────────────────────────────────────────────────────────────────

def _build_pytrends(hl: str = "en-US", retries: int = 3, backoff: float = 5.0):
    """Instantiate a TrendReq with retry / backoff."""
    try:
        from pytrends.request import TrendReq  # type: ignore[import]
    except ImportError as exc:
        raise ImportError(
            "pytrends is not installed. Run: pip install pytrends"
        ) from exc
    return TrendReq(hl=hl, tz=330, retries=retries, backoff_factor=backoff)


def analyse_keyword_trends(
    keyword: str,
    geo: str = "",
    cat: int = 0,
) -> dict[str, Any]:
    """
    Full trend analysis for a single keyword across multiple timeframes.
    Returns a dict with interest stats, classification, related queries/topics.
    """
    pt = _build_pytrends()

    # ── 5-year interest_over_time (base for classification) ───────────────
    pt.build_payload([keyword], cat=cat, timeframe=TIMEFRAMES["5yr"], geo=geo, gprop="")
    try:
        df_5y = pt.interest_over_time()
    except Exception:  # noqa: BLE001
        df_5y = None

    mean_5y = 0.0
    yoy_pct = 0.0
    classification = "no_data"
    peak_months: list[str] = []

    if df_5y is not None and not df_5y.empty and keyword in df_5y.columns:
        series = df_5y[keyword]
        mean_5y = round(float(series.mean()), 2)
        # last 52 weeks (weekly data)
        last_yr_mean = float(series.iloc[-52:].mean()) if len(series) >= 52 else float(series.mean())
        yoy_pct = round(((last_yr_mean / (mean_5y + 0.001)) - 1) * 100, 2)
        classification = _classify_trend(mean_5y, yoy_pct)
        peak_months = _seasonal_peaks(series)

    time.sleep(0.5)

    # ── 12-month interest ─────────────────────────────────────────────────
    pt.build_payload([keyword], cat=cat, timeframe=TIMEFRAMES["12m"], geo=geo, gprop="")
    try:
        df_12m = pt.interest_over_time()
        mean_12m = round(float(df_12m[keyword].mean()), 2) if (df_12m is not None and not df_12m.empty and keyword in df_12m.columns) else 0.0
    except Exception:  # noqa: BLE001
        mean_12m = 0.0

    time.sleep(0.5)

    # ── Rising & top related queries ──────────────────────────────────────
    pt.build_payload([keyword], cat=cat, timeframe=TIMEFRAMES["12m"], geo=geo, gprop="")
    time.sleep(0.3)
    try:
        rq = pt.related_queries()
        top_qrs    = _extract_related_table(rq, keyword, "top")
        rising_qrs = _extract_related_table(rq, keyword, "rising")
    except Exception:  # noqa: BLE001
        top_qrs, rising_qrs = [], []

    time.sleep(0.5)

    # ── Related topics ────────────────────────────────────────────────────
    try:
        rt = pt.related_topics()
        top_topics    = _extract_topic_table(rt, keyword, "top")
        rising_topics = _extract_topic_table(rt, keyword, "rising")
    except Exception:  # noqa: BLE001
        top_topics, rising_topics = [], []

    return {
        "keyword":           keyword,
        "geo":               geo or "Worldwide",
        "mean_interest_5yr": mean_5y,
        "mean_interest_12m": mean_12m,
        "yoy_pct_change":    yoy_pct,
        "classification":    classification,
        "peak_months":       peak_months,
        "top_related_queries":    top_qrs[:8],
        "rising_related_queries": rising_qrs[:8],
        "top_related_topics":     top_topics[:6],
        "rising_related_topics":  rising_topics[:6],
    }


def _extract_related_table(data: dict, keyword: str, kind: str) -> list[dict[str, Any]]:
    """Pull top/rising table from pytrends related_queries() output."""
    try:
        df = data.get(keyword, {}).get(kind)
        if df is None or df.empty:
            return []
        rows = df.head(10).to_dict("records")
        return [{"query": r.get("query", ""), "value": _safe_float(r.get("value", 0))} for r in rows]
    except Exception:  # noqa: BLE001
        return []


def _extract_topic_table(data: dict, keyword: str, kind: str) -> list[dict[str, Any]]:
    """Pull top/rising table from pytrends related_topics() output."""
    try:
        df = data.get(keyword, {}).get(kind)
        if df is None or df.empty:
            return []
        rows = df.head(10).to_dict("records")
        out = []
        for r in rows:
            out.append({
                "topic":    r.get("topic_title") or r.get("topic_mid", ""),
                "type":     r.get("topic_type", ""),
                "value":    _safe_float(r.get("value", 0)),
            })
        return out
    except Exception:  # noqa: BLE001
        return []


def compare_keywords(
    keywords: list[str],
    geo: str = "",
    cat: int = 0,
    timeframe: str = "today 12-m",
) -> list[dict[str, Any]]:
    """
    Compare up to 5 keywords in a single request.
    Returns [{"keyword": str, "avg_interest": float}] sorted by interest.
    """
    if not keywords:
        return []
    batch = keywords[:5]
    pt = _build_pytrends()
    pt.build_payload(batch, cat=cat, timeframe=timeframe, geo=geo, gprop="")
    time.sleep(0.4)
    try:
        df = pt.interest_over_time()
        if df is None or df.empty:
            return []
        return sorted(
            [{"keyword": kw, "avg_interest": round(float(df[kw].mean()), 2)}
             for kw in batch if kw in df.columns],
            key=lambda x: x["avg_interest"],
            reverse=True,
        )
    except Exception:  # noqa: BLE001
        return []


def get_trending_searches(geo_code: str = "united_states") -> list[str]:
    """
    Return today's real-time trending search terms for the given geo
    (pytrends trending_searches → pn param).
    """
    _GEO_TO_PN = {
        "US": "united_states", "IN": "india", "GB": "united_kingdom",
        "AU": "australia", "CA": "canada", "DE": "germany",
        "FR": "france", "BR": "brazil",
    }
    pn = _GEO_TO_PN.get(geo_code.upper(), "united_states")
    pt = _build_pytrends()
    try:
        df = pt.trending_searches(pn=pn)
        return df.iloc[:, 0].tolist()[:20]
    except Exception:  # noqa: BLE001
        return []


def get_keyword_suggestions(keyword: str) -> list[str]:
    """Return Google autocomplete suggestions for a seed keyword."""
    pt = _build_pytrends()
    try:
        suggs = pt.suggestions(keyword=keyword)
        return [s.get("title", "") for s in suggs if s.get("title")]
    except Exception:  # noqa: BLE001
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_google_trends_intelligence(
    brand_name: str,
    industry_hint: str | None,
    geo_primary: str,
    geo_secondary: str,
    competitor_names: list[str] | None = None,
) -> dict[str, Any]:
    """
    Full Google Trends intelligence run for a campaign.

    Steps:
      1. Classify brand keyword trend (5yr + 12m data)
      2. Extract rising related queries → creative hooks
      3. Extract rising related topics → adjacent categories
      4. Compare brand vs up to 4 competitors (interest index)
      5. Get today's trending searches in primary geo
      6. Get keyword suggestions for brand
      7. Repeat analysis for industry hint if different from brand

    Returns a structured dict consumed by `_google_trends_agent`.
    """
    geo = _geo_code(geo_primary)
    results: dict[str, Any] = {
        "brand_analysis": {},
        "industry_analysis": {},
        "competitor_comparison": [],
        "trending_today": [],
        "keyword_suggestions": [],
        "reasoning_summary": "",
    }
    errors: list[str] = []

    # ── Step 1: Brand trend analysis ──────────────────────────────────────
    try:
        brand_data = analyse_keyword_trends(brand_name, geo=geo)
        results["brand_analysis"] = brand_data
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Brand trend: {exc}")
        brand_data = {}

    # ── Step 2: Industry analysis (if differs from brand) ─────────────────
    ind_kw = (industry_hint or "").strip()
    if ind_kw and ind_kw.lower() != brand_name.lower():
        try:
            time.sleep(1.0)
            ind_data = analyse_keyword_trends(ind_kw, geo=geo)
            results["industry_analysis"] = ind_data
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Industry trend: {exc}")

    # ── Step 3: Competitor keyword comparison ─────────────────────────────
    comp_names = (competitor_names or [])[:4]
    compare_kws = [brand_name] + comp_names
    if len(compare_kws) > 1:
        try:
            time.sleep(1.0)
            comparison = compare_keywords(compare_kws, geo=geo)
            results["competitor_comparison"] = comparison
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Competitor compare: {exc}")

    # ── Step 4: Today's trending searches ─────────────────────────────────
    try:
        time.sleep(0.5)
        trending = get_trending_searches(geo or "united_states")
        results["trending_today"] = trending[:15]
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Trending: {exc}")

    # ── Step 5: Keyword suggestions ───────────────────────────────────────
    try:
        time.sleep(0.3)
        suggestions = get_keyword_suggestions(brand_name)
        results["keyword_suggestions"] = suggestions[:12]
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Suggestions: {exc}")

    if errors:
        results["errors"] = errors

    # ── Reasoning summary ─────────────────────────────────────────────────
    bd = results.get("brand_analysis") or {}
    classification = bd.get("classification", "unknown")
    mean_5y = bd.get("mean_interest_5yr", 0)
    yoy = bd.get("yoy_pct_change", 0)
    peaks = bd.get("peak_months") or []
    rising_q = bd.get("rising_related_queries") or []
    rising_q_strs = [q.get("query", "") for q in rising_q[:5]]
    trending_snap = results.get("trending_today") or []

    results["reasoning_summary"] = (
        f"Brand '{brand_name}' Google Trends: {classification} "
        f"(5yr mean: {mean_5y}, YoY: {yoy:+.1f}%). "
        + (f"Peak interest months: {', '.join(peaks)}. " if peaks else "")
        + (f"Rising related queries: {', '.join(rising_q_strs)}. " if rising_q_strs else "")
        + (f"Today's top trending (geo={geo or 'WW'}): {', '.join(trending_snap[:5])}." if trending_snap else "")
    )

    return results
