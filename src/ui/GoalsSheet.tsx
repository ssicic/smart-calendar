import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Goal, GoalHorizon } from "../db/goalsStore";
import type { WeekItem } from "../db/weekItemsStore";
import type { FlexibleItem } from "../engine";
import { goalProgress, tooManyGoalsNote, type TimeCheck } from "./goals";
import { lengthLabel } from "./itemActions";
import { colors, font, radius } from "./theme";
import { periodLabel } from "./weekDate";
import { isFinished, weekItemProblem } from "./weekItems";

type Result = Promise<string | undefined>;

interface Props {
  visible: boolean;
  /** The year and month of the week on screen: "2026", "2026-10". */
  periods: { year: string; month: string };
  goals: Goal[];
  /** This week's goals (to link them to a month or year goal). */
  weekGoals: WeekItem[];
  onAddGoal: (horizon: GoalHorizon, title: string, parentId: string | null) => Result;
  onChangeGoal: (goal: Goal) => Result;
  onDeleteGoal: (id: string) => Result;
  onAddToWeek: (goal: Goal) => Result;
  onChangeWeekGoal: (item: WeekItem) => Result;
  /** Flexible items made for goals, with how many of their sessions are done this week. */
  goalItems: { item: FlexibleItem; doneThisWeek: number }[];
  /** Done sessions per goal id this month and this year. */
  sessions: { month: Map<string, number>; year: Map<string, number> };
  onCheckTime: (goal: Goal, minutes: number, times: number) => TimeCheck | undefined;
  onMakeTime: (goal: Goal, minutes: number, times: number) => Result;
  onStopTime: (itemId: string) => Result;
  onClose: () => void;
}

