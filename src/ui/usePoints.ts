import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteReward,
  insertReward,
  loadPointsSummary,
  spendOn,
  syncPoints,
  undoSpend,
  updateReward,
  type PointsSummary,
  type Reward,
} from "../db/pointsStore";
import type { Db } from "../db/weekStore";
import { kindLine, rewardProblem, type Earning } from "./points";

export interface PointsNote {
  id: number;
  points: number;
  bonus: number;
  line: string;
}

let counter = 0;
const newId = () => `r${Date.now().toString(36)}${counter++}`;

/**
 * Points and rewards. `version` changes whenever the week's data reloads
 * (anything ticked, done or changed): then the ledger syncs, and newly earned
 * points show as a short note with a kind line. `thisWeek` is today's week.
 */
export function usePoints(db: Db, version: unknown, weekStart: string, thisWeek: string, today: string) {
  const [summary, setSummary] = useState<PointsSummary>({ balance: 0, week: 0, rewards: [], spends: [] });
  const [note, setNote] = useState<PointsNote>();
  const first = useRef(true);

  const reload = useCallback(async () => setSummary(await loadPointsSummary(db, weekStart)), [db, weekStart]);

  useEffect(() => {
    let live = true;
    (async () => {
      const added = await syncPoints(db, thisWeek);
      if (!live) return;
      // The first sync catches up on everything done before; no note for that.
      if (!first.current && added.length) setNote(noteFor(added));
      first.current = false;
      await reload();
    })().catch(console.error);
    return () => {
      live = false;
    };
  }, [db, version, thisWeek, reload]);

  const attempt = async (work: () => Promise<string | void>) => {
    try {
      const err = await work();
      if (err) return err;
      await reload();
      return undefined;
    } catch (e) {
      console.error(e);
      return "Couldn't save that. Please try again.";
    }
  };

  return {
    summary,
    note,
    clearNote: () => setNote(undefined),
    addReward: (title: string, price: number) =>
      attempt(async () => rewardProblem(title, price) ?? insertReward(db, { id: newId(), title: title.trim(), price })),
    changeReward: (r: Reward) => attempt(async () => rewardProblem(r.title, r.price) ?? updateReward(db, { ...r, title: r.title.trim() })),
    removeReward: (id: string) => attempt(() => deleteReward(db, id)),
    spend: (r: Reward) =>
      attempt(async () => (summary.balance < r.price ? "Not enough points yet." : spendOn(db, r, newId(), today))),
    undoSpend: (id: string) => attempt(() => undoSpend(db, id)),
  };
}

/** One note for what was just earned: the total, any surprise, and a kind line. */
function noteFor(added: Earning[]): PointsNote {
  const points = added.reduce((sum, e) => sum + e.points, 0);
  const bonus = added.reduce((sum, e) => sum + e.bonus, 0);
  const lucky = added.find((e) => e.bonus > 0);
  return { id: Date.now(), points, bonus, line: kindLine(lucky ?? added[added.length - 1]!) };
}
