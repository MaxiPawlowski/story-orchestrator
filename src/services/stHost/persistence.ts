import { getContext } from "./context";
import { subscribeToHostEvent } from "./events";

// v2.3 plan 06 (save evidence). `saveMetadata` resolves to `saveChatConditional`, which CATCHES every
// save error, logs it and returns normally (`script.js:9412-9440`), so awaiting it proves nothing. The
// request itself is therefore observed: the chat-save endpoints are wrapped, and the status of the
// request that follows our persist is what says whether the write reached the server at all.

const SAVE_PATHS: Record<SaveKind, string[]> = { chat: ["/api/chats/save", "/api/chats/group/save"], settings: ["/api/settings/save"] };
export const SAVE_OBSERVE_MS = 8000;

type SaveKind = "chat" | "settings";

export interface SaveObservation {
  /** Did a save request even go out? A save that never left is as unconfirmed as one that failed. */
  requested: boolean;
  status: number | null;
  ok: boolean;
  timedOut: boolean;
  /** The request went out and never came back — an aborted route, a dead connection. Distinct from
   *  `timedOut`, which means no request was ever observed. */
  failed: boolean;
  /** v2.4 plan 02 §7: which request settled this, so every observation one request settled shares one read-back. */
  burst?: number;
}

const unconfirmed = (): SaveObservation => ({ requested: false, status: null, ok: false, timedOut: true, failed: false });

interface Watch { kind: SaveKind; armedAt: number; sawRequest: boolean; settle: (observation: SaveObservation) => void }

let watching: Watch[] = [];
let ours: typeof fetch | null = null;
let clock = 0;
const stats = { wraps: 0, reports: 0 };
// v2.4 plan 02 §7: the init objects our outermost wrapper minted. A wrapper of ours that meets one is
// an older wrapper still in the chain (a peer wrapped on top of us and we re-wrapped on top of it),
// and the request is already being reported.
const minted = new WeakSet<object>();

const saveKindOf = (input: unknown): SaveKind | null => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url?: unknown } | undefined)?.url;
  if (typeof url !== "string") return null;
  return (Object.keys(SAVE_PATHS) as SaveKind[]).find((kind) => SAVE_PATHS[kind].some((path) => url.includes(path))) ?? null;
};

const takeArmedBefore = (kind: SaveKind, startedAt: number) => {
  const due = watching.filter((entry) => entry.kind === kind && entry.armedAt < startedAt);
  watching = watching.filter((entry) => !due.includes(entry));
  return due;
};

function report(kind: SaveKind, startedAt: number, observation: Omit<SaveObservation, "burst">) {
  stats.reports += 1;
  takeArmedBefore(kind, startedAt).forEach((entry) => entry.settle({ ...observation, burst: startedAt }));
}

const answered = (status: number) => ({ requested: true, status, ok: status >= 200 && status < 300, timedOut: false, failed: false });

/**
 * The request left and threw before any answer. `await original(...)` used to reject straight past the
 * report, so a blocked save route looked like a save that was never attempted — the observation
 * timed out at 8s and the reason read "no save request went out", which is false and sends a reader
 * after a scheduler that did fire (2026-09-22).
 */
const threw = () => ({ requested: true, status: null, ok: false, timedOut: false, failed: true });

async function observed(original: typeof fetch, input: RequestInfo | URL, init: RequestInit) {
  const startedAt = ++clock;
  const kind = saveKindOf(input);
  if (kind) watching.forEach((entry) => { if (entry.kind === kind && entry.armedAt < startedAt) entry.sawRequest = true; });
  try {
    const response = await original(input, init);
    if (kind && watching.length) report(kind, startedAt, answered(response.status));
    return response;
  } catch (error) {
    if (kind && watching.length) report(kind, startedAt, threw());
    throw error;
  }
}

/**
 * Wrap `globalThis.fetch` lazily: a session that never persists pays nothing. v2.4 plan 02 §7: the
 * wrap heals. A peer that captured `fetch` before us and later put it back removes us from the chain,
 * and every save after that read as "no save request went out" — sticky, and `withLedger` then refused
 * every effect. So each observation re-wraps when `globalThis.fetch` is not ours, and a request is
 * reported once however many of our wrappers it passes through (`minted`).
 */
export function installSaveWatcher() {
  const current = globalThis.fetch;
  if (typeof current !== "function" || current === ours) return;
  stats.wraps += 1;
  const wrapper = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init && minted.has(init)) return current(input, init);
    const carried: RequestInit = { ...(init ?? {}) };
    minted.add(carried);
    return observed(current, input, carried);
  };
  ours = wrapper as typeof fetch;
  globalThis.fetch = ours;
}

/** How many times the watcher wrapped `fetch`, and how many save requests it reported. */
export const saveWatcherStats = () => ({ ...stats });

