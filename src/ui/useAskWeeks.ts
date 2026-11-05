// Data hook for "Ask your past weeks" (RAG: retrieval-augmented generation).
// 1. Every week since the first one with data, plus saved month summaries,
//    becomes a short text document (weekDocs.ts).
// 2. Embeddings: the AI service turns texts into vectors (Voyage AI). They are
//    saved on the phone with a hash of the text, so a week is only sent again
//    when it changed.
// 3. Hybrid search on the phone (weekSearch.ts) picks the best 5 documents.
// 4. Only those 5 go with the question to /ask-weeks; the answer cites them.
// Without embeddings (no Voyage key, offline service) it still works, with
// keyword search only. Read-only: nothing here changes the calendar.
import { useEffect, useRef, useState } from "react";
import { postJson } from "../ai/aiClient";
import { loadEmbeddings, loadMonthSummaries, saveEmbeddings } from "../db/embeddingStore";
import { loadHabitChecks, loadHabits } from "../db/habitsStore";
import { loadFirstWeek } from "../db/historyStore";
import { loadWeekItems } from "../db/weekItemsStore";
import type { Db } from "../db/weekStore";
import { weekCount } from "./habits";
import { weekForAi } from "./useAiReview";
import type { SavedSummary } from "./useMonthSummary";
import { addWeeks, dayKey } from "./weekDate";
import { emptyWeek, monthDoc, needsEmbedding, textHash, weekDoc, type RagDoc } from "./weekDocs";
import { hybridSearch, type SearchMode } from "./weekSearch";
import type { Groups } from "./WeekView";

const MAX_WEEKS = 104; // two years back is plenty, and keeps loading quick
const TOP_K = 5;
const BATCH = 64;

interface EmbedResponse {
  model: string;
  vectors: number[][];
}
interface WeeksAnswer {
  answer: string;
  found: boolean;
  citations: string[];
}

export interface AskResult {
  question: string;
  answer: string;
  found: boolean;
  /** The cited documents, in the order the answer cites them. */
  cited: RagDoc[];
  mode: SearchMode;
}

export type AskState =
  | { status: "idle" }
  | { status: "working"; step: string }
  | { status: "error"; message: string }
  | { status: "ready"; result: AskResult };

async function buildDocs(db: Db, thisWeek: string, todayKey: string, groups: Groups): Promise<RagDoc[]> {
  const first = await loadFirstWeek(db);
  const docs: RagDoc[] = [];
  if (first) {
    const habits = await loadHabits(db);
    const checks = await loadHabitChecks(db, first, dayKey(thisWeek, 6));
    const groupName = (id: string | undefined) => (id ? (groups.get(id)?.name ?? null) : null);
    for (let i = 0, w = thisWeek; i < MAX_WEEKS && w >= first; i++, w = addWeeks(w, -1)) {
      const forAi = await weekForAi(db, w, todayKey, groups);
      const habitLines = habits
        .map((h) => ({ h, n: weekCount(checks, h.id, w) }))
        .filter(({ n }) => n > 0)
        .map(({ h, n }) => `${h.title}: ${n} of ${Math.min(h.targetPerWeek, 7)} days`);
      const input = { ...forAi, todos: await loadWeekItems(db, w), habitLines, groupName };
      if (!emptyWeek(input)) docs.push(weekDoc(input));
    }
  }
  for (const [month, saved] of await loadMonthSummaries<SavedSummary>(db)) {
    if (saved?.summary) docs.push(monthDoc(month, saved.summary));
  }
  return docs;
}

/** The question's vector and every doc's vector, or null when embeddings aren't available. */
async function vectorsFor(db: Db, question: string, docs: RagDoc[]) {
  let model: string;
  let query: number[];
  try {
    const q = await postJson<EmbedResponse>("/embed", { texts: [question], input_type: "query" }, 30_000);
    model = q.model;
    query = q.vectors[0]!;
  } catch {
    return null; // keyword search only
  }
  const stored = await loadEmbeddings(db);
  const stale = needsEmbedding(docs, stored, model);
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    const r = await postJson<EmbedResponse>("/embed", { texts: batch.map((d) => d.text), input_type: "document" }, 60_000);
    const rows = batch.map((d, j) => ({ docId: d.id, hash: textHash(d.text), model: r.model, vector: r.vectors[j]! }));
    await saveEmbeddings(db, rows);
    for (const row of rows) stored.set(row.docId, row);
  }
  const ids = new Set(docs.map((d) => d.id));
  const vectors = new Map([...stored].filter(([id, s]) => ids.has(id) && s.model === model).map(([id, s]) => [id, s.vector]));
  return { query, docs: vectors };
}

export function useAskWeeks(db: Db, open: boolean, thisWeek: string, todayKey: string, groups: Groups) {
  const [state, setState] = useState<AskState>({ status: "idle" });
  // Docs are built once per opening of the sheet; asking again reuses them.
  const docsRef = useRef<RagDoc[] | null>(null);

  useEffect(() => {
    if (!open) return;
    docsRef.current = null;
    setState({ status: "idle" });
  }, [open, thisWeek]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    try {
      setState({ status: "working", step: "Reading your weeks…" });
      docsRef.current ??= await buildDocs(db, thisWeek, todayKey, groups);
      const docs = docsRef.current;
      if (docs.length === 0) {
        setState({ status: "error", message: "There are no weeks with anything in them yet." });
        return;
      }
      setState({ status: "working", step: "Finding the weeks that fit…" });
      const vectors = await vectorsFor(db, question, docs).catch(() => null);
      const { mode, results } = hybridSearch(question, docs, vectors ?? undefined, TOP_K);
      // Keyword search can find nothing ("how was last week?"): then the newest weeks go instead.
      const found = results.map((r) => docs.find((d) => d.id === r.id)).filter((d): d is RagDoc => !!d);
      const top = found.length > 0 ? found : docs.filter((d) => d.kind === "week").slice(0, TOP_K);
      setState({ status: "working", step: "Writing the answer…" });
      const reply = await postJson<WeeksAnswer>("/ask-weeks", {
        question,
        today: todayKey,
        docs: top.map((d) => ({ id: d.id, title: d.title, text: d.text })),
      });
      const cited = reply.citations.map((id) => top.find((d) => d.id === id)).filter((d): d is RagDoc => !!d);
      setState({ status: "ready", result: { question, answer: reply.answer, found: reply.found, cited, mode } });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  return { state, ask };
}
