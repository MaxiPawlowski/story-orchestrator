import {
  OFFER_REASON_MAX, OFFER_TEXT_MAX, OFFERS_MAX, checkRolledKey, questClosedKey, questRewardKey,
  type Checkpoint, type CheckpointOffer, type GateNode, type Quality, type Quest, type Transition, type ValidationError,
} from "../schema";
import { gateKeys } from "../gates";
import { checkWrittenKeys } from "../storyChecks";
import { isRecord } from "@utils/guards";
import { nearestKey } from "@utils/levenshtein";
import { runsAsCommand } from "@utils/string";
import { addError, asString, refuse, rejectUnknownKeys } from "./common";
import { GAME_ID_PATTERN } from "./checks";
import { readGate, validateGate } from "./gates";
import { placedChecks } from "./checkRefs";

const OFFER_KEYS = ["id", "text", "visible_when", "needs"] as const;
const NEEDS_KEYS = ["when", "reason"] as const;
const MACRO = /\{\{|\}\}/;

const readLine = (value: unknown, max: number, path: string, what: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (!text || text.length > max) return refuse(errors, path, `${what} is text of at most ${max} characters`, null);
  if (MACRO.test(text) || runsAsCommand(text)) return refuse(errors, path, `${what} is plain text: no macros, and no slash command`, null);
  return text;
};

const readNeeds = (value: unknown, path: string, errors: ValidationError[]): CheckpointOffer["needs"] | null => {
  if (!isRecord(value)) return refuse(errors, path, "needs is {when, reason}: the gate the offer waits for and the player's words for why", null);
  rejectUnknownKeys(value, NEEDS_KEYS, path, errors);
  const when = readGate(value.when, `${path}.when`, errors);
  const reason = readLine(value.reason, OFFER_REASON_MAX, `${path}.reason`, "the reason", errors);
  return when && reason ? { when, reason } : null;
};

const readOffer = (value: unknown, path: string, errors: ValidationError[]): CheckpointOffer | null => {
  if (!isRecord(value)) return refuse(errors, path, "an offer is {id, text, visible_when?, needs?}", null);
  rejectUnknownKeys(value, OFFER_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "an offer id is a lowercase slug");
  const text = readLine(value.text, OFFER_TEXT_MAX, `${path}.text`, "an offer's text", errors);
  const visible = value.visible_when === undefined ? undefined : readGate(value.visible_when, `${path}.visible_when`, errors);
  const needs = value.needs === undefined ? undefined : readNeeds(value.needs, `${path}.needs`, errors);
  if (!GAME_ID_PATTERN.test(id) || !text || visible === null || needs === null) return null;
  return { id, text, ...(visible ? { visible_when: visible } : {}), ...(needs ? { needs } : {}) };
};

export const readOffers = (value: unknown, path: string, errors: ValidationError[]): CheckpointOffer[] => {
  if (!Array.isArray(value)) return refuse(errors, path, "offers are a list of {id, text, visible_when?, needs?}", []);
  if (value.length > OFFERS_MAX) addError(errors, path, `a checkpoint has at most ${OFFERS_MAX} offers`);
  const offers = value.slice(0, OFFERS_MAX).map((entry, index) => readOffer(entry, `${path}.${index}`, errors)).filter((offer): offer is CheckpointOffer => offer !== null);
  const seen = new Set<string>();
  offers.forEach((offer, index) => {
    if (seen.has(offer.id)) addError(errors, `${path}.${index}.id`, `duplicate offer '${offer.id}'`);
    seen.add(offer.id);
  });
  return offers;
};

export const addOffers = (checkpoint: Checkpoint, value: unknown, path: string, errors: ValidationError[]) => {
  const offers = value === undefined ? [] : readOffers(value, `${path}.offers`, errors);
  if (offers.length) checkpoint.offers = offers;
};

const questKeys = (quests: readonly Quest[] | undefined): Set<string> => new Set((quests ?? []).flatMap((quest) => [questClosedKey(quest.id), questRewardKey(quest.id)]));

export const hiddenOutcomeKeys = (checkpoints: Checkpoint[], transitions: Transition[], qualities: readonly Quality[], quests?: readonly Quest[]): Set<string> => {
  const quest = questKeys(quests);
  const checks = placedChecks(checkpoints, transitions).flatMap(({ check }) => [...checkWrittenKeys(check), checkRolledKey(check.id)]);
  const latches = qualities.filter((quality) => quality.source === "code" && quality.latching && !quest.has(quality.key)).map((quality) => quality.key);
  return new Set([...checks, ...latches]);
};

const checkGate = (gate: GateNode, path: string, qualityByKey: Record<string, Quality>, errors: ValidationError[]): boolean => {
  const unknown = gateKeys(gate).filter((key) => !qualityByKey[key]);
  const known = Object.keys(qualityByKey);
  unknown.forEach((key) => {
    const hint = nearestKey(key, known);
    addError(errors, path, hint ? `unknown quality '${key}' (did you mean "${hint}"?)` : `unknown quality '${key}'`);
  });
  if (!unknown.length) validateGate(gate, qualityByKey, path, errors);
  return !unknown.length;
};

export const checkOffers = (checkpoints: Checkpoint[], transitions: Transition[], qualityByKey: Record<string, Quality>, errors: ValidationError[], quests?: readonly Quest[]) => {
  if (!checkpoints.some((checkpoint) => checkpoint.offers?.length)) return;
  const hidden = hiddenOutcomeKeys(checkpoints, transitions, Object.values(qualityByKey), quests);
  checkpoints.forEach((checkpoint, index) => (checkpoint.offers ?? []).forEach((offer, at) => {
    const path = `checkpoints.${index}.offers.${at}`;
    if (offer.visible_when) checkGate(offer.visible_when, `${path}.visible_when`, qualityByKey, errors);
    if (!offer.needs) return;
    if (!checkGate(offer.needs.when, `${path}.needs.when`, qualityByKey, errors)) return;
    gateKeys(offer.needs.when).filter((key) => hidden.has(key))
      .forEach((key) => addError(errors, `${path}.needs.when`, `needs reads '${key}', a hidden outcome (a check's result or a latch), so greying would show it; gate it on what the player can see`));
  }));
};
