import { TENSION_CURRENT_KEY, type EngineState, type TensionLevel } from "@engine/index";
import { numericToLevel } from "@pacing/index";

export interface LivingInputs {
  canon: string;
  openThreads: string[];
  resolvedThreads: string[];
  plans: string[];
  refused: string | null;
  playerNames: string[];
  tension: TensionLevel | null;
  restatesSecret: (text: string) => boolean;
  scrub: (text: string) => string;
}

export interface LivingInputSources {
  memory: {
    injector: { restingFilter: () => (text: string) => string };
    canon: { getCanon: () => string };
    getOpenArcs: () => string[];
    getArcs: () => ReadonlyArray<{ status: string; text: string; summary?: string }>;
  };
  state: () => EngineState | null;
  refused: () => string | null;
  playerName: () => string;
}

const RESOLVED_SHOWN = 10;

export function livingInputs(sources: LivingInputSources): LivingInputs {
  const resting = sources.memory.injector.restingFilter();
  const shown = (texts: readonly string[]) => texts.map((text) => resting(text).trim()).filter(Boolean);
  const tension = sources.state()?.blackboard.values[TENSION_CURRENT_KEY];
  const player = sources.playerName().trim();
  return {
    canon: sources.memory.canon.getCanon(),
    openThreads: shown(sources.memory.getOpenArcs()),
    resolvedThreads: shown(sources.memory.getArcs().filter((arc) => arc.status === "resolved").slice(-RESOLVED_SHOWN).map((arc) => arc.summary ?? arc.text)),
    plans: [],
    refused: sources.refused(),
    playerNames: player ? [player] : [],
    tension: typeof tension === "number" ? numericToLevel(tension) : null,
    restatesSecret: (text) => resting(text).trim() !== text.trim(),
    scrub: resting,
  };
}
