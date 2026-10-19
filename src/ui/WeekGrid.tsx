import { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DAY, type DaySleep } from "../engine";
import { DAY_NAMES, clock, type WeekRow } from "./weekRows";
import { layoutDay, visibleHours } from "./gridLayout";
import { shortDate } from "./weekDate";
import { KIND_STYLE } from "./WeekView";

const HOUR_PX = 48; // height of one hour
const PX_PER_MIN = HOUR_PX / 60;
const GUTTER = 34; // hour labels on the left

interface Props {
  days: WeekRow[][];
  weekStart: string;
  /** Sleep for each day (0 = Monday): drawn as grey areas you can tap. */
  sleep: DaySleep[];
  windDownMin: number;
  onPressSleep: (day: number, field: "wake" | "bed") => void;
  onPressRow: (row: WeekRow) => void;
  /** Today's column (0 = Monday) and minutes since midnight, if this is the current week. */
  today?: { day: number; minute: number };
  footer?: React.ReactNode;
}

/** Calendar view: one column per day, blocks as tall as they are long. */
export function WeekGrid({ days, weekStart, sleep, windDownMin, onPressSleep, onPressRow, today, footer }: Props) {
  // Show an hour of sleep on each side, so there's always something to tap.
  const earliestWake = Math.min(...sleep.map((s) => s.wake));
  const latestBed = Math.max(...sleep.map((s) => Math.min(s.bed, DAY)));
  const { from, to } = visibleHours(days, earliestWake - 60, latestBed + 60);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  // useMemo: only redo the overlap layout when the rows change.
  const laidOut = useMemo(() => days.map(layoutDay), [days]);

  // Start scrolled to an hour before now (or the top), so "what's next" is visible.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const target = today ? Math.max(from, Math.floor(today.minute / 60) - 1) : from;
    scrollRef.current?.scrollTo({ y: (target - from) * HOUR_PX, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const y = (minuteOfDay: number) => (minuteOfDay - from * 60) * PX_PER_MIN;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={{ width: GUTTER }} />
        {DAY_NAMES.map((name, d) => (
          <View key={d} style={[styles.headerCell, today?.day === d && styles.todayHeader]}>
            <Text style={[styles.headerDay, today?.day === d && styles.todayText]}>{name.slice(0, 2)}</Text>
            <Text style={[styles.headerDate, today?.day === d && styles.todayText]}>
              {shortDate(weekStart, d).split(" ")[0]}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.grid, { height: hours.length * HOUR_PX }]}>
          <View style={{ width: GUTTER }}>
            {hours.map((hr) => (
              <Text key={hr} style={[styles.hourLabel, { top: (hr - from) * HOUR_PX - 7 }]}>
                {String(hr).padStart(2, "0")}
              </Text>
            ))}
          </View>

          {laidOut.map((blocks, d) => (
            <View key={d} style={[styles.column, today?.day === d && styles.todayColumn]}>
              {hours.map((hr) => (
                <View key={hr} style={[styles.hourLine, { top: (hr - from) * HOUR_PX }]} />
              ))}

              {sleep[d] && (
                <SleepZones
                  s={sleep[d]}
                  windDownMin={windDownMin}
                  top={y(from * 60)}
                  bottom={y(to * 60)}
                  y={y}
                  onPress={(field) => onPressSleep(d, field)}
                />
              )}

              {blocks.map((b) => {
                const k = KIND_STYLE[b.row.kind];
                const height = Math.max(16, (b.endMin - b.startMin) * PX_PER_MIN - 2);
                return (
                  <Pressable
                    key={b.row.id}
                    onPress={() => onPressRow(b.row)}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.row.title}, ${DAY_NAMES[d]} ${clock(b.row.start)} to ${clock(b.row.end)}`}
                    style={({ pressed }) => [
                      styles.block,
                      {
                        top: y(b.startMin) + 1,
                        height,
                        left: `${(b.lane / b.lanes) * 100}%`,
                        width: `${100 / b.lanes}%`,
                        backgroundColor: k.bg,
                        borderLeftColor: k.bar,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={styles.blockTitle}
                      // Narrow side-by-side blocks: one line with "…" instead of breaking words.
                      numberOfLines={b.lanes > 1 ? 1 : Math.max(1, Math.floor(height / 13))}
                    >
                      {b.row.title}
                    </Text>
                  </Pressable>
                );
              })}

              {today?.day === d && today.minute >= from * 60 && today.minute <= to * 60 && (
                <View style={[styles.nowLine, { top: y(today.minute) }]} />
              )}
            </View>
          ))}
        </View>
        {footer && <View style={styles.footer}>{footer}</View>}
      </ScrollView>
    </View>
  );
}

/**
 * Grey areas for the night: before wake-up and after bedtime, plus a lighter
 * wind-down band before bed. Tapping them changes that day's times.
 */
function SleepZones(props: {
  s: DaySleep;
  windDownMin: number;
  top: number;
  bottom: number;
  y: (minuteOfDay: number) => number;
  onPress: (field: "wake" | "bed") => void;
}) {
  const { s, windDownMin, top, bottom, y, onPress } = props;
  const wakeY = Math.max(top, y(s.wake));
  const bedY = Math.min(bottom, y(Math.min(s.bed, DAY)));
  const windY = Math.min(bottom, y(Math.min(s.bed - windDownMin, DAY)));
  // Bedtime after midnight: no evening area left on this day, so show a small tab.
  const bedTab = s.bed >= DAY;
  return (
    <>
      {wakeY > top && (
        <Pressable
          onPress={() => onPress("wake")}
          accessibilityRole="button"
          accessibilityLabel={`Wake-up ${clock(s.wake)}. Tap to change.`}
          style={[styles.sleep, { top, height: wakeY - top, justifyContent: "flex-end" }]}
        >
          <Text style={[styles.sleepLabel, s.wakeChanged && styles.changed]}>{clock(s.wake)}</Text>
        </Pressable>
      )}
      {windY < bedY && (
        <Pressable
          onPress={() => onPress("bed")}
          accessibilityRole="button"
          accessibilityLabel="Wind-down before bed. Tap to change bedtime."
          style={[styles.windDown, { top: windY, height: bedY - windY }]}
        />
      )}
      {bedTab ? (
        <Pressable
          onPress={() => onPress("bed")}
          accessibilityRole="button"
          accessibilityLabel={`Bedtime ${clock(s.bed % DAY)}. Tap to change.`}
          style={[styles.sleep, { top: bottom - 18, height: 18 }]}
        >
          <Text style={[styles.sleepLabel, s.bedChanged && styles.changed]}>{clock(s.bed % DAY)}</Text>
        </Pressable>
      ) : (
        bedY < bottom && (
          <Pressable
            onPress={() => onPress("bed")}
            accessibilityRole="button"
            accessibilityLabel={`Bedtime ${clock(s.bed)}. Tap to change.`}
            style={[styles.sleep, { top: bedY, height: bottom - bedY }]}
          >
            <Text style={[styles.sleepLabel, s.bedChanged && styles.changed]}>{clock(s.bed)}</Text>
          </Pressable>
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sleep: { position: "absolute", left: 0, right: 0, backgroundColor: "#E9ECF3", paddingVertical: 2 },
  windDown: { position: "absolute", left: 0, right: 0, backgroundColor: "#F3F4F8" },
  sleepLabel: { fontSize: 9, fontWeight: "700", color: "#8A93A8", textAlign: "center", fontVariant: ["tabular-nums"] },
  changed: { color: "#5B6CF0" },
  wrap: { flex: 1 },
  headerRow: { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  headerCell: { flex: 1, alignItems: "center", paddingVertical: 2, borderRadius: 8 },
  headerDay: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  headerDate: { fontSize: 15, fontWeight: "700", color: "#111827" },
  todayHeader: { backgroundColor: "#5B6CF0" },
  todayText: { color: "#FFFFFF" },
  scrollContent: { paddingTop: 8, paddingBottom: 110, paddingHorizontal: 4 },
  grid: { flexDirection: "row" },
  hourLabel: { position: "absolute", right: 4, fontSize: 10, color: "#9CA3AF", fontVariant: ["tabular-nums"] },
  column: { flex: 1, borderLeftWidth: 1, borderLeftColor: "#F1F5F9" },
  todayColumn: { backgroundColor: "#F8FAFF" },
  hourLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#F1F5F9" },
  block: {
    position: "absolute",
    borderRadius: 5,
    borderLeftWidth: 3,
    paddingHorizontal: 2,
    paddingVertical: 1,
    overflow: "hidden",
  },
  blockTitle: { fontSize: 10, lineHeight: 13, fontWeight: "600", color: "#111827" },
  pressed: { opacity: 0.6 },
  nowLine: { position: "absolute", left: -1, right: 0, height: 2, backgroundColor: "#EF4444" },
  footer: { marginTop: 16, paddingHorizontal: 12 },
});
