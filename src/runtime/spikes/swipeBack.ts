import type { ApplyQueueEntry, BoundaryResult, EngineHistory, EngineState, NormalizedStoryV2 } from "@engine/index";
import { deriveScope, type ExtraGateSource } from "@extraction/index";
import { fingerprintOf } from "../fingerprints";
import { fnv1a, stableStringify } from "../hash";
import { getSelectedStoryId, loadPersistedRuntime, savePersistedRuntime } from "../persistence";
import { beginRun, type RunGuard, type RunOwnership } from "../runToken";
import type { MutationKind } from "../turnBridge";
import type { PersistedStoryRuntime } from "../types";
import { SwipeCache, type SwipeKey } from "./swipeCache";

export interface SwipeBackHost {
  getEngineState(): EngineState | null;
  getStory(): NormalizedStoryV2 | null;
  getOwnership(): RunOwnership;
  getExpansionGateSources(): ExtraGateSource[];
  onBoundary(listener: (result: BoundaryResult) => void): () => void;
  subscribe(listener: () => void): () => void;
  loadSelectedFromChat(): Promise<void>;
  notify(): void;
  readonly chatSave: { persist(): Promise<void> };
  readonly writes: { pending(): ApplyQueueEntry[]; requeue(entries: ApplyQueueEntry[]): void };
}

export interface SwipeBackStore {
  read(): PersistedStoryRuntime | null;
  write(record: PersistedStoryRuntime): void;
}

export const chatStore: SwipeBackStore = {
  read: () => {
    const id = getSelectedStoryId();
    return id ? loadPersistedRuntime(id) : null;
  },
  write: (record) => {
    savePersistedRuntime(record);
  },
};

export interface SwipeBackDeps {
  host: SwipeBackHost;
  store: SwipeBackStore;
  enabled: () => boolean;
  chat: () => { id: string; rows: readonly unknown[] };
  cache?: SwipeCache<SwipeEntry>;
}

export interface SwipeEntry {
  record: PersistedStoryRuntime;
  pending: ApplyQueueEntry[];
}

export interface SwipeBackStats {
  captures: number;
  hits: number;
  misses: number;
}

interface Committed {
  chat: string;
  message: number;
  text: string;
}

const replyText = (row: unknown): string | null => {
  if (typeof row !== "object" || row === null) return null;
  const shaped = row as { is_user?: unknown; mes?: unknown };
  return shaped.is_user !== true && typeof shaped.mes === "string" && shaped.mes.trim() ? shaped.mes : null;
};

export const restorePoint = (history: EngineHistory, messageId: number): EngineState | null => {
  const first = history.log.find((entry) => entry.context.lastMessageId >= messageId);
  if (first) return first.before;
  return history.base.lastMessageId < messageId ? history.base : null;
};

export const scopeHash = (story: NormalizedStoryV2, point: EngineState, sources: ExtraGateSource[]): string =>
  fnv1a(stableStringify(deriveScope(story, point.activeCheckpointId, point.blackboard, sources).map((quality) => quality.key).sort()));

export class SwipeBack {
  readonly stats: SwipeBackStats = { captures: 0, hits: 0, misses: 0 };
  private readonly cache: SwipeCache<SwipeEntry>;
  private committed: Committed | null = null;
  private readonly disposers: Array<() => void>;

  constructor(private readonly deps: SwipeBackDeps) {
    this.cache = deps.cache ?? new SwipeCache<SwipeEntry>();
    this.disposers = [
      deps.host.onBoundary((result) => this.noteBoundary(result)),
      deps.host.subscribe(() => this.capture()),
    ];
  }

  dispose() {
    this.disposers.splice(0).forEach((dispose) => dispose());
  }

  seam(kind: MutationKind, messageId: number): (() => Promise<void>) | null {
    if (kind !== "swipe" || !this.deps.enabled()) return null;
    const key = this.keyAt(messageId);
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return null;
    }
    const run = beginRun(this.deps.host.getOwnership());
    return () => this.restore(key, entry, run);
  }

  private noteBoundary(result: BoundaryResult) {
    const chat = this.deps.chat();
    const message = result.context.lastMessageId;
    const text = replyText(chat.rows[message]);
    this.committed = text === null ? null : { chat: chat.id, message, text: fingerprintOf(chat.rows[message]) };
  }

  private keyAt(messageId: number): SwipeKey | null {
    const chat = this.deps.chat();
    const row = chat.rows[messageId];
    if (messageId !== chat.rows.length - 1 || replyText(row) === null) return null;
    const record = this.deps.store.read();
    const story = this.deps.host.getStory();
    if (!record || !story) return null;
    const point = restorePoint(record.engineHistory, messageId);
    if (!point) return null;
    const scope = scopeHash(story, point, this.deps.host.getExpansionGateSources());
    return { chat: chat.id, message: messageId, text: fingerprintOf(row), scope, story: `${record.storyId}@${record.contentHashAtLoad}` };
  }

  private capture() {
    if (!this.deps.enabled()) return;
    const state = this.deps.host.getEngineState();
    const committed = this.committed;
    if (!state || !committed) return;
    const chat = this.deps.chat();
    const key = this.keyAt(state.lastMessageId);
    if (!key || key.chat !== committed.chat || key.message !== committed.message || key.text !== committed.text) return;
    const record = this.deps.store.read();
    if (!record || record.engineState.lastMessageId !== state.lastMessageId || record.engineState.boundary !== state.boundary || chat.id !== key.chat) return;
    this.cache.put(key, { record: structuredClone(record), pending: this.deps.host.writes.pending() });
    this.stats.captures += 1;
  }

  private async restore(key: SwipeKey, entry: SwipeEntry, run: RunGuard) {
    if (!run.stillOwns()) return;
    this.deps.store.write(structuredClone(entry.record));
    await this.deps.host.loadSelectedFromChat();
    const loaded = beginRun(this.deps.host.getOwnership());
    if (this.deps.chat().id !== key.chat || this.deps.host.getEngineState()?.lastMessageId !== key.message) return;
    this.deps.host.writes.requeue(entry.pending.map((write) => ({ ...write, deltas: write.deltas.map((delta) => ({ ...delta })) })));
    this.committed = { chat: key.chat, message: key.message, text: key.text };
    this.stats.hits += 1;
    await this.deps.host.chatSave.persist();
    if (!loaded.stillOwns()) return;
    this.deps.host.notify();
  }
}
