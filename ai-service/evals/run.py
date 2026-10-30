"""Run the "Plan my week" evals and write evals/results.md.

    .venv/bin/python -m evals.run            # real Claude (needs ANTHROPIC_API_KEY), ~1-2 cents
    .venv/bin/python -m evals.run --fake     # the demo model: checks the harness, no cost
    .venv/bin/python -m evals.run --repeat 3 # each case 3 times (LLMs vary run to run)

Each run checks the general rules (every proposal is a real, movable session at
a valid time, no clashes after applying them all, at most 5, a summary) and the
case's own checks. Langfuse traces each run too when its keys are set.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from app import agent, tracing
from app.calendar_tools import MAX_PROPOSALS, Block, WeekPlan

from .cases import Case, cases

# Claude Haiku 5.5, $ per million tokens.
PRICE_IN, PRICE_OUT = 0.10, 0.50


def apply(case: Case, result: agent.PlanResult) -> list[Block]:
    """The week after accepting every proposal."""
    blocks = {b.id: b.model_copy() for b in case.week.blocks}
    for p in result.proposals:
        if p.type == "skip":
            blocks.pop(p.session_id, None)
        elif p.session_id in blocks and p.start is not None and p.end is not None:
            blocks[p.session_id].start, blocks[p.session_id].end = p.start, p.end
    return list(blocks.values())


def general_checks(case: Case, result: agent.PlanResult, week: list[Block]) -> list[tuple[str, bool, str]]:
    original = {b.id: b for b in case.week.blocks}
    plan = WeekPlan(case.week)
    pad = case.week.buffer_min
    clashes = [
        (a.title, b.title)
        for i, a in enumerate(week)
        for b in week[i + 1 :]
        if a.start < b.end + pad and b.start < a.end + pad and (a.id in {p.session_id for p in result.proposals} or b.id in {p.session_id for p in result.proposals})
    ]
    in_hours = all(
        plan._window(p.start // 1440)[0] <= p.start and p.end <= plan._window(p.start // 1440)[1]
        for p in result.proposals
        if p.start is not None and p.end is not None
    )
    return [
        ("only movable sessions", all(original.get(p.session_id) and original[p.session_id].movable for p in result.proposals), ""),
        ("no clashes", not clashes, f"{clashes[:2]}" if clashes else ""),
        ("awake hours", in_hours, ""),
        (f"≤ {MAX_PROPOSALS} changes", len(result.proposals) <= MAX_PROPOSALS, ""),
        ("has a summary", bool(result.summary.strip()), ""),
    ]


def run_case(case: Case, model=None) -> dict:
    t0 = time.time()
    result = agent.plan_week(agent.PlanRequest(week=case.week, wish=case.wish), model, tracing.callbacks())
    seconds = time.time() - t0
    week = apply(case, result)
    checks = general_checks(case, result, week)
    for check in case.checks:
        ok, detail = check(week, result.proposals)
        checks.append((detail, ok, ""))
    return {
        "case": case.name,
        "passed": all(ok for _, ok, _ in checks),
        "failed": [f"{name} ({detail})" if detail else name for name, ok, detail in checks if not ok],
        "proposals": len(result.proposals),
        "tool_calls": result.tool_calls,
        "seconds": seconds,
        "cost": result.input_tokens / 1e6 * PRICE_IN + result.output_tokens / 1e6 * PRICE_OUT,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fake", action="store_true", help="demo model, no API calls")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--out", default=str(Path(__file__).with_name("results.md")))
    args = parser.parse_args()
    if args.fake:
        os.environ["AI_FAKE"] = "1"

    rows = []
    for case in cases():
        for _ in range(args.repeat):
            row = run_case(case)
            rows.append(row)
            mark = "PASS" if row["passed"] else "FAIL"
            print(f"{mark}  {case.name:<28} {row['seconds']:5.1f}s  {row['tool_calls']:>2} tools  " + "; ".join(row["failed"]))
    tracing.flush()

    n = len(rows)
    passed = sum(r["passed"] for r in rows)
    lines = [
        "# Plan my week: eval results",
        "",
        f"Model: `{'demo (no API)' if args.fake else agent.MODEL}` · {n} runs · **{passed}/{n} passed ({passed / n:.0%})**",
        f"Avg {sum(r['seconds'] for r in rows) / n:.1f}s and {sum(r['tool_calls'] for r in rows) / n:.1f} tool calls per run · "
        f"total cost ${sum(r['cost'] for r in rows):.4f}",
        "",
        "| Case | Result | Proposals | Tool calls | Time | Failed checks |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['case']} | {'✅' if r['passed'] else '❌'} | {r['proposals']} | {r['tool_calls']} | {r['seconds']:.1f}s | {'; '.join(r['failed'])} |"
        )
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text("\n".join(lines) + "\n")
    print("\n" + "\n".join(lines[:4]))
    return 0 if passed == n else 1


if __name__ == "__main__":
    sys.exit(main())
