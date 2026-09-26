import type { Checkpoint, NormalizedStoryV2 } from "@engine/index";
import type { WriteResult } from "@utils/writeResult";
import type { EffectLedgerRow } from "./types";

export interface EffectExtensionInput {
  story: NormalizedStoryV2;
  checkpoint: Checkpoint;
  path: string[];
  ledger: EffectLedgerRow[];
  mode: "activate" | "hydrate";
}

export interface EffectExtensionStep {
  effect: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  found?: Record<string, unknown> | null;
  write: () => Promise<WriteResult<object>>;
}

export interface EffectExtensionPlan {
  step: EffectExtensionStep | null;
  notes: Array<{ summary: string; detail: string }>;
}

export interface EffectExtension {
  name: string;
  plan: (input: EffectExtensionInput) => EffectExtensionPlan;
  read: () => Record<string, unknown> | null;
  restore: (before: Record<string, unknown> | null) => Promise<boolean>;
}

const registry = new Map<string, EffectExtension>();

export function registerEffectExtension(extension: EffectExtension): () => void {
  registry.set(extension.name, extension);
  return () => {
    if (registry.get(extension.name) === extension) registry.delete(extension.name);
  };
}

export const effectExtension = (name: string): EffectExtension | null => registry.get(name) ?? null;

export const effectExtensions = (): EffectExtension[] => [...registry.values()];
