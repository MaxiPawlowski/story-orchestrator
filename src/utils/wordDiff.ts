export type WordDiffPart = { kind: "same" | "del" | "ins"; text: string };

export const WORD_DIFF_MAX_CELLS = 250_000;

const tokens = (value: string): string[] => value.match(/\s+|[^\s]+/g) ?? [];

const push = (parts: WordDiffPart[], kind: WordDiffPart["kind"], text: string) => {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last?.kind === kind) last.text += text;
  else parts.push({ kind, text });
};

export function wordDiff(before: string, after: string): WordDiffPart[] {
  const left = tokens(before);
  const right = tokens(after);
  if (left.length * right.length > WORD_DIFF_MAX_CELLS) return [...(before ? [{ kind: "del" as const, text: before }] : []), ...(after ? [{ kind: "ins" as const, text: after }] : [])];
  const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let column = right.length - 1; column >= 0; column -= 1) {
      table[row][column] = left[row] === right[column] ? table[row + 1][column + 1] + 1 : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }
  const parts: WordDiffPart[] = [];
  let row = 0;
  let column = 0;
  while (row < left.length && column < right.length) {
    if (left[row] === right[column]) {
      push(parts, "same", left[row]);
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      push(parts, "del", left[row]);
      row += 1;
    } else {
      push(parts, "ins", right[column]);
      column += 1;
    }
  }
  left.slice(row).forEach((token) => push(parts, "del", token));
  right.slice(column).forEach((token) => push(parts, "ins", token));
  return parts;
}
