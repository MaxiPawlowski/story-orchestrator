import type { RelationValue, WitnessLookup, WitnessState } from "../audience";

export const WITNESS_LABELS_FORMAT = "so-witness-labels/1";

export const WITNESS_FLOORS = {
  exactSet: 0.9,
  falseInclusion: 0.02,
  falseExclusion: 0.1,
  coverage: 0.85,
  mixedDetection: 0.8,
  spanFalseInclusion: 0.02,
  asideExactSet: 0.8,
  nullControlMargin: 0.3,
  minMessages: 40,
} as const;

export interface WitnessLabelSpan {
  span: [number, number];
  heard: string[] | "unknown";
}

export interface WitnessLabel {
  messageId: number;
  present: string[];
  heard: string[] | "unknown";
  spans?: WitnessLabelSpan[];
  review?: { writer: string; checker: string; agreed: boolean } | null;
}

export interface WitnessLabelSet {
  format: typeof WITNESS_LABELS_FORMAT;
  set: string;
  synthetic: boolean;
  members: string[];
  labels: WitnessLabel[];
}

export type WitnessPredict = (messageId: number, member: string, span?: [number, number]) => WitnessLookup;

export interface Ratio {
  hits: number;
  of: number;
  rate: number | null;
}

export interface WitnessScore {
  set: string;
  messages: number;
  dropped: number;
  exactSet: Ratio;
  falseInclusion: Ratio;
  asideKeptOutIncluded: number;
  falseExclusion: Ratio;
  coverage: Ratio;
  states: Partial<Record<WitnessState, number>>;
  ambiguous: { pairs: number; predictedHeard: number };
  mixedDetection: Ratio;
  spanFalseInclusion: Ratio;
  asideExactSet: Ratio;
  floors: Record<"exactSet" | "falseInclusion" | "asideKeptOut" | "falseExclusion" | "coverage" | "mixedDetection" | "spanFalseInclusion" | "asideExactSet", boolean | null>;
  verdict: "pass" | "fail" | "insufficient";
}

const ratio = (hits: number, of: number): Ratio => ({ hits, of, rate: of ? hits / of : null });

const atLeast = (value: Ratio, floor: number): boolean | null => (value.rate === null ? null : value.rate >= floor - 1e-9);

const atMost = (value: Ratio, floor: number): boolean | null => (value.rate === null ? null : value.rate <= floor + 1e-9);

const isAside = (label: WitnessLabel): boolean =>
  !label.spans?.length && label.heard !== "unknown" && label.heard.length < label.present.length && label.heard.every((member) => label.present.includes(member));

const predictedSet = (members: readonly string[], lookups: ReadonlyMap<string, WitnessLookup>): string[] | null => {
  const values = members.map((member) => lookups.get(member) as WitnessLookup);
  if (values.some((value) => value.state !== "classified" || value.mixed || value.heard === "unknown")) return null;
  return members.filter((member) => lookups.get(member)?.heard === "yes");
};

const sameSet = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((member) => right.includes(member));

export function scoreWitness(set: WitnessLabelSet, predict: WitnessPredict): WitnessScore {
  const kept = set.labels.filter((label) => set.synthetic || (label.review && label.review.writer !== label.review.checker && label.review.agreed));
  const counts = { exact: 0, classified: 0, fi: 0, notHeard: 0, fe: 0, heard: 0, covered: 0, ambiguousPairs: 0, ambiguousHeard: 0,
    mixedLabelled: 0, mixedFlagged: 0, spanFi: 0, spanNotHeard: 0, asides: 0, asideExact: 0, asideKeptOut: 0 };
  const states: Partial<Record<WitnessState, number>> = {};
  for (const label of kept) {
    const lookups = new Map(set.members.map((member) => [member, predict(label.messageId, member)] as const));
    const first = lookups.get(set.members[0]);
    if (first) states[first.state] = (states[first.state] ?? 0) + 1;
    if (label.spans?.length) {
      counts.mixedLabelled += 1;
      if (first?.mixed) counts.mixedFlagged += 1;
      if (first?.state === "classified" && first.mixed) counts.covered += 1;
      for (const span of label.spans) {
        if (span.heard === "unknown") continue;
        for (const member of set.members.filter((entry) => !(span.heard as string[]).includes(entry))) {
          const lookup = predict(label.messageId, member, span.span);
          counts.spanNotHeard += 1;
          if (lookup.state === "classified" && lookup.heard === "yes") counts.spanFi += 1;
        }
      }
      continue;
    }
    const predicted = predictedSet(set.members, lookups);
    if (predicted) counts.covered += 1;
    if (label.heard === "unknown") {
      counts.ambiguousPairs += set.members.length;
      counts.ambiguousHeard += set.members.filter((member) => lookups.get(member)?.heard === "yes" && lookups.get(member)?.state === "classified").length;
      continue;
    }
    const heard = label.heard;
    for (const member of set.members) {
      const value: RelationValue = (lookups.get(member) as WitnessLookup).state === "classified" ? (lookups.get(member) as WitnessLookup).heard : "unknown";
      if (heard.includes(member)) {
        counts.heard += 1;
        if (value === "no") counts.fe += 1;
      } else {
        counts.notHeard += 1;
        if (value === "yes") counts.fi += 1;
        if (value === "yes" && isAside(label) && label.present.includes(member)) counts.asideKeptOut += 1;
      }
    }
    if (predicted) {
      counts.classified += 1;
      if (sameSet(predicted, heard)) counts.exact += 1;
    }
    if (isAside(label)) {
      counts.asides += 1;
      if (predicted && sameSet(predicted, heard)) counts.asideExact += 1;
    }
  }
  const exactSet = ratio(counts.exact, counts.classified);
  const falseInclusion = ratio(counts.fi + counts.ambiguousHeard, counts.notHeard + counts.ambiguousPairs);
  const falseExclusion = ratio(counts.fe, counts.heard);
  const coverage = ratio(counts.covered, kept.length);
  const mixedDetection = ratio(counts.mixedFlagged, counts.mixedLabelled);
  const spanFalseInclusion = ratio(counts.spanFi, counts.spanNotHeard);
  const asideExactSet = ratio(counts.asideExact, counts.asides);
  return withFloors({
    set: set.set, messages: kept.length, dropped: set.labels.length - kept.length, exactSet, falseInclusion, asideKeptOutIncluded: counts.asideKeptOut, falseExclusion,
    coverage, states, ambiguous: { pairs: counts.ambiguousPairs, predictedHeard: counts.ambiguousHeard }, mixedDetection, spanFalseInclusion, asideExactSet,
  });
}

