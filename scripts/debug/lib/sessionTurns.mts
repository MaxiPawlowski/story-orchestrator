export const nextScriptLine = (lines: readonly string[], at: number): string => lines[((at % lines.length) + lines.length) % lines.length];

export function turnsStop({ played, maxTurns, boundary, untilBoundary }: { played: number; maxTurns: number; boundary: number | null; untilBoundary: number | null }): string | null {
  if (untilBoundary !== null && boundary !== null && boundary >= untilBoundary) return `boundary ${boundary} reached ${untilBoundary}`;
  if (played >= maxTurns) return untilBoundary === null ? `played ${played} line(s)` : `--max-turns ${maxTurns} ran out before boundary ${untilBoundary}`;
  return null;
}

export function rowBoundary(row: unknown, previous: number | null): number | null {
  const boundary = (row as { boundary?: unknown } | null)?.boundary;
  if (typeof boundary === 'number' && Number.isFinite(boundary)) return boundary;
  const to = (boundary as { to?: unknown } | null)?.to;
  return typeof to === 'number' && Number.isFinite(to) ? to : previous;
}
