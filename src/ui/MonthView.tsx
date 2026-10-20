import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Db } from "../db/weekStore";
import { EMPTY_LOAD, hoursLabel, totalMinutes, type DayLoad } from "./dayLoad";
import { usePlannedDays } from "./usePlannedDays";
import { monthGrid, type Month } from "./weekDate";
import { DAY_NAMES } from "./weekRows";
import { colors, font } from "./theme";

const FULL_BAR_MIN = 12 * 60; // a 12-hour day fills the bar

const DONE_COLOR = colors.success;
const PLANNED_COLOR = colors.accent;

/** The bar's two parts: what's done (first, green), then what's still planned. */
const SEGMENTS: { minutes: (l: DayLoad) => number; color: string; label: string }[] = [
  { minutes: (l) => l.done, color: DONE_COLOR, label: "Done" },
  { minutes: (l) => l.fixed + l.flexible, color: PLANNED_COLOR, label: "Planned" },
];

interface Props {
  db: Db;
  month: Month;
  /** Today as "YYYY-MM-DD", to highlight it. */
  todayKey: string;
  /** Tapping a day opens it (in Day view): its week and its index there (0 = Monday). */
  onPressDay: (weekStart: string, day: number) => void;
}

/** Month view: a Monday-first grid; each day shows its planned hours as a bar. */
export function MonthView({ db, month, todayKey, onPressDay }: Props) {
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
          {row.days.map((cell, i) => {
            const load = byDate?.get(cell.key) ?? EMPTY_LOAD;
            const isToday = cell.key === todayKey;
            return (
              <Pressable
                key={cell.key}
                onPress={() => onPressDay(row.weekStart, i)}
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${cell.key}, ${hoursLabel(totalMinutes(load)) || "nothing"} planned. Open this day`}
              >
                <View style={[styles.dayNum, isToday && styles.todayNum]}>
                  <Text style={[styles.dayText, !cell.inMonth && styles.outside, isToday && styles.todayText]}>
                    {cell.dayOfMonth}
                  </Text>
                </View>
                <Text style={[styles.hours, !cell.inMonth && styles.outside]}>{hoursLabel(totalMinutes(load))}</Text>
                <View style={[styles.bar, !cell.inMonth && styles.faded]}>
                  {SEGMENTS.map((s) =>
                    s.minutes(load) > 0 ? (
                      <View
                        key={s.label}
                        style={{ backgroundColor: s.color, width: `${Math.min(100, (s.minutes(load) / FULL_BAR_MIN) * 100)}%` }}
                      />
                    ) : null,
                  )}
                </View>
                <Text style={[styles.done, !cell.inMonth && styles.outside]}>
                  {load.done > 0 ? `✓${hoursLabel(load.done)}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {SEGMENTS.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
        <Text style={styles.legendText}>· top number = hours planned · full bar = 12h</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 8, paddingBottom: 32 },
  headerRow: { flexDirection: "row", paddingVertical: 6 },
  headerDay: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: font.bold, color: colors.textMuted },
  week: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  cell: { flex: 1, height: 84, paddingVertical: 6, paddingHorizontal: 3, alignItems: "center", gap: 3 },
  pressed: { backgroundColor: colors.todayTint },
  dayNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  todayNum: { backgroundColor: colors.accent },
  dayText: { fontSize: 14, fontFamily: font.bold, color: colors.text },
  todayText: { color: colors.white },
  outside: { color: colors.textFainter },
  hours: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"], minHeight: 14 },
  bar: { flexDirection: "row", alignSelf: "stretch", height: 5, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  faded: { opacity: 0.4 },
  done: { fontSize: 10, fontFamily: font.bold, color: DONE_COLOR, minHeight: 12, fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 12, paddingHorizontal: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
});
