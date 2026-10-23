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

export const EXPRESSIONS = ['neutral', 'happy', 'angry', 'worried', 'surprised', 'other'] as const;
export type Expression = typeof EXPRESSIONS[number];
export const INTENDED: Readonly<Record<string, Expression>> = { neutral: 'neutral', joy: 'happy', anger: 'angry', sadness: 'worried', surprise: 'surprised' };
export interface ExpressionRating { sheet: string; labels: string[]; panels: Array<{ panel: number; expression: Expression; same: boolean }>; defects: SheetRating['defects'] }

export const expressionPrompt = (count: number): string => [
  `You review a contact sheet of ${count} close-ups of one animated character's face, panels numbered 1 to ${count} from left to right.`,
  'Panel 1 is the reference. For every panel, name the facial expression it shows, choosing exactly one of:',
  '"neutral", "happy" (smile, delight), "angry" (frown, glare), "worried" (sad, anxious, upset), "surprised", "other".',
  'For every panel after the first, also say whether it shows the same character as panel 1 (same face, hair, eyes).',
  'Then list visible defects: "edge" = halo or ragged outline; "eye" = see-through, broken or doubled eye; "rectangle" = a visible box or seam;',
  '"other" = anything else clearly wrong. Do not flag art style.',
  'Answer with JSON only, no prose: {"panels":[{"panel":1,"expression":"neutral","same":true},{"panel":2,"expression":"happy","same":true}],"defects":[]}',
].join('\n');

export function readExpressionRating(sheet: string, labels: string[], text: string): ExpressionRating {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new Error(`${sheet}: the rater answered no JSON`);
  const raw = JSON.parse(match[0]) as { panels?: unknown; defects?: unknown };
  const panels = (Array.isArray(raw.panels) ? raw.panels : []).filter((row): row is { panel: number; expression: Expression; same?: boolean } =>
    typeof row?.panel === 'number' && row.panel >= 1 && row.panel <= labels.length && (EXPRESSIONS as readonly string[]).includes(row?.expression))
    .map((row) => ({ panel: row.panel, expression: row.expression, same: row.panel === 1 || row.same === true }));
  if (new Set(panels.map((row) => row.panel)).size !== labels.length) throw new Error(`${sheet}: the rater judged ${panels.length} of ${labels.length} panels`);
  const defects = Array.isArray(raw.defects) ? raw.defects.filter((row): row is SheetRating['defects'][number] =>
    typeof row?.panel === 'number' && ['edge', 'eye', 'rectangle', 'other'].includes(row?.kind) && row.panel >= 1 && row.panel <= labels.length)
    .map((row) => ({ panel: row.panel, kind: row.kind, note: String(row.note ?? '') })) : [];
  return { sheet, labels, panels: panels.sort((a, b) => a.panel - b.panel), defects };
}

export function summarizeExpressions(ratings: ExpressionRating[], textured: readonly string[] = ['joy', 'anger', 'sadness']) {
  const rows = ratings.flatMap((rating) => rating.panels.map((row) => ({ sheet: rating.sheet, label: rating.labels[row.panel - 1], ...row })));
  const scored = rows.filter((row) => textured.includes(row.label)), later = rows.filter((row) => row.panel > 1);
  return { textured: scored.length, intended: scored.filter((row) => INTENDED[row.label] === row.expression).length,
    intendedShare: scored.length ? scored.filter((row) => INTENDED[row.label] === row.expression).length / scored.length : null,
    same: later.filter((row) => row.same).length, judged: later.length, identity: later.length ? later.filter((row) => row.same).length / later.length : null,
    defects: ratings.flatMap((rating) => rating.defects.filter((row) => row.kind !== 'other').map((row) => `${rating.sheet}:${rating.labels[row.panel - 1]}:${row.kind}`)),
    confusion: rows.map((row) => `${row.sheet}:${row.label}->${row.expression}`) };
}
