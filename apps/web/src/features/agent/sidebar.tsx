import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { hostThemed, ThemeMenuItem, ThemeToggle } from "../../theme.js";
import brandMark from "../../assets/brand-mark.svg";
import {
  useAccountMenu,
  useModuleNavigation,
} from "../../module-navigation.js";
import { useAgentSession } from "./session.js";
import type {
  Conversation,
  ConversationScope,
  ConversationPatch,
} from "./api.js";
export function SidebarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  );
}
function Icon({
  kind,
}: {
  kind: "new" | "search" | "pin" | "archive" | "docs";
}) {
  const paths = {
    new: "M14 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9M19 3l2 2-10 10-4 1 1-4Z",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    pin: "M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8",
    archive: "M3 3h18v4H3ZM5 7v13h14V7M10 11h4",
    docs: "M4 3h12l4 4v14H4ZM15 3v5h5M8 12h8M8 16h8",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function ConversationMenu({
  item,
  disabled,
  onRename,
  onUpdate,
  onDelete,
}: {
  item: Conversation;
  disabled: boolean;
  onRename: (item: Conversation) => void;
  onUpdate: (item: Conversation, patch: ConversationPatch) => void;
  onDelete: (item: Conversation) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function dismiss() {
    menu.current?.hidePopover();
  }
  return (
    <>
      <button
        ref={trigger}
        className="agent-conversation-more"
        aria-label={`Opções de ${item.title}`}
        aria-haspopup="menu"
        popoverTarget={`options-${item.id}`}
        disabled={disabled}
        onClick={() => {
          const bounds = trigger.current!.getBoundingClientRect();
          menu.current!.style.left = `${Math.max(8, Math.min(bounds.right - 192, window.innerWidth - 200))}px`;
          menu.current!.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 200))}px`;
        }}
      >
        ···
      </button>
      <div
        ref={menu}
        popover="auto"
        id={`options-${item.id}`}
        className="agent-conversation-options"
        role="menu"
        aria-label={`Opções de ${item.title}`}
        onToggle={() => {
          if (menu.current?.matches(":popover-open"))
            menu.current.querySelector<HTMLButtonElement>("button")?.focus();
        }}
        onKeyDown={(event) => {
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            buttons[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                    buttons.length
            ]?.focus();
          }
        }}
      >
        <button
          role="menuitem"
          onClick={() => {
            dismiss();
            onRename(item);
          }}
        >
          Renomear
        </button>
        <button
          role="menuitem"
          onClick={() => {
            dismiss();
            onUpdate(item, { pinned: !item.pinned });
          }}
        >
          {item.pinned ? "Desafixar" : "Fixar"}
        </button>
        <button
          role="menuitem"
          onClick={() => {
            dismiss();
            onUpdate(item, { archived: !item.archived });
          }}
        >
          {item.archived ? "Restaurar" : "Arquivar"}
        </button>
        <button
          role="menuitem"
          className="agent-delete-action"
          onClick={() => {
            dismiss();
            onDelete(item);
          }}
        >
          Excluir
        </button>
      </div>
    </>
  );
}
type Props = {
  compact: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  items: Conversation[];
  currentId?: string;
  scope: ConversationScope;
  onScope: (scope: ConversationScope) => void;
  onNew: () => void;
  onSearch: () => void;
  onSelect: () => void;
  onRename: (item: Conversation) => void;
  onUpdate: (item: Conversation, patch: ConversationPatch) => void;
  onDelete: (item: Conversation) => void;
  disabled: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
};
export function ConversationSidebar(props: Props) {
  const navigation = useModuleNavigation();
  const AccountMenu = useAccountMenu();
  const navigate = useNavigate();
  const { sidebarExpanded, setSidebarExpanded, sidebarWidth, setSidebarWidth } =
    useAgentSession();
  const drawer = useRef<HTMLDialogElement>(null);
  const [resizing, setResizing] = useState(false);
  const expanded = props.compact || sidebarExpanded;
  useEffect(() => {
    const element = drawer.current;
    if (!element) return;
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (props.mobileOpen) {
      if (!element.open) element.showModal();
      frame = requestAnimationFrame(() => element.classList.add("is-open"));
    } else if (element.open) {
      element.classList.remove("is-open");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        element.close();
      else timer = setTimeout(() => element.close(), 180);
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [props.mobileOpen]);
  const maxWidth = () => Math.max(240, Math.min(420, window.innerWidth * 0.45));
  useEffect(() => {
    const clamp = () =>
      setSidebarWidth(
        Math.max(240, Math.min(420, window.innerWidth * 0.45, sidebarWidth)),
      );
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [sidebarWidth, setSidebarWidth]);
  const resize = (width: number) =>
    setSidebarWidth(Math.round(Math.max(240, Math.min(maxWidth(), width))));
  // Without an account menu (or a signed-in person) these stay visible.
  const shellEntries = (
    <>
      {navigation.map((Item, index) => (
        <Item key={index} />
      ))}
      {__ORION_DOCUMENTATION__ && (
        <Link to="/docs" aria-label="Documentação" title="Documentação">
          <Icon kind="docs" />
          <span className="agent-sidebar-text">Documentação</span>
        </Link>
      )}
      {!hostThemed && <ThemeToggle />}
    </>
  );
  const content = (
    <>
      <div className="agent-sidebar-title">
        <img
          className="agent-brand-mark"
          src={brandMark}
          alt=""
          width="30"
          height="30"
        />
        <span className="agent-sidebar-text agent-brand-name">IA-MNS</span>
        <button
          className="agent-icon-button agent-sidebar-toggle"
          aria-label={
            props.compact
              ? "Fechar barra lateral"
              : sidebarExpanded
                ? "Recolher barra lateral"
                : "Expandir barra lateral"
          }
          title={
            sidebarExpanded
              ? "Recolher barra lateral"
              : "Expandir barra lateral"
          }
          aria-expanded={expanded}
          onClick={() =>
            props.compact
              ? props.onClose()
              : setSidebarExpanded(!sidebarExpanded)
          }
        >
          <SidebarIcon />
        </button>
      </div>
      <nav className="agent-sidebar-tools" aria-label="Ferramentas da conversa">
        <button
          aria-label="Nova conversa"
          title="Nova conversa"
          disabled={props.disabled}
          onClick={props.onNew}
        >
          <Icon kind="new" />
          <span className="agent-sidebar-text">Nova conversa</span>
        </button>
        <button
          aria-label="Pesquisar conversas"
          title="Pesquisar conversas"
          disabled={props.disabled}
          onClick={props.onSearch}
        >
          <Icon kind="search" />
          <span className="agent-sidebar-text">Pesquisar</span>
        </button>
        {(
          [
            ["active", "Conversas", "new"],
            ["pinned", "Fixados", "pin"],
            ["archived", "Arquivadas", "archive"],
          ] as const
        ).map(([scope, label, kind]) => (
          <button
            key={scope}
            aria-label={label}
            title={label}
            aria-pressed={props.scope === scope}
            disabled={props.disabled}
            onClick={() => {
              setSidebarExpanded(true);
              props.onScope(scope);
            }}
          >
            <Icon kind={kind} />
            <span className="agent-sidebar-text">{label}</span>
          </button>
        ))}
      </nav>
      <nav
        className="agent-history"
        aria-label="Conversas anteriores"
        inert={!expanded}
      >
        <p>
          {props.scope === "pinned"
            ? "Fixados"
            : props.scope === "archived"
              ? "Arquivadas"
              : "Conversas"}
        </p>
        {props.items.map((item) => (
          <div key={item.id} className="agent-conversation-row">
            <Link
              to="/chat/$conversationId"
              params={{ conversationId: item.id }}
              search={{ view: props.scope }}
              aria-current={item.id === props.currentId ? "page" : undefined}
              onClick={(event) => {
                if (props.disabled) event.preventDefault();
                else props.onSelect();
              }}
              title={item.title}
            >
              {item.pinned && <span aria-label="Fixada">◆ </span>}
              {item.title}
            </Link>
            <ConversationMenu
              item={item}
              disabled={props.disabled}
              onRename={props.onRename}
              onUpdate={props.onUpdate}
              onDelete={props.onDelete}
            />
          </div>
        ))}
        {!props.items.length && (
          <span className="agent-history-empty">
            Nenhuma conversa aqui ainda.
          </span>
        )}
        {props.hasMore && (
          <button disabled={props.loadingMore} onClick={props.onMore}>
            Mais conversas
          </button>
        )}
      </nav>
      <nav className="agent-sidebar-bottom" aria-label="Aplicação">
        {AccountMenu ? (
          <AccountMenu
            collapsed={!expanded}
            items={
              <>
                {__ORION_DOCUMENTATION__ && (
                  <button
                    type="button"
                    role="menuitem"
                    className="account-menu-item"
                    onClick={() => void navigate({ to: "/docs" })}
                  >
                    <Icon kind="docs" />
                    <span>Documentação</span>
                  </button>
                )}
                {!hostThemed && <ThemeMenuItem />}
              </>
            }
            fallback={shellEntries}
          />
        ) : (
          shellEntries
        )}
      </nav>
    </>
  );
  if (props.compact)
    return (
      <dialog
        ref={drawer}
        id="agent-sidebar"
        className="agent-sidebar agent-sidebar-drawer"
        aria-label="Conversas"
        onCancel={(event) => {
          event.preventDefault();
          props.onClose();
        }}
        onClose={props.onClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              props.onClose();
          }
        }}
      >
        {content}
      </dialog>
    );
  return (
    <aside
      id="agent-sidebar"
      className={`agent-sidebar ${expanded ? "is-expanded" : "is-collapsed"} ${resizing ? "is-resizing" : ""}`}
      aria-label="Barra lateral"
    >
      {content}
      {expanded && (
        <div
          className="agent-sidebar-resizer"
          role="separator"
          aria-label="Largura da barra lateral"
          aria-orientation="vertical"
          aria-valuemin={240}
          aria-valuemax={Math.floor(maxWidth())}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onDoubleClick={() => resize(260)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              resize(event.clientX);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            setResizing(false);
          }}
          onLostPointerCapture={() => setResizing(false)}
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              resize(
                event.key === "Home"
                  ? 240
                  : event.key === "End"
                    ? maxWidth()
                    : sidebarWidth + (event.key === "ArrowLeft" ? -16 : 16),
              );
            }
          }}
        />
      )}
    </aside>
  );
}
