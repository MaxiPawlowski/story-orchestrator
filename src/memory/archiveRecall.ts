import { estimateTokens } from "./budget";
import { nearDuplicateIds } from "./inject";
import { isLive } from "./provenance";
import { DEFAULT_SCORE_WEIGHTS, scoreEntry, type ScoreContext } from "./score";
import type { ChapterRecord, MemoryEntry } from "./types";

export const RECALL_LIMIT = 4;
export const DEFAULT_RECALL_TOKENS = 200;

export interface RecallLine {
  entryId: string;
  recordId: string;
  text: string;
}

export interface RecallOptions {
  limit?: number;
  tokens?: number;
  semantic?: ReadonlySet<string> | null;
}

const lower = (value: string) => value.trim().toLowerCase();

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const named = (text: string, entity: string) => entity.length >= 2 && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(entity)}($|[^\\p{L}\\p{N}])`, "iu").test(text);

const archived = (entry: MemoryEntry) => Boolean(entry.foldedInto) && !entry.supersededBy && isLive(entry);

export function recallMentions(entries: readonly MemoryEntry[], text: string): string[] {
  if (!text.trim()) return [];
  const entities = new Set(entries.filter(archived).flatMap((entry) => entry.entities.map(lower).filter(Boolean)));
  return [...entities].filter((entity) => named(text, entity)).sort();
}

export function recallCandidates(entries: readonly MemoryEntry[], text: string): MemoryEntry[] {
  const mentioned = new Set(recallMentions(entries, text));
  return mentioned.size ? entries.filter((entry) => archived(entry) && entry.entities.some((entity) => mentioned.has(lower(entity)))) : [];
}

export function selectRecall(candidates: readonly MemoryEntry[], records: readonly ChapterRecord[], context: ScoreContext, options: RecallOptions = {}): RecallLine[] {
  const titles = new Map(records.map((record) => [record.id, record.playerTitle]));
  const semantic = options.semantic ?? null;
  const weight = context.weights?.semanticSimilarity ?? DEFAULT_SCORE_WEIGHTS.semanticSimilarity;
  const aboutWeight = context.weights?.entityOverlap ?? DEFAULT_SCORE_WEIGHTS.entityOverlap;
  const named = new Set(context.turnEntities.map(lower));
  const about = (entry: MemoryEntry) => (entry.entities.length === 1 && named.has(lower(entry.entities[0])) ? aboutWeight : 0);
  const archivedRows = candidates.filter((entry) => entry.foldedInto && titles.has(entry.foldedInto));
  const repeats = nearDuplicateIds(archivedRows);
  const scored = archivedRows
    .filter((entry) => !repeats.has(entry.id))
    .map((entry, index) => ({
      entry, index,
      score: about(entry) + (semantic ? scoreEntry(entry, { ...context, turnText: "" }) + (semantic.has(entry.id) ? weight : 0) : scoreEntry(entry, context)),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const lines: RecallLine[] = [];
  let used = 0;
  for (const { entry } of scored) {
    if (lines.length >= (options.limit ?? RECALL_LIMIT)) break;
    const text = `Recalled from ${titles.get(entry.foldedInto as string)}: ${entry.text}`;
    const cost = estimateTokens(text);
    if (used + cost > (options.tokens ?? DEFAULT_RECALL_TOKENS)) continue;
    lines.push({ entryId: entry.id, recordId: entry.foldedInto as string, text });
    used += cost;
  }
  return lines;
}

export const renderRecall = (lines: readonly RecallLine[]): string => lines.map((line) => line.text).join("\n");
