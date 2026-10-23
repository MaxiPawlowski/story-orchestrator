import {
  CUES_MAX, CUE_KEY_PREFIX, CUE_MAX_OFFERS_LIMIT, CUE_TEXT_MAX, CUE_WINDOW_MAX, NORMS_MAX, TOPICS_MAX, TOPIC_KEYS_MAX, TOPIC_KEY_PREFIX, TOPIC_TIERS_MAX,
  cueAtKey, cueLandedKey, normAtKey, normSeenKey, topicKey,
  type MemberCue, type MemberTopic, type StoryNorm, type TopicTier,
} from "../cueSchema";
import type { GateNode, LifeMember, PrimitiveValue, Quality, StoryLife, ValidationError } from "../schema";
import { gateKeys } from "../gates";
import { isRecord } from "@utils/guards";
import { addError, asString, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { inactionProblem } from "./factions";

const CUE_KEYS = ["id", "kind", "when", "cue", "lane", "priority", "window", "repeat", "landed_when", "max_offers"] as const;
const TOPIC_KEYS = ["id", "keys", "tiers", "priority"] as const;
const TIER_KEYS = ["cue", "when"] as const;
const NORM_KEYS = ["id", "label", "broken_when", "noticed_by", "cue", "priority", "checkpoints"] as const;
const CUE_ID = /^[a-z0-9][a-z0-9-]{0,23}$/;
const MACRO = /\{\{|\}\}/;
const PRIORITY_MAX = 100;
const COOLDOWN_MAX = 50;
const TOPIC_TERM_MAX = 40;
const NORM_LABEL_MAX = 80;
export const CUE_NEEDS_EVENT = "cue-needs-event";

const isWhole = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

const readId = (value: unknown, path: string, what: string, errors: ValidationError[]): string | null => {
  const id = asString(value)?.trim() ?? "";
  return CUE_ID.test(id) ? id : refuse(errors, path, `${what} id is lowercase letters, digits and - (no _)`, null);
};

const readCueText = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (!text || text.length > CUE_TEXT_MAX) return refuse(errors, path, `a cue is plain text of at most ${CUE_TEXT_MAX} characters`, null);
  return MACRO.test(text) ? refuse(errors, path, "plain text only: macros are not expanded", null) : text;
};

const readPriority = (value: unknown, path: string, errors: ValidationError[]): number | undefined => (value === undefined ? undefined
  : isWhole(value, -PRIORITY_MAX, PRIORITY_MAX) ? value : refuse(errors, path, `priority is a whole number from -${PRIORITY_MAX} to ${PRIORITY_MAX}`, undefined));

const readOptionalGate = (value: unknown, path: string, errors: ValidationError[]): GateNode | undefined =>
  (value === undefined ? undefined : readGate(value, path, errors) ?? undefined);

const readList = <T extends { id: string },>(value: unknown, path: string, max: number, what: string, read: (entry: unknown, at: string) => T | null, errors: ValidationError[]): T[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return refuse(errors, path, `${what} are a list`, undefined);
  if (value.length > max) addError(errors, path, `at most ${max} ${what}`);
  const list = value.map((entry, index) => read(entry, `${path}.${index}`)).filter((entry): entry is T => entry !== null);
  list.forEach((entry, index) => { if (list.findIndex((other) => other.id === entry.id) !== index) addError(errors, `${path}.${index}.id`, `a second ${what.replace(/s$/, "")} '${entry.id}'`); });
  return list.length ? list : undefined;
};

const mustFields = (value: Record<string, unknown>, path: string, must: boolean, errors: ValidationError[]): Pick<MemberCue, "landed_when" | "max_offers"> => {
  if (!must) {
    if (value.landed_when !== undefined) addError(errors, `${path}.landed_when`, "landed_when is for a must cue (lane: must)");
    if (value.max_offers !== undefined) addError(errors, `${path}.max_offers`, "max_offers is for a must cue (lane: must)");
    return {};
  }
  const landed = value.landed_when === undefined ? refuse(errors, `${path}.landed_when`, "a must cue needs landed_when: the event that shows it was said", undefined)
    : readOptionalGate(value.landed_when, `${path}.landed_when`, errors);
  const max = value.max_offers === undefined ? undefined : isWhole(value.max_offers, 1, CUE_MAX_OFFERS_LIMIT)
    ? value.max_offers : refuse(errors, `${path}.max_offers`, `max_offers is a whole number from 1 to ${CUE_MAX_OFFERS_LIMIT}`, undefined);
  return { ...(landed ? { landed_when: landed } : {}), ...(max !== undefined ? { max_offers: max } : {}) };
};

