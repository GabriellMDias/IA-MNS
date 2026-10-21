import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getParameters,
  getProviderGroups,
  listGroups,
  setProviderGroup,
  type GroupList,
  type ProviderGroups,
  updateParameter,
  type OperationalParameter,
  type ParameterValue,
  type ParametersView,
} from "./api.js";
import { identityMessage, isFailure } from "./messages.js";
import {
  Button,
  SectionCard,
  SelectField,
  TextField,
} from "../../components.js";

type Key = OperationalParameter["key"];
type Group = OperationalParameter["group"];

/** What an administrator reads: product meaning, never environment variable names. */
const presentation: Record<
  Key,
  { label: string; help: string; options?: Record<string, string> }
> = {
  "ai.model": {
    label: "Modelo de IA",
    help: "Modelo da OpenAI que entende as perguntas e escolhe a capacidade que responde. Precisa aceitar chamada de função estrita; antes de trocar em produção, valide o novo modelo com a avaliação do IA-MNS.",
  },
  "ai.traceLevel": {
    label: "Registro de diagnóstico da IA",
    help: "Quanto de cada pergunta fica registrado para investigar como a IA interpretou o pedido. Desligado registra só falhas; somente metadados registra decisões, tempos e consumo, sem o texto das conversas; metadados e conteúdo guarda também o texto interpretado de cada pergunta.",
    options: {
      off: "Desligado",
      metadata: "Somente metadados",
      content: "Metadados e conteúdo",
    },
  },
  "channels.whatsapp": {
    label: "Atendimento pelo WhatsApp",
    help: "Liga ou desliga as respostas do IA-MNS no número de WhatsApp da empresa. Só conversa quem tem número de WhatsApp cadastrado em Pessoas. Desligado, nenhuma mensagem é processada nem respondida, inclusive as que estiverem aguardando.",
    options: { enabled: "Ligado", disabled: "Desligado" },
  },
};
const groups: { id: Group; title: string }[] = [
  { id: "ai", title: "Inteligência artificial" },
  { id: "access", title: "Acesso" },
  { id: "channels", title: "Canais" },
];
const effectText: Record<OperationalParameter["effect"], string> = {
  next_turn: "Vale a partir da próxima pergunta, sem reiniciar o IA-MNS.",
  next_access_token:
    "Vale no próximo acesso de cada pessoa e, para quem já está conectado, em até 10 minutos, sem reiniciar o IA-MNS.",
  next_message:
    "Vale a partir da próxima mensagem recebida, sem reiniciar o IA-MNS.",
};

function describe(parameter: OperationalParameter, value: unknown): string {
  const control = parameter.control;
  if (control.kind === "set") {
    const values = Array.isArray(value)
      ? value
      : typeof value === "string" && value
        ? value.split(",")
        : [];
    if (!values.length) return "nenhuma liberação automática";
    return values
      .map(
        (item) =>
          control.options.find((option) => option.value === item)?.label ??
          String(item),
      )
      .join("; ");
  }
  if (control.kind === "choice")
    return (
      presentation[parameter.key].options?.[String(value)] ?? String(value)
    );
  return String(value);
}

function origin(parameter: OperationalParameter): string {
  if (parameter.source === "default") return "Padrão desta instalação";
  const details = [
    parameter.updatedBy,
    parameter.updatedAt &&
      new Date(parameter.updatedAt).toLocaleString("pt-BR"),
  ].filter(Boolean);
  return `Definido pela administração${details.length ? ` (${details.join(", ")})` : ""}`;
}

/** Problem that must be fixed before saving, mirroring the API domain. */
function problem(
  parameter: OperationalParameter,
  value: ParameterValue,
): string | null {
  const control = parameter.control;
  if (control.kind === "text") {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return "Informe um valor.";
    return text.length > control.maxLength ||
      !new RegExp(control.pattern).test(text)
      ? "Use letras, números, ponto, hífen, dois-pontos ou sublinhado, começando por letra ou número, sem espaços."
      : null;
  }
  if (control.kind === "choice")
    return control.refused.includes(String(value))
      ? "Esta opção não é permitida neste ambiente."
      : null;
  return null;
}

