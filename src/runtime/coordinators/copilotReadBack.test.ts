import { plantedModel } from "../../../test/support/modelCall";
import type { StoryV2 } from "@engine/index";
import type { ProvisioningOp, WizardSessionState } from "@wizard/index";
import type { CardReadBackState } from "@utils/cardReadBack";
import { CopilotCoordinator } from "./copilotCoordinator";
import { testOwnership } from "../../../test/findings/testOwnership";

type CardOp = Extract<ProvisioningOp, { kind: "createCharacterCard" }>;

const draft = { format: 2, id: "readback", title: "Read back", description: "Fixture", qualities: [], checkpoints: [], transitions: [], roster: [] } as unknown as StoryV2;
const CARD: CardOp = { kind: "createCharacterCard", name: "Ilsa Crane", description: "Buys anything that fell off a ship." };

const harness = (state: CardReadBackState, installNames: string[] = []) => {
  let session: WizardSessionState | null = null;
  const host = {
    clearStoryExtensionPrompt: jest.fn(), setStoryExtensionPrompt: jest.fn(), createGroup: jest.fn(), createLorebook: jest.fn(),
    createCharacterCard: jest.fn(async () => ({ ok: true, avatar: "Ilsa Crane.png", name: state === "mismatch" ? "Ilsa Crane_" : "Ilsa Crane", readBack: state, lossy: state === "mismatch" ? ["name"] : [] })),
    readBackCharacterCard: jest.fn(async () => ({ state: "stored" as const, lossy: [], name: "Ilsa Crane" })),
    getAllCharacterNames: jest.fn(() => installNames), listAllLorebooks: jest.fn(() => []), listGlobalLorebooks: jest.fn(() => []), listGroupNames: jest.fn(() => []),
    upsertWIEntry: jest.fn(),
  };
  const coordinator = new CopilotCoordinator({
    hosts: { prompt: host, chat: { lastMessageText: () => "" }, provisioning: host }, ownership: testOwnership(),
    getStory: () => null, getState: () => null, getSettings: () => ({}) as never, model: plantedModel, getCanon: () => "", notify: () => {},
    wizardSession: () => session, saveWizardSession: (next: WizardSessionState) => { session = next; },
  } as never);
  return { coordinator, host, session: () => session };
};

describe("v2.8 09 harvest A5: an unconfirmed or lossy card read-back means the card may exist", () => {
  it.each(["stored", "unconfirmed", "mismatch"] as const)("%s: the step result carries the state and the ledger keeps the returned avatar", async (state) => {
    const h = harness(state);
    const result = await h.coordinator.applyProvisioning(CARD, draft);
    expect(result).toMatchObject({ ok: true, readBack: { state, avatar: "Ilsa Crane.png" } });
    expect(h.session()?.createdCards).toEqual([expect.objectContaining({ avatar: "Ilsa Crane.png", requested: "Ilsa Crane", readBack: state })]);
    if (state === "unconfirmed") expect(result.message).toContain("may exist");
    if (state === "mismatch") expect(result.message).toContain("name");
  });

  it.each(["unconfirmed", "mismatch"] as const)("%s: a second create of the card is refused by the ledger even when the host list missed it", async (state) => {
    const h = harness(state, []);
    await h.coordinator.applyProvisioning(CARD, draft);
    expect(h.coordinator.getProvisioningEnvironment(draft).characterNames).toContain("Ilsa Crane");
    const again = await h.coordinator.applyProvisioning(CARD, draft);
    expect(again.ok).toBe(false);
    expect(h.host.createCharacterCard).toHaveBeenCalledTimes(1);
  });

  it("a later check upgrades the ledger entry to stored", async () => {
    const h = harness("unconfirmed");
    await h.coordinator.applyProvisioning(CARD, draft);
    expect(await h.coordinator.recheckCreatedCard(CARD, "Ilsa Crane.png", draft)).toEqual({ state: "stored", lossy: [], avatar: "Ilsa Crane.png" });
    expect(h.session()?.createdCards).toEqual([expect.objectContaining({ avatar: "Ilsa Crane.png", readBack: "stored" })]);
  });

  it("a failed create writes no ledger row and says why", async () => {
    const h = harness("stored");
    h.host.createCharacterCard.mockResolvedValueOnce({ ok: false, reason: "creating \"Ilsa Crane\" failed: 500" } as never);
    const result = await h.coordinator.applyProvisioning(CARD, draft);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("500") });
    expect(h.session()).toBeNull();
  });
});
