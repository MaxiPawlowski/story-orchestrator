import { isValidationErrorList, type EngineHistory, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import type { StoryDiffResult } from "@engine/storyDiff";
import { showChoicePopup } from "@services/STAPI";
import { findStoryRecord, loadStoryRecord } from "./storyLibrary";
import type { LoadedStory, StoryLibraryRecord } from "./types";
import { beginRun, type RunOwnership } from "./runToken";
import { log } from "@utils/log";

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
  getHistory?: () => EngineHistory | null;
  // The played graph, expansions merged in — diffing the authored base would read every generated
  // beat as removed (and could report the ACTIVE checkpoint as gone).
  mergeStory: (raw: unknown, base: NormalizedStoryV2) => NormalizedStoryV2;
  swapStory: (loaded: LoadedStory, state: EngineState | null, reanchored: boolean, history?: EngineHistory | null) => Promise<void>;
  restart: () => Promise<boolean>;
  journal: (outcome: StoryUpdateOutcome) => void;
  ownership: RunOwnership;
  chatOpen: () => boolean;
  groupOpen?: () => boolean;
}

const versionLabel = (from: number | null, to: number | null) => (from !== null && to !== null && from !== to ? ` (v${from} → v${to})` : "");

export type StoryUpdateSource = "save" | "update";

export interface StoryUpdateDescription {
  title: string;
  from: number | null;
  to: number | null;
  invalidating: string[];
  keptCount: number;
  source: StoryUpdateSource;
}

// Author-facing, not player-facing: this popup only ever appears because the author just saved an
// edit from this chat.: it returns a description, not markup — the title of an
// imported story and a diff message are both text somebody else wrote, and the host assigns popup
// content to innerHTML (popup.js:534).
export const describeStoryUpdate = (title: string, diff: StoryDiffResult, from: number | null, to: number | null, source: StoryUpdateSource = "save"): StoryUpdateDescription => ({
  title,
  from,
  to,
  source,
  invalidating: diff.entries.filter((entry) => entry.kind === "invalidating").map((entry) => entry.message),
  keptCount: diff.entries.filter((entry) => entry.kind === "compatible").length,
});

/** The popup's markup is authored here; every value that came from a story becomes a text node. */
export const renderStoryUpdate = (description: StoryUpdateDescription, doc: Document): HTMLElement => {
  const root = doc.createElement("div");
  const para = (text: string) => { const node = doc.createElement("p"); node.append(doc.createTextNode(text)); root.append(node); };
  const heading = doc.createElement("h3");
  heading.append(doc.createTextNode(`“${description.title}” changed under this chat${versionLabel(description.from, description.to)}`));
  root.append(heading);
  // One save vocabulary. "Saved to the library" and "applied to this chat" are two
  // different events with different owners, and this popup is where they are most easily confused.
  para(description.source === "save"
    ? "Your edit is already saved to the library. What is left to decide is whether this chat takes it:"
    : `The library holds ${description.to !== null ? `v${description.to}` : "a newer version"} of this story. What is left to decide is whether this chat takes it:`);
  const list = doc.createElement("ul");
  description.invalidating.forEach((message) => { const item = doc.createElement("li"); item.append(doc.createTextNode(message)); list.append(item); });
  root.append(list);
  para("The lines above cannot be applied to this chat as they stand.");
  if (description.keptCount) para(description.keptCount === 1
    ? "1 other change is applied to this chat as it stands."
    : `${description.keptCount} other changes are applied to this chat as they stand.`);
  const update = description.source === "save" ? "the edit" : "it";
  const playing = description.from !== null ? `v${description.from}, the version it is playing now` : "the version it is playing now";
  const kept = description.source === "save" ? " Either way the library keeps your edit." : "";
  para(`Keep playing applies ${update} and drops only what no longer fits. Restart story applies ${update} and clears this chat's progress. ` +
    `Cancel applies nothing — this chat keeps playing ${playing}.${kept}`);
  return root;
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
const loadStoryDiff = async () => {
  try {
    return await import("@engine/storyDiff");
  } catch (error) {
    log.warn("the story comparison chunk failed to load", error);
    return null;
  }
};

export async function applyStoryUpdate(deps: StoryUpdateDeps, target?: StoryLibraryRecord): Promise<StoryUpdateOutcome> {
  if (!deps.chatOpen()) return emptyOutcome("no chat is open");
  if (deps.groupOpen && !deps.groupOpen()) return emptyOutcome("this chat is not a group chat");
  const loading = beginRun(deps.ownership);
  const storyDiff = await loadStoryDiff();
  if (!storyDiff) return emptyOutcome("the story comparison could not load; reload SillyTavern and save again");
  if (!loading.stillOwns()) return emptyOutcome(`story update discarded: ${loading.lapsedDetail()}`);
  const { diffStories, pruneEngineHistory, pruneEngineState } = storyDiff;
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
    const run = beginRun(deps.ownership);
    const description = describeStoryUpdate(record.title, diff, loaded.record.version, record.version, target ? "save" : "update");
    choice = (await showChoicePopup<StoryUpdateChoice>((doc) => renderStoryUpdate(description, doc), {
      okButton: { id: "keep", label: "Keep playing" },
      choices: [{ id: "restart", label: "Restart story" }],
      cancelButton: "Cancel",
    })) ?? "cancel";
    if (!run.stillOwns()) return { ...base, reason: `story update discarded: ${run.lapsedDetail()}` };
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

  const history = state ? pruneEngineHistory(deps.getHistory?.() ?? null, next, diff) : null;
  await deps.swapStory({ record, story: next }, state ? pruneEngineState(state, next, diff) : null, Boolean(diff.reanchorTo), history);
  const outcome = { ...base, applied: true, choice };
  deps.journal(outcome);
  return outcome;
}
