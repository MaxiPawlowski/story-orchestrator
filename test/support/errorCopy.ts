import { errorCopySites, ratchetSet, type ErrorCopySite, type Ratchet } from "./codeHealth";

export type Surface = "player" | "author" | "console";

export interface ErrorCopyRow extends ErrorCopySite {
  surface: Surface;
  rawError: boolean;
  silentCatch: "logs" | "probe" | null;
  verdict: "pass" | "fail";
  reason: string;
}

export interface ErrorCopyInventory {
  closed: boolean;
  rows: ErrorCopyRow[];
}

export const rowKey = (row: ErrorCopySite): string => `${row.site} | ${row.kind} | ${row.template}`;

export const expectedVerdict = (row: ErrorCopyRow): "pass" | "fail" =>
  (row.rawError && row.surface === "player") || (row.kind === 3 && row.silentCatch === null) ? "fail" : "pass";

export const rowProblems = (row: ErrorCopyRow): string[] => {
  const problems: string[] = [];
  if (!["player", "author", "console"].includes(row.surface)) problems.push(`${rowKey(row)}: unknown surface ${row.surface}`);
  if (row.kind !== 3 && row.silentCatch !== null) problems.push(`${rowKey(row)}: silentCatch on a non-catch row`);
  if (row.kind === 3 && row.silentCatch !== null && !["logs", "probe"].includes(row.silentCatch)) problems.push(`${rowKey(row)}: silentCatch ${row.silentCatch}`);
  if (row.verdict !== expectedVerdict(row)) problems.push(`${rowKey(row)}: verdict ${row.verdict}, the pass rule says ${expectedVerdict(row)}`);
  if (!row.reason) problems.push(`${rowKey(row)}: no reason`);
  return problems;
};

export interface ErrorCopyVerdict extends Ratchet {
  problems: string[];
  failing: string[];
}

export const judgeErrorCopy = (files: string[], read: (path: string) => string, inventory: ErrorCopyInventory): ErrorCopyVerdict => {
  const extracted = files.flatMap((path) => errorCopySites(path, read(path)));
  const drift = ratchetSet(extracted.map(rowKey), inventory.rows.map(rowKey));
  const problems = inventory.rows.flatMap(rowProblems);
  const failing = inventory.rows.filter((row) => row.verdict === "fail").map(rowKey);
  return { ...drift, problems, failing };
};
