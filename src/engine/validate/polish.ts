import { isRecord } from "@utils/guards";
import { POLISH_MODES, STORY_POLISH_KEYS, type StoryPolish } from "../polishSchema";
import type { ValidationError } from "../schema";
import { addError, isOneOf, rejectUnknownKeys } from "./common";
import { deliveryNames, readNarrationSheet } from "./delivery";

const hasNarrator = (json: Record<string, unknown>): boolean => Array.isArray(json.roster) && json.roster.some((member) => isRecord(member) && member.view === "omniscient");

export const storyPolishPart = (json: Record<string, unknown>, errors: ValidationError[]): { polish?: StoryPolish } => {
  const polish = readStoryPolish(json, errors);
  return polish ? { polish } : {};
};

export const readStoryPolish = (json: Record<string, unknown>, errors: ValidationError[]): StoryPolish | undefined => {
  const raw = json.polish;
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) { addError(errors, "polish", "polish must be an object: {mode?, narration?}"); return undefined; }
  rejectUnknownKeys(raw, STORY_POLISH_KEYS, "polish", errors);
  if (raw.mode !== undefined && !isOneOf(raw.mode, POLISH_MODES)) addError(errors, "polish.mode", `mode must be one of ${POLISH_MODES.join(", ")}`);
  const narration = readNarrationSheet(raw.narration, { path: "polish.narration", errors, names: deliveryNames(json) });
  if (narration && !hasNarrator(json)) addError(errors, "polish.narration", "a narration voice needs a narrator: a roster member with view omniscient");
  const polish: StoryPolish = {
    ...(isOneOf(raw.mode, POLISH_MODES) ? { mode: raw.mode } : {}),
    ...(narration ? { narration } : {}),
  };
  return Object.keys(polish).length ? polish : undefined;
};
