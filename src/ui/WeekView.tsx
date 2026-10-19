import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { shortDate } from "./weekDate";
import { DAY_NAMES, clock, type RowKind, type WeekRow } from "./weekRows";

export const KIND_STYLE: Record<RowKind, { bg: string; bar: string; label: string }> = {
  fixed: { bg: "#EEF0F3", bar: "#6B7280", label: "Fixed" },
  rest: { bg: "#E8F6EE", bar: "#2F9E5B", label: "Rest" },
  suggested: { bg: "#EEF2FF", bar: "#5B6CF0", label: "Suggested" },
  kept: { bg: "#EEF2FF", bar: "#5B6CF0", label: "Placed" },
  locked: { bg: "#E0E7FF", bar: "#3A47C9", label: "🔒 Locked" },
  done: { bg: "#F1F5F9", bar: "#94A3B8", label: "Done" },
  skipped: { bg: "#F8FAFC", bar: "#94A3B8", label: "Queued" },
};

function Block({ row, onPress }: { row: WeekRow; onPress: (row: WeekRow) => void }) {
  const k = KIND_STYLE[row.kind];
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
      <Text style={[styles.kind, { color: k.bar }]}>{k.label}</Text>
    </Pressable>
  );
}

interface Props {
  days: WeekRow[][];
  weekStart: string;
  onPressRow: (row: WeekRow) => void;
  /** Shown under Sunday, e.g. the queue for next week. */
  footer?: React.ReactNode;
}

export function WeekView({ days, weekStart, onPressRow, footer }: Props) {
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
            rows.map((row) => <Block key={row.id} row={row} onPress={onPressRow} />)
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
