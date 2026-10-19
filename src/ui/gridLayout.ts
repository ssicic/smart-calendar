// Layout math for the calendar view. Pure numbers in, numbers out, so it can
// be tested without drawing anything.
import { DAY } from "../engine";
import type { WeekRow } from "./weekRows";

export interface PlacedBlock {
  row: WeekRow;
  /** Minutes since midnight. */
  startMin: number;
  endMin: number;
  /** Side-by-side position when blocks overlap: lane 0..lanes-1. */
  lane: number;
  lanes: number;
}

/**
 * Puts overlapping blocks side by side. Blocks are grouped into clusters
 * (chains of overlaps); within a cluster each block takes the first free
 * lane, and every block in the cluster shares the cluster's lane count.
 */
export function layoutDay(rows: WeekRow[]): PlacedBlock[] {
  const sorted = rows
    .filter((r) => r.kind !== "skipped") // queued sessions aren't on the grid
    .map((row) => ({ row, startMin: row.start % DAY, endMin: row.start % DAY + (row.end - row.start) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const out: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let laneEnds: number[] = []; // end time of the last block in each lane
  let clusterEnd = -1;

  const flush = () => {
    for (const b of cluster) b.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const s of sorted) {
    if (s.startMin >= clusterEnd) flush(); // nothing still running: new cluster
    let lane = laneEnds.findIndex((end) => end <= s.startMin);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = s.endMin;
    cluster.push({ ...s, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, s.endMin);
  }
  flush();
  return out;
}

/**
 * Which hours to show: at least the planner's day (e.g. 08–22), stretched to
 * include anything earlier or later, such as a 06:00 shift.
 */
export function visibleHours(days: WeekRow[][], dayStart: number, dayEnd: number): { from: number; to: number } {
  let from = Math.floor(dayStart / 60);
  let to = Math.ceil(dayEnd / 60);
  for (const d of days) {
    for (const r of d) {
      if (r.kind === "skipped") continue;
      const s = r.start % DAY;
      from = Math.min(from, Math.floor(s / 60));
      to = Math.max(to, Math.ceil((s + r.end - r.start) / 60));
    }
  }
  return { from, to: Math.min(to, 24) };
}
