import { StyleSheet, Text, View } from "react-native";
import type { ReviewStats } from "./weekReview";

const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}h`;

/** "Time by group": one bar per group plus Free, as shares of awake time. */
export function GroupBars({ stats }: { stats: ReviewStats }) {
  const rows = [
    ...stats.groups,
    { id: "free", name: "Free", color: "#E5E7EB", minutes: stats.freeMin, percent: stats.freePercent },
  ];
  return (
    <View style={styles.wrap}>
      {stats.groups.length === 0 && <Text style={styles.muted}>Nothing on the calendar yet.</Text>}
      {rows.map((g) => (
        <View key={g.id ?? "none"} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {g.name}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, g.percent)}%`, backgroundColor: g.color }]} />
          </View>
          <Text style={styles.value}>
            {hours(g.minutes)} · {g.percent}%
          </Text>
        </View>
      ))}
      <Text style={styles.note}>Shares of your awake time (wake-up to bedtime).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { width: 80, fontSize: 14, color: "#111827" },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#F1F5F9", overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  value: { width: 82, textAlign: "right", fontSize: 12, color: "#6B7280", fontVariant: ["tabular-nums"] },
  muted: { fontSize: 15, color: "#9CA3AF" },
  note: { fontSize: 12, color: "#6B7280" },
});
