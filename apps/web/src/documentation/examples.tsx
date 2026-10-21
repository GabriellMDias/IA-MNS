import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConversationMaterials } from "../features/agent/materials.js";
import "../features/agent/agent.css";
import {
  Button,
  ErrorNotice,
  PageHeader,
  SectionCard,
  SelectField,
  StatusBadge,
  TextField,
} from "../components.js";
import { ApiFailure } from "../api-client.js";
import { SalesAnswer, SalesResults } from "../features/sales/results.js";
import "../features/sales/sales.css";
import { ProductAnswer, ProductOptions } from "../features/products/results.js";
import "../features/products/products.css";

export function Example({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [materialClient] = useState(() => new QueryClient());
  switch (id) {
    case "ui-page-header":
      return (
        <>
          <PageHeader
            title="Administração"
            description="Gerencie as preferências da equipe."
            actions={
              <Button
                onClick={() =>
                  setMessage(
                    "Demonstration action selected; no request was made.",
                  )
                }
              >
                Nova pessoa
              </Button>
            }
          />
          {message && <p role="status">{message}</p>}
        </>
      );
    case "ui-select-field":
      return (
        <SelectField
          label="Duração da sessão"
          hint="Exemplo local de uma escolha com ajuda."
          defaultValue="12"
        >
          <option value="12">12 horas</option>
          <option value="24">24 horas</option>
          <option value="disabled" disabled>
            Indisponível neste ambiente
          </option>
        </SelectField>
      );
    case "ui-buttons":
      return (
        <div className="docs-preview">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button
              onClick={() =>
                setMessage(
                  "Demonstration action selected; no request was made.",
                )
              }
            >
              Salvar
            </Button>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="ghost">Ver detalhes</Button>
            <Button variant="danger">Encerrar</Button>
            <Button loading>Salvando</Button>
          </div>
          {message && <p role="status">{message}</p>}
        </div>
      );
    case "ui-text-fields":
      return (
        <div style={{ display: "grid", gap: 20 }}>
          <TextField
            label="Nome"
            defaultValue="Pessoa Exemplo"
            hint="Como você aparece no IA-MNS."
          />
          <TextField
            label="Usuário"
            defaultValue="exemplo"
            error="Este usuário já está em uso (exemplo)."
          />
        </div>
      );
    case "ui-section-card":
      return (
        <SectionCard
          title="Perfil"
          description="Um exemplo local dos componentes compartilhados."
        >
          <TextField label="Nome de exibição" defaultValue="Pessoa Exemplo" />
        </SectionCard>
      );
    case "ui-status-badges":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusBadge>Não configurado</StatusBadge>
          <StatusBadge tone="accent">Esta sessão</StatusBadge>
        </div>
      );
    case "agent-materials-disabled":
    case "agent-materials-owned":
      return (
        <QueryClientProvider client={materialClient}>
          <ConversationMaterials
            token={null}
            source="sankhya"
            attachments={
              id === "agent-materials-owned"
                ? [
                    {
                      id: "synthetic-file",
                      name: "resumo-operacional-exemplo.txt",
                      mediaType: "text/plain",
                      purpose:
                        "Resumir os pontos principais do relatório de exemplo.",
                      source: "sankhya",
                    },
                  ]
                : []
            }
            preferences={
              id === "agent-materials-owned"
                ? { language: "pt-BR", detail: "concise", format: "bullets" }
                : undefined
            }
            disabled={true}
            onCreated={async () => {}}
          />
        </QueryClientProvider>
      );
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
    case "product-answer-category":
      return (
        <ProductAnswer
          answer={{
            kind: "products",
            source: "vrmaster",
            catalogVersion: "example/2026-10-11.1",
            total: 2,
            products: [
              {
                code: "101",
                description: "FRUTA EXEMPLO A KG",
                classification: "HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › A",
              },
              {
                code: "102",
                description: "FRUTA EXEMPLO B KG",
                classification: "HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › B",
              },
            ],
            criteria: [
              {
                dimension: "category",
                title: "classificação mercadológica",
                mode: "include",
                text: "fruta exemplo",
                values: ["HORTIFRUTI › FRUTAS › FRUTA EXEMPLO"],
                excluded: ["HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › DESIDRATADA"],
                interpretation:
                  "Produtos classificados nos níveis do mercadológico escolhidos, incluindo os níveis abaixo deles.",
              },
            ],
            sections: [{ label: "HORTIFRUTI", count: 2 }],
            notes: ["Synthetic component preview; no ERP data or request."],
          }}
        />
      );
    case "product-options-choice":
      return (
        <div className="docs-preview">
          <ProductOptions
            options={{
              kind: "product_options",
              source: "vrmaster",
              title: "classificação mercadológica",
              text: "fruta exemplo",
              options: [
                { number: 1, label: "HORTIFRUTI › FRUTAS › FRUTA EXEMPLO" },
                {
                  number: 2,
                  label:
                    "todos os produtos com “fruta exemplo” na descrição (7)",
                },
              ],
            }}
            onChoose={(number) =>
              setMessage(
                `Demonstration option ${number} selected; no request was made.`,
              )
            }
          />
          {message && <p role="status">{message}</p>}
        </div>
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
