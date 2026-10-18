import type { Story } from "@engine/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "@runtime/runToken";
import type { ProvisioningOp, ProvisioningResult } from "@wizard/index";
import { lapsedProvisioningCopy, provisionOwned } from "./ownedProvisioning";

const op: ProvisioningOp = { kind: "createCharacterCard", name: "SO-Arin", description: "A scout." };
const draft = { id: "d1", title: "D" } as unknown as Story;

const rig = (result: ProvisioningResult, duringProvision: (context: RunContext) => void = () => {}) => {
  const context: RunContext = { chatId: null, storyId: null, storyHash: null, sessionEpoch: 0, windowRevision: 0 };
  const ownership: RunOwnership = { mint: () => mintToken(context), check: (token) => tokenMatches(context, token) };
  const calls = { recorded: [] as string[], followUps: [] as ProvisioningOp[] };
  const deps = {
    ownership,
    draft: () => draft,
    provision: async () => { duringProvision(context); return result; },
    recordCreated: (created: string) => { calls.recorded.push(created); },
    applyFollowUps: (applied: ProvisioningOp) => { calls.followUps.push(applied); },
  };
  return { deps, calls };
};

describe("Studio provisioning re-checks draft ownership after the asset is created", () => {
  it("applies the follow-up ops to the draft that is still open", async () => {
    const { deps, calls } = rig({ ok: true, message: "Created SO-Arin.", created: "character:SO-Arin" });
    expect(await provisionOwned(op, deps)).toEqual({ outcome: { ok: true, message: "Created SO-Arin.", created: "character:SO-Arin" }, lapsed: null });
    expect(calls).toEqual({ recorded: ["character:SO-Arin"], followUps: [op] });
  });

  it("a draft swapped, undone or reset during the await gets no follow-up ops, while the created asset stays in its own ledger", async () => {
    const { deps, calls } = rig({ ok: true, message: "Created SO-Arin.", created: "character:SO-Arin" }, (context) => { context.sessionEpoch += 1; });
    const result = await provisionOwned(op, deps);
    expect(result.lapsed).toMatch(/^epoch/);
    expect(calls).toEqual({ recorded: ["character:SO-Arin"], followUps: [] });
    expect(lapsedProvisioningCopy(result.outcome.message, result.lapsed ?? "")).toMatch(/^Created SO-Arin\. The draft changed meanwhile \(epoch.*\), so the story was not updated to require it\.$/);
  });

  it("a refused op records and applies nothing", async () => {
    const { deps, calls } = rig({ ok: false, message: "Refused." });
    expect((await provisionOwned(op, deps)).lapsed).toBeNull();
    expect(calls).toEqual({ recorded: [], followUps: [] });
  });
});
