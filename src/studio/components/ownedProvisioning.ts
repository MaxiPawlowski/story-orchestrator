import type { Story } from "@engine/index";
import { describeMismatch, type RunOwnership } from "@runtime/runToken";
import type { ProvisioningOp, ProvisioningResult } from "@wizard/index";

export interface OwnedProvisioningDeps {
  ownership: RunOwnership;
  draft: () => Story;
  provision: (op: ProvisioningOp, draft: Story) => Promise<ProvisioningResult>;
  recordCreated: (created: string) => void;
  applyFollowUps: (op: ProvisioningOp) => void;
}

export interface OwnedProvisioning {
  outcome: ProvisioningResult;
  lapsed: string | null;
}

export const lapsedProvisioningCopy = (message: string, lapsed: string): string =>
  `${message} The draft changed meanwhile (${lapsed}), so the story was not updated to require it.`;

export async function provisionOwned(op: ProvisioningOp, deps: OwnedProvisioningDeps): Promise<OwnedProvisioning> {
  const token = deps.ownership.mint();
  const outcome = await deps.provision(op, deps.draft());
  if (outcome.ok && outcome.created) deps.recordCreated(outcome.created);
  const owned = deps.ownership.check(token);
  if (!owned.ok) return { outcome, lapsed: describeMismatch(owned) };
  if (outcome.ok) deps.applyFollowUps(op);
  return { outcome, lapsed: null };
}
