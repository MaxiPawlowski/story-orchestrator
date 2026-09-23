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

let watching: Array<(observation: SaveObservation) => void> = [];
let installed = false;

const isSaveRequest = (input: unknown): boolean => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url?: unknown } | undefined)?.url;
  return typeof url === "string" && SAVE_PATHS.some((path) => url.includes(path));
};

function report(status: number) {
  const pending = watching;
  watching = [];
  pending.forEach((resolve) => resolve({ requested: true, status, ok: status >= 200 && status < 300, timedOut: false, failed: false }));
}

/**
 * The request left and threw before any answer. `await original(...)` used to reject straight past the
 * report, so a blocked save route looked like a save that was never attempted — the observation
 * timed out at 8s and the reason read "no save request went out", which is false and sends a reader
 * after a scheduler that did fire (2026-09-22).
 */
function reportFailure() {
  const pending = watching;
  watching = [];
  pending.forEach((resolve) => resolve({ requested: true, status: null, ok: false, timedOut: false, failed: true }));
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
    try {
      const response = await original(input, init);
      if (watching.length && isSaveRequest(input)) report(response.status);
      return response;
    } catch (error) {
      if (watching.length && isSaveRequest(input)) reportFailure();
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
      watching = watching.filter((entry) => entry !== settle);
      resolve(observation);
    };
    const timer = setTimeout(() => settle(unconfirmed()), timeoutMs);
    watching.push(settle);
  });
}

/**
 * What ST holds for this chat's metadata RIGHT NOW, without a round trip: `chat_metadata` is the
 * object the server's last response was applied to, so comparing it with what this chat believes it
 * wrote is the read-back — and a discrepancy means a save that reported success did not land.
 */
export function readBackMetadata(): Record<string, unknown> | null {
  const metadata = getContext().chatMetadata as Record<string, unknown> | undefined;
  return metadata && typeof metadata === "object" ? (metadata["story_orchestrator"] as Record<string, unknown> | undefined) ?? null : null;
}

/**
 * The boundary the SERVER's copy of this chat holds, as ST last applied it. An absent blob, a blob
 * for another chat, or one whose selected story is gone all answer `null`, which the caller treats as
 * unconfirmed rather than as agreement.
 */
export function readBackBoundary(): number | null {
  const blob = readBackMetadata();
  const selected = typeof blob?.selectedStoryId === "string" ? blob.selectedStoryId : null;
  const stories = blob?.stories as Record<string, { engineState?: { boundary?: unknown } }> | undefined;
  const boundary = selected ? stories?.[selected]?.engineState?.boundary : undefined;
  return typeof boundary === "number" ? boundary : null;
}
