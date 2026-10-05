import { useId, useRef, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { AccountMenuProps } from "../../module-navigation.js";
import { getMe } from "./api.js";
import { useIdentity } from "./session.js";

function useMe() {
  const identity = useIdentity();
  const me = useQuery({
    queryKey: ["identity-me", identity.token],
    queryFn: ({ signal }) => getMe(identity.token!, signal),
    enabled: Boolean(identity.token),
    staleTime: 60_000,
  });
  return { identity, me };
}

/** Account, administration and sign-out entries contributed to module navigation. */
export function IdentityNavigation() {
  const { identity, me } = useMe();
  if (!identity.status?.configured) return null;
  if (!identity.token)
    return identity.surface === "direct" ? (
      <Link to="/entrar" className="identity-nav">
        <span className="agent-sidebar-text">Entrar</span>
      </Link>
    ) : null;
  return (
    <>
      <Link
        to="/conta"
        className="identity-nav"
        title={me.data?.person.displayName}
      >
        <span className="agent-sidebar-text">Minha conta</span>
      </Link>
      {me.data?.person.owner && (
        <Link to="/admin" className="identity-nav">
          <span className="agent-sidebar-text">Administração</span>
        </Link>
      )}
      {identity.surface === "direct" && (
        <Link
          to="/entrar"
          className="identity-nav"
          onClick={() => {
            void identity.signOut();
          }}
        >
          <span className="agent-sidebar-text">Sair</span>
        </Link>
      )}
    </>
  );
}

/** Up to two initials of the display name, for the avatar. */
export function initials(name: string): string {
  const words = name
    .normalize("NFKC")
    .split(/\s+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word));
  const letters =
    words.length > 1
      ? [words[0], words[words.length - 1]].map((word) => Array.from(word)[0])
      : Array.from(words[0] ?? "?").slice(0, 2);
  return letters.join("").toLocaleUpperCase("pt-BR");
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="identity-avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function MenuIcon({ kind }: { kind: "account" | "admin" | "exit" }) {
  const paths = {
    account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
    admin: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6ZM9 12l2 2 4-4",
    exit: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  };
  return (
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
      <path d={paths[kind]} />
    </svg>
  );
}

/**
 * The signed-in person in the sidebar: avatar and name only; account,
 * administration, shell entries and sign-out open in a menu above it.
 */
export function IdentityAccountMenu({
  collapsed,
  items,
  fallback,
}: AccountMenuProps) {
  const { identity, me } = useMe();
  const navigate = useNavigate();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const person = me.data?.person;
  if (!identity.status?.configured || !identity.token || !person)
    return <>{fallback}</>;
  const secondary = person.owner
    ? "Administrador"
    : (person.local?.login ??
      (person.links[0]
        ? person.links[0].provider === "pdt"
          ? "PDT Connect"
          : "Sankhya"
        : ""));
  const close = () => menu.current?.hidePopover();
  const place = () => {
    const bounds = trigger.current!.getBoundingClientRect();
    const width = Math.max(bounds.width, 248);
    const element = menu.current!;
    element.style.width = `${width}px`;
    element.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`;
    element.style.bottom = `${Math.max(8, window.innerHeight - bounds.top + 6)}px`;
  };
  const item = (
    key: string,
    label: string,
    icon: ReactNode,
    action: () => void,
  ) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className="account-menu-item"
      onClick={() => {
        close();
        action();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`identity-account-trigger${collapsed ? " is-collapsed" : ""}`}
        aria-haspopup="menu"
        aria-label={`${person.displayName}, menu da conta`}
        title={collapsed ? person.displayName : undefined}
        popoverTarget={id}
        onClick={place}
      >
        <Avatar name={person.displayName} />
        {!collapsed && (
          <span className="identity-account-names">
            <span className="identity-account-name">{person.displayName}</span>
            {secondary && (
              <span className="identity-account-secondary">{secondary}</span>
            )}
          </span>
        )}
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label="Menu da conta"
        className="identity-account-menu"
        onToggle={() => {
          if (menu.current?.matches(":popover-open"))
            menu.current
              .querySelector<HTMLElement>('[role="menuitem"]')
              ?.focus();
          else if (menu.current?.contains(document.activeElement))
            trigger.current?.focus();
        }}
        onKeyDown={(event) => {
          const entries = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              '[role="menuitem"]',
            ),
          );
          const index = entries.indexOf(document.activeElement as HTMLElement);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            entries[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? entries.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : entries.length - 1)) %
                    entries.length
            ]?.focus();
          }
        }}
        onClick={(event) => {
          // Every entry, including shell entries, closes the menu.
          if ((event.target as HTMLElement).closest('[role="menuitem"]'))
            close();
        }}
      >
        <div className="identity-menu-person">
          <Avatar name={person.displayName} />
          <span className="identity-account-names">
            <span className="identity-account-name">{person.displayName}</span>
            {secondary && (
              <span className="identity-account-secondary">{secondary}</span>
            )}
          </span>
        </div>
        <hr />
        {item("account", "Minha conta", <MenuIcon kind="account" />, () => {
          void navigate({ to: "/conta" });
        })}
        {person.owner &&
          item("admin", "Administração", <MenuIcon kind="admin" />, () => {
            void navigate({ to: "/admin" });
          })}
        <hr />
        {items}
        {identity.surface === "direct" && (
          <>
            <hr />
            {item("exit", "Sair", <MenuIcon kind="exit" />, () => {
              void identity.signOut();
            })}
          </>
        )}
      </div>
    </>
  );
}
