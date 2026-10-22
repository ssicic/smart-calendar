import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DAY, dayOf } from "../engine";
import type { Category, Routine, RoutineStep } from "../db/weekStore";
import { RoutineEditor } from "./RoutineEditor";
import { checkKey, progress, progressLabel } from "./routines";
import { CategoryPicker } from "./CategoryPicker";
import type { GroupActions } from "./ManageGroupsSheet";
import { Chips } from "./Chips";
import {
  LENGTH_CHOICES,
  actionsFor,
  lengthLabel,
  lengthProblem,
  renameProblem,
  sameNameEvents,
  type ActionId,
  type EventScope,
} from "./itemActions";
import { QUEUE_CHOICES } from "./later";
import { overlapping, summarize } from "./overlaps";
import { parseTime } from "./quickAdd";
import { TimePicker } from "./TimePicker";
import { Notice } from "./Notice";
import { DAY_NAMES, clock, isEventKind, type WeekRow } from "./weekRows";
import { colors, font, radius } from "./theme";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  /** The tapped row; undefined hides the sheet. */
  row: WeekRow | undefined;
  /** Everything currently on the calendar, for the overlap warning. */
  rows: WeekRow[];
  /** True for an event that repeats every week: Move and Delete then ask "Just this week" or "Every week". */
  repeats: boolean;
  /** True when the event or flexible item repeats: offers "Stop after this week". */
  canStop?: boolean;
  /** Each handler returns an error message, or undefined when it worked. */
  onAction: (row: WeekRow, action: ActionId, scope?: EventScope) => Promise<string | undefined>;
  onMove: (
    row: WeekRow,
    day: number,
    minuteOfDay: number,
    force?: boolean,
    scope?: EventScope,
  ) => Promise<string | undefined>;
  /** Why the row can't move there (live, no saving), or undefined. */
  checkMove: (row: WeekRow, day: number, minuteOfDay: number) => string | undefined;
  onClose: () => void;
  categories: Category[];
  groupActions: GroupActions;
  /** Changes the row's group (for a flexible session: the whole item, every week). */
  onSetCategory: (row: WeekRow, categoryId: string | null) => Promise<string | undefined>;
  /** New name; `all` = every event of this kind with the same name. */
  onRename: (row: WeekRow, title: string, all: boolean) => Promise<string | undefined>;
  /** New length in minutes (`scope` for a repeating event). */
  onResize: (row: WeekRow, minutes: number, scope: EventScope) => Promise<string | undefined>;
  /** Every saved routine (to find this row's checklist, and for the editor's name check). */
  routines: Routine[];
  /** Ticked routine steps this week, as checkKey(eventId, stepId). */
  checks: Set<string>;
  onToggleStep: (eventId: string, stepId: string) => Promise<string | undefined>;
  /** Saves a changed routine (name and steps) everywhere it's used. */
  onEditRoutine: (routine: Routine) => Promise<string | undefined>;
  /** Deletes the saved routine; its blocks stay as fixed events. */
  onDeleteRoutine: (id: string) => Promise<string | undefined>;
}

const DAY_OPTIONS = DAY_NAMES.map((name, i) => ({ value: i, label: name.slice(0, 3) }));
const SCOPES: { value: EventScope; label: string }[] = [
  { value: "week", label: "Just this week" },
  { value: "every", label: "Every week" },
];

