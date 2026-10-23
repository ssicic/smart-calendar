import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font } from "./theme";
import { addMonths, monthGrid, monthTitle, type Month } from "./weekDate";

interface Props {
  /** The month shown first. */
  start: Month;
  /** "YYYY-MM-DD" of the picked day, if any. */
  selected?: string;
  /** Days before this ("YYYY-MM-DD") can't be picked. */
  minKey: string;
  onPick: (weekStart: string, dayIndex: number, key: string) => void;
}

const HEAD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** A small month calendar for picking a date, Monday first; ‹ › change the month. */
export function DatePickerGrid({ start, selected, minKey, onPick }: Props) {
  const [month, setMonth] = useState<Month>(start);
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={10} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={colors.textSoft} />
        </Pressable>
        <Text style={styles.title}>{monthTitle(month)}</Text>
        <Pressable onPress={() => setMonth(addMonths(month, 1))} hitSlop={10} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={colors.textSoft} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {HEAD.map((h) => (
          <Text key={h} style={[styles.cell, styles.head]}>
            {h}
          </Text>
        ))}
      </View>
      {monthGrid(month).map((week) => (
        <View key={week.weekStart} style={styles.row}>
          {week.days.map((d, i) => {
            const past = d.key < minKey;
            const on = d.key === selected;
            return (
              <Pressable
                key={d.key}
                disabled={past || !d.inMonth}
                onPress={() => onPick(week.weekStart, i, d.key)}
                style={[styles.cell, on && styles.on]}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: past }}
              >
                <Text style={[styles.day, (!d.inMonth || past) && styles.faint, on && styles.onText]}>
                  {d.inMonth ? d.dayOfMonth : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, padding: 8, borderRadius: 12, backgroundColor: colors.panel },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  row: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 8 },
  head: { fontFamily: font.bold, fontSize: 11, color: colors.textMuted, textAlign: "center" },
  day: { fontFamily: font.semibold, fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  faint: { color: colors.textFainter },
  on: { backgroundColor: colors.accent },
  onText: { color: colors.white },
});
