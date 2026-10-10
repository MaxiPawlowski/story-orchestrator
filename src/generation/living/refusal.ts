import type { DirectorRefusal, RefusalReason, RefusalStage } from "./types";

const ISSUE_SHAPES: Array<[RegExp, string]> = [
  [/^(\S+) is longer than/, "too-long"],
  [/^(\S+) is required/, "missing"],
  [/^(\S+) holds a macro/, "macro"],
  [/^the answer was not one JSON object/, "not-json"],
];

export const refusalReason = (issue: string, stage: RefusalStage): RefusalReason => {
  for (const [shape, code] of ISSUE_SHAPES) {
    const match = shape.exec(issue);
    if (match) return { code, field: match[1] && match[1] !== "the" ? match[1] : null };
  }
  return { code: stage, field: null };
};

export const refusalOf = (stage: RefusalStage, issues: readonly string[]): DirectorRefusal =>
  ({ stage, reasons: issues.map((issue) => refusalReason(issue, stage)) });

export const refusalLine = (refusal: DirectorRefusal): string =>
  `[${refusal.stage}] ${[...new Set(refusal.reasons.map((reason) => (reason.field ? `${reason.field}:${reason.code}` : reason.code)))].join(", ")}`;
