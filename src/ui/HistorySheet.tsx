import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { LaterEntry } from "../db/laterStore";
import type { Db } from "../db/weekStore";
import { historyCard, recentAverage } from "./history";
import { ReviewSheet } from "./ReviewSheet";
import { colors, font, radius } from "./theme";
import { useHistory, type WeekLog } from "./useHistory";
import { addWeeks, dayDate, weekRange } from "./weekDate";
import type { Groups } from "./WeekView";

interface Props {
  db: Db;
  visible: boolean;
  /** The current week (its Monday): history starts the week before. */
  thisWeek: string;
  todayKey: string;
  groups: Groups;
  /** What waits in Later now (shown in a week's review). */
  later: LaterEntry[];
  onClose: () => void;
}

const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}h`;

/** Past weeks: hours done lately, and one card per week that opens its review. */
export function HistorySheet({ db, visible, thisWeek, todayKey, groups, later, onClose }: Props) {
  const { weeks, loading, hasMore, loadMore } = useHistory(db, visible, thisWeek, todayKey, groups);
  const [open, setOpen] = useState<WeekLog>();

  const chart = weeks.slice(0, 8).reverse(); // oldest on the left
  const max = Math.max(60, ...chart.map((w) => w.stats.doneMin));
  const average = recentAverage(weeks.map((w) => w.stats.doneMin));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.heading, styles.flex]}>Past weeks</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {weeks.length === 0 && !loading && <Text style={styles.muted}>Nothing here yet. Past weeks show up after your first week.</Text>}

            {chart.length > 0 && (
              <View style={styles.chartBox}>
                <Text style={styles.chartTitle}>Hours done lately · about {hours(average)} a week</Text>
                <View style={styles.chart}>
                  {chart.map((w) => (
                    <View key={w.weekStart} style={styles.chartCol}>
                      <Text style={styles.chartValue}>{w.stats.doneMin > 0 ? hours(w.stats.doneMin) : ""}</Text>
                      <View style={styles.chartTrack}>
                        <View style={[styles.chartBar, { height: `${(w.stats.doneMin / max) * 100}%` }]} />
                      </View>
                      <Text style={styles.chartLabel}>{dayDate(w.weekStart, 0)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {weeks.map((w) => {
              const card = historyCard(w.stats, w.items);
              return (
                <Pressable
                  key={w.weekStart}
                  onPress={() => setOpen(w)}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Week ${weekRange(w.weekStart)}, open its review`}
                >
                  <Text style={styles.cardTitle}>{weekRange(w.weekStart)}</Text>
                  {card.quiet ? (
                    <Text style={styles.muted}>Quiet week</Text>
                  ) : (
                    <>
                      <Text style={styles.line}>
                        {hours(card.doneMin)} done of {hours(card.plannedMin)} planned
                        {card.topGroup ? ` · mostly ${card.topGroup}` : ""}
                      </Text>
                      {card.total > 0 && (
                        <Text style={styles.sub}>
                          To-dos & goals: {card.finished} of {card.total}
                        </Text>
                      )}
                    </>
                  )}
                </Pressable>
              );
            })}

            {loading && <ActivityIndicator color={colors.accent} />}
            {hasMore && !loading && (
              <Pressable onPress={loadMore} style={styles.more} accessibilityRole="button">
                <Text style={styles.moreText}>Show older</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      {open && (
        <ReviewSheet
          visible
          weekLabel={weekRange(open.weekStart)}
          nextWeekStart={addWeeks(open.weekStart, 1)}
          stats={open.stats}
          routines={open.routines}
          items={open.items}
          movedOn={open.movedOn}
          later={later}
          onClose={() => setOpen(undefined)}
        />
      )}
    </Modal>
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
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  heading: { fontFamily: font.heavy, fontSize: 20, color: colors.text },
  link: { fontFamily: font.semibold, fontSize: 16, color: colors.accentStrong },
  body: { gap: 10, paddingBottom: 16 },
  muted: { fontFamily: font.regular, fontSize: 15, color: colors.textFaint },
  line: { fontFamily: font.medium, fontSize: 15, color: colors.text },
  sub: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  chartBox: { padding: 12, gap: 8, borderRadius: radius.lg, backgroundColor: colors.panel },
  chartTitle: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 110 },
  chartCol: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  chartValue: { fontFamily: font.semibold, fontSize: 10, color: colors.textMuted, minHeight: 13 },
  chartTrack: { flex: 1, width: "70%", maxWidth: 28, justifyContent: "flex-end" },
  chartBar: { width: "100%", borderRadius: 4, backgroundColor: colors.accent, minHeight: 2 },
  chartLabel: { fontFamily: font.regular, fontSize: 10, color: colors.textFaint },
  card: { padding: 12, gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  pressed: { backgroundColor: colors.panel },
  cardTitle: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  more: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  moreText: { fontFamily: font.bold, fontSize: 14, color: colors.textSoft },
});
