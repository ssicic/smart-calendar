import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bm25, cosine, hybridSearch, rrf, tokenize, vectorSearch } from "./weekSearch";

interface Golden {
  docs: { id: string; text: string }[];
  vectors: Record<string, number[]>;
  queries: { query: string; vector: number[]; bm25: string[]; vector_ranked: string[]; hybrid: string[] }[];
}
// The same file the Python version (ai-service/app/retrieval.py) is tested against.
const golden = JSON.parse(
  readFileSync(new URL("../../ai-service/tests/fixtures/search_golden.json", import.meta.url), "utf8"),
) as Golden;

describe("tokenize", () => {
  it("lowercases, drops stop words and a plural s", () => {
    expect(tokenize("When did I go to the Gym sessions?")).toEqual(["go", "gym", "session"]);
    expect(tokenize("Fitness class 07:00")).toEqual(["fitness", "class", "07", "00"]);
  });
});

describe("bm25", () => {
  const docs = [
    { id: "a", text: "Gym Gym Work" },
    { id: "b", text: "Gym Work Work Work Work Work" },
    { id: "c", text: "Dentist" },
  ];
  it("ranks docs with more of the rarer words higher and leaves out docs without them", () => {
    expect(bm25("gym", docs).map((r) => r.id)).toEqual(["a", "b"]);
    expect(bm25("dentist", docs).map((r) => r.id)).toEqual(["c"]);
    expect(bm25("holiday", docs)).toEqual([]);
  });
});

describe("vectors and fusion", () => {
  it("cosine is 1 for the same direction, 0 for unrelated or mismatched", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1], [1, 2])).toBe(0);
  });
  it("vector search sorts by similarity", () => {
    const v = new Map([["x", [0, 1]], ["y", [1, 0]]]);
    expect(vectorSearch([1, 0.1], v).map((r) => r.id)).toEqual(["y", "x"]);
  });
  it("RRF rewards docs that are high in both lists", () => {
    const fused = rrf([
      [{ id: "a", score: 9 }, { id: "b", score: 5 }],
      [{ id: "b", score: 0.9 }, { id: "c", score: 0.8 }],
    ]);
    expect(fused[0]!.id).toBe("b");
    expect(fused.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("falls back to keyword search without vectors", () => {
    const { mode, results } = hybridSearch("dentist", golden.docs);
    expect(mode).toBe("keyword");
    expect(results.map((r) => r.id)).toEqual(["week:2026-09-14"]);
  });
});

describe("matches the Python version (golden file)", () => {
  const vectors = new Map(Object.entries(golden.vectors));
  for (const q of golden.queries) {
    it(q.query, () => {
      expect(bm25(q.query, golden.docs).map((r) => r.id)).toEqual(q.bm25);
      expect(vectorSearch(q.vector, vectors).map((r) => r.id)).toEqual(q.vector_ranked);
      const { mode, results } = hybridSearch(q.query, golden.docs, { query: q.vector, docs: vectors }, 3);
      expect(mode).toBe("hybrid");
      expect(results.map((r) => r.id)).toEqual(q.hybrid);
    });
  }
});
