import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ItemActionsSheet } from "./ItemActionsSheet";
import { moveProblem } from "./itemActions";
import { EMPTY_FORM, formForSlot, parseTime, type QuickAddForm } from "./quickAdd";
import { QuickAddSheet, type SheetSize } from "./QuickAddSheet";
import { SleepSheet } from "./SleepSheet";
import { dayLoads, totalMinutes, weekTotals } from "./dayLoad";
import { progress, progressLabel } from "./routines";
import { weekSummary } from "./weekItems";
import { reviewStats } from "./weekReview";
import { ReviewSheet } from "./ReviewSheet";
import { PlanSheet } from "./PlanSheet";
import { HistorySheet } from "./HistorySheet";
import { WeekPanelSheet } from "./WeekPanelSheet";
import { DayTodos } from "./DayTodos";
import { canAddFromLater, laterHeading } from "./later";
import { useWeek } from "./useWeek";
import { WeekGrid } from "./WeekGrid";
import { MonthView } from "./MonthView";
import {
  addMonths,
  addWeeks,
  dateKey,
  dayDate,
  monthOfWeek,
  monthTitle,
  plannableFrom,
  stepDay,
  weekRange,
  weekStartOf,
  weeksBetween,
  type Month,
} from "./weekDate";
import { WeekView } from "./WeekView";
import { DAY_NAMES, clock, rowsByDay, type WeekRow } from "./weekRows";
import { YearView } from "./YearView";
import { colors, font, radius, shadow } from "./theme";

type ViewMode = "day" | "calendar" | "list" | "month" | "year";
const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Day",
  calendar: "Calendar",
  list: "Week",
  month: "Month",
  year: "Year",
};

