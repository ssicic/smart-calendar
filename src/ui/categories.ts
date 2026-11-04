// Activity groups (Work, Health…): colours and the rules for adding, renaming
// and reordering them.
// Pure, no React.
import type { RowKind } from "./weekRows";

/** Colours to pick from for a new group: soft tones. The first eight are the starting groups' (DB v13). */
export const PALETTE = [
  "#4F84D6", "#3FA663", "#8E6BD8", "#E39B2D", "#E06C93", "#E5824A",
  "#26A89A", "#5DB4D6", "#D8664F", "#6B7FD7", "#8DB83A", "#8A8178",
];

/** "#RRGGBB" at `alpha` (0-1) as "rgba(…)", for light backgrounds. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Block colours for a row in a group: the group's colour as the side bar,
 * a light tint behind (stronger for fixed events and routines, which can't move).
 * Done keeps a faded version of the group colour (plus its ✓), so a busy week
 * stays colourful; queued sessions stay grey. Undefined = use the default
 * colours for that kind.
 */
export function categoryStyle(kind: RowKind, color: string | undefined): { bg: string; bar: string } | undefined {
  if (!color || kind === "skipped") return undefined;
  if (kind === "done") return { bar: tint(color, 0.55), bg: tint(color, 0.1) };
  return { bar: color, bg: tint(color, kind === "fixed" || kind === "routine" ? 0.3 : 0.22) };
}

/**
 * Why this name can't be used for a group, or undefined if it's fine.
 * `ownId` is the group being renamed: keeping (or re-casing) its own name is fine.
 */
export function categoryNameProblem(
  name: string,
  existing: { id?: string; name: string }[],
  ownId?: string,
): string | undefined {
  const clean = name.trim();
  if (!clean) return "Give the group a name.";
  if (clean.length > 24) return "Keep the name under 25 characters.";
  const same = existing.find((c) => (ownId === undefined || c.id !== ownId) && c.name.trim().toLowerCase() === clean.toLowerCase());
  return same ? `You already have ${same.name}.` : undefined;
}

/**
 * The list with the entry at `index` moved `delta` places (-1 = up, +1 = down).
 * Moving past either end returns the list unchanged. Returns a new array.
 */
export function moveInList<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  const [moved] = out.splice(index, 1);
  out.splice(to, 0, moved!);
  return out;
}

/** A colour no group uses yet (the first one again if all are taken). */
export function unusedColor(existing: { color: string }[]): string {
  const used = new Set(existing.map((c) => c.color.toUpperCase()));
  return PALETTE.find((c) => !used.has(c.toUpperCase())) ?? PALETTE[0]!;
}
