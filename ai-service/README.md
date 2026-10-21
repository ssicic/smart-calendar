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
