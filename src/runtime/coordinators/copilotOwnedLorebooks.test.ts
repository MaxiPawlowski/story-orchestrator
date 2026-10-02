import { plantedModel } from "../../../test/support/modelCall";
import type { StoryV2 } from "@engine/index";
import type { ProvisioningOp, WizardSessionState } from "@wizard/index";
import { CopilotCoordinator } from "./copilotCoordinator";
import { testOwnership } from "../../../test/findings/testOwnership";

const host = {
  clearStoryExtensionPrompt: jest.fn(),
  createCharacterCard: jest.fn(),
  createGroup: jest.fn(),
  createLorebook: jest.fn(),
  getAllCharacterNames: jest.fn(() => []),
  listAllLorebooks: jest.fn(() => ["Tavern Lore", "Harbour"]),
  listGlobalLorebooks: jest.fn(() => []),
  listGroupNames: jest.fn(() => []),
  setStoryExtensionPrompt: jest.fn(),
  upsertWIEntry: jest.fn(async () => "created"),
};
const { createCharacterCard, createLorebook, upsertWIEntry } = host;

const draft = { format: 2, id: "owned", version: 1, title: "Owned", description: "Fixture", qualities: [], checkpoints: [], transitions: [], roster: [] } as unknown as StoryV2;

const harness = (stored: WizardSessionState | null) => {
  let session = stored;
  const coordinator = new CopilotCoordinator({ hosts: { prompt: host, chat: { lastMessageText: () => "" }, provisioning: host }, ownership: testOwnership(),
    getStory: () => null,
    getState: () => null,
    getSettings: () => ({}) as never,
    model: plantedModel,
    getCanon: () => "",
    notify: () => {},
    wizardSession: () => session,
    saveWizardSession: (next: WizardSessionState) => { session = next; },
  } as never);
  return { coordinator, session: () => session };
};

const base = (patch: Partial<WizardSessionState>) => ({ key: "owned", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "", ...patch }) as WizardSessionState;
const write = (lorebook: string): ProvisioningOp => ({ kind: "upsertLorebookEntry", lorebook, comment: "Entry", content: "Text", keys: [] });

beforeEach(() => jest.clearAllMocks());

// V18 (R8): `applied` holds names only, so a CARD the wizard created under the name of one of the
// user's books read as the wizard owning that book, and the wizard would write into it.
describe("V18: lorebook ownership is recorded by kind", () => {
  it("a card named after the user's book grants no write into the book", async () => {
    const h = harness(base({ applied: ["Tavern Lore"], createdLorebooks: [] }));
    expect(h.coordinator.getProvisioningEnvironment(draft).ownedLorebooks).toEqual([]);
    expect((await h.coordinator.applyProvisioning(write("Tavern Lore"), draft)).ok).toBe(false);
    expect(upsertWIEntry).not.toHaveBeenCalled();
  });

  it("a book the wizard recorded creating is writable", async () => {
    const h = harness(base({ applied: ["Harbour"], createdLorebooks: ["Harbour"] }));
    expect((await h.coordinator.applyProvisioning(write("Harbour"), draft)).ok).toBe(true);
    expect(upsertWIEntry).toHaveBeenCalledTimes(1);
  });

  it("a session without a recorded book list owns no book, whatever its ledger names", () => {
    const h = harness(base({ applied: ["Harbour"] }));
    expect(h.coordinator.getProvisioningEnvironment(draft).ownedLorebooks).toEqual([]);
  });

  it("control: a session with X in its book list owns X", () => {
    const h = harness(base({ applied: ["Harbour"], createdLorebooks: ["Harbour"] }));
    expect(h.coordinator.getProvisioningEnvironment(draft).ownedLorebooks).toEqual(["Harbour"]);
  });

  it("creating a card records no book, and creating a book records it as one", async () => {
    (createCharacterCard as jest.Mock).mockResolvedValue({ name: "Tavern Lore" });
    (createLorebook as jest.Mock).mockResolvedValue({ ok: true, name: "Harbour Two", created: true });
    const h = harness(base({ createdLorebooks: [] }));
    await h.coordinator.applyProvisioning({ kind: "createCharacterCard", name: "Tavern Lore", description: "A barkeep." } as ProvisioningOp, draft);
    expect(h.session()).toMatchObject({ applied: ["Tavern Lore"], createdLorebooks: [] });
    await h.coordinator.applyProvisioning({ kind: "createStoryLorebook", name: "Harbour Two" }, draft);
    expect(h.session()).toMatchObject({ applied: ["Tavern Lore", "Harbour Two"], createdLorebooks: ["Harbour Two"] });
  });

  it("a book created by a session records only that book, never the rest of its ledger", async () => {
    (createLorebook as jest.Mock).mockResolvedValue({ ok: true, name: "Harbour Two", created: true });
    const h = harness(base({ applied: ["Harbour"], createdLorebooks: [] }));
    await h.coordinator.applyProvisioning({ kind: "createStoryLorebook", name: "Harbour Two" }, draft);
    expect(h.session()?.createdLorebooks).toEqual(["Harbour Two"]);
  });
});
