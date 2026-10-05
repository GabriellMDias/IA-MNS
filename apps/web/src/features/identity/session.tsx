import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useCredentials } from "../../credentials.js";
import { currentSurface, type Surface } from "../../surface.js";
import {
  completeEmbedded,
  completeMfa,
  getIdentityStatus,
  loginLocal,
  logout,
  provisionCreate,
  provisionLink,
  refreshSession,
  startProvider,
  type IdentityStatus,
  type Outcome,
} from "./api.js";
import { requestHostProof } from "./bridge.js";
import { identityMessage } from "./messages.js";
import "./identity.css";

type Phase =
  "loading" | "unavailable" | "signed-out" | "signed-in" | "embedded";
type Identity = {
  status: IdentityStatus | undefined;
  phase: Phase;
  surface: Surface;
  token: string | null;
  /** Adopts tokens from a completed sign-in. */
  accept: (token: string, expiresIn: number) => void;
  signOut: () => Promise<void>;
  /** Product screens start identity; the local documentation portal never does. */
  start: () => void;
};
const IdentityContext = createContext<Identity | null>(null);

function subjectOf(token: string): string | null {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Owns the IA-MNS session for every surface. Direct URL: a rotating HttpOnly
 * refresh cookie restores the session. Embedded: no cookies; a new host proof
 * is requested on load and before the access token expires.
 */
export function IdentitySessionProvider({ children }: { children: ReactNode }) {
  const { token, setToken, setManaged, setRequestSignIn } = useCredentials();
  const queryClient = useQueryClient();
  const surface = currentSurface.surface;
  const [started, setStarted] = useState(surface !== "direct");
  const start = useCallback(() => setStarted(true), []);
  useEffect(() => setRequestSignIn(start), [setRequestSignIn, start]);
  const status = useQuery({
    queryKey: ["identity-status"],
    queryFn: ({ signal }) => getIdentityStatus(signal),
    staleTime: Infinity,
    enabled: started,
  });
  const [phase, setPhase] = useState<Phase>("loading");
  const [gate, setGate] = useState<
    | { kind: "connecting" }
    | { kind: "error"; message: string }
    | {
        kind: "provision";
        ticket: string;
        provider: "pdt" | "sankhya";
        label: string | null;
        methods: ("local" | "pdt" | "sankhya")[];
      }
    | null
  >(currentSurface.surface === "direct" ? null : { kind: "connecting" });
  const timer = useRef<number | undefined>(undefined);
  const subject = useRef<string | null>(null);
  const renewRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const accept = useCallback(
    (next: string, expiresIn: number) => {
      const person = subjectOf(next);
      if (subject.current !== null && person !== subject.current)
        queryClient.clear();
      subject.current = person;
      setToken(next);
      setPhase("signed-in");
      setGate(null);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => void renewRef.current(),
        Math.max(30, expiresIn - 60) * 1000,
      );
    },
    [queryClient, setToken],
  );
  const drop = useCallback(() => {
    window.clearTimeout(timer.current);
    subject.current = null;
    setToken(null);
    queryClient.clear();
    setPhase(surface === "direct" ? "signed-out" : "embedded");
  }, [queryClient, setToken, surface]);

  const handshake = useCallback(async () => {
    if (surface === "direct") return;
    setGate((current) => current ?? { kind: "connecting" });
    try {
      const started = await startProvider(surface, "login", "embedded");
      if (started.mode !== "embedded" || !started.hostOrigin)
        throw new Error("Embedded host not configured");
      const proof = await requestHostProof(
        started.hostOrigin,
        surface === "pdt"
          ? {
              provider: "pdt",
              state: started.state!,
              code_challenge: started.codeChallenge!,
            }
          : { provider: "sankhya", nonce: started.nonce! },
      );
      const outcome = await completeEmbedded(surface, {
        pendingId: started.pendingId,
        ...proof,
      });
      if (outcome.kind === "authenticated")
        accept(outcome.accessToken, outcome.expiresIn);
      else if (outcome.kind === "provision_required")
        setGate({
          kind: "provision",
          ticket: outcome.ticket,
          provider: outcome.provider,
          label: outcome.label,
          methods: outcome.methods,
        });
      else
        setGate({ kind: "error", message: "Não foi possível abrir o IA-MNS." });
    } catch (error) {
      drop();
      setGate({ kind: "error", message: identityMessage(error) });
    }
  }, [accept, drop, surface]);

  renewRef.current = async () => {
    if (surface !== "direct") return handshake();
    try {
      const refreshed = await refreshSession();
      accept(refreshed.accessToken, refreshed.expiresIn);
    } catch {
      drop();
    }
  };

  // Without a reachable identity service, product screens show their own
  // availability state instead of waiting for a session forever.
  useEffect(() => {
    if (status.isError) setPhase("unavailable");
  }, [status.isError]);
  useEffect(() => {
    if (!status.data) return;
    setManaged(status.data.configured);
    if (!status.data.configured) {
      setPhase("unavailable");
      setGate(null);
      return;
    }
    if (surface === "direct")
      void refreshSession().then(
        (result) => accept(result.accessToken, result.expiresIn),
        () => setPhase("signed-out"),
      );
    else {
      setPhase("embedded");
      void handshake();
    }
    return () => window.clearTimeout(timer.current);
  }, [status.data, surface, accept, handshake, setManaged]);

  const signOut = useCallback(async () => {
    await logout(token).catch(() => undefined);
    drop();
  }, [drop, token]);

  return (
    <IdentityContext
      value={{
        status: status.data,
        phase,
        surface,
        token,
        accept,
        signOut,
        start,
      }}
    >
      {surface !== "direct" && gate ? (
        <EmbeddedGate
          gate={gate}
          retry={handshake}
          accept={accept}
          surface={surface}
        />
      ) : (
        children
      )}
    </IdentityContext>
  );
}

