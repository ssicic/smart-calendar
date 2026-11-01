// Points and rewards (tables points, rewards, reward_spends; DB v22). What
// earns points is worked out in ui/points.ts from the stored facts below.
import { journeyWeek, nextMonday, type Journey } from "../engine";
import { earningsFrom, reconcile, type Earning, type PointFacts } from "../ui/points";
import type { Db } from "./weekStore";

interface JourneyRow {
  id: string;
  item_id: string;
  goal: string;
  steps: string;
  start_week: string;
  step_downs: string;
  checkins: string;
  stopped_week: string | null;
  title: string | null;
}

/** Everything stored that can earn points, up to `currentWeek`. */
export async function loadPointFacts(db: Db, currentWeek: string): Promise<PointFacts> {
  const todos = await db.getAllAsync<{ id: string; week_start: string; title: string }>(
    "SELECT id, week_start, title FROM week_items WHERE kind = 'todo' AND done = 1 AND week_start <= ?",
    [currentWeek],
  );
  const weekGoals = await db.getAllAsync<{ id: string; week_start: string; title: string }>(
    "SELECT id, week_start, title FROM week_items WHERE kind = 'goal' AND progress >= target AND week_start <= ?",
    [currentWeek],
  );
  const goals = await db.getAllAsync<{ id: string; horizon: "year" | "month"; title: string }>(
    "SELECT id, horizon, title FROM goals WHERE done = 1",
    [],
  );
  // `double`: the group's name when it earns double points.
  const sessions = await db.getAllAsync<{ id: string; week_start: string; item_id: string; title: string; double: string | null }>(
    `SELECT p.id, p.week_start, p.item_id, f.title, CASE WHEN c.double_points = 1 THEN c.name END AS double
     FROM placements p JOIN flexible_items f ON f.id = p.item_id
     LEFT JOIN categories c ON c.id = f.category_id
     WHERE p.state = 'done' AND p.week_start <= ?`,
    [currentWeek],
  );
  // A done event's length that week: a "just this week" change wins over the usual times.
  const events = await db.getAllAsync<{ id: string; week_start: string; title: string; minutes: number; double: string | null }>(
    `SELECT d.event_id AS id, d.week_start, e.title,
            COALESCE(x.end_min - x.start_min, e.end_min - e.start_min) AS minutes,
            CASE WHEN c.double_points = 1 THEN c.name END AS double
     FROM event_done d JOIN events e ON e.id = d.event_id
     LEFT JOIN event_exceptions x ON x.event_id = d.event_id AND x.week_start = d.week_start
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE d.week_start <= ?`,
    [currentWeek],
  );

  // Journeys set their item's weekly target; a step up earns points too.
  const journeys = await db.getAllAsync<JourneyRow>(
    "SELECT j.*, f.title FROM journeys j LEFT JOIN flexible_items f ON f.id = j.item_id ORDER BY j.rowid",
    [],
  );
  const doneCounts = new Map<string, Map<string, number>>(); // item → week → done
  for (const s of sessions) {
    const byWeek = doneCounts.get(s.item_id) ?? new Map<string, number>();
    byWeek.set(s.week_start, (byWeek.get(s.week_start) ?? 0) + 1);
    doneCounts.set(s.item_id, byWeek);
  }
  const journeyTarget = new Map<string, number>(); // "item@week" → sessions asked for
  const stepUps: PointFacts["stepUps"] = [];
  for (const r of journeys) {
    const j: Journey = {
      id: r.id,
      itemId: r.item_id,
      goal: r.goal,
      steps: JSON.parse(r.steps),
      startWeek: r.start_week,
      stepDowns: JSON.parse(r.step_downs),
      checkins: JSON.parse(r.checkins),
    };
    const done = doneCounts.get(j.itemId) ?? new Map<string, number>();
    const last = r.stopped_week && r.stopped_week < currentWeek ? r.stopped_week : currentWeek;
    for (let w = j.startWeek; w <= last; w = nextMonday(w)) {
      const state = journeyWeek(j, w, done);
      journeyTarget.set(`${j.itemId}@${w}`, j.steps[state.step]?.timesPerWeek ?? 1);
      if (state.steppedUp) stepUps.push({ journeyId: j.id, weekStart: w, title: r.title ?? j.goal });
    }
  }

  const items = await db.getAllAsync<{ id: string; title: string; times_per_week: number; double: string | null }>(
    `SELECT f.id, f.title, f.times_per_week, CASE WHEN c.double_points = 1 THEN c.name END AS double
     FROM flexible_items f LEFT JOIN categories c ON c.id = f.category_id`,
    [],
  );
  const targets: PointFacts["targets"] = [];
  for (const item of items)
    for (const [weekStart, n] of doneCounts.get(item.id) ?? [])
      targets.push({
        itemId: item.id,
        weekStart,
        title: item.title,
        done: n,
        target: journeyTarget.get(`${item.id}@${weekStart}`) ?? item.times_per_week,
        ...(item.double ? { double: item.double } : {}),
      });

  return {
    todos: todos.map((t) => ({ id: t.id, weekStart: t.week_start, title: t.title })),
    weekGoals: weekGoals.map((g) => ({ id: g.id, weekStart: g.week_start, title: g.title })),
    goals,
    sessions: sessions.map((s) => ({ id: s.id, weekStart: s.week_start, title: s.title, ...(s.double ? { double: s.double } : {}) })),
    events: events.map((e) => ({
      id: e.id,
      weekStart: e.week_start,
      title: e.title,
      minutes: e.minutes,
      ...(e.double ? { double: e.double } : {}),
    })),
    targets,
    stepUps,
  };
}

