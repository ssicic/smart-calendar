import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DAY, type DaySleep } from "../engine";
import { DAY_NAMES, clock, type WeekRow } from "./weekRows";
import { canDrag, dropTarget, layoutDay, visibleHours, type PlacedBlock } from "./gridLayout";
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
  /** Holding an empty half-hour: add something there. */
  onHoldSlot: (day: number, minuteOfDay: number) => void;
  /** A block was dragged to another day and/or time. */
  onDropRow: (row: WeekRow, day: number, minuteOfDay: number) => void;
  /** Today's column (0 = Monday) and minutes since midnight, if this is the current week. */
  today?: { day: number; minute: number };
  footer?: React.ReactNode;
}

/** Calendar view: one column per day, blocks as tall as they are long. */
export function WeekGrid(props: Props) {
  const { days, weekStart, sleep, windDownMin, onPressSleep, onPressRow, onHoldSlot, onDropRow, today, footer } = props;
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

  // Width of one day column, measured once the grid is drawn (needed to turn
  // a sideways finger movement into "how many days").
  const [columnWidth, setColumnWidth] = useState(40);
  // The day of the block being dragged. While set, the list stops scrolling
  // so the finger moves the block, and that column is drawn above the others.
  const [dragDay, setDragDay] = useState<number>();

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

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} scrollEnabled={dragDay === undefined}>
        <View
          style={[styles.grid, { height: hours.length * HOUR_PX }]}
          onLayout={(e) => setColumnWidth((e.nativeEvent.layout.width - GUTTER) / 7)}
        >
          <View style={{ width: GUTTER }}>
            {hours.map((hr) => (
              <Text key={hr} style={[styles.hourLabel, { top: (hr - from) * HOUR_PX - 7 }]}>
                {String(hr).padStart(2, "0")}
              </Text>
            ))}
          </View>

          {laidOut.map((blocks, d) => (
            <View
              key={d}
              style={[styles.column, today?.day === d && styles.todayColumn, dragDay === d && styles.dragColumn]}
            >
              {/* Half-hour slots under everything else: hold one to add an event there.
                  The top border of each full hour draws the hour line. */}
              {hours.flatMap((hr) =>
                [0, 30].map((m) => (
                  <Pressable
                    key={hr * 60 + m}
                    onLongPress={() => onHoldSlot(d, hr * 60 + m)}
                    accessibilityLabel={`${DAY_NAMES[d]} ${clock(hr * 60 + m)}. Hold to add.`}
                    style={({ pressed }) => [
                      styles.slot,
                      m === 0 && styles.hourLine,
                      { top: y(hr * 60 + m) },
                      pressed && styles.slotHeld,
                    ]}
                  />
                )),
              )}

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

              {blocks.map((b) => (
                <DraggableBlock
                  key={b.row.id}
                  block={b}
                  day={d}
                  top={y(b.startMin) + 1}
                  columnWidth={columnWidth}
                  onPress={onPressRow}
                  onDrop={onDropRow}
                  onArm={setDragDay}
                />
              ))}

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
 * One block on the grid. Tap: the actions sheet. Hold, then drag: move it to
 * another day or time; it snaps to the nearest column and quarter hour.
 *
 * PanResponder is React Native's built-in gesture helper: it reports how far
 * the finger has moved (dx, dy) since it touched down. Holding first (instead
 * of dragging right away) keeps normal scrolling working.
 */
function DraggableBlock(props: {
  block: PlacedBlock;
  day: number;
  top: number;
  columnWidth: number;
  onPress: (row: WeekRow) => void;
  onDrop: (row: WeekRow, day: number, minuteOfDay: number) => void;
  /** The block's day while it is picked up, undefined when put down. */
  onArm: (day: number | undefined) => void;
}) {
  const { block: b, day, top } = props;
  const [offset, setOffset] = useState<{ dx: number; dy: number }>();
  // The gesture handlers are made once, so they read the latest props via a ref.
  const latest = useRef(props);
  latest.current = props;
  const armed = useRef(false); // set by holding the block
  const active = useRef(false); // set once the finger starts dragging it

  const pan = useRef(
    PanResponder.create({
      // Take over the touch from the Pressable (and the list) only once held.
      onMoveShouldSetPanResponderCapture: () => armed.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        active.current = true;
      },
      onPanResponderMove: (_, g) => setOffset({ dx: g.dx, dy: g.dy }),
      onPanResponderRelease: (_, g) => {
        const p = latest.current;
        const target = dropTarget(
          { day: p.day, startMin: p.block.startMin, endMin: p.block.endMin },
          g.dx,
          g.dy,
          p.columnWidth,
          PX_PER_MIN,
        );
        const moved = target.day !== p.day || target.minute !== p.block.startMin;
        if (moved) p.onDrop(p.block.row, target.day, target.minute);
        finish();
      },
      onPanResponderTerminate: () => finish(),
    }),
  ).current;

  function finish() {
    armed.current = false;
    active.current = false;
    setOffset(undefined);
    latest.current.onArm(undefined);
  }

  const k = KIND_STYLE[b.row.kind];
  const height = Math.max(16, (b.endMin - b.startMin) * PX_PER_MIN - 2);
  // Where it would land right now, shown in a small label while dragging.
  const target =
    offset &&
    dropTarget({ day, startMin: b.startMin, endMin: b.endMin }, offset.dx, offset.dy, props.columnWidth, PX_PER_MIN);
  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.blockSlot,
        { top, height, left: `${(b.lane / b.lanes) * 100}%`, width: `${100 / b.lanes}%` },
        offset && styles.lifted,
        offset && { transform: [{ translateX: offset.dx }, { translateY: offset.dy }] },
      ]}
    >
      <Pressable
        onPress={() => props.onPress(b.row)}
        onLongPress={
          canDrag(b.row)
            ? () => {
                armed.current = true;
                setOffset({ dx: 0, dy: 0 });
                props.onArm(day);
              }
            : undefined
        }
        onPressOut={() => {
          // Held, then let go without dragging: put it back down. (Wait a
          // moment: when a drag starts, the Pressable also gets a press-out.)
          setTimeout(() => {
            if (armed.current && !active.current) finish();
          }, 0);
        }}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${b.row.title}, ${DAY_NAMES[day]} ${clock(b.row.start)} to ${clock(b.row.end)}`}
        style={({ pressed }) => [
          styles.block,
          { backgroundColor: k.bg, borderLeftColor: k.bar },
          pressed && !offset && styles.pressed,
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
      {target && (
        <View style={styles.dropLabel} pointerEvents="none">
          <Text style={styles.dropLabelText} numberOfLines={1}>
            {DAY_NAMES[target.day]?.slice(0, 3)} {clock(target.minute)}
          </Text>
        </View>
      )}
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
  dragColumn: { zIndex: 10 },
  slot: { position: "absolute", left: 0, right: 0, height: HOUR_PX / 2 },
  hourLine: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  slotHeld: { backgroundColor: "#EEF2FF" },
  blockSlot: { position: "absolute" },
  lifted: { zIndex: 10, opacity: 0.9, boxShadow: "0 6px 14px rgba(17,24,39,0.25)" },
  dropLabel: {
    position: "absolute",
    top: -22,
    left: 0,
    width: 72,
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#111827",
  },
  dropLabelText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  block: {
    flex: 1,
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
