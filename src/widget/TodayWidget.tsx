// The home screen widget (Android only). Widgets aren't normal React Native
// views: this JSX is turned into Android's RemoteViews, so only the library's
// FlexWidget / TextWidget work here, and taps arrive as a `clickAction`.
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { colors } from "../ui/theme";
import { clock, type WeekRow } from "../ui/weekRows";
import type { TodayView } from "./todayData";

type Hex = `#${string}`;
const c = (k: keyof typeof colors) => colors[k] as Hex;

export const DONE_ACTION = "MARK_DONE";

const span = (r: WeekRow) => `${clock(r.start)}–${clock(r.end)}`;

export function TodayWidget({ today }: { today?: TodayView }) {
  const total = today?.rows.length ?? 0;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: c("bg"),
        borderRadius: 22,
        padding: 14,
        flexDirection: "column",
      }}
    >
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center" }}>
        <TextWidget text="Today" style={{ fontSize: 16, fontFamily: "BricolageGrotesque_700Bold", color: c("text") }} />
        <FlexWidget style={{ flex: 1 }} />
        {total > 0 && (
          <TextWidget
            text={`${today!.done} of ${total} done`}
            style={{ fontSize: 12, fontFamily: "DMSans_500Medium", color: c("textMuted") }}
          />
        )}
      </FlexWidget>

      {today?.next ? <Next row={today.next} /> : <Empty loading={!today} anyToday={total > 0} />}

      {today?.later.map((r) => (
        <FlexWidget key={r.id} style={{ flexDirection: "row", marginTop: 6 }}>
          <TextWidget
            text={clock(r.start)}
            style={{ fontSize: 12, fontFamily: "DMSans_500Medium", color: c("textMuted"), width: 44 }}
          />
          <TextWidget
            text={r.title}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, fontFamily: "DMSans_500Medium", color: c("textSoft") }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

function Next({ row }: { row: WeekRow }) {
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: c("white"),
        borderRadius: 14,
        marginTop: 10,
        padding: 10,
      }}
    >
      <FlexWidget style={{ width: 4, height: 34, borderRadius: 2, backgroundColor: c("accent"), marginRight: 10 }} />
      <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
        <TextWidget
          text={row.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: c("text") }}
        />
        <TextWidget text={span(row)} style={{ fontSize: 12, fontFamily: "DMSans_500Medium", color: c("textMuted") }} />
      </FlexWidget>
      <FlexWidget
        clickAction={DONE_ACTION}
        clickActionData={{ id: row.id }}
        style={{ backgroundColor: c("accent"), borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
      >
        <TextWidget text="Done" style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: c("white") }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function Empty({ loading, anyToday }: { loading: boolean; anyToday: boolean }) {
  const text = loading ? "Loading…" : anyToday ? "All done for today" : "Nothing planned today";
  return (
    <FlexWidget style={{ marginTop: 10, flexDirection: "column" }}>
      <TextWidget text={text} style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: c("text") }} />
      {!loading && (
        <TextWidget
          text="Tap to open your week"
          style={{ fontSize: 12, fontFamily: "DMSans_500Medium", color: c("textMuted"), marginTop: 2 }}
        />
      )}
    </FlexWidget>
  );
}
