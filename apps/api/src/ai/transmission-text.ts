/**
 * Defense in depth for text crossing the provider boundary. Field allowlists
 * and catalog classification remain authoritative: patterns cannot identify
 * every secret, personal name or sensitive fact in arbitrary prose.
 */
export function redactModelText(text: string): string {
  const redacted = text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gu,
      "[secret withheld]",
    )
    .replace(
      /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/gu,
      "[secret withheld]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
      "[secret withheld]",
    )
    .replace(
      /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}/giu,
      "[secret withheld]",
    )
    .replace(
      /\b(?:password|passwd|senha|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/giu,
      "[secret withheld]",
    )
    .replace(
      /\b(?:postgres(?:ql)?|mysql|oracle):\/\/[^\s]+/giu,
      "[connection withheld]",
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      "[personal identifier withheld]",
    )
    .replace(
      /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/gu,
      "[personal identifier withheld]",
    )
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "");
  return [...redacted]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        (code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13
      );
    })
    .join("");
}

/** Labels remain untrusted data even after obvious control syntax is removed. */
export function safeModelText(text: string, maxLength = 2000): string {
  return redactModelText(text)
    .replace(
      /<\|[^>]{0,100}\|>|<\/?(?:system|developer|assistant|tool)(?:\s[^>]*)?>/giu,
      "[untrusted delimiter]",
    )
    .replace(/\{\{[^}]{0,200}\}\}/gu, "[untrusted reference]")
    .slice(0, Math.max(0, Math.min(maxLength, 262144)));
}
