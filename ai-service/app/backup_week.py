"""Reads one week out of the app's backup file (Year → Backup in the app).

Same rules as the app's loadWeek, kept small: one-off and repeating events
(with their per-week exceptions), the sessions the user touched (kept, locked,
done), sleep times. Sessions the app places automatically aren't stored, so
they aren't here: the flexible items are listed instead.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

from .calendar_tools import Block, Item, WeekSnapshot, Window

DEFAULT_SLEEP = {"weekday": {"wake": 420, "bed": 1380}, "weekend": {"wake": 420, "bed": 1380}, "windDownMin": 30}


def monday_of(day: date) -> str:
    return (day - timedelta(days=day.weekday())).isoformat()


def _importance(priority: int) -> str:
    return "low" if priority <= 2 else "medium" if priority <= 4 else "high"


def _time_of_day(windows: str | None) -> str:
    if not windows:
        return "any"
    start = json.loads(windows)[0]["start"]
    return "morning" if start < 720 else "afternoon" if start < 1020 else "evening"


def _in_week(row: dict, week: str) -> bool:
    if row.get("week_start"):
        return row["week_start"] == week
    return (row.get("from_week") or "") <= week and (row.get("until_week") or "9999") >= week


def week_from_backup(backup: dict, week: str) -> WeekSnapshot:
    if backup.get("app") != "smart-calendar":
        raise ValueError("This isn't a Smart Calendar backup.")
    t = backup["tables"]
    exceptions = {(e["event_id"], e["week_start"]): e for e in t.get("event_exceptions", [])}
    items = {i["id"]: i for i in t.get("flexible_items", [])}

    blocks: list[Block] = []
    for e in t.get("events", []):
        if not _in_week(e, week):
            continue
        start, end = e["start_min"], e["end_min"]
        if ex := exceptions.get((e["id"], week)):
            if ex["start_min"] is None:
                continue  # "not this week"
            start, end = ex["start_min"], ex["end_min"]
        blocks.append(Block(id=e["id"], title=e["title"], kind=e.get("kind", "fixed"), start=start, end=end))
    for p in t.get("placements", []):
        if p["week_start"] == week and p["state"] in ("kept", "locked", "done"):
            title = items.get(p["item_id"], {}).get("title", "Session")
            blocks.append(
                Block(
                    id=p["id"],
                    title=title + (" (done)" if p["state"] == "done" else ""),
                    kind="flexible",
                    start=p["start_min"],
                    end=p["end_min"],
                    item_id=p["item_id"],
                )
            )

    settings = {s["key"]: s["value"] for s in t.get("settings", [])}
    sleep = {**DEFAULT_SLEEP, **json.loads(settings["sleep"])} if "sleep" in settings else DEFAULT_SLEEP
    overrides = {o["day"]: o for o in t.get("day_overrides", []) if o["week_start"] == week}
    windows = []
    for d in range(7):
        usual = sleep["weekend" if d >= 5 else "weekday"]
        o = overrides.get(d, {})
        wake = o.get("wake_min") if o.get("wake_min") is not None else usual["wake"]
        bed = o.get("bed_min") if o.get("bed_min") is not None else usual["bed"]
        windows.append(Window(start=wake, end=min(bed - sleep["windDownMin"], 1440)))

    return WeekSnapshot(
        week_start=week,
        blocks=blocks,
        windows=windows,
        items=[
            Item(
                item_id=i["id"],
                title=i["title"],
                duration_min=i["duration_min"],
                times_per_week=i["times_per_week"],
                importance=_importance(i["priority"]),
                time_of_day=_time_of_day(i.get("preferred_windows")),
            )
            for i in items.values()
            if _in_week(i, week)
        ],
    )
