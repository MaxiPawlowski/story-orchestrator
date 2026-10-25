import { askText } from "@extraction/index";
import { fillChatInput, getContext, getPlayerName, readChatInput } from "@services/STAPI";
import { log } from "@utils/log";
import { couldNot, type WriteResult } from "@utils/writeResult";
import type { EngineState, NormalizedStory } from "@engine/index";
import { playedProjection, withheldNames, type PlayedProjection } from "./playerProjection";
import { nameForRosterId } from "./roster";
import { playerTurnsInCheckpoint } from "./stretchTurns";
import { beginRun, type MessageWindow, type RunGuard } from "./runToken";
import type { RuntimeManager } from "./runtimeManager";
import type { RuntimeSnapshot } from "./types";
import { buildSuggestionPrompt, fillRefusal, parseSuggestionLines, SUGGESTION_MAX_TOKENS, suggestionsUsable, unseenWithheld, type SuggestionLine } from "./suggestions";
import {
  anchorCandidates, groundedIn, makeScreen, offerRows, RESURFACE_BOUNDARIES, rankAnchors, selectAnchors, stakesLines,
  type GreyedOffer, type Screen, type StakesLine, type SuggestionAnchor,
} from "./suggestionAnchors";

export type SuggestionManager = Pick<RuntimeManager, "model" | "getSnapshot" | "getCachedSnapshot" | "getStory" | "getEngineState" | "getEnabledCharacterIds" | "getOwnership" | "getBoundaryLog"> & {
  memoryActions: Pick<RuntimeManager["memoryActions"], "restingText">;
};

export interface SuggestionAsk {
  chatId: string;
  box: string;
  run: RunGuard;
}

export interface SuggestionAuthor {
  anchors: Array<Pick<SuggestionAnchor, "id" | "kind" | "text" | "evidence">>;
  grounded: number;
  lines: number;
}

export interface SuggestionSide {
  help: StakesLine[];
  unavailable: GreyedOffer[];
  author: SuggestionAuthor | null;
  shows: (text: string) => boolean;
}

export type SuggestionOutcome = ({ ok: true; suggestions: SuggestionLine[]; ask: SuggestionAsk } | { ok: false; reason: string }) & { side?: SuggestionSide };

export const SUGGESTION_COPY = {
  failed: "No suggestions came back. Try again in a moment.",
  stale: "The chat changed while the suggestions were being written.",
  chatChanged: "This is another chat now, so the suggestion was not put in.",
  edited: "The chat was edited since these were written. Ask again for fresh ones.",
} as const;

const openChatId = () => String(getContext().chatId ?? "");

export const transcriptWindow = (): MessageWindow => {
  const chat = getContext().chat;
  return { from: 0, to: Math.max(0, (Array.isArray(chat) ? chat.length : 0) - 1) };
};

export const projectionFor = (manager: SuggestionManager, snapshot: RuntimeSnapshot = manager.getSnapshot()) => {
  const story = manager.getStory();
  const state = manager.getEngineState();
  const chat = getContext().chat;
  const resting = (text: string) => manager.memoryActions.restingText(text);
  const sections = snapshot.narrative.sections.map((section) => ({ ...section, lines: section.lines.map(resting).filter((line) => line.trim()) }));
  return playedProjection({
    story,
    narrative: { ...snapshot.narrative, sections },
    visitedPath: state?.visitedPath ?? [],
    activeCheckpointId: state?.activeCheckpointId ?? null,
    cast: manager.getEnabledCharacterIds().map((id) => nameForRosterId(story, id)),
    chat: Array.isArray(chat) ? chat : [],
    playerName: getPlayerName(),
    playerTurns: playerTurnsInCheckpoint(state, Array.isArray(chat) ? chat : []),
  });
};

const withheldFor = (story: NormalizedStory | null, state: EngineState | null) =>
  withheldNames(story, state?.visitedPath ?? [], state?.activeCheckpointId ?? null, state?.blackboard?.values);

const screenFor = (manager: SuggestionManager, story: NormalizedStory, state: EngineState, projection: PlayedProjection): Screen => makeScreen({
  story, values: state.blackboard?.values ?? {}, enabled: manager.getEnabledCharacterIds(), resting: (text) => manager.memoryActions.restingText(text),
  unseen: unseenWithheld(projection, withheldFor(story, state)),
});

const valuesThen = (manager: SuggestionManager, boundary: number) =>
  manager.getBoundaryLog().find((entry) => entry.boundary > boundary - RESURFACE_BOUNDARIES)?.before.blackboard.values ?? null;

interface SuggestionPlan {
  anchors: SuggestionAnchor[];
  screen: Screen;
  help: StakesLine[];
  unavailable: GreyedOffer[];
}

