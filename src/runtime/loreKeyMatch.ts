import type { HostScannableEntry } from "@services/STAPI";

export interface ScanBufferView {
  messages: string[];
  depth: number;
  caseSensitive: boolean;
  matchWholeWords: boolean;
}

export type LeftToScan = "keyword" | "self";

const MAX_SCAN_DEPTH = 1000;
const MATCHER = "\x01";

const AND_ANY = 0;
const NOT_ALL = 1;
const NOT_ANY = 2;
const AND_ALL = 3;

const keysOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((key): key is string => typeof key === "string").map((key) => key.trim()).filter(Boolean) : []);

const filled = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : Boolean(value));

const positive = (value: unknown) => typeof value === "number" && value > 0;

export function parseKeyRegex(input: string): RegExp | null {
  const match = /^\/([\w\W]+?)\/([gimsuy]*)$/.exec(input);
  if (!match) return null;
  const [, pattern, flags] = match;
  if (/(^|[^\\])\//.test(pattern)) return null;
  try {
    return new RegExp(pattern.replace("\\/", "/"), flags);
  } catch {
    return null;
  }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matchKey(haystack: string, key: string, options: { caseSensitive: boolean; matchWholeWords: boolean }): boolean {
  const regex = parseKeyRegex(key);
  if (regex) return regex.test(haystack);
  const text = options.caseSensitive ? haystack : haystack.toLowerCase();
  const needle = options.caseSensitive ? key : key.toLowerCase();
  if (!options.matchWholeWords || needle.split(/\s+/).length > 1) return text.includes(needle);
  return new RegExp(`(?:^|\\W)(${escapeRegex(needle)})(?:$|\\W)`).test(text);
}

const certain = (entry: HostScannableEntry): boolean => {
  if (entry.disable === true || entry.constant === true) return false;
  if (entry.useProbability !== false && typeof entry.probability === "number" && entry.probability < 100) return false;
  if (filled(entry.group) || filled(entry.triggers) || entry.delayUntilRecursion) return false;
  const filter = entry.characterFilter as { names?: unknown; tags?: unknown } | undefined;
  if (filter && (filled(filter.names) || filled(filter.tags))) return false;
  if (positive(entry.delay) || positive(entry.cooldown)) return false;
  if (typeof entry.content === "string" && entry.content.trimStart().startsWith("@@")) return false;
  return true;
};

export function keywordWillActivate(entry: HostScannableEntry, buffer: ScanBufferView): boolean {
  if (!certain(entry)) return false;
  const primary = keysOf(entry.key);
  const selective = entry.selective === true && keysOf(entry.keysecondary).length > 0;
  const secondary = selective ? keysOf(entry.keysecondary) : [];
  if (!primary.length || [...primary, ...secondary].some((key) => key.includes("{{"))) return false;
  const depth = Math.min(typeof entry.scanDepth === "number" ? entry.scanDepth : buffer.depth, MAX_SCAN_DEPTH);
  if (!(depth > 0)) return false;
  const haystack = MATCHER + buffer.messages.slice(0, depth).join(`\n${MATCHER}`);
  const options = {
    caseSensitive: typeof entry.caseSensitive === "boolean" ? entry.caseSensitive : buffer.caseSensitive,
    matchWholeWords: typeof entry.matchWholeWords === "boolean" ? entry.matchWholeWords : buffer.matchWholeWords,
  };
  if (!primary.some((key) => matchKey(haystack, key, options))) return false;
  if (!selective) return true;
  const hits = secondary.map((key) => matchKey(haystack, key, options));
  const logic = typeof entry.selectiveLogic === "number" ? entry.selectiveLogic : AND_ANY;
  if (logic === AND_ANY) return hits.some(Boolean);
  if (logic === NOT_ALL) return hits.some((hit) => !hit);
  if (logic === NOT_ANY) return hits.every((hit) => !hit);
  if (logic === AND_ALL) return hits.every(Boolean);
  return false;
}

const fold = (text: string) => text.trim().toLowerCase();

export function aboutMember(entry: HostScannableEntry, names: readonly string[]): boolean {
  const wanted = new Set(names.map(fold).filter(Boolean));
  return wanted.size > 0 && keysOf(entry.key).some((key) => wanted.has(fold(key)));
}

export function leftToScan(entry: HostScannableEntry, buffer: ScanBufferView | null, member: readonly string[]): LeftToScan | null {
  if (aboutMember(entry, member)) return "self";
  if (buffer && keywordWillActivate(entry, buffer)) return "keyword";
  return null;
}
