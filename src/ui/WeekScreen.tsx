import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { planWeek, type WeekInput } from "../engine";
import { insertEvents, insertItem, loadWeek } from "../db/weekStore";
import { QuickAddSheet, type QuickAddResult } from "./QuickAddSheet";
import { WeekView } from "./WeekView";
import { rowsByDay } from "./weekRows";

export function WeekScreen() {
  // The database opened by <SQLiteProvider> in App.tsx.
  const db = useSQLiteContext();

  // undefined = still loading from the database.
  const [week, setWeek] = useState<WeekInput>();
  const [adding, setAdding] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  // useEffect runs *after* the first render, for work outside React such as
  // reading a database. [db] means: run again only if the database changes,
  // which it never does, so in practice this runs once when the screen appears.
  useEffect(() => {
    loadWeek(db).then(setWeek);
  }, [db]);

  // Hooks must run on every render in the same order, so these come before
  // the early return below. They cope with `week` being undefined.
  const plan = useMemo(() => (week ? planWeek(week) : undefined), [week]);
  const days = useMemo(() => (week && plan ? rowsByDay(week, plan) : []), [week, plan]);

  if (!week || !plan) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const { capacity } = plan;
  const plannedHours = Math.round(capacity.requiredMinutes / 6) / 10;
  const freeHours = Math.round(capacity.freeMinutes / 6) / 10;
  const unplacedSessions = plan.unplaced.reduce((sum, u) => sum + u.missing, 0);
  const isEmpty = week.fixed.length + week.rest.length + week.items.length === 0;

  const addToWeek = async (r: QuickAddResult) => {
    // Update the screen right away, then save. Building a new object (not
    // mutating the old one) is what tells React something changed.
    setWeek((w) => {
      if (!w) return w;
      if (r.kind === "flexible") return { ...w, items: [...w.items, r.item] };
      if (r.kind === "fixed") return { ...w, fixed: [...w.fixed, ...r.events] };
      return { ...w, rest: [...w.rest, ...r.events] };
    });
    try {
      if (r.kind === "flexible") await insertItem(db, r.item);
      else await insertEvents(db, r.kind, r.events);
      setSaveError(undefined);
    } catch (e) {
      console.error(e);
      setSaveError("Couldn't save that. It will be gone after a reload.");
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.heading}>This week</Text>
        <Text style={styles.sub}>
          {plannedHours}h planned · {freeHours}h free
        </Text>
        {unplacedSessions > 0 && (
          <Text style={styles.warn}>
            {unplacedSessions} {unplacedSessions === 1 ? "session doesn't" : "sessions don't"} fit this week
          </Text>
        )}
        {saveError && <Text style={styles.warn}>{saveError}</Text>}
      </View>
      {isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your week is empty</Text>
          <Text style={styles.emptyText}>
            Tap + to add work or classes (Fixed), protected downtime (Rest), and things you want to fit in
            (Flexible).
          </Text>
        </View>
      ) : (
        <WeekView days={days} />
      )}
      <Pressable
        style={styles.fab}
        onPress={() => setAdding(true)}
        accessibilityRole="button"
        accessibilityLabel="Add to your week"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <QuickAddSheet visible={adding} week={week} onSave={addToWeek} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  heading: { fontSize: 26, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 4, color: "#6B7280" },
  warn: { marginTop: 4, color: "#92400E", fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  emptyText: { textAlign: "center", color: "#6B7280", lineHeight: 21 },
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
