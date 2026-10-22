import { speaksForPlayer } from "@wizard/cardChecks";
import { normalizeSpace, phraseCount, quotedTexts, words } from "./text";
import { align, targetPhrases, type PolishTargets, type PolishWindow } from "./windows";

export const GUARD_CODES = [
  "outside-window", "ambiguous-alignment", "truncated", "reasoning-tagged", "malformed", "no-finding-reduced", "quote-changed", "added-name",
  "added-number", "negation-changed", "modal-changed", "second-person-changed", "player-action", "length-band", "markup-changed", "target-rose",
  "held-secret", "copied-reference",
] as const;
export type GuardCode = (typeof GUARD_CODES)[number];

export interface GuardRefusal {
  code: GuardCode;
  window: number | null;
}

export type GuardStatus = "accepted" | "refused" | "unchanged";

export interface GuardVerdict {
  status: GuardStatus;
  refusals: GuardRefusal[];
  replaced: string[];
  candidate: string | null;
}

export interface GuardInput {
  original: string;
  windows: readonly PolishWindow[];
  candidate: string;
  targets: PolishTargets;
  names: readonly string[];
  playerNames: readonly string[];
  reference: readonly string[];
  restates?: (text: string) => boolean;
}

export const WINDOW_BAND = { min: 0.7, max: 1.3 } as const;
export const REPLY_BAND = { min: 0.85, max: 1.1 } as const;
export const COPY_SHINGLE = 5;

