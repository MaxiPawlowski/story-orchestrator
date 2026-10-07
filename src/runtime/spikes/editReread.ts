import type { AppliedQueueEntry, ApplyQueueEntry, BoundaryResult, EngineState } from "@engine/index";
import { log } from "@utils/log";
import { fingerprintOf } from "../fingerprints";
import { withholds } from "../generationLifecycle";
import { beginRun, type RunGuard, type RunOwnership } from "../runToken";
import type { MutationKind } from "../turnBridge";

export const EDIT_SETTLE_MS = 750;
export const EDIT_HOLD_CAP_MS = 15_000;
export const EDIT_NOT_READ_SUMMARY = "the edit was not read in time";

export interface EditRereadHost {
  getEngineState(): EngineState | null;
  getOwnership(): RunOwnership;
  onBoundary(listener: (result: BoundaryResult) => void): () => void;
  onRollback(listener: (messageId: number) => void): () => void;
  rollbackFromMessage(messageId: number, decoded?: undefined, kind?: "edit"): Promise<unknown>;
  commitBoundary(at?: number): Promise<unknown>;
  readonly writes: { requeue(entries: ApplyQueueEntry[]): void };
}

export interface EditRereadChat {
  id: string;
  rows: readonly unknown[];
}

export type RereadOutcome = "committed" | "read" | "unread";

export interface EditTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface EditRereadDeps {
  host: EditRereadHost;
  enabled: () => boolean;
  chat: () => EditRereadChat;
  reread: (messageId: number, run: RunGuard) => Promise<RereadOutcome>;
  displace?: (messageId: number) => number;
  journal: (summary: string, detail: string) => void;
  restage?: (type: string) => void;
  timers?: EditTimers;
  now?: () => number;
  settleMs?: number;
  holdCapMs?: number;
}

export interface EditRereadStats {
  edits: number;
  cycles: number;
  recommits: number;
  reads: number;
  unread: number;
  displaced: number;
  skipped: number;
  holds: number;
  timeouts: number;
  holdMs: number[];
}

interface Committed {
  chatId: string;
  messageId: number;
  hash: string;
  kept: ApplyQueueEntry[];
}

interface Pending {
  chatId: string;
  messageId: number;
  entered: boolean;
  handle: unknown;
  runs: number;
  rewritten: boolean;
  done: Promise<void>;
  resolve: () => void;
}

const isUserRow = (row: unknown): boolean => typeof row === "object" && row !== null && (row as { is_user?: unknown }).is_user === true;

const asEntry = (applied: AppliedQueueEntry): ApplyQueueEntry => ({
  source: applied.source,
  blackboardVersionSum: applied.blackboardVersionSum,
  deltas: applied.deltas.map((delta) => ({ ...delta })),
  ...(applied.turnRange ? { turnRange: { ...applied.turnRange } } : {}),
  ...(applied.tensionLevels ? { tensionLevels: [...applied.tensionLevels] } : {}),
  ...(applied.origin ? { origin: applied.origin } : {}),
});

const readBefore = (applied: AppliedQueueEntry[], messageId: number): ApplyQueueEntry[] =>
  applied.filter((entry) => entry.source !== "mechanical" && entry.turnRange !== undefined && entry.turnRange.to < messageId).map(asEntry);

