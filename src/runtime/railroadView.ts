import { evaluateGate, PLAYER_TURNS_KEY, type BoundaryLogEntry, type GateNode, type NormalizedTransition, type PrimitiveValue } from "@engine/index";
import { LIVING_BRANCH_PREFIX, LIVING_STUB_SUFFIX } from "@generation/living/types";
import { AGENCY_STALL_TURNS } from "./agencyRecovery";

export type LivingLeaf = "lead" | "pace";

export const LIVING_PREFIX = "liv_";
export const PACE_FORCED_FLOOR = 1 / 3;

export interface RailroadRow {
  boundary: number;
  messageId: number;
  from: string;
  to: string;
  leaf: LivingLeaf;
}

export interface RailroadView {
  living: number;
  lead: number;
  pace: number;
  paceShare: number | null;
  overFloor: boolean;
  quietRuns: number;
  longestQuiet: number;
  branches: Record<string, number>;
  rows: RailroadRow[];
}

const isWayIn = (transition: Pick<NormalizedTransition, "to">): boolean =>
  transition.to.startsWith(LIVING_PREFIX) && transition.to.endsWith(LIVING_STUB_SUFFIX);

const countsTurns = (gate: GateNode): boolean => "q" in gate && gate.q === PLAYER_TURNS_KEY;

export function heldLeaf(gate: GateNode, values: Readonly<Record<string, PrimitiveValue>>): LivingLeaf {
  const reader = { get: (key: string) => values[key] };
  const branches = "any" in gate ? gate.any : [gate];
  const holds = branches.filter((branch) => evaluateGate(branch, reader));
  return holds.length && holds.every(countsTurns) ? "pace" : "lead";
}

const playerTurnOf = (entry: BoundaryLogEntry): number | undefined => entry.context.lastPlayerMessageId;

export function railroadView(log: readonly BoundaryLogEntry[]): RailroadView {
  const rows: RailroadRow[] = [];
  const branches: Record<string, number> = {};
  let quietRuns = 0;
  let longestQuiet = 0;
  let quietTurns = new Set<number>();
  const closeQuiet = () => {
    if (quietTurns.size >= AGENCY_STALL_TURNS) quietRuns += 1;
    longestQuiet = Math.max(longestQuiet, quietTurns.size);
    quietTurns = new Set<number>();
  };
  for (const entry of log) {
    const fired = entry.fired;
    const at = entry.before.activeCheckpointId;
    if (!fired) {
      const turn = playerTurnOf(entry);
      if (at?.startsWith(LIVING_PREFIX) && !at.endsWith(LIVING_STUB_SUFFIX) && turn !== undefined) quietTurns.add(turn);
      continue;
    }
    closeQuiet();
    if (!isWayIn(fired)) continue;
    rows.push({ boundary: entry.boundary, messageId: entry.context.lastMessageId, from: fired.from, to: fired.to, leaf: heldLeaf(fired.gate, entry.evaluated ?? entry.before.blackboard.values) });
    if (fired.to.startsWith(LIVING_BRANCH_PREFIX) && fired.to.endsWith(LIVING_STUB_SUFFIX)) branches[fired.from] = (branches[fired.from] ?? 0) + 1;
  }
  closeQuiet();
  const count = (leaf: LivingLeaf) => rows.filter((row) => row.leaf === leaf).length;
  const pace = count("pace");
  const paceShare = rows.length ? pace / rows.length : null;
  return {
    living: rows.length, lead: count("lead"), pace, paceShare, overFloor: paceShare !== null && paceShare > PACE_FORCED_FLOOR,
    quietRuns, longestQuiet, branches, rows,
  };
}
