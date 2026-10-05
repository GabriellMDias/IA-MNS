import { createContext, useContext, useState, type ReactNode } from "react";
import { useCredentials } from "../../credentials.js";
type Session = {
  token: string | null;
  setToken: (token: string | null) => void;
  /** True when a sign-in module manages credentials; no manual token entry. */
  managed: boolean;
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
};
const AgentSession = createContext<Session | null>(null);
export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const { token, setToken, managed } = useCredentials();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  return (
    <AgentSession
      value={{
        token,
        setToken,
        managed,
        sidebarExpanded,
        setSidebarExpanded,
        sidebarWidth,
        setSidebarWidth,
      }}
    >
      {children}
    </AgentSession>
  );
}
export function useAgentSession() {
  const session = useContext(AgentSession);
  if (!session) throw new Error("Agent session provider missing");
  return session;
}