const same = (a: ParameterValue, b: ParameterValue) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Owner administration of the operational parameters, grouped by subject. */
export function ParametersPanel({ token }: { token: string }) {
  // Cards remount when a saved value returns a new version; their messages
  // live here so they survive that remount.
  const [notices, setNotices] = useState<Partial<Record<Key, string>>>({});
  const view = useQuery({
    queryKey: ["identity-parameters", token],
    queryFn: ({ signal }) => getParameters(token, signal),
  });
  if (view.isPending) return <p role="status">Carregando os parâmetros…</p>;
  if (view.error || !view.data)
    return <p role="alert">{identityMessage(view.error)}</p>;
  const data = view.data;
  return (
    <div className="admin-parameters">
      <SectionCard
        title="Parâmetros"
        description="Ajuste o comportamento do IA-MNS sem reiniciar o servidor. Senhas, chaves e endereços de infraestrutura ficam na configuração do servidor."
      >
        <p className="identity-policy-banner" role="note">
          {data.production
            ? "Ambiente de produção: opções reservadas a desenvolvimento e testes ficam indisponíveis."
            : "Ambiente de desenvolvimento ou testes: algumas opções de diagnóstico só existem aqui. Ao publicar em produção, revise esta página."}
        </p>
      </SectionCard>
      <div className="admin-parameter-groups">
        {groups.map((group) => (
          <section
            key={group.id}
            className="identity-parameter-group"
            data-group={group.id}
            aria-labelledby={`parameters-${group.id}`}
          >
            <h3 id={`parameters-${group.id}`}>{group.title}</h3>
            <div className="admin-parameter-grid">
              {group.id === "access" && <ProviderGroupsCard token={token} />}
              {data.parameters
                .filter((parameter) => parameter.group === group.id)
                .map((parameter) => (
                  <ParameterCard
                    key={`${parameter.key}:${parameter.version}`}
                    token={token}
                    parameter={parameter}
                    notice={notices[parameter.key] ?? null}
                    setNotice={(notice) =>
                      setNotices((current) => ({
                        ...current,
                        [parameter.key]: notice ?? undefined,
                      }))
                    }
                  />
                ))}
            </div>
          </section>
        ))}
      </div>
      <History view={data} />
    </div>
  );
}

function ProviderGroupsCard({ token }: { token: string }) {
  const view = useQuery({
    queryKey: ["identity-provider-groups", token],
    queryFn: ({ signal }) => getProviderGroups(token, signal),
  });
  const groups = useQuery({
    queryKey: ["identity-groups", token],
    queryFn: ({ signal }) => listGroups(token, signal),
  });
  const [notices, setNotices] = useState<Record<string, string>>({});
  return (
    <SectionCard
      title="Grupo de Usuário padrão por vínculo"
      description="Ao entrar pelo sistema indicado, a pessoa é incluída automaticamente no grupo escolhido e recebe suas permissões e restrições. Cadastre os grupos e ajuste suas permissões na seção Grupos."
    >
      <p className="identity-hint">
        A escolha vale no próximo login pelo sistema, inclusive para pessoas já
        cadastradas. Entrar com senha do IA-MNS não inclui a pessoa em um grupo
        por vínculo. Trocar ou desativar o padrão mantém as participações
        existentes; remova-as em Grupos quando necessário.
      </p>
      {view.error || groups.error ? (
        <p role="alert">{identityMessage(view.error ?? groups.error)}</p>
      ) : !view.data || !groups.data ? (
        <p role="status">Carregando os grupos padrão…</p>
      ) : (
        view.data.items.map((item) => (
          <ProviderGroupForm
            key={`${item.provider}:${item.version}`}
            token={token}
            item={item}
            groups={groups.data.items}
            notice={notices[item.provider] ?? null}
            setNotice={(notice) =>
              setNotices((current) => ({
                ...current,
                [item.provider]: notice ?? "",
              }))
            }
          />
        ))
      )}
    </SectionCard>
  );
}

