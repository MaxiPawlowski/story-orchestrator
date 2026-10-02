import { stableStringify } from "@runtime/hash";
import { describeProvisioningOp, isProvisioningKind, type ProvisioningOp } from "@wizard/index";
import type { AgentOp, AgentSession, AgentStep } from "./types";

const fold = (text: string) => text.trim().toLowerCase();

const opKey = (op: AgentOp): string => (isProvisioningKind(op.kind)
  ? `${op.kind}:${fold(describeProvisioningOp(op as ProvisioningOp).target)}`
  : `${op.kind}:${stableStringify(op)}`);

export const rejectedSteps = (session: AgentSession): Array<AgentStep & { op: AgentOp }> =>
  session.steps.filter((step): step is AgentStep & { op: AgentOp } => step.status === "rejected" && step.op !== undefined);

export const rejectedRefusal = (session: AgentSession, op: AgentOp): string | null => {
  const key = opKey(op);
  const step = rejectedSteps(session).find((entry) => opKey(entry.op) === key);
  if (!step) return null;
  return `the author rejected this at step #${step.id} ("${step.reason ?? "no reason given"}"), so it is not proposed again. Drop it from the plan and move on.`;
};
