import { StyleSheet, Text, View } from "react-native";
import type { ReviewStats } from "./weekReview";
import { colors, font } from "./theme";

const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}h`;

/** "Time by group": one bar per group plus Free, as shares of awake time. */
export function GroupBars({ stats }: { stats: ReviewStats }) {
  const rows = [
    ...stats.groups,
    { id: "free", name: "Free", color: colors.border, minutes: stats.freeMin, percent: stats.freePercent },
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
  name: { fontFamily: font.regular, width: 80, fontSize: 14, color: colors.text },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  value: { fontFamily: font.regular, width: 82, textAlign: "right", fontSize: 12, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  muted: { fontFamily: font.regular, fontSize: 15, color: colors.textFaint },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
});
