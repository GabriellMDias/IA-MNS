/**
 * WhatsApp numbers that owners link to a Person. The number is an external
 * identity attribute of an existing Person, never a sign-in method: only the
 * WhatsApp channel uses it, and only owners set, change or remove it.
 *
 * A number is entered in international form and stored as its E.164 digits
 * (without "+"). Matching is exact. The single deterministic exception is the
 * Brazilian mobile ninth digit: WhatsApp still reports many Brazilian mobile
 * accounts with the pre-2016 eight-digit subscriber number (for example
 * 55 11 8765-4321 for +55 11 98765-4321). Under the current national plan an
 * eight-digit subscriber number starting with 6-9 can only be that legacy form
 * of a mobile (landlines start with 2-5), so it is recorded as an explicit
 * alias that participates in the uniqueness constraint. Nothing else is
 * guessed: a number that does not match exactly, or through that alias, is
 * unknown, and a subscriber number outside those ranges gets no alias.
 */
export type WhatsappNumber = Readonly<{
  /** E.164 digits without "+", for example 5511987654321. */
  digits: string;
  /** Display form, for example +55 11 98765-4321. */
  display: string;
  /** Legacy WhatsApp identifier of a Brazilian mobile, or null. */
  legacyIdentifier: string | null;
}>;

export type WhatsappNumberProblem =
  /** Not an international number with country code. */
  | "format"
  /** A Brazilian mobile written without its ninth digit. */
  | "missing_ninth_digit";

/** WhatsApp sender identifiers that Meta reports as digits only. */
export const whatsappIdPattern = /^[1-9][0-9]{7,14}$/;

/**
 * Business-scoped user identifier (BSUID): ISO country code, a period, then up
 * to 128 alphanumeric characters, optionally with the parent "ENT." segment.
 */
export const whatsappUserIdPattern = /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$/;

export function normalizeWhatsappNumber(
  input: string,
):
  | { ok: true; value: WhatsappNumber }
  | { ok: false; problem: WhatsappNumberProblem } {
  const compact = input.trim().replace(/[\s().-]/g, "");
  // The country code must be explicit; a national number is never completed.
  const digits = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : null;
  if (digits === null || !whatsappIdPattern.test(digits))
    return { ok: false, problem: "format" };
  if (!digits.startsWith("55"))
    return {
      ok: true,
      value: { digits, display: `+${digits}`, legacyIdentifier: null },
    };
  const national = digits.slice(2);
  const area = national.slice(0, 2);
  const subscriber = national.slice(2);
  if (!/^[1-9]{2}$/.test(area)) return { ok: false, problem: "format" };
  if (subscriber.length === 9 && /^9[1-9]/.test(subscriber))
    return {
      ok: true,
      value: {
        digits,
        display: `+55 ${area} ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`,
        legacyIdentifier: /^9[6-9]/.test(subscriber)
          ? `55${area}${subscriber.slice(1)}`
          : null,
      },
    };
  if (subscriber.length === 8 && /^[2-5]/.test(subscriber))
    return {
      ok: true,
      value: {
        digits,
        display: `+55 ${area} ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`,
        legacyIdentifier: null,
      },
    };
  if (subscriber.length === 8 && /^[6-9]/.test(subscriber))
    return { ok: false, problem: "missing_ninth_digit" };
  return { ok: false, problem: "format" };
}

/** The display form of stored digits; stored values were validated on write. */
export function displayWhatsappNumber(digits: string): string {
  const parsed = normalizeWhatsappNumber(`+${digits}`);
  return parsed.ok ? parsed.value.display : `+${digits}`;
}

/** Last four digits: the only part of a number written to audit and logs. */
export function whatsappSuffix(digits: string): string {
  return digits.slice(-4);
}
