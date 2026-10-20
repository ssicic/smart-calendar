import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { planWeek, sleepForDay } from "../engine";
import { addLaterToWeek, type LaterEntry } from "../db/laterStore";
import { insertWeekItem, loadWeekItems, type WeekItem } from "../db/weekItemsStore";
import { loadWeek, type Db } from "../db/weekStore";
import { GroupBars } from "./GroupBars";
import { carryOverCandidates } from "./planNext";
import { addWeeks, plannableFrom, weekRange } from "./weekDate";
import { reviewStats, type ReviewStats } from "./weekReview";
import { rowsByDay } from "./weekRows";
import type { Groups } from "./WeekView";

let counter = 0;
const newId = () => `w${Date.now().toString(36)}${counter++}`;

interface Props {
  db: Db;
  visible: boolean;
  /** The week being planned. */
  nextWeekStart: string;
  /** This week's to-dos and goals (the unfinished ones can be copied over). */
  thisItems: WeekItem[];
  later: LaterEntry[];
  groups: Groups;
  /** Something changed (Later list, items): reload the screen's data. */
  onChanged: () => void;
  onOpenNextWeek: () => void;
  onClose: () => void;
}

interface NextWeek {
  items: WeekItem[];
  stats: ReviewStats;
  plannedMin: number;
  unplaced: number;
}

/**
 * Planning the week ahead: copy over what's unfinished, pull sessions from
 * Later, and see how the week balances out before opening it.
 */
export function PlanSheet(props: Props) {
  const { db, visible, nextWeekStart, thisItems, later, groups, onChanged, onOpenNextWeek, onClose } = props;
  const [next, setNext] = useState<NextWeek>();
  // Which unfinished items to copy (all of them to start with).
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();

  // Plans next week the same way the calendar would (loadWeek + planWeek).
  const load = useCallback(async () => {
    const loaded = await loadWeek(db, nextWeekStart, addWeeks(nextWeekStart, 1));
    const week = {
      ...loaded.week,
      settings: { ...loaded.week.settings, earliestStart: plannableFrom(nextWeekStart, new Date()) },
    };
    const plan = planWeek(week);
    const sleep = Array.from({ length: 7 }, (_, d) => sleepForDay(loaded.sleep, loaded.overrides, d));
    const stats = reviewStats(rowsByDay(week, plan).flat(), sleep, groups);
    setNext({
      items: await loadWeekItems(db, nextWeekStart),
      stats,
      plannedMin: stats.plannedMin,
      unplaced: plan.unplaced.reduce((sum, u) => sum + u.missing, 0),
    });
  }, [db, nextWeekStart, groups]);

  useEffect(() => {
    if (visible) {
      setSkip(new Set());
      setError(undefined);
      load().catch(() => setError("Couldn't load next week."));
    }
  }, [visible, load]);

  const attempt = async (work: () => Promise<void>) => {
    try {
      await work();
      await load();
      onChanged();
    } catch (e) {
      console.error(e);
      setError("Couldn't save that. Please try again.");
    }
  };

  const candidates = next ? carryOverCandidates(thisItems, next.items) : [];
  const chosen = candidates.filter((c) => !skip.has(c.id));

  const copyOver = () =>
    attempt(async () => {
      for (const item of chosen) await insertWeekItem(db, nextWeekStart, { ...item, id: newId() });
    });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.heading}>Plan next week</Text>
              <Text style={styles.sub}>{weekRange(nextWeekStart)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          {!next ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <ScrollView contentContainerStyle={styles.body}>
              <Section title="Carry over from this week">
                {candidates.length === 0 ? (
                  <Text style={styles.muted}>
                    {thisItems.length === 0 ? "No to-dos or goals this week." : "Nothing left to carry over. 🎉"}
                  </Text>
                ) : (
                  <>
                    {candidates.map((item) => {
                      const on = !skip.has(item.id);
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() =>
                            setSkip((s) => {
                              const copy = new Set(s);
                              if (on) copy.add(item.id);
                              else copy.delete(item.id);
                              return copy;
                            })
                          }
                          style={styles.row}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                        >
                          <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
                          <Text style={styles.line}>
                            {item.title}
                            {item.kind === "goal" ? ` (goal, ${item.target}×)` : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={copyOver}
                      disabled={chosen.length === 0}
                      style={[styles.button, chosen.length === 0 && styles.disabled]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.buttonText}>
                        Copy {chosen.length} to next week
                      </Text>
                    </Pressable>
                  </>
                )}
                {next.items.length > 0 && (
                  <Text style={styles.note}>Next week has: {next.items.map((i) => i.title).join(", ")}</Text>
                )}
              </Section>

              <Section title="From Later">
                {later.length === 0 && <Text style={styles.muted}>Later is empty.</Text>}
                {later.map((entry) => (
                  <View key={entry.id} style={styles.row}>
                    <Text style={[styles.line, styles.flex]}>{entry.title}</Text>
                    <Pressable
                      onPress={() => attempt(() => addLaterToWeek(db, entry.id, nextWeekStart))}
                      style={styles.smallButton}
                      accessibilityRole="button"
                    >
                      <Text style={styles.smallButtonText}>Add to next week</Text>
                    </Pressable>
                  </View>
                ))}
              </Section>

              <Section title="How next week looks">
                <Text style={styles.line}>
                  {Math.round(next.plannedMin / 6) / 10}h planned · {next.stats.freePercent}% free
                </Text>
                {next.unplaced > 0 && (
                  <Text style={styles.warn}>
                    {next.unplaced} {next.unplaced === 1 ? "session doesn't" : "sessions don't"} fit. Consider dropping
                    something or moving it to Later.
                  </Text>
                )}
                <GroupBars stats={next.stats} />
              </Section>

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable onPress={onOpenNextWeek} style={styles.button} accessibilityRole="button">
                <Text style={styles.buttonText}>Open next week ›</Text>
              </Pressable>
              <Text style={styles.note}>You can still change anything on the calendar afterwards.</Text>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  heading: { fontSize: 20, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 2, color: "#6B7280" },
  link: { fontSize: 16, color: "#5B6CF0", fontWeight: "600" },
  loading: { padding: 32 },
  body: { gap: 18, paddingBottom: 16 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#5B6CF0",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: "#5B6CF0" },
  tick: { color: "#FFFFFF", fontWeight: "800", fontSize: 13, lineHeight: 15 },
  line: { fontSize: 15, color: "#111827" },
  muted: { fontSize: 15, color: "#9CA3AF" },
  note: { fontSize: 12, color: "#6B7280" },
  warn: { fontSize: 14, color: "#92400E", fontWeight: "600" },
  error: { color: "#B91C1C", fontWeight: "600" },
  button: { backgroundColor: "#5B6CF0", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  smallButton: { backgroundColor: "#EEF2FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallButtonText: { color: "#4338CA", fontWeight: "700", fontSize: 13 },
});
