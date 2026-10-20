import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Db } from "../db/weekStore";
import { EMPTY_LOAD, hoursLabel, totalMinutes, type DayLoad } from "./dayLoad";
import { usePlannedDays } from "./usePlannedDays";
import { monthGrid, type Month } from "./weekDate";
import { DAY_NAMES } from "./weekRows";
import { KIND_STYLE } from "./WeekView";

const FULL_BAR_MIN = 12 * 60; // a 12-hour day fills the bar

const SEGMENTS: { field: keyof DayLoad; color: string; label: string }[] = [
  { field: "fixed", color: KIND_STYLE.fixed.bar, label: "Fixed" },
  { field: "flexible", color: KIND_STYLE.suggested.bar, label: "Flexible" },
  { field: "done", color: KIND_STYLE.done.bar, label: "Done" },
];

interface Props {
  db: Db;
  month: Month;
  /** Today as "YYYY-MM-DD", to highlight it. */
  todayKey: string;
  onPressWeek: (weekStart: string) => void;
}

/** Month view: a Monday-first grid; each day shows its planned hours as a bar. */
export function MonthView({ db, month, todayKey, onPressWeek }: Props) {
  const rows = useMemo(() => monthGrid(month), [month]);
  const byDate = usePlannedDays(db, rows.map((r) => r.weekStart), todayKey);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        {DAY_NAMES.map((name) => (
          <Text key={name} style={styles.headerDay}>
            {name.slice(0, 2)}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.weekStart} style={styles.week}>
          {row.days.map((cell) => {
            const load = byDate?.get(cell.key) ?? EMPTY_LOAD;
            const isToday = cell.key === todayKey;
            return (
              <Pressable
                key={cell.key}
                onPress={() => onPressWeek(row.weekStart)}
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${cell.key}, ${hoursLabel(totalMinutes(load)) || "nothing"} planned. Open this week`}
              >
                <View style={[styles.dayNum, isToday && styles.todayNum]}>
                  <Text style={[styles.dayText, !cell.inMonth && styles.outside, isToday && styles.todayText]}>
                    {cell.dayOfMonth}
                  </Text>
                </View>
                <Text style={[styles.hours, !cell.inMonth && styles.outside]}>{hoursLabel(totalMinutes(load))}</Text>
                <View style={[styles.bar, !cell.inMonth && styles.faded]}>
                  {SEGMENTS.map((s) =>
                    load[s.field] > 0 ? (
                      <View
                        key={s.field}
                        style={{ backgroundColor: s.color, width: `${Math.min(100, (load[s.field] / FULL_BAR_MIN) * 100)}%` }}
                      />
                    ) : null,
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {SEGMENTS.map((s) => (
          <View key={s.field} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
        <Text style={styles.legendText}>· full bar = 12h</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 8, paddingBottom: 32 },
  headerRow: { flexDirection: "row", paddingVertical: 6 },
  headerDay: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: "#6B7280" },
  week: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  cell: { flex: 1, height: 72, paddingVertical: 6, paddingHorizontal: 3, alignItems: "center", gap: 3 },
  pressed: { backgroundColor: "#F8FAFF" },
  dayNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  todayNum: { backgroundColor: "#5B6CF0" },
  dayText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  todayText: { color: "#FFFFFF" },
  outside: { color: "#C4C9D4" },
  hours: { fontSize: 11, color: "#6B7280", fontVariant: ["tabular-nums"], minHeight: 14 },
  bar: { flexDirection: "row", alignSelf: "stretch", height: 5, borderRadius: 3, backgroundColor: "#F1F5F9", overflow: "hidden" },
  faded: { opacity: 0.4 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 12, paddingHorizontal: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 12, color: "#6B7280" },
});