function watch(kind: SaveKind, timeoutMs: number): Promise<SaveObservation> {
  installSaveWatcher();
  return new Promise<SaveObservation>((resolve) => {
    let settled = false;
    const settle = (observation: SaveObservation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      watching = watching.filter((entry) => entry.settle !== settle);
      resolve(observation);
    };
    const timer = setTimeout(() => settle(unconfirmed()), timeoutMs);
    watching.push({ kind, armedAt: clock, sawRequest: false, settle });
  });
}

/**
 * Watch the chat-save endpoints for one write, resolving with the first save request that follows —
 * or with a timeout, which is a real answer: nothing was sent.
 */
export async function observeNextSave(timeoutMs = SAVE_OBSERVE_MS): Promise<SaveObservation> {
  return await watch("chat", timeoutMs);
}

/**
 * v2.4 plan 02 §7 (H15). `saveSettings` never rejects: it defers silently while settings are not ready,
 * toasts on a failed answer and emits `SETTINGS_UPDATED` only after a 2xx (`script.js:8051-8115`). So
 * the next `/api/settings/save` answer is observed like a chat save, and `SETTINGS_UPDATED` settles the
 * observation only when the watcher saw no settings request at all — the event is then the only
 * evidence a request went out past a wrapper a peer removed. Whether the server holds what was written
 * is the caller's read-back; this answers only whether a save went out and what it answered.
 */
export async function observeNextSettingsSave(timeoutMs = SAVE_OBSERVE_MS): Promise<SaveObservation> {
  const pending = watch("settings", timeoutMs);
  const entry = watching[watching.length - 1];
  const unsubscribe = subscribeToHostEvent("SETTINGS_UPDATED", () => {
    if (!entry || entry.sawRequest || !watching.includes(entry)) return;
    entry.settle({ requested: true, status: null, ok: true, timedOut: false, failed: false, burst: ++clock });
  });
  try {
    return await pending;
  } finally {
    unsubscribe();
  }
}

/**
 * v2.4 plan 02 §7 (H16): the server's stored copy of one extension's settings. `/api/settings/get` answers
 * `settings` as a JSON STRING and reads every preset directory per call, so the caller rate-limits it.
 * `{}` when the file holds nothing under the key; null when it could not be read at all.
 */
export async function readServerExtensionSettings(key: string): Promise<Record<string, unknown> | null> {
  const context = getContext() as unknown as { getRequestHeaders?: () => Record<string, string> };
  if (typeof context.getRequestHeaders !== "function") return null;
  try {
    const response = await fetch("/api/settings/get", { method: "POST", headers: context.getRequestHeaders(), body: JSON.stringify({}), cache: "no-cache" });
    if (!response.ok) return null;
    const data = (await response.json()) as { settings?: unknown };
    if (typeof data.settings !== "string") return null;
    const parsed = JSON.parse(data.settings) as { extension_settings?: Record<string, unknown> };
    const root = parsed.extension_settings?.[key];
    return root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

export const boundaryInBlob = (blob: Record<string, unknown> | null | undefined): number | null => {
  const selected = typeof blob?.selectedStoryId === "string" ? blob.selectedStoryId : null;
  const stories = blob?.stories as Record<string, { engineState?: { boundary?: unknown } }> | undefined;
  const boundary = selected ? stories?.[selected]?.engineState?.boundary : undefined;
  return typeof boundary === "number" ? boundary : null;
};

/**
 * The boundary the SERVER's stored copy of the open chat holds — a round trip to the chat file
 * (`/api/chats/group/get` or `/api/chats/get`), whose first line carries the chat metadata. Null when
 * it cannot be read, which the caller treats as unconfirmed, never as agreement.
 */
export async function readServerBoundary(): Promise<number | null> {
  const context = getContext() as unknown as { chatId?: unknown; groupId?: unknown; characterId?: unknown; characters?: Array<{ avatar?: string }>; getRequestHeaders?: () => Record<string, string> };
  const chatId = typeof context.chatId === "string" ? context.chatId : null;
  if (!chatId || typeof context.getRequestHeaders !== "function") return null;
  const group = typeof context.groupId === "string" && context.groupId ? context.groupId : null;
  const avatar = group ? null : context.characters?.[Number(context.characterId)]?.avatar ?? null;
  if (!group && !avatar) return null;
  try {
    const response = await fetch(group ? "/api/chats/group/get" : "/api/chats/get", {
      method: "POST",
      headers: context.getRequestHeaders(),
      body: JSON.stringify(group ? { id: chatId } : { avatar_url: avatar, file_name: chatId }),
    });
    if (!response.ok) return null;
    const lines = (await response.json()) as unknown;
    const header = Array.isArray(lines) ? (lines[0] as { chat_metadata?: Record<string, unknown> } | undefined) : undefined;
    return boundaryInBlob(header?.chat_metadata?.["story_orchestrator"] as Record<string, unknown> | undefined);
  } catch {
    return null;
  }
}
