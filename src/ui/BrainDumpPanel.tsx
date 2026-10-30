import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { postJson } from "../ai/aiClient";
import {
  fitReport,
  habitsFromResponse,
  ladderLabel,
  moveHabit,
  type BrainDumpHabit,
  type BrainDumpResponse,
  type FitLevel,
  type Group,
} from "./brainDump";
import { colors, font, radius } from "./theme";

interface Props {
  /** Awake minutes a week left after everything already planned. */
  freeMin: number;
  /** What's planned every week already, so the AI doesn't double it. */
  current: { title: string; hours_per_week: number }[];
  /** How many new journeys may start now. */
  room: number;
  startsNextWeek: boolean;
  onDone: (habits: BrainDumpHabit[]) => Promise<string | undefined>;
  onCancel: () => void;
  /** Typing: the sheet goes full screen so the keyboard covers nothing. */
  onFocus: () => void;
}

const GROUPS: { id: Group; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "next", label: "Next" },
  { id: "later", label: "Later" },
];
const LEVEL_STYLE: Record<FitLevel, { bg: string; fg: string; text: string }> = {
  fine: { bg: colors.successSoft, fg: colors.successStrong, text: "This fits." },
  "a lot": { bg: colors.warnSoft, fg: colors.warnText, text: "It's a lot. Fine if it builds up slowly." },
  "too much": { bg: colors.dangerSoft, fg: colors.danger, text: "All of it is too much for one week." },
};

/** Many wishes at once → now / next / later, checked against your real free time. */
export function BrainDumpPanel(props: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [habits, setHabits] = useState<BrainDumpHabit[]>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const sort = async () => {
    if (text.trim().length < 2) return setError("Write down what you'd like to do, separated by commas or lines.");
    setLoading(true);
    setError(undefined);
    try {
      const res = await postJson<BrainDumpResponse>("/brain-dump", {
        wishes: text.trim(),
        free_hours_per_week: Math.round((props.freeMin / 60) * 10) / 10,
        current: props.current,
        room_now: props.room,
      });
      setHabits(habitsFromResponse(res, props.room));
      setNote(res.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sort it out. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const move = (i: number, group: Group) => {
    if (!habits) return;
    const next = moveHabit(habits, i, group, props.room);
    if (typeof next === "string") return setError(next);
    setError(undefined);
    setHabits(next);
  };

  const done = async () => {
    if (!habits) return;
    const err = await props.onDone(habits);
    if (err) setError(err);
  };

  if (!habits) {
    return (
      <View style={styles.card}>
        <Text style={styles.section}>Brain dump</Text>
        <Text style={styles.meta}>Everything you'd like to do, in any order. You'll see what fits and what waits.</Text>
        <TextInput
          style={[styles.input, styles.multi]}
          value={text}
          onChangeText={setText}
          onFocus={props.onFocus}
          placeholder={"e.g. learn to sew, study for my new job, work out, read more, art history"}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={1000}
          textAlignVertical="top"
        />
        <View style={styles.inline}>
          <Pressable onPress={sort} style={[styles.makeButton, styles.flex]} accessibilityRole="button" disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.makeText}>Sort it out</Text>}
          </Pressable>
          <Pressable onPress={props.onCancel} style={styles.quietButton} accessibilityRole="button">
            <Text style={styles.plainText}>Cancel</Text>
          </Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const fit = fitReport(habits, props.freeMin);
  const level = LEVEL_STYLE[fit.level];
  const nowCount = habits.filter((h) => h.group === "now").length;

  return (
    <View style={styles.card}>
      <View style={[styles.fitBox, { backgroundColor: level.bg }]}>
        <Text style={[styles.fitTitle, { color: level.fg }]}>{level.text}</Text>
        <Text style={styles.fitText}>{fit.start}</Text>
        <Text style={styles.fitText}>{fit.full}</Text>
        {fit.tipsOver && (
          <Text style={styles.fitText}>From {fit.tipsOver} on, it's more than half your free time. Keep those small, or let them wait.</Text>
        )}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {GROUPS.map((g) => {
        const inGroup = habits.map((h, i) => ({ h, i })).filter(({ h }) => h.group === g.id);
        return (
          <View key={g.id} style={styles.group}>
            <Text style={styles.section}>
              {g.label}
              {g.id === "now" ? ` · ${props.startsNextWeek ? "starts Monday" : "starts this week"} · max ${props.room}` : ""}
            </Text>
            {inGroup.length === 0 && (
              <Text style={styles.muted}>{g.id === "now" && props.room === 0 ? "Two journeys are running already." : "Nothing here."}</Text>
            )}
            {inGroup.map(({ h, i }) => (
              <View key={i} style={styles.habit}>
                <Text style={styles.title}>{h.title}</Text>
                <Text style={styles.ladder}>{ladderLabel(h.steps)}</Text>
                {h.wishes.length > 1 && <Text style={styles.meta}>Covers: {h.wishes.join(" + ")}</Text>}
                {h.why ? <Text style={styles.meta}>{h.why}</Text> : null}
                <View style={styles.inline}>
                  {GROUPS.map((target) => (
                    <Pressable
                      key={target.id}
                      onPress={() => move(i, target.id)}
                      style={[styles.chip, h.group === target.id && styles.chipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: h.group === target.id }}
                    >
                      <Text style={[styles.chipText, h.group === target.id && styles.chipTextOn]}>{target.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        );
      })}

      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.inline}>
        <Pressable onPress={done} style={[styles.makeButton, styles.flex]} accessibilityRole="button">
          <Text style={styles.makeText}>{nowCount > 0 ? `Start ${nowCount}, save the rest` : "Save them for later"}</Text>
        </Pressable>
        <Pressable onPress={() => setHabits(undefined)} style={styles.quietButton} accessibilityRole="button">
          <Text style={styles.plainText}>Start over</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  flex: { flex: 1 },
  section: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  meta: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  muted: { fontFamily: font.regular, fontSize: 13, color: colors.textFaint },
  note: { fontFamily: font.medium, fontSize: 14, color: colors.textSoft, lineHeight: 20 },
  input: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multi: { minHeight: 96 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  fitBox: { gap: 4, padding: 10, borderRadius: radius.sm },
  fitTitle: { fontFamily: font.bold, fontSize: 14 },
  fitText: { fontFamily: font.medium, fontSize: 13, color: colors.textSoft },
  group: { gap: 6 },
  habit: { gap: 4, padding: 10, borderRadius: radius.sm, backgroundColor: colors.panel },
  title: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  ladder: { fontFamily: font.semibold, fontSize: 13, color: colors.accentStrong },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.accent },
  chipText: { fontFamily: font.semibold, fontSize: 12, color: colors.textSoft },
  chipTextOn: { color: colors.white },
  makeButton: { alignItems: "center", paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.accent },
  makeText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
  quietButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  plainText: { fontFamily: font.bold, fontSize: 13, color: colors.textSoft },
  error: { fontFamily: font.semibold, color: colors.danger },
});