function ProviderGroupForm({
  token,
  item,
  groups,
  notice,
  setNotice,
}: {
  token: string;
  item: ProviderGroups["items"][number];
  groups: GroupList["items"];
  notice: string | null;
  setNotice: (notice: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState(item.groupId ?? "");
  const save = useMutation({
    mutationFn: () =>
      setProviderGroup(token, item.provider, {
        groupId: groupId || null,
        version: item.version,
      }),
    onSuccess: () => {
      setNotice("Grupo padrão salvo. Vale no próximo login pelo sistema.");
      void queryClient.invalidateQueries({
        queryKey: ["identity-provider-groups"],
      });
    },
    onError: (error) => {
      if (isFailure(error, "IDENTITY_PROVIDER_GROUP_CONFLICT")) {
        setNotice(identityMessage(error));
        void queryClient.invalidateQueries({
          queryKey: ["identity-provider-groups"],
        });
      }
      if (isFailure(error, "IDENTITY_GROUP_NOT_FOUND"))
        void queryClient.invalidateQueries({ queryKey: ["identity-groups"] });
    },
  });
  const title = item.provider === "pdt" ? "PDT Connect" : "Sankhya";
  return (
    <form
      className="identity-parameter"
      onSubmit={(event) => {
        event.preventDefault();
        if (groupId !== (item.groupId ?? "")) save.mutate();
      }}
    >
      <SelectField
        label={`Grupo padrão — ${title}`}
        id={`provider-group-${item.provider}`}
        value={groupId}
        disabled={save.isPending}
        onChange={(event) => {
          setGroupId(event.target.value);
          setNotice(null);
          save.reset();
        }}
      >
        <option value="">Nenhum grupo</option>
        {item.groupId && !groups.some((group) => group.id === item.groupId) && (
          <option value={item.groupId}>Grupo atual (fora desta lista)</option>
        )}
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </SelectField>
      {!groups.length && (
        <p className="identity-hint">
          Crie um grupo na seção Grupos para selecioná-lo aqui.
        </p>
      )}
      <div className="identity-actions">
        <Button
          type="submit"
          loading={save.isPending}
          disabled={save.isPending || groupId === (item.groupId ?? "")}
        >
          Salvar grupo — {title}
        </Button>
      </div>
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {save.error &&
        !isFailure(save.error, "IDENTITY_PROVIDER_GROUP_CONFLICT") && (
          <p role="alert">
            {isFailure(save.error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED")
              ? "Confirme sua identidade em Minha conta (senha e código) e salve novamente."
              : identityMessage(save.error)}
          </p>
        )}
    </form>
  );
}

function ParameterCard({
  token,
  parameter,
  notice,
  setNotice,
}: {
  token: string;
  parameter: OperationalParameter;
  notice: string | null;
  setNotice: (notice: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ParameterValue>(parameter.value);
  const text = presentation[parameter.key];
  const id = `parameter-${parameter.key.replace(".", "-")}`;
  const invalid = problem(parameter, draft);
  const changed = !same(
    typeof draft === "string" ? draft.trim() : draft,
    parameter.value,
  );
  const save = useMutation({
    mutationFn: (value: ParameterValue | null) =>
      updateParameter(token, parameter.key, value, parameter.version),
    onSuccess: (_result, value) => {
      setNotice(
        value === null
          ? "Padrão restaurado. Já está em vigor."
          : "Parâmetro salvo. Já está em vigor.",
      );
      void queryClient.invalidateQueries({
        queryKey: ["identity-parameters"],
      });
    },
    onError: (error) => {
      // Show the other owner's change so this one is made on current values.
      if (isFailure(error, "IDENTITY_PARAMETER_CONFLICT"))
        void queryClient.invalidateQueries({
          queryKey: ["identity-parameters"],
        });
    },
  });
  const change = (value: ParameterValue) => {
    setNotice(null);
    save.reset();
    setDraft(value);
  };
  const control = parameter.control;
  return (
    <form
      className="identity-parameter"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid && changed)
          save.mutate(typeof draft === "string" ? draft.trim() : draft);
      }}
    >
      <div className="identity-policy-field">
        {control.kind === "set" ? (
          <fieldset aria-describedby={`${id}-help`}>
            <legend id={`${id}-label`}>{text.label}</legend>
            {control.options.map((option) => {
              const values = Array.isArray(draft) ? draft : [];
              return (
                <label className="identity-check" key={option.value}>
                  <input
                    type="checkbox"
                    checked={values.includes(option.value)}
                    onChange={(event) =>
                      change(
                        control.options
                          .map((item) => item.value)
                          .filter((item) =>
                            item === option.value
                              ? event.target.checked
                              : values.includes(item),
                          ),
                      )
                    }
                  />{" "}
                  {option.label}
                </label>
              );
            })}
          </fieldset>
        ) : (
          <>
            {control.kind === "choice" ? (
              <SelectField
                label={text.label}
                id={id}
                value={String(draft)}
                aria-describedby={`${id}-help`}
                onChange={(event) => change(event.target.value)}
              >
                {control.options.map((option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={control.refused.includes(option)}
                  >
                    {text.options?.[option] ?? option}
                    {same(option, parameter.defaultValue) ? " (padrão)" : ""}
                    {control.refused.includes(option)
                      ? " — indisponível neste ambiente"
                      : ""}
                  </option>
                ))}
              </SelectField>
            ) : (
              <TextField
                label={text.label}
                id={id}
                value={String(draft)}
                maxLength={control.maxLength}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ""}`}
                onChange={(event) => change(event.target.value)}
              />
            )}
          </>
        )}
        <p className="identity-hint" id={`${id}-help`}>
          {text.help}
        </p>
        {invalid && (
          <p className="identity-policy-warning" id={`${id}-error`}>
            {invalid}
          </p>
        )}
        {parameter.key === "ai.traceLevel" && draft === "content" && (
          <p className="identity-policy-warning">
            Guarda o conteúdo confidencial das conversas junto com cada
            resposta. Use só para diagnóstico e volte para "Somente metadados"
            em seguida.
          </p>
        )}
        {parameter.storedInvalid && (
          <p className="identity-policy-warning" role="note">
            O valor salvo não é válido neste ambiente; o IA-MNS está usando{" "}
            {describe(parameter, parameter.value)}.
          </p>
        )}
        <dl className="identity-parameter-facts">
          <div>
            <dt>Em uso</dt>
            <dd>{describe(parameter, parameter.value)}</dd>
          </div>
          <div>
            <dt>Origem</dt>
            <dd>{origin(parameter)}</dd>
          </div>
          <div>
            <dt>Padrão</dt>
            <dd>{describe(parameter, parameter.defaultValue)}</dd>
          </div>
          <div>
            <dt>Quando vale</dt>
            <dd>{effectText[parameter.effect]}</dd>
          </div>
        </dl>
      </div>
      <div className="identity-actions">
        <Button
          type="submit"
          loading={save.isPending}
          disabled={save.isPending || !changed || Boolean(invalid)}
        >
          Salvar
        </Button>
        {parameter.source === "administration" && (
          <Button
            type="button"
            variant="secondary"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            Restaurar padrão
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {save.error && (
        <p role="alert" className="admin-notice admin-notice-error">
          {isFailure(save.error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED")
            ? "Confirme sua identidade em Minha conta (senha e código) e salve novamente."
            : identityMessage(save.error)}
        </p>
      )}
    </form>
  );
}

function History({ view }: { view: ParametersView }) {
  const byKey = new Map(view.parameters.map((item) => [item.key, item]));
  return (
    <SectionCard title="Alterações recentes" className="admin-history">
      {!view.history.length && (
        <p className="identity-hint">
          Nenhuma alteração: os padrões desta instalação estão em uso.
        </p>
      )}
      <ul className="identity-list identity-audit">
        {view.history.map((entry, index) => {
          const parameter = byKey.get(entry.details.parameter as Key);
          const label = parameter
            ? presentation[parameter.key].label
            : String(entry.details.parameter);
          const change = parameter
            ? `${describe(parameter, entry.details.from)} → ${describe(parameter, entry.details.to)}`
            : "valor alterado";
          return (
            <li key={index}>
              <span>
                {new Date(entry.occurredAt).toLocaleString("pt-BR")} ·{" "}
                {entry.actorName ?? "Administrador"} · {label}: {change}
                {entry.details.reset ? " (padrão restaurado)" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
