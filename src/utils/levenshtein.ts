export const levenshtein = (left: string, right: string): number => {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
};

const folded = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The known key a mistyped one most likely meant: the nearest by edit distance within half its
 *  length, or one the typo contains (`groupMembers` → `members`). Null when nothing is close. */
export const nearestKey = (key: string, known: readonly string[]): string | null => {
  const typed = folded(key);
  const ranked = known
    .map((candidate) => ({ candidate, target: folded(candidate) }))
    .map(({ candidate, target }) => ({
      candidate,
      distance: typed.includes(target) || target.includes(typed) ? 0 : levenshtein(typed, target),
      limit: Math.ceil(Math.max(typed.length, target.length) / 2),
    }))
    .filter(({ distance, limit }) => distance <= limit)
    .sort((left, right) => left.distance - right.distance);
  return ranked[0]?.candidate ?? null;
};
