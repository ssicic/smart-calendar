import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { postJson } from "../ai/aiClient";
import { offerEasier } from "../engine";
import { draftFromPlan, journeyHeadline, nudgeStep, stepLabel, weekProgress, type JourneyPlanResponse } from "./journeys";
import type { JourneyDraft, JourneyView } from "./useWeek";
import { colors, font, radius } from "./theme";

type Result = Promise<string | undefined>;

interface Props {
  visible: boolean;
  journeys: JourneyView[];
  /** Awake time this week with nothing planned, so the AI sizes the last step to a real week. */
  freeHours: number;
  /** False for a past week: a journey starts in the week on screen. */
  canStart: boolean;
  onStart: (draft: JourneyDraft) => Result;
  onEasier: (journeyId: string) => Result;
  onStop: (journeyId: string) => Result;
  onClose: () => void;
}

const EXAMPLES = ["Get back to the gym", "Read before bed", "Learn Spanish"];

/** Journeys: small weekly steps towards a habit. The AI drafts them, you edit and start. */
export function JourneySheet(props: Props) {
  const { visible, journeys, onClose } = props;
  const [goal, setGoal] = useState("");
  const [draft, setDraft] = useState<JourneyDraft>();
  const [why, setWhy] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmStop, setConfirmStop] = useState<string>();
  // Full screen: swipe the top up (or start typing, so the keyboard covers nothing); down = back, then closed.
  const [full, setFull] = useState(false);
  const insets = useSafeAreaInsets();
  const latest = useRef({ full, onClose });
  latest.current = { full, onClose };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -30) setFull(true);
        else if (g.dy > 30) {
          if (latest.current.full) setFull(false);
          else latest.current.onClose();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) {
      setError(undefined);
      setConfirmStop(undefined);
      setFull(false);
    }
  }, [visible]);

  const run = async (work: Result) => setError(await work);

  const makePlan = async () => {
    if (goal.trim().length < 2) return setError("Type a goal first, e.g. Get back to the gym.");
    setLoading(true);
    setError(undefined);
    try {
      const plan = await postJson<JourneyPlanResponse>("/journey-plan", {
        goal: goal.trim(),
        free_hours_per_week: Math.max(0, Math.round(props.freeHours * 10) / 10),
      });
      setDraft(draftFromPlan(goal, plan));
      setWhy(plan.why);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make a plan. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const start = async () => {
    if (!draft) return;
    const err = await props.onStart(draft);
    if (err) return setError(err);
    setDraft(undefined);
    setGoal("");
    setWhy(undefined);
  };

  const changeStep = (i: number, field: "timesPerWeek" | "minutes", dir: 1 | -1) =>
    draft && setDraft({ ...draft, steps: draft.steps.map((s, k) => (k === i ? nudgeStep(s, field, dir) : s)) });
  const removeStep = (i: number) => draft && setDraft({ ...draft, steps: draft.steps.filter((_, k) => k !== i) });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, full && [styles.fullSheet, { paddingTop: insets.top + 4 }]]} onPress={() => {}}>
          <View {...swipe.panHandlers}>
            <Pressable
              onPress={() => setFull(!full)}
              style={styles.grabber}
              accessibilityRole="button"
              accessibilityLabel={full ? "Make the panel smaller" : "Make the panel full screen"}
            >
              <View style={styles.grabBar} />
            </Pressable>
            <View style={styles.header}>
              <Text style={[styles.heading, styles.flex]}>Journeys</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {journeys.map((v) => {
              const { journey, state } = v;
              const progress = weekProgress(v);
              const id = journey.id;
              return (
                <View key={id} style={styles.card}>
                  <Text style={styles.title}>{journey.goal}</Text>
                  <Text style={styles.meta}>
                    {v.title} · step {state.step + 1} of {journey.steps.length}
                    {state.weekNo > 0 ? ` · week ${state.weekNo}` : ""}
                  </Text>
                  <Text style={[styles.headline, (state.steppedUp || state.finished) && styles.cheer]}>{journeyHeadline(v)}</Text>

                  <View style={styles.ladder}>
                    {journey.steps.map((s, i) => {
                      const past = i < state.step || (state.finished && i === state.step);
                      const now = i === state.step && !state.finished;
                      return (
                        <View key={i} style={styles.ladderRow}>
                          <Text style={[styles.dot, past && styles.dotDone, now && styles.dotNow]}>{past ? "✓" : now ? "●" : "○"}</Text>
                          <Text style={[styles.stepText, now && styles.stepNow, past && styles.stepPast]}>{stepLabel(s)}</Text>
                          {s.note ? <Text style={[styles.meta, styles.flex]} numberOfLines={1}>{s.note}</Text> : null}
                        </View>
                      );
                    })}
                  </View>

                  <Text style={[styles.progress, progress.done && styles.cheer]}>{progress.text}</Text>

                  <View style={styles.inline}>
                    {offerEasier(state) && (
                      <Pressable onPress={() => run(props.onEasier(id))} style={styles.smallButton} accessibilityRole="button">
                        <Text style={styles.smallButtonText}>Make it easier</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => (confirmStop === id ? run(props.onStop(id)) : setConfirmStop(id))}
                      style={[styles.quietButton, confirmStop === id && styles.deleteConfirm]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.deleteText}>{confirmStop === id ? "Tap again: stop (keeps it at this step)" : "Stop journey"}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {!props.canStart ? (
              journeys.length === 0 && <Text style={styles.muted}>No journeys in this week. Go to this week to start one.</Text>
            ) : draft ? (
              <View style={styles.card}>
                <Text style={styles.section}>Your plan</Text>
                <TextInput
                  style={styles.input}
                  value={draft.title}
                  onChangeText={(title) => setDraft({ ...draft, title })}
                  onFocus={() => setFull(true)}
                  accessibilityLabel="Name on the calendar"
                />
                {why && <Text style={styles.meta}>{why}</Text>}
                {draft.steps.map((s, i) => (
                  <View key={i} style={styles.editRow}>
                    <Text style={styles.weekLabel}>Week {i + 1}</Text>
                    <Nudge label={`${s.timesPerWeek}×`} onLess={() => changeStep(i, "timesPerWeek", -1)} onMore={() => changeStep(i, "timesPerWeek", 1)} />
                    <Nudge label={`${s.minutes}m`} onLess={() => changeStep(i, "minutes", -1)} onMore={() => changeStep(i, "minutes", 1)} />
                    {draft.steps.length > 1 && (
                      <Pressable onPress={() => removeStep(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove week ${i + 1}`}>
                        <Text style={styles.deleteText}>×</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                <Text style={styles.meta}>A week that doesn't hit its number just repeats. No streaks to break.</Text>
                <View style={styles.inline}>
                  <Pressable onPress={start} style={[styles.makeButton, styles.flex]} accessibilityRole="button">
                    <Text style={styles.makeText}>Start this week</Text>
                  </Pressable>
                  <Pressable onPress={makePlan} style={styles.quietButton} accessibilityRole="button" disabled={loading}>
                    <Text style={styles.plainText}>{loading ? "Thinking…" : "Ask again"}</Text>
                  </Pressable>
                  <Pressable onPress={() => setDraft(undefined)} style={styles.quietButton} accessibilityRole="button">
                    <Text style={styles.plainText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.section}>{journeys.length > 0 ? "Another journey" : "Start a journey"}</Text>
                <Text style={styles.meta}>Say what you'd like to build up to. You'll get small weekly steps to look over first.</Text>
                <TextInput
                  style={styles.input}
                  value={goal}
                  onChangeText={setGoal}
                  onFocus={() => setFull(true)}
                  placeholder="e.g. Get back to the gym"
                  placeholderTextColor={colors.textFaint}
                  onSubmitEditing={makePlan}
                  returnKeyType="go"
                  maxLength={200}
                />
                <View style={styles.inline}>
                  {EXAMPLES.map((e) => (
                    <Pressable key={e} onPress={() => setGoal(e)} style={styles.chip} accessibilityRole="button">
                      <Text style={styles.chipText}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={makePlan} style={styles.makeButton} accessibilityRole="button" disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.makeText}>Make a plan</Text>}
                </Pressable>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Nudge(props: { label: string; onLess: () => void; onMore: () => void }) {
  return (
    <View style={styles.nudge}>
      <Pressable onPress={props.onLess} style={styles.nudgeButton} accessibilityRole="button" accessibilityLabel="Less">
        <Text style={styles.nudgeText}>−</Text>
      </Pressable>
      <Text style={styles.count}>{props.label}</Text>
      <Pressable onPress={props.onMore} style={styles.nudgeButton} accessibilityRole="button" accessibilityLabel="More">
        <Text style={styles.nudgeText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 16,
    paddingBottom: 24,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 8,
  },
  fullSheet: { height: "100%", maxHeight: "100%", borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  grabber: { alignItems: "center", paddingBottom: 8 },
  grabBar: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  heading: { fontFamily: font.heavy, fontSize: 20, color: colors.text },
  link: { fontFamily: font.semibold, fontSize: 16, color: colors.accentStrong },
  body: { gap: 12, paddingBottom: 16 },
  section: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 8 },
  title: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  headline: { fontFamily: font.medium, fontSize: 14, color: colors.textSoft },
  cheer: { color: colors.successStrong, fontFamily: font.bold },
  ladder: { gap: 4, paddingVertical: 4 },
  ladderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 16, textAlign: "center", fontFamily: font.bold, fontSize: 12, color: colors.textFaint },
  dotDone: { color: colors.success },
  dotNow: { color: colors.accent },
  stepText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, minWidth: 92 },
  stepNow: { color: colors.text, fontFamily: font.bold },
  stepPast: { color: colors.textFaint },
  progress: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 14, color: colors.textFaint },
  inline: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
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
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  chipText: { fontFamily: font.semibold, fontSize: 12, color: colors.textSoft },
  editRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  weekLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textSoft, width: 56 },
  nudge: { flexDirection: "row", alignItems: "center", gap: 4 },
  nudgeButton: { width: 28, height: 28, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  nudgeText: { fontFamily: font.bold, fontSize: 16, color: colors.textSoft },
  count: { minWidth: 36, textAlign: "center", fontFamily: font.bold, fontSize: 14, color: colors.text },
  smallButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.accentSoft },
  smallButtonText: { fontFamily: font.bold, fontSize: 13, color: colors.accentStrong },
  quietButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  deleteConfirm: { backgroundColor: colors.dangerSoft },
  deleteText: { fontFamily: font.bold, fontSize: 13, color: colors.danger },
  plainText: { fontFamily: font.bold, fontSize: 13, color: colors.textSoft },
  makeButton: { alignItems: "center", paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.accent },
  makeText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
  error: { fontFamily: font.semibold, color: colors.danger },
});
