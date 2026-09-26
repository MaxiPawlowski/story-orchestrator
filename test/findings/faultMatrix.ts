import { readFileSync } from "node:fs";
import { join } from "node:path";

// v2.3 plan 11 §Fault matrix. The plan names nine stateful packages and nine fault shapes and asks
// for each cell to be demonstrated. Most were already demonstrated somewhere — the gap was that
// nothing said WHICH, so a cell could lose its test and no one would notice, and nobody could tell
// a covered cell from an unasked question. This is the same shape as the ownership census: the set
// is declared, every citation is checked against the file it names, and the holes are counted out
// loud instead of being invisible.

export const FAULT_PACKAGES = [
  "extraction",
  "memory",
  "scene",
  "lore",
  "stagecraft",
  "expansion",
  "judgeRing",
  "persistence",
  "effects",
  "hostDeletes",
  "wiEvidence",
  "wiNormalize",
] as const;

export const FAULT_SHAPES = [
  "delayedSuccess",
  "delayedError",
  "malformedResponse",
  "duplicateCompletion",
  "backendUnavailable",
  "beforeHostWrite",
  "afterHostWrite",
  "persistFailure",
  "worldSwitched",
  "aborted",
] as const;

export type FaultPackage = (typeof FAULT_PACKAGES)[number];
export type FaultShape = (typeof FAULT_SHAPES)[number];
export type FaultStatus = "covered" | "partial" | "todo" | "na";

export interface FaultCell {
  status: FaultStatus;
  /** `<path>#<exact test title>`. Required for `covered` and `partial`, refused on `todo`/`na`. */
  evidence?: string;
  alsoEvidence?: string[];
  note: string;
}

export interface FaultMatrix {
  $comment?: string;
  cells: Record<string, FaultCell>;
}

export const cellKey = (entry: FaultPackage, shape: FaultShape): string => `${entry}|${shape}`;

export const FAULT_MATRIX_PATH = join(__dirname, "faultMatrix.json");

export function loadFaultMatrix(): FaultMatrix {
  return JSON.parse(readFileSync(FAULT_MATRIX_PATH, "utf-8")) as FaultMatrix;
}

/** Read a test file the way the guard does, so a citation is checked against the bytes on disk. */
export function readTestFile(relativePath: string): string | null {
  try {
    return readFileSync(join(__dirname, "..", "..", relativePath), "utf-8");
  } catch {
    return null;
  }
}

export const citationMatches = (text: string, title: string): boolean =>
  [`"${title}"`, `'${title}'`, `\`${title}\``].some((quoted) => text.includes(quoted));

export const countByStatus = (matrix: FaultMatrix): Record<FaultStatus, number> => {
  const counts: Record<FaultStatus, number> = { covered: 0, partial: 0, todo: 0, na: 0 };
  Object.values(matrix.cells).forEach((cell) => { counts[cell.status] += 1; });
  return counts;
};
