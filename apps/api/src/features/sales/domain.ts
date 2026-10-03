import { Decimal } from "decimal.js";
import { SalesFailure } from "./errors.js";

Decimal.set({ precision: 50 });
export type SalesQuery = Readonly<{
  productSearch: string | null;
  startDate: string;
  endDate: string;
  metric: "net_value" | "quantity" | "weight";
  groupBy: "month" | "product" | "total";
  comparison: "none" | "previous_year" | "previous_period";
}>;
export type SalesRow = {
  period: string;
  product: string | null;
  unit: string;
  value: string;
};
export type SalesProduct = { code: string; description: string };
export type SalesData = {
  rows: SalesRow[];
  products: SalesProduct[];
  missingWeight: boolean;
};
export type SalesResult = {
  query: SalesQuery;
  rows: SalesRow[];
  products: SalesProduct[];
  totals: {
    unit: string;
    value: string;
    previousValue: string | null;
    changePercent: string | null;
  }[];
  comparison: { startDate: string; endDate: string; rows: SalesRow[] } | null;
  warnings: string[];
};

export function businessToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}

function date(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new SalesFailure("SALES_QUERY_INVALID");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new SalesFailure("SALES_QUERY_INVALID");
  return parsed;
}
export function validateQuery(query: SalesQuery, today: string): SalesQuery {
  const start = date(query.startDate);
  const end = date(query.endDate);
  const days = (end.getTime() - start.getTime()) / 86400000 + 1;
  if (
    days < 1 ||
    days > 366 ||
    query.startDate < "2000-01-01" ||
    query.endDate > today ||
    !["net_value", "quantity", "weight"].includes(query.metric) ||
    !["total", "month", "product"].includes(query.groupBy) ||
    !["none", "previous_year", "previous_period"].includes(query.comparison)
  )
    throw new SalesFailure("SALES_QUERY_INVALID");
  const search = query.productSearch?.trim() ?? null;
  if (
    search !== null &&
    (search.length < 2 ||
      search.length > 80 ||
      [...search].some((character) => character.charCodeAt(0) < 32))
  )
    throw new SalesFailure("SALES_QUERY_INVALID");
  const validated = { ...query, productSearch: search };
  const prior = comparisonQuery(validated);
  if (prior) validateQuery(prior, today);
  return validated;
}
export function comparisonQuery(query: SalesQuery): SalesQuery | null {
  if (query.comparison === "none") return null;
  const start = date(query.startDate),
    end = date(query.endDate);
  if (query.comparison === "previous_year") {
    for (const value of [start, end]) {
      const month = value.getUTCMonth();
      value.setUTCFullYear(value.getUTCFullYear() - 1);
      if (value.getUTCMonth() !== month) value.setUTCDate(0);
    }
  } else {
    const length = end.getTime() - start.getTime() + 86400000;
    start.setTime(start.getTime() - length);
    end.setTime(end.getTime() - length);
  }
  return {
    ...query,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    comparison: "none",
  };
}

