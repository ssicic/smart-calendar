import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Db } from "../db/weekStore";
import { EMPTY_LOAD, intensity, totalMinutes } from "./dayLoad";
import { usePlannedDays } from "./usePlannedDays";
import { monthGrid, monthShort, weeksOfYear } from "./weekDate";

/** Heatmap shades for intensity 0 (nothing) to 4 (6h or more). */
const SHADES = ["#F1F5F9", "#DDE2FD", "#B4BEF8", "#8593F3", "#5B6CF0"];

interface Props {
  db: Db;
  year: number;
  /** Today as "YYYY-MM-DD", to outline it. */
  todayKey: string;
  onPressMonth: (month: number) => void;
}

/** Year view: 12 small months, each day shaded by how much is planned. */
export function YearView({ db, year, todayKey, onPressMonth }: Props) {
  const weeks = useMemo(() => weeksOfYear(year), [year]);
  const byDate = usePlannedDays(db, weeks, todayKey);
  const months = useMemo(() => Array.from({ length: 12 }, (_, month) => monthGrid({ year, month })), [year]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        {months.map((rows, month) => (
          <Pressable
            key={month}
            onPress={() => onPressMonth(month)}
            style={({ pressed }) => [styles.month, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${monthShort(month)} ${year}`}
          >
            <Text style={styles.monthName}>{monthShort(month)}</Text>
            {rows.map((row) => (
              <View key={row.weekStart} style={styles.week}>
                {row.days.map((cell) => {
                  const level = cell.inMonth ? intensity(totalMinutes(byDate?.get(cell.key) ?? EMPTY_LOAD)) : -1;
                  return (
                    <View
                      key={cell.key}
                      style={[
                        styles.day,
                        level >= 0 && { backgroundColor: SHADES[level] },
                        cell.inMonth && cell.key === todayKey && styles.today,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </Pressable>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Less</Text>
        {SHADES.map((c) => (
          <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
        ))}
        <Text style={styles.legendText}>More (6h+)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, paddingBottom: 32 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  month: { width: "32%", padding: 6, borderRadius: 10, gap: 2 },
  pressed: { backgroundColor: "#F8FAFF" },
  monthName: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  week: { flexDirection: "row", gap: 2 },
  day: { flex: 1, aspectRatio: 1, borderRadius: 2 },
  today: { borderWidth: 1.5, borderColor: "#EF4444" },
  legend: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingTop: 12 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  legendText: { fontSize: 12, color: "#6B7280", marginHorizontal: 2 },
});
