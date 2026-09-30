import type { NormalizedStoryV2 } from "@engine/index";
import { estimateTokens } from "@memory/budget";
import { renderChronicle } from "@memory/chronicle";
import type { ArcEntry, ChapterRecord, EraLine } from "@memory/types";
import { chapterOf, playerTitleOf, type ChapterSettings } from "./chapters";

export { chronicleMarkdown } from "@memory/chronicle";

const IGNORE = Symbol.for("ignore");

const clip = (text: string, tokens: number): string => {
  if (estimateTokens(text) <= tokens) return text;
  const cut = text.slice(0, Math.max(0, tokens * 4));
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trimEnd()}…`;
};

export const chapterCanonText = (canon: string): string => canon.replace(/\n?\s*ESTABLISHED FACTS\s*:[\s\S]*$/i, "").trim();

export interface StorySoFarInput {
  records: readonly ChapterRecord[];
  eras: readonly EraLine[];
  canon: string;
  chapterTitle: string | null;
  threads: readonly ArcEntry[];
  settings: ChapterSettings;
}

export function storySoFarText(input: StorySoFarInput): string {
  const { settings } = input;
  const parts: string[] = [];
  if (input.records.length) parts.push(`[The story so far]\n${renderChronicle(input.records, input.eras, settings.chronicleTokens).text}`);
  const chapter = clip(chapterCanonText(input.canon), settings.chapterTokens);
  if (chapter) parts.push(`[This chapter${input.chapterTitle ? `: ${input.chapterTitle}` : ""}]\n${chapter}`);
  const titles = new Map(input.records.map((record) => [record.id, record.playerTitle]));
  const lines: string[] = [];
  let used = 0;
  for (const arc of [...input.threads.filter((thread) => thread.pinned), ...input.threads.filter((thread) => !thread.pinned).reverse()].slice(0, 8)) {
    const origin = arc.originChapter ? titles.get(arc.originChapter) : undefined;
    const line = `- ${arc.text}${origin ? ` (since ${origin})` : ""}`;
    if (used + estimateTokens(line) > settings.threadTokens) break;
    lines.push(line);
    used += estimateTokens(line);
  }
  if (lines.length) parts.push(`[Open threads]\n${lines.join("\n")}`);
  return parts.join("\n\n");
}

export function bridgeText(record: ChapterRecord, next: string | null): string {
  return `The chapter ${record.playerTitle} has ended: ${record.short}${next ? ` A new chapter begins: ${next}.` : ""}`;
}

export interface FoldRow {
  extra?: unknown;
  [key: string]: unknown;
}

export interface FoldOutcome {
  folded: number;
  kept: number;
  missing: number;
}

export function foldRange(records: readonly ChapterRecord[], story: NormalizedStoryV2 | null): Array<{ from: number; to: number }> {
  return records.filter((record) => story?.chapterById?.[record.chapterId]?.seal?.fold_messages !== false).map((record) => {
    const tail = story?.chapterById?.[record.chapterId]?.seal?.keep_tail ?? 6;
    return { from: record.range.from, to: record.range.to - tail };
  }).filter((range) => range.to >= range.from);
}

export function foldRows(rows: FoldRow[], idOf: (row: FoldRow) => number | null, ranges: ReadonlyArray<{ from: number; to: number }>): FoldOutcome {
  const outcome: FoldOutcome = { folded: 0, kept: 0, missing: 0 };
  rows.forEach((row, index) => {
    const id = idOf(row);
    if (id === null) {
      outcome.missing += 1;
      return;
    }
    if (!ranges.some((range) => id >= range.from && id <= range.to)) {
      outcome.kept += 1;
      return;
    }
    const extra = typeof row.extra === "object" && row.extra !== null ? row.extra : {};
    rows[index] = { ...row, extra: { ...extra, [IGNORE]: true } };
    outcome.folded += 1;
  });
  return outcome;
}

export interface Dossier {
  rosterId: string;
  name: string;
  text: string;
  recordId: string;
  playerTitle: string;
  history: Array<{ recordId: string; text: string }>;
}

export function dossiers(records: readonly ChapterRecord[]): Map<string, Dossier> {
  const out = new Map<string, Dossier>();
  records.forEach((record) => record.people.forEach((person) => {
    const previous = out.get(person.rosterId);
    const history = previous ? [...previous.history, { recordId: previous.recordId, text: previous.text }].slice(-4) : [];
    out.set(person.rosterId, { rosterId: person.rosterId, name: person.name, text: person.text, recordId: record.id, playerTitle: record.playerTitle, history });
  }));
  return out;
}

const enabledBy = (story: NormalizedStoryV2, checkpointId: string): string[] => {
  const changes = story.checkpointById[checkpointId]?.effects?.cast_changes as { enable?: unknown } | undefined;
  const enable = changes?.enable;
  return (Array.isArray(enable) ? enable : typeof enable === "string" ? [enable] : []).filter((name): name is string => typeof name === "string").map((name) => name.trim().toLowerCase());
};

export function returningLines(story: NormalizedStoryV2 | null, records: readonly ChapterRecord[], visitedPath: readonly string[], lastMessageId: number, window: number): Map<string, string> {
  const out = new Map<string, string>();
  const last = records[records.length - 1];
  if (!story || !last || lastMessageId - last.range.to > window) return out;
  const since = visitedPath.slice(Math.max(0, last.sealedAt.pathLength - 1));
  const enabled = new Set(since.flatMap((id) => enabledBy(story, id)));
  dossiers(records).forEach((dossier) => {
    if (dossier.recordId === last.id) return;
    const member = story.roster.find((entry) => entry.id === dossier.rosterId);
    const names = [dossier.rosterId, member?.name ?? "", dossier.name].map((name) => name.trim().toLowerCase()).filter(Boolean);
    if (names.some((name) => enabled.has(name))) out.set(dossier.rosterId, `Returning: ${dossier.name} — last seen in ${dossier.playerTitle}: ${dossier.text}`);
  });
  return out;
}

export function chapterListText(story: NormalizedStoryV2 | null, records: readonly ChapterRecord[], activeCheckpointId: string | undefined): string {
  if (!records.length) return "No chapter has ended yet.";
  const current = chapterOf(story, activeCheckpointId);
  const lines = records.map((record, index) => `${index + 1}. ${record.playerTitle} — ${record.short}`);
  if (current && !records.some((record) => record.final)) lines.push(`Now: ${playerTitleOf(current)}`);
  return lines.join("\n");
}
