export const ECHO_N = 8;
export const ECHO_FROM = 15;
export const ECHO_TO = 40;
export const ECHO_FLOORS = { echoDelta: 0.02, specificityRatio: 0.9 } as const;

const NUMBER_WORDS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'thirty',
  'forty', 'fifty', 'hundred', 'thousand', 'dozen', 'first', 'second', 'third']);
const NOT_NAMES = new Set(['I', 'I\'m', 'I\'ll', 'I\'d', 'I\'ve', 'OK', 'Ok']);

export const words = (text: string): string[] => String(text ?? '').toLowerCase().replace(/[’`]/g, '\'').match(/[\p{L}\p{N}']+/gu) ?? [];

export const grams = (tokens: readonly string[], n = ECHO_N): string[] =>
  tokens.length < n ? [] : Array.from({ length: tokens.length - n + 1 }, (_, at) => tokens.slice(at, at + n).join(' '));

export const echoWindow = (history: readonly string[], from = ECHO_FROM, to = ECHO_TO): string[] =>
  history.slice(Math.max(0, history.length - to), Math.max(0, history.length - from + 1));

export function echoRate(reply: string, history: readonly string[], n = ECHO_N): number | null {
  const own = grams(words(reply), n);
  if (!own.length) return null;
  const window = new Set(echoWindow(history).flatMap((message) => grams(words(message), n)));
  return own.filter((gram) => window.has(gram)).length / own.length;
}

export function specificity(reply: string): number | null {
  const text = String(reply ?? '');
  const all = words(text);
  if (!all.length) return null;
  const sentenceStarts = new Set<number>();
  for (const match of text.matchAll(/(?:^|[.!?…]\s+|\n\s*|["“]\s*)([\p{Lu}])/gu)) sentenceStarts.add((match.index ?? 0) + match[0].length - 1);
  let names = 0;
  for (const match of text.matchAll(/\b[\p{Lu}][\p{L}'’-]+/gu)) {
    if (!sentenceStarts.has(match.index ?? -1) && !NOT_NAMES.has(match[0])) names += 1;
  }
  const numbers = all.filter((word) => /^\d+$/.test(word) || NUMBER_WORDS.has(word)).length;
  return ((names + numbers) / all.length) * 100;
}

export interface EchoSample { arm: string; echo: number | null; specificity: number | null }

const mean = (values: Array<number | null>): number | null => {
  const kept = values.filter((value): value is number => value !== null);
  return kept.length ? Math.round((kept.reduce((sum, value) => sum + value, 0) / kept.length) * 10000) / 10000 : null;
};

export interface EchoVerdict {
  base: string; arm: string; samples: Record<string, number>;
  echo: Record<string, number | null>; specificity: Record<string, number | null>;
  floors: typeof ECHO_FLOORS; pass: { echo: boolean; specificity: boolean } | null;
}

export function echoVerdict(samples: readonly EchoSample[], base: string, arm: string): EchoVerdict {
  const of = (name: string) => samples.filter((sample) => sample.arm === name);
  const echo = { [base]: mean(of(base).map((sample) => sample.echo)), [arm]: mean(of(arm).map((sample) => sample.echo)) };
  const spec = { [base]: mean(of(base).map((sample) => sample.specificity)), [arm]: mean(of(arm).map((sample) => sample.specificity)) };
  const ready = echo[base] !== null && echo[arm] !== null && spec[base] !== null && spec[arm] !== null;
  return {
    base, arm, samples: { [base]: of(base).length, [arm]: of(arm).length }, echo, specificity: spec, floors: ECHO_FLOORS,
    pass: ready ? {
      echo: (echo[arm] as number) <= (echo[base] as number) + ECHO_FLOORS.echoDelta,
      specificity: (spec[arm] as number) >= ECHO_FLOORS.specificityRatio * (spec[base] as number),
    } : null,
  };
}
