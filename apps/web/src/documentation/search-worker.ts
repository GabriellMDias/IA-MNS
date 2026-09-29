import manifestSource from "../generated/manifest.json";
import { createSectionSearch, rankHits, searchTerms } from "./search.js";
import type { Manifest, SearchHit, SearchRecord } from "./types.js";

const manifest = manifestSource as Manifest;
const assets = import.meta.glob<string>("../generated/search/**/*.json", {
  eager: true,
  query: "?url",
  import: "default",
});
let latest = 0;
let controller: AbortController | undefined;

// Only one bounded shard is parsed at a time. The browser HTTP cache can reuse
// assets; neither the UI nor this worker retains the full documentation corpus.
globalThis.onmessage = (
  event: MessageEvent<{ requestId: number; query: string; scope: string }>,
) => {
  latest = event.data.requestId;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const { requestId, query, scope } = event.data;
  void (async () => {
    const terms = searchTerms(query);
    if (!terms.length) {
      globalThis.postMessage({ requestId, hits: [], total: 0 });
      return;
    }
    let hits: SearchHit[] = [];
    let total = 0;
    const sections = createSectionSearch(terms);
    const collect = (hit: SearchHit | null) => {
      if (!hit) return;
      total++;
      hits = rankHits([...hits, hit]).slice(0, 40);
    };
    for (const shard of manifest.search.shards) {
      if (requestId !== latest) return;
      if (scope && shard.kinds && !shard.kinds.includes(scope)) continue;
      const url = assets[`../generated/${shard.file}`];
      if (!url) throw new Error("Missing search shard");
      const response = await fetch(url, { signal, credentials: "omit" });
      if (!response.ok) throw new Error("Search shard unavailable");
      const records = (await response.json()) as SearchRecord[];
      for (const record of records) {
        if (scope && record.kind !== scope) continue;
        collect(sections.push(record));
      }
    }
    collect(sections.finish());
    if (requestId === latest)
      globalThis.postMessage({ requestId, hits, total });
  })().catch(() => {
    if (!signal.aborted && requestId === latest)
      globalThis.postMessage({
        requestId,
        hits: [],
        total: 0,
        error: "Search is unavailable. Browse the sections or retry.",
      });
  });
};
