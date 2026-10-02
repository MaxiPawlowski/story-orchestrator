import { plantedModel } from "../../../test/support/modelCall";
import type { StoryV2 } from "@engine/index";
import type { ProvisioningOp } from "@wizard/index";
import { control } from "../../../test/findings/ledger";
import { CopilotCoordinator } from "./copilotCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";

const host = {
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
};
const { listAllLorebooks, upsertWIEntry } = host;

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
  const coordinator = new CopilotCoordinator({ hosts: { prompt: host, chat: { lastMessageText: () => "" }, provisioning: host } as never,
    getStory: () => null,
    getState: () => null,
    getSettings: () => ({}) as never,
    model: plantedModel,
    getCanon: () => "",
    notify: () => {},
    ownership,
    // R8: the fixture's story owns its book through the wizard session ledger, which is the only
    // thing that grants write authority — `requirements.lorebooks` is a dependency, not a licence.
    wizardSession: () => ({ key: "ownership-story", stage: "provisioning", history: [], questions: [], applied: ["Story Book"], createdLorebooks: ["Story Book"], seed: "", updatedAt: "" }),
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
  (upsertWIEntry as jest.Mock).mockResolvedValue("created");
});

control("provisioning writes the entry when its world stays current", async () => {
  const h = harness();
  const result = await h.coordinator.applyProvisioning(op, draft);

  expect(result.ok).toBe(true);
  expect(upsertWIEntry).toHaveBeenCalledTimes(1);
});

control("provisioning does not start a host write after validation changes the world", async () => {
  const h = harness();
  (listAllLorebooks as jest.Mock).mockImplementation(() => {
    h.switchChat();
    return ["Story Book"];
  });

  const result = await h.coordinator.applyProvisioning(op, draft);

  expect(result.ok).toBe(false);
  expect(upsertWIEntry).not.toHaveBeenCalled();
});
