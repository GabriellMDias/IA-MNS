/** Format API decimal strings without losing cents through binary floating point. */
export function formatSalesDecimal(
  value: string,
  places: number,
  fixed = false,
): string {
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = value.replace(/^-/, "").split(".");
  const digits = fraction.padEnd(places + 1, "0");
  const factor = 10n ** BigInt(places);
  let scaled =
    BigInt(integer) * factor + BigInt(digits.slice(0, places) || "0");
  if (Number(digits[places]) >= 5) scaled++;
  let decimal = (scaled % factor).toString().padStart(places, "0");
  if (!fixed) decimal = decimal.replace(/0+$/, "");
  return `${negative && scaled !== 0n ? "-" : ""}${new Intl.NumberFormat("pt-BR").format(scaled / factor)}${decimal ? `,${decimal}` : ""}`;
}
