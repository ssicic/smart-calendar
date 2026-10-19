import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DAY, dayOf } from "../engine";
import { Chips } from "./Chips";
import { actionsFor, type ActionId } from "./itemActions";
import { parseTime } from "./quickAdd";
import { DAY_NAMES, clock, type WeekRow } from "./weekRows";

interface Props {
  /** The tapped row; undefined hides the sheet. */
  row: WeekRow | undefined;
  /** Each handler returns an error message, or undefined when it worked. */
  onAction: (row: WeekRow, action: ActionId) => Promise<string | undefined>;
  onMove: (row: WeekRow, day: number, minuteOfDay: number) => Promise<string | undefined>;
  onClose: () => void;
}

const DAY_OPTIONS = DAY_NAMES.map((name, i) => ({ value: i, label: name.slice(0, 3) }));

export function ItemActionsSheet({ row, onAction, onMove, onClose }: Props) {
  const [mode, setMode] = useState<"menu" | "move">("menu");
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveDay, setMoveDay] = useState(0);
  const [moveTime, setMoveTime] = useState("");

  // Reset the sheet every time a different row is tapped.
  useEffect(() => {
    setMode("menu");
    setError(undefined);
    setConfirmDelete(false);
    if (row) {
      setMoveDay(dayOf(row.start));
      setMoveTime(clock(row.start));
    }
  }, [row]);

  if (!row) return null;

  const run = async (action: ActionId) => {
    if (action === "move") return setMode("move");
    // Deleting can't be undone, so the first tap only asks for a second one.
    if (action === "delete" && !confirmDelete) return setConfirmDelete(true);
    const err = await onAction(row, action);
    if (err) setError(err);
    else onClose();
  };

  const saveMove = async () => {
    const minute = parseTime(moveTime);
    if (minute === undefined || minute >= DAY) return setError("Use a time like 18:30.");
    const err = await onMove(row, moveDay, minute);
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
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          {mode === "menu" ? (
            <View style={styles.list}>
              {actionsFor(row.kind, row.title).map((a) => {
                const confirming = a.id === "delete" && confirmDelete;
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
          ) : (
            <View style={styles.move}>
              <Text style={styles.label}>Day</Text>
              <Chips options={DAY_OPTIONS} isSelected={(d) => d === moveDay} onPress={setMoveDay} />
              <Text style={styles.label}>Start time</Text>
              <TextInput
                style={styles.input}
                value={moveTime}
                onChangeText={(t) => {
                  setMoveTime(t);
                  setError(undefined);
                }}
                placeholder="18:30"
                onSubmitEditing={saveMove}
              />
              <View style={styles.moveButtons}>
                <Pressable onPress={() => setMode("menu")} style={styles.secondary} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
                <Pressable onPress={saveMove} style={styles.primary} accessibilityRole="button">
                  <Text style={styles.primaryText}>Move here</Text>
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
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 2, color: "#6B7280" },
  link: { fontSize: 16, color: "#5B6CF0", fontWeight: "600" },
  list: { gap: 2 },
  action: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  actionText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  destructive: { color: "#B91C1C" },
  confirm: { backgroundColor: "#FEE2E2" },
  confirmText: { color: "#B91C1C" },
  pressed: { backgroundColor: "#F1F5F9" },
  move: { gap: 10 },
  label: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
  },
  moveButtons: { flexDirection: "row", gap: 12, marginTop: 6 },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#F1F5F9" },
  secondaryText: { fontSize: 16, fontWeight: "700", color: "#374151" },
  primary: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#5B6CF0" },
  primaryText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  error: { color: "#B91C1C", fontWeight: "600" },
});
