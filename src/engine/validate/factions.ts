import {
  FACTION_HEARD_BY, FACTION_KEY_PREFIX, FACTION_MOVES_MAX, FACTION_NAME_MAX, FACTION_RANGE_DEFAULT, FACTIONS_MAX,
  FACTIONS_PER_MEMBER_MAX, factionMoveKey, isFactionDerivedKey, isStoryTimeKey, seenStandingKey, standingKey,
  type Faction, type FactionMove, type GateLeaf, type GateNode, type PrimitiveValue, type Quality, type Quest, type RosterMember, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { Blackboard } from "../blackboard";
import { evaluateGate, gateLeaves } from "../gates";
import { addError, asString, isOneOf, refuse, rejectUnknownKeys } from "./common";
import { readGate, validateGate } from "./gates";
import { readBands } from "./display";
import { TIME_KEYS } from "./quests";

const FACTION_KEYS = ["id", "name", "range", "start", "bands", "visible_when", "introduce", "moves"] as const;
const MOVE_KEYS = ["id", "when", "add", "heard_by"] as const;
export const FACTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const FACTION_RANGE_MAX_WIDTH = 40;
export const FACTION_MOVE_ON_INACTION = "faction-move-on-inaction";

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

const readId = (value: unknown, path: string, label: string, errors: ValidationError[]): string | null => {
  const id = asString(value)?.trim() ?? "";
  return FACTION_ID_PATTERN.test(id) ? id : refuse(errors, path, `a ${label} id is a lowercase slug without underscores`, null);
};

const readRange = (value: unknown, path: string, errors: ValidationError[]): [number, number] => {
  if (value === undefined) return FACTION_RANGE_DEFAULT;
  if (Array.isArray(value) && value.length === 2 && isInt(value[0]) && isInt(value[1]) && value[1] - value[0] >= 2 && value[1] - value[0] <= FACTION_RANGE_MAX_WIDTH) {
    return [value[0], value[1]];
  }
  return refuse(errors, path, `range is [low, high]: whole numbers 2 to ${FACTION_RANGE_MAX_WIDTH} apart`, FACTION_RANGE_DEFAULT);
};

const readMove = (value: unknown, path: string, width: number, errors: ValidationError[]): FactionMove | null => {
  if (!isRecord(value)) return refuse(errors, path, "a move is {id, when, add, heard_by?}", null);
  rejectUnknownKeys(value, MOVE_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, "move", errors);
  const when = value.when === undefined ? refuse(errors, `${path}.when`, "a move needs when: the event that moves the standing", null) : readGate(value.when, `${path}.when`, errors);
  const add = isInt(value.add) && value.add !== 0 && Math.abs(value.add) <= width
    ? value.add : refuse(errors, `${path}.add`, `add is a whole number, not 0, at most ${width} either way`, null);
  const heard = value.heard_by === undefined ? "present" : isOneOf(value.heard_by, FACTION_HEARD_BY)
    ? value.heard_by : refuse(errors, `${path}.heard_by`, "heard_by is present or faction", "present" as const);
  return id && when && add !== null ? { id, when, add, heard_by: heard } : null;
};

const readFaction = (value: unknown, path: string, errors: ValidationError[]): Faction | null => {
  if (!isRecord(value)) return refuse(errors, path, "a faction is {id, name, bands, moves}", null);
  rejectUnknownKeys(value, FACTION_KEYS, path, errors);
  const id = readId(value.id, `${path}.id`, "faction", errors);
  const name = asString(value.name)?.trim() ?? "";
  if (!name || name.length > FACTION_NAME_MAX) addError(errors, `${path}.name`, `a faction needs a name of at most ${FACTION_NAME_MAX} characters`);
  const range = readRange(value.range, `${path}.range`, errors);
  const start = value.start === undefined ? Math.max(range[0], Math.min(range[1], 0)) : isInt(value.start) && value.start >= range[0] && value.start <= range[1]
    ? value.start : refuse(errors, `${path}.start`, "start is a whole number inside range", range[0]);
  const bands = readBands(value.bands, range[0], range[1], `${path}.bands`, errors);
  if (bands?.some((band) => band.warn)) addError(errors, `${path}.bands`, "a faction band has no warn: warnings are for public meters on the sheet");
  const visible = value.visible_when === undefined ? null : readGate(value.visible_when, `${path}.visible_when`, errors);
  if (value.introduce !== undefined && typeof value.introduce !== "boolean") addError(errors, `${path}.introduce`, "introduce is true or false");
  const moves = value.moves === undefined ? [] : Array.isArray(value.moves) && value.moves.length <= FACTION_MOVES_MAX
    ? value.moves.map((entry, index) => readMove(entry, `${path}.moves.${index}`, range[1] - range[0], errors)).filter((move): move is FactionMove => move !== null)
    : refuse(errors, `${path}.moves`, `moves is a list of at most ${FACTION_MOVES_MAX}`, []);
  moves.forEach((move, index) => { if (moves.findIndex((other) => other.id === move.id) !== index) addError(errors, `${path}.moves.${index}.id`, `duplicate move '${move.id}'`); });
  if (!id || !name || name.length > FACTION_NAME_MAX || !bands) return null;
  return { id, name, range, start, bands, ...(visible ? { visible_when: visible } : {}), ...(value.introduce === true ? { introduce: true } : {}), moves };
};

export const readFactions = (value: unknown, errors: ValidationError[]): Faction[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > FACTIONS_MAX) return refuse(errors, "factions", `factions is a list of at most ${FACTIONS_MAX}`, undefined);
  const factions = value.map((entry, index) => readFaction(entry, `factions.${index}`, errors)).filter((faction): faction is Faction => faction !== null);
  factions.forEach((faction, index) => { if (factions.findIndex((other) => other.id === faction.id) !== index) addError(errors, `factions.${index}.id`, `duplicate faction '${faction.id}'`); });
  return factions.length ? factions : undefined;
};

