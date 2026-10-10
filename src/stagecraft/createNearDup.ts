import { PATCH_ANCHOR_SEPARATOR, type CuratorEntryView, type NearDup, type NearDupBand } from "./types";

export interface NearDupSubject {
  comment: string;
  keys: string[];
  content: string;
}

export const CREATE_NEAR_DUP_VECTOR_BANDS = { duplicate: 0.82, sameTopic: 0.55 } as const;
export const CREATE_NEAR_DUP_TRIGRAM_BANDS = { duplicate: 0.45, sameTopic: 0.25 } as const;
export const CREATE_NEAR_DUP_LIMIT = 3;

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "and", "to", "in", "on", "at", "his", "her", "its", "it", "is", "who", "with", "for", "by", "one", "only",
  "every", "each", "after", "before", "when", "their", "they", "that", "this", "as", "be", "are", "was", "from", "into", "inside",
  "any", "your", "you", "over", "around", "asks", "run",
]);

const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const words = (value: string) => fold(value).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word && !STOP_WORDS.has(word)).join(" ");

const plain = (value: string) => fold(value).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const trigrams = (value: string): Set<string> => {
  const text = ` ${plain(value)} `;
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= text.length; index += 1) grams.add(text.slice(index, index + 3));
  return grams;
};

export const trigramJaccard = (left: string, right: string): number => {
  const a = trigrams(left);
  const b = trigrams(right);
  if (!plain(left) || !plain(right) || !a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((gram) => { if (b.has(gram)) shared += 1; });
  return shared / (a.size + b.size - shared);
};

const identity = (subject: NearDupSubject) => words([subject.comment, ...subject.keys].join(" "));

export const wordingScore = (left: NearDupSubject, right: NearDupSubject): number =>
  Math.round(Math.max(trigramJaccard(identity(left), identity(right)), trigramJaccard(words(left.content), words(right.content))) * 100) / 100;

const bandFor = (score: number): NearDupBand | null =>
  score >= CREATE_NEAR_DUP_TRIGRAM_BANDS.duplicate ? "duplicate" : score >= CREATE_NEAR_DUP_TRIGRAM_BANDS.sameTopic ? "same-topic" : null;

const rank = (left: NearDup, right: NearDup) => Number(right.band === "duplicate") - Number(left.band === "duplicate") || right.score - left.score;

export function wordingNearDups(subject: NearDupSubject, entries: CuratorEntryView[]): NearDup[] {
  return entries.flatMap((entry): NearDup[] => {
    const score = wordingScore(subject, entry);
    const band = bandFor(score);
    return band ? [{ comment: entry.comment, score, band, via: "wording" }] : [];
  }).sort(rank).slice(0, CREATE_NEAR_DUP_LIMIT);
}

export const nearDupText = (subject: NearDupSubject): string => `${subject.comment}${PATCH_ANCHOR_SEPARATOR}${subject.keys.join(", ")}${PATCH_ANCHOR_SEPARATOR}${subject.content}`;

export function vectorNearDups(entries: CuratorEntryView[], duplicate: Set<number>, sameTopic: Set<number>): NearDup[] {
  return entries.flatMap((entry, index): NearDup[] => {
    if (duplicate.has(index)) return [{ comment: entry.comment, score: CREATE_NEAR_DUP_VECTOR_BANDS.duplicate, band: "duplicate", via: "vectors" }];
    if (sameTopic.has(index)) return [{ comment: entry.comment, score: CREATE_NEAR_DUP_VECTOR_BANDS.sameTopic, band: "same-topic", via: "vectors" }];
    return [];
  }).sort(rank).slice(0, CREATE_NEAR_DUP_LIMIT);
}

export function nearDupAdvice(dup: NearDup): string {
  if (dup.band === "duplicate") return `Looks like “${dup.comment}” (${dup.via === "vectors" ? "same meaning" : "same wording"}). Patch “${dup.comment}” instead?`;
  if (dup.band === "same-topic") return `Close to “${dup.comment}” (same topic). A patch to “${dup.comment}” may be enough.`;
  return `may duplicate “${dup.comment}” (${String(Math.round(dup.score * 100))}% alike)`;
}
