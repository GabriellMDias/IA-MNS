import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SalesResults } from "../src/features/sales/results.js";
import "../src/features/sales/sales.css";
import type { SalesResult } from "../src/features/sales/api.js";

const comparative: SalesResult = {
  query: {
    productSearch: "maçã",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    metric: "net_value",
    groupBy: "product",
    comparison: "previous_year",
  },
  rows: [],
  products: [],
  warnings: [],
  totals: [
    { unit: "BRL", value: "0", previousValue: "10", changePercent: "-100" },
  ],
  comparison: {
    startDate: "2025-07-01",
    endDate: "2025-09-30",
    rows: [
      { period: "total", product: "1 - MAÇÃ GALA", unit: "BRL", value: "10" },
    ],
  },
};
test("prior-only sales remain inspectable when the current period is empty", async () => {
  const screen = await render(<SalesResults result={comparative} />);
  await screen.getByText("Período comparado: 01/07/2025 a 30/09/2025").click();
  await expect
    .element(screen.getByRole("cell", { name: "R$ 10,00", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("01/07/2026 a 30/09/2026 · maçã"))
    .toBeVisible();
});
test("negative monthly adjustments stay signed in the table without positive-only bars", async () => {
  const screen = await render(
    <SalesResults
      result={{
        ...comparative,
        query: { ...comparative.query, groupBy: "month" },
        rows: [{ period: "2026-07", product: null, unit: "BRL", value: "-10" }],
      }}
    />,
  );
  await expect
    .element(screen.getByRole("button", { name: "Gráfico" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("cell", { name: "R$ -10,00", exact: true }))
    .toBeVisible();
});

test("mixed quantity units stay separate and cannot share a chart", async () => {
  const screen = await render(
    <SalesResults
      result={{
        query: {
          productSearch: null,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          metric: "quantity",
          groupBy: "month",
          comparison: "none",
        },
        products: [],
        comparison: null,
        warnings: [],
        rows: [
          { period: "2026-07", product: null, unit: "KG", value: "10" },
          { period: "2026-07", product: null, unit: "CX", value: "3" },
        ],
        totals: [
          { unit: "KG", value: "10", previousValue: null, changePercent: null },
          { unit: "CX", value: "3", previousValue: null, changePercent: null },
        ],
      }}
    />,
  );
  await expect.element(screen.getByRole("table")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Gráfico" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("cell", { name: "10 KG", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("cell", { name: "3 CX", exact: true }))
    .toBeVisible();
});
