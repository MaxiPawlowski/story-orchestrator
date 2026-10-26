import {
  NPC_REPLY_SCOPES, TALK_ATTEMPTS_CAP, TALK_BUDGET_CAP, TALK_LEAD_WORDS_MAX, TALK_LEAD_WORDS_MIN, TALK_PROFILES, TALK_TURNS_CAP,
  type NpcReplyEffect, type StoryTalkDefaults, type TalkAddressPlayer, type TalkBudget, type TalkControl, type TalkReaction, type TalkSpotlight, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, isOneOf, rejectUnknownKeys } from "./common";

const BUDGET_KEYS = ["voices", "attempts"] as const;
const SPOTLIGHT_KEYS = ["quiet_after", "members"] as const;
const ADDRESS_KEYS = ["after_player_turns", "by", "cooldown_player_turns"] as const;
const REACTION_KEYS = ["members"] as const;
const DEFAULTS_KEYS = ["profile", "budget"] as const;

const wholeIn = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const readWhole = (value: unknown, min: number, max: number, path: string, errors: ValidationError[]): number | undefined => {
  if (value === undefined) return undefined;
  if (wholeIn(value, min, max)) return value;
  addError(errors, path, `must be a whole number from ${min} to ${max}`);
  return undefined;
};

const readMembers = (value: unknown, path: string, errors: ValidationError[]): string[] | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim())) return value as string[];
  addError(errors, path, "must be a list of member names");
  return undefined;
};

export const readTalkBudget = (value: unknown, path: string, errors: ValidationError[]): TalkBudget | undefined => {
  if (!isRecord(value)) {
    addError(errors, path, "budget must be an object { voices, attempts }");
    return undefined;
  }
  rejectUnknownKeys(value, BUDGET_KEYS, path, errors);
  const voices = readWhole(value.voices, 1, TALK_BUDGET_CAP, `${path}.voices`, errors);
  const attempts = readWhole(value.attempts, 1, TALK_ATTEMPTS_CAP, `${path}.attempts`, errors);
  if (voices !== undefined && attempts !== undefined && attempts < voices) addError(errors, `${path}.attempts`, "attempts may not be below voices: every rendered voice is an attempt");
  return { ...(voices !== undefined ? { voices } : {}), ...(attempts !== undefined ? { attempts } : {}) };
};

const readProfile = (value: unknown, path: string, errors: ValidationError[]) => {
  if (value === undefined) return undefined;
  if (isOneOf(value, TALK_PROFILES)) return value;
  addError(errors, path, `profile must be one of ${TALK_PROFILES.join(", ")}`);
  return undefined;
};

const readSpotlight = (value: unknown, path: string, errors: ValidationError[]): TalkSpotlight | false | undefined => {
  if (value === false) return false;
  if (!isRecord(value)) {
    addError(errors, path, "spotlight must be an object or false");
    return undefined;
  }
  rejectUnknownKeys(value, SPOTLIGHT_KEYS, path, errors);
  const quiet = readWhole(value.quiet_after, 1, TALK_TURNS_CAP, `${path}.quiet_after`, errors);
  const members = readMembers(value.members, `${path}.members`, errors);
  return { ...(quiet !== undefined ? { quiet_after: quiet } : {}), ...(members ? { members } : {}) };
};

const readAddress = (value: unknown, path: string, errors: ValidationError[]): TalkAddressPlayer | false | undefined => {
  if (value === false) return false;
  if (!isRecord(value)) {
    addError(errors, path, "address_player must be an object or false");
    return undefined;
  }
  rejectUnknownKeys(value, ADDRESS_KEYS, path, errors);
  const after = readWhole(value.after_player_turns, 0, TALK_TURNS_CAP, `${path}.after_player_turns`, errors);
  if (value.after_player_turns === undefined) addError(errors, `${path}.after_player_turns`, "after_player_turns is required");
  const cooldown = readWhole(value.cooldown_player_turns, 0, TALK_TURNS_CAP, `${path}.cooldown_player_turns`, errors);
  const by = value.by === undefined || value.by === "relevant_member" ? value.by : readMembers(value.by, `${path}.by`, errors);
  if (after === undefined) return undefined;
  return { after_player_turns: after, ...(by !== undefined ? { by } : {}), ...(cooldown !== undefined ? { cooldown_player_turns: cooldown } : {}) };
};

