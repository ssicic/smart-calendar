import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { checkNewItem, type WeekInput } from "../engine";
import {
  EMPTY_FORM,
  parseQuickAdd,
  type AddKind,
  type Importance,
  type ParseResult,
  type QuickAddForm,
  type TimeOfDay,
} from "./quickAdd";
import { Chips } from "./Chips";
import { DAY_NAMES } from "./weekRows";

/** What the sheet hands back to App when the user saves. */
export type QuickAddResult = Extract<ParseResult, { ok: true }>;

interface Props {
  visible: boolean;
  week: WeekInput;
  onSave: (result: QuickAddResult) => void;
  onClose: () => void;
}

let idCounter = 0;
const newId = () => `u${Date.now().toString(36)}${idCounter++}`;

/** `half` = one of two fields side by side in a row. */
function Field(props: { label: string; half?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.field, props.half && styles.half]}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children}
    </View>
  );
}

const KIND_OPTIONS: { value: AddKind; label: string }[] = [
  { value: "flexible", label: "Flexible" },
  { value: "fixed", label: "Fixed" },
  { value: "rest", label: "Rest" },
];
const TIME_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const IMPORTANCE_OPTIONS: { value: Importance; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const DAY_OPTIONS = DAY_NAMES.map((name, i) => ({ value: i, label: name.slice(0, 3) }));

export function QuickAddSheet({ visible, week, onSave, onClose }: Props) {
  // The form's state lives here. Every keystroke calls setForm, and React
  // redraws the sheet with the new values.
  const [form, setForm] = useState<QuickAddForm>(EMPTY_FORM);
  const [error, setError] = useState<string>();
  // Set when a flexible item doesn't fit; the next Save tap adds it anyway.
  const [warning, setWarning] = useState<string>();

  const update = (patch: Partial<QuickAddForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
    setWarning(undefined);
  };

  const close = () => {
    setForm(EMPTY_FORM);
    setError(undefined);
    setWarning(undefined);
    onClose();
  };

  const save = () => {
    const result = parseQuickAdd(form, newId);
    if (!result.ok) return setError(result.error);

    // Capacity guard: warn once before overbooking the week.
    if (result.kind === "flexible" && !warning) {
      const check = checkNewItem(week, result.item);
      if (!check.fits) {
        const over = Math.round(check.overflowMinutes / 6) / 10;
        const swaps = check.swapCandidates.slice(0, 3).map((i) => i.title);
        return setWarning(
          `This puts your week ${over}h over.` +
            (swaps.length ? ` Lower-priority items you could drop: ${swaps.join(", ")}.` : "") +
            " Tap Add anyway to keep it; sessions that don't fit stay unplaced.",
        );
      }
    }

    onSave(result);
    close();
  };

  const isFlexible = form.kind === "flexible";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add to your week</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Chips options={KIND_OPTIONS} isSelected={(v) => v === form.kind} onPress={(kind) => update({ kind })} />

            <Field label="Name">
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(title) => update({ title })}
                placeholder={isFlexible ? "Gym, Spanish, Guitar…" : form.kind === "fixed" ? "Work, Class…" : "Chill, Nap…"}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={save}
              />
            </Field>

            {isFlexible ? (
              <>
                <View style={styles.row}>
                  <Field label="Minutes" half>
                    <TextInput
                      style={styles.input}
                      value={form.durationMin}
                      onChangeText={(durationMin) => update({ durationMin })}
                      keyboardType="number-pad"
                    />
                  </Field>
                  <Field label="Times per week" half>
                    <TextInput
                      style={styles.input}
                      value={form.timesPerWeek}
                      onChangeText={(timesPerWeek) => update({ timesPerWeek })}
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
                <Field label="When">
                  <Chips
                    options={TIME_OPTIONS}
                    isSelected={(v) => v === form.timeOfDay}
                    onPress={(timeOfDay) => update({ timeOfDay })}
                  />
                </Field>
                <Field label="How important">
                  <Chips
                    options={IMPORTANCE_OPTIONS}
                    isSelected={(v) => v === form.importance}
                    onPress={(importance) => update({ importance })}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Days">
                  <Chips
                    options={DAY_OPTIONS}
                    isSelected={(d) => form.days.includes(d)}
                    onPress={(d) =>
                      update({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] })
                    }
                  />
                </Field>
                <View style={styles.row}>
                  <Field label="Start" half>
                    <TextInput
                      style={styles.input}
                      value={form.startTime}
                      onChangeText={(startTime) => update({ startTime })}
                      placeholder="09:00"
                    />
                  </Field>
                  <Field label="End" half>
                    <TextInput
                      style={styles.input}
                      value={form.endTime}
                      onChangeText={(endTime) => update({ endTime })}
                      placeholder="17:00"
                    />
                  </Field>
                </View>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
            {warning && <Text style={styles.warning}>{warning}</Text>}

            <Pressable onPress={save} style={styles.saveButton} accessibilityRole="button">
              <Text style={styles.saveText}>{warning ? "Add anyway" : "Save"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  cancel: { fontSize: 16, color: "#5B6CF0", fontWeight: "600" },
  body: { padding: 16, paddingBottom: 32, gap: 16 },
  row: { flexDirection: "row", gap: 12 },
  field: { gap: 6 },
  half: { flex: 1 },
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
  error: { color: "#B91C1C", fontWeight: "600" },
  warning: { color: "#92400E", backgroundColor: "#FEF3C7", padding: 12, borderRadius: 10, lineHeight: 20 },
  saveButton: { backgroundColor: "#5B6CF0", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
