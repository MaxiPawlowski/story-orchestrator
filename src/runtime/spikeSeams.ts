import type { DerivedQualityView, PrimitiveValue } from "@engine/index";
import type { GenerationIntent } from "./generationLifecycle";

export interface SpikeSeams {
  derive?: (view: DerivedQualityView) => Array<{ q: string; v: PrimitiveValue }>;
  npcRoll?: (key: string) => number | null;
  talkRandom?: () => (() => number) | null;
  generation?: (intent: GenerationIntent) => void;
}

export const spikeSeams: SpikeSeams = {};

export const installSpikeSeams = (next: SpikeSeams): (() => void) => {
  Object.assign(spikeSeams, next);
  return () => {
    for (const key of Object.keys(next) as Array<keyof SpikeSeams>) if (spikeSeams[key] === next[key]) delete spikeSeams[key];
  };
};
