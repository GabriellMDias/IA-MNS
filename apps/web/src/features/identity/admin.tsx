import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
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
  setWhatsappNumber,
  removeWhatsappNumber,
  type Provider,
  type SankhyaUsers,
} from "./api.js";
import { useIdentityStart } from "./session.js";
import { SecurityPolicyPanel } from "./security-policy.js";
import { ParametersPanel } from "./parameters.js";
import { GroupsPanel } from "./groups.js";
import { PermissionGrants } from "./permissions.js";
import { identityMessage, isFailure } from "./messages.js";
import {
  Button,
  PageHeader,
  SectionCard,
  StatusBadge,
  TextField,
} from "../../components.js";
import { Avatar } from "./navigation.js";
import "./admin.css";

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
  "grant.added": "Permissão concedida",
  "grant.updated": "Restrições da permissão alteradas",
  "grant.removed": "Permissão revogada",
  "group.member_added": "Incluída em grupo",
  "group.member_removed": "Removida de grupo",
  "role.added": "Administrador principal atribuído",
  "role.removed": "Administrador principal removido",
  "session.started": "Sessão iniciada",
  "session.logout": "Saída",
  "mfa.enabled": "Duas etapas ativadas",
  "credential.enrollment_issued": "Convite de acesso local emitido",
  "credential.reset_issued": "Redefinição de acesso emitida",
  "whatsapp.linked": "WhatsApp cadastrado",
  "whatsapp.changed": "WhatsApp alterado",
  "whatsapp.removed": "WhatsApp removido",
  "whatsapp.confirmed": "Primeira mensagem do WhatsApp recebida",
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
        <TextField
          label="Usuário do Sankhya (login ou nome)"
          id="identity-sankhya-search"
          value={text}
          minLength={2}
          maxLength={60}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" variant="secondary" loading={users.isFetching}>
          Buscar
        </Button>
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
            <Button
              type="button"
              disabled={busy || user.accessExpired || user.linkedTo !== null}
              onClick={() => onSelect(user)}
            >
              {actionLabel}
            </Button>
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
  onCancel,
}: {
  token: string;
  capabilities: { sankhyaDirectory: boolean; linkInvitations: Provider[] };
  onCreated: (personId: string, invites: Invite[]) => void;
  onCancel: () => void;
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
    <SectionCard
      title="Nova pessoa"
      description="Quem entra pelo PDT Connect ou Sankhya ganha um perfil no primeiro acesso. Cadastre aqui quem ainda não entrou ou precisa de acesso local."
      className="admin-create"
    >
      <form
        className="identity-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <TextField
          label="Nome"
          id="identity-new-person"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
        />
        <fieldset className="admin-create-methods">
          <legend>Formas de acesso</legend>
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
        </fieldset>
        {sankhyaUser && (
          <p className="admin-selected-sankhya">
            Usuário do Sankhya:{" "}
            <strong>{sankhyaUser.name ?? sankhyaUser.login}</strong> (
            {sankhyaUser.login}){" "}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSankhyaUser(null)}
            >
              Remover
            </Button>
          </p>
        )}
        <div className="admin-actions">
          <Button type="submit" loading={create.isPending}>
            Criar pessoa
          </Button>
          <Button
            variant="secondary"
            disabled={create.isPending}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
        {create.error && <p role="alert">{identityMessage(create.error)}</p>}
      </form>
      {capabilities.sankhyaDirectory && !sankhyaUser && (
        <SankhyaPicker
          token={token}
          actionLabel="Associar"
          onSelect={setSankhyaUser}
        />
      )}
    </SectionCard>
  );
}

