import { useId, useState } from "react";
import type { SalesAnswer as SalesAnswerData, SalesResult } from "./api.js";
import { formatSalesDecimal } from "./format.js";
import { sourceLabels, type SalesSource } from "./sources.js";

export function formatMeasure(value: string, unit: string): string {
  const formatted = formatSalesDecimal(
    value,
    unit === "BRL" ? 2 : 9,
    unit === "BRL",
  );
  return unit === "BRL" ? `R$ ${formatted}` : `${formatted} ${unitLabel(unit)}`;
}
function unitLabel(unit: string): string {
  const packaging = /^EMBALAGEM:(-?\d+)$/.exec(unit);
  return unit === "PESOLIQ"
    ? "(peso ERP)"
    : unit === "UNSPECIFIED"
      ? "(sem unidade)"
      : packaging
        ? `(tipo de embalagem ${packaging[1]})`
        : unit;
}
function ResultsTable({
  rows,
  label,
}: {
  rows: SalesResult["rows"];
  label: string;
}) {
  return (
    <div className="sales-table-scroll">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col">Produto</th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>
                {row.period === "total"
                  ? "Total do período"
                  : row.period.split("-").reverse().join("/")}
              </td>
              <td>{row.product ?? "Todos os produtos do filtro"}</td>
              <td>{formatMeasure(row.value, row.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const measureLabels: Readonly<
  Record<SalesSource, Readonly<Record<SalesResult["query"]["metric"], string>>>
> = {
  sankhya: {
    net_value: "Valor líquido",
    quantity: "Quantidade",
    weight: "Peso",
  },
  vrmaster: {
    net_value: "Valor total",
    quantity: "Quantidade",
    weight: "Peso",
  },
};
export function SalesResults({
  result,
  source = "sankhya",
}: {
  result: SalesResult;
  source?: SalesSource;
}) {
  const [view, setView] = useState<"table" | "chart">("table");
  const canChart =
    result.query.groupBy === "month" &&
    result.rows.length > 0 &&
    result.rows.every(
      (row) => Number.isFinite(Number(row.value)) && Number(row.value) >= 0,
    ) &&
    new Set(result.rows.map((row) => row.unit)).size === 1;
  const maximum = Math.max(
    ...result.rows.map((row) => Math.abs(Number(row.value))),
    1,
  );
  return (
    <div className="sales-results">
      <p className="sales-query-summary">
        {result.query.startDate.split("-").reverse().join("/")} a{" "}
        {result.query.endDate.split("-").reverse().join("/")} ·{" "}
        {result.query.productSearch ?? "Todos os produtos"}
      </p>
      <div className="sales-totals">
        {result.totals.map((total) => (
          <div className="sales-total" key={total.unit}>
            <span>{measureLabels[source][result.query.metric]}</span>
            <strong>{formatMeasure(total.value, total.unit)}</strong>
            {total.previousValue !== null && (
              <small>
                Anterior: {formatMeasure(total.previousValue, total.unit)} ·{" "}
                {total.changePercent === null
                  ? "Variação sem base"
                  : `${formatSalesDecimal(total.changePercent, 2, true)}%`}
              </small>
            )}
          </div>
        ))}
      </div>
      {result.rows.length > 0 && (
        <>
          {canChart && (
            <div
              className="sales-view-switch"
              aria-label="Visualização dos resultados"
            >
              <button
                type="button"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                Tabela
              </button>
              <button
                type="button"
                aria-pressed={view === "chart"}
                onClick={() => setView("chart")}
              >
                Gráfico
              </button>
            </div>
          )}
          {view === "chart" && canChart ? (
            <div className="sales-chart" aria-label="Vendas por mês">
              {result.rows.map((row, index) => (
                <div key={index} className="sales-chart-row">
                  <span>{row.period.split("-").reverse().join("/")}</span>
                  <div className="sales-bar-track">
                    <div
                      className="sales-bar"
                      style={{
                        width: `${(Math.abs(Number(row.value)) / maximum) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{formatMeasure(row.value, row.unit)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <ResultsTable
              rows={result.rows}
              label="Vendas no período consultado"
            />
          )}
        </>
      )}
      {result.comparison && (
        <details className="sales-detail">
          <summary>
            Período comparado:{" "}
            {result.comparison.startDate.split("-").reverse().join("/")} a{" "}
            {result.comparison.endDate.split("-").reverse().join("/")}
          </summary>
          <ResultsTable
            rows={result.comparison.rows}
            label="Vendas no período comparado"
          />
        </details>
      )}
      {result.products.length > 0 && (
        <details className="sales-detail">
          <summary>{result.products.length} produto(s) identificado(s)</summary>
          <ul>
            {result.products.map((product) => (
              <li key={product.code}>
                {product.code} — {product.description}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="sales-footnotes">
        {result.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
    </div>
  );
}

const unavailable: Readonly<Record<string, string>> = {
  provider_unavailable:
    "Não consegui consultar esta fonte agora. Tente novamente em instantes.",
  not_configured: "Esta fonte ainda não está configurada no IA-MNS.",
  result_too_large:
    "A consulta ficou muito ampla para esta fonte. Reduza o período ou especifique melhor o produto.",
  measure: "Esta medida não está disponível nesta fonte.",
};
/**
 * A sales answer with one labeled group per queried source. Each group shows
 * its own result or why it has none; sources are never combined. Groups, not
 * landmarks: every answer in a conversation repeats the same source names.
 */
export function SalesAnswer({ answer }: { answer: SalesAnswerData }) {
  const id = useId();
  return (
    <div className="sales-answer">
      {answer.sections.map((section) => (
        <div
          role="group"
          className="sales-source"
          key={section.source}
          aria-labelledby={`${id}-${section.source}`}
        >
          <h2 className="sales-source-title" id={`${id}-${section.source}`}>
            Fonte: {sourceLabels[section.source]}
          </h2>
          {section.result ? (
            <SalesResults result={section.result} source={section.source} />
          ) : (
            <p className="sales-source-status">
              {unavailable[section.reason ?? "provider_unavailable"]}
            </p>
          )}
        </div>
      ))}
      {answer.sections.length > 1 && (
        <p className="sales-source-note">
          As fontes são apresentadas separadamente; os valores não são somados.
        </p>
      )}
    </div>
  );
}
