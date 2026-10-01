import type { StoryV2 } from "@engine/index";
import type { ProvisioningOp } from "@wizard/index";
import { describeMismatch, type RunOwnership } from "@runtime/runToken";
import { resolveProvisioning, stopAgent, type AgentTurn } from "./loop";
import type { AgentOp, AgentSession, AgentStep } from "./types";

export interface AgentRunner {
  (session: AgentSession, draft: StoryV2): Promise<AgentTurn>;
  settle?: (turn: AgentTurn) => Promise<void>;
  close?: () => Promise<void>;
}

export const DRIVE_LIMIT = 60;

export interface DriveDeps {
  runner: AgentRunner;
  ownership: RunOwnership;
  draft: () => StoryV2;
  applyOp: (op: AgentOp) => void;
  commit: (session: AgentSession) => void;
  stopRequested: () => boolean;
  limit?: number;
}

export interface DriveOutcome {
  session: AgentSession;
  lapsed: string | null;
}

const moving = (session: AgentSession) => session.status === "planning" || session.status === "running";

export async function driveAgent(start: AgentSession, deps: DriveDeps): Promise<DriveOutcome> {
  const token = deps.ownership.mint();
  let current = start;
  deps.commit(current);
  try {
    for (let turn = 0; turn < (deps.limit ?? DRIVE_LIMIT) && moving(current); turn += 1) {
      if (deps.stopRequested()) {
        current = stopAgent(current);
        deps.commit(current);
        break;
      }
      const result = await deps.runner(current, deps.draft());
      const owned = deps.ownership.check(token);
      if (!owned.ok) return { session: current, lapsed: describeMismatch(owned) };
      if (result.apply) deps.applyOp(result.apply);
      current = result.session;
      deps.commit(current);
      if (deps.runner.settle) await deps.runner.settle(result);
    }
    return { session: current, lapsed: null };
  } finally {
    if (deps.runner.close) await deps.runner.close();
  }
}

export interface ProvisionDeps {
  ownership: RunOwnership;
  draft: () => StoryV2;
  provision: (op: ProvisioningOp, draft: StoryV2) => Promise<{ ok: boolean; message: string }>;
  applyFollowUps: (op: ProvisioningOp) => void;
}

export async function confirmProvisioning(session: AgentSession, step: AgentStep, op: ProvisioningOp, deps: ProvisionDeps): Promise<DriveOutcome> {
  const token = deps.ownership.mint();
  const outcome = await deps.provision(op, deps.draft());
  const owned = deps.ownership.check(token);
  if (!owned.ok) return { session, lapsed: describeMismatch(owned) };
  if (outcome.ok) deps.applyFollowUps(op);
  return { session: resolveProvisioning(session, step.id, outcome, deps.draft()), lapsed: null };
}