function Admin({ token }: { token: string }) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const section = search.secao ?? "pessoas";
  const query = search.busca ?? "";
  const cursor = search.cursor;
  const creating = search.novo === true;
  const [invites, setInvites] = useState<Invite[]>([]);
  const persons = useQuery({
    queryKey: ["identity-persons", token, query, cursor],
    queryFn: ({ signal }) => listPersons(token, query, cursor, signal),
  });
  const selected = search.pessoa ?? persons.data?.items[0]?.id ?? null;
  const nextCursor = persons.data?.nextCursor;
  const selectPerson = (personId: string) =>
    void navigate({
      to: "/admin",
      search: {
        ...(query ? { busca: query } : {}),
        ...(cursor ? { cursor } : {}),
        pessoa: personId,
      },
    });
  if (persons.error)
    return (
      <div className="identity-page admin-page">
        <PageHeader title="Administração" />
        <p role="alert" className="admin-notice admin-notice-error">
          {isFailure(persons.error, "IDENTITY_STRONG_AUTHENTICATION_REQUIRED")
            ? "Ative a verificação em duas etapas em Minha conta e entre novamente para administrar."
            : identityMessage(persons.error)}
        </p>
        <Link to="/conta">Minha conta</Link>
      </div>
    );
  const capabilities = persons.data?.capabilities ?? {
    sankhyaDirectory: false,
    linkInvitations: [],
    restrictions: false,
  };
  return (
    <div className="identity-page admin-page">
      <PageHeader
        title="Administração"
        description="Gerencie as pessoas, os acessos e as preferências do IA-MNS."
        back={
          <Link to="/">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m12 5-7 7 7 7M5 12h15" />
            </svg>
            Voltar para as conversas
          </Link>
        }
        actions={
          section === "pessoas" ? (
            <Button
              disabled={creating || persons.isPending}
              onClick={() => {
                setInvites([]);
                void navigate({ to: "/admin", search: { novo: true } });
              }}
            >
              <span aria-hidden="true">+</span>Nova pessoa
            </Button>
          ) : undefined
        }
      />
      <nav className="admin-tabs" aria-label="Seções da administração">
        {/* The tabs share the route, so the active one follows the search. */}
        {(
          [
            ["pessoas", {}, "Pessoas"],
            ["grupos", { secao: "grupos" }, "Grupos"],
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
      {section === "grupos" ? (
        <GroupsPanel token={token} selected={search.grupo} />
      ) : section === "seguranca" ? (
        <SecurityPolicyPanel token={token} />
      ) : section === "parametros" ? (
        <ParametersPanel token={token} />
      ) : (
        <div className="admin-people-layout">
          <SectionCard title="Pessoas" className="admin-directory">
            <TextField
              label="Buscar pessoa"
              type="search"
              placeholder="Buscar por nome ou usuário"
              id="identity-person-search"
              value={query}
              maxLength={120}
              onChange={(event) =>
                void navigate({
                  to: "/admin",
                  search: {
                    ...(event.target.value
                      ? { busca: event.target.value }
                      : {}),
                    ...(search.pessoa ? { pessoa: search.pessoa } : {}),
                    ...(creating ? { novo: true } : {}),
                  },
                  replace: true,
                })
              }
            />
            {persons.isPending && (
              <p role="status" className="admin-muted">
                Carregando pessoas…
              </p>
            )}
            {persons.data && (
              <p className="admin-directory-count">
                {persons.data.items.length}{" "}
                {persons.data.items.length === 1
                  ? "pessoa nesta página"
                  : "pessoas nesta página"}
              </p>
            )}
            {persons.data && !persons.data.items.length && (
              <p className="admin-muted">Nenhuma pessoa encontrada.</p>
            )}
            <ul className="admin-person-list">
              {persons.data?.items.map((person) => (
                <li key={person.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={
                      !creating && selected === person.id ? "is-selected" : ""
                    }
                    aria-pressed={!creating && selected === person.id}
                    onClick={() => selectPerson(person.id)}
                  >
                    <Avatar name={person.displayName} />
                    <span className="admin-person-list-copy">
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
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            {(cursor || nextCursor) && (
              <div className="admin-pagination">
                {cursor && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void navigate({
                        to: "/admin",
                        search: query ? { busca: query } : {},
                      })
                    }
                  >
                    Voltar ao início
                  </Button>
                )}
                {nextCursor && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void navigate({
                        to: "/admin",
                        search: {
                          ...(query ? { busca: query } : {}),
                          cursor: nextCursor,
                        },
                      })
                    }
                  >
                    Próxima página
                  </Button>
                )}
              </div>
            )}
          </SectionCard>
          <div className="admin-workspace">
            {invites.length > 0 && (
              <div className="admin-notice admin-invitations" role="status">
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
            {creating ? (
              <CreatePerson
                token={token}
                capabilities={capabilities}
                onCancel={() => void navigate({ to: "/admin", search: {} })}
                onCreated={(personId, created) => {
                  setInvites(created);
                  void navigate({ to: "/admin", search: { pessoa: personId } });
                }}
              />
            ) : selected ? (
              <PersonDetail
                key={selected}
                token={token}
                personId={selected}
                onInvite={(invite) => setInvites([invite])}
                onMerged={selectPerson}
              />
            ) : (
              !persons.isPending && (
                <SectionCard
                  title="Selecione uma pessoa"
                  description="Escolha um perfil na lista ou cadastre uma nova pessoa para gerenciar seus acessos."
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
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
      <TextField
        label="Outro perfil da mesma pessoa"
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
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSource({ id: item.id, name: item.displayName })
                }
              >
                Selecionar
              </Button>
            </li>
          ))}
      </ul>
      {source && (
        <p className="identity-warning">
          As formas de entrada, capacidades e conversas de{" "}
          <strong>{source.name}</strong> passarão para{" "}
          <strong>{displayName}</strong>, e {source.name} deixará de existir.
          Use apenas quando tiver certeza de que é a mesma pessoa.{" "}
          <Button disabled={busy} onClick={() => onMerge(source.id)}>
            Unificar
          </Button>
        </p>
      )}
    </div>
  );
}

/**
 * The Person's WhatsApp number: the only authorization of the WhatsApp
 * channel. The API validates and normalizes it and enforces uniqueness;
 * this form only collects the owner's input.
 */
function WhatsappNumber({
  current,
  active,
  busy,
  onSave,
  onRemove,
}: {
  current: { number: string; confirmedAt: string | null } | null;
  active: boolean;
  busy: boolean;
  onSave: (number: string) => void;
  onRemove: () => void;
}) {
  const [number, setNumber] = useState(current?.number ?? "");
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  return (
    <>
      {current ? (
        <p>
          Número autorizado: <strong>{current.number}</strong>
          {current.confirmedAt
            ? ` · primeira mensagem recebida em ${new Date(current.confirmedAt).toLocaleString("pt-BR")}`
            : " · nenhuma mensagem recebida ainda"}
        </p>
      ) : (
        <p className="identity-hint">
          Sem número, esta pessoa não conversa com o IA-MNS pelo WhatsApp.
        </p>
      )}
      {active ? (
        <form
          className="identity-inline"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(number.trim());
          }}
        >
          <TextField
            label="Número de WhatsApp com código do país"
            id="identity-whatsapp-number"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+55 11 91234-5678"
            value={number}
            maxLength={32}
            required
            onChange={(event) => setNumber(event.target.value)}
          />
          <Button type="submit" disabled={busy || !number.trim()}>
            {current ? "Alterar número" : "Cadastrar número"}
          </Button>
        </form>
      ) : (
        current && (
          <p className="identity-hint">
            Pessoa desativada: o número não dá acesso ao IA-MNS.
          </p>
        )
      )}
      <p className="identity-hint">
        O número funciona como credencial: quem usa este WhatsApp conversa com o
        IA-MNS com as capacidades desta pessoa. Remova-o assim que a linha for
        trocada, perdida ou devolvida.
      </p>
      {current &&
        (confirmRemoval ? (
          <p className="identity-warning">
            O WhatsApp {current.number} deixará de acessar o IA-MNS
            imediatamente.{" "}
            <Button
              disabled={busy}
              onClick={() => {
                setConfirmRemoval(false);
                onRemove();
              }}
            >
              Remover número
            </Button>{" "}
            <Button
              variant="secondary"
              onClick={() => setConfirmRemoval(false)}
            >
              Cancelar
            </Button>
          </p>
        ) : (
          <div className="identity-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmRemoval(true)}
            >
              Remover número do WhatsApp
            </Button>
          </div>
        ))}
    </>
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
    <div className="admin-detail">
      <SectionCard
        title={person.displayName}
        icon={<Avatar name={person.displayName} />}
        className="admin-person-summary"
      >
        <div className="admin-person-status">
          <StatusBadge tone={person.status === "active" ? "accent" : "neutral"}>
            {person.status === "active" ? "Ativa" : "Desativada"}
          </StatusBadge>
          {person.owner && <StatusBadge>Administrador principal</StatusBadge>}
        </div>
      </SectionCard>
      {action.error && (
        <p role="alert" className="admin-notice admin-notice-error">
          {isFailure(action.error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED")
            ? "Confirme sua identidade em Minha conta (senha e código) e repita a alteração."
            : identityMessage(action.error)}
        </p>
      )}
      <div className="admin-detail-grid">
        <div className="admin-detail-column">
          <SectionCard
            title="Permissões"
            description={
              person.owner
                ? "Administradores principais têm acesso total, independentemente das concessões."
                : "Concessões individuais e dos grupos se somam. Uma concessão explícita substitui a automática por vínculo da mesma permissão."
            }
          >
            {person.groups.length > 0 && (
              <p className="identity-hint">
                Grupos:{" "}
                {person.groups.map((group, index) => (
                  <span key={group.id}>
                    {index > 0 && ", "}
                    <Link
                      to="/admin"
                      search={{ secao: "grupos", grupo: group.id }}
                    >
                      {group.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <PermissionGrants
              token={token}
              catalog={catalog}
              grants={person.grants}
              access={person.access}
              restrictionsAvailable={capabilities.restrictions}
              busy={action.isPending}
              onGrant={(permission, restrictions) =>
                action.mutate(() =>
                  setGrant(token, person.id, permission, true, restrictions),
                )
              }
              onRevoke={(permission) =>
                action.mutate(() =>
                  setGrant(token, person.id, permission, false),
                )
              }
            />
          </SectionCard>
          <SectionCard
            title="Gerenciar acesso"
            description="Administração, situação da pessoa e sessões conectadas."
          >
            <div className="identity-actions">
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(() => setOwner(token, person.id, !person.owner))
                }
              >
                {person.owner
                  ? "Remover administrador principal"
                  : "Tornar administrador principal"}
              </Button>
              <Button
                variant={person.status === "active" ? "danger" : "secondary"}
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
              </Button>
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(() => revokePersonSessions(token, person.id))
                }
              >
                Encerrar sessões
              </Button>
              {person.local && (
                <Button
                  variant="secondary"
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
                </Button>
              )}
            </div>
          </SectionCard>
          {person.status === "active" && (
            <SectionCard
              title="Unificar perfis"
              description="Reúna os acessos e as conversas de perfis da mesma pessoa."
            >
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
            </SectionCard>
          )}
        </div>
        <div className="admin-detail-column">
          <SectionCard
            title="Formas de entrada"
            description="Contas que dão acesso a este perfil no IA-MNS."
          >
            <ul className="identity-list admin-links">
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
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(() =>
                        adminUnlink(token, person.id, link.id),
                      )
                    }
                  >
                    Remover vínculo
                  </Button>
                </li>
              ))}
            </ul>
            {person.status === "active" && (
              <div className="identity-actions">
                {!person.local && (
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(async () =>
                        onInvite(
                          inviteLink(
                            "enrollment",
                            (await issueEnrollment(token, person.id))
                              .enrollmentToken,
                          ),
                        ),
                      )
                    }
                  >
                    Convite para usuário e senha
                  </Button>
                )}
                {capabilities.linkInvitations
                  .filter((provider) => !linked(provider))
                  .map((provider) => (
                    <Button
                      key={provider}
                      variant="secondary"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate(async () =>
                          onInvite(
                            linkInvite(
                              provider,
                              (
                                await issueLinkInvitation(
                                  token,
                                  person.id,
                                  provider,
                                )
                              ).token,
                            ),
                          ),
                        )
                      }
                    >
                      Convite para vincular {providerName[provider]}
                    </Button>
                  ))}
              </div>
            )}
          </SectionCard>
          <SectionCard
            title="WhatsApp"
            description="Número autorizado para conversar com o IA-MNS."
          >
            <WhatsappNumber
              key={person.whatsapp?.number ?? "none"}
              current={person.whatsapp}
              active={person.status === "active"}
              busy={action.isPending}
              onSave={(number) =>
                action.mutate(() => setWhatsappNumber(token, person.id, number))
              }
              onRemove={() =>
                action.mutate(() => removeWhatsappNumber(token, person.id))
              }
            />
          </SectionCard>
          {person.status === "active" &&
            capabilities.sankhyaDirectory &&
            !linked("sankhya") && (
              <SectionCard
                title="Associar usuário do Sankhya"
                description="Busque e selecione um usuário no diretório do ERP."
              >
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
              </SectionCard>
            )}
        </div>
      </div>
      <SectionCard title="Auditoria recente" className="admin-audit">
        <ul className="identity-list identity-audit">
          {audit.map((event, index) => (
            <li key={index}>
              <time dateTime={event.occurredAt}>
                {new Date(event.occurredAt).toLocaleString("pt-BR")}
              </time>
              <span>
                {auditName[event.action] ?? event.action}
                {typeof event.details.permission === "string"
                  ? ` (${(() => {
                      const entry = catalog.find(
                        (item) => item.permission === event.details.permission,
                      );
                      return entry
                        ? `${entry.code} ${entry.title}${entry.source ? ` · ${entry.source.title}` : ""}`
                        : event.details.permission;
                    })()})`
                  : ""}
                {typeof event.details.restrictedValues === "number" &&
                event.details.restrictedValues > 0
                  ? ` com ${event.details.restrictedValues} ${event.details.restrictedValues === 1 ? "valor restrito" : "valores restritos"}`
                  : ""}
                {typeof event.details.provider === "string"
                  ? ` (${providerName[event.details.provider as Provider] ?? event.details.provider})`
                  : ""}
                {typeof event.details.suffix === "string"
                  ? ` (final ${event.details.suffix})`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
        {!audit.length && (
          <p className="admin-muted">Nenhuma atividade registrada.</p>
        )}
      </SectionCard>
    </div>
  );
}
