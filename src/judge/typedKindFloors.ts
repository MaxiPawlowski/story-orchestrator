import type { Quality, QualityReadAs } from "@engine/index";
import { buildTypedPlan, readTypedDeltas } from "./extraction";
import { typedValueMatches, type TypedCase } from "./extractionCalibration";
import { EXTRACTION_CONFIDENCE, EXTRACTION_LATCHING_BUMP } from "./policy";
import type { JudgeAnswer, JudgeRequest } from "./types";
import { required } from "@utils/guards";

export const TYPED_KINDS: readonly QualityReadAs[] = ["choice", "stated", "rating"];
export const J76_GRID: readonly number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
export const J76_ANSWERED_FLOOR = 0.95;
export const J76_MIN_TUNE_ANSWERED = 10;
export const J76_MIN_HELD_ANSWERED = 15;
export const J76_MIN_ROWS_PER_KIND = 20;
export const J76_RUNS = 2;
export const J76_CALL_BUDGET = 150;

export type KindFloors = Record<QualityReadAs, number>;

export const SINGLE_FLOORS: KindFloors = { choice: EXTRACTION_CONFIDENCE, stated: EXTRACTION_CONFIDENCE, rating: EXTRACTION_CONFIDENCE };

export const kindFloorOf = (floors: KindFloors) => (quality: Quality): number =>
  floors[required(quality.read_as, `read_as of ${quality.key}`)] + (quality.latching ? EXTRACTION_LATCHING_BUMP : 0);

export interface TypedKindCall {
  id: string;
  request: JudgeRequest;
}

export const typedKindCalls = (cases: readonly TypedCase[]): TypedKindCall[] =>
  cases.flatMap((entry) => {
    const plan = buildTypedPlan(entry.qualities, entry.window, entry.story, entry.prior);
    return plan ? [{ id: entry.id, request: plan.request }] : [];
  });

export type TypedKindAnswers = ReadonlyMap<string, Record<string, JudgeAnswer> | null>;

export interface KindRow {
  caseId: string;
  key: string;
  kind: QualityReadAs;
  asked: boolean;
  answered: boolean;
  right: boolean | null;
}

export function kindRows(cases: readonly TypedCase[], answers: TypedKindAnswers, floors: KindFloors): KindRow[] {
  return cases.flatMap((entry) => {
    const plan = buildTypedPlan(entry.qualities, entry.window, entry.story, entry.prior);
    if (!plan) return [];
    const recorded = answers.get(entry.id) ?? null;
    const read = recorded ? readTypedDeltas(recorded, plan, entry.qualities, entry.window, kindFloorOf(floors)) : { deltas: [], answered: [] };
    return plan.decoders.map(({ key }) => {
      const quality = required(entry.qualities.find((item) => item.key === key), `quality ${key}`);
      const answered = read.answered.includes(key);
      const delta = read.deltas.find((item) => item.q === key);
      const value = delta ? delta.v : entry.prior[key];
      return {
        caseId: entry.id, key, kind: required(quality.read_as, `read_as of ${key}`), asked: recorded !== null, answered,
        right: answered ? typedValueMatches(quality, value, entry.acceptable[key] ?? null) : null,
      };
    });
  });
}

export interface KindTally {
  rows: number;
  asked: number;
  answered: number;
  right: number;
  accuracy: number | null;
  coverage: number | null;
}

const ratio = (hit: number, of: number): number | null => (of ? Number((hit / of).toFixed(4)) : null);

export const tallyKind = (rows: readonly KindRow[], kind: QualityReadAs): KindTally => {
  const mine = rows.filter((row) => row.kind === kind);
  const answered = mine.filter((row) => row.answered);
  const right = answered.filter((row) => row.right).length;
  const asked = mine.filter((row) => row.asked).length;
  return { rows: mine.length, asked, answered: answered.length, right, accuracy: ratio(right, answered.length), coverage: ratio(answered.length, asked) };
};

export const tallyKinds = (rows: readonly KindRow[]): Record<QualityReadAs, KindTally> =>
  Object.fromEntries(TYPED_KINDS.map((kind) => [kind, tallyKind(rows, kind)])) as Record<QualityReadAs, KindTally>;

const uniform = (value: number): KindFloors => ({ choice: value, stated: value, rating: value });

export interface KindSelection {
  floor: number;
  moved: boolean;
  reason: string;
  curve: Array<{ at: number } & KindTally>;
}

