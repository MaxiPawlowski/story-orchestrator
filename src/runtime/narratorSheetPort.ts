import type { BoundaryLogEntry, EngineState, NormalizedStory } from "@engine/index";

type Kit = typeof import("./narratorSheet");

let kit: Kit | null = null;

export const loadNarratorSheet = async (): Promise<Kit> => (kit ??= await import("./narratorSheet"));

export const hasNarratedSheet = (story: NormalizedStory | null | undefined): boolean =>
  Boolean(story?.qualities?.some((quality) => quality.display?.public === true && quality.display.narrate !== false));

export const REQUESTED_BOUNDARIES_CAP = 32;

export const PATTERN_HINT_HEADER = "Already true of the party, from what the player has done "
  + "(show it in this reply through bodies, mood and the world's response; never state it as the cause of anything):";

export interface NarratorSheetDeps {
  story: () => NormalizedStory | null;
  state: () => EngineState | null;
  log: () => readonly BoundaryLogEntry[];
  chatId: () => string | null;
  refresh: () => void;
  hints?: () => string[];
}

export const deliveryFloor = (requested: readonly number[], boundary: number): number => {
  const earlier = requested.filter((at) => at < boundary);
  return earlier.length ? Math.max(...earlier) : boundary - 1;
};

export function createNarratorSheetPort(deps: NarratorSheetDeps) {
  let chat: string | null = null;
  let requested: number[] = [];
  const sync = (boundary: number) => {
    const id = deps.chatId();
    if (id !== chat) {
      chat = id;
      requested = [];
    }
    requested = requested.filter((at) => at <= boundary);
  };
  return {
    requested() {
      const state = deps.state();
      if (!state || !hasNarratedSheet(deps.story())) return;
      sync(state.boundary);
      if (!requested.includes(state.boundary)) requested = [...requested, state.boundary].slice(-REQUESTED_BOUNDARIES_CAP);
    },
    lines(rosterId: string): string[] {
      const story = deps.story();
      const state = deps.state();
      if (!story || !state || !story.roster.some((member) => member.id === rosterId && member.view === "omniscient")) return [];
      const hints = deps.hints?.() ?? [];
      const hinted = hints.length ? [PATTERN_HINT_HEADER, ...hints.map((hint) => `- ${hint}`)] : [];
      if (!hasNarratedSheet(story)) return hinted;
      if (!kit) {
        void loadNarratorSheet().then(() => deps.refresh());
        return hinted;
      }
      sync(state.boundary);
      const floor = deliveryFloor(requested, state.boundary);
      return [...kit.narratorLines(story, state, deps.log().filter((entry) => entry.boundary > floor && entry.boundary <= state.boundary)), ...hinted];
    },
  };
}
