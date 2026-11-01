import { RELATIONSHIP_TOWARD_PLAYER, type NormalizedStory } from "@engine/index";
import { neighbourSet, resolveNeighbour, selectNeighbours, type NeighbourRow } from "@memory/neighbours";
import type { MemoryEntry, ParsedMemoryLine } from "@memory/types";
import { evidenceSources } from "./evidence";
import type { ParsedDelta, ParsedFact, ReadTagOptions, ScopedQuality, SharedReadContract, SharedReadWindow } from "./types";

export interface ReadMemory {
  entries: MemoryEntry[];
  neighbours: boolean;
  keys: boolean;
  relations: boolean;
  acts: boolean;
}

export interface ReadMemoryParts {
  contract: Pick<SharedReadContract, "neighbours" | "readTags">;
  rows: NeighbourRow[] | null;
}

export const NEIGHBOUR_ALIAS_UNKNOWN = "unknown memory label (kept as a new line)";

const windowText = (window: SharedReadWindow) => window.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n");

export function readMemoryParts(memory: ReadMemory | null | undefined, window: SharedReadWindow, scope: readonly ScopedQuality[],
  options: { deltasOnly?: boolean; capable?: boolean }): ReadMemoryParts {
  if (!memory) return { contract: {}, rows: null };
  const full = !options.deltasOnly;
  const set = full && memory.neighbours ? neighbourSet(selectNeighbours(memory.entries, windowText(window))) : null;
  const tags: ReadTagOptions = {
    ...(full && memory.keys ? { keys: true } : {}),
    ...(full && memory.relations && options.capable ? { relations: true } : {}),
    ...(memory.acts && scope.some((entry) => entry.key.startsWith("rel_")) ? { acts: true } : {}),
  };
  return { contract: { ...(set ? { neighbours: [set.section] } : {}), ...(Object.keys(tags).length ? { readTags: tags } : {}) }, rows: set?.rows ?? null };
}

export function resolveReadLines(facts: ParsedFact[], memory: ParsedMemoryLine[], rows: readonly NeighbourRow[] | null) {
  const rejected: Array<{ line: string; reason: string }> = [];
  const resolve = <T extends ParsedFact | ParsedMemoryLine>(line: T): T => {
    const { line: resolved, unknown } = resolveNeighbour(line, rows);
    if (unknown) rejected.push({ line: `${line.neighbour?.kind}=${line.neighbour?.id} ${line.text}`, reason: NEIGHBOUR_ALIAS_UNKNOWN });
    return resolved;
  };
  return { facts: facts.map(resolve), memory: memory.map(resolve), rejected };
}

export interface RelationPair {
  holder: string;
  toward: string;
}

export const relationPairOf = (story: Pick<NormalizedStory, "life">, key: string): RelationPair | null => {
  for (const member of story.life?.members ?? []) {
    for (const relationship of member.relationships) {
      if (relationship.axes.some((axis) => `rel_${member.id}_${relationship.toward}_${axis}` === key)) return { holder: member.id, toward: relationship.toward };
    }
  }
  return null;
};

export const ACT_NEEDS_PLAYER_LINE = "act by the player without the player's own line as evidence (act dropped, feeling kept)";

export function screenActs(accepted: ParsedDelta[], story: Pick<NormalizedStory, "life">, window: SharedReadWindow): { accepted: ParsedDelta[]; notes: Array<{ line: string; reason: string }> } {
  const notes: Array<{ line: string; reason: string }> = [];
  const screened = accepted.map((entry) => {
    if (!entry.delta.act) return entry;
    const pair = relationPairOf(story, entry.delta.q);
    const byPlayer = pair?.toward === RELATIONSHIP_TOWARD_PLAYER;
    const playerLine = evidenceSources(entry.evidence, window.messages).some((id) => window.messages.some((message) => message.messageId === id && message.isUser));
    if (pair && (!byPlayer || playerLine)) return entry;
    const { act: _act, ...delta } = entry.delta;
    if (byPlayer) notes.push({ line: entry.line ?? `${entry.delta.q} act=${entry.delta.act}`, reason: ACT_NEEDS_PLAYER_LINE });
    return { ...entry, delta };
  });
  return { accepted: screened, notes };
}
