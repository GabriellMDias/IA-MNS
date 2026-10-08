import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminUnlink,
  createPerson,
  getPerson,
  issueEnrollment,
  issueLinkInvitation,
  linkSankhyaUser,
  listPersons,
  mergePersons,
  resetLocal,
  revokePersonSessions,
  searchSankhyaUsers,
  setGrant,
  setOwner,
  setPersonStatus,
  type Provider,
  type SankhyaUsers,
} from "./api.js";
import { useIdentityStart } from "./session.js";
import { SecurityPolicyPanel } from "./security-policy.js";
import { ParametersPanel } from "./parameters.js";
import { identityMessage, isFailure } from "./messages.js";

const providerName: Record<Provider, string> = {
  pdt: "PDT Connect",
  sankhya: "Sankhya",
};
const auditName: Record<string, string> = {
  "person.provisioned": "Perfil criado no primeiro acesso",
  "person.created": "Perfil criado pelo administrador",
  "person.merged": "Perfis unificados",
  "person.disabled": "Pessoa desativada",
  "person.enabled": "Pessoa reativada",
  "link.added": "Sistema vinculado",
  "link.removed": "Vínculo removido",
  "link.invitation_issued": "Convite de vínculo emitido",
  "grant.added": "Capacidade concedida",
  "grant.removed": "Capacidade revogada",
  "role.added": "Administrador principal atribuído",
  "role.removed": "Administrador principal removido",
  "session.started": "Sessão iniciada",
  "session.logout": "Saída",
  "mfa.enabled": "Duas etapas ativadas",
  "credential.enrollment_issued": "Convite de acesso local emitido",
  "credential.reset_issued": "Redefinição de acesso emitida",
};

type Invite = { label: string; url: string };
type SankhyaUser = SankhyaUsers["items"][number];

function inviteLink(kind: "enrollment" | "reset", token: string): Invite {
  return {
    label:
      kind === "enrollment"
        ? "Convite para criar usuário e senha do IA-MNS"
        : "Convite para redefinir o acesso local",
    url: `${window.location.origin}/identidade/convite#${kind}=${token}`,
  };
}
function linkInvite(provider: Provider, token: string): Invite {
  return {
    label: `Convite para vincular a conta do ${providerName[provider]}`,
    url: `${window.location.origin}/identidade/vincular#${token}`,
  };
}

export function AdminPage() {
  const identity = useIdentityStart();
  if (!identity.token)
    return (
      <main className="identity-page">
        <p>
          <Link to="/entrar">Entre</Link> como administrador para continuar.
        </p>
      </main>
    );
  return <Admin token={identity.token} />;
}

