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

let opened: Promise<Db> | undefined;
function database(): Promise<Db> {
  opened ??= (async () => {
    const db = (await openDatabaseAsync("smart-calendar.db")) as unknown as Db;
    await migrate(db); // in case the widget runs before the app ever has after an update
    return db;
  })();
  return opened;
}

async function render(db?: Db) {
  return <TodayWidget today={await loadToday(db ?? (await database()), new Date())} />;
}

export async function widgetTaskHandler({ widgetAction, clickAction, clickActionData, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_DELETED") return;
  try {
    if (widgetAction === "WIDGET_CLICK" && clickAction === DONE_ACTION && typeof clickActionData?.id === "string") {
      await markDoneToday(await database(), new Date(), clickActionData.id);
    }
    renderWidget(await render());
  } catch (e) {
    console.error(e);
  }
}

/** Called by the app after any change, so the widget shows it straight away. */
export function refreshWidget(db: Db): void {
  if (Platform.OS !== "android") return;
  void requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => render(db) }).catch(() => {});
}
