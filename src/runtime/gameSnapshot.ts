import { hasChecks, hasGameLayer, questStatus, valueReader, type BoundaryLogEntry, type EngineState, type NormalizedStory } from "@engine/index";
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
  story: NormalizedStory | null;
  state: EngineState | null;
  boundaryLog: readonly BoundaryLogEntry[];
  checks: ChecksRuntimeState | undefined;
  threads: GameSources["threads"];
  chat: readonly unknown[];
  castNames: Record<string, string>;
  authorView: boolean;
  scopeContext?: ScopeSourceContext;
  enabled?: readonly string[];
  location?: string | null;
  characters?: ReadonlyArray<{ avatar?: string; name?: string }>;
}

export const portraitsOf = (story: NormalizedStory, characters: ReadonlyArray<{ avatar?: string; name?: string }>, castNames: Record<string, string>): Record<string, string> =>
  Object.fromEntries(story.roster.flatMap((member) => {
    const name = (castNames[member.id] ?? member.name ?? member.id).toLowerCase();
    const avatar = characters.find((card) => card.name?.toLowerCase() === name)?.avatar;
    return avatar && avatar !== "none" ? [[member.id, `/characters/${encodeURIComponent(avatar)}`]] : [];
  }));

export const storyHasGame = (story: NormalizedStory | null): boolean => hasGameLayer(story) || hasChecks(story);

export function gameSlices(input: GameSliceInput): { game: GameView | null; gameAuthor: GameAuthorView | null } {
  const { story, state } = input;
  if (!story || !state || !storyHasGame(story)) return { game: null, gameAuthor: null };
  const composed = composer?.({
    story, state, boundaryLog: input.boundaryLog, checks: input.checks?.records ?? [], threads: input.threads, chat: input.chat, castNames: input.castNames, authorView: input.authorView,
    enabled: input.enabled, location: input.location ?? null,
    ...((story.widgets ?? []).some((widget) => widget.kind === "scene") ? { portraits: portraitsOf(story, input.characters ?? [], input.castNames) } : {}),
  }) ?? null;
  const reader = valueReader(state.blackboard.values);
  const gameAuthor: GameAuthorView | null = input.authorView ? {
    quests: (story.quests ?? []).map((quest) => ({ id: quest.id, title: quest.title, status: questStatus(quest, reader) })),
    scopeOverflow: scopeDropped(story, state, "quest", input.scopeContext),
    ...(story.codex ? { discoveryOverflow: scopeDropped(story, state, "discovery", input.scopeContext) } : {}),
    widgets: composed?.authorWidgets ?? [],
    provenance: composed?.provenance,
  } : null;
  return { game: composed?.player ?? null, gameAuthor };
}
