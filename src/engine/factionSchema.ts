import type { DisplayBand } from "./gameSchema";
import type { GateNode } from "./schema";

export const FACTION_KEY_PREFIX = "rep_";
export const FACTION_HEARD_BY = ["present", "faction"] as const;
export type FactionHeardBy = (typeof FACTION_HEARD_BY)[number];
export const FACTIONS_MAX = 12;
export const FACTION_MOVES_MAX = 24;
export const FACTIONS_PER_MEMBER_MAX = 3;
export const FACTION_NAME_MAX = 60;
export const FACTION_RANGE_DEFAULT: [number, number] = [-5, 5];
export const FACTION_STANDING_GROUP = "Standing";

export interface FactionMove {
  id: string;
  when: GateNode;
  add: number;
  heard_by: FactionHeardBy;
}

export interface Faction {
  id: string;
  name: string;
  range: [number, number];
  start: number;
  bands: DisplayBand[];
  visible_when?: GateNode;
  introduce?: boolean;
  moves: FactionMove[];
}

export const standingKey = (faction: string): string => `${FACTION_KEY_PREFIX}${faction}`;
export const seenStandingKey = (faction: string, member: string): string => `${FACTION_KEY_PREFIX}${faction}_seen_${member}`;
export const factionMoveKey = (faction: string, move: string): string => `${FACTION_KEY_PREFIX}${faction}_move_${move}`;

export const isFactionKey = (key: string): boolean => key.startsWith(FACTION_KEY_PREFIX);
export const isFactionDerivedKey = (key: string): boolean => isFactionKey(key) && /_(seen|move)_/.test(key.slice(FACTION_KEY_PREFIX.length));

export const factionBand = (faction: Pick<Faction, "bands">, value: number): string =>
  faction.bands.find((band) => band.max === undefined || value <= band.max)?.label ?? faction.bands.at(-1)?.label ?? "";
