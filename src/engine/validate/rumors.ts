import {
  GOSSIP_CONTACTS, GOSSIP_DELAY_MAX, GOSSIP_HOPS_DEFAULT, GOSSIP_HOPS_MAX, RUMOR_CLAIM_MAX, RUMOR_LEAKS_MAX, RUMOR_TRUTHS, RUMOR_VERSIONS_MAX, RUMORS_MAX,
  type GossipChannel, type GossipDelay, type Rumor, type RumorLeak, type RumorVersion, type StoryRumors,
} from "../rumorSchema";
import type { GateNode, Quality, StoryLife, ValidationError } from "../schema";
import { isRecord } from "@utils/guards";
import { contentWords, restatesWords } from "@memory/words";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { GAME_ID_PATTERN } from "./checks";

const CHANNEL_KEYS = ["talks_to", "contact", "when", "delay", "hops"] as const;
const RUMOR_KEYS = ["id", "from", "claim", "about", "versions", "starts_when", "leaks_to"] as const;
const VERSION_KEYS = ["text", "truth", "weight"] as const;
const LEAK_KEYS = ["member", "when"] as const;

export const RUMOR_RESTATES_SECRET = "this rumor's words restate a secret the story keeps (a secret relationship label), so passing it on would reveal it: "
  + "rumors carry open news only; a secret reaches one person through leaks_to";

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

const readText = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim() ?? "";
  return text && text.length <= RUMOR_CLAIM_MAX ? text : refuse(errors, path, `a text of 1 to ${RUMOR_CLAIM_MAX} characters`, null);
};

const readPair = (value: unknown): [number, number] | null =>
  (Array.isArray(value) && value.length === 2 && isInt(value[0]) && isInt(value[1]) && value[0] >= 0 && value[0] <= value[1] && value[1] <= GOSSIP_DELAY_MAX
    ? [value[0], value[1]] : null);

const readDelay = (value: unknown, path: string, errors: ValidationError[]): GossipDelay => {
  const fallback: GossipDelay = { boundaries: [1, 3] };
  if (value === undefined) return fallback;
  if (!isRecord(value) || Object.keys(value).length !== 1) return refuse(errors, path, "delay is {boundaries: [min, max]} or {days: [min, max]}", fallback);
  const boundaries = value.boundaries === undefined ? undefined : readPair(value.boundaries);
  const days = value.days === undefined ? undefined : readPair(value.days);
  if (boundaries) return { boundaries };
  if (days) return { days };
  return refuse(errors, path, `delay [min, max] is whole numbers from 0 to ${GOSSIP_DELAY_MAX}, min first`, fallback);
};

const readChannel = (value: unknown, from: string, path: string, errors: ValidationError[]): GossipChannel | null => {
  if (!isRecord(value)) return refuse(errors, path, "gossip is {talks_to, contact?, when?, delay?, hops?}", null);
  rejectUnknownKeys(value, CHANNEL_KEYS, path, errors);
  const talks = Array.isArray(value.talks_to) && value.talks_to.length && value.talks_to.every((entry) => typeof entry === "string" && entry.trim())
    ? [...new Set((value.talks_to as string[]).map((entry) => entry.trim()))] : refuse(errors, `${path}.talks_to`, "talks_to lists the cast ids this member passes news to", [] as string[]);
  const contact: GossipChannel["contact"] = value.contact === undefined ? "together" : isOneOf(value.contact, GOSSIP_CONTACTS)
    ? value.contact : isRecord(value.contact) ? readGate(value.contact, `${path}.contact`, errors) ?? "together"
      : refuse(errors, `${path}.contact`, "contact is together, any, or a gate", "together" as const);
  const when = value.when === undefined ? null : readGate(value.when, `${path}.when`, errors);
  const hops = value.hops === undefined ? GOSSIP_HOPS_DEFAULT : isInt(value.hops) && value.hops >= 1 && value.hops <= GOSSIP_HOPS_MAX
    ? value.hops : refuse(errors, `${path}.hops`, `hops is a whole number from 1 to ${GOSSIP_HOPS_MAX}`, GOSSIP_HOPS_DEFAULT);
  return { from, talks_to: talks, contact, ...(when ? { when } : {}), delay: readDelay(value.delay, `${path}.delay`, errors), hops };
};

