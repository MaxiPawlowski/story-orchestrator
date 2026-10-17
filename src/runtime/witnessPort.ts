import type { NormalizedStoryV2 } from "@engine/index";
import type { SharedReadAudit } from "@extraction/index";
import { createWitness } from "@memory/witness/state";
import type { WitnessRecordState } from "@memory/witness/types";
import type { RuntimeExtras } from "./types";

declare module "./types" {
  interface RuntimeExtras {
    witness?: WitnessRecordState;
  }
}

type RecordKit = typeof import("@memory/witness/record");

export interface WitnessPortDeps {
  getStory: () => NormalizedStoryV2 | null;
  extras: () => RuntimeExtras;
  enabledIds: () => string[];
}

export interface WitnessPort {
  enabled: () => boolean;
  present: () => string[] | null;
  ready: (audit: SharedReadAudit) => Promise<unknown>;
  apply: (audit: SharedReadAudit) => void;
  outage: (window: { from: number; to: number }) => void;
  state: () => WitnessRecordState;
  kit: () => Promise<RecordKit>;
}

let kit: RecordKit | null = null;

const loadKit = async (): Promise<RecordKit> => (kit ??= await import("@memory/witness/record"));

export function createWitnessPort(deps: WitnessPortDeps): WitnessPort {
  const state = () => deps.extras().witness ?? createWitness();
  const enabled = () => Boolean(deps.getStory()) && deps.extras().memory.settings.witness !== false;
  const write = (next: WitnessRecordState) => { deps.extras().witness = next; };
  return {
    enabled,
    state,
    kit: loadKit,
    present: () => {
      if (!enabled()) return null;
      if (!kit) void loadKit();
      return deps.enabledIds();
    },
    ready: (audit) => (audit.witness && enabled() ? loadKit() : Promise.resolve(null)),
    apply: (audit) => { if (audit.witness && kit && enabled()) write(kit.acceptWitnessRead(state(), audit.id, audit.witness)); },
    outage: (window) => {
      const readId = `outage:${window.from}:${window.to}:${state().reads.length}`;
      if (kit && enabled()) write(kit.acceptWitnessRead(state(), readId, { status: "outage", inputRange: { ...window, revisions: [] }, claims: [] }));
    },
  };
}
