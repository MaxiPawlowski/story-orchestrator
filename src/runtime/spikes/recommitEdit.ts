import type { AppliedQueueEntry, ApplyQueueEntry, BoundaryResult, EngineState } from "@engine/index";
import { log } from "@utils/log";
import { fingerprintOf } from "../fingerprints";
import { beginRun, type RunGuard, type RunOwnership } from "../runToken";
import type { MutationKind } from "../turnBridge";

export interface RecommitHost {
  getEngineState(): EngineState | null;
  getOwnership(): RunOwnership;
  onBoundary(listener: (result: BoundaryResult) => void): () => void;
  onRollback(listener: (messageId: number) => void): () => void;
  rollbackFromMessage(messageId: number): Promise<unknown>;
  commitBoundary(at?: number): Promise<unknown>;
  readonly writes: { requeue(entries: ApplyQueueEntry[]): void };
}

export interface RecommitChat {
  id: string;
  rows: readonly unknown[];
}

export interface RecommitDeps {
  host: RecommitHost;
  enabled: () => boolean;
  chat: () => RecommitChat;
  read: (messageId: number) => Promise<unknown>;
}

export interface RecommitStats {
  cycles: number;
  recommits: number;
  reads: number;
  skipped: number;
}

interface Committed {
  chatId: string;
  messageId: number;
  hash: string;
  kept: ApplyQueueEntry[];
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

export class RecommitEdit {
  readonly stats: RecommitStats = { cycles: 0, recommits: 0, reads: 0, skipped: 0 };
  private committed: Committed | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly disposers: Array<() => void>;

  constructor(private readonly deps: RecommitDeps) {
    this.disposers = [
      deps.host.onBoundary((result) => this.noteBoundary(result)),
      deps.host.onRollback((messageId) => {
        if (this.committed && messageId <= this.committed.messageId) this.committed = null;
      }),
    ];
  }

  dispose() {
    this.disposers.splice(0).forEach((dispose) => dispose());
  }

  seam(kind: MutationKind, messageId: number): (() => Promise<void>) | null {
    if ((kind !== "edit" && kind !== "update") || !this.deps.enabled()) return null;
    const chat = this.deps.chat();
    const committed = this.committed;
    if (!committed || committed.chatId !== chat.id || committed.messageId !== messageId) return null;
    if (messageId !== chat.rows.length - 1 || isUserRow(chat.rows[messageId])) return null;
    const run = beginRun(this.deps.host.getOwnership());
    const cycle = this.chain.then(() => this.cycle(messageId, run));
    this.chain = cycle.catch((error: unknown) => log.warn("SP2 re-commit cycle failed", error));
    return () => cycle;
  }

  private noteBoundary(result: BoundaryResult) {
    const chat = this.deps.chat();
    const messageId = result.context.lastMessageId;
    const kept = readBefore(result.queue.applied, messageId);
    const previous = this.committed?.chatId === chat.id && this.committed.messageId === messageId ? this.committed.kept : [];
    this.committed = { chatId: chat.id, messageId, hash: fingerprintOf(chat.rows[messageId]), kept: [...previous, ...kept] };
  }

  protected async cycle(messageId: number, run: RunGuard) {
    if (!run.stillOwns()) return;
    const chat = this.deps.chat();
    const committed = this.committed?.chatId === chat.id && this.committed.messageId === messageId ? this.committed : null;
    const last = () => this.deps.host.getEngineState()?.lastMessageId ?? -1;
    if (committed && last() >= messageId && committed.hash === fingerprintOf(chat.rows[messageId])) {
      this.stats.skipped += 1;
      return;
    }
    this.stats.cycles += 1;
    const kept = committed?.kept ?? [];
    await this.deps.host.rollbackFromMessage(messageId);
    if (!run.stillOwns()) return;
    if (last() < messageId) {
      this.deps.host.writes.requeue(kept);
      this.stats.recommits += 1;
      await this.deps.host.commitBoundary(messageId);
      if (!run.stillOwns()) return;
    }
    this.stats.reads += 1;
    await this.deps.read(messageId);
  }
}
