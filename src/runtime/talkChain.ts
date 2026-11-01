import { TALK_CHAIN_MAX_CAP, TALK_CHAIN_MAX_DEFAULT, type TalkControl, type TalkControlChain } from "@engine/index";

export const DIRECTOR_MAX_TOKENS = 96;
export const DIRECTOR_WINDOW_MESSAGES = 8;

export interface TalkChainConfig {
  enabled: boolean;
  mode: "director" | "scripted";
  max: number;
  sequence: string[];
  stopOnTransition: boolean;
  holdExtraction: boolean;
  stopOnPlayer: boolean;
  yieldOnQuestion: boolean;
}

export const resolveChainConfig = (
  control: TalkControl,
  system: { enabled: boolean; max: number; stopOnTransition: boolean; holdExtraction: boolean },
): TalkChainConfig | null => {
  if (control.chain === false) return null;
  const chain: TalkControlChain = control.chain ?? {};
  const mode = chain.mode ?? "director";
  const max = Math.min(TALK_CHAIN_MAX_CAP, Math.max(1, chain.max ?? system.max ?? TALK_CHAIN_MAX_DEFAULT));
  return {
    enabled: system.enabled,
    mode,
    max,
    sequence: chain.sequence ?? [],
    stopOnTransition: chain.stop_on_transition ?? system.stopOnTransition,
    holdExtraction: chain.hold_extraction ?? system.holdExtraction,
    stopOnPlayer: chain.stop_on_player !== false,
    yieldOnQuestion: chain.yield_on_question !== false,
  };
};
