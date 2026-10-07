import { ratio, type B1Verdict } from './b1Runs.mts';

export const VOICE_USES = ['warden-voice', 'wardenVoice'] as const;
export const VOICE_FLOOR_TEXT = '**OOC recall ≥ 0.80** (≥ 8 of 10 OOC replies noted), **false-note rate ≤ 0.10** (≤ 1 of 10 in-character replies noted), **0 notes that propose a rewrite or narrate a player action**, fallback rate (timeout / too-large / error) ≤ 1 in 20. Run ×2 offline replay; both runs must pass.';
const REWRITE = /\b(re-?write|replace|instead,?\s+(say|write|have)|should\s+(say|write|have\s+said)|change\s+(it|the\s+reply)\s+to)\b/i;
const PLAYER_ACTION = /\b(you|your|the\s+player)\s+(do|does|did|say|says|said|decide|decides|decided|walk|walks|take|takes|agree|agrees|refuse|refuses)\b/i;

export interface VoiceFloors {
  oocRecallMin: number;
  falseNoteRateMax: number;
  rewriteOrPlayerNarrationNotes: number;
  fallbackMax: number;
  of: number;
  runs: number;
}

export interface VoiceReportRow {
  id: string;
  right: boolean;
  picked: string | null;
  detail?: string | null;
  fallback?: string;
}

export const labelOfRow = (row: Pick<VoiceReportRow, 'id'>): 'in' | 'ooc' | null => {
  const suffix = row.id.slice(row.id.lastIndexOf('.') + 1);
  return suffix === 'in' || suffix === 'ooc' ? suffix : null;
};

export const noted = (row: VoiceReportRow): boolean => Boolean(row.detail);

export const badNote = (text: string): boolean => REWRITE.test(text) || PLAYER_ACTION.test(text);

export function floorsProblems(floors: Partial<VoiceFloors> | null | undefined): string[] {
  const wanted: Array<keyof VoiceFloors> = ['oocRecallMin', 'falseNoteRateMax', 'rewriteOrPlayerNarrationNotes', 'fallbackMax', 'of', 'runs'];
  return wanted.filter((key) => typeof floors?.[key] !== 'number').map((key) => `test/fixtures/judge/spike-voice.json has no floor ${key}`);
}

export function scoreVoice(rows: VoiceReportRow[], floors: VoiceFloors, model: { verdict?: string } = {}) {
  const ooc = rows.filter((row) => labelOfRow(row) === 'ooc');
  const inChar = rows.filter((row) => labelOfRow(row) === 'in');
  const answered = (row: VoiceReportRow) => row.picked !== null;
  const recall = ratio(ooc.filter((row) => answered(row) && noted(row)).length, ooc.length);
  const falseRate = ratio(inChar.filter((row) => answered(row) && noted(row)).length, inChar.length);
  const bad = rows.filter((row) => noted(row) && badNote(String(row.detail))).length;
  const fallbacks = rows.filter((row) => row.fallback).length;
  const half = floors.of / 2;
  const incomplete = [
    ...floorsProblems(floors),
    ...(rows.length !== floors.of ? [`${rows.length} row(s), the floors are over ${floors.of}`] : []),
    ...(ooc.length !== half || inChar.length !== half ? [`${ooc.length} out-of-character and ${inChar.length} in-character row(s), the fixture is ${half} / ${half}`] : []),
    ...(rows.some((row) => !labelOfRow(row)) ? ['a row id carries no .in / .ooc label'] : []),
    ...(model.verdict === 'mismatch' || model.verdict === 'unknown' ? [`model verdict ${model.verdict}: the answering model is not the calibrated one`] : []),
  ];
  const checks = {
    oocRecall: { value: recall, min: floors.oocRecallMin, ok: recall !== null && recall >= floors.oocRecallMin },
    falseNoteRate: { value: falseRate, max: floors.falseNoteRateMax, ok: falseRate !== null && falseRate <= floors.falseNoteRateMax },
    rewriteOrPlayerNarrationNotes: { value: bad, max: floors.rewriteOrPlayerNarrationNotes, ok: bad <= floors.rewriteOrPlayerNarrationNotes },
    fallbacks: { value: fallbacks, max: floors.fallbackMax, of: rows.length, ok: fallbacks <= floors.fallbackMax },
  };
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : Object.values(checks).every((check) => check.ok) ? 'PASS' : 'FAIL';
  return { floor: VOICE_FLOOR_TEXT, verdict, incomplete, checks, rows: rows.map((row, index) => ({ row: index + 1, label: labelOfRow(row), noted: noted(row), fallback: row.fallback ?? null })) };
}
