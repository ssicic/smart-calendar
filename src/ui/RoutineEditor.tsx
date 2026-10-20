import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Routine, RoutineStep } from "../db/weekStore";
import { cleanSteps, routineProblem } from "./routines";

let counter = 0;
const stepId = () => `s${Date.now().toString(36)}${counter++}`;

interface Props {
  /** The routine being edited, or undefined for a new one. */
  routine?: Routine;
  /** Every saved routine, to stop two with the same name. */
  existing: Routine[];
  /** Saves; returns an error message to show, or undefined when it worked. */
  onSave: (name: string, steps: RoutineStep[]) => Promise<string | undefined>;
  onCancel: () => void;
}

/** A routine's name and checklist: one line per step, "+ Add step", × to remove one. */
export function RoutineEditor({ routine, existing, onSave, onCancel }: Props) {
  const [name, setName] = useState(routine?.name ?? "");
  // Steps keep their id while edited, so ticks already made stay attached to them.
  const [steps, setSteps] = useState<{ id?: string; text: string }[]>(
    routine ? routine.steps : [{ text: "" }, { text: "" }, { text: "" }],
  );
  const [error, setError] = useState<string>();

  const setStep = (i: number, text: string) => {
    setSteps((all) => all.map((s, j) => (j === i ? { ...s, text } : s)));
    setError(undefined);
  };

  const save = async () => {
    const clean = cleanSteps(steps, stepId);
    const problem = routineProblem(name, clean, existing, routine?.id);
    if (problem) return setError(problem);
    const err = await onSave(name.trim(), clean);
    if (err) setError(err);
  };

  return (
    <View style={styles.box}>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(undefined);
        }}
        placeholder="Routine name, e.g. Gym prep"
      />
      <Text style={styles.label}>Steps</Text>
      {steps.map((s, i) => (
        <View key={s.id ?? `new${i}`} style={styles.stepRow}>
          <Text style={styles.number}>{i + 1}.</Text>
          <TextInput
            style={[styles.input, styles.stepInput]}
            value={s.text}
            onChangeText={(t) => setStep(i, t)}
            placeholder="A step"
          />
          <Pressable
            onPress={() => setSteps((all) => all.filter((_, j) => j !== i))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove step ${i + 1}`}
          >
            <Text style={styles.remove}>×</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => setSteps((all) => [...all, { text: "" }])} accessibilityRole="button">
        <Text style={styles.add}>+ Add step</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.buttons}>
        <Pressable onPress={onCancel} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>{routine ? "Save routine" : "Add routine"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#F8FAFC" },
  label: { fontSize: 13, fontWeight: "600", color: "#6B7280", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  number: { width: 18, color: "#9CA3AF", fontWeight: "600" },
  stepInput: { flex: 1 },
  remove: { fontSize: 22, color: "#9CA3AF", paddingHorizontal: 4 },
  add: { fontSize: 15, fontWeight: "600", color: "#5B6CF0", paddingVertical: 4 },
  error: { color: "#B91C1C", fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#E5E7EB" },
  secondaryText: { fontWeight: "700", color: "#374151" },
  primary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#D97706" },
  primaryText: { fontWeight: "700", color: "#FFFFFF" },
});
