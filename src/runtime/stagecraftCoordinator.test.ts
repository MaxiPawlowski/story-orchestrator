import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
import { disableWIEntry, enableWIEntry, loadLorebook, upsertWIEntry } from "@services/STAPI";
import { StagecraftCoordinator } from "./coordinators/stagecraftCoordinator";
import { createStagecraft } from "./extras";
import type { ExtractionRuntimeSettings, StagecraftRuntimeState } from "./types";

jest.mock("@services/STAPI", () => ({
  loadLorebook: jest.fn(),
  upsertWIEntry: jest.fn(async () => "updated"),
  enableWIEntry: jest.fn(async () => true),
  disableWIEntry: jest.fn(async () => true),
  getContext: () => ({ extensionSettings: {}, saveSettingsDebounced: () => undefined }),
}));

jest.mock("@extraction/client", () => ({ callExtractionModel: jest.fn(async () => "NONE") }));

const lorebook = (content = "The bridge stands, its ropes new and taut.") => ({
  entries: {
    1: { uid: 1, comment: "The bridge", content, key: ["bridge"], disable: false },
    2: { uid: 2, comment: "The ferryman", content: "Nobody has seen the ferryman.", key: ["ferryman"], disable: true },
  },
});

const story = (lorebooks: string[] = ["Story Lore"]): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "coordinator-fixture",
  title: "Crossing",
  description: "Curator.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  ...(lorebooks.length ? { stagecraft: { lorebooks } } : {}),
});

const engineState = (boundary = 10, lastMessageId = 20): EngineState => ({
  activeCheckpointId: "cp1",
  boundary,
  lastMessageId,
  blackboard: { values: {}, versions: {}, latched: {} },
  visitedAnchors: ["cp1"],
} as unknown as EngineState);

const harness = (options: { story?: NormalizedStoryV2 | null; state?: EngineState; settings?: Partial<StagecraftRuntimeState["settings"]> } = {}) => {
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { curatorEnabled: true, acceptMode: "review", ...options.settings } };
  const journal: string[] = [];
  const coordinator = new StagecraftCoordinator({
    getStory: () => (options.story === undefined ? story() : options.story),
    getState: () => options.state ?? engineState(),
    getStagecraft: () => state,
    setStagecraft: (next) => { state = next; },
    getExtractionSettings: () => ({ profileId: "p" } as ExtractionRuntimeSettings),
    getCanon: () => "The flood took the bridge.",
    getOpenArcs: () => ["Who cut the ropes?"],
    journal: (summary) => journal.push(summary),
    persist: async () => undefined,
    notify: () => undefined,
  });
  return { coordinator, journal, read: () => state };
};

const respond = (text: string) => (callExtractionModel as jest.Mock).mockResolvedValueOnce(text);

