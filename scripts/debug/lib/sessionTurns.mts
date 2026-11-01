export const nextScriptLine = (lines: readonly string[], at: number): string => lines[((at % lines.length) + lines.length) % lines.length];

export function turnsStop({ played, maxTurns, boundary, untilBoundary }: { played: number; maxTurns: number; boundary: number | null; untilBoundary: number | null }): string | null {
  if (untilBoundary !== null && boundary !== null && boundary >= untilBoundary) return `boundary ${boundary} reached ${untilBoundary}`;
  if (played >= maxTurns) return untilBoundary === null ? `played ${played} line(s)` : `--max-turns ${maxTurns} ran out before boundary ${untilBoundary}`;
  return null;
}