export function WeekScreen() {
  // The database opened by <SQLiteProvider> in App.tsx.
  const db = useSQLiteContext();
  // The week shown in Calendar/Week (its Monday). Starts on this week; the
  // arrows, Today, and taps in Month change it.
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  // The month shown in Month, and the year shown in Year.
  const [month, setMonth] = useState<Month>(() => monthOfWeek(weekStartOf(new Date())));
  const [year, setYear] = useState(() => new Date().getFullYear());
  // The day shown in Day view (0 = Monday) of `weekStart`. Starts on today.
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7);
  // The clock, refreshed every minute, so the red "now" line moves.
  const [now, setNow] = useState(() => new Date());
  // Suggestions only from today on (none in past weeks). Changes at midnight, not every minute.
  const earliestStart = plannableFrom(weekStart, now);
  const data = useWeek(db, weekStart, earliestStart);
  const { week, plan, queuedForNextWeek, sleep, windDownMin, add, act, move, changeSleep } = data;
  const { categories, groupActions, setRowCategory, rename } = data;
  const { routines, checks, addRoutine, editRoutine, removeRoutine, toggleStep } = data;
  const { weekItems, addWeekItem, changeWeekItem, removeWeekItem, later, addFromLater, removeLater } = data;
  const { movedOn, refresh, doneEvents, resize } = data;
  // Whole-week to-dos and goals (the "This week" panel) vs. to-dos for the day in Day view.
  const weeklyItems = useMemo(() => weekItems.filter((i) => i.day === null), [weekItems]);
  const dayTodos = useMemo(() => weekItems.filter((i) => i.day === day && i.kind === "todo"), [weekItems, day]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Groups by id, so blocks can look up their colour quickly.
  const groups = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // The add form while it's open (undefined = closed). It lives here, not in
  // the sheet, because the calendar shows and edits its day and times too.
  const [adding, setAdding] = useState<QuickAddForm>();
  const [sheetSize, setSheetSize] = useState<SheetSize>("full");
  // If the open form's group was just deleted (in Manage groups), drop it.
  useEffect(() => {
    if (adding?.categoryId && !groups.has(adding.categoryId)) setAdding({ ...adding, categoryId: null });
  }, [adding, groups]);
  const { height: screenHeight } = useWindowDimensions();
  const [tapped, setTapped] = useState<WeekRow>();
  const [saveError, setSaveError] = useState<string>();
  const [view, setView] = useState<ViewMode>("calendar");
  const [sleepTarget, setSleepTarget] = useState<{ day: number; field: "wake" | "bed" }>();

  // Swiping sideways over the calendar goes to the next/previous week (or
  // month, year). It only takes over clearly sideways moves, so scrolling up
  // and down, dragging blocks and the new-event handles keep working.
  const stepRef = useRef<(n: number) => void>(() => {});
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > 2 * Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -60) stepRef.current(1); // finger moved left: next
        else if (g.dx >= 60) stepRef.current(-1);
      },
    }),
  ).current;
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
  const days = useMemo(() => (week && plan ? rowsByDay(week, plan, doneEvents) : []), [week, plan, doneEvents]);
  const allRows = useMemo(() => days.flat(), [days]);
  // Progress on each routine block ("2/5", or ✓ when every step is ticked).
  const badges = useMemo(() => {
    const byId = new Map(routines.map((r) => [r.id, r]));
    const out = new Map<string, string>();
    for (const row of allRows) {
      const r = row.routineId ? byId.get(row.routineId) : undefined;
      if (r) out.set(row.id, progressLabel(progress(r.steps, checks, row.id)));
    }
    return out;
  }, [allRows, routines, checks]);
  // The week review's numbers (only worked out while it's open).
  const review = useMemo(
    () => (reviewOpen ? reviewStats(allRows, sleep, groups) : undefined),
    [reviewOpen, allRows, sleep, groups],
  );

  if (!week || !plan) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const { capacity } = plan;
  // Planned = fixed events + flexible sessions (done ones too); rest blocks are time off.
  const { plannedMin, doneMin } = weekTotals(week, plan, doneEvents);
  const hours = (minutes: number) => Math.round(minutes / 6) / 10;
  const unplacedSessions = plan.unplaced.reduce((sum, u) => sum + u.missing, 0);
  const isEmpty = week.fixed.length + (week.routines ?? []).length + week.items.length === 0;

  const isWeekView = view === "day" || view === "calendar" || view === "list";

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
  const todayIndex = (now.getDay() + 6) % 7;
  const isCurrent =
    view === "day"
      ? weekStart === thisWeek && day === todayIndex
      : view === "month"
      ? month.year === currentMonth.year && month.month === currentMonth.month
      : view === "year"
        ? year === now.getFullYear()
        : weekStart === thisWeek;
  const weekOffset = weeksBetween(thisWeek, weekStart);
  // Day view: "Today", "Tomorrow", "Yesterday", else e.g. "Thursday 22.10.".
  const dayOffset = weekOffset * 7 + day - todayIndex;
  const dayTitle =
    dayOffset === 0
      ? "Today"
      : dayOffset === 1
        ? "Tomorrow"
        : dayOffset === -1
          ? "Yesterday"
          : `${DAY_NAMES[day]} ${dayDate(weekStart, day)}`;
  const dayLoad = dayLoads(week, plan, doneEvents)[day];
  const dayName = dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : dayOffset === -1 ? "Yesterday" : (DAY_NAMES[day] ?? "");
  const title =
    view === "day"
      ? dayTitle
      : view === "month"
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
    view === "day"
      ? `${Math.abs(dayOffset) <= 1 ? `${DAY_NAMES[day]} ${dayDate(weekStart, day)} · ` : ""}` +
        `${hours(dayLoad ? totalMinutes(dayLoad) : 0)}h planned · ${hours(dayLoad?.done ?? 0)}h done`
      : view === "month"
      ? "Tap a day to open it · swipe for other months"
      : view === "year"
        ? "Tap a month to open it · swipe for other years"
        : // The dates go here only when the title is "This/Next/Last week"; otherwise the title is the dates.
          `${Math.abs(weekOffset) <= 1 ? `${weekRange(weekStart)} · ` : ""}` +
          `${hours(plannedMin)}h planned · ${hours(doneMin)}h done · ${hours(capacity.freeMinutes)}h free`;

  /** One week, month or year back or forward (swiping left or right). */
  const step = (n: number) => {
    if (view === "day") {
      const next = stepDay(weekStart, day, n);
      setWeekStart(next.weekStart);
      setDay(next.day);
    } else if (view === "month") setMonth(addMonths(month, n));
    else if (view === "year") setYear(year + n);
    else setWeekStart(addWeeks(weekStart, n));
  };
  stepRef.current = step;
  const goToToday = () => {
    setWeekStart(thisWeek);
    setDay(todayIndex);
    setMonth(currentMonth);
    setYear(now.getFullYear());
  };
  /** Opens one day in Day view. */
  const openDay = (weekOf: string, d: number) => {
    setWeekStart(weekOf);
    setDay(d);
    setView("day");
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
          <Text style={styles.heading} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.titleButtons}>
            {!isCurrent && (
              <Pressable onPress={goToToday} style={styles.todayButton} accessibilityRole="button">
                <Text style={styles.todayButtonText}>Today</Text>
              </Pressable>
            )}
            {view === "day" && (
              <Pressable onPress={() => setView("calendar")} style={styles.todayButton} accessibilityRole="button">
                <Text style={styles.todayButtonText}>See week ›</Text>
              </Pressable>
            )}
            {(view === "calendar" || view === "list") && (
              <Pressable onPress={() => setReviewOpen(true)} style={styles.todayButton} accessibilityRole="button">
                <Text style={styles.todayButtonText}>Review</Text>
              </Pressable>
            )}
            {view === "year" && (
              <Pressable onPress={() => setHistoryOpen(true)} style={styles.todayButton} accessibilityRole="button">
                <Text style={styles.todayButtonText}>Past weeks</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Text style={styles.sub}>{subtitle}</Text>
        {isWeekView && (
          <Pressable onPress={() => setPanelOpen(true)} style={styles.panelButton} accessibilityRole="button">
            <Text style={styles.panelButtonText}>
              {weeklyItems.length === 0
                ? "+ To-dos & goals for this week"
                : `This week: ${weekSummary(weeklyItems).done}/${weeklyItems.length} to-dos & goals done ›`}
              {later.length > 0 ? ` · ${laterHeading(later.length)}` : ""}
            </Text>
          </Pressable>
        )}
        {/* Sunday: a nudge to look back at the week before planning the next. */}
        {isWeekView && weekOffset === 0 && todayIndex === 6 && (
          <Pressable onPress={() => setReviewOpen(true)} style={styles.reviewNudge} accessibilityRole="button">
            <Text style={styles.reviewNudgeText}>It's Sunday: review and plan your week ›</Text>
          </Pressable>
        )}
        {/* A past week can't get new sessions, so "doesn't fit" would only nag. */}
        {isWeekView && weekOffset >= 0 && unplacedSessions > 0 && (
          <Text style={styles.warn}>
            {unplacedSessions} {unplacedSessions === 1 ? "session doesn't" : "sessions don't"} fit this week
          </Text>
        )}
        {saveError && <Text style={styles.warn}>{saveError}</Text>}
      </View>
      {/* Swipe left or right anywhere here: next or previous week (month, year). */}
      <View style={styles.content} {...swipe.panHandlers}>
        {view === "month" ? (
          <MonthView
            db={db}
            month={month}
            todayKey={dateKey(now)}
            onPressDay={openDay}
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
        ) : isEmpty && view !== "day" ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your week is empty</Text>
            <Text style={styles.emptyText}>
              Tap + to add work or classes (Fixed), routines with a checklist like your morning (Routine), and
              things you want to fit in (Flexible).
            </Text>
          </View>
        ) : view === "calendar" || view === "day" ? (
          <>
            {view === "day" && (
              // The week at a glance: tap a day to show it.
              <View style={styles.strip}>
                {DAY_NAMES.map((name, d) => {
                  const on = d === day;
                  const isToday = today?.day === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDay(d)}
                      style={[styles.stripDay, on && styles.stripOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.stripName, on && styles.stripTextOn]}>{name.slice(0, 2)}</Text>
                      <Text style={[styles.stripDate, isToday && styles.stripToday, on && styles.stripTextOn]}>
                        {dayDate(weekStart, d).split(".")[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {view === "day" && (
              <DayTodos
                key={`${weekStart}-${day}`} // a fresh card (closed list, empty field) per day
                dayName={dayName}
                items={dayTodos}
                onAdd={(title) => addWeekItem("todo", title, 1, day)}
                onChange={changeWeekItem}
                onDelete={removeWeekItem}
              />
            )}
            <WeekGrid
              key={view} // switching Day ↔ Calendar starts fresh, scrolled to now
              visibleDays={view === "day" ? [day] : undefined}
              onPressDay={(d) => openDay(weekStart, d)}
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
                  f
                  ? {
                      ...slot,
                      title: f.title,
                      repeat: f.repeat,
                      kind: f.kind === "routine" ? "routine" : "fixed",
                      routineId: f.routineId,
                      categoryId: f.categoryId,
                    }
                  : slot,
                );
                setSheetSize("half");
              }}
              draft={draft}
              onDraftChange={({ days, start, end }) =>
                setAdding((f) => f && { ...f, days, startTime: clock(start), endTime: clock(end) })
              }
              bottomInset={adding && sheetSize === "half" ? screenHeight / 2 : 0}
              groups={groups}
            badges={badges}
              // Dragging is a clear "put it here", so flexible sessions move even onto a busy time.
              onDropRow={async (row, day, minute) => setSaveError(await move(row, day, minute, true))}
              today={today}
              footer={queueFooter}
            />
          </>
        ) : (
          <WeekView days={days} weekStart={weekStart} groups={groups} badges={badges} onPressRow={setTapped} footer={queueFooter} />
        )}
      </View>
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
      {review && (
        <ReviewSheet
          visible={reviewOpen}
          weekLabel={weekRange(weekStart)}
          nextWeekStart={addWeeks(weekStart, 1)}
          stats={review}
          routines={{ done: [...badges.values()].filter((b) => b === "✓").length, total: badges.size }}
          items={weekItems}
          movedOn={movedOn}
          later={later}
          onPlanNext={() => {
            setReviewOpen(false);
            setPlanOpen(true);
          }}
          onPastWeeks={() => {
            setReviewOpen(false);
            setHistoryOpen(true);
          }}
          onClose={() => setReviewOpen(false)}
        />
      )}
      <HistorySheet
        db={db}
        visible={historyOpen}
        thisWeek={thisWeek}
        todayKey={dateKey(now)}
        groups={groups}
        later={later}
        onClose={() => setHistoryOpen(false)}
      />
      <PlanSheet
        db={db}
        visible={planOpen}
        nextWeekStart={addWeeks(weekStart, 1)}
        thisItems={weekItems}
        later={later}
        groups={groups}
        onChanged={refresh}
        onOpenNextWeek={() => {
          setPlanOpen(false);
          setWeekStart(addWeeks(weekStart, 1));
          setView("calendar");
        }}
        onClose={() => setPlanOpen(false)}
      />
      <WeekPanelSheet
        visible={panelOpen}
        weekLabel={weekRange(weekStart)}
        items={weeklyItems}
        onAdd={addWeekItem}
        onChange={changeWeekItem}
        onDelete={removeWeekItem}
        later={later}
        canAddFromLater={canAddFromLater(earliestStart)}
        onAddFromLater={addFromLater}
        onDeleteLater={removeLater}
        onClose={() => setPanelOpen(false)}
      />
      <QuickAddSheet
        form={adding}
        routines={routines}
        onAddRoutine={addRoutine}
        onEditRoutine={editRoutine}
        onDeleteRoutine={removeRoutine}
        onChange={setAdding}
        categories={categories}
        groupActions={groupActions}
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
        repeats={!!tapped && data.repeatingEventIds.has(tapped.id)}
        rows={allRows}
        categories={categories}
        groupActions={groupActions}
        onSetCategory={setRowCategory}
        routines={routines}
        checks={checks}
        onToggleStep={toggleStep}
        onEditRoutine={editRoutine}
        onDeleteRoutine={removeRoutine}
        onRename={rename}
        onResize={resize}
        onAction={act}
        onMove={move}
        checkMove={(row, day, minute) => moveProblem(week, plan, allRows, row, day, minute)}
        onClose={() => setTapped(undefined)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, minHeight: 32 },
  content: { flex: 1 },
  reviewNudge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  reviewNudgeText: { fontSize: 13, fontFamily: font.bold, color: colors.accentStrong },
  panelButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  panelButtonText: { fontSize: 13, fontFamily: font.bold, color: colors.successStrong },
  titleButtons: { marginLeft: "auto", flexDirection: "row", gap: 6 },
  strip: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  stripDay: { flex: 1, alignItems: "center", paddingVertical: 4, borderRadius: 10 },
  stripOn: { backgroundColor: colors.accent },
  stripName: { fontSize: 11, fontFamily: font.bold, color: colors.textMuted },
  stripDate: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  stripToday: { color: colors.now },
  stripTextOn: { color: colors.white },
  todayButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accentSoft },
  todayButtonText: { fontSize: 13, fontFamily: font.bold, color: colors.accent },
  toggle: { flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3 },
  toggleItem: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8 },
  toggleOn: { backgroundColor: colors.white, boxShadow: shadow.subtle },
  toggleText: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted },
  toggleTextOn: { color: colors.text },
  heading: { flexShrink: 1, fontSize: 22, fontFamily: font.heavy, color: colors.text, paddingHorizontal: 4 },
  sub: { marginTop: 4, color: colors.textMuted },
  warn: { marginTop: 4, color: colors.warnText, fontFamily: font.semibold },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text },
  emptyText: { textAlign: "center", color: colors.textMuted, lineHeight: 21 },
  queue: { padding: 12, borderRadius: 10, backgroundColor: colors.warnSoft, gap: 2 },
  queueTitle: { fontFamily: font.bold, color: colors.warnText },
  queueText: { color: colors.warnText },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    boxShadow: shadow.raised,
  },
  fabText: { color: colors.white, fontSize: 32, lineHeight: 34, fontFamily: font.regular },
});
