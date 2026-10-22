import { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { DAY, checkNewItem, type WeekInput } from "../engine";
import {
  EMPTY_FORM,
  parseQuickAdd,
  type AddKind,
  type Importance,
  type ParseResult,
  type QuickAddForm,
  type TimeOfDay,
  parseTime,
} from "./quickAdd";
import type { Category } from "../db/weekStore";
import { CategoryPicker } from "./CategoryPicker";
import type { Routine, RoutineStep } from "../db/weekStore";
import { RoutineEditor } from "./RoutineEditor";
import type { GroupActions } from "./ManageGroupsSheet";
import { Chips } from "./Chips";
import { Notice } from "./Notice";
import { overlapping, summarize } from "./overlaps";
import { TimePicker } from "./TimePicker";
import { shortDate, weekRange } from "./weekDate";
import { DAY_NAMES, clock, type WeekRow } from "./weekRows";
import { colors, font, radius, shadow } from "./theme";

/** What the sheet hands back to App when the user saves. */
export type QuickAddResult = Extract<ParseResult, { ok: true }>;

/** "half": the calendar stays visible and usable above it. "full": almost the whole screen. */
export type SheetSize = "half" | "full";

interface Props {
  /**
   * The form while the sheet is open; undefined = closed. Kept by the screen,
   * so the calendar can show and change the day and times too.
   */
  form?: QuickAddForm;
  onChange: (form: QuickAddForm) => void;
  size: SheetSize;
  onSizeChange: (size: SheetSize) => void;
  week: WeekInput;
  /** Everything currently on the calendar, for the overlap warning. */
  rows: WeekRow[];
  onSave: (result: QuickAddResult) => void;
  onClose: () => void;
  /** The week on screen (its Monday): where a non-repeating event goes. */
  weekStart: string;
  categories: Category[];
  groupActions: GroupActions;
  /** Saved routines to pick from (Morning routine…). */
  routines: Routine[];
  onAddRoutine: (name: string, steps: RoutineStep[]) => Promise<{ id: string } | { error: string }>;
  onEditRoutine: (routine: Routine) => Promise<string | undefined>;
  onDeleteRoutine: (id: string) => Promise<string | undefined>;
}

let idCounter = 0;
const newId = () => `u${Date.now().toString(36)}${idCounter++}`;

/** `half` = one of two fields side by side in a row. */
function Field(props: { label: string; half?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.field, props.half && styles.half]}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children}
    </View>
  );
}

