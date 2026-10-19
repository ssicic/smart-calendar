import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { DAY, dayOf } from "../engine";
import { Chips } from "./Chips";
import { actionsFor, type ActionId } from "./itemActions";
import { overlapping, summarize } from "./overlaps";
import { parseTime } from "./quickAdd";
import { TimePicker } from "./TimePicker";
import { Notice } from "./Notice";
import { DAY_NAMES, clock, type WeekRow } from "./weekRows";

interface Props {
  /** The tapped row; undefined hides the sheet. */
  row: WeekRow | undefined;
  /** Everything currently on the calendar, for the overlap warning. */
  rows: WeekRow[];
  /** Each handler returns an error message, or undefined when it worked. */
  onAction: (row: WeekRow, action: ActionId) => Promise<string | undefined>;
  onMove: (row: WeekRow, day: number, minuteOfDay: number, force?: boolean) => Promise<string | undefined>;
  /** Why the row can't move there (live, no saving), or undefined. */
  checkMove: (row: WeekRow, day: number, minuteOfDay: number) => string | undefined;
  onClose: () => void;
}

const DAY_OPTIONS = DAY_NAMES.map((name, i) => ({ value: i, label: name.slice(0, 3) }));

export function ItemActionsSheet({ row, rows, onAction, onMove, checkMove, onClose }: Props) {
  const [mode, setMode] = useState<"menu" | "move">("menu");
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveDay, setMoveDay] = useState(0);
  const [moveTime, setMoveTime] = useState("");
  // After one OK, stop showing warnings until the sheet is opened again.
  const [warningsOff, setWarningsOff] = useState(false);

  // Reset the sheet every time a different row is tapped.
  useEffect(() => {
    setMode("menu");
    setError(undefined);
    setConfirmDelete(false);
    setWarningsOff(false);
    if (row) {
      setMoveDay(dayOf(row.start));
      setMoveTime(clock(row.start));
    }
  }, [row]);

  if (!row) return null;

  // Live check of the picked slot. Flexible sessions push suggestions aside;
  // landing on fixed, rest, locked or done time needs a "Move anyway".
  const pickedStart = parseTime(moveTime);
  const isEvent = row.kind === "fixed" || row.kind === "rest";
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
    const err = await onMove(row, moveDay, minute, canForce);
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
  moveButtons: { flexDirection: "row", gap: 12, marginTop: 6 },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#F1F5F9" },
  secondaryText: { fontSize: 16, fontWeight: "700", color: "#374151" },
  primary: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#5B6CF0" },
  disabled: { opacity: 0.4 },
  primaryText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  error: { color: "#B91C1C", fontWeight: "600" },
});
