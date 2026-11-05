// Saved embeddings for "Ask your past weeks" (table doc_embeddings, DB v26).
// Same small Db interface as weekStore, so tests use node:sqlite.
import type { Db } from "./weekStore";

export interface StoredEmbedding {
  hash: string;
  model: string;
  vector: number[];
}

export async function loadEmbeddings(db: Db): Promise<Map<string, StoredEmbedding>> {
  const rows = await db.getAllAsync<{ doc_id: string; text_hash: string; model: string; vector: string }>(
    "SELECT doc_id, text_hash, model, vector FROM doc_embeddings",
    [],
  );
  return new Map(rows.map((r) => [r.doc_id, { hash: r.text_hash, model: r.model, vector: JSON.parse(r.vector) as number[] }]));
}

export async function saveEmbeddings(db: Db, rows: { docId: string; hash: string; model: string; vector: number[] }[]): Promise<void> {
  if (rows.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO doc_embeddings (doc_id, text_hash, model, vector) VALUES (?, ?, ?, ?)
         ON CONFLICT(doc_id) DO UPDATE SET text_hash = excluded.text_hash, model = excluded.model, vector = excluded.vector`,
        [r.docId, r.hash, r.model, JSON.stringify(r.vector)],
      );
    }
  });
}

/** Saved month summaries ("month_summary:2026-10"), as month → JSON value. */
export async function loadMonthSummaries<T>(db: Db): Promise<Map<string, T>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key LIKE 'month_summary:%' ORDER BY key",
    [],
  );
  return new Map(rows.map((r) => [r.key.slice("month_summary:".length), JSON.parse(r.value) as T]));
}