const defaultTimers: EditTimers = {
  set: (run, ms) => globalThis.setTimeout(run, ms),
  clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const p95 = (values: readonly number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
};

export class EditReread {
  readonly stats: EditRereadStats = { edits: 0, cycles: 0, recommits: 0, reads: 0, unread: 0, displaced: 0, skipped: 0, holds: 0, timeouts: 0, holdMs: [] };
  private committed: Committed | null = null;
  private rolledBack: Committed | null = null;
  private pending: Pending | null = null;
  private chain: Promise<void> = Promise.resolve();
  private rollingBack = false;
  private readonly disposers: Array<() => void>;

  constructor(private readonly deps: EditRereadDeps) {
    this.disposers = [
      deps.host.onBoundary((result) => this.noteBoundary(result)),
      deps.host.onRollback((messageId) => {
        if (!this.committed || messageId > this.committed.messageId || this.pending) return;
        this.rolledBack = this.committed;
        this.committed = null;
      }),
    ];
  }

  dispose() {
    this.disposers.splice(0).forEach((dispose) => dispose());
    if (this.pending) this.timers().clear(this.pending.handle);
    this.pending?.resolve();
    this.pending = null;
  }

  seam(kind: MutationKind, messageId: number, entered = false): (() => Promise<void>) | null {
    if ((kind !== "edit" && kind !== "update") || !this.deps.enabled()) return null;
    const chat = this.deps.chat();
    if (messageId !== chat.rows.length - 1 || isUserRow(chat.rows[messageId])) return null;
    if (!entered) {
      const committed = this.committed;
      if (!committed || committed.chatId !== chat.id || committed.messageId !== messageId) return null;
    }
    this.stats.edits += 1;
    const pending = this.settle(chat.id, messageId, entered);
    return () => pending.done;
  }

  hold(type: string): Promise<void> {
    const pending = this.pending;
    if (withholds(type) || !pending || pending.chatId !== this.deps.chat().id) return Promise.resolve();
    const now = this.deps.now ?? Date.now;
    const started = now();
    this.stats.holds += 1;
    let handle: unknown = null;
    const capped = new Promise<"timeout">((resolve) => { handle = this.timers().set(() => resolve("timeout"), this.deps.holdCapMs ?? EDIT_HOLD_CAP_MS); });
    return Promise.race([pending.done.then(() => "read" as const), capped]).then((outcome) => {
      this.timers().clear(handle);
      this.stats.holdMs.push(now() - started);
      if (outcome === "timeout") {
        this.stats.timeouts += 1;
        const waited = (this.deps.holdCapMs ?? EDIT_HOLD_CAP_MS) / 1000;
        this.deps.journal(EDIT_NOT_READ_SUMMARY, `the reply went ahead after ${waited} s; it was built from the state before the edit of message ${pending.messageId}`);
        return;
      }
      this.deps.restage?.(type);
    });
  }

  ownsReread(): boolean {
    return this.rollingBack;
  }

  isPending(): boolean {
    return this.pending !== null;
  }

  settled(): Promise<void> {
    return this.pending ? this.pending.done.then(() => this.chain) : this.chain;
  }

  private timers(): EditTimers {
    return this.deps.timers ?? defaultTimers;
  }

  private settle(chatId: string, messageId: number, entered: boolean): Pending {
    const current = this.pending;
    if (current && current.chatId === chatId && current.messageId === messageId) {
      this.timers().clear(current.handle);
      current.entered = current.entered || entered;
      current.rewritten = current.rewritten || current.runs > 0;
      current.handle = this.timers().set(() => this.fire(current), this.deps.settleMs ?? EDIT_SETTLE_MS);
      return current;
    }
    let resolve = () => {};
    const done = new Promise<void>((settled) => { resolve = settled; });
    const pending: Pending = { chatId, messageId, entered, handle: null, runs: 0, rewritten: false, done, resolve };
    pending.handle = this.timers().set(() => this.fire(pending), this.deps.settleMs ?? EDIT_SETTLE_MS);
    if (current && current.handle !== null) this.fire(current);
    this.pending = pending;
    return pending;
  }

  private fire(pending: Pending) {
    this.timers().clear(pending.handle);
    pending.handle = null;
    pending.runs += 1;
    const rewritten = pending.rewritten;
    pending.rewritten = false;
    const run = beginRun(this.deps.host.getOwnership());
    const cycle = this.chain.then(() => this.cycle(pending, run, rewritten));
    this.chain = cycle.catch((error: unknown) => log.warn("edit re-read: the cycle failed", error));
    void this.chain.finally(() => {
      pending.runs -= 1;
      if (pending.runs > 0 || pending.handle !== null) return;
      if (this.pending === pending) this.pending = null;
      pending.resolve();
    });
  }

  private noteBoundary(result: BoundaryResult) {
    const chat = this.deps.chat();
    const messageId = result.context.lastMessageId;
    const kept = readBefore(result.queue.applied, messageId);
    const previous = this.committed?.chatId === chat.id && this.committed.messageId === messageId ? this.committed.kept : [];
    this.committed = { chatId: chat.id, messageId, hash: fingerprintOf(chat.rows[messageId]), kept: [...previous, ...kept] };
  }

  private async cycle(pending: Pending, run: RunGuard, rewritten: boolean) {
    if (!run.stillOwns()) return;
    const chat = this.deps.chat();
    if (chat.id !== pending.chatId) return;
    const { messageId } = pending;
    const own = (record: Committed | null) => (record?.chatId === chat.id && record.messageId === messageId ? record : null);
    const committed = pending.entered ? own(this.rolledBack) : own(this.committed);
    const last = () => this.deps.host.getEngineState()?.lastMessageId ?? -1;
    if (!pending.entered && !rewritten && committed && last() >= messageId && committed.hash === fingerprintOf(chat.rows[messageId])) {
      this.stats.skipped += 1;
      return;
    }
    this.stats.cycles += 1;
    this.rollingBack = true;
    try {
      await this.deps.host.rollbackFromMessage(messageId, undefined, "edit");
    } finally {
      this.rollingBack = false;
    }
    if (!run.stillOwns()) return;
    this.stats.displaced += this.deps.displace?.(messageId) ?? 0;
    if (last() < messageId) {
      this.deps.host.writes.requeue(committed?.kept ?? []);
      this.stats.recommits += 1;
      await this.deps.host.commitBoundary(messageId);
      if (!run.stillOwns()) return;
    }
    this.stats.reads += 1;
    const outcome = await this.deps.reread(messageId, run);
    if (!run.stillOwns()) return;
    if (outcome === "unread") {
      this.stats.unread += 1;
      return;
    }
    if (outcome === "read") await this.deps.host.commitBoundary();
  }
}
