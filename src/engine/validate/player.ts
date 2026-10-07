import {
  PLAYER_ASSUME_MAX_CHARS, PLAYER_ASSUMES_MAX, PLAYER_DESCRIPTION_MAX_CHARS, PLAYER_NAME_MAX_CHARS, PLAYER_NAME_MODES, PLAYER_ROLE_MAX_CHARS,
  PLAYER_SUMMARY_MAX_CHARS, type CardBinding, type PlayerName, type StoryPlayer, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, isOneOf, rejectUnknownKeys } from "./common";
import { readText } from "./briefing";

const PLAYER_KEYS = ["role", "summary", "name", "assumes", "suggested_description", "inject", "card"] as const;

const readName = (value: unknown, errors: ValidationError[]): PlayerName | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, "player.name", "name must be { mode, value? }");
  rejectUnknownKeys(value, ["mode", "value"], "player.name", errors);
  const mode = value.mode ?? "any";
  if (!isOneOf(mode, PLAYER_NAME_MODES)) return void addError(errors, "player.name.mode", `mode must be one of ${PLAYER_NAME_MODES.join(", ")}`);
  const named = mode === "any" ? undefined : readText(value.value, "player.name.value", PLAYER_NAME_MAX_CHARS, errors, true);
  return { mode, ...(named ? { value: named } : {}) };
};

const readAssumes = (value: unknown, errors: ValidationError[]): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    addError(errors, "player.assumes", "assumes must be a list of short lines");
    return [];
  }
  if (value.length > PLAYER_ASSUMES_MAX) addError(errors, "player.assumes", `assumes holds at most ${PLAYER_ASSUMES_MAX} lines`);
  return value.map((entry, index) => readText(entry, `player.assumes.${index}`, PLAYER_ASSUME_MAX_CHARS, errors)).filter((entry): entry is string => Boolean(entry));
};

const readCard = (value: unknown, errors: ValidationError[]): CardBinding | undefined => {
  if (value === undefined) return undefined;
  if (isRecord(value) && isRecord(value.fields)) return { fields: value.fields as CardBinding["fields"] };
  return void addError(errors, "player.card", "card must be { fields }");
};

export const readPlayer = (value: unknown, errors: ValidationError[]): StoryPlayer | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return void addError(errors, "player", "player must be an object");
  rejectUnknownKeys(value, PLAYER_KEYS, "player", errors);
  if (value.inject !== undefined && typeof value.inject !== "boolean") addError(errors, "player.inject", "inject must be true or false");
  const fields: StoryPlayer = {
    role: readText(value.role, "player.role", PLAYER_ROLE_MAX_CHARS, errors),
    summary: readText(value.summary, "player.summary", PLAYER_SUMMARY_MAX_CHARS, errors),
    name: readName(value.name, errors),
    assumes: readAssumes(value.assumes, errors),
    suggested_description: readText(value.suggested_description, "player.suggested_description", PLAYER_DESCRIPTION_MAX_CHARS, errors, false, true),
    inject: value.inject === false ? false : undefined,
    card: readCard(value.card, errors),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, entry]) => entry !== undefined && !(Array.isArray(entry) && !entry.length))) as StoryPlayer;
};
