import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { planWeek, type WeekInput } from "./src/engine";
import { sampleWeek } from "./src/sampleWeek";
import { QuickAddSheet, type QuickAddResult } from "./src/ui/QuickAddSheet";
import { WeekView } from "./src/ui/WeekView";
import { rowsByDay } from "./src/ui/weekRows";

export default function App() {
  // The week is state: changing it with setWeek makes React re-run this
  // function and redraw everything that depends on it.
  const [week, setWeek] = useState<WeekInput>(sampleWeek);
  const [adding, setAdding] = useState(false);

  // Replan only when `week` changes, not on every redraw.
  const plan = useMemo(() => planWeek(week), [week]);
  const days = useMemo(() => rowsByDay(week, plan), [week, plan]);
  const { capacity } = plan;
  const plannedHours = Math.round(capacity.requiredMinutes / 6) / 10;
  const freeHours = Math.round(capacity.freeMinutes / 6) / 10;
  const unplacedSessions = plan.unplaced.reduce((sum, u) => sum + u.missing, 0);

  // Build a new week object instead of changing the old one. React compares
  // by reference, so a mutated object would look unchanged and not redraw.
  const addToWeek = (r: QuickAddResult) =>
    setWeek((w) => {
      if (r.kind === "flexible") return { ...w, items: [...w.items, r.item] };
      if (r.kind === "fixed") return { ...w, fixed: [...w.fixed, ...r.events] };
      return { ...w, rest: [...w.rest, ...r.events] };
    });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.heading}>This week</Text>
          <Text style={styles.sub}>
            {plannedHours}h planned · {freeHours}h free
          </Text>
          {unplacedSessions > 0 && (
            <Text style={styles.unplaced}>
              {unplacedSessions} {unplacedSessions === 1 ? "session doesn't" : "sessions don't"} fit this week
            </Text>
          )}
        </View>
        <WeekView days={days} />
        <Pressable
          style={styles.fab}
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Add to your week"
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
        <QuickAddSheet visible={adding} week={week} onSave={addToWeek} onClose={() => setAdding(false)} />
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  heading: { fontSize: 26, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 4, color: "#6B7280" },
  unplaced: { marginTop: 4, color: "#92400E", fontWeight: "600" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#5B6CF0",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    boxShadow: "0 4px 10px rgba(17,24,39,0.25)",
  },
  fabText: { color: "#FFFFFF", fontSize: 32, lineHeight: 34, fontWeight: "400" },
});
