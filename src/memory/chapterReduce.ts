import type { ChapterInput, ChapterInputItem } from "./chapterInput";
import type { ParsedChapterRecord } from "./chapterRecord";

export const CHAPTER_ITEM_KINDS: ReadonlyArray<ChapterInputItem["kind"]> = ["scene", "arc", "fact", "detail", "ledger", "state"];
export const MAP_BOUNDS = { lines: 16, words: 30 } as const;

export interface ChapterDigest {
  items: ChapterInputItem[];
  sources: Map<string, string[]>;
}

export interface ReducedChapterInput {
  input: ChapterInput;
  sources: Map<string, string[]>;
}

export function chunkChapterItems(items: readonly ChapterInputItem[], fits: (chunk: ChapterInputItem[]) => boolean, maxChunks: number): ChapterInputItem[][] {
  const chunks: ChapterInputItem[][] = [];
  let current: ChapterInputItem[] = [];
  items.forEach((item) => {
    if (current.length && !fits([...current, item])) {
      chunks.push(current);
      current = [];
    }
    current.push(item);
  });
  if (current.length) chunks.push(current);
  const limit = Math.max(1, maxChunks);
  if (chunks.length <= limit) return chunks;
  const size = Math.ceil(items.length / limit);
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function buildChapterMapPrompt(storyTitle: string, chapterTitle: string, chunk: readonly ChapterInputItem[], part: number, parts: number): string {
  const kinds = CHAPTER_ITEM_KINDS.filter((kind) => chunk.some((item) => item.kind === kind));
  return [
    "Write plain TEXT ONLY. Do NOT continue the roleplay or speak as any character.",
    `You are condensing part ${part} of ${parts} of the notes of a finished chapter, so its record can be written from all of them.`,
    "Keep every person, place, outcome and change. Merge notes that say the same thing. Invent nothing.",
    "Write one line per condensed note, in this form:",
    "- (<kind>) <condensed note> [src: <input id>, <input id>]",
    `Keep each note's kind. Every one of these kinds must appear at least once: ${kinds.join(", ")}.`,
    `Write at most ${MAP_BOUNDS.lines} lines of at most ${MAP_BOUNDS.words} words each, in story order, then stop.`,
    "",
    `STORY: ${storyTitle}`,
    `CHAPTER: ${chapterTitle}`,
    "",
    "INPUTS:",
    ...chunk.map((item) => `[${item.id}] (${item.kind}) ${item.text}`),
  ].join("\n");
}

const clipWords = (text: string, max: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}…`;
};

const fallbackLine = (part: number, index: number, kind: ChapterInputItem["kind"], rows: readonly ChapterInputItem[]): [ChapterInputItem, string[]] => [
  { id: `p${part}.${kind}.${index}`, kind, text: clipWords(rows.map((row) => clipWords(row.text, 30)).join("; "), 120) },
  rows.map((row) => row.id),
];

export function parseChapterDigest(text: string, chunk: readonly ChapterInputItem[], part: number): ChapterDigest {
  const ids = new Set(chunk.map((item) => item.id));
  const kinds = new Set<string>(CHAPTER_ITEM_KINDS);
  const items: ChapterInputItem[] = [];
  const sources = new Map<string, string[]>();
  text.replace(/\r/g, "").split("\n").forEach((raw) => {
    const line = raw.trim().match(/^[-*•]\s*\((\w+)\)\s*(.+)$/);
    if (!line || !kinds.has(line[1].toLowerCase())) return;
    const kind = line[1].toLowerCase() as ChapterInputItem["kind"];
    const cite = line[2].match(/\[src:\s*([^\]]*)\]\s*$/i);
    const body = (cite ? line[2].slice(0, cite.index) : line[2]).trim();
    if (!body) return;
    const cited = cite ? cite[1].split(",").map((id) => id.trim()).filter((id) => ids.has(id)) : [];
    const id = `p${part}.${items.length + 1}`;
    items.push({ id, kind, text: body });
    sources.set(id, cited.length ? cited : chunk.filter((item) => item.kind === kind).map((item) => item.id));
  });
  CHAPTER_ITEM_KINDS.forEach((kind) => {
    const rows = chunk.filter((item) => item.kind === kind);
    if (!rows.length || items.some((item) => item.kind === kind)) return;
    const [item, cited] = fallbackLine(part, items.length + 1, kind, rows);
    items.push(item);
    sources.set(item.id, cited);
  });
  return { items, sources };
}

export function reduceChapterInput(raw: ChapterInput, digests: readonly ChapterDigest[]): ReducedChapterInput {
  const sources = new Map<string, string[]>();
  digests.forEach((digest) => digest.sources.forEach((ids, id) => sources.set(id, ids)));
  return { input: { ...raw, items: digests.flatMap((digest) => digest.items) }, sources };
}

export function clipChapterInput(input: ChapterInput, fits: (input: ChapterInput) => boolean, floor = 40): ChapterInput {
  let items = input.items;
  const limit = input.items.length * 12 + 16;
  for (let guard = 0; guard < limit && !fits({ ...input, items }); guard += 1) {
    const longest = items.reduce((best, item, index) => (item.text.length > items[best].text.length ? index : best), 0);
    const target = items[longest];
    if (!target || target.text.length <= floor) break;
    const cut = target.text.slice(0, Math.max(floor, Math.floor(target.text.length * 0.75)));
    items = items.map((item, index) => (index === longest ? { ...item, text: `${cut.slice(0, Math.max(cut.lastIndexOf(" "), floor)).trimEnd()}…` } : item));
  }
  return { ...input, items };
}

export const kindsOf = (input: ChapterInput): Set<ChapterInputItem["kind"]> => new Set(input.items.map((item) => item.kind));

export function expandChapterSources(record: ParsedChapterRecord, sources: ReadonlyMap<string, string[]>): ParsedChapterRecord {
  if (!sources.size) return record;
  return {
    ...record,
    consequences: record.consequences.map((item) => ({ ...item, sources: [...new Set(item.sources.flatMap((id) => sources.get(id) ?? [id]))] })),
  };
}
