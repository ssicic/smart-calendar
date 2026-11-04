# Smart Calendar AI service

A small FastAPI service that gives the app its AI features. The app never holds
the API key: it sends facts about your weeks here, the service asks Claude and
checks the answer before sending it back.

## Weekly review assistant

`POST /weekly-review` takes up to 8 weeks of facts (per flexible item: planned,
done with day/time, queued, upcoming, not done) and how each item is set up now.
It returns a short summary and 0-3 suggestions. Each suggestion is one typed
action (`set_time_of_day`, `set_times_per_week`, `set_duration`,
`set_importance`, or `none`) that the app applies only when the user taps Accept.

The model only suggests; it never edits data. Answers are constrained with
structured outputs (Pydantic schema), then filtered again (`clean()` drops
unknown items, out-of-range values and no-op changes), and the app checks each
action once more before writing to the database.

## Monthly summary

`POST /monthly-summary` takes the month's weeks (same facts), the items and the
year and month goals, and returns a headline plus up to 3 wins, patterns and
things that slipped, and one tip. It is read-only: nothing to apply. The app
saves each month's summary, so it's only written again when asked.

## Plan my week (agent)

`POST /plan-week` takes a snapshot of one week (blocks in week-minutes, which
flexible sessions may move, awake hours per day, the flexible items) and an
optional wish. `app/agent.py` runs a LangGraph graph (agent node ⇄ tools node)
with Claude Haiku and five tools from `app/calendar_tools.py`:

| Tool | Does |
|---|---|
| `get_week` | The week as text: awake hours, blocks with ids, notes like "2 Gym sessions on Tue" |
| `find_free_slots(day, min_minutes, part_of_day)` | Free gaps with the 15-minute buffer, from now on |
| `propose_move(session_id, day, start_time, reason)` | Checked: movable, not past, awake hours, no clash. Else returns why |
| `propose_skip(session_id, reason)` | Sends a session to next week |
| `propose_add_event(title, days, start_time, end_time, repeat_weekly, reason)` | A new event on one or more days, this week or every week. Says what it overlaps |

It returns a summary, the checked proposals, tool-call count and tokens. The
model never writes anything; the app applies accepted proposals itself.
`AI_FAKE=1` uses a scripted demo model.

## Tracing (Langfuse)

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL`
(e.g. `https://cloud.langfuse.com`) and every agent run is traced: each model
call with tokens and cost, each tool call with input and output, and timing.
Without the keys nothing is sent. `app/tracing.py`.

## Evals

```bash
.venv/bin/python -m evals.run             # real Claude, about 1 cent
.venv/bin/python -m evals.run --repeat 3  # each case 3 times
.venv/bin/python -m evals.run --fake      # harness only, no API
```

`evals/cases.py`: 10 weeks + wishes + checks on the week after applying the
proposals. `evals/run.py` adds general checks and writes `evals/results.md`
(pass rate, time, tool calls, cost).

## MCP server

`mcp_server.py` exposes `get_week`, `find_free_slots` and `check_slot`
(read-only) over a backup file from the app (Year → Backup). The calendar lives
on the phone, so this reads a snapshot: export again to refresh.

```bash
claude mcp add smart-calendar -e SMART_CALENDAR_BACKUP=/path/to/backup.json \
  -- "$PWD/.venv/bin/python" "$PWD/mcp_server.py"
```

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env   # then paste your ANTHROPIC_API_KEY into .env
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787 --env-file .env
```

`--host 0.0.0.0` lets your phone reach it over Wi-Fi. The app finds it on the
same computer that runs Expo, port 8787 (override with `EXPO_PUBLIC_AI_URL`).

Demo mode, no key and no cost: `AI_FAKE=1 .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787`

## App token

When `APP_TOKEN` is set, the AI endpoints only answer requests with a matching
`X-App-Token` header (the app sends `EXPO_PUBLIC_AI_TOKEN` from its `.env`). It
stops strangers who find the URL from spending the credit. The token ships
inside the app, so it isn't a real secret: the spend limit in the Claude Console
is the hard cap.

## Deploy (Vercel, free Hobby plan)

Vercel finds the FastAPI `app` in `app/main.py` by itself. `requirements.txt`
holds only what the server needs (tests and uvicorn are in
`requirements-dev.txt`), `vercel.json` allows 60 s per request, and
`.vercelignore` keeps `.env` and the venv out of the upload.

```bash
npx vercel          # first time: log in and link the project (root: ai-service)
npx vercel --prod   # deploy
```

Set `ANTHROPIC_API_KEY` and `APP_TOKEN` in the Vercel dashboard: Project →
Settings → Environment Variables. Then point the app at the address with
`EXPO_PUBLIC_AI_URL` in the app's `.env`.

## Test

```bash
.venv/bin/python -m pytest -q
```

Tests use a fake model, so they run offline.
