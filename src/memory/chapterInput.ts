import type { ArcEntry, ChapterRecord, LedgerEntry, MemoryEntry } from "./types";
import { isLive } from "./provenance";

export interface ChapterInputItem {
  id: string;
  kind: "scene" | "arc" | "fact" | "detail" | "ledger" | "state";
  text: string;
}

export interface ChapterInputSources {
  range: { from: number; to: number };
  entries: readonly MemoryEntry[];
  arcs: readonly ArcEntry[];
  ledger: readonly LedgerEntry[];
  blackboardBefore: Readonly<Record<string, unknown>>;
  blackboardAfter: Readonly<Record<string, unknown>>;
  places: string[];
  roster: Array<{ id: string; name: string }>;
  previous: ChapterRecord | null;
}

export interface ChapterInput {
  items: ChapterInputItem[];
  openArcs: ArcEntry[];
  blackboardDelta: Record<string, { from: unknown; to: unknown }>;
  places: string[];
  roster: Array<{ id: string; name: string }>;
  previous: ChapterRecord | null;
}

const within = (messageId: number | undefined, range: { from: number; to: number }) =>
  typeof messageId === "number" && messageId >= range.from && messageId <= range.to;

const usable = (entry: MemoryEntry) => isLive(entry) && !entry.supersededBy && !entry.foldedInto;

export function blackboardDiff(before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): Record<string, { from: unknown; to: unknown }> {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return Object.fromEntries(keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]));
}

export function assembleChapterInput(sources: ChapterInputSources): ChapterInput {
  const { range } = sources;
  const items: ChapterInputItem[] = [];
  sources.entries.filter((entry) => usable(entry) && within(entry.messageId, range)).forEach((entry) => {
    if (entry.tier === "scene_history") items.push({ id: entry.id, kind: "scene", text: entry.text });
    else if (entry.tier === "facts") items.push({ id: entry.id, kind: "fact", text: entry.text });
    else if (entry.tier === "session_details") items.push({ id: entry.id, kind: "detail", text: entry.text });
  });
  sources.arcs.filter((arc) => !arc.foldedInto && arc.summary && (within(arc.openedMessageId, range) || within(arc.resolvedMessageId, range)))
    .forEach((arc) => items.push({ id: arc.id, kind: "arc", text: `${arc.text} — ${arc.summary}` }));
  const latest = new Map<string, LedgerEntry>();
  sources.ledger.filter((row) => within(row.messageId, range) && isLive(row)).forEach((row) => latest.set(`${row.entity}|${row.field}`, row));
  latest.forEach((row) => items.push({ id: row.id, kind: "ledger", text: `${row.entity} ${row.field}: ${row.value}` }));
  const blackboardDelta = blackboardDiff(sources.blackboardBefore, sources.blackboardAfter);
  Object.entries(blackboardDelta).forEach(([key, change]) => items.push({ id: `q:${key}`, kind: "state", text: `${key}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}` }));
  return {
    items,
    openArcs: sources.arcs.filter((arc) => arc.status === "open"),
    blackboardDelta,
    places: sources.places,
    roster: sources.roster,
    previous: sources.previous,
  };
}

export const inputText = (input: ChapterInput): string => [
  ...input.items.map((item) => item.text),
  ...input.openArcs.map((arc) => arc.text),
  ...input.places,
  ...input.roster.map((member) => member.name),
  ...(input.previous ? [input.previous.summary, ...input.previous.people.map((person) => `${person.name} ${person.text}`)] : []),
].join("\n");
