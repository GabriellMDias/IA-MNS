import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiFailure } from "../../api-client.js";
import { ConversationSidebar, SidebarIcon } from "./sidebar.js";
import { ConversationSearch } from "./search.js";
import { SalesResults } from "../sales/results.js";
import { useAgentSession } from "./session.js";
import { useCredentials } from "../../credentials.js";
import { newRequestId } from "./request-id.js";
import {
  getAgentStatus,
  listConversations,
  getConversation,
  createConversation,
  submitTurn,
  deleteConversation,
  updateConversation,
  type Conversation,
  type ConversationScope,
  type ConversationPatch,
  type AgentTurn,
} from "./api.js";
import "./agent.css";
import "../sales/sales.css";
const messages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Seu acesso precisa ser renovado.",
  AGENT_ACCESS_DENIED: "Seu acesso não permite essa consulta.",
  SALES_ACCESS_DENIED: "Seu acesso não permite consultar vendas.",
  AGENT_NOT_CONFIGURED: "O agente está indisponível no momento.",
  AGENT_CONVERSATION_ARCHIVED: "Restaure a conversa para continuar.",
  AGENT_CONVERSATION_NOT_FOUND: "Esta conversa não está disponível.",
  AGENT_CONVERSATION_BUSY:
    "Uma mensagem já está sendo processada. Aguarde a resposta.",
  AGENT_REQUEST_CONFLICT:
    "Este envio não corresponde à mensagem anterior. Abra a conversa novamente.",
  AGENT_PROVIDER_UNAVAILABLE:
    "Não consegui processar sua mensagem agora. Tente novamente em instantes.",
  SALES_PROVIDER_UNAVAILABLE:
    "Não consegui consultar as vendas agora. Tente novamente em instantes.",
  SALES_QUERY_INVALID:
    "Preciso de um período válido de até 366 dias e um filtro de produto mais específico.",
  SALES_RESULT_TOO_LARGE:
    "A consulta ficou muito ampla. Reduza o período ou especifique melhor o produto.",
  AGENT_EXECUTION_INTERRUPTED:
    "A resposta foi interrompida. Você pode enviar uma nova mensagem para continuar.",
  INTERNAL_ERROR:
    "Não consegui concluir esta resposta. Tente novamente em instantes.",
  RATE_LIMITED: "Aguarde um minuto antes de enviar outra mensagem.",
};
function failureText(error: unknown) {
  return error instanceof ApiFailure
    ? (messages[error.code] ?? "Não foi possível concluir a solicitação.")
    : "Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.";
}
type Attempt = { conversationId: string; requestId: string; message: string };
export function AgentPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const scope: ConversationScope =
    search.view === "pinned" || search.view === "archived"
      ? search.view
      : "active";
  const params = useParams({ strict: false });
  const conversationId =
    "conversationId" in params ? params.conversationId : undefined;
  const { token, setToken, managed, sidebarExpanded, sidebarWidth } =
    useAgentSession();
  const { requestSignIn } = useCredentials();
  useEffect(() => requestSignIn(), [requestSignIn]);
  const [tokenInput, setTokenInput] = useState("");
  const [message, setMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia("(max-width: 800px)").matches,
  );
  const sidebarOpen = isCompact ? historyOpen : sidebarExpanded;
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [title, setTitle] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const renameDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const change = () => {
      setIsCompact(media.matches);
      setHistoryOpen(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [message, sidebarOpen, sidebarWidth]);
  const status = useQuery({
    queryKey: ["agent-status"],
    queryFn: ({ signal }) => getAgentStatus(signal),
  });
  const ready =
    status.data?.configured &&
    (status.data.accessMode === "local" ||
      (status.data.accessMode === "token" && token !== null));
  const conversations = useInfiniteQuery({
    queryKey: ["agent-conversations", scope],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      listConversations(token, pageParam, signal, scope),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(ready),
  });
  const detail = useInfiniteQuery({
    queryKey: ["agent-detail", conversationId],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ signal, pageParam }) =>
      getConversation(token, conversationId!, pageParam, signal),
    getNextPageParam: (page) => page.olderThan ?? undefined,
    enabled: Boolean(ready && conversationId),
    refetchInterval: (query) =>
      query.state.data?.pages[0]?.turns.some((turn) => turn.state === "running")
        ? 1000
        : false,
  });
  const turns = [
    ...new Map(
      (detail.data?.pages.flatMap((page) => page.turns) ?? []).map((turn) => [
        turn.id,
        turn,
      ]),
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence);
  const activeTurn = turns.find((turn) => turn.state === "running");
  const ask = useMutation({
    mutationFn: async (question: string) => {
      if (!attempt.current) {
        const id = conversationId ?? (await createConversation(token)).id;
        attempt.current = {
          conversationId: id,
          requestId: newRequestId(),
          message: question,
        };
      }
      const current = attempt.current;
      const turn = await submitTurn(
        token,
        current.conversationId,
        current.message,
        current.requestId,
      );
      return { turn, conversationId: current.conversationId };
    },
    async onSuccess(result) {
      if (!conversationId)
        await navigate({
          to: "/chat/$conversationId",
          params: { conversationId: result.conversationId },
          search: { view: scope },
        });
      attempt.current = null;
      setMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["agent-conversations"] }),
      ]);
      inputRef.current?.focus();
    },
  });
  const update = useMutation({
    mutationFn: ({
      item,
      patch,
    }: {
      item: Conversation;
      patch: ConversationPatch;
    }) => updateConversation(token, item.id, patch),
    async onSuccess(item) {
      setRenameTarget(null);
      if (item.archived && item.id === conversationId)
        await navigate({ to: "/", search: { view: scope } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["agent-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["agent-search"] }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: (item: Conversation) => deleteConversation(token, item.id),
    async onSuccess(_, item) {
      setDeleteTarget(null);
      queryClient.removeQueries({ queryKey: ["agent-detail", item.id] });
      if (item.id === conversationId) {
        attempt.current = null;
        ask.reset();
        setMessage("");
        await navigate({ to: "/", search: { view: scope } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["agent-search"] }),
      ]);
    },
  });
  const archived = Boolean(detail.data?.pages[0].conversation.archived);
  const unresolved = Boolean(ask.error && attempt.current);
  const busy =
    ask.isPending ||
    Boolean(activeTurn) ||
    remove.isPending ||
    update.isPending;
  useEffect(() => {
    const dialog = deleteDialog.current;
    if (deleteTarget && !dialog?.open) dialog?.showModal();
    else if (!deleteTarget && dialog?.open) dialog.close();
  }, [deleteTarget]);
  useEffect(() => {
    const dialog = renameDialog.current;
    if (renameTarget && !dialog?.open) dialog?.showModal();
    else if (!renameTarget && dialog?.open) dialog.close();
  }, [renameTarget]);
  function changeScope(view: ConversationScope) {
    if (busy || unresolved) return;
    void navigate(
      conversationId
        ? {
            to: "/chat/$conversationId",
            params: { conversationId },
            search: { view },
            replace: true,
          }
        : { to: "/", search: { view }, replace: true },
    );
  }
  function selectConversation() {
    ask.reset();
    update.reset();
    remove.reset();
    update.reset();
    setMessage("");
    setHistoryOpen(false);
  }
  async function newConversation() {
    if (busy || unresolved) return;
    attempt.current = null;
    ask.reset();
    remove.reset();
    update.reset();
    setMessage("");
    setHistoryOpen(false);
    await navigate({ to: "/", search: { view: "active" } });
    inputRef.current?.focus();
  }
  function changeToken(event: FormEvent) {
    event.preventDefault();
    queryClient.clear();
    attempt.current = null;
    ask.reset();
    remove.reset();
    update.reset();
    setMessage("");
    setToken(tokenInput.trim() || null);
    setTokenInput("");
    void navigate({ to: "/" });
  }
  function send(question = message) {
    if (ready && !busy && !archived && question.trim())
      ask.mutate(question.trim());
  }
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, [turns.length, activeTurn?.events.length]);
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ["agent-detail"] });
      queryClient.removeQueries({ queryKey: ["agent-conversations"] });
      queryClient.removeQueries({ queryKey: ["agent-search"] });
    },
    [queryClient],
  );
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !activeTurn)
      void queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
    wasRunning.current = Boolean(activeTurn);
  }, [activeTurn, queryClient]);
  useEffect(() => {
    const current = attempt.current;
    if (
      ask.error &&
      current &&
      turns.some((turn) => turn.requestId === current.requestId)
    ) {
      attempt.current = null;
      ask.reset();
      setMessage("");
    }
  });
  const lastReply = turns.at(-1)?.reply;
  const error =
    ask.error ??
    remove.error ??
    update.error ??
    detail.error ??
    conversations.error ??
    status.error;
  function turnView(turn: AgentTurn) {
    return (
      <div className="agent-turn" key={turn.id}>
        <div className="agent-user-message">{turn.question}</div>
        <article className="agent-assistant-message">
          <div className="agent-assistant-label">
            <span aria-hidden="true">✦</span> IA-MNS
          </div>
          {turn.state === "running" ? (
            <div className="agent-progress" role="status">
              <span className="agent-pulse" aria-hidden="true" />
              {turn.events.at(-1)?.message ?? "Recebendo sua mensagem…"}
              <ol aria-label="Progresso da resposta">
                {turn.events.slice(0, -1).map((event, index) => (
                  <li key={index}>✓ {event.message}</li>
                ))}
              </ol>
            </div>
          ) : turn.reply ? (
            <>
              <p className="agent-answer-text">{turn.reply.message}</p>
              {turn.reply.result && <SalesResults result={turn.reply.result} />}
            </>
          ) : (
            <p className="agent-turn-failure" role="alert">
              {messages[turn.failureCode ?? "INTERNAL_ERROR"] ??
                messages.INTERNAL_ERROR}
              <small className="agent-failure-reference">
                Referência: {turn.id}
              </small>
            </p>
          )}
        </article>
      </div>
    );
  }
  return (
    <section
      className="agent-workspace"
      style={
        {
          "--agent-sidebar-width": `${isCompact ? 0 : sidebarExpanded ? sidebarWidth : 60}px`,
        } as CSSProperties
      }
      aria-label="Agente IA-MNS"
    >
      <ConversationSidebar
        compact={isCompact}
        mobileOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={conversations.data?.pages.flatMap((page) => page.items) ?? []}
        currentId={conversationId}
        scope={scope}
        onScope={changeScope}
        onNew={() => void newConversation()}
        onSearch={() => {
          setHistoryOpen(false);
          setSearchOpen(true);
        }}
        onSelect={selectConversation}
        onRename={(item) => {
          setTitle(item.title);
          setRenameTarget(item);
        }}
        onUpdate={(item, patch) => update.mutate({ item, patch })}
        onDelete={setDeleteTarget}
        disabled={busy || unresolved || !ready}
        hasMore={Boolean(conversations.hasNextPage)}
        loadingMore={conversations.isFetchingNextPage}
        onMore={() => void conversations.fetchNextPage()}
      />
      {searchOpen && (
        <ConversationSearch
          token={token}
          onClose={() => setSearchOpen(false)}
          onSelect={(item) => {
            setSearchOpen(false);
            selectConversation();
            void navigate({
              to: "/chat/$conversationId",
              params: { conversationId: item.id },
              search: { view: item.archived ? "archived" : "active" },
            });
          }}
        />
      )}
      <div className="agent-main">
        <header className="agent-chat-header">
          <div className="agent-chat-identity">
            {isCompact && (
              <button
                className="agent-icon-button"
                aria-label="Conversas"
                aria-expanded={historyOpen}
                aria-controls="agent-sidebar"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <SidebarIcon />
              </button>
            )}
            <h1>IA-MNS</h1>
          </div>
        </header>
        <dialog
          ref={deleteDialog}
          className="agent-delete-dialog"
          aria-labelledby="agent-delete-title"
          aria-describedby="agent-delete-description"
          onCancel={() => setDeleteTarget(null)}
          onClose={() => setDeleteTarget(null)}
        >
          <h2 id="agent-delete-title">Excluir esta conversa?</h2>
          <p id="agent-delete-description">
            Todo o histórico desta conversa será excluído.
          </p>
          {remove.error && <p role="alert">{failureText(remove.error)}</p>}
          <div>
            <button onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button
              disabled={busy || unresolved}
              onClick={() => {
                if (deleteTarget) remove.mutate(deleteTarget);
              }}
            >
              Excluir
            </button>
          </div>
        </dialog>
        <dialog
          ref={renameDialog}
          className="agent-delete-dialog"
          aria-labelledby="agent-rename-title"
          onCancel={() => setRenameTarget(null)}
          onClose={() => setRenameTarget(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (renameTarget && title.trim() && !busy)
                update.mutate({
                  item: renameTarget,
                  patch: { title: title.trim() },
                });
            }}
          >
            <h2 id="agent-rename-title">Renomear conversa</h2>
            <label htmlFor="agent-conversation-title">Nome da conversa</label>
            <input
              id="agent-conversation-title"
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
            <div>
              <button type="button" onClick={() => setRenameTarget(null)}>
                Cancelar
              </button>
              <button disabled={busy || !title.trim()}>Salvar</button>
            </div>
            {update.error && <p role="alert">{failureText(update.error)}</p>}
          </form>
        </dialog>
        {managed && !token && (
          <p className="agent-access" role="status">
            <Link to="/entrar">Entre</Link> para conversar com o IA-MNS.
          </p>
        )}
        {!managed && status.data?.accessMode === "token" && (
          <form className="agent-access" onSubmit={changeToken}>
            <label htmlFor="agent-token">Token de acesso</label>
            <input
              id="agent-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
            <button disabled={busy}>
              {tokenInput.trim() ? "Usar token" : token ? "Sair" : "Acessar"}
            </button>
          </form>
        )}
        {status.data &&
          (!status.data.configured ||
            status.data.accessMode === "unavailable") && (
            <p className="agent-configuration" role="status">
              O agente está indisponível no momento. Verifique a configuração
              para continuar.
            </p>
          )}
        <div
          className={`agent-thread ${!conversationId && turns.length === 0 && !ask.isPending ? "is-empty" : ""}`}
          role="log"
          tabIndex={0}
          aria-label="Conversa com IA-MNS"
          aria-live="polite"
        >
          {conversationId && detail.isPending && ready && (
            <p role="status">Abrindo a conversa…</p>
          )}
          {detail.hasNextPage && (
            <button
              className="agent-older"
              disabled={detail.isFetchingNextPage}
              onClick={() => void detail.fetchNextPage()}
            >
              Mensagens anteriores
            </button>
          )}
          {turns.length === 0 && !conversationId && (
            <div className="agent-welcome">
              <h2>Como posso ajudar hoje?</h2>
              <div className="agent-examples">
                {[
                  "O que você pode fazer?",
                  ...(status.data?.capabilities
                    .flatMap((item) => item.examples)
                    .slice(0, 2) ?? []),
                ].map((question) => (
                  <button
                    key={question}
                    disabled={!ready || busy}
                    onClick={() => {
                      setMessage(question);
                      inputRef.current?.focus();
                    }}
                  >
                    <span>{question}</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map(turnView)}
          {ask.isPending && !activeTurn && (
            <div className="agent-turn">
              <div className="agent-user-message">{ask.variables}</div>
              <p role="status">Enviando sua mensagem…</p>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="agent-composer-area">
          {archived && (
            <p className="agent-archived">
              Esta conversa está arquivada.{" "}
              <button
                disabled={busy || unresolved}
                onClick={() =>
                  update.mutate({
                    item: detail.data!.pages[0].conversation,
                    patch: { archived: false },
                  })
                }
              >
                Restaurar conversa
              </button>
            </p>
          )}
          {lastReply?.suggestions.length && !busy && !archived ? (
            <div className="agent-suggestions" aria-label="Sugestões">
              {lastReply.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  disabled={!ready || unresolved}
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          {error && (
            <div className="notice notice-error" role="alert">
              {unresolved
                ? "Não consegui confirmar o envio. Verifique o envio para recuperar a resposta sem repetir a consulta."
                : failureText(error)}
              {error instanceof ApiFailure && error.requestId && (
                <small>Referência: {error.requestId}</small>
              )}
              {unresolved && (
                <button
                  onClick={() => ask.mutate(attempt.current!.message)}
                  disabled={ask.isPending}
                >
                  Verificar envio
                </button>
              )}
            </div>
          )}
          <form
            className="agent-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label className="agent-sr-only" htmlFor="agent-message">
              Sua mensagem
            </label>
            <textarea
              ref={inputRef}
              id="agent-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Converse com o IA-MNS…"
              maxLength={2000}
              rows={1}
              disabled={!ready || busy || unresolved || archived}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={
                !ready || busy || unresolved || archived || !message.trim()
              }
            >
              <span aria-hidden="true">↑</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
