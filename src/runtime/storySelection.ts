import { isValidationErrorList, storyWarnings, type NormalizedStoryV2, type ValidationError } from "@engine/index";
import { showConfirmPopup } from "@services/STAPI";
import {
  adoptChatState, blobMismatch, describeMismatch, dropPersistedRuntime, getSelectedStoryId, loadPersistedRuntime,
  replaceUnreadableBlob, UNREADABLE_NOTICE, unreadableStored,
} from "./persistence";
import { findStoryRecord, listStoryRecords, loadPinnedStory, loadStoryRecord, removeStoryRecord, saveStoryRecord } from "./storyLibrary";
import type { RunGuard } from "./runToken";
import type { LoadedStory, PersistedStoryRuntime } from "./types";
import type { RestartCarry } from "./extras";
import { log } from "@utils/log";

// Which story this chat plays and where that copy comes from (spec addendum §Story identity). Split
// out of the manager so the lifecycle rules live next to the library and the
// persistence layer they read, and the manager keeps only the engine-facing half (`loadStory`).
export interface StorySelectionDeps {
  loadStory: (loaded: LoadedStory, mode: "activate" | "hydrate", persisted?: PersistedStoryRuntime | null, carry?: RestartCarry | null) => Promise<void>;
  carryOver?: () => RestartCarry | null;
  clearStory: (status: string, note?: string) => Promise<void>;
  restoreEffects?: (scope: "leave" | "restart") => Promise<void>;
  beginRun?: () => RunGuard;
  fail: (errors: ValidationError[], status: string) => void;
  warn?: (warnings: ValidationError[]) => void;
  setStatus: (status: string, note?: string) => void;
  isLoaded: (id: string) => boolean;
  loadedFallback: () => LoadedStory | null;
}

/** Checkpoint entries live in global lorebooks, so any story this install plays (and the one this
 * chat is leaving) may have left some on — after a chat switch, or ST closing mid-story. Only the
 * story now playing keeps its own; its path already decided those. a release that a newer load
 * overtook would disable the NEW story's entries (they are not `keep`), so it asks the caller's run
 * before each write, and the caller asks it again before going on. */
export async function releaseGatedWorldInfo(
  effects: { releaseWorldInfo: (owners: unknown[], keep: unknown | null, run?: RunGuard) => Promise<unknown> },
  previous: NormalizedStoryV2 | null,
  keep: NormalizedStoryV2 | null,
  run?: RunGuard,
): Promise<void> {
  const owners = [...listStoryRecords().map((record) => record.raw), ...(previous ? [previous] : [])];
  await effects.releaseWorldInfo(owners, keep, run).catch((error) => log.warn("could not release checkpoint world info", error));
}

let refusedSelection: { chat: string | null; storyId: string } | null = null;

export async function loadSelectedStory(deps: StorySelectionDeps): Promise<boolean> {
  await deps.restoreEffects?.("leave");
  const id = getSelectedStoryId();
  if (!id) {
    const found = blobMismatch();
    await deps.clearStory(
      !found ? "No story selected for this chat"
        : found.kind === "foreign" ? "No story selected: this chat's saved story state is stamped for another chat"
          : `No story selected: this chat's saved story state was ${UNREADABLE_NOTICE}`,
      !found ? undefined
        : found.kind === "foreign" ? `blob-chat-mismatch: stamped for ${found.stampedFor}, open chat is ${String(found.openChat)}; the stored state was left untouched`
          : `blob-unreadable: ${describeMismatch(found)}, open chat is ${String(found.openChat)}; the stored state was left untouched`,
    );
    return false;
  }
  return selectStory(deps, id, false);
}

export async function importStoryJson(deps: StorySelectionDeps, rawText: string): Promise<boolean> {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (error) {
    deps.fail([{ path: "$", message: error instanceof Error ? error.message : "Invalid JSON" }], "Import failed");
    return false;
  }
  const saved = saveStoryRecord(raw);
  if (isValidationErrorList(saved)) {
    deps.fail(saved, "Story validation failed");
    return false;
  }
  // After the load: loading a story starts its journal, so a warning recorded before it was wiped
  // (found live).
  const selected = await selectStory(deps, saved.record.id);
  const warnings = storyWarnings(saved.story);
  if (selected && warnings.length) deps.warn?.(warnings);
  return selected;
}

