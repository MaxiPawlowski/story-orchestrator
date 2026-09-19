import { isValidationErrorList, type ValidationError } from "@engine/index";
import { showConfirmPopup } from "@services/STAPI";
import { dropPersistedRuntime, getSelectedStoryId, loadPersistedRuntime, setSelectedStoryId } from "./persistence";
import { findStoryRecord, loadPinnedStory, loadStoryRecord, removeStoryRecord, saveStoryRecord } from "./storyLibrary";
import type { LoadedStory, PersistedStoryRuntime } from "./types";

// Which story this chat plays and where that copy comes from (spec addendum §Story identity). Split
// out of the manager in v2.1 plan 07 so the lifecycle rules live next to the library and the
// persistence layer they read, and the manager keeps only the engine-facing half (`loadStory`).
export interface StorySelectionDeps {
  loadStory: (loaded: LoadedStory, mode: "activate" | "hydrate", persisted?: PersistedStoryRuntime | null) => Promise<void>;
  clearStory: (status: string) => Promise<void>;
  fail: (errors: ValidationError[], status: string) => void;
  setStatus: (status: string) => void;
  isLoaded: (id: string) => boolean;
  loadedFallback: () => LoadedStory | null;
}

export async function loadSelectedStory(deps: StorySelectionDeps): Promise<boolean> {
  const id = getSelectedStoryId();
  if (!id) {
    await deps.clearStory("No story selected for this chat");
    return false;
  }
  return selectStory(deps, id);
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
  return selectStory(deps, saved.record.id);
}

// Selecting is never destructive: a chat that already played this story hydrates its pinned copy
// (library edits, and even deletion, cannot reach it); a story new to this chat pins the version the
// library holds right now. Reset lives only in restartStory().
export async function selectStory(deps: StorySelectionDeps, idOrHash: string): Promise<boolean> {
  const record = findStoryRecord(idOrHash);
  const persisted = loadPersistedRuntime(idOrHash) ?? (record ? loadPersistedRuntime(record.id) : null);
  if (persisted?.pinnedStory) {
    const pinned = loadPinnedStory(persisted.storyId, persisted.pinnedStory, persisted.playedVersion, persisted.contentHashAtLoad, persisted.storyTitle);
    if (!isValidationErrorList(pinned)) {
      await deps.loadStory(pinned, "hydrate", persisted);
      return true;
    }
    console.warn(`[Story Orchestrator] pinned copy of '${persisted.storyId}' did not parse; falling back to the library`, pinned);
  }
  if (!record) {
    deps.fail([{ path: "story", message: `Unknown story '${idOrHash}'` }], "Story not found");
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
  const id = currentId ?? getSelectedStoryId();
  if (!id) return false;
  const confirmed = alreadyConfirmed || await showConfirmPopup("Restart this story? The chat keeps its messages, but checkpoint progress, blackboard and story memory are cleared.", { okButton: "Restart story", cancelButton: "Keep playing" });
  if (!confirmed) return false;
  const fallback = deps.loadedFallback();
  dropPersistedRuntime(id);
  const record = findStoryRecord(id);
  const fromLibrary = record ? loadStoryRecord(record) : null;
  const next = fromLibrary && !isValidationErrorList(fromLibrary) ? fromLibrary : fallback;
  if (!next) return false;
  await deps.loadStory(next, "activate");
  deps.setStatus("Story restarted");
  return true;
}

export async function removeStory(deps: StorySelectionDeps, idOrHash: string): Promise<boolean> {
  const record = findStoryRecord(idOrHash);
  if (!record || !removeStoryRecord(idOrHash)) return false;
  // Chats keep playing their pinned copies; only a chat without one loses the story.
  if (deps.isLoaded(record.id) && !loadPersistedRuntime(record.id)?.pinnedStory) {
    setSelectedStoryId(null);
    await loadSelectedStory(deps);
  }
  deps.setStatus(`Removed "${record.title}" from the library`);
  return true;
}
