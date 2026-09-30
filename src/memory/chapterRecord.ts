import { CHAPTER_DISPOSITIONS, type ChapterDisposition, type ChapterRecord } from "./types";
import { inputText, type ChapterInput } from "./chapterInput";

export const CHAPTER_SECTIONS = ["SUMMARY", "SHORT", "CONSEQUENCES", "PEOPLE", "OPEN"] as const;
type Section = typeof CHAPTER_SECTIONS[number];

export interface ParsedChapterRecord {
  summary: string;
  short: string;
  consequences: ChapterRecord["consequences"];
  people: ChapterRecord["people"];
  open: ChapterRecord["open"];
}

export type ChapterParse = { ok: true; record: ParsedChapterRecord } | { ok: false; reason: string };

export function buildChapterRecordPrompt(storyTitle: string, chapterTitle: string, input: ChapterInput, style: "prose" | "chronicle" = "prose", failures: string[] = []): string {
  const lines = (label: string, rows: string[]) => (rows.length ? [`${label}:`, ...rows] : [`${label}: (none)`]);
  return [
    "Write plain TEXT ONLY. Do NOT continue the roleplay or speak as any character. You are writing the record of a finished chapter.",
    `Base every line strictly on the INPUTS. Do not invent people, places or events.${style === "chronicle" ? " Keep the SUMMARY terse, like a chronicle." : ""}`,
    "Output exactly these labelled sections, in this order:",
    "SUMMARY:",
    "[120-220 words, past tense, using names exactly as the inputs write them]",
    "SHORT:",
    "[one or two sentences]",
    "CONSEQUENCES:",
    "- [a durable change the chapter left behind] [src: <input id>, <input id>]",
    "PEOPLE:",
    "- [Name]: [where they stand now, and toward whom]",
    "OPEN:",
    `- [thread id] | ${CHAPTER_DISPOSITIONS.join(" or ")} | [why]`,
    "Every CONSEQUENCES line must end with [src: ...] naming input ids. Name only the listed cast in PEOPLE. Never reveal secrets one character hides from another.",
    ...(failures.length ? ["", "Your previous answer was refused for these reasons; fix them:", ...failures.map((failure) => `- ${failure}`)] : []),
    "",
    `STORY: ${storyTitle}`,
    `CHAPTER: ${chapterTitle}`,
    ...(input.places.length ? [`PLACES VISITED: ${input.places.join(", ")}`] : []),
    `CAST: ${input.roster.map((member) => member.name).join(", ") || "(none)"}`,
    ...(input.previous ? ["", `PREVIOUS CHAPTER (${input.previous.playerTitle}): ${input.previous.short}`, ...input.previous.people.map((person) => `- ${person.name}: ${person.text}`)] : []),
    "",
    ...lines("INPUTS", input.items.map((item) => `[${item.id}] (${item.kind}) ${item.text}`)),
    "",
    ...lines("OPEN THREADS", input.openArcs.map((arc) => `[${arc.id}] ${arc.text}`)),
  ].join("\n");
}

const sectionsOf = (text: string): Partial<Record<Section, string>> => {
  const found: Partial<Record<Section, string>> = {};
  let current: Section | null = null;
  const buffer: string[] = [];
  const flush = () => { if (current) found[current] = buffer.join("\n").trim(); buffer.length = 0; };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const header = raw.trim().replace(/^[#*\s]+|[*\s]+$/g, "").match(/^(SUMMARY|SHORT|CONSEQUENCES|PEOPLE|OPEN)\s*:\s*(.*)$/i);
    if (header) {
      flush();
      current = header[1].toUpperCase() as Section;
      if (header[2].trim()) buffer.push(header[2].trim());
    } else if (current) buffer.push(raw);
  }
  flush();
  return found;
};

const bullets = (text = "") => text.split("\n").map((line) => line.trim()).filter((line) => /^[-*•]/.test(line)).map((line) => line.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);

export function parseChapterRecord(text: string, input: ChapterInput): ChapterParse {
  const sections = sectionsOf(text);
  const summary = sections.SUMMARY?.trim() ?? "";
  const short = sections.SHORT?.trim() ?? "";
  if (!summary) return { ok: false, reason: "no SUMMARY section" };
  if (!short) return { ok: false, reason: "no SHORT section" };
  const consequences = bullets(sections.CONSEQUENCES).map((line) => {
    const cite = line.match(/\[src:\s*([^\]]*)\]\s*$/i);
    const sources = cite ? cite[1].split(",").map((id) => id.trim()).filter(Boolean) : [];
    return { text: (cite ? line.slice(0, cite.index) : line).trim(), sources };
  }).filter((item) => item.text);
  const byName = new Map(input.roster.map((member) => [member.name.toLowerCase(), member]));
  const people = bullets(sections.PEOPLE).flatMap((line) => {
    const split = line.indexOf(":");
    const member = split > 0 ? byName.get(line.slice(0, split).trim().replace(/\*/g, "").toLowerCase()) : undefined;
    const said = split > 0 ? line.slice(split + 1).trim() : "";
    return member && said ? [{ rosterId: member.id, name: member.name, text: said }] : [];
  });
  const arcs = new Map(input.openArcs.map((arc) => [arc.id, arc]));
  const open = bullets(sections.OPEN).flatMap((line) => {
    const [id, disposition] = line.split("|").map((part) => part.trim().replace(/^\[|\]$/g, ""));
    const arc = arcs.get(id);
    return arc && (CHAPTER_DISPOSITIONS as readonly string[]).includes(disposition) ? [{ arcId: arc.id, text: arc.text, disposition: disposition as ChapterDisposition }] : [];
  });
  return { ok: true, record: { summary, short, consequences, people, open } };
}