// Selecting is never destructive: a chat that already played this story hydrates its pinned copy
// (library edits, and even deletion, cannot reach it); a story new to this chat pins the version the
// library holds right now. Reset lives only in restartStory().
export async function selectStory(deps: StorySelectionDeps, id: string, chosen = true): Promise<boolean> {
  if (chosen && !adoptChatState()) {
    const found = unreadableStored();
    if (found) {
      refusedSelection = { chat: found.openChat, storyId: id };
      deps.setStatus(
        `Story not selected: this chat's saved story state was ${UNREADABLE_NOTICE}`,
        `blob-unreadable: selecting '${id}' refused, ${describeMismatch(found)}; the stored state was left untouched`,
      );
    }
    return false;
  }
  const record = findStoryRecord(id);
  const persisted = loadPersistedRuntime(id);
  if (persisted) {
    const pinned = loadPinnedStory(persisted.storyId, persisted.pinnedStory, persisted.playedVersion, persisted.contentHashAtLoad, persisted.storyTitle);
    if (!isValidationErrorList(pinned)) {
      await deps.loadStory(pinned, "hydrate", persisted);
      return true;
    }
    log.warn(`pinned copy of '${persisted.storyId}' did not parse; falling back to the library`, pinned);
  }
  if (!record) {
    deps.fail([{ path: "story", message: `Unknown story '${id}'` }], "Story not found");
    return false;
  }
  const loaded = loadStoryRecord(record);
  if (isValidationErrorList(loaded)) {
    deps.fail(loaded, "Story validation failed");
    return false;
  }
  await deps.loadStory(loaded, persisted ? "hydrate" : "activate", persisted);
  return true;
}

// The only reset path. Drops this chat's progress for the story and re-pins the latest library
// version, so a restart also adopts whatever the author changed meanwhile.
export async function restartStory(deps: StorySelectionDeps, currentId: string | null, alreadyConfirmed = false): Promise<boolean> {
  const unreadable = currentId ? null : unreadableStored();
  const refused = unreadable && refusedSelection?.chat === unreadable.openChat ? refusedSelection.storyId : null;
  const id = currentId ?? (unreadable ? refused : getSelectedStoryId());
  if (!id && !unreadable) return false;
  // The confirmation waits as long as the player does, and dropping progress afterwards would drop
  // it in whatever chat is open by then.
  const run = deps.beginRun?.();
  const question = unreadable
    ? `This chat's saved story state was ${UNREADABLE_NOTICE}. Restart replaces it with a fresh start; the chat keeps its messages.`
    : "Restart this story? The chat keeps its messages, but checkpoint progress, blackboard and story memory are cleared.";
  const confirmed = alreadyConfirmed || await showConfirmPopup(question, { okButton: "Restart story", cancelButton: "Keep playing" });
  if (!confirmed || (run && !run.stillOwns())) return false;
  if (unreadable && !replaceUnreadableBlob()) return false;
  const note = unreadable ? `blob-unreadable: replaced on a confirmed Restart (${describeMismatch(unreadable)})` : undefined;
  if (unreadable) refusedSelection = null;
  if (!id) {
    deps.setStatus("Unreadable story state replaced", note);
    return true;
  }
  const fallback = deps.loadedFallback();
  const carry = deps.carryOver?.() ?? null;
  await deps.restoreEffects?.("restart");
  if (run && !run.stillOwns()) return false;
  dropPersistedRuntime(id);
  const record = findStoryRecord(id);
  const fromLibrary = record ? loadStoryRecord(record) : null;
  const next = fromLibrary && !isValidationErrorList(fromLibrary) ? fromLibrary : fallback;
  if (!next) return false;
  await deps.loadStory(next, "activate", null, carry);
  const cleared = "the chat keeps its messages; checkpoint progress, blackboard and story memory were cleared";
  deps.setStatus("Story restarted", note ?? `restarted${carry ? ` from ${carry.from}` : ""} on v${next.record.version}: ${cleared}`);
  return true;
}

export async function removeStory(deps: StorySelectionDeps, id: string): Promise<boolean> {
  const record = findStoryRecord(id);
  if (!record || !removeStoryRecord(id)) return false;
  deps.setStatus(`Removed "${record.title}" from the library`);
  return true;
}