const readReaction = (value: unknown, path: string, errors: ValidationError[]): TalkReaction | false | undefined => {
  if (value === false) return false;
  if (value === true) return {};
  if (!isRecord(value)) {
    addError(errors, path, "reaction must be true, false or { members }");
    return undefined;
  }
  rejectUnknownKeys(value, REACTION_KEYS, path, errors);
  const members = readMembers(value.members, `${path}.members`, errors);
  return members ? { members } : {};
};

export const readTalkPacing = (value: Record<string, unknown>, path: string, errors: ValidationError[]): Partial<TalkControl> => {
  const control: Partial<TalkControl> = {};
  const profile = readProfile(value.profile, `${path}.profile`, errors);
  if (profile) control.profile = profile;
  if (value.budget !== undefined) {
    const budget = readTalkBudget(value.budget, `${path}.budget`, errors);
    if (budget) control.budget = budget;
  }
  const words = readWhole(value.lead_words, TALK_LEAD_WORDS_MIN, TALK_LEAD_WORDS_MAX, `${path}.lead_words`, errors);
  if (words !== undefined) control.lead_words = words;
  const spotlight = value.spotlight === undefined ? undefined : readSpotlight(value.spotlight, `${path}.spotlight`, errors);
  if (spotlight !== undefined) control.spotlight = spotlight;
  const address = value.address_player === undefined ? undefined : readAddress(value.address_player, `${path}.address_player`, errors);
  if (address !== undefined) control.address_player = address;
  const reaction = value.reaction === undefined ? undefined : readReaction(value.reaction, `${path}.reaction`, errors);
  if (reaction !== undefined) control.reaction = reaction;
  return control;
};

export const readTalkDefaults = (value: unknown, errors: ValidationError[]): StoryTalkDefaults | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    addError(errors, "talk_defaults", "talk_defaults must be an object { profile, budget }");
    return undefined;
  }
  rejectUnknownKeys(value, DEFAULTS_KEYS, "talk_defaults", errors);
  const profile = readProfile(value.profile, "talk_defaults.profile", errors);
  const budget = value.budget === undefined ? undefined : readTalkBudget(value.budget, "talk_defaults.budget", errors);
  const defaults = { ...(profile ? { profile } : {}), ...(budget && Object.keys(budget).length ? { budget } : {}) };
  return Object.keys(defaults).length ? defaults : undefined;
};

export const readReplyScope = (entry: Record<string, unknown>, path: string, errors: ValidationError[]): Pick<NpcReplyEffect, "id" | "once_per" | "cooldown_player_turns"> => {
  if (entry.id !== undefined && (typeof entry.id !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(entry.id))) {
    addError(errors, `${path}.id`, "id is 1 to 64 letters, digits, _ . : or -");
  }
  if (entry.once_per !== undefined && !isOneOf(entry.once_per, NPC_REPLY_SCOPES)) addError(errors, `${path}.once_per`, `once_per must be one of ${NPC_REPLY_SCOPES.join(", ")}`);
  const cooldown = readWhole(entry.cooldown_player_turns, 0, TALK_TURNS_CAP, `${path}.cooldown_player_turns`, errors);
  return {
    ...(typeof entry.id === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(entry.id) ? { id: entry.id } : {}),
    ...(isOneOf(entry.once_per, NPC_REPLY_SCOPES) ? { once_per: entry.once_per } : {}),
    ...(cooldown !== undefined ? { cooldown_player_turns: cooldown } : {}),
  };
};

export const npcReplyId = (reply: Pick<NpcReplyEffect, "id" | "trigger" | "member">, index: number): string => reply.id ?? `${reply.trigger}:${reply.member}:${index}`;

export const checkReplyIds = (replies: readonly NpcReplyEffect[], path: string, errors: ValidationError[]) => {
  const seen = new Map<string, number>();
  replies.forEach((reply, index) => {
    const id = npcReplyId(reply, index);
    if (seen.has(id)) addError(errors, `${path}.${index}.id`, `npc reply id "${id}" is already used by reply ${seen.get(id)}`);
    else seen.set(id, index);
  });
};
