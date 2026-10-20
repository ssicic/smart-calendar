import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Category } from "../db/weekStore";
import { categoryStyle } from "./categories";
import { shortDate } from "./weekDate";
import { DAY_NAMES, clock, type RowKind, type WeekRow } from "./weekRows";
import { colors, font } from "./theme";
import { Ionicons } from "@expo/vector-icons";

export const KIND_STYLE: Record<RowKind, { bg: string; bar: string; label: string }> = {
  fixed: { bg: colors.fixedBg, bar: colors.textMuted, label: "Fixed" },
  routine: { bg: colors.routineSoft, bar: colors.routine, label: "Routine" },
  suggested: { bg: colors.accentSoft, bar: colors.accent, label: "Suggested" },
  kept: { bg: colors.accentSoft, bar: colors.accent, label: "Placed" },
  locked: { bg: colors.lockedBg, bar: colors.accentStrong, label: "Locked" },
  done: { bg: colors.surfaceAlt, bar: colors.doneBar, label: "Done" },
  skipped: { bg: colors.panel, bar: colors.doneBar, label: "Queued" },
};

/** Activity groups by id, for colouring blocks. */
export type Groups = Map<string, Category>;

/** A row's colours: its group's colour if it has one, otherwise the colours for its kind. */
export function rowColors(row: WeekRow, groups: Groups): { bg: string; bar: string } {
  const group = row.categoryId ? groups.get(row.categoryId) : undefined;
  return categoryStyle(row.kind, group?.color) ?? KIND_STYLE[row.kind];
}

function Block(props: { row: WeekRow; groups: Groups; badge?: string; onPress: (row: WeekRow) => void }) {
  const { row, groups, onPress } = props;
  const k = rowColors(row, groups);
  const group = row.categoryId ? groups.get(row.categoryId) : undefined;
  return (
    <Pressable
      onPress={() => onPress(row)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.block, { backgroundColor: k.bg, borderLeftColor: k.bar }, pressed && styles.pressed]}
    >
      <Text style={styles.time}>
        {clock(row.start)}–{clock(row.end)}
      </Text>
      <Text style={styles.title} numberOfLines={1}>
        {row.title}
      </Text>
      <Text style={[styles.kind, { color: k.bar }]}>
        {row.kind === "locked" ? <Ionicons name="lock-closed" size={11} color={k.bar} /> : null}
        {row.kind === "locked" ? " " : ""}
        {KIND_STYLE[row.kind].label}
        {group ? ` · ${group.name}` : ""}
        {props.badge ? ` · ${props.badge}` : ""}
      </Text>
    </Pressable>
  );
}

interface Props {
  days: WeekRow[][];
  weekStart: string;
  groups: Groups;
  /** Routine progress per row id ("2/5", "✓"). */
  badges: Map<string, string>;
  onPressRow: (row: WeekRow) => void;
  /** Shown under Sunday, e.g. the queue for next week. */
  footer?: React.ReactNode;
}

export function WeekView({ days, weekStart, groups, badges, onPressRow, footer }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {days.map((rows, d) => (
        <View key={d} style={styles.day}>
          <Text style={styles.dayName}>
            {DAY_NAMES[d]} <Text style={styles.date}>{shortDate(weekStart, d)}</Text>
          </Text>
          {rows.length === 0 ? (
            <Text style={styles.empty}>Nothing planned</Text>
          ) : (
            rows.map((row) => <Block key={row.id} row={row} groups={groups} badge={badges.get(row.id)} onPress={onPressRow} />)
          )}
        </View>
      ))}
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 110, gap: 20 }, // bottom room so the + button never covers Sunday
  day: { gap: 6 },
  dayName: { fontSize: 15, fontFamily: font.bold, color: colors.text, marginBottom: 2 },
  date: { fontFamily: font.regular, color: colors.textFaint },
  pressed: { opacity: 0.6 },
  empty: { color: colors.textFaint, fontStyle: "italic" },
  block: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  time: { width: 92, fontVariant: ["tabular-nums"], color: colors.textSoft },
  title: { flex: 1, fontSize: 15, fontFamily: font.semibold, color: colors.text },
  kind: { fontSize: 12, fontFamily: font.semibold },
});
