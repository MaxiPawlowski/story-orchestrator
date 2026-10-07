import type { GAME_LAYER } from "./gameLayerImpl";
import { isRecord } from "@utils/guards";

export type GameLayer = typeof GAME_LAYER;

let layer: GameLayer | null = null;

export const GAME_LAYER_LOADING = "this story uses quests, checks, story panels or character life, and that part of the extension has not loaded yet; reload the page and try again";

export const installGameLayer = (next: GameLayer): void => {
  layer = next;
};

export const gameLayer = (): GameLayer | null => layer;

export const loadGameLayer = async (): Promise<GameLayer> => {
  if (!layer) installGameLayer((await import("./gameLayerImpl")).GAME_LAYER);
  return layer as GameLayer;
};

const LIFE_FIELDS = ["relationships", "mood", "agenda", "schedule"];

const listed = (value: unknown, key: string): boolean => Array.isArray(value) && value.some((entry) => isRecord(entry) && entry[key] !== undefined);

export const usesGameLayer = (json: Record<string, unknown>): boolean =>
  json.quests !== undefined || json.milestones !== undefined || json.widgets !== undefined
  || json.clock !== undefined || LIFE_FIELDS.some((field) => listed(json.roster, field))
  || listed(json.qualities, "display") || listed(json.checkpoints, "checks") || listed(json.transitions, "check");
