import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  searchRestrictionValues,
  type AccessEntry,
  type CatalogEntry,
  type Grant,
  type RestrictionInput,
} from "./api.js";
import { identityMessage } from "./messages.js";
import { Button, StatusBadge, TextField } from "../../components.js";

type Condition = Grant["restrictions"][number];
type Value = Condition["values"][number];
type Dimension = Pick<CatalogEntry["restrictions"][number], "id" | "title">;

const providerName = { pdt: "PDT Connect", sankhya: "Sankhya" } as const;

/** Catalog entries in source order, each source with its own heading. */
export function bySource<
  T extends { source: { id: string; title: string } | null },
>(items: readonly T[]): { id: string; title: string; items: T[] }[] {
  const sources: { id: string; title: string; items: T[] }[] = [];
  for (const item of items) {
    const id = item.source?.id ?? "geral";
    const found = sources.find((source) => source.id === id);
    if (found) found.items.push(item);
    else
      sources.push({
        id,
        title: item.source?.title ?? "Geral",
        items: [item],
      });
  }
  return sources;
}

const valueText = (item: Value) =>
  item.label && item.label !== item.value
    ? `${item.value} – ${item.label}`
    : item.value;

/** "Empresa: 3 – FILIAL; Vendedor: 12 – ANA" for one grant or rule. */
export function conditionsText(
  conditions: readonly Condition[],
  dimensions: readonly Dimension[],
): string {
  return conditions
    .map(
      (condition) =>
        `${dimensions.find((item) => item.id === condition.dimension)?.title ?? condition.dimension}: ${condition.values.map(valueText).join(", ")}`,
    )
    .join("; ");
}

/**
 * Real values of each restriction dimension, searched in the source; the API
 * reads every chosen value back from the source before saving.
 */
