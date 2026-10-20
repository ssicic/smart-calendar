import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { WeekItem, WeekItemKind } from "../db/weekItemsStore";
import { isFinished, stepProgress, weekItemProblem, weekSummary } from "./weekItems";

interface Props {
  visible: boolean;
  /** e.g. "19. – 25.10.", shown under the title. */
  weekLabel: string;
  items: WeekItem[];
  /** Each returns an error message, or undefined when it worked. */
  onAdd: (kind: WeekItemKind, title: string, target?: number) => Promise<string | undefined>;
  onChange: (item: WeekItem) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<string | undefined>;
  onClose: () => void;
}

/** The week's to-do list (tick off) and goals (count up to a target), saved with the week. */
export function WeekPanelSheet({ visible, weekLabel, items, onAdd, onChange, onDelete, onClose }: Props) {
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

  const remove = async (id: string) => {
    // Can't be undone, so the first tap only asks.
    if (confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(undefined);
    await run(onDelete(id));
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

  const deleteButton = (item: WeekItem) => (
    <Pressable
      onPress={() => remove(item.id)}
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
                  {item.done && <Text style={styles.tick}>✓</Text>}
                </Pressable>
                {title(item)}
                {deleteButton(item)}
              </View>
            ))}
            <AddRow placeholder="Add a to-do…" onAdd={(text) => onAdd("todo", text)} onError={setError} />

            <Text style={[styles.section, styles.sectionGap]}>Goals</Text>
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
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
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
  heading: { fontSize: 20, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 2, color: "#6B7280" },
  link: { fontSize: 16, color: "#5B6CF0", fontWeight: "600" },
  body: { gap: 8, paddingBottom: 16 },
  section: { fontSize: 13, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionGap: { marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#5B6CF0",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: "#5B6CF0" },
  tick: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, lineHeight: 16 },
  itemText: { fontSize: 16, color: "#111827", paddingVertical: 6 },
  finished: { color: "#9CA3AF", textDecorationLine: "line-through" },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  stepText: { fontSize: 18, fontWeight: "700", color: "#374151" },
  count: { minWidth: 36, textAlign: "center", fontWeight: "700", color: "#111827", fontVariant: ["tabular-nums"] },
  countDone: { color: "#22A06B" },
  delete: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  deleteConfirm: { backgroundColor: "#FEE2E2" },
  deleteText: { fontSize: 16, fontWeight: "700", color: "#B91C1C" },
  addWrap: { gap: 8, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: "#111827",
  },
  addButton: { backgroundColor: "#5B6CF0", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  addText: { color: "#FFFFFF", fontWeight: "700" },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  targetLabel: { flex: 1, fontSize: 13, color: "#6B7280" },
  error: { color: "#B91C1C", fontWeight: "600" },
});
