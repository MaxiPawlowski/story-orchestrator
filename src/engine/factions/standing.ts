import { Blackboard } from "../blackboard";
import { evaluateGate, gateKeys, type GateReader } from "../gates";
import {
  factionBand, factionMoveKey, isFactionKey, seenStandingKey, standingKey,
  type Faction, type FactionMove, type NormalizedStory, type PrimitiveValue,
} from "../schema";
import { isAway } from "../life/presence";

type Values = Readonly<Record<string, PrimitiveValue>>;
type Read = Readonly<Record<string, unknown>>;

export const FACTION_LINE_TAIL = "(as far as you have heard). Let it colour how you open toward them; your own feelings come first.";
export const DIRECTOR_INTRODUCE = "the player has not met this group; you may introduce it";

const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const reader = (values: Read): GateReader => ({ get: (key) => values[key] as PrimitiveValue | undefined });

export const memberIdsOf = (story: Pick<NormalizedStory, "roster">, faction: string): string[] =>
  story.roster.filter((member) => member.factions?.includes(faction)).map((member) => member.id);

const presentAt = (story: Pick<NormalizedStory, "life">, member: string, values: Values): boolean => {
  const life = story.life?.members.find((entry) => entry.id === member);
  return !life || !isAway(life, values);
};

export const hearers = (story: Pick<NormalizedStory, "roster" | "life">, faction: Faction, move: FactionMove, values: Values, enabled?: readonly string[]): string[] =>
  memberIdsOf(story, faction.id).filter((member) => move.heard_by === "faction" || (presentAt(story, member, values) && (!enabled || enabled.includes(member))));

export interface FiredMove {
  faction: string;
  move: string;
  add: number;
  applied: number;
  heardBy: string[];
}

export const applyFactionMoves = (
  story: Pick<NormalizedStory, "factions" | "roster" | "life">, blackboard: Blackboard, boundary: number, enabled?: readonly string[],
): FiredMove[] => {
  const fired: FiredMove[] = [];
  for (const faction of story.factions ?? []) {
    for (const move of faction.moves) {
      const latch = factionMoveKey(faction.id, move.id);
      if (blackboard.get(latch) !== undefined || !evaluateGate(move.when, blackboard)) continue;
      const key = standingKey(faction.id);
      const before = num(blackboard.get(key), faction.start);
      const outcome = blackboard.applyDelta({ q: key, v: before + move.add, source: "code" });
      if (!outcome.ok) continue;
      if (!blackboard.applyDelta({ q: latch, v: boundary, source: "code" }).ok) continue;
      const heardBy = hearers(story, faction, move, blackboard.entries(), enabled);
      heardBy.forEach((member) => {
        const seen = seenStandingKey(faction.id, member);
        blackboard.applyDelta({ q: seen, v: num(blackboard.get(seen), faction.start) + move.add, source: "code" });
      });
      fired.push({ faction: faction.id, move: move.id, add: move.add, applied: num(outcome.value, before) - before, heardBy });
    }
  }
  return fired;
};

export interface FactionLatchView {
  boundary: number;
  values: Readonly<Record<string, PrimitiveValue>>;
  enabled?: readonly string[];
}

export const factionLatches = (story: NormalizedStory, view: FactionLatchView): Array<{ q: string; v: PrimitiveValue }> => {
  if (!story.factions?.length) return [];
  const scratch = new Blackboard(story, { values: { ...view.values }, versions: {}, latched: {} });
  applyFactionMoves(story, scratch, view.boundary, view.enabled);
  return Object.entries(scratch.entries()).filter(([key, value]) => isFactionKey(key) && view.values[key] !== value).map(([q, v]) => ({ q, v }));
};

export const factionDiscoveryUnits = (story: Pick<NormalizedStory, "factions">, values: Read): { entries: string[][]; facts: string[][] } =>
  ({ entries: [], facts: factionScopeUnits(story, values) });

export const factionsMoved = (story: Pick<NormalizedStory, "factions"> | null | undefined, before: Read, after: Read): boolean =>
  Boolean(story?.factions?.length) && [...new Set([...Object.keys(before), ...Object.keys(after)])].some((key) => isFactionKey(key) && before[key] !== after[key]);

export const factionVisible = (faction: Faction, values: Read): boolean => !faction.visible_when || evaluateGate(faction.visible_when, reader(values));

export const standingOf = (faction: Faction, values: Read): number => num(values[standingKey(faction.id)], faction.start);

export const factionMemberLines = (story: Pick<NormalizedStory, "factions" | "roster">, values: Read, memberId: string): string[] => {
  const member = story.roster.find((entry) => entry.id === memberId);
  const byId = new Map((story.factions ?? []).map((faction) => [faction.id, faction]));
  return (member?.factions ?? []).flatMap((id) => {
    const faction = byId.get(id);
    if (!faction) return [];
    const seen = num(values[seenStandingKey(id, memberId)], faction.start);
    return [`- Your group, ${faction.name}, regards the player as: ${factionBand(faction, seen)} ${FACTION_LINE_TAIL}`];
  });
};

export const factionDirectorLines = (story: Pick<NormalizedStory, "factions">, values: Read): string[] => (story.factions ?? []).flatMap((faction) => {
  if (factionVisible(faction, values)) return [`${faction.name}: ${factionBand(faction, standingOf(faction, values))}`];
  return faction.introduce ? [`${faction.name}: ${DIRECTOR_INTRODUCE}`] : [];
});

export interface StandingView {
  name: string;
  band: string;
}

export const standingView = (story: Pick<NormalizedStory, "factions" | "display">, values: Read): StandingView[] => (story.display?.standing === false ? [] : (story.factions ?? [])
  .filter((faction) => factionVisible(faction, values))
  .map((faction) => ({ name: faction.name, band: factionBand(faction, standingOf(faction, values)) })));

export interface FactionAuthorRow {
  id: string;
  name: string;
  value: number;
  range: [number, number];
  band: string;
  visible: boolean;
  members: string[];
  moves: Array<{ id: string; add: number; heardBy: Faction["moves"][number]["heard_by"]; boundary: number | null }>;
}

export const factionAuthorRows = (story: Pick<NormalizedStory, "factions" | "roster">, values: Read): FactionAuthorRow[] => (story.factions ?? []).map((faction) => ({
  id: faction.id,
  name: faction.name,
  value: standingOf(faction, values),
  range: faction.range,
  band: factionBand(faction, standingOf(faction, values)),
  visible: factionVisible(faction, values),
  members: memberIdsOf(story, faction.id).map((id) => story.roster.find((member) => member.id === id)?.name ?? id),
  moves: faction.moves.map((move) => {
    const fired = values[factionMoveKey(faction.id, move.id)];
    return { id: move.id, add: move.add, heardBy: move.heard_by, boundary: typeof fired === "number" ? fired : null };
  }),
}));

export const factionScopeUnits = (story: Pick<NormalizedStory, "factions">, values: Read): string[][] => (story.factions ?? []).flatMap((faction) =>
  faction.moves.filter((move) => values[factionMoveKey(faction.id, move.id)] === undefined).map((move) => gateKeys(move.when)));
