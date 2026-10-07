import { getContext, isHostGenerating, subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";
import { restampRenamedChat } from "./persistence";
import { beginRun, type RunGuard } from "./runToken";
import { ChatIdentity, describeDecode, type DecodeJournal } from "./messageIdentity";
import type { ChatSave } from "./chatSave";
import { currentChat, readChatChange, unbindBranchMirror, type LoadedChat } from "./chatIdentity";

const FLUSH_POLL_MS = 300;
const FLUSH_POLL_MAX_MS = 60000;

export const NON_TURN_MESSAGE_TYPES: ReadonlySet<string> = new Set(["first_message", "extension"]);

export const CONTINUE_MESSAGE_TYPES: ReadonlySet<string> = new Set(["continue", "appendFinal"]);

export const isTurnMessageType = (type: unknown): boolean => typeof type !== "string" || !NON_TURN_MESSAGE_TYPES.has(type);

export const hostMessageId = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

const keyMessageId = (key: string) => Number(key.split(":")[0]);

type SwipeRow = { is_user?: unknown; is_system?: unknown; swipes?: unknown; swipe_id?: unknown };

export const isStoredSwipeReply = (chat: readonly unknown[] | undefined, messageId: number): boolean => {
  const row = chat?.[messageId] as SwipeRow | undefined;
  if (!row || row.is_user === true || row.is_system === true) return false;
  if (!Array.isArray(row.swipes) || typeof row.swipe_id !== "number" || typeof row.swipes[row.swipe_id] !== "string") return false;
  return (chat ?? []).slice(0, messageId).some((earlier) => (earlier as SwipeRow | undefined)?.is_user === true);
};

const continueStamp = (messageId: number): string => {
  const message = (getContext().chat as Array<{ gen_finished?: unknown; mes?: unknown }> | undefined)?.[messageId];
  const finished = message?.gen_finished;
  if (finished !== undefined && finished !== null) return String(finished instanceof Date ? finished.getTime() : finished);
  return `len${typeof message?.mes === "string" ? message.mes.length : 0}`;
};

export type MutationKind = "swipe" | "edit" | "delete" | "update";

export type MutationSeam = (kind: MutationKind, messageId: number, entered?: boolean) => (() => Promise<void>) | null;

interface PendingBoundary {
  run: RunGuard;
  messageId: number | null;
  ready: boolean;
}

const movedJournal = (from: number, named: number): DecodeJournal => ({
  summary: `eventless change at message ${from}`,
  note: `the event named message ${named}, and message ${from} also changed without one (an editor move names only the later of the two rows it swapped); stepped back from ${from}`,
});

export class TurnBridge {
  private pending: PendingBoundary[] = [];
  private draining: { run: RunGuard | null } | null = null;
  private lastRenderedAt = 0;
  private readonly turnKeys = new Set<string>();
  private readonly identity = new ChatIdentity();
  private loadedChat: LoadedChat | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private seam: MutationSeam | null = null;

  constructor(private readonly manager: RuntimeManager, private readonly save: ChatSave | null = null) {}

  start() {
    if (this.unsubscribe) return;
    const entries: HostSubscriptionEntry[] = [
      { eventName: "GENERATION_ENDED", handler: () => void this.flushPending() },
      { eventName: "GENERATION_STOPPED", handler: () => void this.flushPending() },
      { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => void this.onRenderedReply(type, messageId) },
      { eventName: "CHARACTER_MESSAGE_RENDERED", handler: (messageId, type) => void this.onRenderedReply(type, messageId) },
      { eventName: "MESSAGE_SENT", handler: () => this.refreshIdentity() },
      { eventName: "MESSAGE_SWIPE_DELETED", handler: () => this.refreshIdentity() },
      { eventName: "MESSAGE_SWIPED", handler: (messageId) => void this.onMutation(messageId, "swipe") },
      { eventName: "MESSAGE_EDITED", handler: (messageId) => void this.onMutation(messageId, "edit") },
      { eventName: "MESSAGE_DELETED", handler: (chatLength) => void this.onMutation(chatLength, "delete") },
      { eventName: "MESSAGE_UPDATED", handler: (messageId) => void this.onMutation(messageId, "update") },
      { eventName: "CHAT_CHANGED", handler: () => void this.onChatChanged() },
      { eventName: "CHAT_RENAMED", handler: (payload) => void this.onChatRenamed(payload) },
    ];
    this.unsubscribe = subscribeToHostEvents(entries);
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.reset();
  }

  setMutationSeam(seam: MutationSeam | null) {
    this.seam = seam;
  }

  /** A load made outside CHAT_CHANGED (the page's first) names the chat it loaded. */
  noteLoaded(chat: LoadedChat | null) {
    this.loadedChat = chat;
  }

  private reset() {
    this.cancelFlushPoll();
    this.pending = [];
    this.turnKeys.clear();
    this.identity.clear();
    this.lastRenderedAt = 0;
  }

  private refreshIdentity() {
    const context = getContext();
    this.identity.refresh(String(context.chatId ?? ""), context.chat);
  }

  private async onRenderedReply(type: unknown, messageId?: unknown) {
    this.refreshIdentity();
    if (!isTurnMessageType(type)) return;
    const now = Date.now();
    const id = hostMessageId(messageId);

    if (id !== null) {
      const continued = typeof type === "string" && CONTINUE_MESSAGE_TYPES.has(type);
      const key = continued ? `${id}:${continueStamp(id)}` : String(id);
      if (this.turnKeys.has(key)) return;
      this.turnKeys.add(key);
      if (continued) this.save?.fingerprints.forgetFrom(id);
    } else if (now - this.lastRenderedAt < 250) {
      return;
    }

    this.lastRenderedAt = now;
    await this.enqueueBoundary(id, true);
  }

  private async enqueueBoundary(id: number | null, afterSpeak: boolean) {
    const mine: PendingBoundary = { run: beginRun(this.manager.getOwnership()), messageId: id, ready: false };
    this.pending.push(mine);
    if (afterSpeak) await this.manager.fireAfterSpeak();
    if (!mine.run.stillOwns()) {
      this.pending = this.pending.filter((entry) => entry !== mine);
      return;
    }
    mine.ready = true;
    await this.flushPending();
  }

  private async flushPending() {
    this.pending = this.pending.filter((entry) => entry.run.stillOwns());
    // A drain still awaiting a commit for a chat that is no longer open (a transition's NPC replies are a
    // real model call) must not hold this chat's boundaries back: they would wait for it and then land
    // together. The stale loop stops at its next await, so only one loop drains the queue.
    if ((this.draining && this.draining.run?.stillOwns() !== false) || !this.pending[0]?.ready) {
      if (this.pending.length === 0) this.cancelFlushPoll();
      return;
    }
    if (isHostGenerating()) {
      this.scheduleFlushPoll();
      return;
    }
    this.cancelFlushPoll();
    const drain: { run: RunGuard | null } = { run: null };
    this.draining = drain;
    try {
      while (this.draining === drain) {
        const next = this.pending[0];
        if (!next?.ready) break;
        this.pending.shift();
        if (!next.run.stillOwns()) continue;
        drain.run = next.run;
        await this.manager.commitBoundary(next.messageId ?? undefined);
      }
    } finally {
      if (this.draining === drain) this.draining = null;
    }
  }

  private scheduleFlushPoll() {
    if (this.flushTimer !== null) return;
    const startedAt = Date.now();
    const tick = () => {
      this.flushTimer = null;
      if (this.pending.length === 0) return;
      if (!isHostGenerating() || !this.pending.every((entry) => entry.run.stillOwns())) {
        void this.flushPending();
        return;
      }
      if (Date.now() - startedAt >= FLUSH_POLL_MAX_MS) return;
      this.flushTimer = setTimeout(tick, FLUSH_POLL_MS);
    };
    this.flushTimer = setTimeout(tick, FLUSH_POLL_MS);
  }

  private cancelFlushPoll() {
    if (this.flushTimer === null) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private async onChatChanged() {
    const change = readChatChange(this.loadedChat, { runContext: () => this.manager.getRunContext(), engineBoundary: () => this.manager.getEngineState()?.boundary ?? null });
    if (change.kind === "same-chat") {
      this.refreshIdentity();
      this.manager.reapplyPromptBlocks();
      await this.save?.reconcile(beginRun(this.manager.getOwnership()));
      this.manager.notify();
      return;
    }
    this.manager.reapplyCopilotNudge();
    this.reset();
    this.refreshIdentity();
    this.loadedChat = null;
    const loading = this.manager.loadSelectedFromChat();
    this.manager.notify();
    await loading;
    this.loadedChat = currentChat();
    if (change.kind === "diverged" && this.loadedChat?.chatId === change.chatId && this.manager.getRunContext().claimedChat === change.chatId) this.save?.note("reload-diverged", change.detail);
    await unbindBranchMirror(beginRun(this.manager.getOwnership()));
  }

  private async onChatRenamed(payload: unknown) {
    const renamed = payload as { oldFileName?: unknown; newFileName?: unknown } | undefined;
    if (restampRenamedChat(renamed?.oldFileName, renamed?.newFileName)) await this.manager.loadSelectedFromChat();
  }

  private async onMutation(value: unknown, kind: MutationKind) {
    const messageId = hostMessageId(value);
    if (messageId === null) {
      this.turnKeys.clear();
      this.refreshIdentity();
      return;
    }
    const edited = kind === "edit" || kind === "update";
    if (edited && this.save?.unchanged(messageId)) return;
    const recommit = kind === "swipe" && isStoredSwipeReply(getContext().chat as unknown[] | undefined, messageId);
    const decoded = kind === "delete" ? this.decodeDelete(messageId) : null;
    if (!decoded) this.refreshIdentity();
    const drift = edited ? this.save?.firstDrift() ?? null : null;
    const from = decoded?.start ?? Math.min(messageId, drift ?? messageId);
    for (const key of this.turnKeys) {
      const keyed = keyMessageId(key);
      if (decoded ? keyed >= from : keyed >= from && keyed <= messageId) this.turnKeys.delete(key);
    }
    const journal = decoded ? describeDecode(decoded, messageId) : from < messageId ? movedJournal(from, messageId) : null;
    const run = beginRun(this.manager.getOwnership());
    if (!(await this.manager.rollbackOnEnter(kind, from))) {
      const replaced = journal ? null : this.seam?.(kind, messageId) ?? null;
      if (replaced) return replaced();
      await this.manager.rollbackFromMessage(from, journal ?? undefined, kind === "update" ? "edit" : kind, ...(decoded ? [decoded.count] : []));
    } else if (edited && run.stillOwns()) {
      const reread = this.seam?.(kind, messageId, true) ?? null;
      if (reread) return reread();
    }
    if (!recommit || !run.stillOwns()) return;
    this.turnKeys.add(String(messageId));
    await this.enqueueBoundary(messageId, false);
  }

  private decodeDelete(postLength: number) {
    const context = getContext();
    return this.identity.decode(String(context.chatId ?? ""), context.chat, postLength);
  }
}
