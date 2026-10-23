import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Habit } from "../db/habitsStore";
import { checkKey } from "./habits";
import { colors, font, radius } from "./theme";

interface Props {
  habits: Habit[];
  checks: Set<string>;
  /** The day shown, "YYYY-MM-DD". */
  day: string;
  /** Days after today can't be ticked yet. */
  isFuture: boolean;
  onToggle: (habitId: string) => void;
  /** Opens the week grid (to tick other days, add or edit habits). */
  onOpen: () => void;
}

/** One tap per habit, for the day on screen. Sits in the Day view. */
export function HabitsRow({ habits, checks, day, isFuture, onToggle, onOpen }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Habits</Text>
        <Pressable onPress={onOpen} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>{habits.length === 0 ? "+ Add a habit" : "This week ›"}</Text>
        </Pressable>
      </View>
      {habits.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {habits.map((h) => {
            const on = checks.has(checkKey(h.id, day));
            return (
              <Pressable
                key={h.id}
                onPress={() => onToggle(h.id)}
                disabled={isFuture}
                style={[styles.chip, on && styles.chipOn, isFuture && styles.chipFuture]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: isFuture }}
                accessibilityLabel={h.title}
              >
                <Ionicons
                  name={(on ? "checkmark-circle" : h.icon) as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={on ? colors.white : colors.accentStrong}
                />
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {h.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  link: { fontFamily: font.semibold, fontSize: 13, color: colors.accentStrong },
  row: { gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  chipOn: { backgroundColor: colors.accent },
  chipFuture: { opacity: 0.5 },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: colors.accentStrong, maxWidth: 160 },
  chipTextOn: { color: colors.white },
});
