import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { parseTime } from "./quickAdd";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 15, 30, 45];
const HOUR_WIDTH = 52;
const GAP = 8;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Tap an hour, then a quarter. Works the same on Android and web, unlike the
 * native clock dialogs. Value in and out is "HH:MM", like the old text field,
 * so the form logic didn't have to change.
 */
export function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const minutes = parseTime(value) ?? 9 * 60;
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;

  // useRef: a box that holds the ScrollView between renders without causing
  // re-renders. Used here to scroll the selected hour into view.
  const hoursRef = useRef<ScrollView>(null);
  useEffect(() => {
    hoursRef.current?.scrollTo({ x: Math.max(0, (hour - 2) * (HOUR_WIDTH + GAP)), animated: false });
    // Only when the picker first appears; afterwards the user is scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={hoursRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {HOURS.map((h) => (
          <Pressable
            key={h}
            onPress={() => set(h, minute)}
            style={[styles.hour, h === hour && styles.selected]}
            accessibilityRole="button"
            accessibilityLabel={`${h} o'clock`}
            accessibilityState={{ selected: h === hour }}
          >
            <Text style={[styles.text, h === hour && styles.selectedText]}>{pad(h)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.row}>
        {MINUTES.map((m) => (
          <Pressable
            key={m}
            onPress={() => set(hour, m)}
            style={[styles.minute, m === minute && styles.selected]}
            accessibilityRole="button"
            accessibilityState={{ selected: m === minute }}
          >
            <Text style={[styles.text, m === minute && styles.selectedText]}>:{pad(m)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", gap: GAP },
  hour: { width: HOUR_WIDTH, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center" },
  minute: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center" },
  selected: { backgroundColor: "#5B6CF0" },
  text: { fontSize: 15, fontWeight: "600", color: "#374151", fontVariant: ["tabular-nums"] },
  selectedText: { color: "#FFFFFF" },
});
