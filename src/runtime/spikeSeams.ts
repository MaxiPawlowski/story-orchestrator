import type { GenerationIntent } from "./generationLifecycle";

export interface CarryInput {
  rosterId: string;
  name: string;
  rows: unknown[];
  players: string[];
  from: number;
}

export interface CarryResult {
  line: string;
  reason?: string;
  messageId?: number;
}

export interface SpikeSeams {
  generation?: (intent: GenerationIntent) => void;
  hold?: (type: string) => Promise<void>;
  ownsReread?: () => boolean;
  carry?: (input: CarryInput) => CarryResult;
}

export const spikeSeams: SpikeSeams = {};

export const installSpikeSeams = (next: SpikeSeams): (() => void) => {
  Object.assign(spikeSeams, next);
  return () => {
    for (const key of Object.keys(next) as Array<keyof SpikeSeams>) if (spikeSeams[key] === next[key]) delete spikeSeams[key];
  };
};