type RosterEntry = Readonly<{ id?: unknown; factions?: unknown }>;

export const factionMembers = (roster: ReadonlyArray<RosterEntry>, faction: string): string[] =>
  roster.flatMap((member) => (Array.isArray(member.factions) && member.factions.includes(faction) && typeof member.id === "string" ? [member.id] : []));

const code = (key: string, rubric: string, extra: Partial<Quality>): Quality => ({ key, type: "int", source: "code", rubric, ...extra });

export const factionQualities = (factions: readonly Faction[], roster: ReadonlyArray<RosterEntry>): Quality[] => factions.flatMap((faction) => {
  const bounds = { range: faction.range, step_rule: { step: 1, min: faction.range[0], max: faction.range[1], start: faction.start } };
  return [
    code(standingKey(faction.id), `How ${faction.name} regards the player, moved only by the story's authored moves and rewards`, bounds),
    ...factionMembers(roster, faction.id).map((member) => code(seenStandingKey(faction.id, member), `How ${faction.name} regards the player, as far as ${member} has heard`, bounds)),
    ...faction.moves.map((move) => code(factionMoveKey(faction.id, move.id), `The boundary ${faction.name}'s move ${move.id} fired at, once ever`, { monotonic: true })),
  ];
});

export const addFactionQualities = (
  qualities: Quality[], factions: readonly Faction[] | undefined, roster: ReadonlyArray<RosterEntry>, errors: ValidationError[],
): Quality[] => {
  if (!factions?.length) return qualities;
  qualities.forEach((quality, index) => {
    if (quality.key.startsWith(FACTION_KEY_PREFIX)) addError(errors, `qualities.${index}.key`, `keys starting ${FACTION_KEY_PREFIX} are kept for faction standing`);
  });
  const existing = new Set(qualities.map((quality) => quality.key));
  return [...qualities, ...factionQualities(factions, roster).filter((quality) => !existing.has(quality.key))];
};

