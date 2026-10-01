import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CredentialContext = {
  token: string | null;
  setToken: (token: string | null) => void;
  isCurrentSession: () => boolean;
};
const context = createContext<CredentialContext | null>(null);

export function CredentialProvider({ children }: { children: ReactNode }) {
  const revision = useRef(0);
  const [credential, setCredential] = useState({
    token: null as string | null,
    revision: 0,
  });
  function setToken(token: string | null) {
    // Invalidate pending callbacks synchronously, even if the same token is
    // reused later. Clearing a query cache cannot cancel server mutations.
    revision.current++;
    setCredential({ token, revision: revision.current });
  }
  return (
    <context.Provider
      value={{
        token: credential.token,
        setToken,
        isCurrentSession: () => revision.current === credential.revision,
      }}
    >
      {children}
    </context.Provider>
  );
}

export function useCredential() {
  const value = useContext(context);
  if (!value) throw new Error("CredentialProvider is missing.");
  return value;
}
