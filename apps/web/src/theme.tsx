import { useEffect, useState } from "react";
import { currentSurface } from "./surface.js";
type Theme = "light" | "dark";
const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark";

/**
 * Inside PDT Connect the host owns the display theme: the frame starts with the
 * `theme` query value of its embed URL and follows `ia-mns:host-theme`
 * messages. Neither is stored, so the direct-URL preference stays untouched.
 */
export const hostThemed = currentSurface.surface === "pdt";
function initialTheme(): Theme {
  if (hostThemed) {
    const requested = new URLSearchParams(window.location.search).get("theme");
    return isTheme(requested) ? requested : "light";
  }
  try {
    const saved = localStorage.getItem("ia-mns-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Storage is optional. */
  }
  // Light is the product default; only an explicit choice selects dark.
  return "light";
}
export function initializeTheme() {
  document.documentElement.dataset.theme = initialTheme();
  if (hostThemed) listenForHostTheme();
}

// The host origin is known only after the identity handshake starts; a theme
// message that arrives earlier waits until its origin is confirmed.
let trustedHost: string | null = null;
let pending: { origin: string; theme: Theme } | null = null;
function listenForHostTheme() {
  window.addEventListener("message", (event: MessageEvent) => {
    if (window.parent === window || event.source !== window.parent) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.v !== 1 || data.type !== "ia-mns:host-theme") return;
    if (!isTheme(data.theme)) return;
    if (trustedHost === null)
      pending = { origin: event.origin, theme: data.theme };
    else if (event.origin === trustedHost)
      document.documentElement.dataset.theme = data.theme;
  });
}
/** Accepts display messages from the embedded host's verified origin. */
export function trustHostTheme(origin: string) {
  trustedHost = origin;
  if (pending?.origin === origin)
    document.documentElement.dataset.theme = pending.theme;
  pending = null;
}
/** Current display theme and its toggle; the choice is only a display preference. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => initialTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("ia-mns-theme", next);
    } catch {
      /* Keep the selection for this page. */
    }
  }
  return { theme, toggle };
}
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={
        theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"
      }
    >
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}

/** Theme switch as an entry of a menu (for example the account menu). */
export function ThemeMenuItem() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      role="menuitem"
      className="account-menu-item"
      onClick={toggle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path
          d={
            theme === "light"
              ? "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"
              : "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          }
        />
      </svg>
      <span>{theme === "light" ? "Tema escuro" : "Tema claro"}</span>
    </button>
  );
}