function RestrictionEditor({
  token,
  entry,
  initial,
  available,
  busy,
  onSave,
  onCancel,
}: {
  token: string;
  entry: CatalogEntry;
  initial: readonly Condition[];
  available: boolean;
  busy: boolean;
  onSave: (restrictions: RestrictionInput) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, Value[]>>(() =>
    Object.fromEntries(
      initial.map((condition) => [condition.dimension, [...condition.values]]),
    ),
  );
  const [dimension, setDimension] = useState(entry.restrictions[0]?.id ?? "");
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const values = useQuery({
    queryKey: [
      "identity-restriction-values",
      token,
      entry.permission,
      dimension,
      query,
    ],
    queryFn: ({ signal }) =>
      searchRestrictionValues(
        token,
        entry.permission,
        dimension,
        query ?? "",
        signal,
      ),
    enabled: available && query !== null && dimension !== "",
  });
  const current = entry.restrictions.find((item) => item.id === dimension);
  const restrictions = entry.restrictions
    .filter((item) => selected[item.id]?.length)
    .map((item) => ({
      dimension: item.id,
      values: selected[item.id].map((value) => value.value),
    }));
  return (
    <div className="permission-editor">
      <p className="identity-hint">
        Valores de uma mesma dimensão são alternativas; todas as dimensões
        preenchidas precisam ser atendidas. Sem nenhum valor, a permissão vale
        para todos os dados da fonte.
      </p>
      {!available && (
        <p className="identity-warning">
          Os valores das restrições não podem ser lidos da origem neste
          ambiente. Só é possível conceder sem restrição.
        </p>
      )}
      <ul className="permission-dimensions">
        {entry.restrictions.map((item) => (
          <li key={item.id}>
            <div>
              <strong>
                {item.title} <code>{item.code}</code>
              </strong>
              <span className="identity-hint">{item.description}</span>
            </div>
            <div className="permission-chips">
              {(selected[item.id] ?? []).map((value) => (
                <span key={value.value} className="permission-chip">
                  {valueText(value)}
                  <button
                    type="button"
                    aria-label={`Remover ${valueText(value)}`}
                    disabled={busy}
                    onClick={() =>
                      setSelected((all) => ({
                        ...all,
                        [item.id]: (all[item.id] ?? []).filter(
                          (other) => other.value !== value.value,
                        ),
                      }))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {!selected[item.id]?.length && (
                <span className="identity-hint">Todos</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {available && (
        <form
          className="identity-inline permission-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(text.trim());
          }}
        >
          <div className="ui-field">
            <label htmlFor={`permission-dimension-${entry.permission}`}>
              Dimensão
            </label>
            <select
              id={`permission-dimension-${entry.permission}`}
              className="ui-input"
              value={dimension}
              onChange={(event) => {
                setDimension(event.target.value);
                setQuery(null);
              }}
            >
              {entry.restrictions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label={`Buscar ${current?.title.toLocaleLowerCase("pt-BR") ?? "valor"} por código ou nome`}
            id={`permission-search-${entry.permission}`}
            value={text}
            maxLength={60}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" variant="secondary" loading={values.isFetching}>
            Buscar
          </Button>
        </form>
      )}
      {values.error && <p role="alert">{identityMessage(values.error)}</p>}
      {values.data && !values.data.items.length && (
        <p className="identity-hint">Nenhum valor encontrado.</p>
      )}
      {values.data && values.data.items.length > 0 && (
        <ul className="identity-list permission-results">
          {values.data.items.map((item) => {
            const chosen = (selected[dimension] ?? []).some(
              (value) => value.value === item.value,
            );
            return (
              <li key={item.value}>
                <span>
                  <strong>{valueText(item)}</strong>
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
                <Button
                  variant="secondary"
                  disabled={busy || chosen}
                  onClick={() =>
                    setSelected((all) => ({
                      ...all,
                      [dimension]: [
                        ...(all[dimension] ?? []),
                        { value: item.value, label: item.label },
                      ],
                    }))
                  }
                >
                  {chosen ? "Adicionado" : "Adicionar"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="identity-actions">
        <Button loading={busy} onClick={() => onSave(restrictions)}>
          {restrictions.length
            ? "Salvar com restrições"
            : "Salvar sem restrição"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Where an effective permission of a Person comes from, in words. */
function originsText(origins: AccessEntry["origins"]): string {
  return origins
    .map((origin) =>
      origin.kind === "owner"
        ? "administrador principal"
        : origin.kind === "grant"
          ? "concessão individual"
          : origin.kind === "group"
            ? `grupo ${origin.group?.name ?? ""}`.trim()
            : `vínculo ${origin.provider ? providerName[origin.provider] : ""}`.trim(),
    )
    .join(", ");
}

function scopeText(entry: AccessEntry, catalog: readonly CatalogEntry[]) {
  if (!entry.rules) return "todos os dados da fonte";
  const dimensions =
    catalog.find((item) => item.permission === entry.permission)
      ?.restrictions ?? [];
  return entry.rules
    .map((rule) => conditionsText(rule, dimensions))
    .join(" ou ");
}

/**
 * The grantable permissions of a Person or group by source, each with its
 * identification code, its explicit grant and restrictions, and (for a
 * Person) what is effective and why.
 */
export function PermissionGrants({
  token,
  catalog,
  grants,
  access,
  restrictionsAvailable,
  busy,
  onGrant,
  onRevoke,
}: {
  token: string;
  catalog: readonly CatalogEntry[];
  grants: readonly Grant[];
  /** Effective access of a Person; absent for a group. */
  access?: readonly AccessEntry[];
  restrictionsAvailable: boolean;
  busy: boolean;
  onGrant: (permission: string, restrictions: RestrictionInput) => void;
  onRevoke: (permission: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="permission-sources">
      {bySource(catalog).map((source) => (
        <section key={source.id} className="permission-source">
          <h3>{source.title}</h3>
          <ul className="permission-list">
            {source.items.map((entry) => {
              const grant = grants.find(
                (item) => item.permission === entry.permission,
              );
              const effective = access?.find(
                (item) => item.permission === entry.permission,
              );
              return (
                <li key={entry.permission}>
                  <div className="permission-heading">
                    <code className="permission-code">{entry.code}</code>
                    <span>
                      <strong>{entry.title}</strong>
                      <span className="identity-hint">{entry.description}</span>
                    </span>
                  </div>
                  <p className="permission-state">
                    <StatusBadge tone={grant ? "accent" : "neutral"}>
                      {grant ? "Concedida" : "Não concedida"}
                    </StatusBadge>{" "}
                    {grant
                      ? grant.restrictions.length
                        ? `Somente ${conditionsText(grant.restrictions, entry.restrictions)}`
                        : "Sem restrição: todos os dados da fonte"
                      : entry.autoGrantProviders.length
                        ? `Automática para quem tem vínculo ${entry.autoGrantProviders.map((provider) => providerName[provider]).join(", ")}, se não houver concessão.`
                        : ""}
                  </p>
                  {access && (
                    <p className="permission-state">
                      {effective
                        ? `Efetiva por ${originsText(effective.origins)}: ${scopeText(effective, catalog)}.`
                        : "Não efetiva para esta pessoa."}
                    </p>
                  )}
                  {editing === entry.permission ? (
                    <RestrictionEditor
                      token={token}
                      entry={entry}
                      initial={grant?.restrictions ?? []}
                      available={restrictionsAvailable}
                      busy={busy}
                      onCancel={() => setEditing(null)}
                      onSave={(restrictions) => {
                        onGrant(entry.permission, restrictions);
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="identity-actions">
                      {!grant && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => onGrant(entry.permission, [])}
                        >
                          Conceder
                        </Button>
                      )}
                      {entry.restrictions.length > 0 && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setEditing(entry.permission)}
                        >
                          {grant
                            ? "Editar restrições"
                            : "Conceder com restrições"}
                        </Button>
                      )}
                      {grant && (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onRevoke(entry.permission)}
                        >
                          Revogar
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The signed-in Person's own permissions, as support identifies them. */
export function AccessSummary({
  access,
  admin,
}: {
  access: readonly AccessEntry[];
  admin: boolean;
}) {
  if (!access.length && !admin)
    return (
      <p>
        Nenhuma ainda. Se precisar de acesso, informe ao suporte o código da
        permissão desejada.
      </p>
    );
  return (
    <div className="account-access">
      {admin && (
        <p>
          <code className="permission-code">IAM-ADM-01</code> Administração do
          IA-MNS
        </p>
      )}
      {bySource(access).map((source) => (
        <section key={source.id}>
          <h3>{source.title}</h3>
          <ul>
            {source.items.map((entry) => (
              <li key={entry.permission}>
                <code className="permission-code">{entry.code}</code>{" "}
                <strong>{entry.title}</strong>
                <span>
                  {entry.rules
                    ? `Somente ${entry.rules.map((rule) => conditionsText(rule, entry.dimensions)).join(" ou ")}`
                    : "Todos os dados da fonte"}{" "}
                  · {originsText(entry.origins)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
