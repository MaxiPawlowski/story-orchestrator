import { getContext, isHostGeneratingFlag, listGroupChats, readGroupChatMetadata, subscribeToHostEvents } from "@services/STAPI";
import type { NormalizedStoryV2 } from "@engine/index";
import { blobMismatch, getSelectedStoryId } from "./persistence";
import { settingsRoot, writableSettingsRoot } from "./settingsRoot";
import { dropPlay, playRow, playRowFromBlob, sanitizePlays, upsertPlay, type PlayRow, type PlaysIndex } from "./playsIndex";
import { planBackfill, runBackfill, sanitizeBackfill, type BackfillState } from "./playsBackfill";
import { log } from "@utils/log";

export const PLAYS_KEY = "plays";
export const BACKFILL_KEY = "playsBackfill";
const WRITE_DELAY_MS = 300;
const BACKFILL_START_MS = 15000;

const listeners = new Set<() => void>();

export const onPlaysChanged = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const readPlaysIndex = (): PlaysIndex => sanitizePlays(settingsRoot()[PLAYS_KEY]);

const writePlays = (plays: PlaysIndex) => {
  writableSettingsRoot()[PLAYS_KEY] = plays;
  getContext().saveSettingsDebounced?.();
  listeners.forEach((listener) => listener());
};

export interface PlaysPort {
  subscribe(listener: () => void): () => void;
  loadedChatId(): string | null;
  story(): NormalizedStoryV2 | null;
  storyId(): string | null;
  activeCheckpointId(): string | null;
  loading(): boolean;
  notify(): void;
}

const text = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value) : "");

export function syncOpenChatPlay(port: PlaysPort, now = new Date().toISOString()): boolean {
  const context = getContext();
  const chatId = text(context.chatId);
  const groupId = text(context.groupId);
  if (!chatId) return false;
  const plays = readPlaysIndex();
  const story = port.story();
  const storyId = port.storyId();
  if (port.loadedChatId() === chatId && groupId && story && storyId) {
    const next = upsertPlay(plays, chatId, playRow({ story, storyId, activeCheckpointId: port.activeCheckpointId(), groupId }), now);
    if (next.changed) writePlays(next.plays);
    return next.changed;
  }
  if (port.loadedChatId() !== null || port.loading() || blobMismatch() !== null || getSelectedStoryId()) return false;
  const next = dropPlay(plays, chatId);
  if (next.changed) writePlays(next.plays);
  return next.changed;
}

export function forgetChatPlay(chatId: unknown): boolean {
  const id = text(chatId);
  if (!id) return false;
  const next = dropPlay(readPlaysIndex(), id);
  if (next.changed) writePlays(next.plays);
  return next.changed;
}

const putBackfilledPlay = (chatId: string, row: PlayRow) => {
  const plays = readPlaysIndex();
  if (plays[chatId]) return;
  writePlays({ ...plays, [chatId]: row });
};

const readBackfillState = (): BackfillState => sanitizeBackfill(settingsRoot()[BACKFILL_KEY])
  ?? planBackfill(listGroupChats(), new Set(Object.keys(readPlaysIndex())));

const saveBackfillState = (state: BackfillState) => {
  writableSettingsRoot()[BACKFILL_KEY] = state;
  getContext().saveSettingsDebounced?.();
};

export function startPlaysIndex(port: PlaysPort): () => void {
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sync = () => {
    timer = null;
    if (alive && syncOpenChatPlay(port)) port.notify();
  };
  const schedule = () => {
    if (alive && timer === null) timer = setTimeout(sync, WRITE_DELAY_MS);
  };
  const unsubscribe = port.subscribe(schedule);
  const onDeleted = (chatId: unknown) => { if (forgetChatPlay(chatId)) port.notify(); };
  const unsubscribeHost = subscribeToHostEvents([
    { eventName: "CHAT_DELETED", handler: onDeleted },
    { eventName: "GROUP_CHAT_DELETED", handler: onDeleted },
  ]);
  const backfill = setTimeout(() => {
    const state = readBackfillState();
    if (state.done || !alive) return;
    saveBackfillState(state);
    void runBackfill(state, {
      alive: () => alive,
      generating: isHostGeneratingFlag,
      read: async (target) => {
        const metadata = await readGroupChatMetadata(target.chatId);
        return playRowFromBlob(metadata?.story_orchestrator, target.chatId, target.groupId, new Date().toISOString());
      },
      write: (chatId, row) => { putBackfilledPlay(chatId, row); port.notify(); },
      save: saveBackfillState,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }).catch((error: unknown) => log.warn("story index backfill stopped", error));
  }, BACKFILL_START_MS);
  return () => {
    alive = false;
    if (timer !== null) clearTimeout(timer);
    clearTimeout(backfill);
    unsubscribe();
    unsubscribeHost();
  };
}
