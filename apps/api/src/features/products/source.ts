import type { CatalogDimension, SemanticCatalog } from "./catalog.js";
import type { SalesProductScope } from "../sales/product-scope.js";
import type {
  HierarchyNode,
  ProductPage,
  ProductSelection,
  RecordValue,
} from "./selection.js";

/**
 * A real hierarchy node that may represent what the person named: found by
 * its own label (`name`), as a child of such a node (`child`), or because
 * product descriptions under it contain the words (`products`).
 */
export type CategoryCandidate = Readonly<{
  node: HierarchyNode;
  matchedBy: "name" | "child" | "products";
  /** Products in the node's subtree. */
  products: number;
  /** Products in the subtree whose description contains a search term. */
  matchingProducts: number;
  /** Up to three descriptions from the subtree, matching ones first. */
  examples: readonly string[];
}>;

export type CategoryCandidates = Readonly<{
  candidates: readonly CategoryCandidate[];
  /** More nodes matched than the bounded list holds. */
  truncated: boolean;
  /** Products whose description contains a search term, in any node. */
  textMatches: number;
}>;

/** A record whose name matched, with the records it stands for (itself and its descendants). */
export type RecordMatch = Readonly<{
  record: RecordValue;
  covers: readonly RecordValue[];
}>;

/**
 * The ERP adapter behind the resolver. It owns its connection, read-only
 * transactions, limits and SQL dialect, and accepts only catalog dimensions
 * and normalized words or validated selections.
 */
export interface ProductSource {
  readonly catalog: SemanticCatalog;
  /** Nodes of a hierarchy dimension for normalized search terms. */
  categoryCandidates(
    this: void,
    dimension: CatalogDimension,
    terms: readonly string[],
    signal: AbortSignal,
  ): Promise<CategoryCandidates>;
  /** Records of an entity dimension whose name contains every word. */
  findRecords(
    this: void,
    dimension: CatalogDimension,
    words: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly RecordMatch[]>;
  /** A bounded list of active records, to offer when a name matched none. */
  listRecords(
    this: void,
    dimension: CatalogDimension,
    signal: AbortSignal,
  ): Promise<readonly RecordMatch[]>;
  /** The products of a selection: exact total and the first `limit`. */
  find(
    this: void,
    selection: ProductSelection,
    limit: number,
    signal: AbortSignal,
  ): Promise<ProductPage>;
  close(this: void): Promise<void>;
  /** Revalidate access/metadata and compile complete key membership for sales. */
  salesScope?(
    this: void,
    selection: ProductSelection,
    signal: AbortSignal,
  ): Promise<SalesProductScope>;
}
