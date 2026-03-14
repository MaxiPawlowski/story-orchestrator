import { CheckpointEffectsApplier } from "@services/runtime/CheckpointEffectsApplier";
import { resolveCheckpointActivationPolicy } from "@services/runtime/checkpointActivationPolicy";
import { createBasicStory } from "@services/__mocks__/testData";
import { disableWIEntry, enableWIEntry, executeSlashCommands } from "@services/STAPI";

jest.mock("@services/STAPI", () => ({
  enableWIEntry: jest.fn(),
  disableWIEntry: jest.fn(),
  executeSlashCommands: jest.fn(),
}));

const enableWIEntryMock = enableWIEntry as jest.MockedFunction<typeof enableWIEntry>;
const disableWIEntryMock = disableWIEntry as jest.MockedFunction<typeof disableWIEntry>;
const executeSlashCommandsMock = executeSlashCommands as jest.MockedFunction<typeof executeSlashCommands>;

describe("CheckpointEffectsApplier", () => {
  beforeEach(() => {
    enableWIEntryMock.mockReset();
    disableWIEntryMock.mockReset();
    executeSlashCommandsMock.mockReset();
    executeSlashCommandsMock.mockResolvedValue(true);
  });

  it("defers blocked effects and flushes them once when requirements become ready", async () => {
    let requirementsReady = false;
    const presetService = { applyBasePreset: jest.fn() };
    const story = createBasicStory({ global_lorebook: "Story World" }) as any;
    const checkpoint = {
      id: "cp-1",
      name: "CP1",
      objective: "obj-1",
      automations: ["/one"],
      world_info: { activate: ["entry-a"] },
    } as any;
    const policy = resolveCheckpointActivationPolicy({ reason: "manual", source: "runtime", requirementsState: "blocked" });

    const applier = new CheckpointEffectsApplier({
      story,
      presetService,
      isRequirementsReady: () => requirementsReady,
      getActivationContextKey: () => "chat-1::group",
    });

    await applier.applyActivationEffects(checkpoint, policy);
    expect(presetService.applyBasePreset).not.toHaveBeenCalled();
    expect(executeSlashCommandsMock).not.toHaveBeenCalled();

    requirementsReady = true;
    await applier.flush(checkpoint);
    await applier.flush(checkpoint);

    expect(presetService.applyBasePreset).toHaveBeenCalledTimes(1);
    expect(enableWIEntryMock).toHaveBeenCalledWith("Story World", ["entry-a"]);
    expect(executeSlashCommandsMock).toHaveBeenCalledTimes(1);
    expect(executeSlashCommandsMock).toHaveBeenCalledWith(["/one"], { silent: true, delayMs: 150 });
    expect(disableWIEntryMock).not.toHaveBeenCalled();
  });

  it("applies world info and automations immediately when requirements are already ready", async () => {
    const presetService = { applyBasePreset: jest.fn() };
    const story = createBasicStory({ global_lorebook: "Story World" }) as any;
    const checkpoint = {
      id: "cp-1",
      name: "CP1",
      objective: "obj-1",
      automations: ["/one"],
      world_info: { activate: ["entry-a"], deactivate: ["entry-b"] },
    } as any;
    const policy = resolveCheckpointActivationPolicy({ reason: "manual", source: "runtime", requirementsState: "ready" });

    const applier = new CheckpointEffectsApplier({
      story,
      presetService,
      isRequirementsReady: () => true,
      getActivationContextKey: () => "chat-1::group",
    });

    await applier.applyActivationEffects(checkpoint, policy);

    expect(presetService.applyBasePreset).not.toHaveBeenCalled();
    expect(enableWIEntryMock).toHaveBeenCalledWith("Story World", ["entry-a"]);
    expect(disableWIEntryMock).toHaveBeenCalledWith("Story World", ["entry-b"]);
    expect(executeSlashCommandsMock).toHaveBeenCalledWith(["/one"], { silent: true, delayMs: 150 });
  });
});
