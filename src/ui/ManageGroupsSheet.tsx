import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Category } from "../db/weekStore";
import { PALETTE, categoryNameProblem, moveInList } from "./categories";

/** What the group picker and this sheet can do with groups. Errors come back as messages. */
export interface GroupActions {
  add: (name: string, color: string) => Promise<{ id: string } | { error: string }>;
  edit: (c: Category) => Promise<string | undefined>;
  remove: (id: string) => Promise<string | undefined>;
  reorder: (ids: string[]) => Promise<string | undefined>;
}

interface Props {
  visible: boolean;
  categories: Category[];
  actions: GroupActions;
  onClose: () => void;
}

/**
 * Manage groups: ↑ ↓ to reorder, tap a group to rename it, change its colour
 * or delete it. Deleting needs a second tap; its events and items stay, with no group.
 */
export function ManageGroupsSheet({ visible, categories, actions, onClose }: Props) {
  // The group being edited (one at a time), with its draft name and colour.
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]!);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();

  const open = (c: Category) => {
    setEditing(c.id === editing ? undefined : c.id);
    setName(c.name);
    setColor(c.color);
    setConfirmDelete(false);
    setError(undefined);
  };

  const close = () => {
    setEditing(undefined);
    onClose();
  };

  const save = async (c: Category) => {
    const problem = categoryNameProblem(name, categories, c.id);
    if (problem) return setError(problem);
    const err = await actions.edit({ id: c.id, name: name.trim(), color });
    if (err) return setError(err);
    setEditing(undefined);
  };

  const remove = async (c: Category) => {
    if (!confirmDelete) return setConfirmDelete(true);
    const err = await actions.remove(c.id);
    if (err) return setError(err);
    setEditing(undefined);
  };

  const move = async (index: number, delta: number) => {
    const ids = moveInList(categories.map((c) => c.id), index, delta);
    const err = await actions.reorder(ids);
    if (err) setError(err);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Manage groups</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </View>
          {categories.length === 0 && <Text style={styles.hint}>No groups yet. Add one with “+ New group”.</Text>}
          {!editing && error && <Text style={styles.error}>{error}</Text>}

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {categories.map((c, i) => (
              <View key={c.id} style={styles.item}>
                <View style={styles.row}>
                  <Pressable
                    onPress={() => open(c)}
                    style={styles.nameButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${c.name}`}
                  >
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <Text style={styles.name} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.edit}>{editing === c.id ? "Close" : "Edit"}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => move(i, -1)}
                    disabled={i === 0}
                    style={[styles.arrow, i === 0 && styles.arrowOff]}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${c.name} up`}
                  >
                    <Text style={styles.arrowText}>↑</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => move(i, 1)}
                    disabled={i === categories.length - 1}
                    style={[styles.arrow, i === categories.length - 1 && styles.arrowOff]}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${c.name} down`}
                  >
                    <Text style={styles.arrowText}>↓</Text>
                  </Pressable>
                </View>

                {editing === c.id && (
                  <View style={styles.form}>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={(t) => {
                        setName(t);
                        setError(undefined);
                      }}
                      returnKeyType="done"
                      onSubmitEditing={() => save(c)}
                      accessibilityLabel="Group name"
                    />
                    <View style={styles.swatches}>
                      {PALETTE.map((p) => (
                        <Pressable
                          key={p}
                          onPress={() => setColor(p)}
                          style={[styles.swatch, { backgroundColor: p }, p === color && styles.swatchOn]}
                          accessibilityRole="button"
                          accessibilityLabel={`Colour ${p}`}
                          accessibilityState={{ selected: p === color }}
                        />
                      ))}
                    </View>
                    {error && <Text style={styles.error}>{error}</Text>}
                    <View style={styles.buttons}>
                      <Pressable
                        onPress={() => remove(c)}
                        style={[styles.secondary, confirmDelete && styles.danger]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.secondaryText, confirmDelete && styles.dangerText]}>
                          {confirmDelete ? "Tap again to delete" : "Delete"}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => save(c)} style={[styles.primary, { backgroundColor: color }]} accessibilityRole="button">
                        <Text style={styles.primaryText}>Save</Text>
                      </Pressable>
                    </View>
                    {confirmDelete && <Text style={styles.hint}>Its events and items stay, just without a group.</Text>}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "800", color: "#111827" },
  link: { fontSize: 16, color: "#5B6CF0", fontWeight: "600" },
  hint: { color: "#6B7280", fontSize: 13 },
  error: { color: "#B91C1C", fontWeight: "600" },
  list: { gap: 8 },
  item: { borderRadius: 12, backgroundColor: "#F8FAFC" },
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  nameButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingLeft: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: "#111827" },
  edit: { fontSize: 14, fontWeight: "600", color: "#5B6CF0", marginRight: 6 },
  arrow: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E5E7EB" },
  arrowOff: { opacity: 0.35 },
  arrowText: { fontSize: 18, fontWeight: "700", color: "#374151" },
  form: { gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
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
  buttons: { flexDirection: "row", gap: 10 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#E5E7EB" },
  secondaryText: { fontWeight: "700", color: "#374151" },
  danger: { backgroundColor: "#FEE2E2" },
  dangerText: { color: "#B91C1C" },
  primary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  primaryText: { fontWeight: "700", color: "#FFFFFF" },
});
