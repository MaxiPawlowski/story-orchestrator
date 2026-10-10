import { hasChecks, hasGameLayer, questStatus, valueReader, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { scopeDropped } from "@extraction/scope";
import type { ScopeSourceContext } from "@extraction/scopeSources";
import type { GameAuthorView, GameView } from "./gameTypes";
import type { GameSources } from "./widgets";
import type { ChecksRuntimeState } from "./storyCheckDraws";

type Composer = typeof import("./widgets").composeGame;

let composer: Composer | null = null;

export const loadGameComposer = async () => {
  composer = (await import("./widgets")).composeGame;
};

export interface GameSliceInput {
  story: NormalizedStoryV2 | null;
  state: EngineState | null;
  boundaryLog: readonly BoundaryLogEntry[];
  checks: ChecksRuntimeState | undefined;
  threads: GameSources["threads"];
  chat: readonly unknown[];
  castNames: Record<string, string>;
  authorView: boolean;
  scopeContext?: ScopeSourceContext;
}

export const storyHasGame = (story: NormalizedStoryV2 | null): boolean => hasGameLayer(story) || hasChecks(story);

export function gameSlices(input: GameSliceInput): { game: GameView | null; gameAuthor: GameAuthorView | null } {
  const { story, state } = input;
  if (!story || !state || !storyHasGame(story)) return { game: null, gameAuthor: null };
  const composed = composer?.({
    story, state, boundaryLog: input.boundaryLog, checks: input.checks?.records ?? [], threads: input.threads, chat: input.chat, castNames: input.castNames, authorView: input.authorView,
  }) ?? null;
  const reader = valueReader(state.blackboard.values);
  const gameAuthor: GameAuthorView | null = input.authorView ? {
    quests: (story.quests ?? []).map((quest) => ({ id: quest.id, title: quest.title, status: questStatus(quest, reader) })),
    scopeOverflow: scopeDropped(story, state, "quest", input.scopeContext),
    widgets: composed?.authorWidgets ?? [],
    provenance: composed?.provenance,
  } : null;
  return { game: composed?.player ?? null, gameAuthor };
}
