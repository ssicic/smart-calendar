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

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then paste your ANTHROPIC_API_KEY into .env
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787 --env-file .env
```

`--host 0.0.0.0` lets your phone reach it over Wi-Fi. The app finds it on the
same computer that runs Expo, port 8787 (override with `EXPO_PUBLIC_AI_URL`).

Demo mode, no key and no cost: `AI_FAKE=1 .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787`

## Test

```bash
.venv/bin/python -m pytest -q
```

Tests use a fake model, so they run offline.