/** Finds a real Sankhya user in the ERP directory; typed codes are never trusted. */
function SankhyaPicker({
  token,
  actionLabel,
  onSelect,
  busy,
}: {
  token: string;
  actionLabel: string;
  onSelect: (user: SankhyaUser) => void;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const users = useQuery({
    queryKey: ["identity-sankhya-users", token, query],
    queryFn: ({ signal }) => searchSankhyaUsers(token, query, signal),
    enabled: query.length >= 2,
  });
  return (
    <div className="identity-picker">
      <form
        className="identity-inline"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(text.trim());
        }}
      >
        <label htmlFor="identity-sankhya-search">
          Usuário do Sankhya (login ou nome)
        </label>
        <input
          id="identity-sankhya-search"
          value={text}
          minLength={2}
          maxLength={60}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="identity-secondary">Buscar</button>
      </form>
      {users.error && <p role="alert">{identityMessage(users.error)}</p>}
      {users.data && !users.data.items.length && (
        <p className="identity-hint">Nenhum usuário encontrado.</p>
      )}
      <ul className="identity-list">
        {users.data?.items.map((user) => (
          <li key={user.codusu}>
            <span>
              <strong>{user.name ?? user.login}</strong> · {user.login} · código{" "}
              {user.codusu}
              {user.email ? ` · ${user.email}` : ""}
              {user.accessExpired ? " · acesso expirado no Sankhya" : ""}
              {user.linkedTo
                ? ` · já vinculado a ${user.linkedTo.displayName}`
                : ""}
            </span>
            <button
              type="button"
              disabled={busy || user.accessExpired || user.linkedTo !== null}
              onClick={() => onSelect(user)}
            >
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreatePerson({
  token,
  capabilities,
  onCreated,
}: {
  token: string;
  capabilities: { sankhyaDirectory: boolean; linkInvitations: Provider[] };
  onCreated: (personId: string, invites: Invite[]) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [local, setLocal] = useState(true);
  const [sankhyaUser, setSankhyaUser] = useState<SankhyaUser | null>(null);
  const [invitations, setInvitations] = useState<Provider[]>([]);
  const offered = capabilities.linkInvitations.filter(
    (provider) => !(provider === "sankhya" && sankhyaUser),
  );
  const create = useMutation({
    mutationFn: () =>
      createPerson(token, {
        displayName: name,
        localInvitation: local,
        ...(sankhyaUser ? { sankhyaUser: sankhyaUser.codusu } : {}),
        linkInvitations: invitations.filter((item) => offered.includes(item)),
      }),
    onSuccess: (created) => {
      onCreated(created.personId, [
        ...(created.enrollmentToken
          ? [inviteLink("enrollment", created.enrollmentToken)]
          : []),
        ...created.linkInvitations.map((item) =>
          linkInvite(item.provider, item.token),
        ),
      ]);
      setName("");
      setSankhyaUser(null);
      setInvitations([]);
      void queryClient.invalidateQueries({ queryKey: ["identity-persons"] });
    },
  });
  return (
    <section className="identity-card" aria-labelledby="identity-create-title">
      <h2 id="identity-create-title">Nova pessoa</h2>
      <p className="identity-hint">
        Pessoas que entram pelo PDT Connect ou pelo Sankhya têm o perfil criado
        no primeiro acesso. Crie aqui quem ainda não entrou ou precisa de
        usuário e senha do IA-MNS.
      </p>
      <form
        className="identity-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label htmlFor="identity-new-person">Nome</label>
        <input
          id="identity-new-person"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
        />
        <label>
          <input
            type="checkbox"
            checked={local}
            onChange={(event) => setLocal(event.target.checked)}
          />{" "}
          Convite para criar usuário e senha do IA-MNS
        </label>
        {offered.map((provider) => (
          <label key={provider}>
            <input
              type="checkbox"
              checked={invitations.includes(provider)}
              onChange={(event) =>
                setInvitations((current) =>
                  event.target.checked
                    ? [...current, provider]
                    : current.filter((item) => item !== provider),
                )
              }
            />{" "}
            Convite para a pessoa vincular a conta do {providerName[provider]}
          </label>
        ))}
        {sankhyaUser && (
          <p>
            Usuário do Sankhya:{" "}
            <strong>{sankhyaUser.name ?? sankhyaUser.login}</strong> (
            {sankhyaUser.login}){" "}
            <button
              type="button"
              className="identity-secondary"
              onClick={() => setSankhyaUser(null)}
            >
              Remover
            </button>
          </p>
        )}
        <button disabled={create.isPending}>Criar pessoa</button>
        {create.error && <p role="alert">{identityMessage(create.error)}</p>}
      </form>
      {capabilities.sankhyaDirectory && !sankhyaUser && (
        <SankhyaPicker
          token={token}
          actionLabel="Associar"
          onSelect={setSankhyaUser}
        />
      )}
    </section>
  );
}

function Admin({ token }: { token: string }) {
  const search = useSearch({ strict: false });
  const section = search.secao ?? "pessoas";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const persons = useQuery({
    queryKey: ["identity-persons", token, query],
    queryFn: ({ signal }) => listPersons(token, query, undefined, signal),
  });
  if (persons.error)
    return (
      <main className="identity-page">
        <h1>Administração</h1>
        <p role="alert">
          {isFailure(persons.error, "IDENTITY_STRONG_AUTHENTICATION_REQUIRED")
            ? "Ative a verificação em duas etapas em Minha conta e entre novamente para administrar."
            : identityMessage(persons.error)}
        </p>
        <Link to="/conta">Minha conta</Link>
      </main>
    );
  const capabilities = persons.data?.capabilities ?? {
    sankhyaDirectory: false,
    linkInvitations: [],
  };
  return (
    <main className="identity-page identity-wide">
      <p>
        <Link to="/">← Voltar para as conversas</Link>
      </p>
      <h1>Administração</h1>
      <nav className="identity-tabs" aria-label="Seções da administração">
        {/* The tabs share the route, so the active one follows the search. */}
        {(
          [
            ["pessoas", {}, "Pessoas"],
            ["seguranca", { secao: "seguranca" }, "Autenticação e segurança"],
            ["parametros", { secao: "parametros" }, "Parâmetros"],
          ] as const
        ).map(([id, target, label]) => (
          <Link
            key={id}
            to="/admin"
            search={target}
            activeOptions={{ exact: true, includeSearch: true }}
            className={section === id ? "is-active" : undefined}
            aria-current={section === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {section === "seguranca" ? (
        <SecurityPolicyPanel token={token} />
      ) : section === "parametros" ? (
        <ParametersPanel token={token} />
      ) : (
        <div className="identity-admin">
          <section aria-label="Pessoas">
            <label htmlFor="identity-person-search">Buscar pessoa</label>
            <input
              id="identity-person-search"
              value={query}
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="identity-list identity-people">
              {persons.data?.items.map((person) => (
                <li key={person.id}>
                  <button
                    className={selected === person.id ? "is-selected" : ""}
                    onClick={() => setSelected(person.id)}
                  >
                    <strong>{person.displayName}</strong>
                    <span>
                      {[
                        person.login,
                        ...person.providers.map((item) => providerName[item]),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {person.owner ? " · administrador" : ""}
                      {person.status === "disabled" ? " · desativada" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <CreatePerson
              token={token}
              capabilities={capabilities}
              onCreated={(personId, created) => {
                setSelected(personId);
                setInvites(created);
              }}
            />
            {invites.length > 0 && (
              <div className="identity-card" role="status">
                <p>
                  Envie cada convite de uso único (válido por 72 horas) à pessoa
                  por um canal seguro:
                </p>
                <ul className="identity-list">
                  {invites.map((invite) => (
                    <li key={invite.url}>
                      <span>
                        {invite.label}: <code>{invite.url}</code>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          {selected && (
            <PersonDetail
              token={token}
              personId={selected}
              onInvite={(invite) => setInvites([invite])}
              onMerged={setSelected}
            />
          )}
        </div>
      )}
    </main>
  );
}

/** Owner consolidation: the selected profile is absorbed into this one. */
function MergeInto({
  token,
  personId,
  displayName,
  busy,
  onMerge,
}: {
  token: string;
  personId: string;
  displayName: string;
  busy: boolean;
  onMerge: (sourcePersonId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<{ id: string; name: string } | null>(
    null,
  );
  const candidates = useQuery({
    queryKey: ["identity-persons", token, query],
    queryFn: ({ signal }) => listPersons(token, query, undefined, signal),
    enabled: query.trim().length >= 2,
  });
  return (
    <div className="identity-picker">
      <label htmlFor="identity-merge-search">
        Outro perfil da mesma pessoa
      </label>
      <input
        id="identity-merge-search"
        value={query}
        maxLength={120}
        onChange={(event) => {
          setQuery(event.target.value);
          setSource(null);
        }}
      />
      <ul className="identity-list">
        {candidates.data?.items
          .filter((item) => item.id !== personId)
          .map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.displayName}</strong>{" "}
                {[
                  item.login,
                  ...item.providers.map((provider) => providerName[provider]),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                className="identity-secondary"
                onClick={() =>
                  setSource({ id: item.id, name: item.displayName })
                }
              >
                Selecionar
              </button>
            </li>
          ))}
      </ul>
      {source && (
        <p className="identity-warning">
          As formas de entrada, capacidades e conversas de{" "}
          <strong>{source.name}</strong> passarão para{" "}
          <strong>{displayName}</strong>, e {source.name} deixará de existir.
          Use apenas quando tiver certeza de que é a mesma pessoa.{" "}
          <button disabled={busy} onClick={() => onMerge(source.id)}>
            Unificar
          </button>
        </p>
      )}
    </div>
  );
}

function PersonDetail({
  token,
  personId,
  onInvite,
  onMerged,
}: {
  token: string;
  personId: string;
  onInvite: (invite: Invite) => void;
  onMerged: (personId: string) => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["identity-person", token, personId],
    queryFn: ({ signal }) => getPerson(token, personId, signal),
  });
  const action = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["identity-person"] });
      void queryClient.invalidateQueries({ queryKey: ["identity-persons"] });
    },
  });
  if (detail.isPending) return <p role="status">Carregando…</p>;
  if (detail.error || !detail.data)
    return <p role="alert">{identityMessage(detail.error)}</p>;
  const { person, catalog, audit, capabilities } = detail.data;
  const linked = (provider: Provider) =>
    person.links.some((link) => link.provider === provider);
  return (
    <section className="identity-card" aria-labelledby="identity-person-title">
      <h2 id="identity-person-title">{person.displayName}</h2>
      {action.error && (
        <p role="alert">
          {isFailure(action.error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED")
            ? "Confirme sua identidade em Minha conta (senha e código) e repita a alteração."
            : identityMessage(action.error)}
        </p>
      )}
      <p>Situação: {person.status === "active" ? "ativa" : "desativada"}</p>
      <h3>Capacidades</h3>
      <ul className="identity-list">
        {catalog.map((item) => {
          const explicit = person.grants.includes(item.permission);
          const effective = person.permissions.includes(item.permission);
          return (
            <li key={item.permission}>
              <label>
                <input
                  type="checkbox"
                  checked={explicit}
                  disabled={action.isPending}
                  onChange={(event) =>
                    action.mutate(() =>
                      setGrant(
                        token,
                        person.id,
                        item.permission,
                        event.target.checked,
                      ),
                    )
                  }
                />{" "}
                {item.title} <code>{item.permission}</code> ·{" "}
                {item.access === "read"
                  ? "leitura"
                  : item.access === "write"
                    ? "escrita"
                    : "sensível"}
              </label>
              <span className="identity-hint">
                {effective ? "efetiva" : "não efetiva"}
                {!explicit && effective && item.autoGrantProviders.length
                  ? ` · automática por vínculo ${item.autoGrantProviders.map((provider) => providerName[provider]).join(", ")}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="identity-actions">
        <button
          disabled={action.isPending}
          onClick={() =>
            action.mutate(() => setOwner(token, person.id, !person.owner))
          }
        >
          {person.owner
            ? "Remover administrador principal"
            : "Tornar administrador principal"}
        </button>
        <button
          className="identity-secondary"
          disabled={action.isPending}
          onClick={() =>
            action.mutate(() =>
              setPersonStatus(
                token,
                person.id,
                person.status === "active" ? "disabled" : "active",
              ),
            )
          }
        >
          {person.status === "active" ? "Desativar" : "Reativar"}
        </button>
        <button
          className="identity-secondary"
          disabled={action.isPending}
          onClick={() =>
            action.mutate(() => revokePersonSessions(token, person.id))
          }
        >
          Encerrar sessões
        </button>
        {person.local && (
          <button
            className="identity-secondary"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(async () =>
                onInvite(
                  inviteLink(
                    "reset",
                    (await resetLocal(token, person.id)).resetToken,
                  ),
                ),
              )
            }
          >
            Redefinir acesso local
          </button>
        )}
      </div>
      <h3>Formas de entrada</h3>
      <ul className="identity-list">
        {person.local && (
          <li>
            Usuário IA-MNS: {person.local.login}{" "}
            {person.local.totpEnabled ? "· duas etapas" : ""}
          </li>
        )}
        {person.links.map((link) => (
          <li key={link.id}>
            <span>
              {providerName[link.provider]}{" "}
              {link.label ? `· ${link.label}` : ""}
              {link.establishedBy === "directory"
                ? " · associado pelo administrador"
                : ""}
            </span>
            <button
              className="identity-secondary"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(() => adminUnlink(token, person.id, link.id))
              }
            >
              Remover vínculo
            </button>
          </li>
        ))}
      </ul>
      {person.status === "active" && (
        <div className="identity-actions">
          {!person.local && (
            <button
              className="identity-secondary"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(async () =>
                  onInvite(
                    inviteLink(
                      "enrollment",
                      (await issueEnrollment(token, person.id)).enrollmentToken,
                    ),
                  ),
                )
              }
            >
              Convite para usuário e senha
            </button>
          )}
          {capabilities.linkInvitations
            .filter((provider) => !linked(provider))
            .map((provider) => (
              <button
                key={provider}
                className="identity-secondary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(async () =>
                    onInvite(
                      linkInvite(
                        provider,
                        (await issueLinkInvitation(token, person.id, provider))
                          .token,
                      ),
                    ),
                  )
                }
              >
                Convite para vincular {providerName[provider]}
              </button>
            ))}
        </div>
      )}
      {person.status === "active" &&
        capabilities.sankhyaDirectory &&
        !linked("sankhya") && (
          <>
            <h3>Associar usuário do Sankhya</h3>
            <SankhyaPicker
              token={token}
              actionLabel="Associar a esta pessoa"
              busy={action.isPending}
              onSelect={(user) =>
                action.mutate(() =>
                  linkSankhyaUser(token, person.id, user.codusu),
                )
              }
            />
          </>
        )}
      {person.status === "active" && (
        <>
          <h3>Unificar perfis</h3>
          <MergeInto
            token={token}
            personId={person.id}
            displayName={person.displayName}
            busy={action.isPending}
            onMerge={(sourcePersonId) =>
              action.mutate(async () => {
                await mergePersons(token, person.id, sourcePersonId);
                onMerged(person.id);
              })
            }
          />
        </>
      )}
      <h3>Auditoria recente</h3>
      <ul className="identity-list identity-audit">
        {audit.map((event, index) => (
          <li key={index}>
            {new Date(event.occurredAt).toLocaleString("pt-BR")} ·{" "}
            {auditName[event.action] ?? event.action}
            {typeof event.details.permission === "string"
              ? ` (${event.details.permission})`
              : ""}
            {typeof event.details.provider === "string"
              ? ` (${providerName[event.details.provider as Provider] ?? event.details.provider})`
              : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
