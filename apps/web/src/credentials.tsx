import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/**
 * The in-memory bearer used by product modules. A sign-in module publishes it
 * and marks credentials as `managed`; feature modules only read it. Without a
 * managed sign-in, development modes may still accept a manually entered token.
 * Never persisted, logged or placed in URLs.
 */
type Credentials = {
  token: string | null;
  setToken: (token: string | null) => void;
  managed: boolean;
  setManaged: (managed: boolean) => void;
  /** Asks the sign-in module to start (no-op when none is composed). */
  requestSignIn: () => void;
  setRequestSignIn: (start: () => void) => void;
};
const CredentialContext = createContext<Credentials | null>(null);

export function CredentialProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [managed, setManaged] = useState(false);
  const [requestSignIn, setStart] = useState<() => void>(() => () => undefined);
  const setRequestSignIn = useCallback(
    (start: () => void) => setStart(() => start),
    [],
  );
  return (
    <CredentialContext
      value={{
        token,
        setToken,
        managed,
        setManaged,
        requestSignIn,
        setRequestSignIn,
      }}
    >
      {children}
    </CredentialContext>
  );
}

export function useCredentials() {
  const credentials = useContext(CredentialContext);
  if (!credentials) throw new Error("Credential provider missing");
  return credentials;
}
