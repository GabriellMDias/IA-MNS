import { normalizedWords, wordForms } from "../sales/analysis.js";
import { productPhrase } from "../sales/product-match.js";

/** Short connecting words never matched on their own. */
const stopwords = new Set([
  "a",
  "as",
  "o",
  "os",
  "e",
  "de",
  "da",
  "das",
  "do",
  "dos",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "com",
  "sem",
  "para",
  "por",
  "um",
  "uma",
]);

/** Singular and plural forms of a lowercase normalized word. */
export function searchForms(word: string): string[] {
  const forms = new Set(wordForms(word));
  for (const form of [...forms]) {
    if (form.length < 3) continue;
    if (!form.endsWith("s")) forms.add(`${form}s`);
    if (/[rz]$/.test(form)) forms.add(`${form}es`);
    if (form.endsWith("ao"))
      for (const ending of ["aes", "oes", "aos"])
        forms.add(`${form.slice(0, -2)}${ending}`);
    if (form.endsWith("l")) forms.add(`${form.slice(0, -1)}is`);
    if (form.endsWith("m")) forms.add(`${form.slice(0, -1)}ns`);
  }
  return [...forms].sort();
}

/** Significant normalized words of user text. */
export function significantWords(text: string): string[] {
  return normalizedWords(text).filter(
    (word) => word.length > 1 && !stopwords.has(word),
  );
}

const escape = (value: string) =>
  value.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word pattern of one word in any of its forms (normalized SQL text). */
export function wordPattern(word: string): string {
  return `(^|[^[:alnum:]])(${searchForms(word).map(escape).join("|")})([^[:alnum:]]|$)`;
}

/**
 * Whole-phrase pattern of a term: its significant words in order, each in any
 * of its forms, separated by spaces or other connecting words.
 */
export function termPattern(term: string): string | null {
  const words = significantWords(term);
  if (words.length === 0) return null;
  const parts = words.map(
    (word) => `(${searchForms(word).map(escape).join("|")})`,
  );
  return `(^|[^[:alnum:]])${parts.join("([^[:alnum:]]+[[:alnum:]]{1,3})*[^[:alnum:]]+")}([^[:alnum:]]|$)`;
}

/** One pattern matching any of the terms; null when none is searchable. */
export function anyTermPattern(terms: readonly string[]): string | null {
  const patterns = terms
    .map(termPattern)
    .filter((pattern): pattern is string => pattern !== null);
  return patterns.length === 0
    ? null
    : patterns.map((pattern) => `(${pattern})`).join("|");
}

/** The normalized literal phrase of a description criterion. */
export function literalPhrase(text: string): string {
  return productPhrase(text).trim();
}