export function selectKindFloors(rowsAt: (floors: KindFloors) => readonly KindRow[]): { floors: KindFloors; kinds: Record<QualityReadAs, KindSelection> } {
  const curves = J76_GRID.map((at) => ({ at, tallies: tallyKinds(rowsAt(uniform(at))) }));
  const kinds = Object.fromEntries(TYPED_KINDS.map((kind) => {
    const curve = curves.map(({ at, tallies }) => ({ at, ...tallies[kind] }));
    const pick = curve.find((point) => point.answered >= J76_MIN_TUNE_ANSWERED && (point.accuracy ?? 0) >= J76_ANSWERED_FLOOR);
    const floor = pick ? pick.at : EXTRACTION_CONFIDENCE;
    const reason = pick
      ? `lowest grid floor with tuning accuracy >= ${J76_ANSWERED_FLOOR} on >= ${J76_MIN_TUNE_ANSWERED} answered rows`
      : `no grid floor reaches ${J76_ANSWERED_FLOOR} on >= ${J76_MIN_TUNE_ANSWERED} answered tuning rows: the single floor stays`;
    return [kind, { floor, moved: floor !== EXTRACTION_CONFIDENCE, reason, curve }];
  })) as Record<QualityReadAs, KindSelection>;
  return { floors: Object.fromEntries(TYPED_KINDS.map((kind) => [kind, kinds[kind].floor])) as KindFloors, kinds };
}

export type KindStatus = "pass" | "fail" | "insufficient";

export interface KindRunScore {
  candidate: KindTally;
  single: KindTally;
  status: KindStatus;
}

export const scoreKindRun = (candidate: readonly KindRow[], single: readonly KindRow[], kind: QualityReadAs): KindRunScore => {
  const at = tallyKind(candidate, kind);
  const status: KindStatus = at.rows < J76_MIN_ROWS_PER_KIND || at.answered < J76_MIN_HELD_ANSWERED ? "insufficient"
    : (at.accuracy ?? 0) >= J76_ANSWERED_FLOOR ? "pass" : "fail";
  return { candidate: at, single: tallyKind(single, kind), status };
};

export interface KindVerdict {
  floor: number;
  moved: boolean;
  runs: KindRunScore[];
  status: KindStatus;
  fixtureAllowsMove: boolean;
}

export function heldOutVerdict(floors: KindFloors, runs: ReadonlyArray<{ candidate: readonly KindRow[]; single: readonly KindRow[] }>): Record<QualityReadAs, KindVerdict> {
  return Object.fromEntries(TYPED_KINDS.map((kind) => {
    const scored = runs.map((run) => scoreKindRun(run.candidate, run.single, kind));
    const status: KindStatus = scored.length < J76_RUNS || scored.some((run) => run.status === "insufficient") ? "insufficient"
      : scored.every((run) => run.status === "pass") ? "pass" : "fail";
    const moved = floors[kind] !== EXTRACTION_CONFIDENCE;
    return [kind, { floor: floors[kind], moved, runs: scored, status, fixtureAllowsMove: moved && status === "pass" }];
  })) as Record<QualityReadAs, KindVerdict>;
}

export interface ReplayKeyRow {
  readAs: string | null;
  confidence: number | null;
  latching: boolean;
  class: string;
}

export interface ReplayKindLeg {
  keys: number;
  withConfidence: number;
  keptAtCandidate: number;
  handedBack: number;
  differAll: number;
  differKept: number;
  unseenBelowSingle: boolean;
}

export function replayKindLeg(rows: readonly ReplayKeyRow[], floors: KindFloors): Record<string, ReplayKindLeg> {
  const kinds = [...new Set(rows.map((row) => row.readAs ?? "unknown"))].sort();
  return Object.fromEntries(kinds.map((kind) => {
    const mine = rows.filter((row) => (row.readAs ?? "unknown") === kind);
    const floor = (TYPED_KINDS as readonly string[]).includes(kind) ? floors[kind as QualityReadAs] : EXTRACTION_CONFIDENCE;
    const kept = mine.filter((row) => row.confidence === null || row.confidence >= floor + (row.latching ? EXTRACTION_LATCHING_BUMP : 0));
    return [kind, {
      keys: mine.length,
      withConfidence: mine.filter((row) => row.confidence !== null).length,
      keptAtCandidate: kept.length,
      handedBack: mine.length - kept.length,
      differAll: mine.filter((row) => row.class !== "agree").length,
      differKept: kept.filter((row) => row.class !== "agree").length,
      unseenBelowSingle: floor < EXTRACTION_CONFIDENCE,
    }];
  }));
}
