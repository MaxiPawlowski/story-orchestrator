import { stableStringify } from "@runtime/hash";
import { describeProvisioningOp, isProvisioningKind, type ProvisioningOp } from "@wizard/index";
import type { AgentOp, AgentSession, AgentStep } from "./types";

const fold = (text: string) => text.trim().toLowerCase();

const opKey = (op: AgentOp): string => (isProvisioningKind(op.kind)
  ? `${op.kind}:${fold(describeProvisioningOp(op as ProvisioningOp).target)}`
  : `${op.kind}:${stableStringify(op)}`);

const stepsWith = (session: AgentSession, status: AgentStep["status"]): Array<AgentStep & { op: AgentOp }> =>
  session.steps.filter((step): step is AgentStep & { op: AgentOp } => step.status === status && step.op !== undefined);

export const rejectedSteps = (session: AgentSession): Array<AgentStep & { op: AgentOp }> => stepsWith(session, "rejected");

export const createdSteps = (session: AgentSession): Array<AgentStep & { op: AgentOp }> =>
  stepsWith(session, "applied").filter((step) => isProvisioningKind(step.op.kind));

export const createdRefusal = (session: AgentSession, op: AgentOp): string | null => {
  if (!isProvisioningKind(op.kind)) return null;
  const key = opKey(op);
  const step = createdSteps(session).find((entry) => opKey(entry.op) === key);
  if (!step) return null;
  return `already created at step #${step.id} ("${describeProvisioningOp(op as ProvisioningOp).target}"); it exists now, so it is never created again. Move on to what is still missing.`;
};

export const callKey = (call: AgentStep["call"]): string => `${call.tool}:${stableStringify(call.args)}`;

export const rejectedRefusal = (session: AgentSession, op: AgentOp): string | null => {
  const key = opKey(op);
  const step = rejectedSteps(session).find((entry) => opKey(entry.op) === key);
  if (!step) return null;
  return `the author rejected this at step #${step.id} ("${step.reason ?? "no reason given"}"), so it is not proposed again. Drop it from the plan and move on.`;
};
