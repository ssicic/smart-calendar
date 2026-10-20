import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { WeekItem } from "../db/weekItemsStore";
import { colors, font, radius } from "./theme";
import { weekItemProblem } from "./weekItems";

/** How many to-dos show before "Show all", so the calendar keeps its room. */
const SHOWN = 4;

interface Props {
  /** "Today", "Tomorrow" or e.g. "Thursday". */
  dayName: string;
  /** This day's to-dos. */
  items: WeekItem[];
  /** Each returns an error message, or undefined when it worked. */
  onAdd: (title: string) => Promise<string | undefined>;
  onChange: (item: WeekItem) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<string | undefined>;
}

/** The day's to-do list in the Day view: tap the box to tick one off, type below to add one. */
export function DayTodos({ dayName, items, onAdd, onChange, onDelete }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string>();

  const add = async () => {
    const bad = weekItemProblem(text);
    if (bad) return setError(bad);
    const err = await onAdd(text.trim());
    setError(err);
    if (!err) setText("");
  };

  const remove = async (id: string) => {
    // Can't be undone, so the first tap only asks.
    if (confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(undefined);
    setError(await onDelete(id));
  };

  const done = items.filter((i) => i.done).length;
  const shown = expanded ? items : items.slice(0, SHOWN);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {dayName}'s to-dos{items.length > 0 ? ` · ${done}/${items.length} done` : ""}
      </Text>
      {shown.map((item) => (
        <View key={item.id} style={styles.row}>
          <Pressable
            onPress={async () => setError(await onChange({ ...item, done: !item.done }))}
            style={[styles.box, item.done && styles.boxOn]}
            hitSlop={6}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.title}
          >
            {item.done && <Ionicons name="checkmark" size={15} color={colors.white} />}
          </Pressable>
          <Text style={[styles.text, item.done && styles.textDone]} numberOfLines={1}>
            {item.title}
          </Text>
          <Pressable
            onPress={() => remove(item.id)}
            hitSlop={8}
            style={[styles.delete, confirmDelete === item.id && styles.deleteConfirm]}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.title}`}
          >
            {confirmDelete === item.id ? (
              <Text style={styles.deleteText}>Delete?</Text>
            ) : (
              <Ionicons name="close" size={16} color={colors.textFaint} />
            )}
          </Pressable>
        </View>
      ))}
      {items.length > SHOWN && (
        <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button">
          <Text style={styles.more}>{expanded ? "Show less" : `Show all ${items.length}`}</Text>
        </Pressable>
      )}
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(undefined);
          }}
          placeholder="Add a to-do…"
          placeholderTextColor={colors.textFaint}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable onPress={add} style={styles.add} accessibilityRole="button" accessibilityLabel="Add to-do">
          <Ionicons name="add" size={20} color={colors.white} />
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  text: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.text },
  textDone: { color: colors.textFaint, textDecorationLine: "line-through" },
  delete: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 },
  deleteConfirm: { backgroundColor: colors.dangerSoft, paddingHorizontal: 8 },
  deleteText: { fontFamily: font.bold, fontSize: 13, color: colors.danger },
  more: { fontFamily: font.semibold, fontSize: 13, color: colors.accentStrong },
  input: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  add: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { fontFamily: font.semibold, fontSize: 13, color: colors.danger },
});