const STOP = new Set(("I The A An And But Or In On At To Of It He She They We You His Her Their When Then After Before As With By From For").split(" "));

export function properNouns(text: string): string[] {
  const found = new Set<string>();
  text.split(/(?<=[.!?:;])\s+|\n+/).forEach((sentence) => {
    const words = sentence.split(/\s+/).map((word) => word.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, ""));
    words.forEach((word, index) => {
      if (index === 0 || !word || STOP.has(word)) return;
      if (/^\p{Lu}[\p{Ll}'’-]+$/u.test(word)) found.add(word);
    });
  });
  return [...found];
}

export function verifyChapterRecord(record: ParsedChapterRecord, input: ChapterInput, extraKnown: string[] = []): string[] {
  const failures: string[] = [];
  const ids = new Set([...input.items.map((item) => item.id), ...input.openArcs.map((arc) => arc.id)]);
  record.consequences.forEach((item, index) => {
    if (!item.sources.some((id) => ids.has(id))) failures.push(`consequence ${index + 1} cites no input id that exists`);
  });
  const known = `${inputText(input)}\n${extraKnown.join("\n")}`.toLowerCase();
  const invented = properNouns([record.summary, ...record.consequences.map((item) => item.text)].join("\n")).filter((name) => !known.includes(name.toLowerCase()));
  if (invented.length) failures.push(`names not in the inputs: ${invented.join(", ")}`);
  return failures;
}

const words = (text: string, max: number) => {
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.length <= max ? parts.join(" ") : `${parts.slice(0, max).join(" ")}…`;
};

export function degradedChapterRecord(input: ChapterInput): ParsedChapterRecord {
  const scenes = input.items.filter((item) => item.kind === "scene").map((item) => item.text);
  const arcs = input.items.filter((item) => item.kind === "arc");
  const summary = words(scenes.join(" ") || arcs.map((item) => item.text).join(" ") || "This chapter passed without a recorded scene.", 220);
  const short = words(summary.split(/(?<=[.!?])\s+/)[0] ?? summary, 45);
  return {
    summary,
    short,
    consequences: arcs.map((item) => ({ text: item.text, sources: [item.id] })),
    people: [],
    open: input.openArcs.map((arc) => ({ arcId: arc.id, text: arc.text, disposition: "carry" as const })),
  };
}

export function buildSagaPrompt(storyTitle: string, records: readonly ChapterRecord[], outcome: Readonly<Record<string, unknown>>): string {
  return [
    "Write plain TEXT ONLY. Do NOT continue the roleplay. The story below has ended; write its epilogue.",
    "Write 400-700 words, past tense, drawing only on the chapter records and the final state. Keep every name as written. Invent nothing.",
    "",
    `STORY: ${storyTitle}`,
    ...records.flatMap((record, index) => ["", `CHAPTER ${index + 1}: ${record.playerTitle}`, record.summary, ...record.consequences.map((item) => `- ${item.text}`)]),
    "",
    "FINAL STATE:",
    ...Object.entries(outcome).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
  ].join("\n");
}

export function verifySaga(text: string, records: readonly ChapterRecord[], cast: string[]): string[] {
  const recorded = records.flatMap((record) => [record.summary, record.playerTitle, ...record.consequences.map((item) => item.text), ...record.people.map((person) => person.name)]);
  const known = [...recorded, ...cast].join("\n").toLowerCase();
  const invented = properNouns(text).filter((name) => !known.includes(name.toLowerCase()));
  return [...(text.trim().split(/\s+/).length < 120 ? ["the epilogue is too short"] : []), ...(invented.length ? [`names not in the records: ${invented.join(", ")}`] : [])];
}