type Measured = Omit<WitnessScore, "floors" | "verdict">;

function withFloors(score: Measured): WitnessScore {
  const floors = {
    exactSet: atLeast(score.exactSet, WITNESS_FLOORS.exactSet),
    falseInclusion: atMost(score.falseInclusion, WITNESS_FLOORS.falseInclusion),
    asideKeptOut: score.asideKeptOutIncluded === 0,
    falseExclusion: atMost(score.falseExclusion, WITNESS_FLOORS.falseExclusion),
    coverage: atLeast(score.coverage, WITNESS_FLOORS.coverage),
    mixedDetection: atLeast(score.mixedDetection, WITNESS_FLOORS.mixedDetection),
    spanFalseInclusion: atMost(score.spanFalseInclusion, WITNESS_FLOORS.spanFalseInclusion),
    asideExactSet: atLeast(score.asideExactSet, WITNESS_FLOORS.asideExactSet),
  };
  const verdict = score.messages < WITNESS_FLOORS.minMessages ? "insufficient" : Object.values(floors).every((value) => value !== false) ? "pass" : "fail";
  return { ...score, floors, verdict };
}

const sum = (scores: readonly WitnessScore[], pick: (score: WitnessScore) => Ratio): Ratio =>
  ratio(scores.reduce((total, score) => total + pick(score).hits, 0), scores.reduce((total, score) => total + pick(score).of, 0));

export function combineWitnessScores(set: string, scores: readonly WitnessScore[]): WitnessScore {
  const states: Partial<Record<WitnessState, number>> = {};
  scores.forEach((score) => Object.entries(score.states).forEach(([state, count]) => {
    states[state as WitnessState] = (states[state as WitnessState] ?? 0) + (count ?? 0);
  }));
  return withFloors({
    set,
    messages: scores.reduce((total, score) => total + score.messages, 0),
    dropped: scores.reduce((total, score) => total + score.dropped, 0),
    exactSet: sum(scores, (score) => score.exactSet),
    falseInclusion: sum(scores, (score) => score.falseInclusion),
    asideKeptOutIncluded: scores.reduce((total, score) => total + score.asideKeptOutIncluded, 0),
    falseExclusion: sum(scores, (score) => score.falseExclusion),
    coverage: sum(scores, (score) => score.coverage),
    states,
    ambiguous: { pairs: scores.reduce((total, score) => total + score.ambiguous.pairs, 0), predictedHeard: scores.reduce((total, score) => total + score.ambiguous.predictedHeard, 0) },
    mixedDetection: sum(scores, (score) => score.mixedDetection),
    spanFalseInclusion: sum(scores, (score) => score.spanFalseInclusion),
    asideExactSet: sum(scores, (score) => score.asideExactSet),
  });
}

export const presencePredict = (set: WitnessLabelSet): WitnessPredict => {
  const byId = new Map(set.labels.map((label) => [label.messageId, label]));
  return (messageId, member) => {
    const label = byId.get(messageId);
    if (!label) return { state: "no-read", heard: "unknown", mixed: false, insideHeardSpan: false };
    return { state: "classified", heard: label.present.includes(member) ? "yes" : "no", mixed: false, insideHeardSpan: false };
  };
};

export const nullControlBeaten = (score: WitnessScore, control: WitnessScore): boolean | null =>
  (score.asideExactSet.rate === null || control.asideExactSet.rate === null ? null : score.asideExactSet.rate - control.asideExactSet.rate >= WITNESS_FLOORS.nullControlMargin - 1e-9);
