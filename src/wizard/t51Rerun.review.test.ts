import type { StoryV2 } from "@engine/index";
import { plantedModel } from "../../test/support/modelCall";
import { testOwnership } from "../../test/findings/testOwnership";
import { CopilotCoordinator } from "../runtime/coordinators/copilotCoordinator";
import { emptyEnvironment, planProvisioning, validateProvisioningOp } from "./provisioning";
import type { ProvisioningEnvironment, ProvisioningOp } from "./types";

const install = (patch: Partial<ProvisioningEnvironment> = {}): ProvisioningEnvironment => ({
  ...emptyEnvironment(),
  characterNames: ["Mira", "Master Orin", "Lord Vael"],
  castNames: ["Master Orin", "Lord Vael"],
  ...patch,
});

const group = (members: string[]): ProvisioningOp => ({ kind: "createGroup", name: "The Redrawn Kingdom", members });

describe("T5-1-3 HIGH: a story's group holds only its own cast", () => {
  it("refuses an existing card from another story that is in neither the roster nor the requirements", () => {
    const result = validateProvisioningOp(group(["Mira", "Master Orin", "Lord Vael"]), install());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('"Mira"');
    expect(result.message).toContain("Not in this story's cast");
  });

  it("names the cast member a near miss most likely meant", () => {
    const result = validateProvisioningOp(group(["Master Orin", "Vael"]), install());
    expect(result.message).toContain('did you mean "Lord Vael"');
  });

  it("accepts a group of the story's own cast", () => {
    expect(validateProvisioningOp(group(["Master Orin", "Lord Vael"]), install())).toEqual({ ok: true, message: "" });
  });

  it("accepts a member the same plan just created, folded forward", () => {
    const ops: ProvisioningOp[] = [
      { kind: "createCharacterCard", name: "Lady Morrow", description: "The third house." },
      group(["Master Orin", "Lady Morrow"]),
    ];
    expect(planProvisioning(ops, install()).items.map((item) => item.validation.ok)).toEqual([true, true]);
  });

  it("says the story has no cast yet when there is none to hold", () => {
    const result = validateProvisioningOp(group(["Mira"]), install({ castNames: [] }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("no cast yet");
  });
});

describe("T5-1-3 HIGH: the install read names this draft's cast by card name", () => {
  const host = {
    getAllCharacterNames: () => ["Mira", "Master Orin", "Lord Vael", "Lady Morrow"],
    listAllLorebooks: () => [],
    listGlobalLorebooks: () => [],
    listGroupNames: () => [],
    listPersonas: () => ["Max Nightriver"],
  };
  const coordinator = new CopilotCoordinator({
    hosts: { prompt: host, chat: { lastMessageText: () => "" }, provisioning: host },
    ownership: testOwnership(), getStory: () => null, getState: () => null, getSettings: () => ({}), model: plantedModel, getCanon: () => "", notify: () => {},
  } as never);
  const draft = {
    format: 2, title: "The Redrawn Kingdom", description: "", qualities: [], checkpoints: [], transitions: [],
    roster: [{ id: "orin", name: "Master Orin" }, { id: "lord_vael", name: "Lord Vael" }],
    requirements: { members: ["orin", "Lady Morrow"] },
  } as unknown as StoryV2;

  it("resolves roster ids and requirement members to card names, and reads the install's personas", () => {
    const environment = coordinator.getProvisioningEnvironment(draft);
    expect(environment.castNames).toEqual(["Master Orin", "Lord Vael", "Lady Morrow"]);
    expect(environment.personaNames).toEqual(["Max Nightriver"]);
    expect(validateProvisioningOp(group(["Mira", "Master Orin"]), environment).ok).toBe(false);
    expect(validateProvisioningOp(group(["Master Orin", "Lord Vael", "Lady Morrow"]), environment).ok).toBe(true);
  });
});