const readVersion = (value: unknown, path: string, errors: ValidationError[]): RumorVersion | null => {
  if (!isRecord(value)) return refuse(errors, path, "a version is {text, truth, weight}", null);
  rejectUnknownKeys(value, VERSION_KEYS, path, errors);
  const text = readText(value.text, `${path}.text`, errors);
  const truth = isOneOf(value.truth, RUMOR_TRUTHS) ? value.truth : refuse(errors, `${path}.truth`, "truth is true, false or unknown (only the author sees it)", "unknown" as const);
  const weight = value.weight === undefined ? 1 : isInt(value.weight) && value.weight >= 1 && value.weight <= 100
    ? value.weight : refuse(errors, `${path}.weight`, "weight is a whole number from 1 to 100", 1);
  return text ? { text, truth, weight } : null;
};

const readLeak = (value: unknown, path: string, errors: ValidationError[]): RumorLeak | null => {
  if (!isRecord(value)) return refuse(errors, path, "a leak is {member, when}", null);
  rejectUnknownKeys(value, LEAK_KEYS, path, errors);
  const member = asString(value.member)?.trim() ?? refuse(errors, `${path}.member`, "a leak names the one cast id it reaches", null);
  const when = value.when === undefined ? refuse(errors, `${path}.when`, "a leak needs when: the event that lets the secret out", null) : readGate(value.when, `${path}.when`, errors);
  return member && when ? { member, when } : null;
};

const list = <T,>(value: unknown, max: number, path: string, read: (entry: unknown, at: string) => T | null, errors: ValidationError[]): T[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) return refuse(errors, path, `a list of at most ${max}`, []);
  return value.map((entry, index) => read(entry, `${path}.${index}`)).filter((entry): entry is T => entry !== null);
};

const readRumor = (value: unknown, path: string, errors: ValidationError[]): Rumor | null => {
  if (!isRecord(value)) return refuse(errors, path, "a rumor is {id, from, claim, versions?, starts_when?, leaks_to?}", null);
  rejectUnknownKeys(value, RUMOR_KEYS, path, errors);
  const id = asString(value.id)?.trim() ?? "";
  if (!GAME_ID_PATTERN.test(id)) addError(errors, `${path}.id`, "a rumor id is a lowercase slug");
  const from = asString(value.from)?.trim() ?? refuse(errors, `${path}.from`, "from names the cast id the rumor starts with", "");
  const claim = readText(value.claim, `${path}.claim`, errors);
  const about = value.about === undefined ? undefined : Array.isArray(value.about) && value.about.every((entry) => typeof entry === "string")
    ? (value.about as string[]) : refuse(errors, `${path}.about`, "about lists entity names", undefined);
  const versions = list(value.versions, RUMOR_VERSIONS_MAX, `${path}.versions`, (entry, at) => readVersion(entry, at, errors), errors);
  const starts = value.starts_when === undefined ? null : readGate(value.starts_when, `${path}.starts_when`, errors);
  const leaks = list(value.leaks_to, RUMOR_LEAKS_MAX, `${path}.leaks_to`, (entry, at) => readLeak(entry, at, errors), errors);
  if (!GAME_ID_PATTERN.test(id) || !from || !claim) return null;
  return { id, from, claim, ...(about ? { about } : {}), ...(versions.length ? { versions } : {}), ...(starts ? { starts_when: starts } : {}), ...(leaks.length ? { leaks_to: leaks } : {}) };
};

