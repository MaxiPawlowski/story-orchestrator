import {
  CODEX_ALIASES_MAX, CODEX_ENTRIES_MAX, CODEX_FACTS_MAX, CODEX_ID_PATTERN, CODEX_NAME_MAX, CODEX_PAGES, CODEX_START, CODEX_TEXT_MAX, PARTY_LOCATION_KEY,
  codexEntryKey, codexFactKey, isCodexKey, isReached,
  type Checkpoint, type CodexEntry, type CodexFact, type CodexKnownWhen, type CodexPage, type Quality, type RosterMember, type StoryCodex, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";

const CODEX_KEYS = ["people", "places"] as const;
const ENTRY_KEYS = ["id", "name", "member", "location", "aliases", "known_when", "facts"] as const;
const FACT_KEYS = ["id", "text", "known_when", "source", "rev"] as const;
const MACRO = /\{\{|\}\}/;

const readPlain = (value: unknown, max: number, path: string, errors: ValidationError[]): string | null => {
  const text = asString(value)?.trim();
  if (!text || text.length > max) return refuse(errors, path, `text of at most ${max} characters is required`, null);
  if (MACRO.test(text)) return refuse(errors, path, "plain text only: macros are not expanded on player pages", null);
  return text;
};

const readId = (value: unknown, path: string, errors: ValidationError[]): string | null => {
  const id = asString(value)?.trim() ?? "";
  if (CODEX_ID_PATTERN.test(id)) return id;
  return refuse(errors, path, "an id is a lowercase slug of letters, digits and '-' (no '_')", null);
};

export const readKnownWhen = (value: unknown, path: string, errors: ValidationError[]): CodexKnownWhen | null => {
  if (value === CODEX_START) return CODEX_START;
  if (isRecord(value) && "reached" in value) {
    rejectUnknownKeys(value, ["reached"], path, errors);
    const reached = asString(value.reached)?.trim();
    return reached ? { reached } : refuse(errors, `${path}.reached`, "reached names a checkpoint id", null);
  }
  if (!isRecord(value)) return refuse(errors, path, "known_when is a gate, {reached: <checkpoint id>} or \"start\"", null);
  return readGate(value, path, errors);
};

const readAliases = (value: unknown, path: string, errors: ValidationError[]): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > CODEX_ALIASES_MAX) return refuse(errors, path, `aliases are a list of at most ${CODEX_ALIASES_MAX} names`, undefined);
  const names = value.map((entry, index) => readPlain(entry, CODEX_NAME_MAX, `${path}.${index}`, errors)).filter((entry): entry is string => entry !== null);
  return names.length ? [...new Set(names)] : undefined;
};

const readFact = (value: unknown, path: string, errors: ValidationError[]): CodexFact | null => {
  if (!isRecord(value)) return refuse(errors, path, "a fact is {id, text, known_when}", null);
  rejectUnknownKeys(value, FACT_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, errors);
  const text = readPlain(value.text, CODEX_TEXT_MAX, `${path}.text`, errors);
  const known = value.known_when === undefined ? refuse(errors, `${path}.known_when`, "a fact needs known_when (\"start\" when the player knows it from the outset)", null)
    : readKnownWhen(value.known_when, `${path}.known_when`, errors);
  const source = value.source === undefined ? undefined : asString(value.source)?.trim() ?? refuse(errors, `${path}.source`, "source is an entry or roster id", undefined);
  const rev = value.rev === undefined ? undefined : Number.isInteger(value.rev) && (value.rev as number) >= 1 ? value.rev as number
    : refuse(errors, `${path}.rev`, "rev is a whole number of at least 1", undefined);
  if (!id || !text || !known) return null;
  return { id, text, known_when: known, ...(source ? { source } : {}), ...(rev !== undefined && rev > 1 ? { rev } : {}) };
};

const readFacts = (value: unknown, path: string, errors: ValidationError[]): CodexFact[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(errors, path, "facts are a list", []);
  if (value.length > CODEX_FACTS_MAX) addError(errors, path, `an entry holds at most ${CODEX_FACTS_MAX} facts`);
  return value.map((entry, index) => readFact(entry, `${path}.${index}`, errors)).filter((fact): fact is CodexFact => fact !== null);
};

const readEntry = (page: CodexPage) => (value: unknown, path: string, errors: ValidationError[]): CodexEntry | null => {
  if (!isRecord(value)) return refuse(errors, path, "an entry is {id, name or member, facts}", null);
  rejectUnknownKeys(value, ENTRY_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, errors);
  const name = value.name === undefined ? undefined : readPlain(value.name, CODEX_NAME_MAX, `${path}.name`, errors) ?? undefined;
  const member = value.member === undefined ? undefined : asString(value.member)?.trim() ?? refuse(errors, `${path}.member`, "member is a roster id", undefined);
  const location = value.location === undefined ? undefined : asString(value.location)?.trim() ?? refuse(errors, `${path}.location`, "location is a value of the location quality", undefined);
  if (page === "people" && location !== undefined) addError(errors, `${path}.location`, "location belongs to a place");
  if (page === "places" && member !== undefined) addError(errors, `${path}.member`, "member belongs to a person");
  if (page === "people" && !name && !member) addError(errors, path, "a person needs a name or a roster member");
  if (page === "places" && !name) addError(errors, `${path}.name`, "a place needs a name");
  const aliases = readAliases(value.aliases, `${path}.aliases`, errors);
  const known = value.known_when === undefined ? undefined : readKnownWhen(value.known_when, `${path}.known_when`, errors) ?? undefined;
  const facts = readFacts(value.facts, `${path}.facts`, errors);
  if (!id) return null;
  return {
    id, ...(name ? { name } : {}), ...(member ? { member } : {}), ...(location ? { location } : {}), ...(aliases ? { aliases } : {}),
    ...(known ? { known_when: known } : {}), facts,
  };
};

