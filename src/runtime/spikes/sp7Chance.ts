import { chanceSeed, readChanceRoll, rollOutcome, seededStream, unitDraw, type ChanceRoll } from "@engine/chance";
import type { DerivedQualityView, PrimitiveValue } from "@engine/index";
import { isRecord } from "@utils/guards";
import type { SpikeSeams } from "../spikeSeams";

export interface ChanceIds {
  chatId: string;
  storyId: string;
}

export interface ChanceContext extends ChanceIds {
  boundary: number;
  raw: unknown;
}

export type ChanceDrawKind = "npc" | "talk";

export interface ChanceDraw extends ChanceIds {
  kind: ChanceDrawKind;
  key: string;
  boundary: number;
  unit: number;
}

export interface RollQuality {
  key: string;
  type: string;
  roll: ChanceRoll;
}

export const TALK_DRAW_KEY = "talk";

export const rollQualities = (raw: unknown): RollQuality[] => {
  if (!isRecord(raw) || !Array.isArray(raw.qualities)) return [];
  return raw.qualities.flatMap((quality): RollQuality[] => {
    if (!isRecord(quality) || quality.source !== "code" || typeof quality.key !== "string" || typeof quality.type !== "string") return [];
    const roll = readChanceRoll(quality.roll);
    return roll ? [{ key: quality.key, type: quality.type, roll }] : [];
  });
};

export const chanceGateValues = (raw: unknown, ids: ChanceIds, view: DerivedQualityView): Array<{ q: string; v: PrimitiveValue }> =>
  rollQualities(raw).flatMap(({ key, type, roll }) => {
    const value = rollOutcome(roll, type, unitDraw([ids.chatId, ids.storyId, view.checkpointStartedBoundary, key]));
    return value === null ? [] : [{ q: key, v: value }];
  });

export const npcRollDraw = (ids: ChanceIds, boundary: number, key: string): number => unitDraw([ids.chatId, ids.storyId, boundary, key]);

export const talkDrawStream = (ids: ChanceIds, boundary: number): (() => number) =>
  seededStream(chanceSeed([ids.chatId, ids.storyId, boundary, TALK_DRAW_KEY]));

export const createChanceSeams = (read: () => ChanceContext | null, record: (draw: ChanceDraw) => void = () => undefined): SpikeSeams => ({
  derive: (view) => {
    const context = read();
    return context ? chanceGateValues(context.raw, context, view) : [];
  },
  npcRoll: (key) => {
    const context = read();
    if (!context) return null;
    const unit = npcRollDraw(context, context.boundary, key);
    record({ kind: "npc", key, chatId: context.chatId, storyId: context.storyId, boundary: context.boundary, unit });
    return unit;
  },
  talkRandom: () => {
    const context = read();
    if (!context) return null;
    const stream = talkDrawStream(context, context.boundary);
    return () => {
      const unit = stream();
      record({ kind: "talk", key: TALK_DRAW_KEY, chatId: context.chatId, storyId: context.storyId, boundary: context.boundary, unit });
      return unit;
    };
  },
});
