# Ask your past weeks: eval results

History: 16 weeks + 2 month summaries (`evals/rag_history.py`) · 17 questions (15 answerable, 2 not in the history) · today = 2026-10-28
Embeddings: `fake-hash-256` (fake) · answers: `claude-haiku-5-5` · top 5 docs go to the model

> Fake embeddings hash words, so vector search here only matches shared words. Run `python -m evals.rag_run --embeddings voyage` for real meaning-search numbers.

Changes so far:

- 2026-11-05, first run (fake embeddings): hybrid recall@5 0.73, MRR 0.58. "Gym before work" failed:
  docs had only clock times, so no search could tell 07:00 is before work.
- Week docs now say "before Work" when a fixed event starts within 3h after a session:
  keyword recall@5 0.60 → 0.67, hybrid 0.73 → 0.80, and that question is answered.
- Open: meaning questions (vacation/holiday, jog/run, sober/no alcohol) need real embeddings.

## Retrieval

| Search | Recall@5 | MRR |
|---|---|---|
| keyword | 0.67 | 0.50 |
| vector | 0.73 | 0.41 |
| hybrid | 0.80 | 0.59 |

Recall@5 by question kind:

| Kind | n | keyword | vector | hybrid |
|---|---|---|---|---|
| keyword | 8 | 1.00 | 0.88 | 1.00 |
| meaning | 5 | 0.00 | 0.40 | 0.40 |
| summary | 2 | 1.00 | 1.00 | 1.00 |

## Answers

| Metric | Value |
|---|---|
| Citation precision (all cited docs that are expected ones) | 12/23 = 0.52 |
| First citation right | 12/15 |
| Citation hit (a right week cited) | 12/15 |
| Says it doesn't know (not in history) | 2/2 |
| Dates/times found in cited weeks | 14/17 |
| Faithful (Claude judge) | 16/17 |

## Per question

| Kind | Question | Expected | Hybrid rank | Cited | Answer |
|---|---|---|---|---|---|
| keyword | When did I last go to the gym before work? | week:2026-10-12 | 4 | week:2026-10-12, week:2026-09-14 | Your last gym session before work was Thursday 15 Oct, 07:00-08:00, before Work at 09:00. That was in the week of 12 Oct, the most recent one before today (28 Oct). |
| keyword | When was my dentist appointment? | week:2026-09-28 | 1 | week:2026-09-28 | Your dentist appointment was on Wednesday 30 Sep 2026, 14:00-15:00, and it was marked as done. |
| keyword | When did I renew my passport? | week:2026-07-13 | 1 | week:2026-07-13, week:2026-07-06 | You renewed your passport in the week of 13 July 2026. Your calendar shows a passport office visit on Wednesday 15 Jul, 10:00-11:00, and the "Renew passport" to-do was marked done that week. It was still not done in the week of 6 July. |
| keyword | Which week was mum's birthday dinner? | week:2026-08-24 | 2 | week:2026-08-24, month:2026-08 | Mum's birthday dinner was on Saturday 29 Aug 2026, 19:00-22:00, in the week of 24 Aug 2026. It was marked as done. |
| keyword | When did I go to the concert at Tvornica? | week:2026-10-19 | 1 | week:2026-10-19 | You went to the concert at Tvornica on Friday 23 Oct 2026, from 20:00 to 23:00, after a full day of work. It was marked as done. |
| keyword | When did I get the car serviced? | week:2026-09-07 | 2 | week:2026-09-07, week:2026-08-31, month:2026-08 | You got the car serviced on Tuesday 8 Sep 2026, from 08:00 to 09:00, before work at 09:00. It was booked to-do that had slipped from late August into September. |
| keyword | When did I do a yoga class? | week:2026-07-27 | 1 | week:2026-07-27 | The most recent yoga class I can find was Saturday 1 Aug 2026, 10:00-11:00, and it was marked done. It was in the week of 27 Jul 2026. None of the other weeks mention a yoga class. |
| keyword | Which week did I finish both Spanish lessons? | week:2026-09-21 | 2 | week:2026-09-21, month:2026-09 | You finished both Spanish lessons in the week of 21 Sep 2026: Tuesday 22 Sep, 18:00-19:00, and Thursday 24 Sep, 18:00-19:00, were both marked done. |
| meaning | When was I on vacation? | week:2026-08-10 | 18 | - | The documents don't mention any vacation. The only trip mentioned is a week of holiday in Split in August 2026, noted in the August month summary, but the weekly records for August aren't included, so I couldn't find exact dates. |
| meaning | Which week was I unwell? | week:2026-10-05 | 1 | week:2026-10-05 | The week of 5 Oct 2026 shows sick days: Tuesday 6 Oct and Wednesday 7 Oct were both marked as Sick day 09:00-17:00 and done, with work resuming on Thursday 8 Oct. |
| meaning | When did I first go for a jog? | week:2026-08-17 | 16 | month:2026-08 | The documents don't mention jogging by that name. The closest match is August 2026, where your first run of the year is noted as a Sunday morning, but the exact date isn't recorded. The weeks from 28 Sep to 25 Oct don't mention any jog or run. |
| meaning | When did I go walking in the mountains? | week:2026-10-12 | 3 | week:2026-10-12 | You went hiking on Sljeme on Saturday 17 Oct 2026, from 09:00 to 14:00. That was the only mountain walk in these weeks. |
| meaning | When did I stay sober the whole week? | week:2026-10-05 | 7 | - | I couldn't find a week where you stayed sober the whole week in these documents. The most recent habit record, the week of 12 Oct 2026, shows No alcohol on 4 of 7 days. |
| summary | How did August go overall? | month:2026-08 | 1 | month:2026-08, week:2026-08-10, week:2026-08-03 | August was a restful month, with a week-long holiday in Split (10-16 Aug) that took up most of the time, and free time was high at 80% that week. Highlights were a first run of the year on Sunday morning, Mum's birthday dinner going as planned, and gym sessions about once a week in the evenings. The car service booking slipped to September. |
| summary | What slipped in September? | month:2026-09 | 2 | month:2026-09, week:2026-08-31, week:2026-09-14 | In September, gym only happened 2 of 12 planned sessions, and running stopped. Booking the car service also slipped from August into September, and it is listed as not done in the week of 31 Aug. The Spanish lesson on Thu 17 Sep at 18:00 was planned but not marked done, though Spanish did reach 3 of 6 lessons, with both done in the week of 21 Sep. |
| not in history | When did I go skiing? | (none) | - | - | None of these weeks mention skiing, so I couldn't find when you went skiing in these documents. |
| not in history | When did I see my therapist? | (none) | - | - | I couldn't find any therapist visit in these weeks. The documents cover Jul, Aug and Sep 2026 and don't mention a therapist. |
