import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  completeBootstrap,
  completeInvitation,
  confirmSignInEnrollment,
  confirmTotp,
  inspectInvitation,
  inspectProvision,
  provisionCreate,
  provisionLink,
  startProvider,
  startSignInEnrollment,
  startTotp,
  type Intent,
  type Provider,
} from "./api.js";
import { LocalSignIn, useIdentityStart } from "./session.js";
import { TotpEnrollment } from "./totp.js";
import { codeMessage, identityMessage } from "./messages.js";
import brandLockup from "../../assets/brand-lockup.svg";
import brandLockupReverse from "../../assets/brand-lockup-reverse.svg";

const providerName: Record<Provider, string> = {
  pdt: "PDT Connect",
  sankhya: "Sankhya",
};

export function ProviderButton({
  provider,
  intent = "login",
  token = null,
  invitation,
  resumeFirstAccess,
  label: customLabel,
}: {
  provider: Provider;
  intent?: Intent;
  token?: string | null;
  invitation?: string;
  resumeFirstAccess?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label =
    customLabel ??
    (intent === "login"
      ? `Entrar com ${providerName[provider]}`
      : intent === "link"
        ? `Vincular ${providerName[provider]}`
        : `Confirmar com ${providerName[provider]}`);
  return (
    <>
      <button
        className="identity-provider"
        disabled={busy}
        onClick={() =>
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const started = await startProvider(
                provider,
                intent,
                "direct",
                token,
                {
                  ...(invitation ? { invitation } : {}),
                  ...(resumeFirstAccess ? { resumeFirstAccess } : {}),
                },
              );
              if (started.mode === "direct")
                window.location.assign(started.redirectUrl);
            } catch (failure) {
              setError(identityMessage(failure));
              setBusy(false);
            }
          })()
        }
      >
        <span className="identity-provider-badge" aria-hidden="true">
          {provider === "pdt" ? "P" : "S"}
        </span>
        <span>{busy ? "Redirecionando…" : label}</span>
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

/** Takes a one-time secret from the URL fragment and removes it from history. */
function useFragmentSecret(key?: string): string | null {
  const [secret] = useState(() => {
    const hash = window.location.hash.slice(1);
    const value = key ? new URLSearchParams(hash).get(key) : hash;
    return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
  });
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
  }, []);
  return secret;
}

/** Centered card used by the sign-in, first-access and invitation screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="identity-page identity-auth">
      <div className="identity-auth-card">
        <div className="identity-auth-brand">
          <img
            className="theme-light-only"
            src={brandLockup}
            alt="IA-MNS"
            width="178"
            height="40"
          />
          <img
            className="theme-dark-only"
            src={brandLockupReverse}
            alt="IA-MNS"
            width="178"
            height="40"
          />
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="identity-auth-subtitle">{subtitle}</p>}
        {children}
      </div>
      {footer && <p className="identity-auth-footer">{footer}</p>}
    </main>
  );
}

export function LoginPage() {
  const identity = useIdentityStart();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const methods = identity.status?.methods;
  useEffect(() => {
    if (identity.phase === "signed-in") void navigate({ to: "/" });
  }, [identity.phase, navigate]);
  if (identity.status && !identity.status.configured)
    return (
      <AuthLayout title="Entrar no IA-MNS">
        <p role="status">
          A identidade do IA-MNS ainda não está configurada neste ambiente.
        </p>
      </AuthLayout>
    );
  const systems = [
    ...(methods?.pdt ? ["PDT Connect"] : []),
    ...(methods?.sankhya ? ["Sankhya"] : []),
  ];
  const providers = systems.length > 0;
  return (
    <AuthLayout
      title="Entrar"
      subtitle={
        providers
          ? `Use a sua conta do ${systems.join(" ou do ")} ou o seu usuário do IA-MNS.`
          : "Use o seu usuário e senha do IA-MNS."
      }
      footer={
        providers
          ? `Ainda não tem acesso? Entre pelo ${systems.join(" ou pelo ")} ou peça um convite ao administrador do IA-MNS.`
          : "Ainda não tem acesso? Peça um convite ao administrador do IA-MNS."
      }
    >
      {codeMessage(search.erro) && (
        <p className="identity-auth-error" role="alert">
          {codeMessage(search.erro)}
        </p>
      )}
      {providers && (
        <section
          className="identity-providers"
          aria-label="Entrar com outro sistema"
        >
          {methods?.pdt && <ProviderButton provider="pdt" />}
          {methods?.sankhya && <ProviderButton provider="sankhya" />}
        </section>
      )}
      {providers && (
        <div className="identity-divider" role="presentation">
          <span>ou</span>
        </div>
      )}
      <section aria-label="Conta do IA-MNS">
        <LocalSignIn
          surface="direct"
          onAuthenticated={(token, expiresIn) => {
            identity.accept(token, expiresIn);
            void navigate({ to: "/" });
          }}
        />
      </section>
    </AuthLayout>
  );
}

/**
 * A first access that stopped before creating a profile: either another
 * system reported the same e-mail for an existing profile (a hint, never
 * proof), or this browser is already signed in to a profile.
 */
