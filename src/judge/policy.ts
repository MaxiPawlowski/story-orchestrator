export const JUDGE_DEFAULT_MODEL = "jev-1.13.0";
export const JUDGE_DEFAULT_TIMEOUT_MS = 1500;
export const JUDGE_CALL_RING_LIMIT = 300;

export const DIRECTOR_ROLE_CONFIDENCE = 0.6;
export const DIRECTOR_LEAD_BONUS = 0.25;
export const DIRECTOR_ADDRESSED_WEIGHT = 2;
export const DIRECTOR_SILENCE = { nobody: 0.5, maxAddressed: 0.5 } as const;
export const DIRECTOR_TIMEOUT_MS = 1500;
