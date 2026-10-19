// Activity groups (Work, Health…): colours and the rules for adding one.
// Pure, no React.
import type { RowKind } from "./weekRows";

/** Colours to pick from for a new group. The first seven are the starting groups'. */
export const PALETTE = [
  "#3B82F6", "#22A06B", "#8B5CF6", "#F59E0B", "#EC4899", "#F97316",
  "#14B8A6", "#EF4444", "#6366F1", "#84CC16", "#A16207", "#64748B",
];

/** "#RRGGBB" at `alpha` (0-1) as "rgba(…)", for light backgrounds. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Block colours for a row in a group: the group's colour as the side bar,
 * a light tint behind (stronger for fixed and rest, which can't move).
 * Done and queued sessions keep their grey look, so "finished" stays obvious.
 * Undefined = use the default colours for that kind.
 */
export function categoryStyle(kind: RowKind, color: string | undefined): { bg: string; bar: string } | undefined {
  if (!color || kind === "done" || kind === "skipped") return undefined;
  return { bar: color, bg: tint(color, kind === "fixed" || kind === "rest" ? 0.24 : 0.12) };
}

/** Why this name can't be used for a new group, or undefined if it's fine. */
export function newCategoryProblem(name: string, existing: { name: string }[]): string | undefined {
  const clean = name.trim();
  if (!clean) return "Give the group a name.";
  if (clean.length > 24) return "Keep the name under 25 characters.";
  const same = existing.find((c) => c.name.trim().toLowerCase() === clean.toLowerCase());
  return same ? `You already have ${same.name}.` : undefined;
}

/** A colour no group uses yet (the first one again if all are taken). */
export function unusedColor(existing: { color: string }[]): string {
  const used = new Set(existing.map((c) => c.color.toUpperCase()));
  return PALETTE.find((c) => !used.has(c.toUpperCase())) ?? PALETTE[0]!;
}