export function assembleResult(
  query: SalesQuery,
  data: SalesData,
  previous: SalesData | null,
): SalesResult {
  const sum = (rows: SalesRow[]) => {
    const totals = new Map<string, Decimal>();
    for (const row of rows) {
      if (!/^-?\d+(?:\.\d+)?$/.test(row.value))
        throw new Error("Invalid sales numeric result");
      totals.set(
        row.unit,
        (totals.get(row.unit) ?? new Decimal(0)).plus(row.value),
      );
    }
    return totals;
  };
  const current = sum(data.rows),
    prior = sum(previous?.rows ?? []);
  const units = new Set([...current.keys(), ...prior.keys()]);
  const scale = query.metric === "net_value" ? 2 : 9;
  const totals = [...units].map((unit) => {
    const value = current.get(unit) ?? new Decimal(0);
    const old = prior.get(unit) ?? new Decimal(0);
    return {
      unit,
      value: value.toFixed(scale),
      previousValue: previous ? old.toFixed(scale) : null,
      changePercent:
        previous && !old.isZero()
          ? value.minus(old).div(old.abs()).times(100).toFixed(2)
          : null,
    };
  });
  const period = comparisonQuery(query);
  const denseMonths = (scope: SalesQuery, rows: SalesRow[]): SalesRow[] => {
    if (scope.groupBy !== "month" || units.size === 0) return rows;
    const byMonth = new Map(
      rows.map((row) => [`${row.period}:${row.unit}`, row]),
    );
    const cursor = date(scope.startDate);
    cursor.setUTCDate(1);
    const result: SalesRow[] = [];
    while (cursor.toISOString().slice(0, 7) <= scope.endDate.slice(0, 7)) {
      const month = cursor.toISOString().slice(0, 7);
      for (const unit of units)
        result.push(
          byMonth.get(`${month}:${unit}`) ?? {
            period: month,
            product: null,
            unit,
            value: "0",
          },
        );
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    if (result.length > 500) throw new SalesFailure("SALES_RESULT_TOO_LARGE");
    return result;
  };
  return {
    query,
    rows: denseMonths(query, data.rows),
    products: [
      ...new Map(
        [...data.products, ...(previous?.products ?? [])].map((product) => [
          product.code,
          product,
        ]),
      ).values(),
    ],
    totals,
    comparison:
      period && previous
        ? {
            startDate: period.startDate,
            endDate: period.endDate,
            rows: denseMonths(period, previous.rows),
          }
        : null,
    warnings: [
      "Vendas confirmadas, sem devoluções e sem vendas bonificadas; data de negociação (DTNEG).",
      ...(previous && data.rows.length === 0
        ? [
            "Não houve vendas no período consultado; os dados anteriores pertencem somente ao período comparado.",
          ]
        : []),
      ...(previous
        ? [
            "Os produtos identificados incluem vendas de ambos os períodos comparados.",
          ]
        : []),
      ...(query.metric === "quantity"
        ? [
            "Quantidades separadas por unidade do ERP; unidades diferentes não são somadas.",
          ]
        : []),
      ...(query.metric === "weight"
        ? ["Peso calculado por QTDNEG × PESOLIQ, na unidade cadastrada no ERP."]
        : []),
      ...(query.metric === "weight" &&
      (data.missingWeight || previous?.missingWeight)
        ? ["Há produtos sem PESOLIQ positivo; o peso pode estar incompleto."]
        : []),
    ],
  };
}

export function answerFor(result: SalesResult): string {
  const labels = {
    net_value: "Valor líquido vendido",
    quantity: "Quantidade vendida",
    weight: "Peso vendido",
  };
  if (result.totals.length === 0)
    return "Não encontrei vendas para os filtros e o período informados.";
  const money = (value: string, unit: string) => {
    const amount = new Decimal(value).toFixed(
      unit === "BRL" || unit === "%" ? 2 : 9,
    );
    const negative = amount.startsWith("-");
    const [integer, fraction] = amount.replace(/^-/, "").split(".");
    const decimal =
      unit === "BRL" || unit === "%" ? fraction : fraction.replace(/0+$/, "");
    const formatted = `${negative ? "-" : ""}${new Intl.NumberFormat("pt-BR").format(BigInt(integer))}${decimal ? `,${decimal}` : ""}`;
    return unit === "BRL"
      ? `R$ ${formatted}`
      : unit === "%"
        ? `${formatted}%`
        : `${formatted} ${unit === "PESOLIQ" ? "(unidade de peso do ERP)" : unit}`;
  };
  return `${labels[result.query.metric]} de ${result.query.startDate.split("-").reverse().join("/")} a ${result.query.endDate.split("-").reverse().join("/")}${result.query.productSearch ? ` para “${result.query.productSearch}”` : ""}:\n${result.totals.map((total) => `${money(total.value, total.unit)}${total.previousValue !== null ? `; período comparado: ${money(total.previousValue, total.unit)}; variação: ${total.changePercent === null ? "não calculável (base zero)" : money(total.changePercent, "%")}` : ""}`).join("\n")}`;
}
