import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Category } from "../db/weekStore";
import { categoryStyle } from "./categories";
import { shortDate } from "./weekDate";
import { DAY_NAMES, clock, type RowKind, type WeekRow } from "./weekRows";

export const KIND_STYLE: Record<RowKind, { bg: string; bar: string; label: string }> = {
  fixed: { bg: "#EEF0F3", bar: "#6B7280", label: "Fixed" },
  routine: { bg: "#FEF3E2", bar: "#D97706", label: "Routine" },
  suggested: { bg: "#EEF2FF", bar: "#5B6CF0", label: "Suggested" },
  kept: { bg: "#EEF2FF", bar: "#5B6CF0", label: "Placed" },
  locked: { bg: "#E0E7FF", bar: "#3A47C9", label: "🔒 Locked" },
  done: { bg: "#F1F5F9", bar: "#94A3B8", label: "Done" },
  skipped: { bg: "#F8FAFC", bar: "#94A3B8", label: "Queued" },
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
  dayName: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 2 },
  date: { fontWeight: "400", color: "#9CA3AF" },
  pressed: { opacity: 0.6 },
  empty: { color: "#9CA3AF", fontStyle: "italic" },
  block: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  time: { width: 92, fontVariant: ["tabular-nums"], color: "#374151" },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  kind: { fontSize: 12, fontWeight: "600" },
});
