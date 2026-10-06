import { useEffect, useRef, useState, type FormEvent } from "react";
import { identityMessage } from "./messages.js";

type Secret = { setup: string; secret: string; otpauthUri: string };
type Confirmed = {
  recoveryCodes: string[];
  accessToken: string;
  expiresIn: number;
};

/**
 * Authenticator-app enrollment: shows the secret once, confirms a current code
 * and then the single-use recovery codes, which are never shown again.
 */
export function TotpEnrollment({
  start,
  confirm,
  onDone,
  autoStart = false,
}: {
  start: () => Promise<Secret>;
  confirm: (setup: string, code: string) => Promise<Confirmed>;
  onDone: (accessToken: string, expiresIn: number) => void;
  /** Start immediately (enrollment required at sign-in). */
  autoStart?: boolean;
}) {
  const [secret, setSecret] = useState<Secret | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Confirmed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const begun = useRef(false);
  const startRef = useRef(start);
  startRef.current = start;
  async function begin() {
    if (begun.current) return;
    begun.current = true;
    setError(null);
    try {
      setSecret(await startRef.current());
    } catch (failure) {
      begun.current = false;
      setError(identityMessage(failure));
    }
  }
  const beginRef = useRef(begin);
  beginRef.current = begin;
  useEffect(() => {
    if (autoStart) void beginRef.current();
  }, [autoStart]);
  if (result)
    return (
      <section className="identity-card" aria-labelledby="identity-codes-title">
        <h2 id="identity-codes-title">Códigos de recuperação</h2>
        <p>
          Guarde estes códigos em local seguro. Cada um pode ser usado uma única
          vez se você perder o aplicativo. Eles não serão exibidos novamente.
        </p>
        <ul className="identity-codes">
          {result.recoveryCodes.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
        <button onClick={() => onDone(result.accessToken, result.expiresIn)}>
          Já guardei os códigos
        </button>
      </section>
    );
  return (
    <section className="identity-card" aria-labelledby="identity-totp-title">
      <h2 id="identity-totp-title">Verificação em duas etapas</h2>
      {!secret ? (
        !autoStart && (
          <button onClick={() => void begin()}>
            Configurar aplicativo autenticador
          </button>
        )
      ) : (
        <form
          className="identity-form"
          onSubmit={(event: FormEvent) =>
            void (async () => {
              event.preventDefault();
              setError(null);
              try {
                setResult(await confirm(secret.setup, code.trim()));
              } catch (failure) {
                setError(identityMessage(failure));
              }
            })()
          }
        >
          <p>
            Adicione a conta no aplicativo autenticador (por exemplo, Microsoft
            ou Google Authenticator) usando a chave abaixo ou{" "}
            <a href={secret.otpauthUri}>este link no celular</a>.
          </p>
          <p>
            Chave: <code data-testid="totp-secret">{secret.secret}</code>
          </p>
          <label htmlFor="identity-totp-code">Código de 6 dígitos</label>
          <input
            id="identity-totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <button>Ativar</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
