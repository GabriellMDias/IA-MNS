export type AdminSearch = {
  secao?: "seguranca" | "parametros" | "grupos";
  /** Selected group of the groups section. */
  grupo?: string;
  pessoa?: string;
  busca?: string;
  cursor?: string;
  novo?: true;
};

/** Bounded administration navigation; credentials never belong in route state. */
export function parseAdminSearch(search: Record<string, unknown>): AdminSearch {
  const uuid = (value: unknown): value is string =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  if (search.secao === "seguranca" || search.secao === "parametros")
    return { secao: search.secao };
  if (search.secao === "grupos")
    return {
      secao: "grupos",
      ...(uuid(search.grupo) ? { grupo: search.grupo } : {}),
    };
  return {
    ...(uuid(search.pessoa) ? { pessoa: search.pessoa } : {}),
    ...(typeof search.busca === "string" && search.busca
      ? { busca: search.busca.slice(0, 120) }
      : {}),
    ...(typeof search.cursor === "string" && search.cursor
      ? { cursor: search.cursor.slice(0, 500) }
      : {}),
    ...(search.novo === true ? { novo: true } : {}),
  };
}
