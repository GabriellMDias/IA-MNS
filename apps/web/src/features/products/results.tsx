import { useId } from "react";
import type {
  ProductAnswer as ProductAnswerData,
  ProductOptions as ProductOptionsData,
} from "./api.js";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const sourceLabel = (source: "vrmaster" | "sankhya") =>
  source === "sankhya" ? "MNS (Sankhya)" : "Pilar da Terra (VR Master)";

/**
 * Products found by a lookup: how each criterion was understood (the records
 * or classification paths it resolved to and the business rule behind it),
 * the count per section, notes and the bounded product list. Everything is
 * server-validated; nothing here is model text.
 */
export function ProductAnswer({ answer }: { answer: ProductAnswerData }) {
  const id = useId();
  return (
    <div
      role="group"
      className="product-answer"
      aria-labelledby={`${id}-source`}
    >
      <h2 className="product-source-title" id={`${id}-source`}>
        Fonte: {sourceLabel(answer.source)}
      </h2>
      <dl className="product-criteria">
        {answer.criteria.map((criterion, index) => (
          <div key={index} className="product-criterion">
            <dt>
              {criterion.mode === "exclude" ? "Excluir " : ""}
              {criterion.title}
              {criterion.text && criterion.values.length > 0
                ? `: “${criterion.text}”`
                : ""}
            </dt>
            {criterion.values.length > 0 && (
              <dd>
                <ul>
                  {criterion.values.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </dd>
            )}
            {criterion.excluded.length > 0 && (
              <dd>
                Exceto:
                <ul>
                  {criterion.excluded.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </dd>
            )}
            <dd className="product-interpretation">
              {criterion.interpretation}
            </dd>
          </div>
        ))}
      </dl>
      {answer.sections.length > 0 && (
        <ul className="product-sections" aria-label="Produtos por seção">
          {answer.sections.map((section) => (
            <li key={section.label}>
              {section.label} <span>{integer.format(section.count)}</span>
            </li>
          ))}
        </ul>
      )}
      {answer.notes.length > 0 && (
        <ul className="product-notes">
          {answer.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {answer.products.length > 0 && (
        <div className="product-table-scroll">
          <table>
            <caption>
              {answer.products.length < answer.total
                ? `Primeiros ${integer.format(answer.products.length)} de ${integer.format(answer.total)} produtos, em ordem alfabética`
                : `${integer.format(answer.total)} ${answer.total === 1 ? "produto" : "produtos"}`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Descrição</th>
                <th scope="col">Classificação</th>
              </tr>
            </thead>
            <tbody>
              {answer.products.map((product) => (
                <tr key={product.code}>
                  <td>{product.code}</td>
                  <td>{product.description}</td>
                  <td>{product.classification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The numbered choices of a product clarification. Choosing sends the option
 * number as the next message; typing the number or the name works as well.
 */
export function ProductOptions({
  options,
  onChoose,
}: {
  options: ProductOptionsData;
  /** Absent for historical turns and previews: options are then text only. */
  onChoose?: (number: number) => void;
}) {
  const id = useId();
  return (
    <div className="product-options" role="group" aria-labelledby={id}>
      <p id={id} className="product-options-title">
        Opções de {options.title} para “{options.text}”
      </p>
      <ul>
        {options.options.map((option) => (
          <li key={option.number}>
            {onChoose ? (
              <button type="button" onClick={() => onChoose(option.number)}>
                {option.number}. {option.label}
              </button>
            ) : (
              `${option.number}. ${option.label}`
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