const readCue = (value: unknown, path: string, errors: ValidationError[]): MemberCue | null => {
  if (!isRecord(value)) return refuse(errors, path, "a cue is {id, kind, when, cue}", null);
  rejectUnknownKeys(value, CUE_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, "a cue", errors);
  const kind = value.kind === "remark" || value.kind === "reaction" ? value.kind : refuse(errors, `${path}.kind`, "kind is remark or reaction", null);
  const when = value.when === undefined ? refuse(errors, `${path}.when`, "a cue needs when", null) : readGate(value.when, `${path}.when`, errors);
  const cue = readCueText(value.cue, `${path}.cue`, errors);
  if (value.lane !== undefined && value.lane !== "must" && value.lane !== "may") addError(errors, `${path}.lane`, "lane is must or may");
  const must = value.lane === "must";
  const priority = readPriority(value.priority, `${path}.priority`, errors);
  if (value.window !== undefined && kind !== "reaction") addError(errors, `${path}.window`, "window is for a reaction; a remark lasts while its gate holds");
  const window = value.window === undefined ? undefined : isWhole(value.window, 1, CUE_WINDOW_MAX)
    ? value.window : refuse(errors, `${path}.window`, `window is a whole number of turns from 1 to ${CUE_WINDOW_MAX}`, undefined);
  const repeat = value.repeat === undefined ? undefined : isRecord(value.repeat) && Object.keys(value.repeat).length === 1 && isWhole(value.repeat.cooldown, 1, COOLDOWN_MAX)
    ? { cooldown: value.repeat.cooldown } : refuse(errors, `${path}.repeat`, `repeat is {cooldown: 1 to ${COOLDOWN_MAX}}`, undefined);
  if (repeat && must) addError(errors, `${path}.repeat`, "a must cue repeats until it lands (max_offers); repeat is for a may cue");
  const extra = mustFields(value, path, must, errors);
  if (!id || !kind || !when || !cue) return null;
  return {
    id, kind, when, cue, ...(must ? { lane: "must" as const } : {}), ...(priority !== undefined ? { priority } : {}), ...(window !== undefined && kind === "reaction" ? { window } : {}),
    ...(repeat && !must ? { repeat } : {}), ...extra,
  };
};

const readTier = (value: unknown, path: string, errors: ValidationError[]): TopicTier | null => {
  if (!isRecord(value)) return refuse(errors, path, "a tier is {cue, when?}", null);
  rejectUnknownKeys(value, TIER_KEYS, path, errors);
  const cue = readCueText(value.cue, `${path}.cue`, errors);
  const when = readOptionalGate(value.when, `${path}.when`, errors);
  return cue ? { cue, ...(when ? { when } : {}) } : null;
};

const readTopicKeys = (value: unknown, path: string, errors: ValidationError[]): string[] => {
  const keys = Array.isArray(value) ? value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean) : [];
  if (!Array.isArray(value) || !keys.length || keys.length !== value.length || keys.length > TOPIC_KEYS_MAX || keys.some((key) => key.length > TOPIC_TERM_MAX)) {
    addError(errors, path, `keys are 1 to ${TOPIC_KEYS_MAX} words or short phrases the player says, each at most ${TOPIC_TERM_MAX} characters`);
  }
  return [...new Set(keys.filter((key) => key.length <= TOPIC_TERM_MAX))].slice(0, TOPIC_KEYS_MAX);
};

