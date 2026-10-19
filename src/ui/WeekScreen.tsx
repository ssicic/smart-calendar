import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ItemActionsSheet } from "./ItemActionsSheet";
import { moveProblem } from "./itemActions";
import { EMPTY_FORM, formForSlot, parseTime, type QuickAddForm } from "./quickAdd";
import { QuickAddSheet, type SheetSize } from "./QuickAddSheet";
import { SleepSheet } from "./SleepSheet";
import { useWeek } from "./useWeek";
import { WeekGrid } from "./WeekGrid";
import { MonthView } from "./MonthView";
import { addMonths, addWeeks, dateKey, monthOfWeek, monthTitle, weekRange, weekStartOf, weeksBetween, type Month } from "./weekDate";
import { WeekView } from "./WeekView";
import { clock, rowsByDay, type WeekRow } from "./weekRows";
import { YearView } from "./YearView";

type ViewMode = "calendar" | "list" | "month" | "year";
const VIEW_LABELS: Record<ViewMode, string> = { calendar: "Calendar", list: "Week", month: "Month", year: "Year" };

export function WeekScreen() {
  // The database opened by <SQLiteProvider> in App.tsx.
  const db = useSQLiteContext();
  // The week shown in Calendar/Week (its Monday). Starts on this week; the
  // arrows, Today, and taps in Month change it.
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  // The month shown in Month, and the year shown in Year.
  const [month, setMonth] = useState<Month>(() => monthOfWeek(weekStartOf(new Date())));
  const [year, setYear] = useState(() => new Date().getFullYear());
  const data = useWeek(db, weekStart);
  const { week, plan, queuedForNextWeek, sleep, windDownMin, add, act, move, changeSleep } = data;
  const { categories, addCategory, setRowCategory } = data;
  // Groups by id, so blocks can look up their colour quickly.
  const groups = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // The add form while it's open (undefined = closed). It lives here, not in
  // the sheet, because the calendar shows and edits its day and times too.
  const [adding, setAdding] = useState<QuickAddForm>();
  const [sheetSize, setSheetSize] = useState<SheetSize>("full");
  const { height: screenHeight } = useWindowDimensions();
  const [tapped, setTapped] = useState<WeekRow>();
  const [saveError, setSaveError] = useState<string>();
  const [view, setView] = useState<ViewMode>("calendar");
  const [sleepTarget, setSleepTarget] = useState<{ day: number; field: "wake" | "bed" }>();

  // The clock, refreshed every minute, so the red "now" line moves.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer); // cleanup: stop the timer when the screen goes away
  }, []);
  const thisWeek = weekStartOf(now);
  const today =
    thisWeek === weekStart
      ? { day: (now.getDay() + 6) % 7, minute: now.getHours() * 60 + now.getMinutes() }
      : undefined;

  // Hooks must run on every render in the same order, so this comes before
  // the early return below. It copes with `week` being undefined.
  const days = useMemo(() => (week && plan ? rowsByDay(week, plan) : []), [week, plan]);
  const allRows = useMemo(() => days.flat(), [days]);

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

  const isWeekView = view === "calendar" || view === "list";

  // The event being added, drawn on the calendar so its time can be dragged there.
  const draftStart = adding && parseTime(adding.startTime);
  const draftEnd = adding && parseTime(adding.endTime);
  const draft =
    adding &&
    adding.kind !== "flexible" &&
    adding.days.length > 0 &&
    draftStart !== undefined &&
    draftEnd !== undefined &&
    draftEnd > draftStart
      ? {
          days: adding.days,
          start: draftStart,
          end: draftEnd,
          title: adding.title,
          color: adding.categoryId ? groups.get(adding.categoryId)?.color : undefined,
        }
      : undefined;
  const currentMonth = monthOfWeek(thisWeek);
  const isCurrent =
    view === "month"
      ? month.year === currentMonth.year && month.month === currentMonth.month
      : view === "year"
        ? year === now.getFullYear()
        : weekStart === thisWeek;
  const weekOffset = weeksBetween(thisWeek, weekStart);
  const title =
    view === "month"
      ? monthTitle(month)
      : view === "year"
        ? String(year)
        : weekOffset === 0
          ? "This week"
          : weekOffset === 1
            ? "Next week"
            : weekOffset === -1
              ? "Last week"
              : weekRange(weekStart);
  const subtitle =
    view === "month"
      ? "Tap a day to open its week"
      : view === "year"
        ? "Tap a month to open it"
        : // The dates go here only when the title is "This/Next/Last week"; otherwise the title is the dates.
          `${Math.abs(weekOffset) <= 1 ? `${weekRange(weekStart)} · ` : ""}${plannedHours}h planned · ${freeHours}h free`;

  /** The ‹ and › arrows: one week, month or year back or forward. */
  const step = (n: number) => {
    if (view === "month") setMonth(addMonths(month, n));
    else if (view === "year") setYear(year + n);
    else setWeekStart(addWeeks(weekStart, n));
  };
  const goToToday = () => {
    setWeekStart(thisWeek);
    setMonth(currentMonth);
    setYear(now.getFullYear());
  };
  /** Month and Year open on the month/year of the week you were looking at. */
  const switchView = (v: ViewMode) => {
    if (v === "month") setMonth(monthOfWeek(weekStart));
    if (v === "year") setYear(monthOfWeek(weekStart).year);
    setView(v);
  };

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
        <View style={styles.toggle}>
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => switchView(v)}
              style={[styles.toggleItem, view === v && styles.toggleOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: view === v }}
            >
              <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>{VIEW_LABELS[v]}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.titleRow}>
          <Pressable onPress={() => step(-1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="Previous">
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text style={styles.heading} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={() => step(1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="Next">
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
          {!isCurrent && (
            <Pressable onPress={goToToday} style={styles.todayButton} accessibilityRole="button">
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.sub}>{subtitle}</Text>
        {isWeekView && unplacedSessions > 0 && (
          <Text style={styles.warn}>
            {unplacedSessions} {unplacedSessions === 1 ? "session doesn't" : "sessions don't"} fit this week
          </Text>
        )}
        {saveError && <Text style={styles.warn}>{saveError}</Text>}
      </View>
      {view === "month" ? (
        <MonthView
          db={db}
          month={month}
          todayKey={dateKey(now)}
          onPressWeek={(w) => {
            setWeekStart(w);
            setView("calendar");
          }}
        />
      ) : view === "year" ? (
        <YearView
          db={db}
          year={year}
          todayKey={dateKey(now)}
          onPressMonth={(m) => {
            setMonth({ year, month: m });
            setView("month");
          }}
        />
      ) : isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your week is empty</Text>
          <Text style={styles.emptyText}>
            Tap + to add work or classes (Fixed), protected downtime (Rest), and things you want to fit in
            (Flexible).
          </Text>
        </View>
      ) : view === "calendar" ? (
        <WeekGrid
          days={days}
          weekStart={weekStart}
          sleep={sleep}
          windDownMin={windDownMin}
          onPressSleep={(day, field) => setSleepTarget({ day, field })}
          onPressRow={setTapped}
          onHoldSlot={(day, minute) => {
            // Already adding something? Move it here and keep what was typed.
            const slot = formForSlot(day, minute);
            setAdding((f) =>
              f ? { ...slot, title: f.title, repeat: f.repeat, kind: f.kind === "rest" ? "rest" : "fixed" } : slot,
            );
            setSheetSize("half");
          }}
          draft={draft}
          onDraftChange={({ days, start, end }) =>
            setAdding((f) => f && { ...f, days, startTime: clock(start), endTime: clock(end) })
          }
          bottomInset={adding && sheetSize === "half" ? screenHeight / 2 : 0}
          groups={groups}
          // Dragging is a clear "put it here", so flexible sessions move even onto a busy time.
          onDropRow={async (row, day, minute) => setSaveError(await move(row, day, minute, true))}
          today={today}
          footer={queueFooter}
        />
      ) : (
        <WeekView days={days} weekStart={weekStart} groups={groups} onPressRow={setTapped} footer={queueFooter} />
      )}
      {isWeekView && !adding && (
        <Pressable
          style={styles.fab}
          onPress={() => {
          setAdding(EMPTY_FORM);
          setSheetSize("full");
        }}
          accessibilityRole="button"
          accessibilityLabel="Add to your week"
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
      <QuickAddSheet
        form={adding}
        onChange={setAdding}
        categories={categories}
        onAddCategory={addCategory}
        size={sheetSize}
        onSizeChange={setSheetSize}
        weekStart={weekStart}
        week={week}
        rows={allRows}
        onSave={async (r) => setSaveError(await add(r))}
        onClose={() => setAdding(undefined)}
      />
      <SleepSheet
        target={sleepTarget}
        sleep={sleep}
        weekStart={weekStart}
        onSave={changeSleep}
        onClose={() => setSleepTarget(undefined)}
      />
      <ItemActionsSheet
        row={tapped}
        rows={allRows}
        categories={categories}
        onAddCategory={addCategory}
        onSetCategory={setRowCategory}
        onAction={act}
        onMove={move}
        checkMove={(row, day, minute) => moveProblem(week, plan, allRows, row, day, minute)}
        onClose={() => setTapped(undefined)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  arrowText: { fontSize: 22, lineHeight: 24, fontWeight: "600", color: "#374151" },
  todayButton: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EEF2FF" },
  todayButtonText: { fontSize: 13, fontWeight: "700", color: "#5B6CF0" },
  toggle: { flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 10, padding: 3 },
  toggleItem: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8 },
  toggleOn: { backgroundColor: "#FFFFFF", boxShadow: "0 1px 2px rgba(17,24,39,0.12)" },
  toggleText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  toggleTextOn: { color: "#111827" },
  heading: { flexShrink: 1, fontSize: 22, fontWeight: "800", color: "#111827", paddingHorizontal: 4 },
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
