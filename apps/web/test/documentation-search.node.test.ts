import { describe, expect, test } from "vitest";
import {
  createSectionSearch,
  matchRecord,
  rankHits,
  searchTerms,
} from "../src/documentation/search.js";
import type { SearchHit, SearchRecord } from "../src/documentation/types.js";

function record(overrides: Partial<SearchRecord> = {}): SearchRecord {
  return {
    id: "repository/docs/security/authorization",
    title: "Authorization",
    group: "Security",
    kind: "repository",
    heading: "Default deny",
    anchor: "default-deny",
    text: "Server authorization denies access unless a trusted policy permits it.",
    ...overrides,
  };
}

function searchShards(shards: SearchRecord[][], query: string): SearchHit[] {
  const search = createSectionSearch(searchTerms(query));
  const hits: SearchHit[] = [];
  for (const shard of shards) {
    for (const item of shard) {
      const hit = search.push(item);
      if (hit) hits.push(hit);
    }
  }
  const last = search.finish();
  if (last) hits.push(last);
  expect(search.finish()).toBeNull();
  return hits;
}

describe("documentation full-text retrieval", () => {
  test("normalizes case and whitespace without duplicate terms or regex interpretation", () => {
    expect(searchTerms("  POLICY\n policy\tServer  ")).toEqual([
      "policy",
      "server",
    ]);
    expect(matchRecord(record(), [])).toBeNull();
    expect(matchRecord(record(), searchTerms("[a-z]*"))).toBeNull();
  });

  test("requires every term while matching title, heading, identifier and body together", () => {
    const match = matchRecord(
      record(),
      searchTerms("authorization deny trusted"),
    );
    expect(match).toMatchObject({
      id: "repository/docs/security/authorization",
      anchor: "default-deny",
      heading: "Default deny",
    });
    expect(
      matchRecord(record(), searchTerms("authorization absent")),
    ).toBeNull();
    expect(
      matchRecord(
        record({ id: "api/getReadiness", title: "Health probe", heading: "" }),
        searchTerms("getreadiness"),
      ),
    ).not.toBeNull();
  });

  test("prioritizes title then headings over body-only matches with stable ties", () => {
    const terms = searchTerms("retention");
    const hits = [
      record({ id: "b", title: "Guide", heading: "Safety", text: "retention" }),
      record({ id: "a", title: "Guide", heading: "Safety", text: "retention" }),
      record({
        id: "c",
        title: "Guide",
        heading: "Retention",
        text: "details",
      }),
      record({
        id: "d",
        title: "Retention",
        heading: "Safety",
        text: "details",
      }),
    ].flatMap((item) => {
      const hit = matchRecord(item, terms);
      return hit ? [hit] : [];
    });
    expect(rankHits(hits).map((hit) => hit.id)).toEqual(["d", "c", "a", "b"]);
  });

  test("bounds excerpts around matching body text and retains the local heading target", () => {
    const match = matchRecord(
      record({
        text: `${"prefix ".repeat(80)}restricted${" suffix".repeat(80)}`,
      }),
      searchTerms("restricted"),
    );
    expect(match?.snippet).toContain("restricted");
    expect(match?.snippet.length).toBeLessThanOrEqual(222);
    expect(match?.snippet.startsWith("…")).toBe(true);
    expect(match?.snippet.endsWith("…")).toBe(true);
    expect(match?.anchor).toBe("default-deny");
    expect(match).not.toHaveProperty("text");
  });

  test("matches distant AND terms across chunks and shard boundaries once per section", () => {
    const first = record({ text: `firstneedle ${"context ".repeat(1400)}` });
    const last = record({ text: `${"context ".repeat(1400)} lastneedle` });
    const hits = searchShards(
      [[first], [record({ text: "intermediate context" })], [last, last]],
      "authorization firstneedle lastneedle",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: first.id,
      anchor: first.anchor,
      heading: first.heading,
    });
    expect(hits[0].snippet.length).toBeLessThanOrEqual(222);
    expect(hits[0]).not.toHaveProperty("text");
  });

  test("does not duplicate or increase the rank of overlapping chunk matches", () => {
    const item = record({ text: "trusted policy" });
    const expected = matchRecord(item, searchTerms("trusted"));
    const hits = searchShards([[item, item], [item]], "trusted");
    expect(hits).toEqual([expected]);
  });

  test("does not carry term coverage between headings or pages and rejects missing terms", () => {
    expect(
      searchShards(
        [
          [record({ text: "firstneedle" })],
          [record({ text: "context" }), record({ text: "lastneedle" })],
        ],
        "firstneedle lastneedle missingneedle",
      ),
    ).toEqual([]);
    for (const boundary of [
      { anchor: "another-heading" },
      { id: "repository/docs/another-page" },
    ])
      expect(
        searchShards(
          [
            [record({ text: "firstneedle" })],
            [record({ ...boundary, text: "lastneedle" })],
          ],
          "firstneedle lastneedle",
        ),
      ).toEqual([]);
  });

  test("flushes each complete matching section and preserves query bounds", () => {
    const hits = searchShards(
      [
        [record({ text: "needle" }), record({ text: "needle" })],
        [record({ text: "needle", anchor: "next-section" })],
      ],
      "needle",
    );
    expect(hits.map((hit) => hit.anchor)).toEqual([
      "default-deny",
      "next-section",
    ]);
    expect(searchTerms(`${"x".repeat(200)} ignored`)).toEqual([
      "x".repeat(200),
    ]);
    expect(
      searchTerms(Array.from({ length: 20 }, (_, i) => `t${i}`).join(" ")),
    ).toHaveLength(12);
  });
});
