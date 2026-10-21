import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disableTotp,
  forgetRememberedDevices,
  getMe,
  mergeProven,
  reauthenticate,
  regenerateRecoveryCodes,
  renameMe,
  revokeSession,
  setPassword,
  unlink,
  type Me,
  type Provider,
} from "./api.js";
import { useIdentity, useIdentityStart } from "./session.js";
import { identityMessage, isFailure } from "./messages.js";
import { ProviderButton, TotpSetup } from "./pages.js";
import {
  Button,
  PageHeader,
  SectionCard,
  StatusBadge,
  TextField,
} from "../../components.js";
import { AccessSummary } from "./permissions.js";
import "./account.css";

function AccountIcon({
  kind,
}: {
  kind: "security" | "link" | "phone" | "sessions" | "back";
}) {
  const paths = {
    security: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 18h4" />
      </>
    ),
    sessions: (
      <>
        <rect x="3" y="3" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-5v5" />
      </>
    ),
    back: <path d="m12 5-7 7 7 7M5 12h15" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

const providerName: Record<Provider, string> = {
  pdt: "PDT Connect",
  sankhya: "Sankhya",
};
const surfaceName = {
  direct: "Endereço do IA-MNS",
  pdt: "Dentro do PDT Connect",
  sankhya: "Dentro do Sankhya",
} as const;
const date = (value: string) => new Date(value).toLocaleString("pt-BR");

function SignedInOnly({
  children,
}: {
  children: (token: string) => ReactNode;
}) {
  const identity = useIdentityStart();
  if (identity.phase === "loading") return <p role="status">Carregando…</p>;
  if (!identity.token)
    return (
      <main className="identity-page">
        <p>
          <Link to="/entrar">Entre</Link> para continuar.
        </p>
      </main>
    );
  return <>{children(identity.token)}</>;
}

/** Recent-authentication step-up: local password (+code) or the linked provider. */
function Reauthenticate({
  me,
  token,
  onDone,
}: {
  me: Me;
  token: string;
  onDone: (token: string, expiresIn: number) => void;
}) {
  const identity = useIdentity();
  const [password, setPasswordValue] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section
      className="identity-card identity-warning"
      aria-labelledby="identity-reauth-title"
    >
      <h2 id="identity-reauth-title">Confirme sua identidade</h2>
      <p>Esta alteração exige uma confirmação recente.</p>
      {me.person.local && (
        <form
          className="identity-form"
          onSubmit={(event: FormEvent) =>
            void (async () => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const result = await reauthenticate(
                  token,
                  password,
                  code.trim() || undefined,
                );
                onDone(result.accessToken, result.expiresIn);
              } catch (failure) {
                setError(identityMessage(failure));
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          <TextField
            label="Senha"
            id="identity-reauth-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            required
          />
          {me.person.local.totpEnabled && (
            <TextField
              label="Código de verificação"
              id="identity-reauth-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          )}
          <Button type="submit" loading={busy}>
            Confirmar
          </Button>
        </form>
      )}
      {identity.surface === "direct" &&
        me.person.links
          .filter((link) => identity.status?.methods[link.provider])
          .map((link) => (
            <ProviderButton
              key={link.id}
              provider={link.provider}
              intent="reauth"
              token={token}
            />
          ))}
      {identity.surface !== "direct" && !me.person.local && (
        <p>
          Feche e abra o IA-MNS novamente pelo sistema hospedeiro para
          confirmar.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function AccountPage() {
  return <SignedInOnly>{(token) => <Account token={token} />}</SignedInOnly>;
}

function Account({ token }: { token: string }) {
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false });
  const me = useQuery({
    queryKey: ["identity-me", token],
    queryFn: ({ signal }) => getMe(token, signal),
  });
  const [needsReauth, setNeedsReauth] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    search.vinculado
      ? "Conta vinculada com sucesso."
      : search.confirmado
        ? "Identidade confirmada."
        : search.novo
          ? "Seu perfil do IA-MNS foi criado no primeiro acesso. Se você já usava o IA-MNS por outra forma de entrada, vincule-a abaixo ou peça ao administrador para unificar os perfis."
          : null,
  );
  const mergeProvider =
    search.unificar === "pdt" || search.unificar === "sankhya"
      ? search.unificar
      : null;
  const [mergeOpen, setMergeOpen] = useState(mergeProvider !== null);
  const merge = useMutation({
    mutationFn: () => mergeProven(token),
    onSuccess: () => {
      setMergeOpen(false);
      setNotice(
        "Perfis unificados. As conversas do outro perfil agora estão aqui.",
      );
      refresh();
    },
  });
  const [codes, setCodes] = useState<string[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["identity-me"] });
  const [pendingForm, setPendingForm] = useState<"profile" | "password" | null>(
    null,
  );
  const action = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      setNotice("Alteração salva.");
      refresh();
    },
    onError: (error) => {
      if (isFailure(error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED"))
        setNeedsReauth(true);
    },
    onSettled: () => setPendingForm(null),
  });
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPasswordValue] = useState("");
  if (me.isPending) return <p role="status">Carregando sua conta…</p>;
  if (me.error || !me.data)
    return (
      <main className="identity-page">
        <p role="alert">{identityMessage(me.error)}</p>
      </main>
    );
  const data = me.data;
  const person = data.person;
  const embedded = identity.surface !== "direct";
  return (
    <div className="identity-page account-page">
      <PageHeader
        title="Minha conta"
        description="Seu perfil, suas formas de acesso e a segurança da sua conta."
        back={
          <Link to="/">
            <AccountIcon kind="back" />
            Voltar para as conversas
          </Link>
        }
      />
      {notice && (
        <p role="status" className="account-notice">
          {notice}
        </p>
      )}
      {action.error && !needsReauth && (
        <p role="alert" className="account-notice account-notice-error">
          {identityMessage(action.error)}
        </p>
      )}
      {mergeOpen && mergeProvider && (
        <section
          className="identity-card identity-warning"
          aria-labelledby="identity-merge-title"
        >
          <h2 id="identity-merge-title">Unificar perfis</h2>
          <p>
            Sua conta do {providerName[mergeProvider]} já tinha um perfil
            próprio no IA-MNS, usado apenas por ela. Ao unificar, as conversas e
            essa forma de entrada passam para este perfil e o outro deixa de
            existir.
          </p>
          <div className="identity-actions">
            <Button loading={merge.isPending} onClick={() => merge.mutate()}>
              Unificar
            </Button>
            <Button
              variant="secondary"
              disabled={merge.isPending}
              onClick={() => setMergeOpen(false)}
            >
              Agora não
            </Button>
          </div>
          {merge.error && <p role="alert">{identityMessage(merge.error)}</p>}
        </section>
      )}
      {needsReauth && (
        <Reauthenticate
          me={data}
          token={token}
          onDone={(next, expiresIn) => {
            identity.accept(next, expiresIn);
            setNeedsReauth(false);
            action.reset();
            setNotice("Identidade confirmada. Repita a alteração.");
          }}
        />
      )}

      <SectionCard title="Perfil" className="account-profile">
        <div className="account-person">
          <span className="account-avatar" aria-hidden="true">
            {person.displayName
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toLocaleUpperCase("pt-BR")}
          </span>
          <div>
            <h3>{person.displayName}</h3>
            <p>
              {person.owner
                ? "Administrador do IA-MNS"
                : "Seu perfil no IA-MNS"}
            </p>
          </div>
        </div>
        <form
          className="account-profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            setPendingForm("profile");
            action.mutate(() => renameMe(token, name || person.displayName));
          }}
        >
          <TextField
            label="Nome"
            id="identity-display-name"
            defaultValue={person.displayName}
            maxLength={120}
            autoComplete="name"
            required
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="submit"
            disabled={action.isPending}
            loading={action.isPending && pendingForm === "profile"}
          >
            Salvar nome
          </Button>
        </form>
        <div className="account-permissions">
          <span>Permissões de acesso</span>
          <AccessSummary
            access={person.access}
            admin={person.permissions.includes("identity:admin")}
          />
        </div>
      </SectionCard>

      <div className="account-grid">
        <SectionCard
          title="Acesso e segurança"
          description="Gerencie sua senha e a verificação em duas etapas."
          icon={<AccountIcon kind="security" />}
          className="account-security"
        >
          <div className="account-section-label">
            <h3>Acesso com usuário e senha</h3>
            <StatusBadge tone={person.local ? "accent" : "neutral"}>
              {person.local ? "Configurado" : "Não configurado"}
            </StatusBadge>
          </div>
          {person.local ? (
            <p className="account-description">
              Usuário: <strong>{person.local.login}</strong>
            </p>
          ) : (
            <p>
              Crie um usuário e senha do IA-MNS como alternativa aos sistemas
              vinculados.
            </p>
          )}
          <form
            className="account-form"
            onSubmit={(event) => {
              event.preventDefault();
              setPendingForm("password");
              action.mutate(async () => {
                await setPassword(
                  token,
                  password,
                  person.local ? undefined : login,
                );
                setPasswordValue("");
              });
            }}
          >
            {!person.local && (
              <TextField
                label="Usuário"
                id="identity-account-login"
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
              />
            )}
            <TextField
              label={`${person.local ? "Nova senha" : "Senha"} (mínimo 12 caracteres)`}
              id="identity-account-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
              required
            />
            <div className="account-form-actions">
              <Button
                type="submit"
                disabled={action.isPending}
                loading={action.isPending && pendingForm === "password"}
              >
                {person.local ? "Alterar senha" : "Criar acesso local"}
              </Button>
            </div>
          </form>
          <div className="account-security-factor">
            <div className="account-section-label">
              <h3>Verificação em duas etapas</h3>
              <StatusBadge
                tone={person.local?.totpEnabled ? "accent" : "neutral"}
              >
                {person.local?.totpEnabled ? "Ativa" : "Não ativada"}
              </StatusBadge>
            </div>
            {!person.local && (
              <p className="account-description">
                Crie um acesso com usuário e senha para ativar um aplicativo
                autenticador no IA-MNS.
              </p>
            )}
            {person.local && !person.local.totpEnabled && !enrolling && (
              <>
                <p className="account-description">
                  Adicione uma camada de proteção com um aplicativo
                  autenticador.
                </p>
                <Button variant="secondary" onClick={() => setEnrolling(true)}>
                  Ativar verificação em duas etapas
                </Button>
              </>
            )}
            {person.local && enrolling && (
              <TotpSetup
                token={token}
                onDone={(next, expiresIn) => {
                  identity.accept(next, expiresIn);
                  setEnrolling(false);
                  refresh();
                }}
              />
            )}
            {person.local?.totpEnabled && (
              <>
                <p className="account-description">
                  {person.local.recoveryCodesRemaining} códigos de recuperação
                  restantes. Guarde-os em um lugar seguro.
                </p>
                <div className="account-form-actions">
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(async () =>
                        setCodes(
                          (await regenerateRecoveryCodes(token)).recoveryCodes,
                        ),
                      )
                    }
                  >
                    Gerar novos códigos
                  </Button>
                  {!person.owner && (
                    <Button
                      variant="ghost"
                      disabled={action.isPending}
                      onClick={() => action.mutate(() => disableTotp(token))}
                    >
                      Desativar
                    </Button>
                  )}
                </div>
              </>
            )}
            {data.rememberedDevices > 0 && (
              <div className="account-remembered">
                <p className="account-description">
                  {data.rememberedDevices === 1
                    ? "1 navegador não pede o código ao entrar."
                    : `${data.rememberedDevices} navegadores não pedem o código ao entrar.`}
                </p>
                <Button
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(() => forgetRememberedDevices(token))
                  }
                >
                  Voltar a pedir o código em todos
                </Button>
              </div>
            )}
            {codes && (
              <ul
                className="identity-codes"
                aria-label="Novos códigos de recuperação"
              >
                {codes.map((item) => (
                  <li key={item}>
                    <code>{item}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>

        <div className="account-connections">
          <SectionCard
            title="Sistemas vinculados"
            description="Entre com as contas dos sistemas que você já utiliza."
            icon={<AccountIcon kind="link" />}
          >
            {!person.links.length && (
              <p className="account-empty">Nenhum sistema vinculado.</p>
            )}
            <ul className="account-list">
              {person.links.map((link) => (
                <li key={link.id}>
                  <div className="account-list-copy">
                    <p>
                      <strong>{providerName[link.provider]}</strong>{" "}
                      {link.label ? `· ${link.label}` : ""}
                    </p>
                    <p className="account-description">
                      Vinculado em {date(link.linkedAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={action.isPending}
                    onClick={() => action.mutate(() => unlink(token, link.id))}
                  >
                    Remover vínculo
                  </Button>
                </li>
              ))}
            </ul>
            {data.linkableProviders.length > 0 &&
              (embedded ? (
                <p className="account-description account-footnote">
                  Para vincular outro sistema, abra o IA-MNS pelo seu endereço
                  próprio.
                </p>
              ) : (
                <div className="identity-actions">
                  {data.linkableProviders.map((provider) => (
                    <ProviderButton
                      key={provider}
                      provider={provider}
                      intent="link"
                      token={token}
                    />
                  ))}
                </div>
              ))}
          </SectionCard>

          <SectionCard
            title="WhatsApp"
            description="Converse com o IA-MNS também pelo celular."
            icon={<AccountIcon kind="phone" />}
          >
            {person.whatsapp ? (
              <p>
                Você pode conversar com o IA-MNS pelo WhatsApp a partir do
                número <strong>{person.whatsapp.number}</strong>.
              </p>
            ) : (
              <p className="account-empty">
                Nenhum número de WhatsApp cadastrado.
              </p>
            )}
            <p className="account-description account-footnote">
              Somente o administrador cadastra, altera ou remove este número.
            </p>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Sessões ativas"
        description="Veja onde sua conta está conectada e encerre os acessos que não utiliza."
        icon={<AccountIcon kind="sessions" />}
      >
        <ul className="account-list account-session-list">
          {person.sessions.map((item) => (
            <li key={item.id}>
              <div className="account-session-icon" aria-hidden="true">
                <AccountIcon kind="sessions" />
              </div>
              <div className="account-list-copy">
                <p>
                  <strong>{surfaceName[item.surface]}</strong>
                </p>
                <p className="account-description">
                  Desde {date(item.createdAt)}
                  {item.assurance === "mfa" ? " · duas etapas" : ""}
                </p>
              </div>
              {item.current && (
                <StatusBadge tone="accent">Esta sessão</StatusBadge>
              )}
              {!item.current && (
                <Button
                  variant="ghost"
                  disabled={action.isPending}
                  aria-label={`Encerrar sessão: ${surfaceName[item.surface]}, ${date(item.createdAt)}`}
                  onClick={() =>
                    action.mutate(() => revokeSession(token, item.id))
                  }
                >
                  Encerrar
                </Button>
              )}
            </li>
          ))}
        </ul>
        {identity.surface === "direct" && (
          <div className="account-session-footer">
            <Button variant="danger" onClick={() => void identity.signOut()}>
              Sair desta sessão
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
