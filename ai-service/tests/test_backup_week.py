import json

import pytest

import mcp_server
from app.backup_week import monday_of, week_from_backup
from app.calendar_tools import WeekPlan

W = "2026-11-02"
BACKUP = {
    "app": "smart-calendar",
    "version": 18,
    "tables": {
        "events": [
            # Repeating Work, but not this week on Wednesday's copy; a one-off dentist; next week's party.
            {"id": "work", "kind": "fixed", "title": "Work", "start_min": 540, "end_min": 1020, "week_start": None, "from_week": "2026-10-19", "until_week": None},
            {"id": "work-wed", "kind": "fixed", "title": "Work", "start_min": 2 * 1440 + 540, "end_min": 2 * 1440 + 1020, "week_start": None, "from_week": "2026-10-19", "until_week": None},
            {"id": "dentist", "kind": "fixed", "title": "Dentist", "start_min": 1440 + 600, "end_min": 1440 + 660, "week_start": W, "from_week": W, "until_week": None},
            {"id": "party", "kind": "fixed", "title": "Party", "start_min": 5 * 1440 + 1200, "end_min": 5 * 1440 + 1320, "week_start": "2026-11-09", "from_week": None, "until_week": None},
        ],
        "event_exceptions": [{"event_id": "work-wed", "week_start": W, "start_min": None, "end_min": None}],
        "flexible_items": [
            {"id": "gym", "title": "Gym", "duration_min": 60, "times_per_week": 3, "priority": 5, "preferred_windows": json.dumps([{"start": 1020, "end": 1320}]), "week_start": None, "from_week": "2026-10-19", "until_week": None},
        ],
        "placements": [
            {"id": "p1", "week_start": W, "item_id": "gym", "start_min": 1080, "end_min": 1140, "state": "done"},
            {"id": "p2", "week_start": W, "item_id": "gym", "start_min": 3 * 1440 + 1080, "end_min": 3 * 1440 + 1140, "state": "skipped"},
        ],
        "settings": [{"key": "sleep", "value": json.dumps({"weekday": {"wake": 390, "bed": 1350}, "weekend": {"wake": 480, "bed": 1440}, "windDownMin": 30})}],
        "day_overrides": [{"week_start": W, "day": 4, "wake_min": None, "bed_min": 1500}],
    },
}


def test_reads_one_week():
    snap = week_from_backup(BACKUP, W)
    assert sorted(b.id for b in snap.blocks) == ["dentist", "p1", "work"]
    assert [b.title for b in snap.blocks if b.id == "p1"] == ["Gym (done)"]
    assert (snap.windows[0].start, snap.windows[0].end) == (390, 1320)
    assert (snap.windows[4].start, snap.windows[4].end) == (390, 1440)  # late Friday, capped at midnight
    assert (snap.windows[5].start, snap.windows[5].end) == (480, 1410)
    assert snap.items[0].time_of_day == "evening" and snap.items[0].importance == "high"


def test_rejects_other_files():
    with pytest.raises(ValueError):
        week_from_backup({"tables": {}}, W)


def test_monday_of():
    from datetime import date

    assert monday_of(date(2026, 11, 5)) == W


def test_mcp_tools(tmp_path, monkeypatch):
    path = tmp_path / "backup.json"
    path.write_text(json.dumps(BACKUP))
    monkeypatch.setenv("SMART_CALENDAR_BACKUP", str(path))
    assert "10:00–11:00 Dentist" in mcp_server.get_week(W)
    assert mcp_server.find_free_slots("Wed", 60, "morning", W) == "Wed 06:30–12:00 (330 min)"
    assert mcp_server.check_slot("Tue", "10:30", 30, W).startswith("Overlaps Dentist")
    assert mcp_server.check_slot("Wed", "10:30", 30, W) == "It fits."
    assert isinstance(WeekPlan(week_from_backup(BACKUP, W)).get_week(), str)
