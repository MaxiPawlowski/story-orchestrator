const STOP_WORDS: ReadonlySet<string> = new Set((
  "a an the and or of to in on at is was were his her their its as by with for he she they it that this be are has have had " +
  "him them who what why how when where which not no from into about but so do does did will would can could should all any"
).split(" "));

const stem = (word: string): string => {
  const bare = word.replace(/'s$/, "").replace(/'$/, "");
  return bare.length > 3 && bare.endsWith("s") && !bare.endsWith("ss") ? bare.slice(0, -1) : bare;
};

export const contentWords = (text: string): Set<string> =>
  new Set(text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).map(stem).filter((word) => word !== "" && !STOP_WORDS.has(word)));

export const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => [...a].filter((word) => b.has(word)).length;

export const wordSimilarity = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = sharedCount(a, b);
  return shared / (a.size + b.size - shared);
};

export const wordOverlap = (a: ReadonlySet<string>, b: ReadonlySet<string>): number =>
  (a.size === 0 || b.size === 0 ? 0 : sharedCount(a, b) / Math.min(a.size, b.size));

export const RESTATE_MIN_SHARED_WORDS = 2;
export const RESTATE_MIN_COVERAGE = 0.6;

export const restatesWords = (words: ReadonlySet<string>, text: ReadonlySet<string>): boolean => {
  if (words.size < RESTATE_MIN_SHARED_WORDS) return false;
  const shared = sharedCount(words, text);
  return shared >= Math.max(RESTATE_MIN_SHARED_WORDS, Math.round(words.size * RESTATE_MIN_COVERAGE));
};
