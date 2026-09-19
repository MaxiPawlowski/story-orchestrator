const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const FRACTION_DENOMS: Record<string, number> = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, tenth: 10, tenths: 10 };

const byLength = (keys: string[]) => [...keys].sort((a, b) => b.length - a.length).join('|');
const UNIT = byLength(Object.keys(UNITS));
const TEN = byLength(Object.keys(TENS));
const WORD_NUMBER = `(?:(?:${TEN})(?:[- ](?:${UNIT}))?|${UNIT})`;
const DENOM = byLength(Object.keys(FRACTION_DENOMS));

const wordValue = (raw: string): number | null => {
  const parts = raw.toLowerCase().split(/[- ]/).filter(Boolean);
  let total = 0;
  for (const part of parts) {
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

interface Pattern {
  regex: RegExp;
  value: (match: RegExpExecArray) => number | null;
}

const PATTERNS: Pattern[] = [
  {
    regex: new RegExp(String.raw`\b(${WORD_NUMBER}) point (${WORD_NUMBER})\b`, 'gi'),
    value: (m) => {
      const whole = wordValue(m[1]);
      const frac = wordValue(m[2]);
      return whole === null || frac === null ? null : Number(`${whole}.${frac}`);
    },
  },
  {
    regex: new RegExp(String.raw`\b(${WORD_NUMBER}|a|one)[- ](${DENOM})\b`, 'gi'),
    value: (m) => {
      const top = /^(a|one)$/i.test(m[1]) ? 1 : wordValue(m[1]);
      const bottom = FRACTION_DENOMS[m[2].toLowerCase()];
      return top === null ? null : top / bottom;
    },
  },
  { regex: /\b(\d+(?:\.\d+)?)\s*%/g, value: (m) => Number(m[1]) / 100 },
  { regex: /\b(\d+(?:\.\d+)?)\b/g, value: (m) => Number(m[1]) },
  { regex: new RegExp(String.raw`\b(${WORD_NUMBER})\b`, 'gi'), value: (m) => wordValue(m[1]) },
];

const snippetAround = (text: string, start: number, end: number) => text.slice(Math.max(0, start - 50), Math.min(text.length, end + 50)).replace(/\s+/g, ' ').trim();

export function findNumbers(messages: Array<{ id: string; text: string }>): NumberMention[] {
  const found: NumberMention[] = [];
  for (const message of messages) {
    const taken: Array<[number, number]> = [];
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (let match = pattern.regex.exec(message.text); match; match = pattern.regex.exec(message.text)) {
        const start = match.index;
        const end = start + match[0].length;
        if (taken.some(([a, b]) => start < b && end > a)) continue;
        const value = pattern.value(match);
        if (value === null || Number.isNaN(value)) continue;
        taken.push([start, end]);
        found.push({ raw: match[0], value, messageId: message.id, snippet: snippetAround(message.text, start, end) });
      }
    }
  }
  return found;
}

export interface StringCandidate { raw: string; messageId: string; snippet: string }

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
    for (const match of message.text.matchAll(/\b([A-Z][a-z]{2,})\b/g)) push(match[1], match.index ?? 0);
  }
  return out;
}
