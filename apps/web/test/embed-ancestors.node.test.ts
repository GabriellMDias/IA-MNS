import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadEmbedAncestors } from "../scripts/embed-ancestors.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(content?: string) {
  const root = mkdtempSync(join(tmpdir(), "ia-mns-embed-"));
  roots.push(root);
  if (content !== undefined) writeFileSync(join(root, ".env.local"), content);
  return root;
}

it("denies framing without explicitly configured hosts", () => {
  expect(loadEmbedAncestors(fixture(), {})).toEqual({ pdt: [], sankhya: [] });
});

it("reuses local provider origins only for their own surfaces", () => {
  const root = fixture(
    "PDT_EMBED_ORIGIN=http://localhost:5180\n" +
      "SANKHYA_EMBED_ORIGIN=http://localhost:8080\n" +
      "OPENAI_API_KEY=synthetic-private-marker\n",
  );
  expect(loadEmbedAncestors(root, {})).toEqual({
    pdt: ["http://localhost:5180"],
    sankhya: ["http://localhost:8080"],
  });
  expect(process.env.OPENAI_API_KEY).not.toBe("synthetic-private-marker");
});

it("lets the inherited environment replace or disable a local provider", () => {
  const root = fixture("SANKHYA_EMBED_ORIGIN=http://localhost:8080\n");
  expect(
    loadEmbedAncestors(root, {
      SANKHYA_EMBED_ORIGIN: "http://localhost:8180",
    }).sankhya,
  ).toEqual(["http://localhost:8180"]);
  expect(
    loadEmbedAncestors(root, { SANKHYA_EMBED_ORIGIN: "" }).sankhya,
  ).toEqual([]);
});

it("preserves the explicit ancestor override, including an empty denial", () => {
  const root = fixture(
    "ORION_WEB_EMBED_ANCESTORS=http://localhost:8080\n" +
      "PDT_EMBED_ORIGIN=http://localhost:5180\n",
  );
  expect(loadEmbedAncestors(root, {})).toEqual({
    pdt: ["http://localhost:8080"],
    sankhya: ["http://localhost:8080"],
  });
  expect(loadEmbedAncestors(root, { ORION_WEB_EMBED_ANCESTORS: "" })).toEqual({
    pdt: [],
    sankhya: [],
  });
});

it("accepts the existing space-separated override without loading local files", () => {
  expect(
    loadEmbedAncestors(undefined, {
      ORION_WEB_EMBED_ANCESTORS:
        "http://localhost:8080 https://host.example http://localhost:8080",
    }),
  ).toEqual({
    pdt: ["http://localhost:8080", "https://host.example"],
    sankhya: ["http://localhost:8080", "https://host.example"],
  });
});

it.each([
  "*",
  "http://localhost:8080/mge",
  "http://user:secret@localhost:8080",
  "http://localhost:99999",
  "http://localhost:8080 http://localhost:8180",
])(
  "rejects invalid provider origins without disclosing values: %s",
  (origin) => {
    const root = fixture(`SANKHYA_EMBED_ORIGIN=${origin}\n`);
    expect(() => loadEmbedAncestors(root, {})).toThrow(
      /^SANKHYA_EMBED_ORIGIN must/,
    );
  },
);
