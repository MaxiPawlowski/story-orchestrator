export const JUDGE_DEFAULT_MODEL = "jev-1.13.0";
export const JUDGE_DEFAULT_TIMEOUT_MS = 1500;
export const JUDGE_CALL_RING_LIMIT = 300;
export const JUDGE_DEFAULT_MAX_IN_FLIGHT = 2;
export const JUDGE_BUSY_RETRY_MS = 600;
export const JUDGE_BUSY_RETRIES = 4;

// Docs.typesafe.ai/models — both aliases resolve to jev-1.13.0.
export const JUDGE_MODEL_IDS = {
  canonical: { "jev-1.13.0": "jev-1.13.0" } as Record<string, string>,
  floating: ["jev-latest", "jev-preview"] as readonly string[],
};

export type JudgeModelVerdict = "matched" | "resolved" | "mismatch" | "unknown";

export const isFloatingModel = (id: string | null | undefined): boolean => typeof id === "string" && JUDGE_MODEL_IDS.floating.includes(id.trim());

export function canonicalModel(id: string | null | undefined): string | null {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed || isFloatingModel(trimmed)) return null;
  return JUDGE_MODEL_IDS.canonical[trimmed] ?? trimmed;
}

export function modelVerdict(requested: string | null | undefined, answered: string | null | undefined): { verdict: JudgeModelVerdict; resolvedTo?: string } {
  const answer = canonicalModel(answered);
  if (!answer) return { verdict: "unknown" };
  if (isFloatingModel(requested)) return { verdict: "resolved", resolvedTo: answer };
  return { verdict: canonicalModel(requested) === answer ? "matched" : "mismatch" };
}

export const DIRECTOR_ROLE_CONFIDENCE = 0.6;
export const DIRECTOR_LEAD_BONUS = 0.25;
export const DIRECTOR_ADDRESSED_WEIGHT = 2;
export const DIRECTOR_SILENCE = { nobody: 0.5, maxAddressed: 0.5 } as const;
export const DIRECTOR_TIMEOUT_MS = 1500;

export const VERIFY_DROP_BELOW = 0.2;
export const VERIFY_DOWNWEIGHT_BELOW = 0.5;
export const VERIFY_MAX_LINES_PER_CALL = 64;
export const PAIR_MIN_CONFIDENCE = 0.6;
export const PAIR_TIMEOUT_MS = 3000;
export const VERIFY_TIMEOUT_MS = 3000;
export const PAIR_SAME_THING_BELOW = 0.5;
export const PAIR_MAX_PER_PASS = 32;
export const PAIR_CONCURRENCY = 8;
export const PAIR_JACCARD_FLOOR = 0.2;

export const SCENE_TRIGGER = 0.4;
export const SCENE_FIELD_CONFIDENCE = 0.6;
export const PRESENT_P = 0.7;
export const HEADING_P = 0.7;
export const SCENE_TIMEOUT_MS = 2500;
// How many consecutive failed reads before the tracker is withheld rather than presented as
// current. One miss is a blip on a busy backend; two in a row means nothing is confirming it.
export const SCENE_STALE_AFTER = 2;

export const LORE_MIN_P = 0.6;
export const LORE_TOP_K = 4;
export const LORE_MAX_TOP_K = 12;
export const LORE_CHUNK = 64;
export const LORE_CONTENT_CHARS = 600;
export const LORE_TIMEOUT_MS = 1500;

export const CURATOR_FILTER_TIMEOUT_MS = 4000;
export const CURATOR_FILTER_P = 0.2;
export const CURATOR_FILTER_MIN_ENTRIES = 12;

export const CONTINUITY_P = 0.7;
export const CONTINUITY_MAX_FACTS = 40;
export const CONTINUITY_MAX_NOTE_FACTS = 2;
export const CONTINUITY_TIMEOUT_MS = 4000;
export const AGENCY_SCORE = 2.5;
export const HOUSE_RULE_P = 0.7;
export const HOUSE_RULE_MAX_NOTE = 2;
export const WARDEN_MAX_RULES = 8;
export const WARDEN_LORE_P = 0.7;
export const WARDEN_MAX_LORE = 8;
export const WARDEN_LORE_MAX_NOTE = 2;
export const WARDEN_ARMS = ["combined", "separate"] as const;
export type WardenArm = (typeof WARDEN_ARMS)[number];
export const WARDEN_ARM: WardenArm = "combined";
export const BACKGROUND_CONFIDENCE = 0.6;
export const BACKGROUND_MAX_OPTIONS = 254;

export const EXTRACTION_CONFIDENCE = 0.8;
export const EXTRACTION_LATCHING_BUMP = 0.1;
export const STALL_TIMEOUT_MS = 4000;
export const STALL_DIRECT_P = 0.95;
export const STALL_GENUINE_P = 0.1;
// Raised from 2500 on live evidence: a real boundary read timed out and fell back,
// and calibration is 1684 ms for a smaller request. Both this and the warden are off the reply
// path, so a longer budget costs nothing a player can feel.
export const TYPED_TIMEOUT_MS = 5000;

export const CRITIC_CONTRADICTS_MAX = 0.3;
export const CRITIC_ADVANCES_MIN = 0.5;
export const CRITIC_NEW_CHARACTER_MAX = 0.5;
export const CRITIC_MAX_FACTS = 40;
export const CRITIC_TIMEOUT_MS = 2500;
export const CHAIN_WEIGHTS = { advances: 1, shape: 1, contradicts: 2, newCharacter: 1 } as const;
export const LOOKAHEAD_PREGEN_P = 0.7;