/**
 * Brings the ledger up to date with what's done, and returns what was newly
 * earned (for the "+10" note). Unticking something this week takes its
 * points back; past weeks keep theirs.
 */
export async function syncPoints(db: Db, currentWeek: string): Promise<Earning[]> {
  const derived = earningsFrom(await loadPointFacts(db, currentWeek), currentWeek);
  const stored = await db.getAllAsync<{ key: string; week_start: string; points: number }>(
    "SELECT key, week_start, points FROM points",
    [],
  );
  const { add, remove, update } = reconcile(
    stored.map((s) => ({ key: s.key, weekStart: s.week_start, points: s.points })),
    derived,
    currentWeek,
  );
  if (add.length || remove.length || update.length)
    await db.withTransactionAsync(async () => {
      for (const e of add)
        await db.runAsync("INSERT INTO points (key, week_start, points, bonus, label) VALUES (?, ?, ?, ?, ?)", [
          e.key,
          e.weekStart,
          e.points,
          e.bonus,
          e.label,
        ]);
      for (const key of remove) await db.runAsync("DELETE FROM points WHERE key = ?", [key]);
      for (const e of update) await db.runAsync("UPDATE points SET points = ?, bonus = ? WHERE key = ?", [e.points, e.bonus, e.key]);
    });
  return add;
}

export interface Reward {
  id: string;
  title: string;
  price: number;
}

export interface Spend {
  id: string;
  title: string;
  price: number;
  spentOn: string;
}

export interface PointsSummary {
  balance: number;
  /** Earned in the week on screen. */
  week: number;
  rewards: Reward[];
  /** Newest first. */
  spends: Spend[];
}

export async function loadPointsSummary(db: Db, weekStart: string): Promise<PointsSummary> {
  const earned = await db.getFirstAsync<{ n: number | null }>("SELECT SUM(points) AS n FROM points", []);
  const spent = await db.getFirstAsync<{ n: number | null }>("SELECT SUM(price) AS n FROM reward_spends", []);
  const week = await db.getFirstAsync<{ n: number | null }>("SELECT SUM(points) AS n FROM points WHERE week_start = ?", [
    weekStart,
  ]);
  const rewards = await db.getAllAsync<Reward>("SELECT id, title, price FROM rewards ORDER BY position", []);
  const spends = await db.getAllAsync<{ id: string; title: string; price: number; spent_on: string }>(
    "SELECT id, title, price, spent_on FROM reward_spends ORDER BY spent_on DESC, rowid DESC LIMIT 20",
    [],
  );
  return {
    balance: (earned?.n ?? 0) - (spent?.n ?? 0),
    week: week?.n ?? 0,
    rewards,
    spends: spends.map((s) => ({ id: s.id, title: s.title, price: s.price, spentOn: s.spent_on })),
  };
}

export async function insertReward(db: Db, r: Reward): Promise<void> {
  await db.runAsync(
    "INSERT INTO rewards (id, title, price, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM rewards))",
    [r.id, r.title, r.price],
  );
}

export async function updateReward(db: Db, r: Reward): Promise<void> {
  await db.runAsync("UPDATE rewards SET title = ?, price = ? WHERE id = ?", [r.title, r.price, r.id]);
}

export async function deleteReward(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM rewards WHERE id = ?", [id]);
}

/** Spends points on a reward. The reward stays, to be bought again. */
export async function spendOn(db: Db, r: Reward, spendId: string, today: string): Promise<void> {
  await db.runAsync("INSERT INTO reward_spends (id, title, price, spent_on) VALUES (?, ?, ?, ?)", [
    spendId,
    r.title,
    r.price,
    today,
  ]);
}

export async function undoSpend(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM reward_spends WHERE id = ?", [id]);
}
