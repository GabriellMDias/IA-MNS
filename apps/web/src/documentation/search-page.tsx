import { useEffect, useState } from "react";
import type { SearchResponse } from "./types.js";
import { DocLink } from "./navigation.js";
import { labels } from "./catalog-data.js";
export function SearchPage({ query, scope }: { query: string; scope: string }) {
  const [result, setResult] = useState<SearchResponse | null>(null);
  useEffect(() => {
    if (!query.trim()) return;
    const worker = new Worker(new URL("./search-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<SearchResponse>) =>
      setResult(event.data);
    worker.onerror = () =>
      setResult({
        requestId: 1,
        hits: [],
        total: 0,
        error:
          "Search is unavailable. Browse the documentation sections or try again.",
      });
    worker.postMessage({ requestId: 1, query, scope });
    return () => worker.terminate();
  }, [query, scope]);
  if (!query.trim())
    return (
      <p>
        Enter a phrase to search guides, API contracts, data definitions, and
        component documentation.
      </p>
    );
  if (!result) return <p role="status">Searching documentation…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return (
    <>
      <p role="status">
        {result.total
          ? `${result.total} matching sections${result.total > 40 ? "; showing the best 40. Narrow your search for more specific results." : "."}`
          : `No results for “${query}”. Try a shorter phrase or another category.`}
      </p>
      <ol className="docs-results">
        {result.hits.map((hit, index) => (
          <li key={`${hit.id}-${hit.anchor}-${index}`}>
            <span className="docs-kicker">
              {labels[hit.kind]} · {hit.group}
            </span>
            <h2>
              <DocLink id={hit.id} hash={hit.anchor}>
                {hit.title}
                {hit.heading && hit.heading !== hit.title
                  ? ` / ${hit.heading}`
                  : ""}
              </DocLink>
            </h2>
            <p>{hit.snippet}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
