import { getContext } from "./context";

// v2.3 plan 06 (save evidence). `saveMetadata` resolves to `saveChatConditional`, which CATCHES every
// save error, logs it and returns normally (`script.js:9412-9440`), so awaiting it proves nothing. The
// request itself is therefore observed: the chat-save endpoints are wrapped, and the status of the
// request that follows our persist is what says whether the write reached the server at all.

const SAVE_PATHS = ["/api/chats/save", "/api/chats/group/save"];
export const SAVE_OBSERVE_MS = 8000;

export interface SaveObservation {
  /** Did a save request even go out? A save that never left is as unconfirmed as one that failed. */
  requested: boolean;
  status: number | null;
  ok: boolean;
  timedOut: boolean;
  /** The request went out and never came back — an aborted route, a dead connection. Distinct from
   *  `timedOut`, which means no request was ever observed. */
  failed: boolean;
}

const unconfirmed = (): SaveObservation => ({ requested: false, status: null, ok: false, timedOut: true, failed: false });

let watching: Array<{ armedAt: number; settle: (observation: SaveObservation) => void }> = [];
let installed = false;
let clock = 0;

const isSaveRequest = (input: unknown): boolean => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url?: unknown } | undefined)?.url;
  return typeof url === "string" && SAVE_PATHS.some((path) => url.includes(path));
};

const takeArmedBefore = (startedAt: number) => {
  const due = watching.filter((entry) => entry.armedAt < startedAt);
  watching = watching.filter((entry) => entry.armedAt >= startedAt);
  return due;
};

function report(status: number, startedAt: number) {
  takeArmedBefore(startedAt).forEach((entry) => entry.settle({ requested: true, status, ok: status >= 200 && status < 300, timedOut: false, failed: false }));
}

/**
 * The request left and threw before any answer. `await original(...)` used to reject straight past the
 * report, so a blocked save route looked like a save that was never attempted — the observation
 * timed out at 8s and the reason read "no save request went out", which is false and sends a reader
 * after a scheduler that did fire (2026-09-22).
 */
function reportFailure(startedAt: number) {
  takeArmedBefore(startedAt).forEach((entry) => entry.settle({ requested: true, status: null, ok: false, timedOut: false, failed: true }));
}

/**
 * Wrap `globalThis.fetch` once, lazily: a session that never persists pays nothing, and a second wrap
 * would report every save twice.
 */
export function installSaveWatcher() {
  if (installed) return;
  const original = globalThis.fetch;
  if (typeof original !== "function") return;
  installed = true;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = ++clock;
    try {
      const response = await original(input, init);
      if (watching.length && isSaveRequest(input)) report(response.status, startedAt);
      return response;
    } catch (error) {
      if (watching.length && isSaveRequest(input)) reportFailure(startedAt);
      throw error;
    }
  };
}

/**
 * Watch the chat-save endpoints for one write, resolving with the first save request that follows —
 * or with a timeout, which is a real answer: nothing was sent.
 */
export async function observeNextSave(timeoutMs = SAVE_OBSERVE_MS): Promise<SaveObservation> {
  installSaveWatcher();
  return await new Promise<SaveObservation>((resolve) => {
    let settled = false;
    const settle = (observation: SaveObservation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      watching = watching.filter((entry) => entry.settle !== settle);
      resolve(observation);
    };
    const timer = setTimeout(() => settle(unconfirmed()), timeoutMs);
    watching.push({ armedAt: clock, settle });
  });
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
