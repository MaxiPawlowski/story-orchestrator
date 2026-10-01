import { estimateTokens } from "./budget";
import type { ChapterRecord, EraLine } from "./types";

export const CHRONICLE_BUDGET_ARMS = [400, 700, 1000] as const;
export const DEFAULT_CHRONICLE_TOKENS = 700;
export const CHRONICLE_RECORD_CAP = 64;
export const ERA_MERGE_SPAN = 5;

export type ChronicleForm = "summary" | "short" | "era";

export interface ChronicleLine {
  ids: string[];
  form: ChronicleForm;
  text: string;
}

export interface Chronicle {
  lines: ChronicleLine[];
  text: string;
  tokens: number;
  fits: boolean;
}

const lineText = (record: ChapterRecord, form: "summary" | "short") => `${record.playerTitle}: ${form === "summary" ? record.summary : record.short}`;

const eraText = (era: EraLine) => `Earlier: ${era.text}`;

const joined = (lines: ChronicleLine[]) => lines.map((line) => line.text).join("\n");

export function uncoveredRecords(records: readonly ChapterRecord[], eras: readonly EraLine[]): ChapterRecord[] {
  const covered = new Set(eras.flatMap((era) => era.recordIds));
  return records.filter((record) => !covered.has(record.id));
}

export function renderChronicle(records: readonly ChapterRecord[], eras: readonly EraLine[], budget: number, count: (text: string) => number = estimateTokens): Chronicle {
  const open = uncoveredRecords(records, eras);
  const forms: Array<"summary" | "short"> = open.map(() => "summary");
  const build = (): ChronicleLine[] => [
    ...eras.map((era) => ({ ids: [...era.recordIds], form: "era" as const, text: eraText(era) })),
    ...open.map((record, index) => ({ ids: [record.id], form: forms[index], text: lineText(record, forms[index]) })),
  ];
  let lines = build();
  for (let index = 0; index < open.length - 1 && count(joined(lines)) > budget; index += 1) {
    forms[index] = "short";
    lines = build();
  }
  const text = joined(lines);
  const tokens = count(text);
  return { lines, text, tokens, fits: tokens <= budget };
}

export function eraCandidates(records: readonly ChapterRecord[], eras: readonly EraLine[], span = ERA_MERGE_SPAN): ChapterRecord[] {
  const open = uncoveredRecords(records, eras);
  return open.slice(0, Math.max(0, Math.min(span, open.length - 1)));
}

export function buildEraMergePrompt(records: readonly ChapterRecord[]): string {
  return [
    "Write plain TEXT ONLY. Do NOT continue the roleplay. You are compressing a story's history.",
    "Fold the chapter lines below into ONE sentence of at most 60 words, past tense, oldest first. Keep every name as written. Invent nothing.",
    "",
    ...records.map((record) => `- ${record.playerTitle}: ${record.short}`),
  ].join("\n");
}

export const eraMessageId = (records: readonly ChapterRecord[]): number => Math.max(-1, ...records.map((record) => record.sealedAt.messageId));

export const fallbackEraText =(records: readonly ChapterRecord[]): string => records.map((record) => record.short).join(" ");

export function parseEraLine(text: string): string | null {
  const line = text.split(/\n+/).map((part) => part.trim()).find(Boolean) ?? "";
  const clean = line.replace(/^[-*\s]+/, "").trim();
  return clean.split(/\s+/).length <= 90 && clean.length > 0 ? clean : null;
}

export function chronicleMarkdown(title: string, records: readonly ChapterRecord[], options: { author: boolean; number?: (record: ChapterRecord) => number }): string {
  const parts = [`# ${title}`, ""];
  records.forEach((record, index) => {
    parts.push(`## ${options.number?.(record) ?? index + 1}. ${record.playerTitle}`, "", record.summary, "");
    if (record.epilogue) parts.push("### Epilogue", "", record.epilogue, "");
    if (options.author && record.consequences.length) {
      parts.push("### Consequences", "", ...record.consequences.map((item) => `- ${item.text}${item.sources.length ? ` [${item.sources.join(", ")}]` : ""}`), "");
    }
  });
  return parts.join("\n").trimEnd() + "\n";
}