/** Year → month → week goals: what you're working towards, and what's part of what. */
export function GoalsSheet(props: Props) {
  const { visible, periods, goals, weekGoals, onClose } = props;
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>(); // the row being edited
  useEffect(() => {
    if (!visible) {
      setError(undefined);
      setOpen(undefined);
    }
  }, [visible]);

  const run = async (work: Result) => setError(await work);
  const yearGoals = goals.filter((g) => g.horizon === "year");
  const monthGoals = goals.filter((g) => g.horizon === "month");
  const titleOf = (id: string | null | undefined) => goals.find((g) => g.id === id)?.title;

  // Done sessions for a goal: its own items, plus (for a year goal) its month goals' items.
  const sessionsOf = (goal: Goal) => {
    const map = goal.horizon === "month" ? props.sessions.month : props.sessions.year;
    const children = goals.filter((g) => g.parentId === goal.id);
    return (map.get(goal.id) ?? 0) + children.reduce((sum, c) => sum + (map.get(c.id) ?? 0), 0);
  };

  const goalRow = (goal: Goal, parents: Goal[]) => (
    <GoalRow
      key={goal.id}
      sessions={sessionsOf(goal)}
      sessionsPeriod={goal.horizon === "month" ? "this month" : "this year"}
      makeTime={
        <MakeTime
          items={props.goalItems.filter((g) => g.item.goalId === goal.id)}
          onCheck={(m, t) => props.onCheckTime(goal, m, t)}
          onMake={(m, t) => run(props.onMakeTime(goal, m, t))}
          onStop={(id) => run(props.onStopTime(id))}
        />
      }
      title={goal.title}
      done={goal.done}
      progress={goalProgress(goal, goals, weekGoals)}
      partOf={titleOf(goal.parentId)}
      open={open === goal.id}
      onToggleOpen={() => setOpen(open === goal.id ? undefined : goal.id)}
      onToggleDone={() => run(props.onChangeGoal({ ...goal, done: !goal.done }))}
      onRename={(title) => run(props.onChangeGoal({ ...goal, title }))}
      parents={parents}
      parentId={goal.parentId}
      onParent={(parentId) => run(props.onChangeGoal({ ...goal, parentId }))}
      onDelete={() => run(props.onDeleteGoal(goal.id))}
      onAddToWeek={() => run(props.onAddToWeek(goal))}
      onError={setError}
    />
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.heading, styles.flex]}>Goals</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>This year · {periodLabel(periods.year)}</Text>
            {yearGoals.map((g) => goalRow(g, []))}
            {tooManyGoalsNote(goals, "year") && <Text style={styles.note}>{tooManyGoalsNote(goals, "year")}</Text>}
            <AddGoal placeholder="A goal for this year…" parents={[]} onAdd={(t) => props.onAddGoal("year", t, null)} onError={setError} />

            <Text style={[styles.section, styles.gap]}>This month · {periodLabel(periods.month)}</Text>
            {monthGoals.map((g) => goalRow(g, yearGoals))}
            {tooManyGoalsNote(goals, "month") && <Text style={styles.note}>{tooManyGoalsNote(goals, "month")}</Text>}
            <AddGoal
              placeholder="A goal for this month…"
              parents={yearGoals}
              onAdd={(t, parentId) => props.onAddGoal("month", t, parentId)}
              onError={setError}
            />

            <Text style={[styles.section, styles.gap]}>This week</Text>
            {weekGoals.length === 0 && (
              <Text style={styles.muted}>No week goals yet. Add one here with "Add to this week", or in the This week panel.</Text>
            )}
            {weekGoals.map((w) => (
              <View key={w.id} style={styles.weekRow}>
                <View style={styles.flex}>
                  <Text style={[styles.title, isFinished(w) && styles.finished]}>
                    {w.title} ({w.progress}/{w.target})
                  </Text>
                  <ParentChips
                    parents={[...monthGoals, ...yearGoals]}
                    selected={w.goalId ?? null}
                    onSelect={(goalId) => run(props.onChangeWeekGoal({ ...w, goalId }))}
                  />
                </View>
              </View>
            ))}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function GoalRow(props: {
  sessions: number;
  sessionsPeriod: string;
  makeTime: React.ReactNode;
  title: string;
  done: boolean;
  progress: { done: number; total: number };
  partOf?: string;
  open: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onRename: (title: string) => void;
  parents: Goal[];
  parentId: string | null;
  onParent: (parentId: string | null) => void;
  onDelete: () => void;
  onAddToWeek: () => void;
  onError: (e: string | undefined) => void;
}) {
  const [title, setTitle] = useState(props.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setTitle(props.title);
    setConfirmDelete(false);
  }, [props.title, props.open]);

  return (
    <View style={[styles.row, props.open && styles.rowOpen]}>
      <View style={styles.rowTop}>
        <Pressable
          onPress={props.onToggleDone}
          style={[styles.box, props.done && styles.boxOn]}
          hitSlop={6}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: props.done }}
          accessibilityLabel={props.title}
        >
          {props.done && <Ionicons name="checkmark" size={15} color={colors.white} />}
        </Pressable>
        <Pressable style={styles.flex} onPress={props.onToggleOpen} accessibilityRole="button" accessibilityHint="Edit">
          <Text style={[styles.title, props.done && styles.finished]}>{props.title}</Text>
          {(props.partOf || props.progress.total > 0 || props.sessions > 0) && (
            <Text style={styles.meta}>
              {[
                props.partOf ? `Part of ${props.partOf}` : "",
                props.progress.total > 0 ? `${props.progress.done}/${props.progress.total} parts done` : "",
                props.sessions > 0 ? `${props.sessions} ${props.sessions === 1 ? "session" : "sessions"} done ${props.sessionsPeriod}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
        </Pressable>
        <Ionicons name={props.open ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
      </View>

      {props.open && (
        <View style={styles.editor}>
          <View style={styles.inline}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={() => {
                const bad = weekItemProblem(title);
                if (bad) return props.onError(bad);
                props.onRename(title.trim());
              }}
              returnKeyType="done"
            />
            <Pressable
              onPress={() => {
                const bad = weekItemProblem(title);
                if (bad) return props.onError(bad);
                props.onRename(title.trim());
              }}
              style={styles.smallButton}
              accessibilityRole="button"
            >
              <Text style={styles.smallButtonText}>Rename</Text>
            </Pressable>
          </View>
          {props.parents.length > 0 && <ParentChips parents={props.parents} selected={props.parentId} onSelect={props.onParent} />}
          {props.makeTime}
          <View style={styles.inline}>
            <Pressable onPress={props.onAddToWeek} style={styles.smallButton} accessibilityRole="button">
              <Text style={styles.smallButtonText}>Add to this week</Text>
            </Pressable>
            <Pressable
              onPress={() => (confirmDelete ? props.onDelete() : setConfirmDelete(true))}
              style={[styles.deleteButton, confirmDelete && styles.deleteConfirm]}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>{confirmDelete ? "Tap again to delete" : "Delete"}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const MINUTE_CHOICES = [30, 45, 60, 90];

/**
 * "Make time for it": a weekly amount of time for the goal, placed by the
 * planner. Checks first that it fits the week, and offers what would.
 */
function MakeTime(props: {
  items: { item: FlexibleItem; doneThisWeek: number }[];
  onCheck: (minutes: number, times: number) => TimeCheck | undefined;
  onMake: (minutes: number, times: number) => void;
  onStop: (itemId: string) => void;
}) {
  const [minutes, setMinutes] = useState(60);
  const [times, setTimes] = useState(2);
  const [check, setCheck] = useState<TimeCheck>();
  const [confirmStop, setConfirmStop] = useState<string>();

  if (props.items.length > 0) {
    return (
      <View style={styles.timeBox}>
        <Text style={styles.timeTitle}>Time for it</Text>
        {props.items.map(({ item, doneThisWeek }) => (
          <View key={item.id} style={styles.inline}>
            <Text style={[styles.meta, styles.flex]}>
              {lengthLabel(item.durationMin)} × {item.timesPerWeek} a week · {doneThisWeek}/{item.timesPerWeek} done this week
            </Text>
            <Pressable
              onPress={() => (confirmStop === item.id ? props.onStop(item.id) : setConfirmStop(item.id))}
              style={[styles.deleteButton, confirmStop === item.id && styles.deleteConfirm]}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>{confirmStop === item.id ? "Tap again to stop" : "Stop"}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    );
  }

  const tryMake = (t: number, force = false) => {
    const c = props.onCheck(minutes, t);
    if (!force && c && !c.fits) return setCheck(c);
    setCheck(undefined);
    props.onMake(minutes, t);
  };

  return (
    <View style={styles.timeBox}>
      <Text style={styles.timeTitle}>Make time for it</Text>
      <View style={styles.chips}>
        {MINUTE_CHOICES.map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              setMinutes(m);
              setCheck(undefined);
            }}
            style={[styles.chip, m === minutes && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: m === minutes }}
          >
            <Text style={[styles.chipText, m === minutes && styles.chipTextOn]}>{lengthLabel(m)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.inline}>
        <Text style={[styles.meta, styles.flex]}>Times a week</Text>
        <Pressable
          onPress={() => {
            setTimes((t) => Math.max(1, t - 1));
            setCheck(undefined);
          }}
          style={styles.step}
          accessibilityRole="button"
          accessibilityLabel="Fewer times"
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.count}>{times}</Text>
        <Pressable
          onPress={() => {
            setTimes((t) => Math.min(14, t + 1));
            setCheck(undefined);
          }}
          style={styles.step}
          accessibilityRole="button"
          accessibilityLabel="More times"
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      {check && !check.fits ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            That puts this week {Math.round(check.overflowMin / 6) / 10}h over.
            {check.fitsTimes > 0 ? ` ${check.fitsTimes}× a week would fit.` : " Even once doesn't fit right now."}
            {check.swapTitles.length > 0 ? ` To make room you could drop: ${check.swapTitles.join(", ")}.` : ""}
          </Text>
          <View style={styles.inline}>
            {check.fitsTimes > 0 && (
              <Pressable
                onPress={() => {
                  setTimes(check.fitsTimes);
                  tryMake(check.fitsTimes);
                }}
                style={styles.smallButton}
                accessibilityRole="button"
              >
                <Text style={styles.smallButtonText}>Use {check.fitsTimes}× a week</Text>
              </Pressable>
            )}
            <Pressable onPress={() => tryMake(times, true)} style={styles.deleteButton} accessibilityRole="button">
              <Text style={styles.plainText}>Add anyway</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => tryMake(times)} style={styles.makeButton} accessibilityRole="button">
          <Text style={styles.makeText}>
            Make time: {lengthLabel(minutes)} × {times} a week
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** "Part of: none / Get fit / Learn Spanish". */
function ParentChips(props: { parents: Goal[]; selected: string | null; onSelect: (id: string | null) => void }) {
  if (props.parents.length === 0) return null;
  return (
    <View style={styles.chips}>
      <Text style={styles.meta}>Part of:</Text>
      {[{ id: null, title: "nothing" } as { id: string | null; title: string }, ...props.parents].map((p) => {
        const on = p.id === props.selected;
        return (
          <Pressable
            key={p.id ?? "none"}
            onPress={() => props.onSelect(p.id)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text box + Add; for month goals also which year goal it's part of. */
function AddGoal(props: {
  placeholder: string;
  parents: Goal[];
  onAdd: (title: string, parentId: string | null) => Result;
  onError: (e: string | undefined) => void;
}) {
  const [text, setText] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const add = async () => {
    const bad = weekItemProblem(text);
    if (bad) return props.onError(bad);
    const err = await props.onAdd(text.trim(), parentId);
    props.onError(err);
    if (!err) {
      setText("");
      setParentId(null);
    }
  };
  return (
    <View style={styles.addBox}>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={text}
          onChangeText={setText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textFaint}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable onPress={add} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Add goal">
          <Ionicons name="add" size={20} color={colors.white} />
        </Pressable>
      </View>
      {text.trim().length > 0 && <ParentChips parents={props.parents} selected={parentId} onSelect={setParentId} />}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 16,
    paddingBottom: 24,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  heading: { fontFamily: font.heavy, fontSize: 20, color: colors.text },
  link: { fontFamily: font.semibold, fontSize: 16, color: colors.accentStrong },
  body: { gap: 8, paddingBottom: 16 },
  section: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  gap: { marginTop: 12 },
  row: { padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 8 },
  rowOpen: { backgroundColor: colors.panel },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  weekRow: { padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.accent },
  title: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  finished: { color: colors.textFaint, textDecorationLine: "line-through" },
  meta: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  note: { fontFamily: font.medium, fontSize: 13, color: colors.warnText, backgroundColor: colors.warnSoft, padding: 8, borderRadius: radius.sm },
  muted: { fontFamily: font.regular, fontSize: 14, color: colors.textFaint },
  editor: { gap: 8 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.accentSoft },
  smallButtonText: { fontFamily: font.bold, fontSize: 13, color: colors.accentStrong },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  deleteConfirm: { backgroundColor: colors.dangerSoft },
  deleteText: { fontFamily: font.bold, fontSize: 13, color: colors.danger },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.accent },
  chipText: { fontFamily: font.semibold, fontSize: 12, color: colors.textSoft },
  chipTextOn: { color: colors.white },
  addBox: { gap: 4 },
  timeBox: { gap: 8, padding: 10, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  timeTitle: { fontFamily: font.bold, fontSize: 13, color: colors.textSoft },
  step: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  stepText: { fontFamily: font.bold, fontSize: 18, color: colors.textSoft },
  count: { minWidth: 24, textAlign: "center", fontFamily: font.bold, fontSize: 15, color: colors.text },
  warnBox: { gap: 8, padding: 8, borderRadius: radius.sm, backgroundColor: colors.warnSoft },
  warnText: { fontFamily: font.medium, fontSize: 13, color: colors.warnText, lineHeight: 18 },
  plainText: { fontFamily: font.bold, fontSize: 13, color: colors.textSoft },
  makeButton: { alignItems: "center", paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.accent },
  makeText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { fontFamily: font.semibold, color: colors.danger },
});