export const readCodex = (value: unknown, errors: ValidationError[]): StoryCodex | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, "codex", "codex is {people?, places?}", undefined);
  rejectUnknownKeys(value, CODEX_KEYS, "codex", errors);
  const codex: StoryCodex = {};
  CODEX_PAGES.forEach((page) => {
    const list = value[page];
    if (list === undefined) return;
    if (!Array.isArray(list)) return addError(errors, `codex.${page}`, `${page} is a list`);
    if (list.length > CODEX_ENTRIES_MAX) addError(errors, `codex.${page}`, `at most ${CODEX_ENTRIES_MAX} entries per page`);
    const entries = list.map((entry, index) => readEntry(page)(entry, `codex.${page}.${index}`, errors)).filter((entry): entry is CodexEntry => entry !== null);
    if (entries.length) codex[page] = entries;
  });
  return codex.people || codex.places ? codex : undefined;
};

export interface CodexRefs {
  checkpointById: Record<string, Checkpoint>;
  qualityByKey: Record<string, Quality>;
  roster: RosterMember[];
}

const checkWhen = (when: CodexKnownWhen | undefined, path: string, refs: CodexRefs, errors: ValidationError[]) => {
  if (!when || when === CODEX_START) return;
  if (isReached(when)) {
    if (!refs.checkpointById[when.reached]) addError(errors, `${path}.reached`, `unknown checkpoint '${when.reached}'`);
    return;
  }
  validateGate(when, refs.qualityByKey, path, errors);
};

const duplicates = (ids: string[], label: string, path: (index: number) => string, errors: ValidationError[]) => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) addError(errors, path(index), `duplicate ${label} '${id}'`);
    seen.add(id);
  });
};

const checkEntry = (entry: CodexEntry, path: string, refs: CodexRefs, ids: Set<string>, errors: ValidationError[]) => {
  const roster = new Set(refs.roster.map((member) => member.id));
  if (entry.member && !roster.has(entry.member)) addError(errors, `${path}.member`, `'${entry.member}' is not a roster id`);
  if (entry.location) {
    const location = refs.qualityByKey[PARTY_LOCATION_KEY];
    if (!location || location.type !== "enum") addError(errors, `${path}.location`, "location needs a declared enum quality 'location'");
    else if (!location.values?.includes(entry.location)) addError(errors, `${path}.location`, `'${entry.location}' is not a value of 'location'`);
  }
  checkWhen(entry.known_when, `${path}.known_when`, refs, errors);
  duplicates(entry.facts.map((fact) => fact.id), "fact", (index) => `${path}.facts.${index}.id`, errors);
  entry.facts.forEach((fact, index) => {
    checkWhen(fact.known_when, `${path}.facts.${index}.known_when`, refs, errors);
    if (fact.source && !ids.has(fact.source) && !roster.has(fact.source)) addError(errors, `${path}.facts.${index}.source`, `'${fact.source}' is neither a codex entry nor a roster id`);
  });
};

export const checkCodex = (codex: StoryCodex | undefined, refs: CodexRefs, errors: ValidationError[]) => {
  if (!codex) return;
  const ids = new Set(CODEX_PAGES.flatMap((page) => (codex[page] ?? []).map((entry) => entry.id)));
  CODEX_PAGES.forEach((page) => {
    const entries = codex[page] ?? [];
    duplicates(entries.map((entry) => entry.id), "entry", (index) => `codex.${page}.${index}.id`, errors);
    entries.forEach((entry, index) => checkEntry(entry, `codex.${page}.${index}`, refs, ids, errors));
  });
  const seen = new Set<string>();
  (codex.people ?? []).forEach((entry, index) => {
    if (entry.member && seen.has(entry.member)) addError(errors, `codex.people.${index}.member`, `'${entry.member}' already has a person page`);
    if (entry.member) seen.add(entry.member);
  });
};

const latchQuality = (key: string, what: string): Quality => ({
  key, type: "int", source: "code", latching: true, monotonic: true, rubric: `Set once by the story: the boundary at which the player learned ${what}`,
});

export const addCodexQualities = (qualities: Quality[], codex: StoryCodex | undefined, errors: ValidationError[]): Quality[] => {
  qualities.filter((quality) => isCodexKey(quality.key)).forEach((quality) => addError(errors, `qualities.${quality.key}`, "keys starting codex_p_ or codex_l_ are kept for the codex"));
  if (!codex) return qualities;
  const added = CODEX_PAGES.flatMap((page) => (codex[page] ?? []).flatMap((entry) => [
    ...(entry.known_when !== CODEX_START && (entry.known_when || entry.location) ? [latchQuality(codexEntryKey(page, entry.id), `of ${page === "people" ? "this person" : "this place"}`)] : []),
    ...entry.facts.filter((fact) => fact.known_when !== CODEX_START).map((fact) => latchQuality(codexFactKey(page, entry.id, fact.id), "this fact")),
  ]));
  const existing = new Set(qualities.map((quality) => quality.key));
  return [...qualities, ...added.filter((quality) => !existing.has(quality.key))];
};
