import { JUDGE_PROVIDER_IDS, type JudgeProviderId } from "./providers";
import { AUTHOR_JUDGE_USES, BUILT_JUDGE_USES, judgeUseActive, routedProvider, type JudgeRouteKey, type JudgeSettings, type JudgeUseKey } from "./settings";

export const offeredJudgeUses = (uses: readonly JudgeUseKey[], authorView: boolean): JudgeUseKey[] =>
  uses.filter((use) => authorView || !AUTHOR_JUDGE_USES.includes(use));

export const judgeUseControlId = (use: JudgeUseKey): string => `so-judge-use-${use.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

export const judgeProvidersInUse = (settings: JudgeSettings, wardenEnabled: boolean): JudgeProviderId[] => {
  if (!settings.enabled) return [];
  const keys: JudgeRouteKey[] = [...BUILT_JUDGE_USES.filter((use) => judgeUseActive(settings, use)), ...(wardenEnabled ? ["warden" as const] : [])];
  return JUDGE_PROVIDER_IDS.filter((id) => keys.some((key) => routedProvider(settings, key) === id));
};
