import { randomUUID } from "node:crypto";
import type { SalesQuery } from "./domain.js";
import { SalesFailure } from "./errors.js";

type Conversation = {
  id: string;
  owner: string;
  questions: string[];
  clarifications: string[];
  previousQuery: SalesQuery | null;
  touched: number;
  busy: boolean;
};
export class Conversations {
  private readonly items = new Map<string, Conversation>();
  private readonly cleanup: ReturnType<typeof setInterval>;
  private readonly clock: () => number;
  constructor(clock: () => number = Date.now) {
    this.clock = clock;
    this.cleanup = setInterval(() => this.expire(), 60000);
    this.cleanup.unref();
  }
  private expire() {
    for (const [id, item] of this.items)
      if (!item.busy && this.clock() - item.touched >= 1800000)
        this.items.delete(id);
  }
  acquire(owner: string, id?: string): Conversation {
    this.expire();
    if (!id) {
      if (this.items.size >= 200)
        throw new SalesFailure("SALES_CONVERSATION_BUSY");
      const item = {
        id: randomUUID(),
        owner,
        questions: [],
        clarifications: [],
        previousQuery: null,
        touched: this.clock(),
        busy: true,
      };
      this.items.set(item.id, item);
      return item;
    }
    const item = this.items.get(id);
    if (!item || item.owner !== owner || item.questions.length >= 12)
      throw new SalesFailure("SALES_CONVERSATION_EXPIRED");
    if (item.busy) throw new SalesFailure("SALES_CONVERSATION_BUSY");
    item.busy = true;
    return item;
  }
  release(
    item: Conversation,
    message?: string,
    query?: SalesQuery,
    clarification = "",
  ) {
    if (message) {
      item.questions.push(message);
      item.clarifications.push(clarification);
    }
    if (query) item.previousQuery = query;
    item.busy = false;
    item.touched = this.clock();
    if (item.questions.length === 0) this.items.delete(item.id);
  }
  remove(owner: string, id: string) {
    const item = this.items.get(id);
    if (!item || item.owner !== owner)
      throw new SalesFailure("SALES_CONVERSATION_EXPIRED");
    if (item.busy) throw new SalesFailure("SALES_CONVERSATION_BUSY");
    this.items.delete(id);
  }
  close() {
    clearInterval(this.cleanup);
    this.items.clear();
  }
}