const KIND_OPTIONS: { value: AddKind; label: string }[] = [
  { value: "flexible", label: "Flexible" },
  { value: "fixed", label: "Fixed" },
  { value: "routine", label: "Routine" },
];
const TIME_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const IMPORTANCE_OPTIONS: { value: Importance; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const DAY_OPTIONS = DAY_NAMES.map((name, i) => ({ value: i, label: name.slice(0, 3) }));

export function QuickAddSheet(props: Props) {
  const { form: openForm, onChange, size, onSizeChange, week, rows, onSave, onClose, weekStart } = props;
  const { categories, groupActions, routines, onAddRoutine, onEditRoutine, onDeleteRoutine } = props;
  // The routine editor inside the form: making a new routine, or editing the picked one.
  const [routineEditor, setRoutineEditor] = useState<"new" | "edit" | null>(null);
  // The form's values live in the screen (passed in as `form`); every change
  // goes back up through onChange, and React redraws both sheet and calendar.
  const form = openForm ?? EMPTY_FORM;
  // The saved routine picked in the form, if any (its steps show as a preview).
  const picked = routines.find((r) => r.id === form.routineId);
  const [error, setError] = useState<string>();
  // Set when a flexible item doesn't fit; the next Save tap adds it anyway.
  const [warning, setWarning] = useState<string>();
  // After one OK on the overlap note, stop showing it until the sheet reopens.
  const [overlapOff, setOverlapOff] = useState(false);

  const update = (patch: Partial<QuickAddForm>) => {
    onChange({ ...form, ...patch });
    setError(undefined);
    setWarning(undefined);
  };

  const close = () => {
    setError(undefined);
    setWarning(undefined);
    setOverlapOff(false);
    setRoutineEditor(null);
    onClose();
  };

  const save = () => {
    const result = parseQuickAdd(form, newId);
    if (!result.ok) return setError(result.error);

    // Capacity guard: warn once before overbooking the week.
    if (result.kind === "flexible" && !warning) {
      const check = checkNewItem(week, result.item);
      if (!check.fits) {
        const over = Math.round(check.overflowMinutes / 6) / 10;
        const swaps = check.swapCandidates.slice(0, 3).map((i) => i.title);
        return setWarning(
          `This puts your week ${over}h over.` +
            (swaps.length ? ` Lower-priority items you could drop: ${swaps.join(", ")}.` : "") +
            " Tap Add anyway to keep it; sessions that don't fit stay unplaced.",
        );
      }
    }

    onSave(result);
    close();
  };

  const isFlexible = form.kind === "flexible";

  // Swipe the top of the sheet: up = full screen, down = smaller, then closed.
  // The ref lets the gesture (made once) see the current size.
  const latest = useRef({ size, close, onSizeChange });
  latest.current = { size, close, onSizeChange };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        const { size: now, close: shut, onSizeChange: resize } = latest.current;
        if (g.dy < -30) resize("full");
        else if (g.dy > 30) {
          if (now === "full") resize("half");
          else shut();
        }
      },
    }),
  ).current;

  // Android's back button closes the sheet instead of leaving the app.
  useEffect(() => {
    if (!openForm) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      latest.current.close();
      return true;
    });
    return () => sub.remove();
  }, [openForm]);

  // Changing the start keeps the length, so "09:00–10:00" moved to 14:00
  // becomes "14:00–15:00" without touching the end picker.
  const setStart = (startTime: string) => {
    const oldStart = parseTime(form.startTime) ?? 0;
    const oldEnd = parseTime(form.endTime) ?? 0;
    const length = oldEnd > oldStart ? oldEnd - oldStart : 60;
    const start = parseTime(startTime) ?? 0;
    update({ startTime, endTime: clock(Math.min(start + length, DAY - 15)) });
  };

  // Recomputed on every render: cheap, and always matches the current picks.
  const startMin = parseTime(form.startTime);
  const endMin = parseTime(form.endTime);
  const clashes =
    !isFlexible && startMin !== undefined && endMin !== undefined && endMin > startMin
      ? overlapping(
          rows,
          form.days.map((d) => ({ start: d * DAY + startMin, end: d * DAY + endMin })),
        )
      : [];

  if (!openForm) return null;

  return (
    <>
      {size === "full" && (
        <Pressable
          style={styles.backdrop}
          onPress={() => onSizeChange("half")}
          accessibilityLabel="Make the form smaller"
        />
      )}
      <View style={[styles.sheet, size === "half" ? styles.halfSheet : styles.fullSheet]}>
        <View {...swipe.panHandlers}>
          <Pressable
            onPress={() => onSizeChange(size === "half" ? "full" : "half")}
            style={styles.grabber}
            accessibilityRole="button"
            accessibilityLabel={size === "half" ? "Make the form full screen" : "Make the form smaller"}
          >
            <View style={styles.grabBar} />
          </Pressable>
          <View style={styles.sheetHeader}>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Add to your week</Text>
            <Pressable onPress={save} hitSlop={12} style={styles.saveButton} accessibilityRole="button">
              <Text style={styles.saveText}>{warning ? "Add anyway" : "Save"}</Text>
            </Pressable>
          </View>
          {(error || warning) && (
            <View style={styles.messages}>
              {error && <Text style={styles.error}>{error}</Text>}
              {warning && <Text style={styles.warning}>{warning}</Text>}
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Chips
            options={KIND_OPTIONS}
            isSelected={(v) => v === form.kind}
            onPress={(kind) =>
              // Routines usually happen every week, so Repeat starts on for them.
              update(kind === "routine" && form.kind !== "routine" ? { kind, repeat: true } : { kind })
            }
          />

          {form.kind === "routine" && (
            <Field label="Which routine">
              <View style={styles.routineChips}>
                {routines.map((r) => {
                  const on = r.id === form.routineId;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => update({ routineId: r.id, title: r.name })}
                      style={[styles.routineChip, on && styles.routineChipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.routineChipText, on && styles.routineChipTextOn]}>
                        {r.name} · {r.steps.length}
                      </Text>
                    </Pressable>
                  );
                })}
                {!routineEditor && (
                  <Pressable onPress={() => setRoutineEditor("new")} style={styles.newRoutine} accessibilityRole="button">
                    <Text style={styles.newRoutineText}>+ New routine</Text>
                  </Pressable>
                )}
              </View>
              {routineEditor === "new" ? (
                <RoutineEditor
                  existing={routines}
                  onCancel={() => setRoutineEditor(null)}
                  onSave={async (name, steps) => {
                    const r = await onAddRoutine(name, steps);
                    if ("error" in r) return r.error;
                    setRoutineEditor(null);
                    update({ routineId: r.id, title: name });
                    return undefined;
                  }}
                />
              ) : routineEditor === "edit" && picked ? (
                <RoutineEditor
                  routine={picked}
                  existing={routines}
                  onCancel={() => setRoutineEditor(null)}
                  onSave={async (name, steps) => {
                    const err = await onEditRoutine({ id: picked.id, name, steps });
                    if (err) return err;
                    setRoutineEditor(null);
                    update({ title: name });
                    return undefined;
                  }}
                  onDelete={async () => {
                    const err = await onDeleteRoutine(picked.id);
                    if (err) return err;
                    setRoutineEditor(null);
                    // The name came from the deleted routine: clear it too.
                    update({ routineId: null, title: form.title === picked.name ? "" : form.title });
                    return undefined;
                  }}
                />
              ) : picked ? (
                <View style={styles.preview}>
                  <Text style={styles.stepsPreview}>{picked.steps.map((s) => s.text).join(" · ")}</Text>
                  <Pressable onPress={() => setRoutineEditor("edit")} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.editRoutine}>Edit routine</Text>
                  </Pressable>
                </View>
              ) : routines.length === 0 ? (
                <Text style={styles.stepsPreview}>
                  No routines yet. Make your first one, like the steps of your morning or your bedtime.
                </Text>
              ) : null}
            </Field>
          )}

          <Field label="Name">
            <TextInput
              style={styles.input}
              value={form.title}
              onChangeText={(title) => update({ title })}
              placeholder={isFlexible ? "Gym, Spanish, Guitar…" : form.kind === "fixed" ? "Work, Class…" : "Morning routine"}
              // Full screen (opened with +): start typing right away. Half (from the
              // calendar): no keyboard yet, so the calendar stays in view.
              autoFocus={size === "full"}
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </Field>

          <Field label="Group (optional)">
            <CategoryPicker
              categories={categories}
              selected={form.categoryId}
              onSelect={(categoryId) => update({ categoryId })}
              actions={groupActions}
            />
          </Field>

          {isFlexible ? (
            <>
              <View style={styles.repeatRow}>
                <View style={styles.repeatText}>
                  <Text style={styles.repeatLabel}>Repeat every week</Text>
                  <Text style={styles.repeatHint}>
                    {form.repeat
                      ? "Every week from this one, until you stop it"
                      : `Only ${weekRange(weekStart)}`}
                  </Text>
                </View>
                <Switch
                  value={form.repeat}
                  onValueChange={(repeat) => update({ repeat })}
                  trackColor={{ true: colors.accent, false: colors.borderStrong }}
                  thumbColor={colors.white}
                  accessibilityLabel="Repeat every week"
                />
              </View>
              <View style={styles.row}>
                <Field label="Minutes" half>
                  <TextInput
                    style={styles.input}
                    value={form.durationMin}
                    onChangeText={(durationMin) => update({ durationMin })}
                    keyboardType="number-pad"
                  />
                </Field>
                <Field label="Times per week" half>
                  <TextInput
                    style={styles.input}
                    value={form.timesPerWeek}
                    onChangeText={(timesPerWeek) => update({ timesPerWeek })}
                    keyboardType="number-pad"
                  />
                </Field>
              </View>
              <Field label="When">
                <Chips
                  options={TIME_OPTIONS}
                  isSelected={(v) => v === form.timeOfDay}
                  onPress={(timeOfDay) => update({ timeOfDay })}
                />
              </Field>
              <Field label="How important">
                <Chips
                  options={IMPORTANCE_OPTIONS}
                  isSelected={(v) => v === form.importance}
                  onPress={(importance) => update({ importance })}
                />
              </Field>
            </>
          ) : (
            <>
              <View style={styles.repeatRow}>
                <View style={styles.repeatText}>
                  <Text style={styles.repeatLabel}>Repeat every week</Text>
                  <Text style={styles.repeatHint}>
                    {form.repeat
                      ? "Shows up in every week"
                      : `Only ${weekRange(weekStart)}`}
                  </Text>
                </View>
                <Switch
                  value={form.repeat}
                  onValueChange={(repeat) => update({ repeat })}
                  trackColor={{ true: colors.accent, false: colors.borderStrong }}
                  thumbColor={colors.white}
                  accessibilityLabel="Repeat every week"
                />
              </View>
              <Field label="Days">
                <Chips
                  // Just this week: show the dates too ("Thu 22"), since it's one specific day.
                  options={
                    form.repeat
                      ? DAY_OPTIONS
                      : DAY_OPTIONS.map((o) => ({ ...o, label: `${o.label} ${shortDate(weekStart, o.value).split(" ")[0]}` }))
                  }
                  isSelected={(d) => form.days.includes(d)}
                  onPress={(d) =>
                    update({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] })
                  }
                />
              </Field>
              <Field label={`Start  ${form.startTime}`}>
                <TimePicker value={form.startTime} onChange={setStart} />
              </Field>
              <Field label={`End  ${form.endTime}`}>
                <TimePicker value={form.endTime} onChange={(endTime) => update({ endTime })} />
              </Field>
              {!overlapOff && clashes.length > 0 && (
                <Notice text={`Already there: ${summarize(clashes)}.`} onDismiss={() => setOverlapOff(true)} />
              )}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  repeatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  repeatText: { flexShrink: 1, gap: 2 },
  repeatLabel: { fontSize: 15, fontFamily: font.semibold, color: colors.text },
  repeatHint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.backdrop },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    boxShadow: shadow.raised,
  },
  halfSheet: { height: "50%" },
  fullSheet: { height: "92%" },
  grabber: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grabBar: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontFamily: font.heavy, color: colors.text },
  messages: { paddingHorizontal: 16, gap: 8 },
  routineChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  routineChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.routineSoft },
  routineChipOn: { backgroundColor: colors.routine },
  routineChipText: { fontSize: 14, fontFamily: font.semibold, color: colors.warnText },
  routineChipTextOn: { color: colors.white },
  newRoutine: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: "dashed" },
  newRoutineText: { fontSize: 14, fontFamily: font.semibold, color: colors.routine },
  stepsPreview: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  preview: { gap: 6 },
  editRoutine: { fontSize: 14, fontFamily: font.semibold, color: colors.routine },
  cancel: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { padding: 16, paddingBottom: 32, gap: 16 },
  row: { flexDirection: "row", gap: 12 },
  field: { gap: 6 },
  half: { flex: 1 },
  label: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
  },
  error: { color: colors.danger, fontFamily: font.semibold },
  warning: { color: colors.warnText, backgroundColor: colors.warnSoft, padding: 12, borderRadius: 10, lineHeight: 20 },
  saveButton: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  saveText: { color: colors.white, fontSize: 15, fontFamily: font.bold },
});
