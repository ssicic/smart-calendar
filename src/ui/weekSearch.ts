// "Ask your past weeks", part 2: finding the weeks that fit a question.
// Pure, no React. Two searches, merged:
// - BM25 keyword search: good at exact words ("dentist", "Spanish").
// - Vector search (cosine similarity of embeddings): good at meaning
//   ("exercise" finds "Gym", "before work" finds early mornings).
// Reciprocal rank fusion (RRF) merges the two ranked lists: each doc scores
// 1 / (60 + rank) in every list it appears in, so a doc near the top of both wins.
// ai-service/app/retrieval.py is the same algorithm in Python (for the evals);
// both are checked against ai-service/tests/fixtures/search_golden.json.

export interface SearchDoc {
  id: string;
  text: string;
}

export interface Ranked {
  id: string;
  score: number;
}

const STOP = new Set(
  ("a an and are as at be by did do does for from had has have how i in is it its last me my of on or " +
    "the this that to was were what when where which who will with week weeks").split(" "),
);

/** Lowercase words without stop words; a plural "s" is dropped ("sessions" = "session"). */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * BM25: per query word, how often it is in a doc (with diminishing returns, k1)
 * times how rare it is across docs (idf), with long docs evened out (b).
 * Docs without any query word are left out.
 */
export function bm25(query: string, docs: SearchDoc[], k1 = 1.2, b = 0.75): Ranked[] {
  const terms = [...new Set(tokenize(query))];
  const tokens = docs.map((d) => tokenize(d.text));
  const avg = tokens.reduce((s, t) => s + t.length, 0) / Math.max(1, tokens.length);
  const df = new Map<string, number>();
  for (const t of tokens) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = docs.length;

  const out: Ranked[] = [];
  docs.forEach((d, i) => {
    const t = tokens[i]!;
    const tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const dft = df.get(term) ?? 0;
      const idf = Math.log(1 + (n - dft + 0.5) / (dft + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / (avg || 1)));
    }
    if (score > 0) out.push({ id: d.id, score });
  });
  return sortRanked(out);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Every doc that has a vector, most similar to the question first. */
export function vectorSearch(queryVector: number[], vectors: Map<string, number[]>): Ranked[] {
  return sortRanked([...vectors].map(([id, v]) => ({ id, score: cosine(queryVector, v) })));
}

/** Reciprocal rank fusion of several ranked lists (k = 60, the usual choice). */
export function rrf(lists: Ranked[][], k = 60): Ranked[] {
  const scores = new Map<string, number>();
  for (const list of lists) list.forEach((r, rank) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + rank + 1)));
  return sortRanked([...scores].map(([id, score]) => ({ id, score })));
}

/** Highest score first; ties by id so results never depend on input order. */
function sortRanked(list: Ranked[]): Ranked[] {
  return list.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type SearchMode = "hybrid" | "keyword";

/**
 * The top `k` docs for a question. With a question vector and doc vectors:
 * hybrid (BM25 + vector, fused). Without (no embeddings available): keyword only.
 */
export function hybridSearch(
  query: string,
  docs: SearchDoc[],
  vectors?: { query: number[]; docs: Map<string, number[]> },
  k = 5,
): { mode: SearchMode; results: Ranked[] } {
  const keyword = bm25(query, docs);
  if (!vectors || vectors.docs.size === 0) return { mode: "keyword", results: keyword.slice(0, k) };
  return { mode: "hybrid", results: rrf([keyword, vectorSearch(vectors.query, vectors.docs)]).slice(0, k) };
}
