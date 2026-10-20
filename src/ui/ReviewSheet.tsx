import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { LaterEntry } from "../db/laterStore";
import type { MovedOn } from "../db/reviewStore";
import type { WeekItem } from "../db/weekItemsStore";
import { isFinished } from "./weekItems";
import type { ReviewStats } from "./weekReview";
import { reviewHeadline } from "./weekReview";
import { weekRange } from "./weekDate";
import { GroupBars } from "./GroupBars";
import { colors, font } from "./theme";

interface Props {
  visible: boolean;
  /** e.g. "19. – 25.10." */
  weekLabel: string;
  /** The Monday of the week after, to tell "next week" apart from other weeks. */
  nextWeekStart: string;
  stats: ReviewStats;
  /** Routines on the calendar this week, and how many had every step ticked. */
  routines: { done: number; total: number };
  items: WeekItem[];
  movedOn: MovedOn[];
  later: LaterEntry[];
  /** Opens "Plan next week" (left out for a past week: no button). */
  onPlanNext?: () => void;
  /** Opens "Past weeks" (left out when already looking at history). */
  onPastWeeks?: () => void;
  onClose: () => void;
}

const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}h`;

/** Looking back at a week: what got done, where the time went, what moved on. */
export function ReviewSheet(props: Props) {
  const { visible, weekLabel, nextWeekStart, stats, routines, items, movedOn, later, onPlanNext, onClose } = props;
  const { onPastWeeks } = props;
  const finished = items.filter(isFinished);
  const { sessions } = stats;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.heading}>Week review</Text>
              <Text style={styles.sub}>{weekLabel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.headline}>{reviewHeadline(stats, finished.length)}</Text>

            <View style={styles.tiles}>
              <Tile value={hours(stats.doneMin)} label="done" color={colors.successStrong} />
              <Tile value={hours(stats.plannedMin)} label="planned" color={colors.accentStrong} />
              <Tile value={`${stats.freePercent}%`} label="free time" color={colors.textSoft} />
            </View>

            <Section title="Flexible sessions">
              <Text style={styles.line}>
                {sessions.total === 0
                  ? "None this week."
                  : `${sessions.done} of ${sessions.total} done (${hours(sessions.doneMin)} of ${hours(sessions.totalMin)})`}
              </Text>
              {sessions.total > 0 && <Bar part={sessions.done} whole={sessions.total} color={colors.success} />}
              {routines.total > 0 && (
                <Text style={styles.line}>
                  Routines: {routines.done} of {routines.total} fully ticked off
                </Text>
              )}
            </Section>

            <Section title={`To-dos & goals${items.length > 0 ? ` · ${finished.length} of ${items.length}` : ""}`}>
              {items.length === 0 && <Text style={styles.muted}>No to-dos or goals this week.</Text>}
              {items.map((item) => (
                <Text key={item.id} style={[styles.line, !isFinished(item) && styles.muted]}>
                  {isFinished(item) ? "✓" : "○"} {item.title}
                  {item.kind === "goal" ? ` (${item.progress}/${item.target})` : ""}
                </Text>
              ))}
            </Section>

            <Section title="Time by group">
              <GroupBars stats={stats} />
            </Section>

            <Section title="Moved on">
              {movedOn.length === 0 && <Text style={styles.muted}>Nothing was moved to the queue this week.</Text>}
              {movedOn.map((m, i) => (
                <Text key={i} style={styles.line}>
                  {m.title} → {m.targetWeek === null ? "Later" : m.targetWeek === nextWeekStart ? "next week" : weekRange(m.targetWeek)}
                </Text>
              ))}
              {later.length > 0 && (
                <Text style={styles.note}>Waiting in Later now: {later.map((l) => l.title).join(", ")}</Text>
              )}
            </Section>
            {onPlanNext && (
              <Pressable onPress={onPlanNext} style={styles.planButton} accessibilityRole="button">
                <Text style={styles.planText}>Plan next week ›</Text>
              </Pressable>
            )}
            {onPastWeeks && (
              <Pressable onPress={onPastWeeks} style={styles.pastLink} accessibilityRole="button">
                <Text style={styles.pastText}>Past weeks ›</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
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

function Bar({ part, whole, color }: { part: number; whole: number; color: string }) {
  return (
    <View style={styles.groupTrack}>
      <View style={[styles.groupFill, { width: `${whole > 0 ? (part / whole) * 100 : 0}%`, backgroundColor: color }]} />
    </View>
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  heading: { fontSize: 20, fontFamily: font.heavy, color: colors.text },
  sub: { marginTop: 2, color: colors.textMuted },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 18, paddingBottom: 16 },
  headline: { fontFamily: font.regular, fontSize: 16, color: colors.text, lineHeight: 22 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.panel, alignItems: "center" },
  tileValue: { fontSize: 22, fontFamily: font.heavy, fontVariant: ["tabular-nums"] },
  tileLabel: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 13, fontFamily: font.bold, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  line: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 15, color: colors.textFaint },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  planButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  pastLink: { alignSelf: "center", paddingVertical: 6 },
  pastText: { fontFamily: font.bold, fontSize: 15, color: colors.accentStrong },
  planText: { color: colors.white, fontSize: 16, fontFamily: font.bold },
  groupTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  groupFill: { height: 8, borderRadius: 4 },
});
