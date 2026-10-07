/**
 * The product filter shared by every sales source: the person's literal
 * phrase, accent- and case-insensitive, matched as whole words so that a named
 * product never matches another word's prefix. Each adapter applies the
 * pattern to its own description column with the same normalization; the
 * phrase is always a bound value, never SQL.
 */
export function productPhrase(search: string): string {
  return search
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** POSIX bracket classes work in both Oracle and PostgreSQL regular expressions. */
export function productPhrasePattern(phrase: string): string {
  return `(^|[^[:alnum:]])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^[:alnum:]]|$)`;
}
