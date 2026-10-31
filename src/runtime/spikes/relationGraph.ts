import { isLive } from "@memory/provenance";
import { foldName } from "@memory/nameFold";
import { contentWords, wordSimilarity } from "@memory/words";
import type { LedgerEntry, MemoryEntry } from "@memory/types";

export const RELATION_TOP_K = 4;
export const ONE_HOP_WEIGHT = 0.5;
export const SEED_WEIGHT = 1;
export const RELATION_FLOORS = { twoHopRecallAt4: 0.75, twoHopGainOverZeroHop: 0.25, distractorsPerCaseMax: 0.5, distractorSlackOverZeroHop: 0.25 } as const;

export interface GraphRow {
  id: string;
  text: string;
  nodes: string[];
  order: number;
}

export interface RelationGraph {
  rows: GraphRow[];
  names: Map<string, string>;
  adjacency: Map<string, Map<string, number>>;
  rowsByNode: Map<string, string[]>;
}

export interface GraphSource {
  memory: readonly Pick<MemoryEntry, "id" | "text" | "entities" | "provenance" | "supersededBy" | "evictedAt">[];
  ledger: readonly Pick<LedgerEntry, "id" | "entity" | "field" | "value" | "supersedes" | "provenance">[];
  fold?: (name: string) => string;
}

const liveMemory = (entry: GraphSource["memory"][number]) => isLive(entry) && !entry.supersededBy && !entry.evictedAt;

const liveLedger = (rows: GraphSource["ledger"]) => {
  const replaced = new Set(rows.flatMap((row) => (row.supersedes ? [row.supersedes] : [])));
  return rows.filter((row) => isLive(row) && !replaced.has(row.id));
};

const link = (adjacency: RelationGraph["adjacency"], left: string, right: string) => {
  if (left === right) return;
  for (const [from, to] of [[left, right], [right, left]] as const) {
    const edges = adjacency.get(from) ?? new Map<string, number>();
    edges.set(to, (edges.get(to) ?? 0) + 1);
    adjacency.set(from, edges);
  }
};

export function buildRelationGraph(source: GraphSource): RelationGraph {
  const fold = source.fold ?? foldName;
  const names = new Map<string, string>();
  const node = (name: string) => {
    const key = fold(name);
    if (key && !names.has(key)) names.set(key, name.trim());
    return key;
  };
  const rows: GraphRow[] = [];
  for (const entry of source.memory.filter(liveMemory)) rows.push({ id: entry.id, text: entry.text, nodes: [...new Set(entry.entities.map(node).filter(Boolean))], order: rows.length });
  const ledger = liveLedger(source.ledger);
  for (const row of ledger) node(row.entity);
  for (const row of ledger) {
    const subject = node(row.entity);
    const object = names.has(fold(row.value)) ? fold(row.value) : null;
    rows.push({ id: row.id, text: `${row.entity} ${row.field}: ${row.value}`, nodes: object ? [subject, object] : [subject], order: rows.length });
  }
  const adjacency: RelationGraph["adjacency"] = new Map();
  const rowsByNode: RelationGraph["rowsByNode"] = new Map();
  for (const row of rows) {
    row.nodes.forEach((left, index) => row.nodes.slice(index + 1).forEach((right) => link(adjacency, left, right)));
    for (const key of row.nodes) rowsByNode.set(key, [...(rowsByNode.get(key) ?? []), row.id]);
  }
  return { rows, names, adjacency, rowsByNode };
}

const boundary = (text: string, name: string): boolean => {
  const at = text.indexOf(name);
  if (at < 0) return false;
  const before = at === 0 ? " " : text[at - 1] ?? " ";
  const after = text[at + name.length] ?? " ";
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
};

export const querySeeds = (graph: RelationGraph, query: string, fold: (name: string) => string = foldName): string[] => {
  const folded = ` ${fold(query)} `;
  return [...graph.names.keys()].filter((key) => key.length > 1 && boundary(folded, key)).sort();
};

const hubDamp = (graph: RelationGraph, key: string): number => 1 / Math.log2(2 + (graph.rowsByNode.get(key)?.length ?? 0));

export interface NodeMass {
  key: string;
  mass: number;
  hop: 0 | 1;
}

