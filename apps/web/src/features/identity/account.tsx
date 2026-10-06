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
              }
            })()
          }
        >
          <label htmlFor="identity-reauth-password">Senha</label>
          <input
            id="identity-reauth-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            required
          />
          {me.person.local.totpEnabled && (
            <>
              <label htmlFor="identity-reauth-code">
                Código de verificação
              </label>
              <input
                id="identity-reauth-code"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </>
          )}
          <button>Confirmar</button>
        </form>
      )}
      {identity.surface === "direct" &&
        me.person.links.map((link) => (
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
    <main className="identity-page identity-wide">
      <p>
        <Link to="/">← Voltar para as conversas</Link>
      </p>
      <h1>Minha conta</h1>
      {notice && <p role="status">{notice}</p>}
      {action.error && !needsReauth && (
        <p role="alert">{identityMessage(action.error)}</p>
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
            <button disabled={merge.isPending} onClick={() => merge.mutate()}>
              Unificar
            </button>
            <button
              className="identity-secondary"
              disabled={merge.isPending}
              onClick={() => setMergeOpen(false)}
            >
              Agora não
            </button>
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

      <section
        className="identity-card"
        aria-labelledby="identity-profile-title"
      >
        <h2 id="identity-profile-title">Perfil</h2>
        <form
          className="identity-inline"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate(() => renameMe(token, name || person.displayName));
          }}
        >
          <label htmlFor="identity-display-name">Nome</label>
          <input
            id="identity-display-name"
            defaultValue={person.displayName}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
          <button disabled={action.isPending}>Salvar nome</button>
        </form>
        <p>
          Capacidades:{" "}
          {person.permissions.length
            ? person.permissions.join(", ")
            : "nenhuma ainda — fale com o administrador se precisar de acesso."}
        </p>
      </section>

      <section className="identity-card" aria-labelledby="identity-local-title">
        <h2 id="identity-local-title">Acesso com usuário e senha</h2>
        {person.local ? (
          <p>
            Usuário: <strong>{person.local.login}</strong>
          </p>
        ) : (
          <p>
            Crie um usuário e senha do IA-MNS como alternativa aos sistemas
            vinculados.
          </p>
        )}
        <form
          className="identity-form"
          onSubmit={(event) => {
            event.preventDefault();
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
            <>
              <label htmlFor="identity-account-login">Usuário</label>
              <input
                id="identity-account-login"
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
              />
            </>
          )}
          <label htmlFor="identity-account-password">
            {person.local ? "Nova senha" : "Senha"} (mínimo 12 caracteres)
          </label>
          <input
            id="identity-account-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            required
          />
          <button disabled={action.isPending}>
            {person.local ? "Alterar senha" : "Criar acesso local"}
          </button>
        </form>
        {person.local && !person.local.totpEnabled && !enrolling && (
          <button onClick={() => setEnrolling(true)}>
            Ativar verificação em duas etapas
          </button>
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
          <div className="identity-actions">
            <span>
              Verificação em duas etapas ativa ·{" "}
              {person.local.recoveryCodesRemaining} códigos de recuperação
              restantes
            </span>
            <button
              onClick={() =>
                action.mutate(async () =>
                  setCodes(
                    (await regenerateRecoveryCodes(token)).recoveryCodes,
                  ),
                )
              }
            >
              Gerar novos códigos
            </button>
            {!person.owner && (
              <button
                className="identity-secondary"
                onClick={() => action.mutate(() => disableTotp(token))}
              >
                Desativar
              </button>
            )}
          </div>
        )}
        {data.rememberedDevices > 0 && (
          <div className="identity-actions">
            <span>
              {data.rememberedDevices === 1
                ? "1 navegador não pede o código ao entrar."
                : `${data.rememberedDevices} navegadores não pedem o código ao entrar.`}
            </span>
            <button
              className="identity-secondary"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(() => forgetRememberedDevices(token))
              }
            >
              Voltar a pedir o código em todos
            </button>
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
      </section>

      <section className="identity-card" aria-labelledby="identity-links-title">
        <h2 id="identity-links-title">Sistemas vinculados</h2>
        {!person.links.length && <p>Nenhum sistema vinculado.</p>}
        <ul className="identity-list">
          {person.links.map((link) => (
            <li key={link.id}>
              <span>
                <strong>{providerName[link.provider]}</strong>{" "}
                {link.label ? `· ${link.label}` : ""} · vinculado em{" "}
                {date(link.linkedAt)}
              </span>
              <button
                className="identity-secondary"
                disabled={action.isPending}
                onClick={() => action.mutate(() => unlink(token, link.id))}
              >
                Remover vínculo
              </button>
            </li>
          ))}
        </ul>
        {data.linkableProviders.length > 0 &&
          (embedded ? (
            <p className="identity-hint">
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
      </section>

      <section
        className="identity-card"
        aria-labelledby="identity-sessions-title"
      >
        <h2 id="identity-sessions-title">Sessões ativas</h2>
        <ul className="identity-list">
          {person.sessions.map((item) => (
            <li key={item.id}>
              <span>
                {surfaceName[item.surface]} · desde {date(item.createdAt)}{" "}
                {item.assurance === "mfa" ? "· duas etapas" : ""}
                {item.current ? " · esta sessão" : ""}
              </span>
              {!item.current && (
                <button
                  className="identity-secondary"
                  onClick={() =>
                    action.mutate(() => revokeSession(token, item.id))
                  }
                >
                  Encerrar
                </button>
              )}
            </li>
          ))}
        </ul>
        {identity.surface === "direct" && (
          <button onClick={() => void identity.signOut()}>
            Sair desta sessão
          </button>
        )}
      </section>
    </main>
  );
}
