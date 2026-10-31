import { isRecord } from "@utils/guards";

export const PHRASE_BAN_KEY = "banned_strings";
export const PHRASE_BAN_CAPABILITY = "so_phrase_bans";
export const PHRASE_BANS_MAX = 200;
export const PHRASE_BAN_CHARS_MAX = 64;
export const PHRASE_BAN_FLOORS = { bannedRateDrop: 0.5, decodeShareOfBase: 0.95, ratingDelta: 0 } as const;

export const DEFAULT_PHRASE_BANS: readonly string[] = [
  "shivers down", "shiver down", "barely above a whisper", "a testament to", "eyes sparkling with", "voice dripping with",
  "sending shivers", "a mix of", "a mixture of", "the air thick with", "the weight of", "maybe, just maybe", "a dance of",
  "can't help but", "couldn't help but", "ministrations", "a flicker of", "padded over", "unspoken", "palpable",
];

export const normalizePhraseBans = (list: readonly unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== "string") continue;
    const phrase = value.replace(/\s+/g, " ").trim();
    const key = phrase.toLowerCase();
    if (!phrase || phrase.length > PHRASE_BAN_CHARS_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length === PHRASE_BANS_MAX) break;
  }
  return out;
};

export interface PhraseBanCapability {
  supported: boolean;
  max: number;
}

export const readPhraseBanCapability = (props: unknown): PhraseBanCapability => {
  const value = isRecord(props) ? props[PHRASE_BAN_CAPABILITY] : undefined;
  if (value === true) return { supported: true, max: PHRASE_BANS_MAX };
  if (isRecord(value) && value.enabled === true) {
    const max = typeof value.max === "number" && Number.isInteger(value.max) && value.max > 0 ? Math.min(value.max, PHRASE_BANS_MAX) : PHRASE_BANS_MAX;
    return { supported: true, max };
  }
  return { supported: false, max: 0 };
};

export interface PhraseBanRequest {
  apiType: string | null;
  loud: boolean;
  storyChat: boolean;
}

export const phraseBanBody = (bans: readonly string[], capability: PhraseBanCapability, request: PhraseBanRequest): Record<string, string[]> => {
  if (!capability.supported || request.apiType !== "llamacpp" || !request.loud || !request.storyChat) return {};
  const list = normalizePhraseBans(bans).slice(0, capability.max);
  return list.length ? { [PHRASE_BAN_KEY]: list } : {};
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const phrasePattern = (phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase.toLowerCase()).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, "gu");

export const phraseHits = (text: string, bans: readonly string[]): Record<string, number> => {
  const lower = text.toLowerCase();
  const hits: Record<string, number> = {};
  for (const phrase of normalizePhraseBans(bans)) {
    const count = (lower.match(phrasePattern(phrase)) ?? []).length;
    if (count) hits[phrase] = count;
  }
  return hits;
};

export interface PhraseRate {
  replies: number;
  words: number;
  hits: number;
  perThousandWords: number;
  repliesWithHit: number;
}

export const bannedPhraseRate = (replies: readonly string[], bans: readonly string[]): PhraseRate => {
  let words = 0;
  let hits = 0;
  let repliesWithHit = 0;
  for (const reply of replies) {
    words += reply.split(/\s+/).filter(Boolean).length;
    const found = Object.values(phraseHits(reply, bans)).reduce((sum, count) => sum + count, 0);
    hits += found;
    if (found) repliesWithHit += 1;
  }
  return { replies: replies.length, words, hits, perThousandWords: words ? Number(((hits * 1000) / words).toFixed(3)) : 0, repliesWithHit };
};

export interface PhraseBanArm {
  rate: PhraseRate;
  decodeTokensPerSecond: number;
  ratingScore: number;
}

export const phraseBanVerdict = (control: PhraseBanArm, banned: PhraseBanArm) => {
  const rate = control.rate.perThousandWords === 0 ? banned.rate.perThousandWords === 0 : banned.rate.perThousandWords <= control.rate.perThousandWords * (1 - PHRASE_BAN_FLOORS.bannedRateDrop);
  const decode = control.decodeTokensPerSecond > 0 && banned.decodeTokensPerSecond >= control.decodeTokensPerSecond * PHRASE_BAN_FLOORS.decodeShareOfBase;
  const rating = banned.ratingScore - control.ratingScore >= PHRASE_BAN_FLOORS.ratingDelta;
  return { rate, decode, rating, ok: rate && decode && rating };
};
