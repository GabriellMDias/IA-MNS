import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchConversations, type Conversation } from "./api.js";
export function ConversationSearch({
  token,
  onClose,
  onSelect,
}: {
  token: string | null;
  onClose: () => void;
  onSelect: (item: Conversation) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setFilter(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useInfiniteQuery({
    queryKey: ["agent-search", filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      searchConversations(token, filter, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: filter.length >= 2,
  });
  return (
    <dialog
      ref={dialog}
      className="agent-delete-dialog agent-search-dialog"
      aria-labelledby="agent-search-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <h2 id="agent-search-title">Pesquisar conversas</h2>
      <label htmlFor="agent-search-input">Título ou mensagem enviada</label>
      <input
        id="agent-search-input"
        autoFocus
        value={query}
        maxLength={100}
        onChange={(event) => setQuery(event.target.value)}
      />
      <nav aria-label="Resultados da pesquisa">
        {filter.length >= 2 && results.isPending && (
          <p role="status">Pesquisando…</p>
        )}
        {results.error && (
          <p role="alert">Não foi possível pesquisar. Tente novamente.</p>
        )}
        {results.data?.pages
          .flatMap((page) => page.items)
          .map((item) => (
            <button key={item.id} onClick={() => onSelect(item)}>
              <span>{item.title}</span>
              <small>
                {item.archived ? "Arquivada" : item.pinned ? "Fixada" : ""}
              </small>
            </button>
          ))}
        {filter.length >= 2 &&
          !results.isPending &&
          !results.error &&
          results.data?.pages[0].items.length === 0 && (
            <p>Nenhuma conversa encontrada.</p>
          )}
        {results.hasNextPage && (
          <button
            disabled={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            Mais resultados
          </button>
        )}
      </nav>
      <div>
        <button onClick={onClose}>Fechar</button>
      </div>
    </dialog>
  );
}
