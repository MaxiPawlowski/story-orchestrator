import { executeSlashCommands, getContext, unbindChatLorebook } from "@services/STAPI";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { adoptChatState, openChatIntegrity, storedBoundaryFor } from "./persistence";
import type { RunContext, RunGuard } from "./runToken";

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

// v2.4 plan 02 §5 (D3). A branch or checkpoint copies the parent's `chat_metadata` whole, our blob and the
// chat lorebook slot included, then adds `main_chat` = the parent and a fresh `integrity` (H1-H3). So the
// branch reads as foreign (V5); what tells it from any other foreign blob is that `main_chat` names the
// chat the blob is stamped for and the blob's integrity is not this chat's. One hop only: a branch of an
// unadopted branch names the middle chat, not the stamp. Convert-to-group deletes `main_chat` (H4), so it
// stays foreign. Nothing is adopted on its own: the player chooses Continue from here.

export type ChatIdentitySnapshot =
  | { kind: "branch"; parentChat: string; checkpointName: string | null }
  | { kind: "foreign"; stampedFor: string };

export interface StoredIdentity {
  snapshot: ChatIdentitySnapshot;
  storyId: string | null;
  parentBook: string | null;
}

export interface StoredIdentityInput {
  openChat: string | null;
  blob: unknown;
  mainChat: unknown;
  integrity: string | null;
}

const recordOf = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

const checkpointNameOf = (selected: Record<string, unknown>): string | null => {
  const active = recordOf(selected.engineState)?.activeCheckpointId;
  const checkpoints = recordOf(selected.pinnedStory)?.checkpoints;
  const found = Array.isArray(checkpoints) ? checkpoints.map(recordOf).find((checkpoint) => checkpoint?.id === active) : null;
  return typeof found?.name === "string" && found.name ? found.name : null;
};

const mirrorBookOf = (selected: Record<string, unknown>): string | null => {
  const name = recordOf(recordOf(recordOf(selected.extras)?.memory)?.wiBook)?.name;
  return typeof name === "string" && name ? name : null;
};

export function classifyStoredIdentity(input: StoredIdentityInput): StoredIdentity | null {
  const blob = recordOf(input.blob);
  const stampedFor = blob?.chatId;
  if (!blob || blob.version !== 4 || typeof stampedFor !== "string" || !stampedFor || !input.openChat || stampedFor === input.openChat) return null;
  const storyId = typeof blob.selectedStoryId === "string" && blob.selectedStoryId ? blob.selectedStoryId : null;
  const selected = storyId ? recordOf(recordOf(blob.stories)?.[storyId]) : null;
  const stamped = typeof blob.integrity === "string" && blob.integrity ? blob.integrity : null;
  const branch = input.mainChat === stampedFor && (!stamped || stamped !== input.integrity);
  if (!branch || !storyId || !selected) return { snapshot: { kind: "foreign", stampedFor }, storyId: null, parentBook: null };
  return { snapshot: { kind: "branch", parentChat: stampedFor, checkpointName: checkpointNameOf(selected) }, storyId, parentBook: mirrorBookOf(selected) };
}

export function readStoredIdentity(): StoredIdentity | null {
  const metadata = recordOf(getContext().chatMetadata);
  return classifyStoredIdentity({ openChat: openChatId(), blob: metadata?.story_orchestrator, mainChat: metadata?.main_chat, integrity: openChatIntegrity() });
}

export const readChatIdentity = (): ChatIdentitySnapshot | null => readStoredIdentity()?.snapshot ?? null;

/** While a branch is unadopted, the slot it inherited names the parent's story-memory book, which would
 *  fire the parent's memory here. Exact match only; the blob itself is left byte-identical. */
export async function unbindBranchMirror(run: RunGuard): Promise<WriteResult<{ name: string }> | null> {
  const identity = readStoredIdentity();
  const book = identity?.snapshot.kind === "branch" ? identity.parentBook : null;
  if (!book || !run.stillOwns()) return null;
  return unbindChatLorebook(book);
}

export interface ContinueBranchDeps {
  selectStory: (storyId: string) => Promise<boolean>;
  note: (summary: string, detail: string) => void;
}

/** Continue from here: adopt (chat id + integrity), hydrate, and let the hydrate reconcile step the story
 *  back to where the branch ends (T3). */
export async function continueFromBranch(deps: ContinueBranchDeps): Promise<boolean> {
  const identity = readStoredIdentity();
  const branch = currentChat();
  if (identity?.snapshot.kind !== "branch" || !identity.storyId || !branch) return false;
  if (!adoptChatState()) return false;
  if (!(await deps.selectStory(identity.storyId))) return false;
  if (currentChat()?.chatId === branch.chatId) deps.note("branch continued", `this chat is a branch of ${identity.snapshot.parentChat}; it took that chat's story state and stepped back to where the branch ends`);
  return true;
}

/** Author view, E1: a branch cut at the oldest point the run can still restore, whose Continue from here
 *  then restores that point exactly. `/branch-create` opens the branch (H1). */
export async function branchFromOldest(messageId: number): Promise<WriteResult> {
  if (!Number.isInteger(messageId) || messageId < 0) return couldNot("there is no restorable message to branch from");
  return (await executeSlashCommands(`/branch-create ${messageId}`)) ? wrote() : couldNot("/branch-create did not run");
}
