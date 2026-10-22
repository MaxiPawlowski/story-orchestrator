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

const LIFE_FIELDS = ["relationships", "mood", "agenda", "schedule", "commitments"];

const listed = (value: unknown, key: string): boolean => Array.isArray(value) && value.some((entry) => isRecord(entry) && entry[key] !== undefined);

export const usesGameLayer = (json: Record<string, unknown>): boolean =>
  json.quests !== undefined || json.milestones !== undefined || json.widgets !== undefined || json.codex !== undefined || json.observations !== undefined || json.factions !== undefined
  || json.outcome !== undefined || json.carry_from !== undefined || listed(json.roster, "factions") || json.rumors !== undefined || json.patterns !== undefined
  || listed(json.roster, "gossip") || listed(json.roster, "polish") || json.living !== undefined || listed(json.checkpoints, "stretch") || listed(json.checkpoints, "offers")
  || json.clock !== undefined || json.poses !== undefined || listed(json.roster, "sprites") || listed(json.checkpoints, "effects") &&
    (json.checkpoints as unknown[]).some((cp) => isRecord(cp) && isRecord(cp.effects) && (cp.effects.stage !== undefined || cp.effects.time !== undefined))
  || json.calendar !== undefined || LIFE_FIELDS.some((field) => listed(json.roster, field))
  || ([...(Array.isArray(json.roster) ? json.roster : []), json.player].some((member) => isRecord(member) && isRecord(member.card) && isRecord(member.card.fields) &&
    Object.values(member.card.fields).some((field) => isRecord(field) && ["layer", "rebase", "region"].some((key) => field[key] !== undefined))))
  || listed(json.qualities, "display") || listed(json.checkpoints, "checks") || listed(json.transitions, "check");
