"""Smart Calendar as an MCP server: lets Claude Desktop, Claude Code (or any MCP
client) read your calendar and find free time. Read-only.

It reads a backup file from the app (Year → Backup → Save a backup). Your
calendar lives on your phone, so this is a snapshot; export again to refresh.

    SMART_CALENDAR_BACKUP=~/Downloads/smart-calendar-backup-2026-10-30.json \\
      .venv/bin/python mcp_server.py

Claude Code: claude mcp add smart-calendar -e SMART_CALENDAR_BACKUP=/path/to/backup.json \\
      -- /path/to/ai-service/.venv/bin/python /path/to/ai-service/mcp_server.py
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

from mcp.server.mcpserver import MCPServer

from app.backup_week import monday_of, week_from_backup
from app.calendar_tools import DAY, WeekPlan, parse_day, parse_time

mcp = MCPServer(
    "smart-calendar",
    instructions="Read-only access to the user's Smart Calendar (from a backup file). "
    "Weeks are named by their Monday, YYYY-MM-DD; leave week_start empty for this week.",
)


def _plan(week_start: str) -> WeekPlan:
    path = os.environ.get("SMART_CALENDAR_BACKUP")
    if not path:
        raise ValueError("Set SMART_CALENDAR_BACKUP to the path of a Smart Calendar backup file.")
    backup = json.loads(Path(path).expanduser().read_text())
    week = monday_of(date.fromisoformat(week_start)) if week_start else monday_of(date.today())
    return WeekPlan(week_from_backup(backup, week))


@mcp.tool()
def get_week(week_start: str = "") -> str:
    """The week day by day: awake hours, events, routines and the sessions the user placed or finished, plus the flexible items the app schedules."""
    return _plan(week_start).get_week()


@mcp.tool()
def find_free_slots(day: str, min_minutes: int = 30, part_of_day: str = "any", week_start: str = "") -> str:
    """Free time on one day (Mon..Sun) of at least min_minutes, inside awake hours with 15 minutes around other things. part_of_day: any, morning, afternoon or evening. Sessions the app places automatically aren't in the backup, so treat these as candidates."""
    return _plan(week_start).find_free_slots(day, min_minutes, part_of_day)


@mcp.tool()
def check_slot(day: str, start_time: str, minutes: int, week_start: str = "") -> str:
    """Whether a new block (day Mon..Sun, start "HH:MM", length in minutes) fits: within awake hours and clear of everything else."""
    d, t = parse_day(day), parse_time(start_time)
    if d is None or t is None:
        return "Use a day like 'Tue' and a time like '18:30'."
    if not 5 <= minutes <= 720:
        return "Use a length between 5 and 720 minutes."
    start = d * DAY + t
    return _plan(week_start).slot_problem(start, start + minutes) or "It fits."


if __name__ == "__main__":
    mcp.run()
