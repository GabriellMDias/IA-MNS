import type { SemanticCatalog } from "./catalog.js";
import { significantWords } from "./text.js";

/** Targeted model-safe metadata; the caller supplies the dimensions its authorization allows. */
export function retrieveProductMetadata(
  catalog: SemanticCatalog,
  words: string,
  allowedDimensions: readonly string[],
) {
  const requested = significantWords(words).slice(0, 8);
  return catalog.dimensions
    .filter(
      (dimension) =>
        dimension.exposure === "enabled" &&
        allowedDimensions.includes(dimension.id),
    )
    .map((dimension) => {
      const description = significantWords(
        [dimension.title, dimension.description, ...dimension.synonyms].join(
          " ",
        ),
      );
      return {
        dimension,
        score: requested.filter((word) => description.includes(word)).length,
      };
    })
    .filter((item) => requested.length === 0 || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ dimension }) => ({
      id: dimension.id,
      title: dimension.title,
      meaning: dimension.description,
      interpretation: dimension.interpretation,
      relationships: dimension.path.map((id) => {
        const relationship = catalog.relationships.find(
          (item) => item.id === id,
        )!;
        return {
          meaning: relationship.meaning,
          cardinality: relationship.cardinality,
          confidence: relationship.confidence,
          status: relationship.status,
        };
      }),
      values: dimension.domain?.map((value) => value.label) ?? [],
    }));
}
