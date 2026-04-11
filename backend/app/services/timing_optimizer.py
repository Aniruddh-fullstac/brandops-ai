"""
Deterministic Campaign Timing Optimizer — 30-day scheduler.
No LLM involved. Builds a calendar based on channel cadence,
optimal posting windows, and strategic priority weights.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

CHANNEL_DEFAULTS: dict[str, dict[str, Any]] = {
    "linkedin": {
        "best_days": [0, 1, 2, 3],  # Mon–Thu
        "best_hours": [8, 10, 17],
        "cadence_per_week": 3,
        "format": "post",
    },
    "instagram": {
        "best_days": [0, 1, 2, 3, 4],
        "best_hours": [9, 12, 19],
        "cadence_per_week": 4,
        "format": "carousel / reel",
    },
    "twitter": {
        "best_days": [0, 1, 2, 3, 4, 5],
        "best_hours": [9, 12, 15, 18],
        "cadence_per_week": 7,
        "format": "post / thread",
    },
    "push_notification": {
        "best_days": [0, 1, 2, 3, 4, 5, 6],
        "best_hours": [9, 12, 19],
        "cadence_per_week": 4,
        "format": "push",
    },
    "tiktok": {
        "best_days": [1, 2, 3, 4, 5],
        "best_hours": [11, 15, 19],
        "cadence_per_week": 5,
        "format": "short video",
    },
    "blog": {
        "best_days": [1, 3],  # Tue, Thu
        "best_hours": [9],
        "cadence_per_week": 1,
        "format": "article",
    },
    "email": {
        "best_days": [1, 3],
        "best_hours": [10],
        "cadence_per_week": 1,
        "format": "newsletter",
    },
    "whatsapp": {
        "best_days": [0, 2, 4],
        "best_hours": [10, 18],
        "cadence_per_week": 2,
        "format": "broadcast",
    },
    "seo": {
        "best_days": [0, 2, 4],
        "best_hours": [9],
        "cadence_per_week": 2,
        "format": "optimization task",
    },
    "video": {
        "best_days": [2, 4],
        "best_hours": [12],
        "cadence_per_week": 1,
        "format": "hero/demo video",
    },
}


def build_campaign_calendar(
    *,
    channels: list[str] | None = None,
    start_date: date | None = None,
    duration_days: int = 30,
    phases: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Returns a 30-day calendar:
      days: [{date, weekday, events: [{channel, time, format, phase, priority}]}]
      summary: {total_events, by_channel: {channel: count}}
    """
    if start_date is None:
        start_date = date.today()

    active_channels = channels or list(CHANNEL_DEFAULTS.keys())
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
            cfg = CHANNEL_DEFAULTS.get(ch, CHANNEL_DEFAULTS["linkedin"])
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
                "format": cfg["format"],
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

    by_channel = {}
    for ch in active_channels:
        by_channel[ch] = channel_slots.get(ch, 0)

    return {
        "days": days,
        "summary": {
            "total_events": total,
            "duration_days": duration_days,
            "start_date": start_date.isoformat(),
            "by_channel": by_channel,
        },
    }


def _build_phase_map(phases: list[dict[str, Any]] | None, start: date, total: int) -> dict[int, str]:
    if not phases:
        return {
            **{i: "Launch" for i in range(0, min(7, total))},
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
