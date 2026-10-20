import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Category } from "../db/weekStore";
import { PALETTE, categoryNameProblem, unusedColor } from "./categories";
import { ManageGroupsSheet, type GroupActions } from "./ManageGroupsSheet";
import { colors, font, radius } from "./theme";

interface Props {
  categories: Category[];
  /** The picked group, or null for none. */
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
  /** Add, edit, delete and reorder groups. */
  actions: GroupActions;
}

/**
 * Optional activity group: tap a group to pick it, tap it again to clear.
 * "+ New group" opens a small form (name + colour) right here; "Edit" opens
 * Manage groups (rename, recolour, delete, reorder).
 */
export function CategoryPicker({ categories, selected, onSelect, actions }: Props) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
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
    const problem = categoryNameProblem(name, categories);
    if (problem) return setError(problem);
    const r = await actions.add(name.trim(), color);
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
              <View style={[styles.dot, { backgroundColor: on ? colors.white : c.color }]} />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
            </Pressable>
          );
        })}
        {!adding && (
          <Pressable onPress={open} style={[styles.chip, styles.newChip]} accessibilityRole="button">
            <Text style={styles.newText}>+ New group</Text>
          </Pressable>
        )}
        {!adding && categories.length > 0 && (
          <Pressable
            onPress={() => setManaging(true)}
            style={[styles.chip, styles.newChip]}
            accessibilityRole="button"
            accessibilityLabel="Manage groups"
          >
            <Text style={styles.newText}>Edit</Text>
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
      <ManageGroupsSheet
        visible={managing}
        categories={categories}
        actions={actions}
        onClose={() => setManaging(false)}
      />
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
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: 14, fontFamily: font.semibold, color: colors.textSoft },
  chipTextOn: { color: colors.white },
  newChip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: "dashed" },
  newText: { fontSize: 14, fontFamily: font.semibold, color: colors.accent },
  form: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.panel },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.white,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  swatchOn: { borderWidth: 3, borderColor: colors.text },
  error: { color: colors.danger, fontFamily: font.semibold },
  buttons: { flexDirection: "row", gap: 10 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: colors.border },
  secondaryText: { fontFamily: font.bold, color: colors.textSoft },
  primary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  primaryText: { fontFamily: font.bold, color: colors.white },
});