export const expandSeeds = (graph: RelationGraph, seeds: readonly string[], hops: 0 | 1): NodeMass[] => {
  const mass = new Map<string, NodeMass>();
  for (const key of seeds) mass.set(key, { key, mass: SEED_WEIGHT * hubDamp(graph, key), hop: 0 });
  if (hops === 1) {
    for (const seed of seeds) {
      for (const neighbour of [...(graph.adjacency.get(seed)?.keys() ?? [])].sort()) {
        if (mass.has(neighbour) && mass.get(neighbour)?.hop === 0) continue;
        const add = ONE_HOP_WEIGHT * hubDamp(graph, neighbour) * hubDamp(graph, seed);
        const kept = mass.get(neighbour);
        mass.set(neighbour, { key: neighbour, mass: (kept?.mass ?? 0) + add, hop: 1 });
      }
    }
  }
  return [...mass.values()];
};

export interface RankedRow {
  id: string;
  score: number;
}

export function rankRows(graph: RelationGraph, query: string, hops: 0 | 1, extraSeeds: readonly string[] = [], fold: (name: string) => string = foldName): RankedRow[] {
  const seeds = [...new Set([...querySeeds(graph, query, fold), ...extraSeeds.map(fold)])].filter((key) => graph.names.has(key));
  const masses = new Map(expandSeeds(graph, seeds, hops).map((entry) => [entry.key, entry.mass]));
  const words = contentWords(query);
  return graph.rows
    .map((row) => ({ row, score: wordSimilarity(words, contentWords(row.text)) + row.nodes.reduce((sum, key) => sum + (masses.get(key) ?? 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.row.order - right.row.order)
    .map((entry) => ({ id: entry.row.id, score: Number(entry.score.toFixed(6)) }));
}

export interface RelationCase {
  id: string;
  query: string;
  gold: string[];
  direct: string[];
  distractors: string[];
}

export interface RelationArmMetrics {
  cases: number;
  twoHopRecallAt4: number;
  directRecallAt4: number;
  distractorsPerCase: number;
}

const recall = (top: readonly string[], ids: readonly string[]) => (ids.length ? ids.filter((id) => top.includes(id)).length / ids.length : 1);
const mean = (values: number[]) => (values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : 0);

export function scoreRelationArm(graph: RelationGraph, cases: readonly RelationCase[], hops: 0 | 1): RelationArmMetrics {
  const tops = cases.map((entry) => rankRows(graph, entry.query, hops).slice(0, RELATION_TOP_K).map((row) => row.id));
  return {
    cases: cases.length,
    twoHopRecallAt4: mean(cases.map((entry, index) => recall(tops[index] ?? [], entry.gold))),
    directRecallAt4: mean(cases.map((entry, index) => recall(tops[index] ?? [], entry.direct))),
    distractorsPerCase: mean(cases.map((entry, index) => entry.distractors.filter((id) => (tops[index] ?? []).includes(id)).length)),
  };
}

export interface RelationVerdict {
  twoHopRecall: boolean;
  twoHopGain: boolean;
  distractors: boolean;
  ok: boolean;
}

export const relationVerdict = (zero: RelationArmMetrics, one: RelationArmMetrics): RelationVerdict => {
  const twoHopRecall = one.twoHopRecallAt4 >= RELATION_FLOORS.twoHopRecallAt4;
  const twoHopGain = one.twoHopRecallAt4 - zero.twoHopRecallAt4 >= RELATION_FLOORS.twoHopGainOverZeroHop - 1e-9;
  const distractors = one.distractorsPerCase <= RELATION_FLOORS.distractorsPerCaseMax && one.distractorsPerCase - zero.distractorsPerCase <= RELATION_FLOORS.distractorSlackOverZeroHop + 1e-9;
  return { twoHopRecall, twoHopGain, distractors, ok: twoHopRecall && twoHopGain && distractors };
};

export interface GraphProjection {
  nodes: Array<{ name: string; degree: number; rows: number }>;
  edges: Array<{ from: string; to: string; weight: number }>;
}

export const projectGraph = (graph: RelationGraph): GraphProjection => ({
  nodes: [...graph.names.entries()]
    .map(([key, name]) => ({ name, degree: graph.adjacency.get(key)?.size ?? 0, rows: graph.rowsByNode.get(key)?.length ?? 0 }))
    .sort((left, right) => left.name.localeCompare(right.name)),
  edges: [...graph.adjacency.entries()].flatMap(([from, edges]) => [...edges.entries()].filter(([to]) => from < to)
    .map(([to, weight]) => ({ from: graph.names.get(from) ?? from, to: graph.names.get(to) ?? to, weight }))),
});