export function useIdentity() {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error("Identity provider missing");
  return identity;
}

/**
 * Product screens that need a person: on the direct surface, anyone not signed
 * in goes to the sign-in screen. Embedded surfaces sign in through the host
 * gate, and environments without identity keep their own access mode.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const identity = useIdentityStart();
  if (identity.surface !== "direct" || identity.phase === "unavailable")
    return <>{children}</>;
  if (identity.phase === "signed-out") return <Navigate to="/entrar" replace />;
  if (!identity.token)
    return (
      <main className="identity-loading" aria-busy="true">
        <span className="identity-spinner" aria-hidden="true" />
        <span className="visually-hidden" role="status">
          Carregando…
        </span>
      </main>
    );
  return <>{children}</>;
}

/** Starts identity for a product screen (status, then session restore). */
export function useIdentityStart() {
  const identity = useIdentity();
  const { start } = identity;
  useEffect(() => start(), [start]);
  return identity;
}

const providerName = { pdt: "PDT Connect", sankhya: "Sankhya" } as const;

function EmbeddedGate({
  gate,
  retry,
  accept,
  surface,
}: {
  gate:
    | { kind: "connecting" }
    | { kind: "error"; message: string }
    | {
        kind: "provision";
        ticket: string;
        provider: "pdt" | "sankhya";
        label: string | null;
        methods: ("local" | "pdt" | "sankhya")[];
      };
  retry: () => Promise<void>;
  accept: (token: string, expiresIn: number) => void;
  surface: Surface;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  if (gate.kind === "connecting")
    return (
      <main className="identity-page" aria-busy="true">
        <p role="status">
          Conectando com sua identidade do{" "}
          {providerName[surface as "pdt" | "sankhya"]}…
        </p>
      </main>
    );
  if (gate.kind === "error")
    return (
      <main className="identity-page">
        <h1>IA-MNS</h1>
        <p role="alert">{gate.message}</p>
        <button onClick={() => void retry()}>Tentar novamente</button>
      </main>
    );
  async function create() {
    if (gate.kind !== "provision") return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await provisionCreate(gate.ticket);
      if (outcome.kind === "authenticated")
        accept(outcome.accessToken, outcome.expiresIn);
    } catch (failure) {
      setError(identityMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  // Embedded first access stops only when another system reported the same
  // e-mail for an existing profile: the e-mail is a hint, never proof.
  const otherSystems = gate.methods.filter(
    (method): method is "pdt" | "sankhya" =>
      method !== "local" && method !== surface,
  );
  return (
    <main className="identity-page">
      <h1>Primeiro acesso ao IA-MNS</h1>
      <p>
        Confirmamos sua conta{" "}
        {gate.label ? <strong>{gate.label}</strong> : null} no{" "}
        {providerName[gate.provider]}. Outro sistema informou o mesmo e-mail
        para um perfil que já existe no IA-MNS. Para usar esse perfil, confirme
        que ele é seu; caso contrário, crie um perfil separado.
      </p>
      {linking ? (
        <LocalSignIn
          surface={surface}
          submitLabel="Entrar e vincular"
          onAuthenticated={async (token) => {
            await provisionLink(token, gate.ticket);
            await retry();
          }}
        />
      ) : (
        <div className="identity-actions">
          {gate.methods.includes("local") && (
            <button disabled={busy} onClick={() => setLinking(true)}>
              É meu: entrar com usuário e senha do IA-MNS
            </button>
          )}
          <button
            className="identity-secondary"
            disabled={busy}
            onClick={() => void create()}
          >
            Esse perfil não é meu — criar um perfil separado
          </button>
        </div>
      )}
      {otherSystems.length > 0 && (
        <p className="identity-hint">
          Se o perfil sugerido é seu e você entra nele pelo{" "}
          {otherSystems.map((item) => providerName[item]).join(" ou ")}, abra o
          IA-MNS pelo endereço próprio, entre por esse sistema e vincule esta
          conta em Minha conta.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

/** Local sign-in with an optional second factor; reports the bearer when done. */
export function LocalSignIn({
  surface,
  submitLabel = "Entrar",
  onAuthenticated,
}: {
  surface: Surface;
  submitLabel?: string;
  onAuthenticated: (token: string, expiresIn: number) => Promise<void> | void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function finish(outcome: Outcome) {
    if (outcome.kind === "mfa_required") {
      setChallenge(outcome.challenge);
      setPassword("");
    } else if (outcome.kind === "authenticated")
      await onAuthenticated(outcome.accessToken, outcome.expiresIn);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await finish(
        challenge
          ? await completeMfa(challenge, code.trim())
          : await loginLocal(login, password, surface),
      );
    } catch (failure) {
      setError(identityMessage(failure));
      if (challenge) setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="identity-form" onSubmit={(event) => void submit(event)}>
      {!challenge ? (
        <>
          <label htmlFor="identity-login">Usuário</label>
          <input
            id="identity-login"
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            required
          />
          <label htmlFor="identity-password">Senha</label>
          <input
            id="identity-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </>
      ) : (
        <>
          <label htmlFor="identity-code">Código de verificação</label>
          <input
            id="identity-code"
            inputMode="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            autoFocus
          />
          <p className="identity-hint">
            Use o código de 6 dígitos do aplicativo autenticador ou um código de
            recuperação.
          </p>
        </>
      )}
      <button disabled={busy}>{challenge ? "Verificar" : submitLabel}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
