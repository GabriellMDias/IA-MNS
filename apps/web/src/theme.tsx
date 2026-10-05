import { useEffect, useState } from "react";
type Theme = "light" | "dark";
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("ia-mns-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Storage is optional. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
export function initializeTheme() {
  document.documentElement.dataset.theme = initialTheme();
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
