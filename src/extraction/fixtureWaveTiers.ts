import type { NormalizedStory } from "@engine/index";
import { RELATION_ENTITY_TYPE } from "@memory/parse";
import { RELATION_ENDED_VALUE } from "@memory/relations";
import type { NeighbourRow } from "@memory/neighbours";
import type { parseSharedReadResponse } from "./parse";
import { screenActs } from "./readMemory";
import type { SharedReadWindow } from "./types";

export interface WaveTiers {
  neighbours: Array<{ alias: string; id: string }>;
  tagged: Array<{ text: string; kind: "same" | "update"; id: string | null }>;
  keyed: Array<{ text: string; keys: string[] }>;
  keyable: number;
  relations: Array<{ subject: string; relation: string; object: string; ended: boolean }>;
  acts: Array<{ q: string; act: string }>;
  actsDropped: number;
}

type Parsed = ReturnType<typeof parseSharedReadResponse>;

export function waveTiers(parsed: Parsed, story: Pick<NormalizedStory, "life">, window: SharedReadWindow, rows: readonly NeighbourRow[] | null): WaveTiers {
  const lines = [...parsed.facts, ...parsed.memory];
  const tagged = lines.flatMap((line) => {
    if (!line.neighbour) return [];
    const row = rows?.find((candidate) => candidate.alias === line.neighbour?.id);
    return [{ text: line.text, kind: line.neighbour.kind, id: row?.id ?? null }];
  });
  const screened = screenActs(parsed.deltas, story, window);
  const acts = screened.accepted.flatMap((entry) => (entry.delta.act ? [{ q: entry.delta.q, act: entry.delta.act }] : []));
  return {
    neighbours: (rows ?? []).map((row) => ({ alias: row.alias, id: row.id })),
    tagged,
    keyed: lines.flatMap((line) => (line.keys?.length ? [{ text: line.text, keys: line.keys }] : [])),
    keyable: lines.length,
    relations: parsed.ledger.flatMap((row) => (row.entityType === RELATION_ENTITY_TYPE && row.object
      ? [{ subject: row.entity, relation: row.field, object: row.object, ended: row.value === RELATION_ENDED_VALUE }] : [])),
    acts,
    actsDropped: parsed.deltas.filter((entry) => entry.delta.act).length - acts.length,
  };
}
