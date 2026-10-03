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
export function ThemeToggle() {
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