const NEGATION = /\b(?:not|never|no|nothing|nobody|none|nowhere|neither|nor)\b|n['’]t\b|\brefus\w*|\bden(?:y|ies|ied|ying)\b/giu;
const MODAL = /\b(?:can|could|may|might|must|shall|should|will|would|ought)\b|['’](?:ll|d)\b/giu;
const SECOND_PERSON = /\byou\b/giu;
const NUMBER_WORDS = ["zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen",
  "twenty|thirty|forty|fifty|hundred|thousand|million|dozen|first|second|third|half"].join("|");
const NUMBER = new RegExp(`\\d+(?:[.,]\\d+)*|\\b(?:${NUMBER_WORDS})\\b`, "giu");
const CAPITAL = /[\p{Lu}][\p{L}'’-]*/gu;
const PRONOUN_I = /^I(?:['’][a-z]+)?$/u;
const MARKUP = ["*", "_", "`", "~", "#", "<", ">", "[", "]", "\n"];
const USER_MACRO = /\{\{user\}\}/giu;

const hits = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

const multiset = (items: readonly string[]): Map<string, number> => items.reduce((map, item) => map.set(item, (map.get(item) ?? 0) + 1), new Map<string, number>());

const subset = (inner: readonly string[], outer: readonly string[]): boolean => {
  const available = multiset(outer);
  return [...multiset(inner)].every(([item, times]) => (available.get(item) ?? 0) >= times);
};

const numbersOf = (text: string): string[] => (text.match(NUMBER) ?? []).map((token) => token.toLowerCase());

const initialAt = (text: string, at: number): boolean => /(?:^|[.!?…]["'”’)\]*_]*\s+)["'“‘*_(\s]*$/u.test(text.slice(0, at));

const addsName = (before: string, after: string, reply: string, names: readonly string[]): boolean => {
  const known = new Set(words(before));
  const anywhere = new Set(words(reply));
  for (const match of after.matchAll(CAPITAL)) {
    const token = match[0].replace(/['’]s$/u, "");
    if (PRONOUN_I.test(token)) continue;
    const lower = token.toLowerCase();
    if (known.has(lower)) continue;
    if (!initialAt(after, match.index ?? 0) || !anywhere.has(lower)) return true;
  }
  return names.some((name) => phraseCount(after, name) > phraseCount(before, name));
};

const playerSubject = (text: string, players: readonly string[]): number => players.reduce((sum, name) => {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped ? sum + hits(text, new RegExp(`\\b${escaped}\\s+[a-z]+(?:s|ed)\\b`, "gu")) : sum;
}, 0);

const shingles = (text: string): Set<string> => {
  const list = words(text);
  const out = new Set<string>();
  for (let start = 0; start + COPY_SHINGLE <= list.length; start += 1) out.add(list.slice(start, start + COPY_SHINGLE).join(" "));
  return out;
};

const copiesReference = (after: string, reply: string, reference: readonly string[]): boolean => {
  const own = shingles(reply);
  const supplied = new Set(reference.flatMap((text) => [...shingles(text)]));
  return [...shingles(after)].some((gram) => !own.has(gram) && supplied.has(gram));
};

const inBand = (before: number, after: number, band: { min: number; max: number }): boolean => before === 0 ? after === 0 : after / before >= band.min && after / before <= band.max;

const findingTotal = (text: string, window: PolishWindow): number => [...new Set(window.findings.map((finding) => finding.phrase))].reduce((sum, phrase) => sum + phraseCount(text, phrase), 0);

const sameQuotes = (before: string, after: string): boolean => {
  const left = quotedTexts(before);
  const right = quotedTexts(after);
  return left !== null && right !== null && left.length === right.length && left.every((quote, index) => quote === right[index]);
};

type WindowCheck = (before: string, after: string, window: PolishWindow, input: GuardInput) => GuardCode | null;

const WINDOW_CHECKS: readonly WindowCheck[] = [
  (before, after, window) => (findingTotal(after, window) >= findingTotal(before, window) ? "no-finding-reduced" : null),
  (before, after) => (sameQuotes(before, after) ? null : "quote-changed"),
  (before, after, _window, input) => (addsName(before, after, input.original, [...input.names, ...input.playerNames]) ? "added-name" : null),
  (before, after) => (subset(numbersOf(after), numbersOf(before)) ? null : "added-number"),
  (before, after) => (hits(after, NEGATION) === hits(before, NEGATION) ? null : "negation-changed"),
  (before, after) => (hits(after, MODAL) === hits(before, MODAL) ? null : "modal-changed"),
  (before, after) => (hits(after, SECOND_PERSON) === hits(before, SECOND_PERSON) ? null : "second-person-changed"),
  (before, after, _window, input) => ((speaksForPlayer(after) && !speaksForPlayer(before)) || hits(after, USER_MACRO) > hits(before, USER_MACRO)
    || playerSubject(after, input.playerNames) > playerSubject(before, input.playerNames) ? "player-action" : null),
  (before, after) => (inBand(before.length, after.length, WINDOW_BAND) ? null : "length-band"),
  (before, after) => (MARKUP.every((mark) => before.split(mark).length === after.split(mark).length) ? null : "markup-changed"),
  (before, after, _window, input) => (input.restates && input.restates(after) && !input.restates(before) ? "held-secret" : null),
  (_before, after, _window, input) => (copiesReference(after, input.original, input.reference) ? "copied-reference" : null),
];

export const refused = (code: GuardCode, window: number | null = null): GuardVerdict => ({ status: "refused", refusals: [{ code, window }], replaced: [], candidate: null });

export const guardRewrite = (input: GuardInput): GuardVerdict => {
  const aligned = align(input.original, input.windows, input.candidate);
  if (!aligned.ok) return refused(aligned.code);
  const changed = input.windows.filter((window, position) => normalizeSpace(aligned.replaced[position]) !== normalizeSpace(window.text));
  if (!changed.length) return { status: "unchanged", refusals: [], replaced: aligned.replaced, candidate: input.candidate };
  const refusals: GuardRefusal[] = changed.flatMap((window) => {
    const after = aligned.replaced[window.index - 1];
    return WINDOW_CHECKS.flatMap((check) => {
      const code = check(window.text, after, window, input);
      return code ? [{ code, window: window.index }] : [];
    });
  });
  if (!inBand(input.original.length, input.candidate.length, REPLY_BAND)) refusals.push({ code: "length-band", window: null });
  if (targetPhrases(input.targets).some((phrase) => phraseCount(input.candidate, phrase) > phraseCount(input.original, phrase))) refusals.push({ code: "target-rose", window: null });
  return refusals.length
    ? { status: "refused", refusals, replaced: aligned.replaced, candidate: input.candidate }
    : { status: "accepted", refusals: [], replaced: aligned.replaced, candidate: input.candidate };
};
