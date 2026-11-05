import { describe, expect, it } from "vitest";
import { exportBackup } from "./backup";
import { loadEmbeddings, loadMonthSummaries, saveEmbeddings } from "./embeddingStore";
import { nodeDb } from "./nodeDb";
import { migrate, saveSetting } from "./weekStore";

async function fresh() {
  const db = nodeDb();
  await migrate(db);
  return db;
}

describe("embeddingStore", () => {
  it("saves, replaces and loads embeddings", async () => {
    const db = await fresh();
    await saveEmbeddings(db, [
      { docId: "week:2026-10-12", hash: "a1", model: "m", vector: [0.1, 0.2] },
      { docId: "month:2026-10", hash: "b1", model: "m", vector: [1, 0] },
    ]);
    await saveEmbeddings(db, [{ docId: "week:2026-10-12", hash: "a2", model: "m", vector: [0.3, 0.4] }]);
    const all = await loadEmbeddings(db);
    expect(all.size).toBe(2);
    expect(all.get("week:2026-10-12")).toEqual({ hash: "a2", model: "m", vector: [0.3, 0.4] });
  });

  it("leaves embeddings out of backups (they are rebuilt)", async () => {
    const db = await fresh();
    await saveEmbeddings(db, [{ docId: "w", hash: "h", model: "m", vector: [1] }]);
    const backup = await exportBackup(db, new Date(2026, 10, 5));
    expect(backup.tables.doc_embeddings).toBeUndefined();
    expect(backup.tables.settings).toBeDefined();
  });

  it("loads saved month summaries by month", async () => {
    const db = await fresh();
    await saveSetting(db, "month_summary:2026-09", { summary: { headline: "Sep" } });
    await saveSetting(db, "month_summary:2026-10", { summary: { headline: "Oct" } });
    await saveSetting(db, "weather", { x: 1 });
    const m = await loadMonthSummaries<{ summary: { headline: string } }>(db);
    expect([...m.keys()]).toEqual(["2026-09", "2026-10"]);
    expect(m.get("2026-10")?.summary.headline).toBe("Oct");
  });
});
