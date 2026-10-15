import type { NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import type { CarrySlice, CarryView } from "@engine/carrySchema";
import { gameLayer } from "@engine/validate/gameLayer";
import type { ManagerPort } from "./managerWiring";
import type { RuntimeExtras } from "./types";

export type { CarryView };

export interface CarryCandidateRow {
  chatId: string;
  title: string;
  endingTitle: string;
  endedAt: string;
}

export type CarryOutcome = { ok: true } | { ok: false; reason: string };

export const carrySlice = (story: NormalizedStoryV2 | null, extras: RuntimeExtras, boundary: number): CarryView | null =>
  (story && gameLayer()?.carry.carryView(story, extras, boundary)) || null;

export const carryStartSeed = (story: NormalizedStoryV2, extras: RuntimeExtras, journal: (summary: string, note: string) => void): Record<string, PrimitiveValue> =>
  gameLayer()?.carry.startSeed(story, extras, journal) ?? {};

type CarryUnit = typeof import("./carryUnit");

export const createCarryActions = (port: ManagerPort, refresh: () => void) => {
  const run = <T,>(use: (unit: CarryUnit, deps: ReturnType<CarryUnit["carryDeps"]>) => Promise<T>): Promise<T> =>
    import("./carryUnit").then((unit) => use(unit, unit.carryDeps(port, refresh)));
  return {
    candidates: (): Promise<CarryCandidateRow[]> => run((unit, deps) => unit.carryCandidates(deps)),
    pick: (chatId: string): Promise<CarryOutcome> => run((unit, deps) => unit.pickCarry(deps, chatId)),
    decline: (): Promise<CarryOutcome> => run((unit, deps) => unit.declineCarry(deps)),
    dismiss: (): Promise<CarryOutcome> => run((unit, deps) => unit.dismissPreviously(deps)),
  };
};

export type CarryActions = ReturnType<typeof createCarryActions>;

declare module "./types" {
  interface RuntimeExtras {
    carry?: CarrySlice;
  }
  interface RuntimeSnapshot {
    carry?: CarryView | null;
  }
}
