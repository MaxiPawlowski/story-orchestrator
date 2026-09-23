import type { StoryV2 } from "@engine/index";
import { activateGlobalLorebook, listAllLorebooks, upsertWIEntry } from "@services/STAPI";
import type { ProvisioningOp } from "@wizard/index";
import { control } from "../../../test/findings/ledger";
import { CopilotCoordinator } from "./copilotCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  activateGlobalLorebook: jest.fn(async () => true),
  clearStoryExtensionPrompt: jest.fn(),
  createCharacterCard: jest.fn(),
  createGroup: jest.fn(),
  createLorebook: jest.fn(),
  getAllCharacterNames: jest.fn(() => []),
  listAllLorebooks: jest.fn(() => ["Story Book"]),
  listGlobalLorebooks: jest.fn(() => ["Story Book"]),
  listGroupNames: jest.fn(() => []),
  setStoryExtensionPrompt: jest.fn(),
  upsertWIEntry: jest.fn(async () => "created"),
}));

const draft = {
  format: 2,
  id: "ownership-story",
  version: 1,
  title: "Ownership story",
  description: "Fixture",
  requirements: { lorebooks: ["Story Book"] },
  qualities: [],
  checkpoints: [],
  transitions: [],
  roster: [],
} as unknown as StoryV2;

function harness() {
  let current: RunContext = {
    chatId: "chat-a",
    storyId: "ownership-story",
    playedVersion: 1,
    sessionEpoch: 1,
    windowRevision: 0,
    lowestMutatedMessageId: null,
  };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const coordinator = new CopilotCoordinator({
    getStory: () => null,
    getState: () => null,
    getSettings: () => ({}) as never,
    getProfileId: () => null,
    getCanon: () => "",
    notify: () => {},
    ownership,
    // R8: the fixture's story owns its book through the wizard session ledger, which is the only
    // thing that grants write authority — `requirements.lorebooks` is a dependency, not a licence.
    wizardSession: () => ({ key: "ownership-story", stage: "provisioning", history: [], questions: [], applied: ["Story Book"], seed: "", updatedAt: "" }),
    saveWizardSession: () => {},
  });
  return {
    coordinator,
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
  };
}

const op: ProvisioningOp = {
  kind: "upsertLorebookEntry",
  lorebook: "Story Book",
  comment: "Vault",
  content: "The vault is sealed.",
  keys: ["vault"],
};

beforeEach(() => {
  jest.clearAllMocks();
  (listAllLorebooks as jest.Mock).mockReturnValue(["Story Book"]);
  (activateGlobalLorebook as jest.Mock).mockResolvedValue(true);
  (upsertWIEntry as jest.Mock).mockResolvedValue("created");
});

control("provisioning writes the entry when its world stays current", async () => {
  const h = harness();
  const result = await h.coordinator.applyProvisioning(op, draft);

  expect(result.ok).toBe(true);
  expect(activateGlobalLorebook).toHaveBeenCalledTimes(1);
  expect(upsertWIEntry).toHaveBeenCalledTimes(1);
});

control("provisioning stops before a second host write when its world changes", async () => {
  const h = harness();
  (activateGlobalLorebook as jest.Mock).mockImplementation(async () => {
    h.switchChat();
    return true;
  });

  const result = await h.coordinator.applyProvisioning(op, draft);

  expect(result.ok).toBe(false);
  expect(activateGlobalLorebook).toHaveBeenCalledTimes(1);
  expect(upsertWIEntry).not.toHaveBeenCalled();
});

control("provisioning does not start a host write after validation changes the world", async () => {
  const h = harness();
  (listAllLorebooks as jest.Mock).mockImplementation(() => {
    h.switchChat();
    return ["Story Book"];
  });

  const result = await h.coordinator.applyProvisioning(op, draft);

  expect(result.ok).toBe(false);
  expect(activateGlobalLorebook).not.toHaveBeenCalled();
  expect(upsertWIEntry).not.toHaveBeenCalled();
});
