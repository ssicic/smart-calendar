# Ask your past weeks: eval results

History: 16 weeks + 2 month summaries (`evals/rag_history.py`) · 17 questions (15 answerable, 2 not in the history) · today = 2026-10-28
Embeddings: `voyage-3.5-lite-512` (voyage) · answers: `claude-haiku-5-5` · top 5 docs go to the model

Changes so far:

- 2026-11-05, first run (fake embeddings): hybrid recall@5 0.73, MRR 0.58. "Gym before work" failed:
  docs had only clock times, so no search could tell 07:00 is before work.
- Week docs now say "before Work" when a fixed event starts within 3h after a session:
  keyword recall@5 0.60 → 0.67, hybrid 0.73 → 0.80, and that question is answered.
- Real embeddings (Voyage voyage-3.5-lite): meaning questions 0/5 → 5/5, hybrid recall@5 0.80 → 1.00.
  Vector alone ranks a bit better (MRR 0.88 vs hybrid 0.78): keyword search pulls month summaries
  up for words they share. Hybrid stays the default, because it still works when /embed is down.
- Open: citation precision 0.60. The model often adds a second, related week; first citation is right 14/15.

## Retrieval

| Search | Recall@5 | MRR |
|---|---|---|
| keyword | 0.67 | 0.50 |
| vector | 1.00 | 0.88 |
| hybrid | 1.00 | 0.78 |

Recall@5 by question kind:

| Kind | n | keyword | vector | hybrid |
|---|---|---|---|---|
| keyword | 8 | 1.00 | 1.00 | 1.00 |
| meaning | 5 | 0.00 | 1.00 | 1.00 |
| summary | 2 | 1.00 | 1.00 | 1.00 |

## Answers

| Metric | Value |
|---|---|
| Citation precision (all cited docs that are expected ones) | 15/25 = 0.60 |
| First citation right | 14/15 |
| Citation hit (a right week cited) | 15/15 |
| Says it doesn't know (not in history) | 2/2 |
| Dates/times found in cited weeks | 14/17 |
| Faithful (Claude judge) | 15/17 |

## Per question

| Kind | Question | Expected | Hybrid rank | Cited | Answer |
|---|---|---|---|---|---|
| keyword | When did I last go to the gym before work? | week:2026-10-12 | 1 | week:2026-10-12, week:2026-09-14 | You last went to the gym before work on Thursday 15 Oct 2026, 07:00-08:00, before your 09:00 work start. Before that, you also went before work on Tuesday 15 Sep 2026, 07:00-08:00. |
| keyword | When was my dentist appointment? | week:2026-09-28 | 1 | week:2026-09-28 | Your dentist appointment was on Wednesday 30 Sep 2026, 14:00-15:00, and it was marked done. It came after your work day that started at 09:00 that week. |
| keyword | When did I renew my passport? | week:2026-07-13 | 1 | week:2026-07-13, week:2026-07-06 | You renewed your passport on Wednesday 15 July 2026, when you had a Passport office visit from 10:00 to 11:00 that you marked as done. It was still not done in the week of 6 July. |
| keyword | Which week was mum's birthday dinner? | week:2026-08-24 | 2 | week:2026-08-24, month:2026-08 | Mum's birthday dinner was on Saturday 29 Aug 2026, 19:00-22:00, in the week of 24 Aug. The August month summary also notes it happened as planned. |
| keyword | When did I go to the concert at Tvornica? | week:2026-10-19 | 1 | week:2026-10-19 | You went to the concert at Tvornica on Friday 23 Oct 2026, from 20:00 to 23:00, after a full day of work. It was marked as done. |
| keyword | When did I get the car serviced? | week:2026-09-07 | 2 | week:2026-09-07, month:2026-08 | You had the car service on Tuesday 8 Sep 2026, from 08:00 to 09:00, before work at 09:00. It was marked done and ticked off as a to-do that week. |
| keyword | When did I do a yoga class? | week:2026-07-27 | 1 | week:2026-07-27 | The most recent yoga class I can find was Saturday 1 Aug 2026, 10:00-11:00, and it was marked done. The week of 27 Jul 2026 lists it as the only yoga session, with one of one flexible yoga sessions completed. |
| keyword | Which week did I finish both Spanish lessons? | week:2026-09-21 | 2 | week:2026-09-21, month:2026-09 | You finished both Spanish lessons in the week of 21 Sep 2026: Tuesday 22 Sep, 18:00-19:00, and Thursday 24 Sep, 18:00-19:00, both marked done. |
| meaning | When was I on vacation? | week:2026-08-10 | 1 | week:2026-08-10, month:2026-08 | You were on holiday in Split from Monday 10 August to Sunday 16 August 2026, with each day blocked 08:00-22:00 and marked done. The most recent vacation before today (28 Oct 2026) is that week. |
| meaning | Which week was I unwell? | week:2026-10-05 | 1 | week:2026-10-05 | You were unwell in the week of 5 Oct 2026 (Mon 5 Oct to Sun 11 Oct). Your sick days were Tuesday 6 Oct and Wednesday 7 Oct, both 09:00-17:00. Nothing in the other weeks shows a sick day. |
| meaning | When did I first go for a jog? | week:2026-08-17 | 3 | month:2026-08, week:2026-08-17 | Your first run of the year was on Sunday 23 Aug 2026, 08:00-08:30, which the August summary describes as your first run of the year on a Sunday morning. The documents say "running" rather than "jog", so I've treated them as the same thing. |
| meaning | When did I go walking in the mountains? | week:2026-10-12 | 3 | week:2026-10-12 | You went walking in the mountains on Saturday 17 Oct 2026, a hike on Sljeme from 09:00 to 14:00. That was the most recent one before today; the other weeks shown don't mention a mountain walk. |
| meaning | When did I stay sober the whole week? | week:2026-10-05 | 1 | week:2026-10-05, week:2026-10-12 | The week of Mon 5 Oct to Sun 11 Oct 2026 is the one where you stayed alcohol-free the whole week, with No alcohol recorded on all 7 days. The weeks of 12 Oct (4 of 7 days) and 19 Oct have no full alcohol-free week recorded. |
| summary | How did August go overall? | month:2026-08 | 1 | month:2026-08, week:2026-08-10, week:2026-08-17 | August was restful overall, with a week of holiday in Split from 10 to 16 Aug, where free time reached 80%. Wins included the first run of the year on Sunday morning and Mum's birthday dinner going as planned. The car service booking slipped into September, and gym sessions happened about once a week in the evenings. |
| summary | What slipped in September? | month:2026-09 | 2 | month:2026-09 | In September, gym slipped to only 2 of 12 sessions, and running stopped. Spanish lessons did start that month, with 3 of 6 done, both in the week of 21 Sep. |
| not in history | When did I go skiing? | (none) | - | - | I couldn't find any skiing in these weeks. The closest outdoor activities were a hike on Sljeme on Saturday 17 Oct and a first run of the year on a Sunday morning in August, but neither is skiing. |
| not in history | When did I see my therapist? | (none) | - | - | None of these weeks mention a therapist, so I couldn't find when you last saw one in these documents. |