const INACTION_KEYS: ReadonlySet<string> = new Set(TIME_KEYS);

export const isTimeKey = (key: string): boolean => INACTION_KEYS.has(key) || isStoryTimeKey(key) || /^agenda_.+_wait$/.test(key) || /^life_mood_.+_age$/.test(key);

const comparesToAbsence = (leaf: GateLeaf, start: Readonly<Record<string, PrimitiveValue>>): boolean =>
  (leaf.op === "==" && (leaf.v === false || (start[leaf.q] !== undefined && leaf.v === start[leaf.q]))) || (leaf.op === "!=" && leaf.v === true);

export const inactionProblem = (gate: GateNode, start: Readonly<Record<string, PrimitiveValue>>): string | null => {
  if ("not" in gate) return "the gate is a not at the top, so the move fires when something did not happen";
  const leaves = gateLeaves(gate);
  if (leaves.length && leaves.every((leaf) => isTimeKey(leaf.q))) return `the gate reads only time (${leaves[0].q}), so the move fires on waiting alone`;
  const absent = leaves.find((leaf) => comparesToAbsence(leaf, start));
  return absent ? `the leaf ${absent.q} ${absent.op} ${JSON.stringify(absent.v)} holds before anything happens, so the move fires on inaction` : null;
};

export interface FactionCheckInput {
  factions: readonly Faction[] | undefined;
  roster: ReadonlyArray<Pick<RosterMember, "id" | "factions">>;
  qualityByKey: Record<string, Quality>;
  quests?: readonly Quest[];
}

const checkMembership = (roster: FactionCheckInput["roster"], ids: ReadonlySet<string>, errors: ValidationError[]) => roster.forEach((member, index) => {
  if (member.factions === undefined) return;
  const path = `roster.${index}.factions`;
  if (!Array.isArray(member.factions) || !member.factions.every((id) => typeof id === "string")) return addError(errors, path, "factions is a list of faction ids");
  if (member.factions.length > FACTIONS_PER_MEMBER_MAX) addError(errors, path, `a member belongs to at most ${FACTIONS_PER_MEMBER_MAX} factions`);
  if (new Set(member.factions).size !== member.factions.length) addError(errors, path, "a faction is listed twice");
  member.factions.forEach((id, at) => { if (!ids.has(id)) addError(errors, `${path}.${at}`, `unknown faction '${id}'`); });
});

export const checkFactions = ({ factions, roster, qualityByKey, quests }: FactionCheckInput, errors: ValidationError[]) => {
  const ids = new Set((factions ?? []).map((faction) => faction.id));
  checkMembership(roster, ids, errors);
  (quests ?? []).forEach((quest, index) => Object.keys(quest.reward?.set ?? {}).forEach((key) => {
    if (isFactionDerivedKey(key)) addError(errors, `quests.${index}.reward.set.${key}`, "a reward moves a faction's standing (rep_<faction>), never what a member heard or a move's record");
  }));
  if (!factions?.length) return;
  const start = new Blackboard({ qualityByKey }).entries();
  factions.forEach((faction, index) => {
    const path = `factions.${index}`;
    if (faction.visible_when) validateGate(faction.visible_when, qualityByKey, `${path}.visible_when`, errors);
    faction.moves.forEach((move, at) => {
      const movePath = `${path}.moves.${at}.when`;
      validateGate(move.when, qualityByKey, movePath, errors);
      if (evaluateGate(move.when, { get: (key) => start[key] })) addError(errors, movePath, "this move's gate holds before anything happens, so it would fire at once");
      const problem = move.add < 0 ? inactionProblem(move.when, start) : null;
      if (problem) addError(errors, movePath, `${FACTION_MOVE_ON_INACTION}: a move that lowers standing needs an event the player caused; ${problem}`);
    });
  });
};
