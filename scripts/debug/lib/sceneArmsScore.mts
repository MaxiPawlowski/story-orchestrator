export interface EpistemicItem { setAt?: number; tag?: string; tags?: string[]; subject?: string; needles: string[] }
export interface LedgerItem { setAt?: number; entity: string; field?: string; needles: string[] }
export interface EpistemicSignal { tag: string; subject: string; content: string; hiddenFrom?: string }
export interface LedgerSignal { entity: string; field: string; value: string }
export interface SceneExpected { epistemic: EpistemicItem[]; ledger: LedgerItem[]; forbidden: EpistemicItem[] }
export interface ArmReading { epistemic: EpistemicSignal[]; ledger: LedgerSignal[]; promptChars: number }
export interface ArmScore { items: number; found: number; signals: number; forbiddenHits: number; promptChars: number }

export const F3_FLOORS = { recallGain: 0.25, precisionDrop: 0.1, costRatio: 3 } as const;

const lower = (value: string | undefined) => (value ?? '').toLowerCase();

export function matchesEpistemic(item: EpistemicItem, signal: EpistemicSignal): boolean {
  const tags = item.tags ?? (item.tag ? [item.tag] : null);
  if (tags && !tags.includes(signal.tag)) return false;
  if (item.subject && !lower(signal.subject).includes(lower(item.subject))) return false;
  const haystack = lower(`${signal.subject} ${signal.hiddenFrom ?? ''} ${signal.content}`);
  return item.needles.every((needle) => haystack.includes(lower(needle)));
}

export function matchesLedger(item: LedgerItem, signal: LedgerSignal): boolean {
  if (!lower(signal.entity).includes(lower(item.entity))) return false;
  if (item.field && lower(signal.field) !== lower(item.field)) return false;
  return item.needles.every((needle) => lower(signal.value).includes(lower(needle)));
}

export function scoreArm(expected: SceneExpected, reading: ArmReading): ArmScore {
  const found = expected.epistemic.filter((item) => reading.epistemic.some((signal) => matchesEpistemic(item, signal))).length
    + expected.ledger.filter((item) => reading.ledger.some((signal) => matchesLedger(item, signal))).length;
  const forbiddenHits = reading.epistemic.filter((signal) => expected.forbidden.some((item) => matchesEpistemic(item, signal))).length;
  return { items: expected.epistemic.length + expected.ledger.length, found, signals: reading.epistemic.length + reading.ledger.length, forbiddenHits, promptChars: reading.promptChars };
}

export interface SliceTotals { items: number; found: number; signals: number; forbiddenHits: number; promptChars: number; recall: number; precision: number }

export function sliceTotals(scores: ArmScore[]): SliceTotals {
  const sum = (key: keyof ArmScore) => scores.reduce((total, score) => total + score[key], 0);
  const items = sum('items');
  const signals = sum('signals');
  return {
    items,
    found: sum('found'),
    signals,
    forbiddenHits: sum('forbiddenHits'),
    promptChars: sum('promptChars'),
    recall: items ? sum('found') / items : 0,
    precision: signals ? 1 - sum('forbiddenHits') / signals : 1,
  };
}

export interface F3Verdict { build: boolean; reasons: string[]; recallGainLong: number; recallChangeShort: number; precisionDrop: number; costRatio: number }

export function f3Verdict(slices: { long: { A: SliceTotals; B: SliceTotals }; short: { A: SliceTotals; B: SliceTotals } }): F3Verdict {
  const recallGainLong = slices.long.B.recall - slices.long.A.recall;
  const recallChangeShort = slices.short.B.recall - slices.short.A.recall;
  const bothA = slices.long.A.signals + slices.short.A.signals ? 1 - (slices.long.A.forbiddenHits + slices.short.A.forbiddenHits) / (slices.long.A.signals + slices.short.A.signals) : 1;
  const bothB = slices.long.B.signals + slices.short.B.signals ? 1 - (slices.long.B.forbiddenHits + slices.short.B.forbiddenHits) / (slices.long.B.signals + slices.short.B.signals) : 1;
  const precisionDrop = bothA - bothB;
  const charsA = slices.long.A.promptChars + slices.short.A.promptChars;
  const costRatio = charsA ? (slices.long.B.promptChars + slices.short.B.promptChars) / charsA : Infinity;
  const reasons: string[] = [];
  if (recallGainLong < F3_FLOORS.recallGain) reasons.push(`long-slice recall gain ${recallGainLong.toFixed(3)} < ${F3_FLOORS.recallGain}`);
  if (recallChangeShort < 0) reasons.push(`short-slice recall lost ${(-recallChangeShort).toFixed(3)}`);
  if (precisionDrop > F3_FLOORS.precisionDrop) reasons.push(`precision drop ${precisionDrop.toFixed(3)} > ${F3_FLOORS.precisionDrop}`);
  if (costRatio > F3_FLOORS.costRatio) reasons.push(`prompt cost ${costRatio.toFixed(2)}x > ${F3_FLOORS.costRatio}x`);
  return { build: reasons.length === 0, reasons, recallGainLong, recallChangeShort, precisionDrop, costRatio };
}
