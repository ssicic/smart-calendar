import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { DAY, bedtimeFromClock, isWeekend, type DaySleep } from "../engine";
import { parseTime } from "./quickAdd";
import { TimePicker } from "./TimePicker";
import { shortDate } from "./weekDate";
import { DAY_NAMES, clock } from "./weekRows";
import { colors, font } from "./theme";

export type SleepScope = "day" | "usual" | "reset";

interface Props {
  /** Which day and time is being edited; undefined hides the sheet. */
  target: { day: number; field: "wake" | "bed" } | undefined;
  sleep: DaySleep[];
  weekStart: string;
  onSave: (day: number, field: "wake" | "bed", minutes: number, scope: SleepScope) => Promise<string | undefined>;
  onClose: () => void;
}

export function SleepSheet({ target, sleep, weekStart, onSave, onClose }: Props) {
  const [time, setTime] = useState("07:00");
  const [error, setError] = useState<string>();

  const current = target ? sleep[target.day] : undefined;
  // Start the picker at the day's current time whenever a new target opens.
  useEffect(() => {
    if (!target || !current) return;
    setTime(clock((target.field === "wake" ? current.wake : current.bed) % DAY));
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target || !current) return null;
  const { day, field } = target;
  const changed = field === "wake" ? current.wakeChanged : current.bedChanged;
  const group = isWeekend(day) ? "weekend day" : "weekday";

  const save = async (scope: SleepScope) => {
    const picked = parseTime(time);
    if (picked === undefined) return;
    const minutes = field === "bed" ? bedtimeFromClock(picked) : picked;
    if (field === "wake" && minutes >= current.bed) return setError("Wake-up has to be before bedtime.");
    if (field === "bed" && minutes <= current.wake) return setError("Bedtime has to be after wake-up.");
    const err = await onSave(day, field, minutes, scope);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{field === "wake" ? "Wake-up" : "Bedtime"}</Text>
              <Text style={styles.sub}>
                {DAY_NAMES[day]} {shortDate(weekStart, day)}
                {changed ? " · changed for this day" : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>{time}</Text>
          <TimePicker
            value={time}
            onChange={(t) => {
              setTime(t);
              setError(undefined);
            }}
          />
          {field === "bed" && <Text style={styles.hint}>00:00–11:45 counts as after midnight.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={() => save("day")} style={styles.primary} accessibilityRole="button">
            <Text style={styles.primaryText}>Just this day</Text>
          </Pressable>
          <Pressable onPress={() => save("usual")} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Make it my usual every {group}</Text>
          </Pressable>
          {changed && (
            <Pressable onPress={() => save("reset")} style={styles.plain} accessibilityRole="button">
              <Text style={styles.link}>Back to my usual time</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontFamily: font.heavy, color: colors.text },
  sub: { marginTop: 2, color: colors.textMuted },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  label: { fontSize: 28, fontFamily: font.heavy, color: colors.text, fontVariant: ["tabular-nums"] },
  hint: { fontFamily: font.regular, color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontFamily: font.semibold },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.accent },
  primaryText: { fontSize: 16, fontFamily: font.bold, color: colors.white },
  secondary: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontSize: 16, fontFamily: font.bold, color: colors.textSoft },
  plain: { alignItems: "center", paddingVertical: 6 },
});
