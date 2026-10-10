import { askText } from "@extraction/index";
import { fillChatInput, getContext, getPlayerName, readChatInput } from "@services/STAPI";
import { log } from "@utils/log";
import { couldNot, type WriteResult } from "@utils/writeResult";
import { playedProjection, withheldNames } from "./playerProjection";
import { nameForRosterId } from "./roster";
import { beginRun, type RunGuard } from "./runToken";
import type { RuntimeManager } from "./runtimeManager";
import { buildSuggestionPrompt, fillRefusal, parseSuggestions, SUGGESTION_MAX_TOKENS, suggestionsUsable } from "./suggestions";

export type SuggestionManager = Pick<RuntimeManager, "model" | "getSnapshot" | "getStory" | "getEngineState" | "getEnabledCharacterIds" | "getOwnership"> & {
  memoryActions: Pick<RuntimeManager["memoryActions"], "restingText">;
};

export interface SuggestionAsk {
  chatId: string;
  box: string;
  run: RunGuard;
}

export type SuggestionOutcome = { ok: true; suggestions: string[]; ask: SuggestionAsk } | { ok: false; reason: string };

export const SUGGESTION_COPY = {
  failed: "No suggestions came back. Try again in a moment.",
  stale: "The chat changed while the suggestions were being written.",
  chatChanged: "This is another chat now, so the suggestion was not put in.",
} as const;

const openChatId = () => String(getContext().chatId ?? "");

export const projectionFor = (manager: SuggestionManager) => {
  const story = manager.getStory();
  const state = manager.getEngineState();
  const snapshot = manager.getSnapshot();
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
  });
};

export async function askSuggestions(manager: SuggestionManager): Promise<SuggestionOutcome> {
  const run = beginRun(manager.getOwnership());
  const ask: SuggestionAsk = { chatId: openChatId(), box: readChatInput() ?? "", run };
  const projection = projectionFor(manager);
  const text = await askText(manager.model, buildSuggestionPrompt(projection), {
    role: "read", pass: "suggestions", maxTokens: SUGGESTION_MAX_TOKENS, signal: run.signal, refuseIncomplete: true,
  }).catch((error: unknown) => {
    log.warn("suggestions: the request failed", error);
    return "";
  });
  if (!run.stillOwns() || openChatId() !== ask.chatId) return { ok: false, reason: SUGGESTION_COPY.stale };
  const state = manager.getEngineState();
  const suggestions = parseSuggestions(text, projection, withheldNames(manager.getStory(), state?.visitedPath ?? [], state?.activeCheckpointId ?? null));
  return suggestionsUsable(suggestions) ? { ok: true, suggestions, ask } : { ok: false, reason: SUGGESTION_COPY.failed };
}

export function fillSuggestion(ask: SuggestionAsk, text: string): WriteResult {
  const refusal = fillRefusal({ chatAtAsk: ask.chatId, chatNow: openChatId(), boxAtAsk: ask.box, boxNow: readChatInput() ?? "" });
  if (refusal === "chat-changed" || !ask.run.stillOwns()) return couldNot(SUGGESTION_COPY.chatChanged);
  return fillChatInput(text, ask.box);
}