const readTopic = (value: unknown, path: string, errors: ValidationError[]): MemberTopic | null => {
  if (!isRecord(value)) return refuse(errors, path, "a topic is {id, keys, tiers}", null);
  rejectUnknownKeys(value, TOPIC_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, "a topic", errors);
  const keys = readTopicKeys(value.keys, `${path}.keys`, errors);
  const tiers = Array.isArray(value.tiers) && value.tiers.length >= 1 && value.tiers.length <= TOPIC_TIERS_MAX
    ? value.tiers.map((entry, index) => readTier(entry, `${path}.tiers.${index}`, errors)).filter((tier): tier is TopicTier => tier !== null)
    : refuse(errors, `${path}.tiers`, `tiers are 1 to ${TOPIC_TIERS_MAX} entries of {cue, when?}, shallow to deep`, []);
  const priority = readPriority(value.priority, `${path}.priority`, errors);
  return id && keys.length && tiers.length ? { id, keys, tiers, ...(priority !== undefined ? { priority } : {}) } : null;
};

export const readMemberCues = (member: Record<string, unknown>, path: string, errors: ValidationError[]): Pick<LifeMember, "cues" | "topics"> => {
  const cues = readList(member.cues, `${path}.cues`, CUES_MAX, "cues", (entry, at) => readCue(entry, at, errors), errors);
  const topics = readList(member.topics, `${path}.topics`, TOPICS_MAX, "topics", (entry, at) => readTopic(entry, at, errors), errors);
  return { ...(cues ? { cues } : {}), ...(topics ? { topics } : {}) };
};

const readIds = (value: unknown, path: string, known: ReadonlySet<string>, what: string, errors: ValidationError[], required: boolean): string[] => {
  if (value === undefined && !required) return [];
  const ids = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()) : [];
  if (!Array.isArray(value) || (required && !ids.length) || ids.length !== value.length) addError(errors, path, `a list of ${what} ids`);
  ids.forEach((id, index) => { if (!known.has(id)) addError(errors, `${path}.${index}`, `'${id}' is not a ${what}`); });
  return [...new Set(ids.filter((id) => known.has(id)))];
};

const readNorm = (value: unknown, path: string, roster: ReadonlySet<string>, checkpoints: ReadonlySet<string>, errors: ValidationError[]): StoryNorm | null => {
  if (!isRecord(value)) return refuse(errors, path, "a norm is {id, label, broken_when, noticed_by, cue}", null);
  rejectUnknownKeys(value, NORM_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, "a norm", errors);
  const label = asString(value.label)?.trim();
  if (!label || label.length > NORM_LABEL_MAX) addError(errors, `${path}.label`, `label is the rule in your words, at most ${NORM_LABEL_MAX} characters (only you see it)`);
  const broken = value.broken_when === undefined ? refuse(errors, `${path}.broken_when`, "a norm needs broken_when: the event that breaks it", null)
    : readGate(value.broken_when, `${path}.broken_when`, errors);
  const noticed = readIds(value.noticed_by, `${path}.noticed_by`, roster, "roster member", errors, true);
  const cue = readCueText(value.cue, `${path}.cue`, errors);
  const priority = readPriority(value.priority, `${path}.priority`, errors);
  const at = readIds(value.checkpoints, `${path}.checkpoints`, checkpoints, "checkpoint", errors, false);
  if (!id || !label || label.length > NORM_LABEL_MAX || !broken || !noticed.length || !cue) return null;
  return { id, label, broken_when: broken, noticed_by: noticed, cue, ...(priority !== undefined ? { priority } : {}), ...(at.length ? { checkpoints: at } : {}) };
};

export const readNorms = (json: Record<string, unknown>, errors: ValidationError[]): StoryNorm[] | undefined => {
  const roster = new Set((Array.isArray(json.roster) ? json.roster : []).flatMap((member) => (isRecord(member) && typeof member.id === "string" ? [member.id] : [])));
  const checkpoints = new Set((Array.isArray(json.checkpoints) ? json.checkpoints : []).flatMap((entry) => (isRecord(entry) && typeof entry.id === "string" ? [entry.id] : [])));
  return readList(json.norms, "norms", NORMS_MAX, "norms", (entry, at) => readNorm(entry, at, roster, checkpoints, errors), errors);
};

const latch = (key: string, rubric: string): Quality => ({ key, type: "int", source: "code", latching: true, monotonic: true, rubric });

