import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildJaccardMatchSets, consolidateTier, DEFAULT_DEDUP_THRESHOLDS, heldContradictions, heldGroup, provenance, unionMatchSets, withOverride, type MatchSets, type MemoryEntry } from "../../src/memory/index";

export type K0Label = "contradicts" | "agrees" | "update" | "distinct";
export type K0Band = "dup" | "sameTopic" | "below";

export interface K0Row {
  id: string;
  lang: "en" | "es";
  label: K0Label;
  form?: "negation" | "plain";
  established: string;
  claim: string;
  band: { jaccard: K0Band };
}

export interface K0Fixture {
  use: string;
  fixtureFrozenAt: string;
  rowsSha256: string;
  source: string;
  rows: K0Row[];
}

export interface CosineBrackets {
  bundle: string;
  capturedAt: string;
  rows: Record<string, number>;
}

export type K0Mode = { kind: "jaccard" } | { kind: "vectors"; cosine: Record<string, number> };

export type BandArm = (group: MemoryEntry[], vectors: MatchSets | null) => MatchSets;

export const FIXTURE_DIR = join(__dirname, "../fixtures/memory");

export const loadK0 = (): K0Fixture => JSON.parse(readFileSync(join(FIXTURE_DIR, "contradictions.json"), "utf-8")) as K0Fixture;

export const loadCosineBrackets = (): CosineBrackets[] =>
  readdirSync(FIXTURE_DIR)
    .filter((name) => /^contradictions\.cosine\.[0-9a-f]{12}\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf-8")) as CosineBrackets);

export const rowsSha256 = (rows: K0Row[]): string => createHash("sha256").update(JSON.stringify(rows)).digest("hex");

const row = (id: string, text: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  tier: "facts",
  text,
  type: "fact",
  importance: 3,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "e",
  createdAt: 0,
  messageId: 0,
  recallCount: 0,
  provenance: provenance({ source: "extractor", messageId: 0, boundary: 0, pass: "shared-read" }),
  ...overrides,
});

export const establishedRow = (text: string): MemoryEntry => {
  const base = row("established", text);
  return { ...base, ...withOverride(base, "reconciled", "2026-09-26T00:00:00.000Z", 1) };
};

export const claimRow = (text: string): MemoryEntry =>
  row("claim", text, { createdAt: 1, messageId: 4, provenance: provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "shared-read" }) });

export const jaccardBand = (item: Pick<K0Row, "established" | "claim">): K0Band => {
  const matches = buildJaccardMatchSets(heldGroup([establishedRow(item.established)], [claimRow(item.claim)]));
  if (matches.dup[1].has(0)) return "dup";
  return matches.sameTopic[1].has(0) ? "sameTopic" : "below";
};

export function cosineMatchSets(cosine: number): MatchSets {
  const dup = cosine >= DEFAULT_DEDUP_THRESHOLDS.cosineDup;
  const same = !dup && cosine >= DEFAULT_DEDUP_THRESHOLDS.cosineSameTopic;
  return { dup: [new Set(dup ? [1] : []), new Set(dup ? [0] : [])], sameTopic: [new Set(same ? [1] : []), new Set(same ? [0] : [])] };
}

export const vectorsFor = (item: K0Row, mode: K0Mode): MatchSets | null => {
  if (mode.kind === "jaccard") return null;
  const cosine = mode.cosine[item.id];
  if (typeof cosine !== "number") throw new Error(`no cosine bracket for ${item.id}`);
  return cosineMatchSets(cosine);
};

export const inBand = (item: K0Row, mode: K0Mode): boolean => {
  if (jaccardBand(item) !== "below") return true;
  const vectors = vectorsFor(item, mode);
  return Boolean(vectors && (vectors.dup[1].has(0) || vectors.sameTopic[1].has(0)));
};

export const a0Arm: BandArm = (group, vectors) => (vectors ? unionMatchSets(vectors, buildJaccardMatchSets(group)) : buildJaccardMatchSets(group));

export function heldBy(arm: BandArm, item: K0Row, mode: K0Mode): boolean {
  const established = [establishedRow(item.established)];
  const candidates = [claimRow(item.claim)];
  return heldContradictions(established, candidates, arm(heldGroup(established, candidates), vectorsFor(item, mode))).length > 0;
}