export function ProvisionPage() {
  const identity = useIdentityStart();
  const navigate = useNavigate();
  const pending = useQuery({
    queryKey: ["identity-provision"],
    queryFn: () => inspectProvision(),
    retry: false,
    staleTime: Infinity,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(identityMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const create = () =>
    run(async () => {
      const outcome = await provisionCreate();
      if (outcome.kind === "authenticated") {
        identity.accept(outcome.accessToken, outcome.expiresIn);
        void navigate({ to: "/conta", search: { novo: "1" } });
      }
    });
  const link = (token: string, expiresIn?: number) =>
    run(async () => {
      await provisionLink(token);
      if (expiresIn !== undefined) identity.accept(token, expiresIn);
      void navigate({
        to: "/conta",
        search: { vinculado: pending.data?.provider },
      });
    });
  if (pending.isPending)
    return (
      <main className="identity-page" aria-busy="true">
        <p role="status">Carregando…</p>
      </main>
    );
  if (pending.error || !pending.data)
    return (
      <AuthLayout title="Primeiro acesso ao IA-MNS">
        <p role="alert">
          Esta etapa expirou ou já foi concluída.{" "}
          <Link to="/entrar">Entre novamente</Link>.
        </p>
      </AuthLayout>
    );
  const { provider, label, reason, methods } = pending.data;
  const account = (
    <>
      sua conta {label ? <strong>{label}</strong> : null} do{" "}
      {providerName[provider]}
    </>
  );
  const separate = (
    <button
      className="identity-secondary"
      disabled={busy}
      onClick={() => void create()}
    >
      {reason === "candidate"
        ? "Esse perfil não é meu — criar um perfil separado"
        : "Criar um perfil separado"}
    </button>
  );
  return (
    <AuthLayout title="Primeiro acesso ao IA-MNS">
      {reason === "signed_in" ? (
        <>
          <p>
            Confirmamos {account}, que ainda não tem perfil no IA-MNS. Este
            navegador já está conectado a um perfil do IA-MNS.
          </p>
          <div className="identity-actions">
            {identity.token && (
              <button
                disabled={busy}
                onClick={() => void link(identity.token!)}
              >
                Vincular ao perfil conectado
              </button>
            )}
            {separate}
          </div>
        </>
      ) : (
        <>
          <p>
            Confirmamos {account}. Outro sistema informou o mesmo e-mail para um
            perfil que já existe no IA-MNS. O e-mail sozinho não basta para unir
            contas: para usar esse perfil, confirme que ele é seu entrando por
            uma forma de acesso dele.
          </p>
          {identity.token ? (
            <div className="identity-actions">
              <button
                disabled={busy}
                onClick={() => void link(identity.token!)}
              >
                Vincular ao perfil em que entrei
              </button>
            </div>
          ) : (
            <>
              {methods
                .filter((method): method is Provider => method !== "local")
                .map((method) => (
                  <ProviderButton
                    key={method}
                    provider={method}
                    resumeFirstAccess
                  />
                ))}
              {methods.includes("local") && (
                <LocalSignIn
                  surface="direct"
                  submitLabel="Entrar e vincular"
                  onAuthenticated={(token, expiresIn) => link(token, expiresIn)}
                />
              )}
              {!methods.length && (
                <p className="identity-hint">
                  Se esse perfil for seu, peça ao administrador do IA-MNS para
                  vincular esta conta a ele.
                </p>
              )}
            </>
          )}
          <div className="identity-actions">{separate}</div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </AuthLayout>
  );
}

/** Owner-issued invitation to prove a PDT Connect or Sankhya account for a profile. */
export function LinkInvitationPage() {
  useIdentityStart();
  const token = useFragmentSecret();
  const [invitation, setInvitation] = useState<
    { displayName: string | null; provider: Provider } | null | undefined
  >(undefined);
  useEffect(() => {
    if (!token) return setInvitation(null);
    void inspectInvitation("link", token).then(
      (result) =>
        setInvitation(
          result.provider
            ? { displayName: result.displayName, provider: result.provider }
            : null,
        ),
      () => setInvitation(null),
    );
  }, [token]);
  return (
    <AuthLayout title="Vincular conta ao IA-MNS">
      {invitation === null && (
        <p role="alert">
          Este convite é inválido, expirou ou já foi usado. Peça outro ao
          administrador.
        </p>
      )}
      {invitation && token && (
        <>
          <p>
            {invitation.displayName ? `Olá, ${invitation.displayName}. ` : ""}O
            administrador do IA-MNS preparou seu perfil. Entre com sua conta do{" "}
            {providerName[invitation.provider]} para vinculá-la a ele; depois
            você poderá entrar no IA-MNS por ela.
          </p>
          <ProviderButton
            provider={invitation.provider}
            intent="invite"
            invitation={token}
            label={`Entrar com ${providerName[invitation.provider]} e vincular`}
          />
        </>
      )}
    </AuthLayout>
  );
}

/** Optional or owner-required TOTP enrollment for the signed-in Person. */
export function TotpSetup({
  token,
  onDone,
}: {
  token: string;
  onDone: (accessToken: string, expiresIn: number) => void;
}) {
  return (
    <TotpEnrollment
      start={() => startTotp(token)}
      confirm={(setup, code) => confirmTotp(token, setup, code)}
      onDone={onDone}
    />
  );
}

function CredentialForm({
  submitLabel,
  withName,
  onSubmit,
}: {
  submitLabel: string;
  withName?: boolean;
  onSubmit: (input: {
    displayName: string;
    login: string;
    password: string;
  }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="identity-form"
      onSubmit={(event) =>
        void (async () => {
          event.preventDefault();
          if (password !== confirmation)
            return setError("As senhas não conferem.");
          setBusy(true);
          setError(null);
          try {
            await onSubmit({ displayName, login, password });
          } catch (failure) {
            setError(identityMessage(failure));
          } finally {
            setBusy(false);
          }
        })()
      }
    >
      {withName && (
        <>
          <label htmlFor="identity-name">Nome</label>
          <input
            id="identity-name"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            maxLength={120}
          />
        </>
      )}
      <label htmlFor="identity-new-login">Usuário</label>
      <input
        id="identity-new-login"
        autoComplete="username"
        value={login}
        onChange={(event) => setLogin(event.target.value)}
        required
        maxLength={64}
      />
      <label htmlFor="identity-new-password">
        Senha (mínimo 12 caracteres)
      </label>
      <input
        id="identity-new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <label htmlFor="identity-confirm-password">Confirme a senha</label>
      <input
        id="identity-confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
      />
      <button disabled={busy}>{submitLabel}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function BootstrapPage() {
  const identity = useIdentityStart();
  const navigate = useNavigate();
  const token = useFragmentSecret();
  const [valid, setValid] = useState<boolean | null>(null);
  const [session, setSession] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return setValid(false);
    void inspectInvitation("bootstrap", token).then(
      () => setValid(true),
      () => setValid(false),
    );
  }, [token]);
  return (
    <AuthLayout title="Configuração inicial do IA-MNS">
      {valid === false && (
        <p role="alert">
          Este convite de configuração é inválido, expirou ou já foi usado. Gere
          outro no servidor.
        </p>
      )}
      {valid && !session && token && (
        <>
          <p>
            Crie o administrador principal. Depois você configurará a
            verificação em duas etapas, obrigatória para administrar o IA-MNS.
          </p>
          <CredentialForm
            withName
            submitLabel="Criar administrador"
            onSubmit={async (input) => {
              const outcome = await completeBootstrap({ token, ...input });
              if (outcome.kind === "authenticated") {
                identity.accept(outcome.accessToken, outcome.expiresIn);
                setSession(outcome.accessToken);
              }
            }}
          />
        </>
      )}
      {session && (
        <TotpSetup
          token={session}
          onDone={(accessToken, expiresIn) => {
            identity.accept(accessToken, expiresIn);
            void navigate({ to: "/admin" });
          }}
        />
      )}
    </AuthLayout>
  );
}

export function InvitationPage() {
  const identity = useIdentityStart();
  const navigate = useNavigate();
  const [invitation] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const purpose: "enrollment" | "reset" = params.has("reset")
      ? "reset"
      : "enrollment";
    const value = params.get(purpose);
    return value && /^[A-Za-z0-9_-]{32,128}$/.test(value)
      ? { purpose: purpose, token: value }
      : null;
  });
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
  }, []);
  const [enrollment, setEnrollment] = useState<string | null>(null);
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!invitation) return setName(null);
    void inspectInvitation(invitation.purpose, invitation.token).then(
      (result) => setName(result.displayName ?? ""),
      () => setName(null),
    );
  }, [invitation]);
  return (
    <AuthLayout
      title={
        invitation?.purpose === "reset"
          ? "Redefinir acesso local"
          : "Criar acesso ao IA-MNS"
      }
    >
      {name === null && (
        <p role="alert">
          Este convite é inválido, expirou ou já foi usado. Peça outro ao
          administrador.
        </p>
      )}
      {enrollment && (
        <>
          <p role="status">
            Acesso criado. A política do IA-MNS exige a verificação em duas
            etapas: configure o aplicativo autenticador para entrar.
          </p>
          <TotpEnrollment
            autoStart
            start={() => startSignInEnrollment(enrollment)}
            confirm={(setup, code) =>
              confirmSignInEnrollment(enrollment, setup, code)
            }
            onDone={(accessToken, expiresIn) => {
              identity.accept(accessToken, expiresIn);
              void navigate({ to: "/conta" });
            }}
          />
        </>
      )}
      {!enrollment && name !== null && name !== undefined && invitation && (
        <>
          {name && <p>Olá, {name}. Defina seu usuário e senha do IA-MNS.</p>}
          <CredentialForm
            submitLabel="Criar acesso"
            onSubmit={async (input) => {
              const outcome = await completeInvitation({
                purpose: invitation.purpose,
                token: invitation.token,
                login: input.login,
                password: input.password,
              });
              if (outcome.kind === "mfa_enrollment_required")
                setEnrollment(outcome.challenge);
              else if (outcome.kind === "authenticated") {
                identity.accept(outcome.accessToken, outcome.expiresIn);
                void navigate({ to: "/conta" });
              }
            }}
          />
        </>
      )}
    </AuthLayout>
  );
}