const planFor = (manager: SuggestionManager, projection: PlayedProjection, snapshot: RuntimeSnapshot, again: number): SuggestionPlan => {
  const story = manager.getStory();
  const state = manager.getEngineState();
  if (!story || !state?.blackboard) return { anchors: [], screen: () => true, help: [], unavailable: [] };
  const screen = screenFor(manager, story, state, projection);
  const candidates = anchorCandidates({
    story, state, projection, arcs: snapshot.memory?.arcs ?? [], derived: snapshot.memory?.derived, promises: snapshot.promises ?? [], patterns: snapshot.patterns ?? [],
    game: snapshot.game ?? null, valuesThen: valuesThen(manager, state.boundary),
  }, screen);
  const anchors = globalThis.storyOrchestratorDebugSuggestionAnchors === "off" ? []
    : selectAnchors(rankAnchors(candidates, { chatId: openChatId(), storyId: story.id ?? story.title, boundary: state.boundary, again }));
  return { anchors, screen, help: stakesLines(story, state, screen), unavailable: offerRows(story, state, screen).unavailable };
};

export const liveShows = (manager: SuggestionManager): ((text: string) => boolean) => {
  let at: RuntimeSnapshot | null = null;
  let screen: Screen = () => false;
  return (text) => {
    const snapshot = manager.getCachedSnapshot();
    if (snapshot !== at) {
      at = snapshot;
      const story = manager.getStory();
      const state = manager.getEngineState();
      screen = story && state?.blackboard ? screenFor(manager, story, state, projectionFor(manager, snapshot)) : () => false;
    }
    return screen(text);
  };
};

const withAuthoredOffers = (lines: SuggestionLine[], anchors: readonly SuggestionAnchor[]): SuggestionLine[] => {
  const dropped = anchors.filter((entry) => entry.kind === "offer" && !lines.some((line) => line.anchorId === entry.id)
    && !lines.some((line) => line.text.toLowerCase() === entry.text.toLowerCase()));
  return [...lines, ...dropped.map((entry): SuggestionLine => ({ text: entry.text, anchorId: entry.id, authored: true }))];
};

const sideFor = (manager: SuggestionManager, plan: SuggestionPlan, lines: readonly SuggestionLine[], authorView: boolean): SuggestionSide => ({
  help: plan.help, unavailable: authorView ? plan.unavailable : [], shows: liveShows(manager),
  author: authorView ? {
    anchors: plan.anchors.map(({ id, kind, text, evidence }) => ({ id, kind, text, evidence })),
    grounded: lines.filter((line) => line.anchorId).length, lines: lines.length,
  } : null,
});

export async function askSuggestions(manager: SuggestionManager, again = 0): Promise<SuggestionOutcome> {
  const run = beginRun(manager.getOwnership(), transcriptWindow());
  const ask: SuggestionAsk = { chatId: openChatId(), box: readChatInput() ?? "", run };
  const snapshot = manager.getSnapshot();
  const projection = projectionFor(manager, snapshot);
  const plan = planFor(manager, projection, snapshot, again);
  const text = await askText(manager.model, buildSuggestionPrompt(projection, plan.anchors), {
    role: "read", pass: "suggestions", maxTokens: SUGGESTION_MAX_TOKENS, signal: run.signal, refuseIncomplete: true,
  }).catch((error: unknown) => {
    log.warn("suggestions: the request failed", error);
    return "";
  });
  if (!run.stillOwns() || openChatId() !== ask.chatId) return { ok: false, reason: SUGGESTION_COPY.stale };
  const lines = parseSuggestionLines(text, projection, withheldFor(manager.getStory(), manager.getEngineState()), { anchors: plan.anchors, grounded: groundedIn, screen: plan.screen });
  const side = sideFor(manager, plan, lines, snapshot.ui?.authorView === true);
  if (!suggestionsUsable(lines)) return { ok: false, reason: SUGGESTION_COPY.failed, ...(side.help.length || side.unavailable.length ? { side } : {}) };
  return { ok: true, suggestions: withAuthoredOffers(lines, plan.anchors), ask, side };
}

export function fillSuggestion(ask: SuggestionAsk, text: string): WriteResult {
  const refusal = fillRefusal({ chatAtAsk: ask.chatId, chatNow: openChatId(), boxAtAsk: ask.box, boxNow: readChatInput() ?? "" });
  const lapsed = ask.run.lapsed();
  if (refusal === "chat-changed" || (lapsed && lapsed !== "window")) return couldNot(SUGGESTION_COPY.chatChanged);
  if (lapsed) return couldNot(SUGGESTION_COPY.edited);
  return fillChatInput(text, ask.box);
}
