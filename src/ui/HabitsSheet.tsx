import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Habit } from "../db/habitsStore";
import { Chips } from "./Chips";
import {
  DEFAULT_HABIT_ICON,
  HABIT_ICONS,
  checkKey,
  habitNameProblem,
  onTrack,
  progressLabel,
  targetLabel,
  tooManyHabitsNote,
  weekCount,
} from "./habits";
import { Notice } from "./Notice";
import { colors, font, radius } from "./theme";
import { dayDate, dayKey } from "./weekDate";
import { Backdrop } from "./keyboard";

interface Props {
  visible: boolean;
  weekStart: string;
  todayKey: string;
  habits: Habit[];
  checks: Set<string>;
  onToggle: (habitId: string, day: string) => void;
  onAdd: (h: Omit<Habit, "id">) => Promise<void>;
  onChange: (h: Habit) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const DAY_LETTERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const TARGETS = [7, 6, 5, 4, 3, 2, 1].map((t) => ({ value: t, label: t === 7 ? "Every day" : `${t}×` }));

/** The editor's values: a new habit (no id) or one being changed. */
interface Draft {
  id?: string;
  title: string;
  icon: string;
  targetPerWeek: number;
}

/** The week at a glance: tick any day (forgot yesterday? fine), add and edit habits. */
export function HabitsSheet(props: Props) {
  const { visible, weekStart, todayKey, habits, checks, onToggle, onClose } = props;
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteOff, setNoteOff] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDraft(undefined);
      setError(undefined);
      setConfirmDelete(false);
    }
  }, [visible]);

  const edit = (d: Draft | undefined) => {
    setDraft(d);
    setError(undefined);
    setConfirmDelete(false);
  };

  const save = async () => {
    if (!draft) return;
    const bad = habitNameProblem(draft.title, habits, draft.id);
    if (bad) return setError(bad);
    const h = { title: draft.title.trim(), icon: draft.icon, targetPerWeek: draft.targetPerWeek };
    if (draft.id) await props.onChange({ ...h, id: draft.id });
    else await props.onAdd(h);
    edit(undefined);
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (!confirmDelete) return setConfirmDelete(true);
    await props.onDelete(draft.id);
    edit(undefined);
  };

  const note = tooManyHabitsNote(habits.length);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Backdrop style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View>
              <Text style={styles.heading}>Habits</Text>
              <Text style={styles.sub}>
                {dayDate(weekStart, 0)} – {dayDate(weekStart, 6)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {habits.length === 0 && !draft && (
              <Text style={styles.muted}>
                A few small things you want to do (or skip) most days, like "10k steps" or "No sugar". One tap a day,
                no streaks to break.
              </Text>
            )}

            {habits.map((h) => {
              const n = weekCount(checks, h.id, weekStart);
              const good = onTrack(n, h.targetPerWeek);
              return (
                <View key={h.id} style={styles.habit}>
                  <Pressable
                    onPress={() => edit({ ...h })}
                    style={styles.habitTop}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${h.title}`}
                  >
                    <Ionicons name={h.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.accentStrong} />
                    <Text style={styles.habitTitle} numberOfLines={1}>
                      {h.title}
                    </Text>
                    <Text style={[styles.count, good && styles.countGood]}>{progressLabel(n, h.targetPerWeek)}</Text>
                  </Pressable>
                  <View style={styles.days}>
                    {DAY_LETTERS.map((letter, d) => {
                      const day = dayKey(weekStart, d);
                      const on = checks.has(checkKey(h.id, day));
                      const future = day > todayKey;
                      return (
                        <Pressable
                          key={d}
                          onPress={() => onToggle(h.id, day)}
                          disabled={future}
                          style={styles.dayCell}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on, disabled: future }}
                          accessibilityLabel={`${h.title}, ${letter} ${dayDate(weekStart, d)}`}
                        >
                          <Text style={[styles.dayLetter, day === todayKey && styles.today]}>{letter}</Text>
                          <View style={[styles.dot, on && styles.dotOn, future && styles.dotFuture]}>
                            {on && <Ionicons name="checkmark" size={14} color={colors.white} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {note && !noteOff && <Notice text={note} onDismiss={() => setNoteOff(true)} />}

            {draft ? (
              <View style={styles.editor}>
                <Text style={styles.label}>{draft.id ? "Edit habit" : "New habit"}</Text>
                <TextInput
                  style={styles.input}
                  value={draft.title}
                  onChangeText={(title) => setDraft({ ...draft, title })}
                  placeholder="10k steps, No sugar, Moved today…"
                  autoFocus={!draft.id}
                  returnKeyType="done"
                  onSubmitEditing={save}
                />
                <Text style={styles.label}>Icon</Text>
                <View style={styles.icons}>
                  {HABIT_ICONS.map((o) => (
                    <Pressable
                      key={o.icon}
                      onPress={() => setDraft({ ...draft, icon: o.icon })}
                      style={[styles.iconBox, draft.icon === o.icon && styles.iconOn]}
                      accessibilityRole="button"
                      accessibilityLabel={o.label}
                      accessibilityState={{ selected: draft.icon === o.icon }}
                    >
                      <Ionicons
                        name={o.icon as keyof typeof Ionicons.glyphMap}
                        size={20}
                        color={draft.icon === o.icon ? colors.white : colors.textSoft}
                      />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>How often · {targetLabel(draft.targetPerWeek)}</Text>
                <Chips
                  options={TARGETS}
                  isSelected={(t) => t === draft.targetPerWeek}
                  onPress={(targetPerWeek) => setDraft({ ...draft, targetPerWeek })}
                />
                {error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.buttons}>
                  <Pressable onPress={() => edit(undefined)} style={styles.secondary} accessibilityRole="button">
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={save} style={styles.primary} accessibilityRole="button">
                    <Text style={styles.primaryText}>{draft.id ? "Save" : "Add habit"}</Text>
                  </Pressable>
                </View>
                {draft.id && (
                  <Pressable
                    onPress={remove}
                    style={[styles.delete, confirmDelete && styles.deleteConfirm]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.deleteText}>{confirmDelete ? "Tap again to delete (and its ticks)" : "Delete habit"}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Pressable
                onPress={() => edit({ title: "", icon: DEFAULT_HABIT_ICON, targetPerWeek: 7 })}
                style={styles.add}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color={colors.accentStrong} />
                <Text style={styles.addText}>New habit</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Backdrop>
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
    paddingBottom: 24,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 8,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heading: { fontSize: 20, fontFamily: font.display, color: colors.text },
  sub: { marginTop: 2, fontFamily: font.regular, color: colors.textMuted },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 14, paddingBottom: 16 },
  muted: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  habit: { gap: 6, padding: 12, borderRadius: radius.lg, backgroundColor: colors.panel },
  habitTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  habitTitle: { flex: 1, fontFamily: font.bold, fontSize: 15, color: colors.text },
  count: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  countGood: { color: colors.successStrong },
  days: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: { alignItems: "center", gap: 4, flex: 1 },
  dayLetter: { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted },
  today: { color: colors.accentStrong, fontFamily: font.heavy },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  dotOn: { backgroundColor: colors.success, borderColor: colors.success },
  dotFuture: { opacity: 0.35 },
  editor: { gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  label: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
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
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  iconOn: { backgroundColor: colors.accent },
  error: { fontFamily: font.semibold, color: colors.danger },
  buttons: { flexDirection: "row", gap: 8 },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontFamily: font.bold, fontSize: 15, color: colors.textSoft },
  primary: { flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: colors.accent },
  primaryText: { fontFamily: font.bold, fontSize: 15, color: colors.white },
  delete: { alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  deleteConfirm: { backgroundColor: colors.dangerSoft },
  deleteText: { fontFamily: font.bold, fontSize: 14, color: colors.danger },
  add: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
  },
  addText: { fontFamily: font.bold, fontSize: 15, color: colors.accentStrong },
});
