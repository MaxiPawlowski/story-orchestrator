import { getContext } from "@services/STAPI";
import { openChatIntegrity, storedBoundaryFor } from "./persistence";
import type { RunContext } from "./runToken";

// v2.4 plan 02 §3. ST re-reads a chat it already has open (`reloadCurrentChat`: `/persona-sync`, a
// persona change on an untainted group) and emits CHAT_CHANGED with the SAME id (H8, H9). Treated as a
// switch, that dropped this chat's own pending boundaries and in-flight reads. It is the same chat only
// when all three agree: the epoch was minted in it, the integrity ST loaded is the one it had when this
// bridge loaded it, and the copy ST just loaded holds the boundary the engine is at. Anything short of
// that is today's full reload, which is safe.

export type ChatChange =
  | { kind: "same-chat" }
  | { kind: "diverged"; chatId: string; detail: string }
  | { kind: "switch" };

export interface LoadedChat {
  chatId: string;
  integrity: string | null;
}

export interface ChatChangeInput {
  openChat: string | null;
  claimedChat: string | null;
  loadedIntegrity: string | null;
  currentIntegrity: string | null;
  storyId: string | null;
  engineBoundary: number | null;
  storedBoundary: number | null;
}

export function classifyChatChange(input: ChatChangeInput): ChatChange {
  const { openChat, claimedChat, loadedIntegrity, currentIntegrity, storyId, engineBoundary, storedBoundary } = input;
  if (!openChat || openChat !== claimedChat || !loadedIntegrity || loadedIntegrity !== currentIntegrity || !storyId || engineBoundary === null) return { kind: "switch" };
  if (storedBoundary !== engineBoundary) {
    return { kind: "diverged", chatId: openChat, detail: `chat ${openChat} was reloaded with its own id and integrity, but the copy ST loaded holds boundary ${storedBoundary ?? "none"} while this run is at ${engineBoundary} (another tab wrote it, or a save did not land); reloaded from that copy` };
  }
  return { kind: "same-chat" };
}

const openChatId = (): string | null => {
  const id = getContext().chatId;
  return id === undefined || id === null || id === "" ? null : String(id);
};

export const currentChat = (): LoadedChat | null => {
  const chatId = openChatId();
  return chatId ? { chatId, integrity: openChatIntegrity() } : null;
};

/** The runtime's half is read only once the host's half already says "maybe the same chat". */
export function readChatChange(loaded: LoadedChat | null, runtime: { runContext: () => RunContext; engineBoundary: () => number | null }): ChatChange {
  const now = currentChat();
  if (!loaded?.integrity || !now || now.chatId !== loaded.chatId) return { kind: "switch" };
  const run = runtime.runContext();
  return classifyChatChange({
    openChat: now.chatId,
    claimedChat: run.claimedChat ?? null,
    loadedIntegrity: loaded.integrity,
    currentIntegrity: now.integrity,
    storyId: run.storyId,
    engineBoundary: runtime.engineBoundary(),
    storedBoundary: run.storyId ? storedBoundaryFor(run.storyId) : null,
  });
}
