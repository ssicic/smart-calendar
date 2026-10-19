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
 * Which hours to show: at least `fromMin`–`toMin` (minutes of day), stretched
 * to include anything earlier or later, such as a 06:00 shift.
 */
export function visibleHours(days: WeekRow[][], fromMin: number, toMin: number): { from: number; to: number } {
  let from = Math.max(0, Math.floor(fromMin / 60));
  let to = Math.min(24, Math.ceil(toMin / 60));
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

/** Blocks you can drag to another day or time. Done sessions keep their time. */
export const canDrag = (row: WeekRow) => row.kind !== "done" && row.kind !== "skipped";

/**
 * Where a dragged block lands: `dx`/`dy` is how far the finger moved in
 * pixels. The day snaps to the nearest column (Monday to Sunday) and the
 * start to the nearest 15 minutes, kept inside the day so the block fits.
 */
export function dropTarget(
  block: { day: number; startMin: number; endMin: number },
  dx: number,
  dy: number,
  columnWidth: number,
  pxPerMin: number,
): { day: number; minute: number } {
  const day = Math.min(6, Math.max(0, block.day + Math.round(dx / columnWidth)));
  const length = block.endMin - block.startMin;
  const snapped = Math.round((block.startMin + dy / pxPerMin) / 15) * 15;
  const latest = Math.max(0, Math.floor((DAY - Math.min(length, DAY)) / 15) * 15);
  return { day, minute: Math.min(latest, Math.max(0, snapped)) };
}
