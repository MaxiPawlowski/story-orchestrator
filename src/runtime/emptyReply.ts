import { isRecord } from "@utils/guards";
import type { WriteResult } from "@utils/writeResult";
import { beginRun, type RunOwnership } from "./runToken";

export const REASONING_RESIDUE_TAGS: readonly string[] = ["<|channel>thought", "<|channel>", "<channel|>", "<thinking>", "</thinking>", "<think>", "</think>"];

export const RECOVERABLE_REPLY_TYPES: ReadonlySet<string> = new Set(["normal", "swipe", "regenerate", "continue", "appendFinal"]);

export const EMPTY_REPLY_PLAYER_TEXT = "This reply came back empty. Swipe it to ask again.";

export const EMPTY_REPLY_ASKED = "A reply came back empty, asked again";
export const EMPTY_REPLY_LEFT = "A reply came back empty again, left for the player";
export const EMPTY_REPLY_NOT_ASKED = "A reply came back empty, not asked again";

export const EMPTY_REPLY_WAIT_MS = 60000;
export const EMPTY_REPLY_POLL_MS = 300;
export const EMPTY_REPLY_RECORDS = 20;

export const residueTags = (extra: readonly string[] = []): string[] =>
  [...new Set([...extra.map((tag) => tag.trim()), ...REASONING_RESIDUE_TAGS].filter(Boolean))].sort((left, right) => right.length - left.length);

export const visibleReplyText = (mes: string, tags: readonly string[] = REASONING_RESIDUE_TAGS): string =>
  tags.reduce((text, tag) => (tag ? text.split(tag).join("") : text), mes).trim();

const reasoningOf = (row: Record<string, unknown>): string => (isRecord(row.extra) && typeof row.extra.reasoning === "string" ? row.extra.reasoning.trim() : "");

export function isThoughtOnlyReply(row: unknown, tags: readonly string[] = REASONING_RESIDUE_TAGS): boolean {
  if (!isRecord(row) || row.is_user === true || row.is_system === true || typeof row.mes !== "string") return false;
  if (visibleReplyText(row.mes, tags)) return false;
  return reasoningOf(row).length > 0 || row.mes.trim().length > 0;
}

export const thoughtOnlyMessageIds = (chat: readonly unknown[], tags: readonly string[] = REASONING_RESIDUE_TAGS): number[] =>
  chat.flatMap((row, index) => (isThoughtOnlyReply(row, tags) ? [index] : []));

export type EmptyReplyOutcome = "asked-again" | "left" | "not-asked" | "could-not" | "lapsed";

export interface EmptyReplyRecord {
  at: number;
  chatId: string;
  messageId: number;
  member: string | null;
  type: string;
  reasoningChars: number;
  outcome: EmptyReplyOutcome;
  detail: string;
}

export interface EmptyReplyDeps {
  storyChat: () => string | null;
  openChat: () => string | null;
  row: (messageId: number) => unknown;
  chatLength: () => number;
  busy: () => boolean;
  askAgain: (messageId: number, row: unknown) => Promise<WriteResult>;
  ownership: () => RunOwnership;
  journal: (summary: string, note: string) => void;
  tags?: () => readonly string[];
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface EmptyReplyDebug {
  pending: () => boolean;
  records: () => EmptyReplyRecord[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class EmptyReplyRecovery {
  private readonly tried = new WeakMap<object, number>();
  private readonly settled = new WeakSet<object>();
  private readonly ring: EmptyReplyRecord[] = [];
  private running = 0;

  constructor(private readonly deps: EmptyReplyDeps) {}

  pending(): boolean {
    return this.running > 0;
  }

  records(): EmptyReplyRecord[] {
    return this.ring.map((record) => ({ ...record }));
  }

  debug(): EmptyReplyDebug {
    return { pending: () => this.pending(), records: () => this.records() };
  }

  private tags(): readonly string[] {
    return this.deps.tags?.() ?? REASONING_RESIDUE_TAGS;
  }

  async observe(messageId: number, type: unknown): Promise<EmptyReplyOutcome | null> {
    if (typeof type !== "string" || !RECOVERABLE_REPLY_TYPES.has(type)) return null;
    const chatId = this.deps.openChat();
    if (!chatId || this.deps.storyChat() !== chatId) return null;
    const row = this.deps.row(messageId);
    if (!isRecord(row) || !isThoughtOnlyReply(row, this.tags())) return null;
    const base = { chatId, messageId, member: typeof row.name === "string" ? row.name : null, type, reasoningChars: reasoningOf(row).length };
    const swipe = typeof row.swipe_id === "number" ? row.swipe_id : 0;
    if (this.tried.has(row)) {
      if (this.tried.get(row) === swipe || this.settled.has(row)) return null;
      this.settled.add(row);
      return this.finish(base, "left", "the reply asked for again came back empty too; it stays as it is and the player can swipe it");
    }
    this.tried.set(row, swipe);
    this.running += 1;
    try {
      return await this.recover(row, base);
    } finally {
      this.running -= 1;
    }
  }

  private async recover(row: Record<string, unknown>, base: Omit<EmptyReplyRecord, "at" | "outcome" | "detail">): Promise<EmptyReplyOutcome> {
    const run = beginRun(this.deps.ownership(), { from: base.messageId, to: base.messageId });
    const now = this.deps.now ?? (() => Date.now());
    const wait = this.deps.wait ?? sleep;
    const deadline = now() + EMPTY_REPLY_WAIT_MS;
    do await wait(EMPTY_REPLY_POLL_MS);
    while (this.deps.busy() && run.stillOwns() && now() < deadline);
    if (!run.stillOwns()) return this.record(base, "lapsed", `the chat moved on before it could be asked again (${run.lapsed() ?? "changed"})`);
    if (this.deps.row(base.messageId) !== row || !isThoughtOnlyReply(row, this.tags())) return this.record(base, "lapsed", "the reply changed before it could be asked again");
    if (this.deps.busy()) return this.finish(base, "not-asked", "SillyTavern was still busy a minute later");
    if (base.messageId !== this.deps.chatLength() - 1) return this.finish(base, "not-asked", "another message followed it, and only the last reply can be asked again");
    this.finish(base, "asked-again", `the reply was only a thought (${base.reasoningChars} characters); swiped for a new reply, once`);
    const asked = await this.deps.askAgain(base.messageId, row);
    if (asked.ok) return "asked-again";
    return run.stillOwns() ? this.finish(base, "could-not", asked.reason) : this.record(base, "could-not", asked.reason);
  }

  private record(base: Omit<EmptyReplyRecord, "at" | "outcome" | "detail">, outcome: EmptyReplyOutcome, detail: string): EmptyReplyOutcome {
    this.ring.push({ ...base, at: (this.deps.now ?? Date.now)(), outcome, detail });
    if (this.ring.length > EMPTY_REPLY_RECORDS) this.ring.shift();
    return outcome;
  }

  private finish(base: Omit<EmptyReplyRecord, "at" | "outcome" | "detail">, outcome: EmptyReplyOutcome, detail: string): EmptyReplyOutcome {
    this.record(base, outcome, detail);
    const summary = outcome === "asked-again" ? EMPTY_REPLY_ASKED : outcome === "left" ? EMPTY_REPLY_LEFT : EMPTY_REPLY_NOT_ASKED;
    this.deps.journal(summary, `message ${base.messageId}${base.member ? ` (${base.member})` : ""}: ${detail}`);
    return outcome;
  }
}
