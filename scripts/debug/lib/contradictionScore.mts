const NEGATORS = new Set(['not', 'no', 'never', 'nobody', 'nothing', 'none', 'neither', 'nor', 'nowhere', 'without']);
const FUNCTION_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'onto', 'over', 'under', 'that', 'this', 'these', 'those', 'there', 'here',
  'was', 'were', 'are', 'been', 'being', 'has', 'have', 'had', 'does', 'did', 'will', 'would', 'can', 'could', 'should',
  'its', 'his', 'her', 'hers', 'their', 'they', 'them', 'she', 'him', 'you', 'your', 'our', 'who', 'whom', 'which',
  'than', 'then', 'when', 'while', 'about', 'after', 'before', 'still', 'also', 'very', 'just', 'some', 'any', 'all', 'one']);

export const polarityTokens = (text: string): string[] => String(text ?? '').toLowerCase().replace(/[’`]/g, "'").replace(/n't\b/g, ' not')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const isNegative = (text: string): boolean => polarityTokens(text).some((token) => NEGATORS.has(token));
const subjectTokens = (text: string): Set<string> => new Set(polarityTokens(text).filter((token) => token.length >= 3 && !NEGATORS.has(token) && !FUNCTION_WORDS.has(token)));
const subjectOverlap = (left: string, right: string): number => {
  const a = subjectTokens(left);
  const b = subjectTokens(right);
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / new Set([...a, ...b]).size;
};

export const CATEGORIES = ['factual', 'temporal', 'knowledge', 'relationship'] as const;
export type Category = typeof CATEGORIES[number];
export type Source = 'ledger' | 'fact' | 'earlier';
export type Detector = 'value' | 'polarity' | 'antonym' | 'number';

export interface LedgerRow { entity: string; field: string; value: string }
export interface CheckContext { ledger?: LedgerRow[]; values?: Record<string, string[]>; facts?: string[]; earlier?: string[] }
export interface Finding { claim: string; against: string; source: Source; detector: Detector; category: Category }

export const POLARITY_OVERLAP = 0.4;
export const ANTONYM_OVERLAP = 0.3;
export const NUMBER_OVERLAP = 0.3;

const NAME_STOP = new Set(['the', 'a', 'an', 'she', 'he', 'it', 'they', 'we', 'you', 'i', 'his', 'her', 'their', 'our', 'nobody', 'no', 'by', 'in', 'on',
  'at', 'if', 'but', 'and', 'then', 'when', 'what', 'yes', 'flowers', 'snow', 'everyone', 'someone', 'there', 'this', 'that']);
const ARTICLES = /^(the|a|an)\s+/;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12 };
const ANTONYMS: ReadonlyArray<readonly string[]> = [
  ['alive', 'dead'], ['open', 'closed', 'shut'], ['lit', 'unlit', 'dark'], ['empty', 'full'], ['all', 'none'], ['sunk', 'afloat'],
  ['locked', 'unlocked'], ['present', 'absent'], ['awake', 'asleep'], ['intact', 'collapsed', 'destroyed', 'broken'],
];
const KNOWLEDGE = /\b(know|knows|knew|known|aware|learn|learned|learnt|told|tell|seen|heard|secret|password|truth)\b/i;
const RELATION = /\b(trust|trusts|trusted|trusting|love|loves|loved|hate|hates|hated|ally|allies|friend|friends|enemy|enemies|owes|owe|afraid|hostile|wary|feeling|loyal)\b/i;
const TIME = /\b(day|days|night|nights|dawn|dusk|morning|noon|evening|hour|hours|ago|yesterday|tomorrow|week|weeks|year|years|winter|summer|spring|autumn|season|ended|begun|beginning|last|time|date)\b/i;

const FIELD_CATEGORY: Array<[RegExp, Category]> = [
  [/know|aware|learn|told|secret/i, 'knowledge'],
  [/trust|feel|ally|enemy|love|hate|relation|attitude|mood|loyal/i, 'relationship'],
  [/time|day|season|date|hour|week|year/i, 'temporal'],
];

export const fieldCategory = (field: string): Category => FIELD_CATEGORY.find(([pattern]) => pattern.test(field))?.[1] ?? 'factual';

export const textCategory = (...texts: string[]): Category => {
  const joined = texts.join(' ');
  if (KNOWLEDGE.test(joined)) return 'knowledge';
  if (RELATION.test(joined)) return 'relationship';
  return TIME.test(joined) ? 'temporal' : 'factual';
};

export const MIN_CLAIM_TOKENS = 3;

const SPEAKER = /^[A-Z][\p{L}'’ .-]{0,40}:\s+/u;

export const sentences = (text: string): string[] => String(text ?? '')
  .replace(/[“”"*_]/g, ' ')
  .split(/(?<=[.!?…])\s+|\n+/)
  .map((part) => part.replace(/\s+/g, ' ').trim().replace(SPEAKER, ''))
  .filter((part) => part.length >= 8 && !/\?\s*$/.test(part) && subjectTokens(part).size >= MIN_CLAIM_TOKENS);

const lower = (text: string) => ` ${polarityTokens(text).join(' ')} `;

const hasPhrase = (haystack: string, phrase: string): boolean => {
  const needle = polarityTokens(phrase.replace(ARTICLES, '')).join(' ');
  return needle.length > 0 && haystack.includes(` ${needle} `);
};

export const names = (text: string): Set<string> => new Set((String(text).match(/\b[A-Z][\p{L}'’-]{2,}\b/gu) ?? [])
  .map((word) => word.replace(/['’]s$/, '').toLowerCase()).filter((word) => !NAME_STOP.has(word)));

const shareName = (left: string, right: string): boolean => {
  const a = names(left);
  return [...names(right)].some((name) => a.has(name));
};

const numbered = (text: string): Map<string, number> => {
  const tokens = polarityTokens(text);
  const found = new Map<string, number>();
  tokens.forEach((token, index) => {
    const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    const noun = tokens[index + 1];
    if (value !== undefined && noun && !/^\d+$/.test(noun) && !(noun in NUMBER_WORDS)) found.set(noun.replace(/s$/, ''), value);
  });
  return found;
};

const antonymClash = (claim: string, reference: string): boolean => {
  const a = new Set(polarityTokens(claim));
  const b = new Set(polarityTokens(reference));
  return ANTONYMS.some((group) => {
    const inA = group.filter((word) => a.has(word));
    const inB = group.filter((word) => b.has(word));
    return inA.length > 0 && inB.length > 0 && inA.every((word) => !b.has(word)) && inB.every((word) => !a.has(word));
  });
};

const numberClash = (claim: string, reference: string): boolean => {
  const a = numbered(claim);
  const b = numbered(reference);
  return [...a].some(([noun, value]) => b.has(noun) && b.get(noun) !== value);
};

function valueFindings(claim: string, context: CheckContext): Finding[] {
  const text = lower(claim);
  return (context.ledger ?? []).flatMap((row) => {
    if (!hasPhrase(text, row.entity) || hasPhrase(text, row.value)) return [];
    const options = context.values?.[row.field] ?? (context.ledger ?? []).filter((other) => other.field === row.field).map((other) => other.value);
    const rival = options.find((option) => option !== row.value && hasPhrase(text, option));
    return rival ? [{ claim, against: `${row.entity}: ${row.field}=${row.value}`, source: 'ledger' as const, detector: 'value' as const, category: fieldCategory(row.field) }] : [];
  });
}

export function pairFinding(claim: string, reference: string, source: Exclude<Source, 'ledger'>): Finding | null {
  const overlap = subjectOverlap(claim, reference);
  const anchored = source === 'fact' || shareName(claim, reference) || overlap >= 0.5;
  if (!anchored) return null;
  const finding = (detector: Detector): Finding => ({ claim, against: reference, source, detector, category: textCategory(claim, reference) });
  if (overlap >= POLARITY_OVERLAP && isNegative(claim) !== isNegative(reference)) return finding('polarity');
  if (overlap >= NUMBER_OVERLAP && numberClash(claim, reference)) return finding('number');
  if (overlap >= ANTONYM_OVERLAP && antonymClash(claim, reference)) return finding('antonym');
  return null;
}

export function checkReply(context: CheckContext, reply: string): Finding[] {
  const references: Array<[string, Exclude<Source, 'ledger'>]> = [
    ...(context.facts ?? []).flatMap((fact) => sentences(fact).map((text): [string, 'fact'] => [text, 'fact'])),
    ...(context.earlier ?? []).flatMap((earlier) => sentences(earlier).map((text): [string, 'earlier'] => [text, 'earlier'])),
  ];
  return sentences(reply).flatMap((claim) => {
    const fromLedger = valueFindings(claim, context);
    if (fromLedger.length) return fromLedger.slice(0, 1);
    for (const [reference, source] of references) {
      const found = pairFinding(claim, reference, source);
      if (found) return [found];
    }
    return [];
  });
}

export interface PlantedPair { id: string; category: Category; context: CheckContext; consistent: string; contradicts: string }
export interface Calibration {
  pairs: number; caught: number; flaggedContradicts: number; flaggedConsistent: number;
  pairAccuracy: number; recall: number; falseAlarm: number;
  byCategory: Record<Category, { pairs: number; caught: number }>;
  misses: string[]; falseAlarms: string[];
}

const ratio = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 1000 : 0);

export function calibrate(pairs: readonly PlantedPair[]): Calibration {
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, { pairs: 0, caught: 0 }])) as Calibration['byCategory'];
  let caught = 0;
  let flaggedContradicts = 0;
  let flaggedConsistent = 0;
  const misses: string[] = [];
  const falseAlarms: string[] = [];
  for (const pair of pairs) {
    const hit = checkReply(pair.context, pair.contradicts).length > 0;
    const alarm = checkReply(pair.context, pair.consistent).length > 0;
    if (hit) flaggedContradicts += 1; else misses.push(pair.id);
    if (alarm) { flaggedConsistent += 1; falseAlarms.push(pair.id); }
    byCategory[pair.category].pairs += 1;
    if (hit && !alarm) { caught += 1; byCategory[pair.category].caught += 1; }
  }
  return {
    pairs: pairs.length, caught, flaggedContradicts, flaggedConsistent,
    pairAccuracy: ratio(caught, pairs.length), recall: ratio(flaggedContradicts, pairs.length), falseAlarm: ratio(flaggedConsistent, pairs.length),
    byCategory, misses, falseAlarms,
  };
}

export interface Floors { pairAccuracy: number; recall: number; falseAlarm: number }

export const meetsFloors = (result: Calibration, floors: Floors): boolean =>
  result.pairAccuracy >= floors.pairAccuracy && result.recall >= floors.recall && result.falseAlarm <= floors.falseAlarm;

export interface SessionReply { text: string; position: number; context: CheckContext }
export interface SessionRate {
  replies: number; contradictions: number; per100: number;
  bySource: Record<Source, number>; byCategory: Record<Category, number>;
  byLength: Array<{ bucket: string; replies: number; contradictions: number; per100: number }>;
}

export const LENGTH_BUCKETS: ReadonlyArray<[string, number, number]> = [['1-20', 1, 20], ['21-60', 21, 60], ['61+', 61, Infinity]];

export function rateReplies(replies: readonly SessionReply[]): SessionRate {
  const bySource: Record<Source, number> = { ledger: 0, fact: 0, earlier: 0 };
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<Category, number>;
  const buckets = LENGTH_BUCKETS.map(([bucket]) => ({ bucket, replies: 0, contradictions: 0, per100: 0 }));
  let contradictions = 0;
  for (const reply of replies) {
    const findings = checkReply(reply.context, reply.text);
    const bucket = buckets[LENGTH_BUCKETS.findIndex(([, low, high]) => reply.position >= low && reply.position <= high)];
    if (bucket) { bucket.replies += 1; bucket.contradictions += findings.length; }
    contradictions += findings.length;
    for (const finding of findings) { bySource[finding.source] += 1; byCategory[finding.category] += 1; }
  }
  buckets.forEach((bucket) => { bucket.per100 = ratio(bucket.contradictions * 100, bucket.replies); });
  return { replies: replies.length, contradictions, per100: ratio(contradictions * 100, replies.length), bySource, byCategory, byLength: buckets };
}

export function parseLedgerBlock(text: string): LedgerRow[] {
  const at = text.indexOf('Current state:');
  if (at < 0) return [];
  const rows: LedgerRow[] = [];
  for (const line of text.slice(at + 'Current state:'.length).split(/\r?\n/).slice(1)) {
    const match = /^([^:\n[\]]{1,60}):\s*(.+)$/.exec(line.trim());
    if (!match || !match[2].includes('=')) break;
    for (const field of match[2].split(' | ')) {
      const eq = field.indexOf('=');
      if (eq > 0) rows.push({ entity: match[1].trim(), field: field.slice(0, eq).trim(), value: field.slice(eq + 1).trim() });
    }
  }
  return rows;
}

export const FACTS_LABEL = '[Established facts';

export function parseFactsBlock(text: string): string[] {
  const at = text.indexOf(FACTS_LABEL);
  if (at < 0) return [];
  const lines: string[] = [];
  for (const line of text.slice(at).split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[')) break;
    lines.push(trimmed);
  }
  return lines;
}
