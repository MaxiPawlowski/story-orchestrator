import { plantedModel } from "../../../test/support/modelCall";
import type { StoryV2 } from "@engine/index";
import type { WizardSessionState } from "@wizard/index";
import { CopilotCoordinator } from "./copilotCoordinator";
import { testOwnership } from "../../../test/findings/testOwnership";

const host = {
  createGroup: jest.fn(async (name: string, members: string[]) => ({ name, members })),
  getAllCharacterNames: () => ["Master Halden", "Envoy Marrow"],
  listAllLorebooks: () => [],
  listGlobalLorebooks: () => [],
  listGroupNames: () => [],
  listPersonas: () => [],
};

const draft = {
  format: 2, id: "map", title: "Map", description: "", qualities: [], checkpoints: [], transitions: [],
  roster: [{ id: "halden", name: "Master Halden" }, { id: "marrow", name: "Envoy Marrow" }],
} as unknown as StoryV2;

describe("T6-3 LOW: the wizard ledger records the group it created", () => {
  it("adds the created group's name to the session's applied ledger", async () => {
    let session: WizardSessionState | null = null;
    const coordinator = new CopilotCoordinator({
      hosts: { prompt: host, chat: { lastMessageText: () => "" }, provisioning: host }, ownership: testOwnership(),
      getStory: () => null, getState: () => null, getSettings: () => ({}), model: plantedModel, getCanon: () => "", notify: () => {},
      wizardSession: () => session, saveWizardSession: (next: WizardSessionState) => { session = next; },
    } as never);
    const result = await coordinator.applyProvisioning({ kind: "createGroup", name: "The Redrawn Kingdom", members: ["Master Halden", "Envoy Marrow"] }, draft);
    expect(result.ok).toBe(true);
    expect((session as WizardSessionState | null)?.applied).toEqual(["The Redrawn Kingdom"]);
    expect((session as WizardSessionState | null)?.createdLorebooks).toEqual([]);
  });
});
