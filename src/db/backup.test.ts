import { beforeEach, describe, expect, it } from "vitest";
import { backupFileName, checkBackup, exportBackup, importBackup } from "./backup";
import { nodeDb } from "./nodeDb";
import { insertWeekItem, loadWeekItems } from "./weekItemsStore";
import { insertEvents, insertItem, loadItems, loadWeek, migrate, saveSetting } from "./weekStore";

const W1 = "2026-10-19";
const gym = { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 5 };
const now = new Date(2026, 9, 22, 12);

let source: ReturnType<typeof nodeDb>;
let target: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  source = nodeDb();
  target = nodeDb();
  await migrate(source);
  await migrate(target);
  await insertItem(source, gym);
  await insertEvents(source, "fixed", [{ id: "w1", title: "Bob's work", start: 540, end: 1020 }], null, W1);
  await insertWeekItem(source, W1, { id: "t1", kind: "todo", title: "Call dentist", done: true, progress: 0, target: 1, day: null });
  await saveSetting(source, "sleep", { weekday: { wake: 360, bed: 1380 }, weekend: { wake: 540, bed: 1440 }, windDownMin: 30 });
});

/** What the user would do: export, save as a file (text), pick it in the other app, import. */
async function moveOver() {
  const text = JSON.stringify(await exportBackup(source, now));
  const checked = await checkBackup(target, text);
  if (!checked.ok) throw new Error(checked.error);
  await importBackup(target, checked.backup);
  return checked;
}

describe("backup", () => {
  it("moves the whole calendar into another app's empty database", async () => {
    const checked = await moveOver();
    expect(checked.rows).toBeGreaterThan(3);
    expect(await loadItems(target)).toEqual([gym]);
    expect((await loadWeek(target, W1, "2026-10-26")).week.fixed.map((e) => e.title)).toEqual(["Bob's work"]);
    expect((await loadWeekItems(target, W1)).map((i) => [i.title, i.done])).toEqual([["Call dentist", true]]);
    expect((await loadWeek(target, W1, "2026-10-26")).sleep.weekday).toEqual({ wake: 360, bed: 1380 });
  });

  it("replaces what was there instead of mixing the two", async () => {
    await insertItem(target, { ...gym, id: "old", title: "Old item" });
    await moveOver();
    expect((await loadItems(target)).map((i) => i.title)).toEqual(["Gym"]);
  });

  it("refuses files that aren't backups, or come from another app version", async () => {
    expect(await checkBackup(target, "hello")).toMatchObject({ ok: false });
    expect(await checkBackup(target, JSON.stringify({ app: "other" }))).toMatchObject({ ok: false });
    const backup = await exportBackup(source, now);
    expect(await checkBackup(target, JSON.stringify({ ...backup, version: backup.version + 1 }))).toMatchObject({
      ok: false,
      error: "This backup comes from a newer version of the app. Update this app first.",
    });
  });

  it("changes nothing when an import fails halfway", async () => {
    const backup = await exportBackup(source, now);
    // Two rows with the same id: the second insert fails, so the whole import is rolled back.
    const broken = { ...backup, tables: { ...backup.tables, flexible_items: [...backup.tables.flexible_items!, ...backup.tables.flexible_items!] } };
    await insertItem(target, { ...gym, id: "keep", title: "Keep me" });
    await expect(importBackup(target, broken)).rejects.toThrow();
    expect((await loadItems(target)).map((i) => i.title)).toEqual(["Keep me"]);
  });

  it("names the file by date", () => {
    expect(backupFileName(now)).toBe("smart-calendar-backup-2026-10-22.json");
  });
});
