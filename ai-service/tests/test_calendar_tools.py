from app.calendar_tools import Block, WeekPlan, WeekSnapshot, Window, free_gaps

D = 1440


def week(**kw) -> WeekSnapshot:
    blocks = [
        Block(id="work-mon", title="Work", kind="fixed", start=540, end=1020),
        Block(id="gym1", title="Gym", kind="flexible", start=1080, end=1140, movable=True, item_id="gym"),
        Block(id="gym2", title="Gym", kind="flexible", start=D + 1080, end=D + 1140, movable=False, item_id="gym"),
    ]
    return WeekSnapshot(week_start="2026-11-02", blocks=blocks, windows=[Window(start=420, end=1380)] * 7, **kw)


def test_free_gaps():
    assert free_gaps([(10, 20), (15, 30), (50, 60)], 0, 100) == [(0, 10), (30, 50), (60, 100)]
    assert free_gaps([], 5, 10) == [(5, 10)]
    assert free_gaps([(0, 100)], 5, 10) == []


def test_get_week_lists_ids_and_awake_hours():
    text = WeekPlan(week()).get_week()
    assert "Mon (awake 07:00–23:00)" in text
    assert "18:00–19:00 Gym [movable, id=gym1]" in text
    assert "09:00–17:00 Work [fixed, id=work-mon]" in text


def test_free_slots_respect_buffer_awake_hours_and_now():
    plan = WeekPlan(week())
    assert plan.find_free_slots("Mon", 30) == "Mon 07:00–08:45 (105 min)\nMon 17:15–17:45 (30 min)\nMon 19:15–23:00 (225 min)"
    assert plan.find_free_slots("monday", 60, "evening") == "Mon 19:15–23:00 (225 min)"
    later = WeekPlan(week(now=1200))  # Mon 20:00
    assert later.find_free_slots("Mon", 30) == "Mon 20:00–23:00 (180 min)"
    assert "Unknown day" in plan.find_free_slots("Someday")


def test_move_is_checked():
    plan = WeekPlan(week())
    assert "Overlaps Work" in plan.propose_move("gym1", "Mon", "16:30", "x")
    assert "Too close to" in plan.propose_move("gym1", "Mon", "17:00", "x")
    assert "outside awake hours" in plan.propose_move("gym1", "Mon", "22:30", "x")
    assert "can't be changed" in plan.propose_move("gym2", "Wed", "10:00", "x")
    assert "No session" in plan.propose_move("nope", "Wed", "10:00", "x")
    assert "in the past" in WeekPlan(week(now=2 * D)).propose_move("gym1", "Wed", "08:00", "x")  # Monday's is over
    assert "in the past" in WeekPlan(week(now=600)).propose_move("gym1", "Mon", "08:00", "x")
    assert plan.proposals == []


def test_proposals_change_the_week():
    plan = WeekPlan(week())
    assert plan.propose_move("gym1", "Wed", "07:00", "Mornings work better") == "Proposed: Gym to Wed 07:00–08:00."
    p = plan.proposals[0]
    assert (p.start, p.end, p.from_label, p.to_label) == (2 * D + 420, 2 * D + 480, "Mon 18:00–19:00", "Wed 07:00–08:00")
    # Monday evening is free now; Wednesday morning is taken.
    assert plan.find_free_slots("Mon", 30, "evening") == "Mon 17:15–23:00 (345 min)"
    assert plan.find_free_slots("Wed", 30, "morning") == "Wed 08:15–12:00 (225 min)"


def test_get_week_marks_past_and_doubled_sessions():
    snap = week(now=2 * D)
    snap.blocks.append(snap.blocks[1].model_copy(update={"id": "gym3", "start": 1200, "end": 1260}))
    text = WeekPlan(snap).get_week()
    assert "Gym [past, id=gym1]" in text and "note: 2 Gym sessions on Mon" in text


def test_skip():
    plan = WeekPlan(week())
    assert "skip Gym" in plan.propose_skip("gym1", "Busy week")
    assert "No session" in plan.propose_skip("gym1", "again")
    assert [p.type for p in plan.proposals] == ["skip"]
