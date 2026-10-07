import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSecurityPolicy,
  updateSecurityPolicy,
  type SecurityPolicy,
  type SecurityPolicyView,
} from "./api.js";
import { identityMessage, isFailure } from "./messages.js";
import { useIdentity } from "./session.js";

type DurationField = Exclude<keyof SecurityPolicy, "mfaRequirement">;

/** Human durations: minutes for session windows, days for remembered browsers. */
export function formatMinutes(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} ${days === 1 ? "dia" : "dias"}`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}
const formatDays = (days: number) =>
  days === 0
    ? "a cada novo login"
    : `lembrar o navegador por ${days} ${days === 1 ? "dia" : "dias"}`;

const fields: Record<
  DurationField,
  {
    label: string;
    help: string;
    risk: string;
    presets: number[];
    format: (value: number) => string;
  }
> = {
  sessionMaxMinutes: {
    label: "Duração máxima de uma sessão",
    help: "Depois desse tempo a pessoa entra novamente, mesmo que esteja usando o IA-MNS.",
    risk: "Uma sessão longa continua válida por mais tempo se o computador ficar com outra pessoa ou se o navegador for comprometido.",
    presets: [60, 240, 480, 720, 1440, 4320, 10080, 20160, 43200],
    format: formatMinutes,
  },
  idleTimeoutMinutes: {
    label: "Encerrar a sessão após inatividade",
    help: "Tempo sem uso (cliques, digitação ou rolagem) até ser preciso entrar de novo. Usar o IA-MNS renova esse prazo.",
    risk: "Um navegador esquecido aberto e sem uso continua conectado por mais tempo.",
    presets: [15, 30, 60, 120, 240, 480, 1440, 4320, 10080],
    format: formatMinutes,
  },
  recentAuthMinutes: {
    label: "Confirmação para alterar a própria conta",
    help: "Por quanto tempo depois de entrar (ou confirmar a identidade) a pessoa pode trocar a senha, vincular sistemas ou mudar a verificação em duas etapas sem confirmar de novo.",
    risk: "Quem usar um navegador já conectado pode alterar senha e vínculos sem provar que é o titular.",
    presets: [5, 10, 15, 30, 60, 240, 720, 1440],
    format: formatMinutes,
  },
  adminRecentAuthMinutes: {
    label: "Confirmação para ações administrativas",
    help: "Por quanto tempo depois de entrar com senha e código (ou confirmar) um administrador pode alterar pessoas, permissões e esta política sem confirmar de novo.",
    risk: "Quem usar o navegador de um administrador já conectado pode alterar pessoas, permissões e esta política.",
    presets: [5, 15, 30, 60, 120, 240],
    format: formatMinutes,
  },
  rememberDeviceDays: {
    label: "Pedir o código de verificação novamente",
    help: 'Ao entrar com usuário e senha, a pessoa pode marcar o navegador como confiável e deixar de informar o código nesse período. Administradores sempre informam o código, exceto quando a verificação em duas etapas é "Não obrigatória" (só fora de produção).',
    risk: "Quem tiver acesso ao navegador lembrado e à senha entra sem o segundo fator.",
    presets: [0, 7, 14, 30, 60, 90],
    format: formatDays,
  },
};
const order: DurationField[] = [
  "sessionMaxMinutes",
  "idleTimeoutMinutes",
  "recentAuthMinutes",
  "adminRecentAuthMinutes",
  "rememberDeviceDays",
];
const requirementLabel: Record<SecurityPolicy["mfaRequirement"], string> = {
  everyone: "Obrigatória para todos que entram com usuário e senha",
  administrators: "Obrigatória para administradores",
  none: "Não obrigatória",
};
const fieldLabel: Record<keyof SecurityPolicy, string> = {
  ...Object.fromEntries(order.map((field) => [field, fields[field].label])),
  mfaRequirement: "Verificação em duas etapas",
} as Record<keyof SecurityPolicy, string>;

function describe(field: keyof SecurityPolicy, value: unknown): string {
  if (field === "mfaRequirement")
    return requirementLabel[value as SecurityPolicy["mfaRequirement"]] ?? "?";
  return typeof value === "number" ? fields[field].format(value) : "?";
}

function reducesSecurity(
  policy: SecurityPolicy,
  limits: SecurityPolicyView["limits"],
): (keyof SecurityPolicy)[] {
  const reduced: (keyof SecurityPolicy)[] = order.filter(
    (field) => policy[field] > limits[field].recommendedMax,
  );
  if (policy.mfaRequirement === "none") reduced.push("mfaRequirement");
  return reduced;
}

/** Owner administration of session duration, inactivity and second-factor rules. */
export function SecurityPolicyPanel({ token }: { token: string }) {
  // The form remounts when a saved policy returns a new version; the save
  // confirmation lives here so it survives that remount.
  const [notice, setNotice] = useState<string | null>(null);
  const view = useQuery({
    queryKey: ["identity-security-policy", token],
    queryFn: ({ signal }) => getSecurityPolicy(token, signal),
  });
  if (view.isPending) return <p role="status">Carregando a política…</p>;
  if (view.error || !view.data)
    return <p role="alert">{identityMessage(view.error)}</p>;
  return (
    <PolicyForm
      key={view.data.updatedAt ?? "defaults"}
      token={token}
      view={view.data}
      notice={notice}
      setNotice={setNotice}
    />
  );
}

function PolicyForm({
  token,
  view,
  notice,
  setNotice,
}: {
  token: string;
  view: SecurityPolicyView;
  notice: string | null;
  setNotice: (notice: string | null) => void;
}) {
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SecurityPolicy>(view.configured);
  const [acknowledged, setAcknowledged] = useState(false);
  const reduced = reducesSecurity(draft, view.limits);
  const alreadyAccepted = reducesSecurity(view.configured, view.limits);
  const needsAcknowledgement = reduced.some(
    (field) => !alreadyAccepted.includes(field),
  );
  const changed = (Object.keys(draft) as (keyof SecurityPolicy)[]).some(
    (field) => draft[field] !== view.configured[field],
  );
  const save = useMutation({
    mutationFn: () => updateSecurityPolicy(token, draft, acknowledged),
    onSuccess: (result) => {
      setNotice(
        result.endedSessions
          ? `Política salva. ${result.endedSessions} ${result.endedSessions === 1 ? "sessão aberta foi encerrada" : "sessões abertas foram encerradas"} pelos novos limites.`
          : "Política salva. As sessões abertas já seguem os novos limites.",
      );
      void queryClient.invalidateQueries({
        queryKey: ["identity-security-policy"],
      });
      if (result.currentSessionEnded) void identity.signOut();
    },
  });
  const set = <K extends keyof SecurityPolicy>(
    field: K,
    value: SecurityPolicy[K],
  ) => {
    setNotice(null);
    setDraft((current) => {
      const next = { ...current, [field]: value };
      // Windows never outlast the session; follow a shorter session.
      if (field === "sessionMaxMinutes") {
        const session = value as number;
        next.idleTimeoutMinutes = Math.min(next.idleTimeoutMinutes, session);
        next.recentAuthMinutes = Math.min(next.recentAuthMinutes, session);
      }
      return next;
    });
  };
  const limitFor = (field: DurationField) =>
    field === "idleTimeoutMinutes" || field === "recentAuthMinutes"
      ? Math.min(view.limits[field].max, draft.sessionMaxMinutes)
      : view.limits[field].max;
  return (
    <section
      className="identity-card identity-policy"
      aria-labelledby="identity-policy-title"
    >
      <h2 id="identity-policy-title">Autenticação e segurança</h2>
      <p className="identity-hint">
        Defina por quanto tempo as pessoas permanecem conectadas e quando o
        IA-MNS pede confirmação. As regras valem para quem entra pelo endereço
        do IA-MNS; dentro do PDT Connect e do Sankhya a sessão acompanha o
        sistema hospedeiro.
      </p>
      {view.production ? (
        <p className="identity-policy-banner" role="note">
          Ambiente de produção: administradores sempre usam a verificação em
          duas etapas.
        </p>
      ) : (
        <p className="identity-policy-banner" role="note">
          Ambiente de desenvolvimento ou testes: é possível usar uma política
          mais permissiva. Ao publicar em produção, revise esta página.
        </p>
      )}
      {view.configured.mfaRequirement !== view.effective.mfaRequirement && (
        <p className="identity-auth-error" role="alert">
          A política salva dispensa o segundo fator, mas em produção ele
          continua obrigatório para administradores.
        </p>
      )}
      <form
        className="identity-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {order.map((field) => {
          const options = [
            ...new Set([...fields[field].presets, draft[field]]),
          ].sort((a, b) => a - b);
          const warning = draft[field] > view.limits[field].recommendedMax;
          return (
            <div className="identity-policy-field" key={field}>
              <label htmlFor={`policy-${field}`}>{fields[field].label}</label>
              <select
                id={`policy-${field}`}
                value={draft[field]}
                aria-describedby={`policy-${field}-help`}
                onChange={(event) => set(field, Number(event.target.value))}
              >
                {options.map((value) => (
                  <option
                    key={value}
                    value={value}
                    disabled={
                      value < view.limits[field].min || value > limitFor(field)
                    }
                  >
                    {fields[field].format(value)}
                    {value === view.defaults[field] ? " (padrão)" : ""}
                    {value > view.limits[field].recommendedMax
                      ? " — reduz a segurança"
                      : ""}
                  </option>
                ))}
              </select>
              <p className="identity-hint" id={`policy-${field}-help`}>
                {fields[field].help}
              </p>
              {warning && (
                <p className="identity-policy-warning">
                  Reduz a segurança: {fields[field].risk}
                </p>
              )}
            </div>
          );
        })}
        <fieldset className="identity-policy-field">
          <legend>Verificação em duas etapas</legend>
          {(["everyone", "administrators", "none"] as const).map((value) => (
            <label className="identity-check" key={value}>
              <input
                type="radio"
                name="policy-mfa"
                value={value}
                checked={draft.mfaRequirement === value}
                disabled={value === "none" && view.production}
                onChange={() => set("mfaRequirement", value)}
              />{" "}
              {requirementLabel[value]}
              {value === view.defaults.mfaRequirement ? " (padrão)" : ""}
              {value === "none" ? " — apenas desenvolvimento e testes" : ""}
            </label>
          ))}
          <p className="identity-hint">
            Vale para quem entra com usuário e senha do IA-MNS. Quem entra pelo
            PDT Connect ou pelo Sankhya é protegido pelo sistema de origem;
            administradores confirmam com senha e código antes de administrar.
          </p>
          {draft.mfaRequirement === "none" && (
            <p className="identity-policy-warning">
              Reduz a segurança: administradores poderão alterar pessoas,
              permissões e esta política apenas com a senha, e também poderão
              ter o navegador lembrado.
            </p>
          )}
        </fieldset>
        {reduced.length > 0 && (
          <div className="identity-policy-summary" role="status">
            <p>
              <strong>Esta política reduz a segurança</strong> em:{" "}
              {reduced.map((field) => fieldLabel[field]).join(", ")}.
            </p>
            {needsAcknowledgement && (
              <label className="identity-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />{" "}
                Entendo os riscos e quero aplicar esta política
              </label>
            )}
          </div>
        )}
        <div className="identity-actions">
          <button
            disabled={
              save.isPending ||
              !changed ||
              (needsAcknowledgement && !acknowledged)
            }
          >
            Salvar política
          </button>
          <button
            type="button"
            className="identity-secondary"
            disabled={save.isPending}
            onClick={() => {
              setDraft({ ...view.defaults });
              setAcknowledged(false);
              setNotice(null);
            }}
          >
            Restaurar padrões recomendados
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {save.error && (
          <p role="alert">
            {isFailure(save.error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED")
              ? "Confirme sua identidade em Minha conta (senha e código) e salve novamente."
              : identityMessage(save.error)}
          </p>
        )}
      </form>
      <h3>Alterações recentes</h3>
      {!view.history.length && (
        <p className="identity-hint">
          Nenhuma alteração: os padrões recomendados estão em uso.
        </p>
      )}
      <ul className="identity-list identity-audit">
        {view.history.map((entry, index) => {
          const changes = (Object.keys(fieldLabel) as (keyof SecurityPolicy)[])
            .filter((field) => `${field}To` in entry.details)
            .map(
              (field) =>
                `${fieldLabel[field]}: ${describe(field, entry.details[`${field}From`])} → ${describe(field, entry.details[`${field}To`])}`,
            );
          return (
            <li key={index}>
              <span>
                {new Date(entry.occurredAt).toLocaleString("pt-BR")} ·{" "}
                {entry.actorName ?? "Administrador"} ·{" "}
                {changes.length ? changes.join("; ") : "sem mudança de valores"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
