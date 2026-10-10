import type { JudgeTransport } from "./types";

export const JUDGE_PROVIDER_IDS = ["typesafe", "llama-logprob", "systemone-local"] as const;
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
    notice: "A configured TypeSafe key is consent: while the judge is on, each use routed here sends the chat excerpts it lists to TypeSafe. "
      + "To stop it, untick \"Use the judge\" or the use itself.",
    policyUrl: "https://typesafe.ai/legal/privacy-policy",
  },
  "llama-logprob": {
    label: "llama-server (log-probabilities)",
    remote: false,
    notice: "A configured llama-server off this machine is consent: while the judge is on, excerpts for uses routed here go to it. To stop it, untick \"Use the judge\" or the use itself.",
  },
  "systemone-local": {
    label: "Local judge (this machine)",
    remote: false,
    notice: "A configured local judge answers on this machine only: excerpts for uses routed here go to the server on 127.0.0.1 and nowhere else, "
      + "and the plugin refuses any other host. To stop it, untick \"Use the judge\" or the use itself.",
  },
};

export const isJudgeProviderId = (value: unknown): value is JudgeProviderId => JUDGE_PROVIDER_IDS.includes(value as JudgeProviderId);

export interface JudgeProviderStatus {
  configured: boolean;
  local: boolean;
  host: string | null;
  model?: string | null;
  modelsDir?: string | null;
  problem?: string | null;
}

export const providerLeavesMachine = (id: JudgeProviderId, status: JudgeProviderStatus | null | undefined): boolean =>
  JUDGE_PROVIDERS[id].remote || status?.local !== true;