export interface Rate {
  hit: number;
  total: number;
  ids: string[];
}

export interface K0Score {
  held: string[];
  recall: { all: Rate; es: Rate; inBand: Rate; belowBand: Rate; belowNegation: Rate; belowNegationEs: Rate; belowPlain: Rate };
  falseHold: { all: Rate; es: Rate; belowBand: Rate };
  update: Rate;
}

const rate = (rows: K0Row[], held: Set<string>): Rate => {
  const ids = rows.filter((item) => held.has(item.id)).map((item) => item.id);
  return { hit: ids.length, total: rows.length, ids };
};

export function scoreK0(fixture: K0Fixture, arm: BandArm, mode: K0Mode): K0Score {
  const held = new Set(fixture.rows.filter((item) => heldBy(arm, item, mode)).map((item) => item.id));
  const contradicts = fixture.rows.filter((item) => item.label === "contradicts");
  const below = (item: K0Row) => !inBand(item, mode);
  const wrong = fixture.rows.filter((item) => item.label === "agrees" || item.label === "distinct");
  return {
    held: [...held].sort(),
    recall: {
      all: rate(contradicts, held),
      es: rate(contradicts.filter((item) => item.lang === "es"), held),
      inBand: rate(contradicts.filter((item) => !below(item)), held),
      belowBand: rate(contradicts.filter(below), held),
      belowNegation: rate(contradicts.filter((item) => below(item) && item.form === "negation"), held),
      belowNegationEs: rate(contradicts.filter((item) => below(item) && item.form === "negation" && item.lang === "es"), held),
      belowPlain: rate(contradicts.filter((item) => below(item) && item.form === "plain"), held),
    },
    falseHold: { all: rate(wrong, held), es: rate(wrong.filter((item) => item.lang === "es"), held), belowBand: rate(wrong.filter(below), held) },
    update: rate(fixture.rows.filter((item) => item.label === "update"), held),
  };
}

export const ORDINARY_FILLERS = [
  "Arin carries two curved daggers.",
  "Ponticius keeps the guild ledger locked.",
  "Rain fell on the eastern hills all week.",
  "The market sells dried figs cheaply.",
  "A grey mare waits tied near the inn.",
  "Wolves were heard beyond the northern ridge.",
];

export type OrdinaryOutcome = "soft-mark" | "superseded" | "dropped" | "confirmed" | "none";

export function ordinaryOutcome(item: K0Row, mode: K0Mode): OrdinaryOutcome {
  const older = row("older", item.established);
  const newer = row("newer", item.claim, { createdAt: 1, messageId: 4 });
  const group = [older, newer, ...ORDINARY_FILLERS.map((text, index) => row(`filler-${index}`, text, { createdAt: 2 + index }))];
  const vectors = vectorsFor(item, mode);
  const jaccard = buildJaccardMatchSets(group);
  const matches = vectors ? { dup: jaccard.dup.map((_, index) => new Set(index < 2 ? [...vectors.dup[index]] : [])), sameTopic: jaccard.sameTopic.map((_, index) => new Set(index < 2 ? [...vectors.sameTopic[index]] : [])) } : jaccard;
  const result = consolidateTier(group, matches);
  const pair = (left: string, right: string) => (left === "older" && right === "newer") || (left === "newer" && right === "older");
  if (result.uncertain.some((entry) => pair(entry.candidateId, entry.existingId))) return "soft-mark";
  if (result.supersededPairs.some((entry) => pair(entry.loserId, entry.winnerId))) return "superseded";
  if (result.droppedIds.includes("newer") || result.droppedIds.includes("older")) return "dropped";
  if (result.confirmedIds.includes("older") || result.confirmedIds.includes("newer")) return "confirmed";
  return "none";
}

export const classCounts =(fixture: K0Fixture, mode: K0Mode) =>
  fixture.rows.reduce<Record<string, number>>((counts, item) => {
    const key = `${item.label}${item.form ? `:${item.form}` : ""}:${inBand(item, mode) ? "in" : "below"}`;
    return { ...counts, [key]: (counts[key] ?? 0) + 1 };
  }, {});
