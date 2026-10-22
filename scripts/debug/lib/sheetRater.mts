export interface SheetRating {
  sheet: string;
  panels: string[];
  same: Array<{ panel: number; same: boolean }>;
  defects: Array<{ panel: number; kind: 'edge' | 'eye' | 'rectangle' | 'other'; note: string }>;
}

export const raterPrompt = (panels: string[]): string => [
  'You review a contact sheet of character sprites for an art pipeline. Panels are left to right, each over mid grey:',
  ...panels.map((label, index) => `${index + 1}. ${label}`),
  'Panel 1 is the reference character. For every later panel, say whether it shows the same character (same face, hair,',
  'build; a different outfit or pose is still the same character). Then list visible defects in any panel:',
  '"edge" = halo, fringe or ragged cut-out outline; "eye" = see-through, missing or broken eye, or a blink that leaves an eye open;',
  '"rectangle" = a visible box or seam where an edit was pasted; "other" = anything else clearly wrong. Do not flag style or pose choices.',
  'Answer with JSON only, no prose: {"same":[{"panel":2,"same":true}],"defects":[{"panel":3,"kind":"edge","note":"..."}]}',
].join('\n');

export function readRating(sheet: string, panels: string[], text: string): SheetRating {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new Error(`${sheet}: the rater answered no JSON`);
  const raw = JSON.parse(match[0]) as { same?: unknown; defects?: unknown };
  const same = Array.isArray(raw.same) ? raw.same.filter((row): row is { panel: number; same: boolean } =>
    typeof row?.panel === 'number' && typeof row?.same === 'boolean' && row.panel >= 2 && row.panel <= panels.length) : [];
  const defects = Array.isArray(raw.defects) ? raw.defects.filter((row): row is SheetRating['defects'][number] =>
    typeof row?.panel === 'number' && ['edge', 'eye', 'rectangle', 'other'].includes(row?.kind) && row.panel >= 1 && row.panel <= panels.length)
    .map((row) => ({ panel: row.panel, kind: row.kind, note: String(row.note ?? '') })) : [];
  if (same.length !== panels.length - 1) throw new Error(`${sheet}: the rater judged ${same.length} of ${panels.length - 1} panels`);
  return { sheet, panels, same, defects };
}

export function summarize(ratings: SheetRating[]) {
  const judged = ratings.flatMap((rating) => rating.same), same = judged.filter((row) => row.same).length;
  const flagged = ratings.filter((rating) => rating.defects.some((row) => row.kind !== 'other'));
  return { sheets: ratings.length, identity: judged.length ? same / judged.length : null, same, judged: judged.length,
    flaggedSheets: flagged.map((rating) => rating.sheet), flagged: flagged.length };
}
