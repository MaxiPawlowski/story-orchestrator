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

const LIFE_FIELDS = ["relationships", "mood", "agenda", "schedule", "commitments", "cues", "topics"];

const listed = (value: unknown, key: string): boolean => Array.isArray(value) && value.some((entry) => isRecord(entry) && entry[key] !== undefined);

const TALK_PACING_KEYS = ["profile", "budget", "lead_words", "lead_max_consecutive", "spotlight", "address_player", "reaction"];
const REPLY_SCOPE_KEYS = ["id", "once_per", "cooldown_player_turns"];

const pacedCheckpoint = (cp: unknown): boolean => isRecord(cp)
  && ((isRecord(cp.talk_control) && TALK_PACING_KEYS.some((key) => (cp.talk_control as Record<string, unknown>)[key] !== undefined))
    || (isRecord(cp.effects) && REPLY_SCOPE_KEYS.some((key) => listed((cp.effects as Record<string, unknown>).npc_replies, key))));

const usesTalkPacing = (json: Record<string, unknown>): boolean =>
  json.talk_defaults !== undefined || (Array.isArray(json.checkpoints) ? json.checkpoints : []).some(pacedCheckpoint);

export const usesGameLayer = (json: Record<string, unknown>): boolean => usesTalkPacing(json) ||
  json.quests !== undefined || json.milestones !== undefined || json.widgets !== undefined || json.codex !== undefined || json.observations !== undefined || json.factions !== undefined
  || json.outcome !== undefined || json.carry_from !== undefined || listed(json.roster, "factions") || json.rumors !== undefined || json.patterns !== undefined
  || json.norms !== undefined || json.echoes !== undefined || json.polish !== undefined
  || listed(json.roster, "gossip") || listed(json.roster, "polish") || json.living !== undefined || listed(json.checkpoints, "stretch") || listed(json.checkpoints, "offers")
  || json.clock !== undefined || json.poses !== undefined || listed(json.roster, "sprites") || listed(json.checkpoints, "effects") &&
    (json.checkpoints as unknown[]).some((cp) => isRecord(cp) && isRecord(cp.effects) && (cp.effects.stage !== undefined || cp.effects.time !== undefined))
  || json.calendar !== undefined || LIFE_FIELDS.some((field) => listed(json.roster, field))
  || ([...(Array.isArray(json.roster) ? json.roster : []), json.player].some((member) => isRecord(member) && isRecord(member.card) && isRecord(member.card.fields) &&
    Object.values(member.card.fields).some((field) => isRecord(field) && ["layer", "rebase", "region"].some((key) => field[key] !== undefined))))
  || listed(json.qualities, "display") || listed(json.checkpoints, "checks") || listed(json.transitions, "check");
