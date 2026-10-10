import { evaluateGate, type GateNode, type PrimitiveValue, type Transition } from "@engine/index";
import type { ReplayHistory, ReplayLogEntry } from "./replaySource";

export { buildReplaySource, qualitySignature, type GateReplaySource, type ReplayHistory, type ReplayLogEntry } from "./replaySource";

export type ReplayHolds = boolean | "unknown";

export const draftEdges = (transitions: readonly Pick<Transition, "from" | "to" | "gate" | "priority">[]): ReplayEdge[] =>
  transitions.map((transition, order) => ({ from: transition.from, to: transition.to, gate: transition.gate, priority: transition.priority, order }));

export interface ReplayEdge {
  from: string;
  to: string;
  gate: GateNode;
  priority: number;
  order: number;
}

export interface ReplayRow {
  boundary: number;
  messageId: number;
  atSource: boolean;
  manual: boolean;
  holds: ReplayHolds | null;
  wouldFire: ReplayHolds | null;
  recordedFire: boolean;
  afterDivergence: boolean;
}

export interface ReplayResult {
  rows: ReplayRow[];
  firstHold: ReplayRow | null;
  recordedFire: ReplayRow | null;
  divergesAt: number | null;
  manualAt: number | null;
  unknownQualities: string[];
  window: { fromBoundary: number; boundaries: number };
}

export interface ReplayInput {
  edge: ReplayEdge;
  siblings: ReplayEdge[];
  history: ReplayHistory;
  declared: ReadonlySet<string>;
}

const leafKeys = (gate: GateNode): string[] => {
  if ("q" in gate) return [gate.q];
  if ("all" in gate) return gate.all.flatMap(leafKeys);
  if ("any" in gate) return gate.any.flatMap(leafKeys);
  return leafKeys(gate.not);
};

const holdsOn = (gate: GateNode, evaluated: Record<string, PrimitiveValue>, declared: ReadonlySet<string>): ReplayHolds => {
  if (leafKeys(gate).some((key) => !declared.has(key))) return "unknown";
  return evaluateGate(gate, { get: (key) => evaluated[key] });
};

const precedes = (left: ReplayEdge, right: ReplayEdge): boolean => left.priority > right.priority || (left.priority === right.priority && left.order < right.order);

const sameEdge = (left: ReplayEdge, right: ReplayEdge): boolean => left.from === right.from && left.to === right.to && left.order === right.order;

const firesThis = (fired: ReplayLogEntry["fired"], edge: ReplayEdge, siblings: ReplayEdge[]): boolean => {
  if (!fired || fired.from !== edge.from || fired.to !== edge.to) return false;
  const twins = siblings.filter((sibling) => sibling.to === edge.to).length;
  return twins <= 1 || fired.declarationIndex === undefined || fired.declarationIndex === edge.order;
};

const decide = (edge: ReplayEdge, ahead: ReplayEdge[], evaluated: Record<string, PrimitiveValue>, declared: ReadonlySet<string>): { holds: ReplayHolds; wouldFire: ReplayHolds } => {
  const holds = holdsOn(edge.gate, evaluated, declared);
  if (holds !== true) return { holds, wouldFire: holds };
  const earlier = ahead.map((sibling) => holdsOn(sibling.gate, evaluated, declared));
  if (earlier.includes(true)) return { holds, wouldFire: false };
  return { holds, wouldFire: earlier.includes("unknown") ? "unknown" : true };
};

export function replayGate(input: ReplayInput): ReplayResult {
  const { edge, history, declared } = input;
  const siblings = [...input.siblings.filter((sibling) => sibling.from === edge.from && !sameEdge(sibling, edge)), edge];
  const ahead = siblings.filter((sibling) => sibling !== edge && precedes(sibling, edge));
  const retained = history.log.filter((entry) => entry.boundary > history.from.boundary);
  let divergesAt: number | null = null;
  let manualAt: number | null = null;
  const rows: ReplayRow[] = retained.map((entry) => {
    const atSource = entry.before.activeCheckpointId === edge.from;
    const recordedFire = firesThis(entry.fired, edge, siblings);
    const manual = entry.source === "manual" || entry.evaluated === null;
    const settled = divergesAt !== null || manualAt !== null;
    if (manual) {
      if (manualAt === null) manualAt = entry.boundary;
      return { boundary: entry.boundary, messageId: entry.context.lastMessageId, atSource, manual, holds: null, wouldFire: null, recordedFire, afterDivergence: settled };
    }
    const { holds, wouldFire } = atSource ? decide(edge, ahead, entry.evaluated ?? {}, declared) : { holds: holdsOn(edge.gate, entry.evaluated ?? {}, declared), wouldFire: false as ReplayHolds };
    if (!settled && atSource && wouldFire !== "unknown" && wouldFire !== recordedFire) divergesAt = entry.boundary;
    return { boundary: entry.boundary, messageId: entry.context.lastMessageId, atSource, manual, holds, wouldFire, recordedFire, afterDivergence: settled };
  });
  const firstHold = rows.find((row) => row.atSource && !row.afterDivergence && row.wouldFire === true) ?? null;
  const unknownQualities = [...new Set(leafKeys(edge.gate).filter((key) => !declared.has(key)))].sort();
  return {
    rows,
    firstHold,
    recordedFire: rows.find((row) => row.recordedFire) ?? null,
    divergesAt,
    manualAt,
    unknownQualities,
    window: { fromBoundary: history.from.boundary, boundaries: rows.length },
  };
}
