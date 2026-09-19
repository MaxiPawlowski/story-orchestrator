export const JUDGE_DEFAULT_MODEL = "jev-1.13.0";
export const JUDGE_DEFAULT_TIMEOUT_MS = 1500;
export const JUDGE_CALL_RING_LIMIT = 300;

export const DIRECTOR_ROLE_CONFIDENCE = 0.6;
export const DIRECTOR_LEAD_BONUS = 0.25;
export const DIRECTOR_ADDRESSED_WEIGHT = 2;
export const DIRECTOR_SILENCE = { nobody: 0.5, maxAddressed: 0.5 } as const;
export const DIRECTOR_TIMEOUT_MS = 1500;

export const VERIFY_DROP_BELOW = 0.2;
export const VERIFY_DOWNWEIGHT_BELOW = 0.5;
export const VERIFY_MAX_LINES_PER_CALL = 64;
export const PAIR_MIN_CONFIDENCE = 0.6;
export const PAIR_SAME_THING_BELOW = 0.5;
export const PAIR_MAX_PER_PASS = 32;
export const PAIR_CONCURRENCY = 8;
export const PAIR_JACCARD_FLOOR = 0.2;

export const SCENE_TRIGGER = 0.4;
export const SCENE_FIELD_CONFIDENCE = 0.6;
export const PRESENT_P = 0.7;
export const HEADING_P = 0.7;
export const SCENE_TIMEOUT_MS = 2500;