export const cueQualities = (life: StoryLife): Quality[] => [
  ...life.members.flatMap((member) => [
    ...(member.cues ?? []).flatMap((cue) => [
      ...(cue.kind === "reaction" ? [latch(cueAtKey(member.id, cue.id), `The boundary at which ${member.id}'s reaction cue ${cue.id} first held`)] : []),
      ...(cue.lane === "must" ? [latch(cueLandedKey(member.id, cue.id), `The boundary at which ${member.id}'s must cue ${cue.id} was offered and landed`)] : []),
    ]),
    ...(member.topics ?? []).map((topic): Quality => ({
      key: topicKey(member.id, topic.id), type: "int", source: "code", rubric: `How deep the player has taken ${member.id}'s topic ${topic.id}, asked directly (0 to ${topic.tiers.length})`,
    })),
  ]),
  ...(life.norms ?? []).flatMap((norm) => [
    latch(normAtKey(norm.id), `The boundary at which norm ${norm.id} was first broken`),
    ...norm.noticed_by.map((member) => latch(normSeenKey(norm.id, member), `The boundary at which ${member} noticed norm ${norm.id} broken`)),
  ]),
];

export const hasCueFields = (life: StoryLife | undefined): boolean => Boolean(life?.norms?.length || life?.members.some((member) => member.cues?.length || member.topics?.length));

export const checkCueKeys = (qualities: readonly Quality[], compiled: readonly Quality[], errors: ValidationError[]) => {
  const own = new Set(compiled.map((quality) => quality.key));
  qualities.filter((quality) => !own.has(quality.key) && (quality.key.startsWith(CUE_KEY_PREFIX) || quality.key.startsWith(TOPIC_KEY_PREFIX)))
    .forEach((quality) => addError(errors, `qualities.${quality.key}`, `keys starting ${CUE_KEY_PREFIX} or ${TOPIC_KEY_PREFIX} are kept for character cues`));
  compiled.forEach((quality, index) => {
    if (compiled.findIndex((other) => other.key === quality.key) !== index) addError(errors, `qualities.${quality.key}`, "two cues compile to the same key: rename one cue, norm or member");
  });
};

const eventProblem = (gate: GateNode, start: Readonly<Record<string, PrimitiveValue>>): string | null => inactionProblem(gate, start)?.replace("the move fires", "it fires") ?? null;

const ownKeys = (member: string, cue: MemberCue): string[] => [cueAtKey(member, cue.id), cueLandedKey(member, cue.id)];

export const checkMemberCues = (
  member: LifeMember, path: string, qualityByKey: Record<string, Quality>, start: Readonly<Record<string, PrimitiveValue>>, castNames: readonly string[], errors: ValidationError[],
) => {
  (member.cues ?? []).forEach((cue, index) => {
    const base = `${path}.cues.${index}`;
    validateGate(cue.when, qualityByKey, `${base}.when`, errors);
    if (cue.landed_when) validateGate(cue.landed_when, qualityByKey, `${base}.landed_when`, errors);
    const own = ownKeys(member.id, cue);
    [cue.when, cue.landed_when].forEach((gate) => gate && gateKeys(gate).filter((key) => own.includes(key))
      .forEach((key) => addError(errors, base, `the cue's gate reads '${key}', which this cue writes`)));
    const problem = cue.kind === "reaction" ? eventProblem(cue.when, start) : null;
    if (problem) addError(errors, `${base}.when`, `${CUE_NEEDS_EVENT}: a reaction answers an event; ${problem}`);
  });
  const names = new Set(castNames.map((name) => name.trim().toLowerCase()));
  (member.topics ?? []).forEach((topic, index) => {
    const base = `${path}.topics.${index}`;
    topic.keys.forEach((key, at) => { if (names.has(key.toLowerCase())) addError(errors, `${base}.keys.${at}`, `'${key}' is a cast member's name: a topic key is a subject, never who is asked`); });
    topic.tiers.forEach((tier, at) => { if (tier.when) validateGate(tier.when, qualityByKey, `${base}.tiers.${at}.when`, errors); });
  });
};

export const checkNorms = (norms: readonly StoryNorm[] | undefined, qualityByKey: Record<string, Quality>, start: Readonly<Record<string, PrimitiveValue>>, errors: ValidationError[]) =>
  (norms ?? []).forEach((norm, index) => {
    const path = `norms.${index}.broken_when`;
    validateGate(norm.broken_when, qualityByKey, path, errors);
    const problem = eventProblem(norm.broken_when, start);
    if (problem) addError(errors, path, `${CUE_NEEDS_EVENT}: a norm is broken by an event; ${problem}`);
  });
