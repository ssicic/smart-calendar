// Runs in the background when Android asks the widget to draw (added, every
// 30 minutes, resized) or when its Done button is tapped. The app may not be
// open, so it opens the database itself.
import { openDatabaseAsync } from "expo-sqlite";
import { Platform } from "react-native";
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from "react-native-android-widget";
import { migrate, type Db } from "../db/weekStore";
import { loadToday, markDoneToday } from "./todayData";
import { DONE_ACTION, TodayWidget } from "./TodayWidget";

export const WIDGET_NAME = "Today";

async function render(db: Db) {
  return <TodayWidget today={await loadToday(db, new Date())} />;
}

export async function widgetTaskHandler({ widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_DELETED") return;
  // Its own connection, closed when done. Without useNewConnection, expo-sqlite
  // hands back the app's open connection, and when the widget's handle was
  // cleaned up it closed the app's connection too ("NullPointerException" on
  // the next query in the app).
  const sqlite = await openDatabaseAsync("smart-calendar.db", { useNewConnection: true });
  const db = sqlite as unknown as Db;
  try {
    await migrate(db); // in case the widget runs before the app has after an update
    if (widgetAction === "WIDGET_CLICK" && clickAction === DONE_ACTION && typeof clickActionData?.id === "string") {
      await markDoneToday(db, new Date(), clickActionData.id);
    }
    renderWidget(await render(db));
  } catch (e) {
    console.error(e);
  } finally {
    await sqlite.closeAsync().catch(() => {});
  }
}

/** Called by the app after any change, so the widget shows it straight away. */
export function refreshWidget(db: Db): void {
  if (Platform.OS !== "android") return;
  void requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => render(db) }).catch(() => {});
}
