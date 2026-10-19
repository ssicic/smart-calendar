import { useSQLiteContext } from "expo-sqlite";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ItemActionsSheet } from "./ItemActionsSheet";
import { QuickAddSheet } from "./QuickAddSheet";
import { useWeek } from "./useWeek";
import { shortDate, weekStartOf } from "./weekDate";
import { WeekView } from "./WeekView";
import { rowsByDay, type WeekRow } from "./weekRows";

export function WeekScreen() {
  // The database opened by <SQLiteProvider> in App.tsx.
  const db = useSQLiteContext();
  // Worked out once when the screen appears. (If the app stays open past
  // Sunday midnight it keeps showing the old week until reopened.)
  const [weekStart] = useState(() => weekStartOf(new Date()));
  const { week, plan, queuedForNextWeek, add, act, move } = useWeek(db, weekStart);

  const [adding, setAdding] = useState(false);
  const [tapped, setTapped] = useState<WeekRow>();
  const [saveError, setSaveError] = useState<string>();

  // Hooks must run on every render in the same order, so this comes before
  // the early return below. It copes with `week` being undefined.
  const days = useMemo(() => (week && plan ? rowsByDay(week, plan) : []), [week, plan]);

  if (!week || !plan) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const { capacity } = plan;
  // Everything on the calendar except queued (skipped) sessions.
  const plannedMinutes = plan.placements
    .filter((p) => p.state !== "skipped")
    .reduce((sum, p) => sum + (p.end - p.start), 0);
  const plannedHours = Math.round(plannedMinutes / 6) / 10;
  const freeHours = Math.round(capacity.freeMinutes / 6) / 10;
  const unplacedSessions = plan.unplaced.reduce((sum, u) => sum + u.missing, 0);
  const isEmpty = week.fixed.length + week.rest.length + week.items.length === 0;

  const queueFooter =
    queuedForNextWeek.length > 0 ? (
      <View style={styles.queue}>
        <Text style={styles.queueTitle}>Queued for next week</Text>
        <Text style={styles.queueText}>{queuedForNextWeek.map((q) => q.title).join(", ")}</Text>
      </View>
    ) : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.heading}>This week</Text>
        <Text style={styles.sub}>
          {shortDate(weekStart, 0)} – {shortDate(weekStart, 6)} · {plannedHours}h planned · {freeHours}h free
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
        <WeekView days={days} weekStart={weekStart} onPressRow={setTapped} footer={queueFooter} />
      )}
      <Pressable
        style={styles.fab}
        onPress={() => setAdding(true)}
        accessibilityRole="button"
        accessibilityLabel="Add to your week"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <QuickAddSheet
        visible={adding}
        week={week}
        onSave={async (r) => setSaveError(await add(r))}
        onClose={() => setAdding(false)}
      />
      <ItemActionsSheet row={tapped} onAction={act} onMove={move} onClose={() => setTapped(undefined)} />
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
  queue: { padding: 12, borderRadius: 10, backgroundColor: "#FEF3C7", gap: 2 },
  queueTitle: { fontWeight: "700", color: "#92400E" },
  queueText: { color: "#92400E" },
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
