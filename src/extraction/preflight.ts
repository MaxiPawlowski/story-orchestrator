import type { ContextLimit } from "./inputBudget";

export const PREFLIGHT_MAX_REQUESTS = 3;
export const PREFLIGHT_LIMIT_SHARE = 0.5;

export interface Preflight {
  requests: number;
  tokens: number;
}

export type PreflightConfirm = (preflight: Preflight) => Promise<boolean>;

export const preflightNeeded = (preflight: Preflight, contextLimit: ContextLimit): boolean =>
  preflight.requests > PREFLIGHT_MAX_REQUESTS || preflight.tokens > contextLimit.value * PREFLIGHT_LIMIT_SHARE;

export const preflightMessage = (preflight: Preflight, profile: string): string =>
  `${preflight.requests} ${preflight.requests === 1 ? "request" : "requests"}, about ${Math.round(preflight.tokens).toLocaleString("en-US")} tokens to ${profile}. Send them?`;
