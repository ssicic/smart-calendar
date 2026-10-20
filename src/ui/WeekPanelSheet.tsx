import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { LaterEntry } from "../db/laterStore";
import type { WeekItem, WeekItemKind } from "../db/weekItemsStore";
import { laterHeading } from "./later";
import { isFinished, stepProgress, weekItemProblem, weekSummary } from "./weekItems";
import { colors, font } from "./theme";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  /** e.g. "19. – 25.10.", shown under the title. */
  weekLabel: string;
  items: WeekItem[];
  /** Each returns an error message, or undefined when it worked. */
  onAdd: (kind: WeekItemKind, title: string, target?: number) => Promise<string | undefined>;
  onChange: (item: WeekItem) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<string | undefined>;
  /** Sessions moved to the queue with no week yet. */
  later: LaterEntry[];
  /** False for a past week: nothing new can be planned there. */
  canAddFromLater: boolean;
  onAddFromLater: (id: string) => Promise<string | undefined>;
  onDeleteLater: (id: string) => Promise<string | undefined>;
  onClose: () => void;
  /** Opens the year and month goals. */
  onOpenGoals?: () => void;
}

/** The week's to-do list (tick off) and goals (count up to a target), saved with the week. */
export function WeekPanelSheet(props: Props) {
  const { visible, weekLabel, items, onAdd, onChange, onDelete, onClose, later } = props;
  const [error, setError] = useState<string>();
  // Which row is being renamed, and which one asked "tap again to delete".
  const [editing, setEditing] = useState<{ id: string; title: string }>();
  const [confirmDelete, setConfirmDelete] = useState<string>();

  useEffect(() => {
    if (!visible) {
      setError(undefined);
      setEditing(undefined);
      setConfirmDelete(undefined);
    }
  }, [visible]);

  const run = async (work: Promise<string | undefined>) => {
    const err = await work;
    setError(err);
  };

  const saveRename = async () => {
    if (!editing) return;
    const item = items.find((i) => i.id === editing.id);
    const bad = weekItemProblem(editing.title);
    if (!item || bad) return setError(bad);
    setEditing(undefined);
    if (editing.title.trim() !== item.title) await run(onChange({ ...item, title: editing.title.trim() }));
  };

  const remove = async (id: string, del = onDelete) => {
    // Can't be undone, so the first tap only asks.
    if (confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(undefined);
    await run(del(id));
  };

  const todos = items.filter((i) => i.kind === "todo");
  const goals = items.filter((i) => i.kind === "goal");
  const summary = weekSummary(items);

  const title = (item: WeekItem) =>
    editing?.id === item.id ? (
      <TextInput
        style={[styles.input, styles.flex]}
        value={editing.title}
        onChangeText={(t) => setEditing({ id: item.id, title: t })}
        onSubmitEditing={saveRename}
        onBlur={saveRename}
        autoFocus
        returnKeyType="done"
      />
    ) : (
      <Pressable
        style={styles.flex}
        onPress={() => setEditing({ id: item.id, title: item.title })}
        accessibilityRole="button"
        accessibilityHint="Rename"
      >
        <Text style={[styles.itemText, isFinished(item) && styles.finished]}>{item.title}</Text>
      </Pressable>
    );

  const deleteButton = (item: { id: string; title: string }, del = onDelete) => (
    <Pressable
      onPress={() => remove(item.id, del)}
      hitSlop={8}
      style={[styles.delete, confirmDelete === item.id && styles.deleteConfirm]}
      accessibilityRole="button"
      accessibilityLabel={`Delete ${item.title}`}
    >
      <Text style={styles.deleteText}>{confirmDelete === item.id ? "Delete?" : "×"}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.heading}>This week</Text>
              <Text style={styles.sub}>
                {weekLabel} · {summary.done}/{summary.total} done
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>To-do</Text>
            {todos.map((item) => (
              <View key={item.id} style={styles.row}>
                <Pressable
                  onPress={() => run(onChange({ ...item, done: !item.done }))}
                  style={[styles.box, item.done && styles.boxOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.done }}
                  accessibilityLabel={item.title}
                >
                  {item.done && <Ionicons name="checkmark" size={16} color={colors.white} />}
                </Pressable>
                {title(item)}
                {deleteButton(item)}
              </View>
            ))}
            <AddRow placeholder="Add a to-do…" onAdd={(text) => onAdd("todo", text)} onError={setError} />

            <View style={[styles.sectionRow, styles.sectionGap]}>
              <Text style={styles.section}>Goals</Text>
              {props.onOpenGoals && (
                <Pressable onPress={props.onOpenGoals} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.goalsLink}>Year & month goals ›</Text>
                </Pressable>
              )}
            </View>
            {goals.map((item) => (
              <View key={item.id} style={styles.row}>
                {title(item)}
                <Pressable
                  onPress={() => run(onChange({ ...item, progress: stepProgress(item, -1) }))}
                  style={styles.step}
                  accessibilityRole="button"
                  accessibilityLabel={`One less for ${item.title}`}
                >
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={[styles.count, isFinished(item) && styles.countDone]}>
                  {isFinished(item) ? "✓ " : ""}
                  {item.progress}/{item.target}
                </Text>
                <Pressable
                  onPress={() => run(onChange({ ...item, progress: stepProgress(item, 1) }))}
                  style={styles.step}
                  accessibilityRole="button"
                  accessibilityLabel={`One more for ${item.title}`}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
                {deleteButton(item)}
              </View>
            ))}
            <AddRow
              placeholder="Add a goal, e.g. Run"
              withTarget
              onAdd={(text, target) => onAdd("goal", text, target)}
              onError={setError}
            />

            {later.length > 0 && (
              <>
                <Text style={[styles.section, styles.sectionGap]}>{laterHeading(later.length)}</Text>
                <Text style={styles.hint}>Sessions you moved to the queue for later.</Text>
                {later.map((entry) => (
                  <View key={entry.id} style={styles.row}>
                    <Text style={[styles.itemText, styles.flex]}>{entry.title}</Text>
                    {props.canAddFromLater && (
                      <Pressable
                        onPress={() => run(props.onAddFromLater(entry.id))}
                        style={styles.laterAdd}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${entry.title} to this week`}
                      >
                        <Text style={styles.laterAddText}>Add to this week</Text>
                      </Pressable>
                    )}
                    {deleteButton(entry, props.onDeleteLater)}
                  </View>
                ))}
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A text box with an Add button; for goals also "how many times this week". */
function AddRow(props: {
  placeholder: string;
  withTarget?: boolean;
  onAdd: (text: string, target: number) => Promise<string | undefined>;
  onError: (error: string | undefined) => void;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState(1);

  const add = async () => {
    const bad = weekItemProblem(text);
    if (bad) return props.onError(bad);
    const err = await props.onAdd(text.trim(), target);
    props.onError(err);
    if (!err) {
      setText("");
      setTarget(1);
    }
  };

  return (
    <View style={styles.addWrap}>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={text}
          onChangeText={setText}
          placeholder={props.placeholder}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable onPress={add} style={styles.addButton} accessibilityRole="button">
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
      {props.withTarget && (
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>Times this week</Text>
          <Pressable onPress={() => setTarget((t) => Math.max(1, t - 1))} style={styles.step} accessibilityRole="button">
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.count}>{target}</Text>
          <Pressable onPress={() => setTarget((t) => Math.min(30, t + 1))} style={styles.step} accessibilityRole="button">
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 24,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heading: { fontSize: 20, fontFamily: font.heavy, color: colors.text },
  sub: { marginTop: 2, color: colors.textMuted },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 8, paddingBottom: 16 },
  section: { fontSize: 13, fontFamily: font.bold, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalsLink: { fontFamily: font.bold, fontSize: 13, color: colors.accentStrong },
  sectionGap: { marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.accent },
  tick: { color: colors.white, fontFamily: font.heavy, fontSize: 14, lineHeight: 16 },
  itemText: { fontFamily: font.regular, fontSize: 16, color: colors.text, paddingVertical: 6 },
  finished: { color: colors.textFaint, textDecorationLine: "line-through" },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  stepText: { fontSize: 18, fontFamily: font.bold, color: colors.textSoft },
  count: { minWidth: 36, textAlign: "center", fontFamily: font.bold, color: colors.text, fontVariant: ["tabular-nums"] },
  countDone: { color: colors.success },
  delete: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  deleteConfirm: { backgroundColor: colors.dangerSoft },
  deleteText: { fontSize: 16, fontFamily: font.bold, color: colors.danger },
  addWrap: { gap: 8, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
  },
  addButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  addText: { color: colors.white, fontFamily: font.bold },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  targetLabel: { fontFamily: font.regular, flex: 1, fontSize: 13, color: colors.textMuted },
  error: { color: colors.danger, fontFamily: font.semibold },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  laterAdd: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.accentSoft },
  laterAddText: { color: colors.accent, fontFamily: font.bold, fontSize: 13 },
});
