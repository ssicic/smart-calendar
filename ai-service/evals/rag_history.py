"""A fixed demo history for the "Ask your past weeks" evals: 16 weeks
(6 Jul - 25 Oct 2026) and two month summaries, written in the same text
format the app builds (src/ui/weekDocs.ts)."""

from __future__ import annotations

from datetime import date, timedelta

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

WORK = "Work 09:00-17:00 (done)"


def _fmt(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def week_text(start: str, totals: tuple[float, float, int], days: dict[int, list[str]], extra: list[str], work: bool = True) -> str:
    monday = date.fromisoformat(start)
    lines = [
        f"Week of {_fmt(monday)} (Mon {_fmt(monday)} to Sun {_fmt(monday + timedelta(days=6))})",
        f"Planned {totals[0]}h, done {totals[1]}h, free time {totals[2]}%.",
    ]
    for i in range(7):
        d = monday + timedelta(days=i)
        items = list(days.get(i, []))
        if work and i < 5:
            items.append(WORK)
        items.sort(key=_time)
        label = f"{DAYS[i]} {d.day} {MONTHS[d.month - 1]}"
        lines.append(f"{label}: {'; '.join(items) if items else 'nothing planned'}.")
    lines += extra
    return "\n".join(lines)


def _time(entry: str) -> str:
    for part in entry.split():
        if len(part) == 11 and part[2] == ":" and part[5] == "-":
            return part
    return "99"


# (week start, (planned h, done h, free %), {day: [entries]}, extra lines, work week?)
WEEKS = [
    ("2026-07-06", (46, 40, 52), {1: ["Gym 18:00-19:00 (done)"], 3: ["Gym 18:00-19:00 (done)"]},
     ["Flexible sessions: Gym (Health) 2 of 3 done.", "To-dos: 1 of 2 done. Done: Book flights. Not done: Renew passport."]),
    ("2026-07-13", (45, 41, 53), {0: ["Gym 18:30-19:30 (done)"], 2: ["Passport office 10:00-11:00 (done)"]},
     ["Flexible sessions: Gym (Health) 1 of 3 done.", "To-dos: 2 of 2 done. Done: Renew passport, Pay rent."]),
    ("2026-07-20", (50, 48, 41), {0: ["Gym 18:00-19:00 (done)"], 2: ["Gym 18:00-19:00 (done)"], 4: ["Gym 18:00-19:00 (done)"], 5: ["Clean the flat 10:00-12:00 (done)"]},
     ["Flexible sessions: Gym (Health) 3 of 3 done.", "To-dos: 4 of 4 done. Done: Pay rent, Call bank, Fix bike, Clean the flat.", "Time by group: Work 40h, Health 3h, Home 2h."]),
    ("2026-07-27", (44, 36, 55), {5: ["Yoga class 10:00-11:00 (done)"], 1: ["Gym 18:00-19:00 (planned, not marked done)"]},
     ["Flexible sessions: Gym (Health) 0 of 3 done; Yoga (Health) 1 of 1 done."]),
    ("2026-08-03", (42, 35, 57), {3: ["Gym 18:00-19:00 (done)"]},
     ["Flexible sessions: Gym (Health) 1 of 3 done.", "To-dos: 1 of 1 done. Done: Pack for Split."]),
    ("2026-08-10", (20, 18, 80), {i: ["Holiday in Split 08:00-22:00 (done)"] for i in range(7)},
     ["Time by group: Fun 98h."], False),
    ("2026-08-17", (44, 38, 54), {6: ["Running 08:00-08:30 (done)"], 2: ["Gym 18:00-19:00 (done)"]},
     ["Flexible sessions: Gym (Health) 1 of 3 done; Running (Health) 1 of 1 done.", "Week goals: Run 5k 1 of 3."]),
    ("2026-08-24", (43, 39, 55), {5: ["Mum's birthday dinner 19:00-22:00 (done)"], 1: ["Gym 18:00-19:00 (done)"]},
     ["To-dos: 1 of 2 done. Done: Buy present for mum. Not done: Book car service."]),
    ("2026-08-31", (44, 37, 54), {0: ["Gym 18:00-19:00 (done)"], 3: ["Running 07:00-07:30 (moved to another week)"]},
     ["To-dos: 0 of 1 done. Not done: Book car service."]),
    ("2026-09-07", (46, 40, 51), {1: ["Car service 08:00-09:00 (done, before Work)"], 3: ["Spanish lesson 18:00-19:00 (done)"]},
     ["Flexible sessions: Spanish (Learning) 1 of 2 done.", "To-dos: 1 of 1 done. Done: Car service."]),
    ("2026-09-14", (47, 42, 50), {1: ["Gym 07:00-08:00 (done, before Work)"], 3: ["Spanish lesson 18:00-19:00 (planned, not marked done)"]},
     ["Flexible sessions: Gym (Health) 1 of 2 done; Spanish (Learning) 0 of 2 done."]),
    ("2026-09-21", (47, 43, 50), {1: ["Spanish lesson 18:00-19:00 (done)"], 3: ["Spanish lesson 18:00-19:00 (done)"]},
     ["Flexible sessions: Spanish (Learning) 2 of 2 done."]),
    ("2026-09-28", (45, 40, 52), {2: ["Dentist 14:00-15:00 (done)"], 4: ["Gym 18:00-19:00 (done)"]},
     ["Flexible sessions: Gym (Health) 1 of 3 done; Spanish (Learning) 0 of 2 done."]),
    ("2026-10-05", (30, 12, 70), {0: [WORK], 1: ["Sick day 09:00-17:00 (done)"], 2: ["Sick day 09:00-17:00 (done)"], 3: [WORK], 4: [WORK]},
     ["Habits: No alcohol: 7 of 7 days; Walk 10k steps: 1 of 5 days.", "Flexible sessions: Gym (Health) 0 of 3 done."], False),
    ("2026-10-12", (47, 42, 50), {3: ["Gym 07:00-08:00 (done, before Work)"], 5: ["Hike on Sljeme 09:00-14:00 (done)"]},
     ["Flexible sessions: Gym (Health) 1 of 3 done.", "Habits: No alcohol: 4 of 7 days."]),
    ("2026-10-19", (46, 40, 51), {4: ["Concert at Tvornica 20:00-23:00 (done)"], 1: ["Spanish lesson 18:00-19:00 (moved to another week)"]},
     ["Flexible sessions: Spanish (Learning) 0 of 2 done, 1 moved on."]),
]

MONTH_SUMMARIES = {
    "2026-08": "Month summary for August 2026\nA restful month with a week of holiday in Split.\n"
    "Wins: First run of the year on a Sunday morning. Mum's birthday dinner happened as planned.\n"
    "Patterns: Gym sessions happened in the evening, about once a week.\n"
    "Slipped: Booking the car service waited until September.",
    "2026-09": "Month summary for September 2026\nA learning month: Spanish lessons started.\n"
    "Wins: Spanish 3 of 6 lessons, with both lessons done in the week of 21 Sep.\n"
    "Slipped: Gym only 2 of 12 sessions, and running stopped.\n"
    "Tip for next month: Try one gym session in the morning before work.",
}


def docs() -> list[dict]:
    out = []
    for start, totals, days, extra, *work in WEEKS:
        out.append({"id": f"week:{start}", "text": week_text(start, totals, days, extra, work[0] if work else True)})
    for month, text in MONTH_SUMMARIES.items():
        out.append({"id": f"month:{month}", "text": text})
    return out