export const readRumors = (json: Record<string, unknown>, errors: ValidationError[]): StoryRumors | undefined => {
  const roster = Array.isArray(json.roster) ? json.roster : [];
  const channels = roster.flatMap((member, index) => (isRecord(member) && member.gossip !== undefined
    ? [readChannel(member.gossip, typeof member.id === "string" ? member.id : "", `roster.${index}.gossip`, errors)] : []))
    .filter((channel): channel is GossipChannel => channel !== null);
  const rumors = json.rumors === undefined ? [] : Array.isArray(json.rumors) && json.rumors.length <= RUMORS_MAX
    ? json.rumors.map((entry, index) => readRumor(entry, `rumors.${index}`, errors)).filter((entry): entry is Rumor => entry !== null)
    : refuse(errors, "rumors", `rumors is a list of at most ${RUMORS_MAX}`, []);
  return channels.length || rumors.length ? { channels, rumors } : undefined;
};

const secretLabels = (life: StoryLife | undefined): string[] =>
  (life?.members ?? []).flatMap((member) => member.relationships.flatMap((relationship) => (relationship.secret ?? []).map((row) => row.label)));

const gates = (rumors: StoryRumors, pathOf: (from: string) => string): Array<[string, GateNode]> => [
  ...rumors.channels.flatMap((channel): Array<[string, GateNode]> => [
    ...(channel.when ? [[`${pathOf(channel.from)}.when`, channel.when] as [string, GateNode]] : []),
    ...(typeof channel.contact === "object" ? [[`${pathOf(channel.from)}.contact`, channel.contact] as [string, GateNode]] : []),
  ]),
  ...rumors.rumors.flatMap((rumor, index): Array<[string, GateNode]> => [
    ...(rumor.starts_when ? [[`rumors.${index}.starts_when`, rumor.starts_when] as [string, GateNode]] : []),
    ...(rumor.leaks_to ?? []).map((leak, at): [string, GateNode] => [`rumors.${index}.leaks_to.${at}.when`, leak.when]),
  ]),
];

export interface RumorCheckContext {
  roster: ReadonlyArray<{ id: string }>;
  qualityByKey: Record<string, Quality>;
  hasClock: boolean;
  life?: StoryLife;
}

export const checkRumors = (rumors: StoryRumors | undefined, context: RumorCheckContext, errors: ValidationError[]) => {
  if (!rumors) return;
  const ids = new Set(context.roster.map((member) => member.id));
  const pathOf = (from: string) => `roster.${context.roster.findIndex((member) => member.id === from)}.gossip`;
  rumors.channels.forEach((channel) => {
    const path = pathOf(channel.from);
    if (!ids.has(channel.from)) addError(errors, path, "gossip belongs to a cast member with an id");
    channel.talks_to.forEach((target, index) => {
      if (target === channel.from) addError(errors, `${path}.talks_to.${index}`, "a member does not pass news to itself");
      else if (!ids.has(target)) addError(errors, `${path}.talks_to.${index}`, `'${target}' is not in the cast`);
    });
    if ("days" in channel.delay && !context.hasClock) addError(errors, `${path}.delay`, "a delay in days needs a story clock: add clock {times}, or use boundaries");
  });
  const seen = new Set<string>();
  const secrets = secretLabels(context.life).map((label) => contentWords(label));
  rumors.rumors.forEach((rumor, index) => {
    const path = `rumors.${index}`;
    if (seen.has(rumor.id)) addError(errors, `${path}.id`, `a second rumor '${rumor.id}'`);
    seen.add(rumor.id);
    if (!ids.has(rumor.from)) addError(errors, `${path}.from`, `'${rumor.from}' is not in the cast`);
    (rumor.leaks_to ?? []).forEach((leak, at) => {
      if (!ids.has(leak.member)) addError(errors, `${path}.leaks_to.${at}.member`, `'${leak.member}' is not in the cast`);
      if (leak.member === rumor.from) addError(errors, `${path}.leaks_to.${at}.member`, "the rumor starts with this member already");
    });
    const texts = [rumor.claim, ...(rumor.versions ?? []).map((version) => version.text)];
    if (secrets.some((words) => texts.some((text) => restatesWords(words, contentWords(text))))) addError(errors, `${path}.claim`, RUMOR_RESTATES_SECRET);
  });
  gates(rumors, pathOf).forEach(([path, gate]) => validateGate(gate, context.qualityByKey, path, errors));
};
