import type { PrimitiveValue, QualityRoll } from "./schema";
import { isRecord } from "@utils/guards";

export type ChancePart = string | number;

export type ChanceRoll = QualityRoll;

const PART_SEPARATOR = "\u0000";

export const chanceSeed = (parts: ReadonlyArray<ChancePart>): number => {
  const text = parts.map(String).join(PART_SEPARATOR);
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
};

export const seededStream = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

export const unitDraw = (parts: ReadonlyArray<ChancePart>): number => seededStream(chanceSeed(parts))();

export const dieFace = (sides: number, unit: number): number => Math.min(sides, Math.floor(unit * sides) + 1);

export const readChanceRoll = (value: unknown): ChanceRoll | null => {
  if (!isRecord(value)) return null;
  const { sides, target } = value;
  if (typeof sides !== "number" || typeof target !== "number" || !Number.isInteger(sides) || !Number.isInteger(target)) return null;
  if (sides < 2 || target < 1 || target > sides) return null;
  return { sides, target };
};

export const rollOutcome = (roll: ChanceRoll, type: string, unit: number): PrimitiveValue | null => {
  const face = dieFace(roll.sides, unit);
  if (type === "bool") return face <= roll.target;
  if (type === "int") return face;
  return null;
};
