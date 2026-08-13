import { diffStories, isValidationErrorList, pruneEngineState, type EngineState, type NormalizedStoryV2, type StoryDiffResult } from "@engine/index";
import { showChoicePopup } from "@services/STAPI";
import { findStoryRecord, loadStoryRecord } from "./storyLibrary";
import type { LoadedStory, StoryLibraryRecord } from "./types";

export type StoryUpdateChoice = "keep" | "restart" | "cancel";

export interface StoryUpdateOutcome {
  applied: boolean;
  classification: StoryDiffResult["classification"] | "unavailable";
  choice: StoryUpdateChoice | null;
  fromVersion: number | null;
  toVersion: number | null;
  storyId: string | null;
  dropped: string[];
  reason?: string;
  at: string;
}

export interface StoryUpdateDeps {
  getLoaded: () => LoadedStory | null;
  getState: () => EngineState | null;
  // The played graph, expansions merged in — diffing the authored base would read every generated
  // beat as removed (and could report the ACTIVE checkpoint as gone).
  mergeStory: (raw: unknown, base: NormalizedStoryV2) => NormalizedStoryV2;
  swapStory: (loaded: LoadedStory, state: EngineState | null, reanchored: boolean) => Promise<void>;
  restart: () => Promise<boolean>;
  journal: (outcome: StoryUpdateOutcome) => void;
}

const versionLabel = (from: number | null, to: number | null) => (from !== null && to !== null && from !== to ? ` (v${from} → v${to})` : "");

// Author-facing, not player-facing: this popup only ever appears because the author just saved an
// edit from this chat.
export const describeStoryUpdate = (title: string, diff: StoryDiffResult, from: number | null, to: number | null): string => {
  const consequences = diff.entries.filter((entry) => entry.kind === "invalidating").map((entry) => `<li>${entry.message}</li>`).join("");
  const kept = diff.entries.filter((entry) => entry.kind === "compatible").length;
  return [
    `<h3>“${title}” changed under this chat${versionLabel(from, to)}</h3>`,
    "<p>Some of what changed cannot be carried over as it stands:</p>",
    `<ul>${consequences}</ul>`,
    kept ? `<p class="opacity-70">${kept} other change${kept === 1 ? " carries" : "s carry"} over untouched.</p>` : "",
    "<p><b>Keep playing</b> drops only what no longer fits and continues this chat. <b>Restart story</b> clears this chat's progress and starts the new version clean. <b>Cancel</b> leaves the chat on the version it is playing — the library keeps your edit either way.</p>",
  ].filter(Boolean).join("");
};

export const emptyOutcome = (reason: string): StoryUpdateOutcome => ({
  applied: false,
  classification: "unavailable",
  choice: null,
  fromVersion: null,
  toVersion: null,
  storyId: null,
  dropped: [],
  reason,
  at: new Date().toISOString(),
});

// The one automatic path from library to a running chat (spec addendum §Story identity): it exists
// because the author is editing *from* this chat. Every other chat keeps its pinned copy.
export async function applyStoryUpdate(deps: StoryUpdateDeps, target?: StoryLibraryRecord): Promise<StoryUpdateOutcome> {
  const loaded = deps.getLoaded();
  if (!loaded) return emptyOutcome("no story is loaded in this chat");
  const record = target ?? findStoryRecord(loaded.record.id);
  if (!record) return emptyOutcome(`story '${loaded.record.id}' is no longer in the library`);
  if (record.id !== loaded.record.id) return emptyOutcome(`'${record.id}' is a different story than this chat is playing`);

  const parsed = loadStoryRecord(record);
  if (isValidationErrorList(parsed)) return emptyOutcome(`the saved story does not validate: ${parsed[0]?.message ?? "invalid"}`);

  const state = deps.getState();
  const next = deps.mergeStory(record.raw, parsed.story);
  const diff = diffStories(loaded.story, next, state);
  const base: StoryUpdateOutcome = {
    applied: false,
    classification: diff.classification,
    choice: null,
    fromVersion: loaded.record.version,
    toVersion: record.version,
    storyId: record.id,
    dropped: diff.droppedQualityKeys,
    at: new Date().toISOString(),
  };

  if (diff.classification === "identical" && loaded.record.hash === record.hash) {
    const outcome = { ...base, reason: "already playing this version" };
    deps.journal(outcome);
    return outcome;
  }

  let choice: StoryUpdateChoice = "keep";
  if (diff.classification === "invalidating") {
    choice = (await showChoicePopup<StoryUpdateChoice>(describeStoryUpdate(record.title, diff, loaded.record.version, record.version), {
      okButton: { id: "keep", label: "Keep playing" },
      choices: [{ id: "restart", label: "Restart story" }],
      cancelButton: "Cancel",
    })) ?? "cancel";
  }

  if (choice === "cancel") {
    const outcome = { ...base, choice, reason: "author kept this chat on its pinned version" };
    deps.journal(outcome);
    return outcome;
  }
  if (choice === "restart") {
    const restarted = await deps.restart();
    const outcome = { ...base, applied: restarted, choice, reason: restarted ? "restarted on the new version" : "restart declined" };
    deps.journal(outcome);
    return outcome;
  }

  await deps.swapStory({ record, story: next }, state ? pruneEngineState(state, next, diff) : null, Boolean(diff.reanchorTo));
  const outcome = { ...base, applied: true, choice };
  deps.journal(outcome);
  return outcome;
}
