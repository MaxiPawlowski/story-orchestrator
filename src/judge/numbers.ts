// Candidate values for a "stated" quality, found in code so the judge only ever selects one the
// text actually contains (spike lib/numbers.mts, plus Spanish words).
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const FRACTION_DENOMS: Record<string, number> = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, tenth: 10, tenths: 10 };

const byLength = (keys: string[]) => [...keys].sort((left, right) => right.length - left.length).join("|");
const UNIT = byLength(Object.keys(UNITS));
const TEN = byLength(Object.keys(TENS));
const WORD_NUMBER = `(?:(?:${TEN})(?:(?:[- ]| y )(?:${UNIT}))?|${UNIT})`;
const DENOM = byLength(Object.keys(FRACTION_DENOMS));

const wordValue = (raw: string): number | null => {
  let total = 0;
  for (const part of raw.toLowerCase().split(/[- ]|\sy\s/).filter((token) => token && token !== "y")) {
    if (part in TENS) total += TENS[part];
    else if (part in UNITS) total += UNITS[part];
    else return null;
  }
  return total;
};

export interface NumberMention {
  raw: string;
  value: number;
  messageId: string;
  snippet: string;
}

export interface StringCandidate {
  raw: string;
  messageId: string;
  snippet: string;
}

interface Pattern {
  regex: RegExp;
  value: (match: RegExpExecArray) => number | null;
}

const PATTERNS: Pattern[] = [
  {
    regex: new RegExp(String.raw`\b(${WORD_NUMBER}) (?:point|coma) (${WORD_NUMBER})\b`, "gi"),
    value: (match) => {
      const whole = wordValue(match[1]);
      const fraction = wordValue(match[2]);
      return whole === null || fraction === null ? null : Number(`${whole}.${fraction}`);
    },
  },
  {
    regex: new RegExp(String.raw`\b(${WORD_NUMBER}|a|one)[- ](${DENOM})\b`, "gi"),
    value: (match) => {
      const top = /^(a|one)$/i.test(match[1]) ? 1 : wordValue(match[1]);
      return top === null ? null : top / FRACTION_DENOMS[match[2].toLowerCase()];
    },
  },
  { regex: /\b(\d+(?:[.,]\d+)?)\s*(?:%|por ciento\b|percent\b)/gi, value: (match) => Number(match[1].replace(",", ".")) / 100 },
  { regex: /\b(\d+(?:\.\d+)?)\b/g, value: (match) => Number(match[1]) },
  { regex: new RegExp(String.raw`\b(${WORD_NUMBER})\b`, "gi"), value: (match) => wordValue(match[1]) },
];

const snippetAround = (text: string, start: number, end: number) => text.slice(Math.max(0, start - 50), Math.min(text.length, end + 50)).replace(/\s+/g, " ").trim();

export function findNumbers(messages: Array<{ id: string; text: string }>): NumberMention[] {
  const found: NumberMention[] = [];
  for (const message of messages) {
    const taken: Array<[number, number]> = [];
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (let match = pattern.regex.exec(message.text); match; match = pattern.regex.exec(message.text)) {
        const start = match.index;
        const end = start + match[0].length;
        if (taken.some(([from, to]) => start < to && end > from)) continue;
        const value = pattern.value(match);
        if (value === null || Number.isNaN(value)) continue;
        taken.push([start, end]);
        found.push({ raw: match[0], value, messageId: message.id, snippet: snippetAround(message.text, start, end) });
      }
    }
  }
  return found;
}

export function findStringCandidates(messages: Array<{ id: string; text: string }>): StringCandidate[] {
  const out: StringCandidate[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    const push = (raw: string, index: number) => {
      const clean = raw.trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return;
      seen.add(key);
      out.push({ raw: clean, messageId: message.id, snippet: snippetAround(message.text, index, index + clean.length) });
    };
    for (const match of message.text.matchAll(/["“«*_]([^"”»*_\n]{1,40})["”»*_]/g)) push(match[1], match.index ?? 0);
    for (const match of message.text.matchAll(/(?<!\p{L})(\p{Lu}\p{Ll}{2,})(?!\p{L})/gu)) push(match[1], match.index ?? 0);
  }
  return out;
}
