import type { LivingOp, LivingOpPayload, LivingRuntimeState } from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const listOf = (raw: Record<string, unknown>, key: string): unknown[] => {
  const value = raw[key];
  if (Array.isArray(value)) return value;
  const created: unknown[] = [];
  raw[key] = created;
  return created;
};

const applyOp = (raw: Record<string, unknown>, op: LivingOpPayload) => {
  if (op.kind === "add-checkpoint" || op.kind === "add-stub") listOf(raw, "checkpoints").push(clone(op.checkpoint));
  else if (op.kind === "add-transition") listOf(raw, "transitions").push(clone(op.transition));
  else if (op.kind === "add-quality") listOf(raw, "qualities").push(clone(op.quality));
  else listOf(raw, "chapters").push(clone(op.chapter));
};

export function foldOps(raw: Record<string, unknown>, ops: readonly LivingOpPayload[]): Record<string, unknown> {
  const next = clone(raw);
  ops.forEach((op) => applyOp(next, op));
  return next;
}

export const livingBase = (state: LivingRuntimeState): Record<string, unknown> | null =>
  (state.authored ? foldOps(state.authored.raw, state.folded) : null);

export const livingRaw = (state: LivingRuntimeState): Record<string, unknown> | null => {
  const base = livingBase(state);
  return base ? foldOps(base, state.ops) : null;
};

export const graphEpoch = (state: LivingRuntimeState): string => {
  const last = state.ops.at(-1) ?? state.folded.at(-1);
  return `${state.epochBumps}:${state.folded.length + state.ops.length}:${last?.id ?? "-"}`;
};

export const opsAfter = (state: LivingRuntimeState, boundary: number): LivingOp[] => state.ops.filter((op) => op.boundary > boundary);

export function dropOpsAfter(state: LivingRuntimeState, boundary: number): { state: LivingRuntimeState; dropped: LivingOp[] } {
  const dropped = opsAfter(state, boundary);
  if (!dropped.length) return { state, dropped };
  const gone = new Set(dropped.map((op) => op.proposalId));
  const proposals = state.proposals.map((proposal) => (gone.has(proposal.id) && proposal.status === "applied"
    ? { ...proposal, status: "withdrawn" as const, reason: "rolled back: the boundary that applied it was undone" }
    : proposal));
  return { state: { ...state, ops: state.ops.filter((op) => op.boundary <= boundary), proposals, epochBumps: state.epochBumps + 1 }, dropped };
}

export function compactOps(state: LivingRuntimeState, floorBoundary: number): LivingRuntimeState {
  const settled = state.ops.filter((op) => op.boundary <= floorBoundary);
  if (!settled.length) return state;
  return { ...state, folded: [...state.folded, ...settled], ops: state.ops.filter((op) => op.boundary > floorBoundary) };
}