export function ItemActionsSheet(props: Props) {
  const { row, rows, repeats, onAction, onMove, checkMove, onClose, categories, groupActions, onSetCategory } = props;
  const [mode, setMode] = useState<"menu" | "move" | "rename" | "steps" | "length">("menu");
  const [newLength, setNewLength] = useState(60);
  const [newTitle, setNewTitle] = useState("");
  const [renameAll, setRenameAll] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "Move to queue…" was tapped: show Next week / Later.
  const [pickQueue, setPickQueue] = useState(false);
  const [moveDay, setMoveDay] = useState(0);
  const [moveTime, setMoveTime] = useState("");
  const [scope, setScope] = useState<EventScope>("week");
  // After one OK, stop showing warnings until the sheet is opened again.
  const [warningsOff, setWarningsOff] = useState(false);

  // Reset the sheet every time a different row is tapped.
  useEffect(() => {
    setMode("menu");
    setError(undefined);
    setConfirmDelete(false);
    setPickQueue(false);
    setWarningsOff(false);
    setScope("week");
    setRenameAll(false);
    if (row) {
      setNewTitle(row.title);
      setNewLength(row.end - row.start);
      setMoveDay(dayOf(row.start));
      setMoveTime(clock(row.start));
    }
  }, [row]);

  if (!row) return null;

  const { checks } = props;
  // A routine's checklist (if this row is one).
  const routine = row.routineId ? props.routines.find((r) => r.id === row.routineId) : undefined;

  // Live check of the picked slot. Flexible sessions push suggestions aside;
  // landing on fixed, rest, placed, locked or done time needs a "Move anyway".
  const pickedStart = parseTime(moveTime);
  const isEvent = isEventKind(row.kind);
  const clashes =
    pickedStart === undefined
      ? []
      : overlapping(
          rows,
          [{ start: moveDay * DAY + pickedStart, end: moveDay * DAY + pickedStart + (row.end - row.start) }],
          row.id,
        );
  const problem = pickedStart === undefined ? undefined : checkMove(row, moveDay, pickedStart);
  const pushedAside = isEvent ? [] : clashes.filter((r) => r.kind === "suggested");
  // Running past Sunday can't be overridden; overlapping can.
  const canForce = !!problem && !isEvent;

  const run = async (action: ActionId, deleteScope?: EventScope) => {
    if (action === "move") return setMode("move");
    if (action === "rename") return setMode("rename");
    if (action === "length") return setMode("length");
    if (action === "steps") return setMode("steps");
    // Deleting can't be undone, so the first tap only asks for a second one
    // (for a repeating event: which weeks, which is the second tap).
    if (action === "delete" && !confirmDelete) return setConfirmDelete(true);
    if (action === "queue" && !pickQueue) return setPickQueue(true);
    const err = await onAction(row, action, deleteScope);
    if (err) setError(err);
    else onClose();
  };

  // "Work" Mon–Fri is five events: offer renaming them all at once.
  const sameName = isEventKind(row.kind) ? sameNameEvents(rows, row) : [];
  const saveRename = async () => {
    const bad = renameProblem(newTitle);
    if (bad) return setError(bad);
    const err = await props.onRename(row, newTitle.trim(), renameAll);
    if (err) setError(err);
    else onClose();
  };

  const saveMove = async () => {
    const minute = parseTime(moveTime);
    if (minute === undefined || minute >= DAY) return setError("Use a time like 18:30.");
    const err = await onMove(row, moveDay, minute, canForce, scope);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      {/* Tapping the dimmed area above the sheet closes it. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* An inner Pressable with no onPress swallows taps on the sheet itself. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {row.title}
              </Text>
              <Text style={styles.sub}>
                {DAY_NAMES[dayOf(row.start)]} {clock(row.start)}–{clock(row.end)}
                {repeats ? " · Every week" : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          {mode === "menu" && routine && (
            <View style={styles.checklist}>
              <Text style={styles.label}>
                Checklist · {progressLabel(progress(routine.steps, checks, row.id))}
              </Text>
              {routine.steps.map((step) => {
                const ticked = checks.has(checkKey(row.id, step.id));
                return (
                  <Pressable
                    key={step.id}
                    onPress={async () => {
                      const err = await props.onToggleStep(row.id, step.id);
                      if (err) setError(err);
                    }}
                    style={({ pressed }) => [styles.step, pressed && styles.pressed]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: ticked }}
                  >
                    <View style={[styles.box, ticked && styles.boxOn]}>
                      {ticked && <Ionicons name="checkmark" size={16} color={colors.white} />}
                    </View>
                    <Text style={[styles.stepText, ticked && styles.stepDone]}>{step.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {mode === "menu" && row.kind !== "skipped" && (
            <View style={styles.group}>
              <Text style={styles.label}>Group</Text>
              <CategoryPicker
                categories={categories}
                selected={row.categoryId ?? null}
                onSelect={async (id) => {
                  const err = await onSetCategory(row, id);
                  if (err) setError(err);
                  else onClose();
                }}
                actions={groupActions}
              />
            </View>
          )}

          {mode === "menu" ? (
            <View style={styles.list}>
              {actionsFor(row.kind, row.title, row.done, props.canStop).map((a) => {
                const confirming = a.id === "delete" && confirmDelete;
                if (a.id === "queue" && pickQueue) {
                  return (
                    <View key={a.id} style={styles.scopeRow}>
                      {QUEUE_CHOICES.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => run(c.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Move to queue: ${c.label}`}
                          style={({ pressed }) => [styles.action, styles.scopeButton, pressed && styles.pressed]}
                        >
                          <Text style={[styles.actionText, styles.center]}>{c.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                }
                if (confirming && repeats) {
                  return (
                    <View key={a.id} style={styles.scopeRow}>
                      {SCOPES.map((s) => (
                        <Pressable
                          key={s.value}
                          onPress={() => run("delete", s.value)}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.action, styles.confirm, styles.scopeButton, pressed && styles.pressed]}
                        >
                          <Text style={[styles.actionText, styles.confirmText, styles.center]}>Delete {s.label.toLowerCase()}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => run(a.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.action, confirming && styles.confirm, pressed && styles.pressed]}
                  >
                    <Text style={[styles.actionText, a.destructive && styles.destructive, confirming && styles.confirmText]}>
                      {confirming ? "Tap again to delete" : a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : mode === "steps" && routine ? (
            <View style={styles.move}>
              <Text style={styles.hint}>Changes this routine everywhere it's used.</Text>
              <RoutineEditor
                routine={routine}
                existing={props.routines}
                onCancel={() => setMode("menu")}
                onSave={async (name: string, steps: RoutineStep[]) => {
                  const err = await props.onEditRoutine({ id: routine.id, name, steps });
                  if (err) return err;
                  setMode("menu");
                  return undefined;
                }}
                onDelete={async () => {
                  const err = await props.onDeleteRoutine(routine.id);
                  if (err) return err;
                  onClose();
                  return undefined;
                }}
              />
            </View>
          ) : mode === "length" ? (
            <View style={styles.move}>
              <Text style={styles.label}>Length  {lengthLabel(newLength)}</Text>
              <View style={styles.lengthRow}>
                <Pressable
                  onPress={() => setNewLength((m) => Math.max(15, m - 15))}
                  style={styles.stepButton}
                  accessibilityRole="button"
                  accessibilityLabel="15 minutes shorter"
                >
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Text style={styles.lengthValue}>{lengthLabel(newLength)}</Text>
                <Pressable
                  onPress={() => setNewLength((m) => Math.min(12 * 60, m + 15))}
                  style={styles.stepButton}
                  accessibilityRole="button"
                  accessibilityLabel="15 minutes longer"
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
              <Chips
                options={LENGTH_CHOICES.map((m) => ({ value: m, label: lengthLabel(m) }))}
                isSelected={(m) => m === newLength}
                onPress={setNewLength}
              />
              {isEvent ? (
                repeats && (
                  <>
                    <Text style={styles.label}>Which weeks</Text>
                    <Chips options={SCOPES} isSelected={(s) => s === scope} onPress={setScope} />
                  </>
                )
              ) : (
                <Text style={styles.hint}>Every session of {row.title} gets this length, from this week on.</Text>
              )}
              {lengthProblem(row.start, newLength) && (
                <Text style={styles.error}>{lengthProblem(row.start, newLength)}</Text>
              )}
              <View style={styles.moveButtons}>
                <Pressable onPress={() => setMode("menu")} style={styles.secondary} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    const err = await props.onResize(row, newLength, scope);
                    if (err) setError(err);
                    else onClose();
                  }}
                  disabled={!!lengthProblem(row.start, newLength)}
                  style={[styles.primary, !!lengthProblem(row.start, newLength) && styles.disabled]}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Save length</Text>
                </Pressable>
              </View>
            </View>
          ) : mode === "rename" ? (
            <View style={styles.move}>
              <Text style={styles.label}>New name</Text>
              <TextInput
                style={styles.input}
                value={newTitle}
                onChangeText={(t) => {
                  setNewTitle(t);
                  setError(undefined);
                }}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={saveRename}
              />
              {!isEvent && <Text style={styles.hint}>Renames every session of {row.title}, every week.</Text>}
              {sameName.length > 0 && (
                <Chips
                  options={[
                    { value: "one", label: "Just this one" },
                    { value: "all", label: `All ${sameName.length + 1} called ${row.title}` },
                  ]}
                  isSelected={(v) => (v === "all") === renameAll}
                  onPress={(v) => setRenameAll(v === "all")}
                />
              )}
              <View style={styles.moveButtons}>
                <Pressable onPress={() => setMode("menu")} style={styles.secondary} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
                <Pressable onPress={saveRename} style={styles.primary} accessibilityRole="button">
                  <Text style={styles.primaryText}>Save name</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.move}>
              <Text style={styles.label}>Day</Text>
              <Chips options={DAY_OPTIONS} isSelected={(d) => d === moveDay} onPress={setMoveDay} />
              <Text style={styles.label}>Start  {moveTime}</Text>
              <TimePicker
                value={moveTime}
                onChange={(t) => {
                  setMoveTime(t);
                  setError(undefined);
                }}
              />
              {!warningsOff && isEvent && !problem && clashes.length > 0 && (
                <Notice text={`Overlaps ${summarize(clashes)}.`} onDismiss={() => setWarningsOff(true)} />
              )}
              {!warningsOff && problem && (
                <Notice
                  tone="block"
                  text={problem}
                  onDismiss={() => setWarningsOff(true)}
                />
              )}
              {!warningsOff && !problem && pushedAside.length > 0 && (
                <Notice text={`${summarize(pushedAside)} will move to make room.`} onDismiss={() => setWarningsOff(true)} />
              )}
              {repeats && (
                <>
                  <Text style={styles.label}>Which weeks</Text>
                  <Chips options={SCOPES} isSelected={(s) => s === scope} onPress={setScope} />
                </>
              )}
              <View style={styles.moveButtons}>
                <Pressable onPress={() => setMode("menu")} style={styles.secondary} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={saveMove}
                  disabled={!!problem && !canForce}
                  style={[styles.primary, !!problem && !canForce && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !!problem && !canForce }}
                >
                  <Text style={styles.primaryText}>{canForce ? "Move anyway" : "Move here"}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
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
  list: { gap: 2 },
  action: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  actionText: { fontSize: 16, fontFamily: font.semibold, color: colors.text },
  destructive: { color: colors.danger },
  confirm: { backgroundColor: colors.dangerSoft },
  confirmText: { color: colors.danger },
  pressed: { backgroundColor: colors.surfaceAlt },
  scopeRow: { flexDirection: "row", gap: 8 },
  scopeButton: { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  move: { gap: 10 },
  lengthRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  stepperText: { fontFamily: font.bold, fontSize: 20, color: colors.textSoft },
  lengthValue: { fontFamily: font.heavy, fontSize: 22, color: colors.text, minWidth: 90, textAlign: "center" },
  checklist: { gap: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 8 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.routine,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.routine },
  tick: { color: colors.white, fontFamily: font.heavy, fontSize: 14, lineHeight: 16 },
  stepText: { fontFamily: font.regular, flex: 1, fontSize: 16, color: colors.text },
  stepDone: { color: colors.textFaint, textDecorationLine: "line-through" },
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
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  group: { gap: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  label: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted },
  moveButtons: { flexDirection: "row", gap: 12, marginTop: 6 },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontSize: 16, fontFamily: font.bold, color: colors.textSoft },
  primary: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.accent },
  disabled: { opacity: 0.4 },
  primaryText: { fontSize: 16, fontFamily: font.bold, color: colors.white },
  error: { color: colors.danger, fontFamily: font.semibold },
});
