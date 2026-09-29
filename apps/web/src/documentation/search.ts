import type { SearchHit, SearchRecord } from "./types.js";

export function searchTerms(query: string): string[] {
  return [
    ...new Set(
      query.slice(0, 200).toLowerCase().trim().split(/\s+/).filter(Boolean),
    ),
  ].slice(0, 12);
}

export function matchRecord(
  record: SearchRecord,
  terms: string[],
): SearchHit | null {
  const search = createSectionSearch(terms);
  search.push(record);
  return search.finish();
}

function excerpt(record: SearchRecord, terms: string[]): string {
  const body = record.text.toLowerCase();
  const first = Math.max(
    0,
    body.indexOf(terms.find((term) => body.includes(term)) ?? ""),
  );
  const start = Math.max(0, first - 65);
  return `${start ? "…" : ""}${record.text.slice(start, start + 220)}${record.text.length > start + 220 ? "…" : ""}`;
}

/** Feed generated records in order, including across shards, then finish once.
 * Only the current section's term coverage and a bounded excerpt are retained.
 */
export function createSectionSearch(terms: string[]): {
  push: (record: SearchRecord) => SearchHit | null;
  finish: () => SearchHit | null;
} {
  let current:
    { hit: SearchHit; matched: boolean[]; excerptMatches: number } | undefined;

  function finish(): SearchHit | null {
    const hit =
      current && terms.length && current.matched.every(Boolean)
        ? current.hit
        : null;
    current = undefined;
    return hit;
  }

  function push(record: SearchRecord): SearchHit | null {
    let complete: SearchHit | null = null;
    if (
      current &&
      (current.hit.id !== record.id || current.hit.anchor !== record.anchor)
    )
      complete = finish();
    if (!current) {
      const title = record.title.toLowerCase();
      const heading = (record.heading ?? "").toLowerCase();
      const id = record.id.toLowerCase();
      current = {
        hit: {
          id: record.id,
          title: record.title,
          group: record.group,
          kind: record.kind,
          heading: record.heading,
          anchor: record.anchor,
          score: terms.reduce(
            (total, term) =>
              total +
              (title.includes(term) ? 20 : 0) +
              (heading.includes(term) ? 10 : 0) +
              (id.includes(term) ? 5 : 0) +
              1,
            0,
          ),
          snippet: excerpt(record, terms),
        },
        matched: terms.map(
          (term) =>
            title.includes(term) || heading.includes(term) || id.includes(term),
        ),
        excerptMatches: 0,
      };
    }
    const body = record.text.toLowerCase();
    let matches = 0;
    terms.forEach((term, index) => {
      if (body.includes(term)) {
        current!.matched[index] = true;
        matches++;
      }
    });
    if (matches > current.excerptMatches) {
      current.hit.snippet = excerpt(record, terms);
      current.excerptMatches = matches;
    }
    return complete;
  }
  return { push, finish };
}

export function rankHits(hits: SearchHit[]): SearchHit[] {
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.id.localeCompare(b.id) ||
      (a.anchor ?? "").localeCompare(b.anchor ?? ""),
  );
}
