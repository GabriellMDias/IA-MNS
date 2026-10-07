import { useState } from "react";
import { ErrorNotice } from "../components.js";
import { ApiFailure } from "../api-client.js";
import { SalesAnswer, SalesResults } from "../features/sales/results.js";
import "../features/sales/sales.css";

export function Example({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  switch (id) {
    case "sales-monthly-results":
      return (
        <SalesResults
          result={{
            query: {
              productSearch: "maçã",
              startDate: "2026-07-01",
              endDate: "2026-09-30",
              metric: "net_value",
              groupBy: "month",
              comparison: "previous_year",
            },
            rows: [
              {
                period: "2026-07",
                product: null,
                unit: "BRL",
                value: "1234.56",
              },
              {
                period: "2026-08",
                product: null,
                unit: "BRL",
                value: "1500.00",
              },
              { period: "2026-09", product: null, unit: "BRL", value: "0" },
            ],
            totals: [
              {
                unit: "BRL",
                value: "2734.56",
                previousValue: "2500.00",
                changePercent: "9.38",
              },
            ],
            products: [{ code: "123", description: "MAÇÃ GALA (SYNTHETIC)" }],
            comparison: {
              startDate: "2025-07-01",
              endDate: "2025-09-30",
              rows: [
                {
                  period: "2025-07",
                  product: null,
                  unit: "BRL",
                  value: "2500.00",
                },
              ],
            },
            warnings: ["Synthetic component preview; no ERP data or request."],
          }}
        />
      );
    case "sales-answer-both-sources":
      return (
        <SalesAnswer
          answer={{
            selection: "all",
            sections: [
              {
                source: "sankhya",
                status: "answered",
                reason: null,
                result: {
                  query: {
                    productSearch: null,
                    startDate: "2026-09-01",
                    endDate: "2026-09-30",
                    metric: "net_value",
                    groupBy: "total",
                    comparison: "none",
                  },
                  rows: [
                    {
                      period: "total",
                      product: null,
                      unit: "BRL",
                      value: "1000.10",
                    },
                  ],
                  totals: [
                    {
                      unit: "BRL",
                      value: "1000.10",
                      previousValue: null,
                      changePercent: null,
                    },
                  ],
                  products: [],
                  comparison: null,
                  warnings: [
                    "Synthetic component preview; no ERP data or request.",
                  ],
                },
              },
              {
                source: "vrmaster",
                status: "unavailable",
                reason: "provider_unavailable",
                result: null,
              },
            ],
          }}
        />
      );
    case "unavailable-reload":
      return (
        <div className="docs-preview">
          <ErrorNotice
            error={
              new ApiFailure(
                503,
                "SERVICE_UNAVAILABLE",
                "example",
                "The service is unavailable.",
              )
            }
            onReload={() =>
              setMessage("Demonstration reload selected; no request was made.")
            }
          />
          {message && <p role="status">{message}</p>}
        </div>
      );
    default:
      return null;
  }
}
