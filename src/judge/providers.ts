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

export interface JudgeProviderInfo {
  label: string;
  remote: boolean;
  notice: string;
  policyUrl?: string;
}

export const JUDGE_PROVIDERS: Record<JudgeProviderId, JudgeProviderInfo> = {
  typesafe: {
    label: "TypeSafe (Jev)",
    remote: true,
    notice: "Judge on: for each use routed here, the chat excerpts it lists are sent to TypeSafe.",
    policyUrl: "https://typesafe.ai/legal/privacy-policy",
  },
  "llama-logprob": {
    label: "llama-server (log-probabilities)",
    remote: false,
    notice: "Judge on: excerpts for uses routed here go to the configured llama-server, off this machine.",
  },
};

export const isJudgeProviderId = (value: unknown): value is JudgeProviderId => JUDGE_PROVIDER_IDS.includes(value as JudgeProviderId);

export interface JudgeProviderStatus {
  configured: boolean;
  local: boolean;
  host: string | null;
}

export const providerLeavesMachine = (id: JudgeProviderId, status: JudgeProviderStatus | null | undefined): boolean =>
  JUDGE_PROVIDERS[id].remote || status?.local !== true;
