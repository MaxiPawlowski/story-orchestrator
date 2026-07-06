import { INJECTION_REGISTRY, MEMORY_INJECTION_KEY_PREFIX } from "./injectionRegistry";

export const DEFAULT_INTERVAL_TURNS = 3;
export const DEFAULT_TENSION_EMA_ALPHA = 0.3;
export const DEFAULT_PACING_DRIFT_THRESHOLD = 0.3;
export const PACING_HINT_EXTENSION_KEY = INJECTION_REGISTRY.pacing.key;
export const PACING_HINT_DEPTH = INJECTION_REGISTRY.pacing.depth;

export { MEMORY_INJECTION_KEY_PREFIX };
export const MEMORY_TIER_INJECTION_DEPTHS = {
  facts: INJECTION_REGISTRY.memoryFacts.depth,
  session_details: INJECTION_REGISTRY.memorySessionDetails.depth,
  short_term: INJECTION_REGISTRY.memoryShortTerm.depth,
  scene_history: INJECTION_REGISTRY.memorySceneHistory.depth,
} as const;

export const EPISTEMIC_INJECTION_KEY = INJECTION_REGISTRY.epistemic.key;
export const LEDGER_INJECTION_KEY = INJECTION_REGISTRY.ledger.key;
export const EPISTEMIC_INJECTION_DEPTH = INJECTION_REGISTRY.epistemic.depth;
export const LEDGER_INJECTION_DEPTH = INJECTION_REGISTRY.ledger.depth;
export const COPILOT_NUDGE_KEY = INJECTION_REGISTRY.copilotNudge.key;

export const AUTHOR_NOTE_DEFAULT_INTERVAL = 1;
export const AUTHOR_NOTE_DEFAULT_DEPTH = 4;
export const AUTHOR_NOTE_DISABLED_FREQUENCY = 0;
export const AUTHOR_NOTE_DEFAULT_POSITION = "chat" as const;
export const AUTHOR_NOTE_DEFAULT_ROLE = "system" as const;

export const AUTHOR_NOTE_LOG_SAMPLE_LIMIT = 80;
