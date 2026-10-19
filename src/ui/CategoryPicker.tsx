import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Category } from "../db/weekStore";
import { PALETTE, newCategoryProblem, unusedColor } from "./categories";

interface Props {
  categories: Category[];
  /** The picked group, or null for none. */
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
  /** Saves a new group; returns its id, or an error message. */
  onAdd: (name: string, color: string) => Promise<{ id: string } | { error: string }>;
}

/**
 * Optional activity group: tap a group to pick it, tap it again to clear.
 * "+ New group" opens a small form (name + colour) right here.
 */
export function CategoryPicker({ categories, selected, onSelect, onAdd }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]!);
  const [error, setError] = useState<string>();

  const open = () => {
    setAdding(true);
    setName("");
    setColor(unusedColor(categories));
    setError(undefined);
  };

  const save = async () => {
    const problem = newCategoryProblem(name, categories);
    if (problem) return setError(problem);
    const r = await onAdd(name.trim(), color);
    if ("error" in r) return setError(r.error);
    setAdding(false);
    onSelect(r.id);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {categories.map((c) => {
          const on = c.id === selected;
          return (
            <Pressable
              key={c.id}
              onPress={() => onSelect(on ? null : c.id)}
              style={[styles.chip, on && { backgroundColor: c.color }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.dot, { backgroundColor: on ? "#FFFFFF" : c.color }]} />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
            </Pressable>
          );
        })}
        {!adding && (
          <Pressable onPress={open} style={[styles.chip, styles.newChip]} accessibilityRole="button">
            <Text style={styles.newText}>+ New group</Text>
          </Pressable>
        )}
      </View>

      {adding && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(undefined);
            }}
            placeholder="Music, Family, Side project…"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchOn]}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: c === color }}
              />
            ))}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttons}>
            <Pressable onPress={() => setAdding(false)} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.primary, { backgroundColor: color }]} accessibilityRole="button">
              <Text style={styles.primaryText}>Add group</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  chipTextOn: { color: "#FFFFFF" },
  newChip: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", borderStyle: "dashed" },
  newText: { fontSize: 14, fontWeight: "600", color: "#5B6CF0" },
  form: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: "#F8FAFC" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  swatchOn: { borderWidth: 3, borderColor: "#111827" },
  error: { color: "#B91C1C", fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 10 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#E5E7EB" },
  secondaryText: { fontWeight: "700", color: "#374151" },
  primary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  primaryText: { fontWeight: "700", color: "#FFFFFF" },
});
