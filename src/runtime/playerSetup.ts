import {
  carriesPlayerRoleLine, castCardName, fixedPlayerName, hasPlayerProfile, playerInjects, playerRoleLine, type NormalizedStoryV2, type StoryPlayer,
} from "@engine/index";
import { isRecord } from "@utils/guards";

export const PLAYER_SETUP_CHOICES = ["keep", "pick", "create", "skip"] as const;
export type PlayerSetupChoice = (typeof PLAYER_SETUP_CHOICES)[number];

export interface PlayerSetupRecord {
  pending: boolean;
  storyId?: string;
  version?: number;
  choice?: PlayerSetupChoice;
  avatarId?: string | null;
  name?: string;
  locked?: boolean;
  createdHash?: string;
  lockFailed?: string;
}

export interface PersonaEntry {
  avatarId: string;
  name: string;
}

export interface PersonaRead {
  avatarId: string | null;
  name: string;
  description: string;
  descriptionSent: boolean;
  lockedAvatarId: string | null;
  personas: PersonaEntry[];
  canCreate: boolean;
}

export const freshPlayerSetup = (): PlayerSetupRecord => ({ pending: true });

const RECORD_TYPES: Record<string, string> = { storyId: "string", version: "number", name: "string", locked: "boolean", createdHash: "string", lockFailed: "string" };

export const sanitizePlayerSetup = (value: unknown): PlayerSetupRecord | undefined => {
  if (!isRecord(value) || typeof value.pending !== "boolean") return undefined;
  const typed = Object.entries(value).filter(([key, entry]) => RECORD_TYPES[key] === typeof entry);
  const choice = PLAYER_SETUP_CHOICES.find((entry) => entry === value.choice);
  return {
    ...(Object.fromEntries(typed) as Partial<PlayerSetupRecord>), pending: value.pending, ...(choice ? { choice } : {}),
    ...(typeof value.avatarId === "string" || value.avatarId === null ? { avatarId: value.avatarId } : {}),
  };
};

export const identitySettled = (record: PlayerSetupRecord | undefined): boolean => !record?.pending;

export const setupNeedsPane = (story: NormalizedStoryV2 | null, enabled: boolean): boolean =>
  enabled && Boolean(story) && (hasPlayerProfile(story) || fixedPlayerName(story) !== null);

export interface PlayerSetupView {
  storyId: string;
  pending: boolean;
  needsPane: boolean;
  player: StoryPlayer | null;
  fixedName: string | null;
  current: PersonaEntry | null;
  personas: PersonaEntry[];
  canCreate: boolean;
  record: PlayerSetupRecord | null;
  lockedName: string | null;
  switched: boolean;
  injected: boolean;
  beforeFirstMessage: boolean;
  castClash: string | null;
  descriptionEmpty: boolean;
  injectOff: boolean;
}

export interface PlayerSetupSources {
  story: NormalizedStoryV2 | null;
  storyId: string | null;
  record: PlayerSetupRecord | undefined;
  persona: PersonaRead | null;
  enabled: boolean;
  beforeFirstMessage: boolean;
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

export const playerRoleBlock = (story: NormalizedStoryV2 | null, persona: Pick<PersonaRead, "description" | "descriptionSent" | "name"> | null): string | null => {
  const player = story?.player;
  if (!playerInjects(player)) return null;
  const line = playerRoleLine(player);
  return persona?.descriptionSent && carriesPlayerRoleLine(persona.description, line, persona.name) ? null : line;
};

export const personaSwitched = (record: PlayerSetupRecord | undefined, persona: PersonaRead | null): boolean =>
  Boolean(record && !record.pending && record.avatarId && persona?.avatarId && persona.avatarId !== record.avatarId);

export const playerSetupView = ({ story, storyId, record, persona, enabled, beforeFirstMessage }: PlayerSetupSources): PlayerSetupView | null => {
  if (!story || !storyId) return null;
  const player = story.player;
  const fixedName = fixedPlayerName(story);
  const current = persona?.avatarId ? { avatarId: persona.avatarId, name: persona.name } : null;
  const personas = persona?.personas ?? [];
  const locked = record?.avatarId ? personas.find((entry) => entry.avatarId === record.avatarId)?.name ?? record.name ?? null : record?.name ?? null;
  return {
    storyId,
    pending: Boolean(record?.pending),
    needsPane: setupNeedsPane(story, enabled),
    player: player ?? null,
    fixedName,
    current,
    personas: fixedName ? personas.filter((entry) => same(entry.name, fixedName)) : personas,
    canCreate: Boolean(persona?.canCreate),
    record: record ?? null,
    lockedName: record && !record.pending ? locked : null,
    switched: personaSwitched(record, persona),
    injected: playerRoleBlock(story, persona) !== null,
    beforeFirstMessage,
    castClash: persona?.name ? story.roster.map(castCardName).find((name) => same(name, persona.name)) ?? null : null,
    descriptionEmpty: Boolean(persona) && !persona?.description.trim(),
    injectOff: player?.inject === false,
  };
};


