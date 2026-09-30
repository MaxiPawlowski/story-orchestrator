import type { JudgeTransport } from "./types";

export const JUDGE_PROVIDER_IDS = ["typesafe", "llama-logprob"] as const;
export type JudgeProviderId = (typeof JUDGE_PROVIDER_IDS)[number];

export const DEFAULT_JUDGE_PROVIDER: JudgeProviderId = "typesafe";

export type DecisionContract = "native" | "logprob" | "verbalized";

export interface DecisionProvider {
  id: JudgeProviderId;
  contract: DecisionContract;
  ask: JudgeTransport;
}

export type JudgeProviderReach = "remote" | "by-host";

export interface JudgeProviderInfo {
  label: string;
  contract: DecisionContract;
  reach: JudgeProviderReach;
  needsKey: boolean;
  notice: string;
  policyUrl: string | null;
}

export const JUDGE_PROVIDERS: Record<JudgeProviderId, JudgeProviderInfo> = {
  typesafe: {
    label: "TypeSafe (Jev)",
    contract: "native",
    reach: "remote",
    needsKey: true,
    notice: "Judge on: for each use routed here, the chat excerpts it lists are sent to TypeSafe.",
    policyUrl: "https://typesafe.ai/legal/privacy-policy",
  },
  "llama-logprob": {
    label: "llama-server (log-probabilities)",
    contract: "logprob",
    reach: "by-host",
    needsKey: false,
    notice: "Judge on: for each use routed here, the chat excerpts it lists are sent to the llama-server the SillyTavern server is configured with, which is not on this machine.",
    policyUrl: null,
  },
};

export const isJudgeProviderId = (value: unknown): value is JudgeProviderId => typeof value === "string" && (JUDGE_PROVIDER_IDS as readonly string[]).includes(value);

export interface JudgeProviderStatus {
  configured: boolean;
  keySource: string | null;
  local: boolean;
  host: string | null;
}

export const providerLeavesMachine = (id: JudgeProviderId, status: JudgeProviderStatus | null | undefined): boolean =>
  JUDGE_PROVIDERS[id].reach === "remote" || status?.local !== true;