describe("StagecraftCoordinator", () => {
  beforeEach(() => {
    (loadLorebook as jest.Mock).mockResolvedValue(lorebook());
    (upsertWIEntry as jest.Mock).mockClear();
    (enableWIEntry as jest.Mock).mockClear();
    (disableWIEntry as jest.Mock).mockClear();
    (callExtractionModel as jest.Mock).mockClear();
  });

  // A pass that never ran and a pass that found nothing must be distinguishable — conflating them
  // made a live gate blame the model for a call that was never made.
  it("never runs without the capability flag or without an authored allowlist, and says which", async () => {
    const off = harness({ settings: { curatorEnabled: false } });
    expect(off.coordinator.curatorEnabled).toBe(false);
    expect(await off.coordinator.runCuratorPass()).toEqual({ ran: false, skipped: "disabled", record: null });

    const unscoped = harness({ story: story([]) });
    expect(unscoped.coordinator.curatorEnabled).toBe(false);
    expect(await unscoped.coordinator.runCuratorPass()).toEqual({ ran: false, skipped: "no-scope", record: null });
    expect(callExtractionModel).not.toHaveBeenCalled();
  });

  it("reports a pass that found nothing as having run, and keeps what the model said", async () => {
    const { coordinator, read } = harness();
    respond("NONE");
    expect(await coordinator.runCuratorPass("cadence")).toEqual({ ran: true, record: null });
    expect(read().lastPass).toMatchObject({ reason: "cadence", rawResponse: "NONE", proposed: 0 });
    expect(read().lastPass?.prompt).toContain("The bridge");
  });

  it("coalesces: one pass per boundary gap, and never while one is in flight", async () => {
    const { coordinator } = harness();
    expect(coordinator.dueForRun()).toBe(true);
    respond("NONE");
    await coordinator.runCuratorPass();
    expect(coordinator.dueForRun()).toBe(false);
  });

  it("records a proposal for review without writing anything", async () => {
    const { coordinator, read, journal } = harness();
    respond("[patch] The bridge || The bridge stands || new and taut || The bridge is gone.\n[why] The flood took it.");
    const { record } = await coordinator.runCuratorPass("scene-break");
    expect(record?.ops).toHaveLength(1);
    expect(record?.ops[0].status).toBe("pending");
    expect(record?.summary).toBe("The flood took it.");
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(journal[0]).toContain("proposed 1 change(s)");
    expect(read().proposals).toHaveLength(1);
  });

  it("applies an accepted change at the boundary, and only then", async () => {
    const { coordinator, read, journal } = harness();
    respond("[patch] The bridge || its ropes new and taut || its ropes cut");
    const { record } = await coordinator.runCuratorPass();
    expect(await coordinator.applyAccepted()).toBe(0);
    await coordinator.setOpDecision(record!.id, 0, "accepted");
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge", "The bridge stands, its ropes cut.", ["bridge"]);
    expect(read().proposals[0].ops[0].status).toBe("applied");
    expect(journal.some((entry) => entry.includes("applied 1 change(s)"))).toBe(true);
  });

  it("auto mode accepts on the spot so the next boundary writes it", async () => {
    const { coordinator } = harness({ settings: { acceptMode: "auto" } });
    respond("[disable] The bridge");
    const { record } = await coordinator.runCuratorPass();
    expect(record?.ops[0].status).toBe("accepted");
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(disableWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge");
  });

  it("fails a switch whose entry or book is gone by the time the boundary writes it", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[disable] The bridge");
    await coordinator.runCuratorPass();
    (disableWIEntry as jest.Mock).mockResolvedValueOnce(false);
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: "\"The bridge\" is not in \"Story Lore\"" });
  });

  it("applies the author's edited text, not the model's", async () => {
    const { coordinator } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(record!.id, 0, "accepted", { kind: "rewrite", lorebook: "Story Lore", comment: "The bridge", text: "The bridge is rubble." });
    await coordinator.applyAccepted();
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge", "The bridge is rubble.", ["bridge"]);
  });

  it("a rejected change is never written", async () => {
    const { coordinator } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.decideProposal(record!.id, "rejected");
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(upsertWIEntry).not.toHaveBeenCalled();
  });

  it("keeps an entry the author had switched off, off after a rewrite", async () => {
    const { coordinator } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The ferryman || The ferryman is back.");
    await coordinator.runCuratorPass();
    await coordinator.applyAccepted();
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The ferryman", "The ferryman is back.", ["ferryman"]);
    expect(disableWIEntry).toHaveBeenCalledWith("Story Lore", "The ferryman");
  });

  it("refuses a write outside the allowlist even if the record says otherwise", async () => {
    const { coordinator, read } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(record!.id, 0, "accepted", { kind: "rewrite", lorebook: "The User's Own Book", comment: "The bridge", text: "hijacked" });
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed" });
    expect(read().proposals[0].ops[0].message).toContain("not on this story's stagecraft allowlist");
  });

  it("reverts an applied change when the story rolls back past it", async () => {
    const { coordinator, read, journal } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The bridge || The bridge is gone.");
    await coordinator.runCuratorPass();
    await coordinator.applyAccepted();
    (upsertWIEntry as jest.Mock).mockClear();
    expect(await coordinator.revertAppliedSince(15)).toBe(1);
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge", "The bridge stands, its ropes new and taut.");
    expect(read().proposals).toEqual([]);
    expect(journal.some((entry) => entry.includes("rolled back"))).toBe(true);
  });

  it("records a model failure without breaking play", async () => {
    const { coordinator, read } = harness();
    (callExtractionModel as jest.Mock).mockRejectedValueOnce(new Error("profile is gone"));
    expect(await coordinator.runCuratorPass()).toEqual({ ran: true, record: null });
    expect(read().lastError).toBe("profile is gone");
  });
});
