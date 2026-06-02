import { getContext } from "@services/STAPI";
import { ContinuityKeeperService } from "@services/ContinuityKeeperService";
import { storySessionStore } from "@store/storySessionStore";
import * as memoryStores from "@utils/memory-stores";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@utils/memory-stores", () => ({
  addConsequence: jest.fn(),
  addForegoneTransition: jest.fn(),
  addSceneMemory: jest.fn(),
  addSeed: jest.fn(),
  removeConsequence: jest.fn(),
  resolveSeed: jest.fn(),
  updateRoleState: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getStateMock = storySessionStore.getState as jest.MockedFunction<typeof storySessionStore.getState>;

describe("ContinuityKeeperService", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

  beforeEach(() => {
    getContextMock.mockReset();
    getStateMock.mockReset();
    getStateMock.mockReturnValue({ turn: 12 } as any);
    warnSpy.mockClear();
    Object.values(memoryStores).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as jest.Mock).mockReset();
      }
    });
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("parses keeper JSON and applies memory deltas", async () => {
    const generateRaw = jest.fn().mockResolvedValue("```json\n{\"consequences\":{\"add\":[{\"text\":\"Bridge collapsed\",\"weight\":0.9,\"tags\":[\"bridge\"],\"sourceCheckpointId\":\"cp-2\",\"createdAtTurn\":4}],\"remove\":[\"csq-1\"]},\"seeds\":{\"add\":[{\"text\":\"Someone survives downstream\",\"kind\":\"hook\",\"resolved\":false,\"sourceCheckpointId\":\"cp-2\",\"createdAtTurn\":4}],\"resolve\":[\"seed-1\"]},\"roleStates\":{\"update\":[{\"role\":\"guide\",\"summary\":\"Focused on keeping the party moving\"}]},\"sceneMemory\":{\"add\":[{\"text\":\"The bridge gave way behind them\",\"checkpointId\":\"cp-2\",\"turn\":4}]},\"foregoneTransitions\":{\"add\":[{\"transitionId\":\"t-bridge\",\"fromCheckpointId\":\"cp-2\",\"reason\":\"Bridge destroyed\",\"turn\":4}]}}\n```");
    getContextMock.mockReturnValue({ generateRaw } as any);

    const service = new ContinuityKeeperService();
    const result = await service.processEvent({
      type: "advance",
      checkpointId: "cp-2",
      checkpointName: "Crossing",
      transitionId: "t-river",
      observedEvents: ["The bridge collapsed."],
      context: {
        storyTitle: "Story 1",
        storyDescription: "A dangerous crossing.",
        currentCheckpoint: { name: "Crossing", objective: "Reach the far bank" },
        recentCheckpoints: [],
        activeTransitions: [],
        consequences: [],
        openSeeds: [],
        roleStates: {},
        sceneMemory: [],
        foregoneTransitions: [],
        chatExcerpt: "1. Guide: Move!",
      },
    });

    expect(result?.consequences?.remove).toEqual(["csq-1"]);
    expect(generateRaw).toHaveBeenCalledWith(expect.objectContaining({
      instructOverride: true,
      quietToLoud: false,
      responseLength: 512,
      trimNames: false,
      prompt: expect.stringContaining("=== Story ==="),
    }));
    expect(generateRaw.mock.calls[0][0]?.prompt).toContain("Checkpoint ID: cp-2");
    expect(generateRaw.mock.calls[0][0]?.prompt).toContain("The bridge collapsed.");
    expect(memoryStores.addConsequence).toHaveBeenCalledWith(expect.objectContaining({ text: "Bridge collapsed" }));
    expect(memoryStores.removeConsequence).toHaveBeenCalledWith("csq-1");
    expect(memoryStores.addSeed).toHaveBeenCalledWith(expect.objectContaining({ text: "Someone survives downstream" }));
    expect(memoryStores.resolveSeed).toHaveBeenCalledWith("seed-1");
    expect(memoryStores.addSceneMemory).toHaveBeenCalledWith(expect.objectContaining({ checkpointId: "cp-2", turn: 4 }));
    expect(memoryStores.addForegoneTransition).toHaveBeenCalledWith(expect.objectContaining({ transitionId: "t-bridge", turn: 4 }));
    expect(memoryStores.updateRoleState).toHaveBeenCalledWith("guide", "Focused on keeping the party moving", 12);
  });

  it("returns null and warns when generateRaw fails", async () => {
    const err = new Error("network");
    const generateRaw = jest.fn().mockRejectedValue(err);
    getContextMock.mockReturnValue({ generateRaw } as any);

    const service = new ContinuityKeeperService({ responseLength: 128 });
    const result = await service.processEvent({
      type: "activation",
      checkpointId: "cp-1",
      checkpointName: "Arrival",
      context: {
        storyTitle: "Story 1",
        storyDescription: "",
        currentCheckpoint: { name: "Arrival", objective: "Enter town" },
        recentCheckpoints: [],
        activeTransitions: [],
        consequences: [],
        openSeeds: [],
        roleStates: {},
        sceneMemory: [],
        foregoneTransitions: [],
        chatExcerpt: "",
      },
    });

    expect(result).toBeNull();
    expect(generateRaw).toHaveBeenCalledWith(expect.objectContaining({ responseLength: 128 }));
    expect(warnSpy).toHaveBeenCalledWith("[ContinuityKeeper]", "request failed", err);
  });

  it("returns null and warns when delta application throws", async () => {
    const err = new Error("write failed");
    getContextMock.mockReturnValue({
      generateRaw: jest.fn().mockResolvedValue('{"sceneMemory":{"add":[{"text":"beat","checkpointId":"cp-1","turn":3}]}}'),
    } as any);
    (memoryStores.addSceneMemory as jest.Mock).mockImplementation(() => {
      throw err;
    });

    const service = new ContinuityKeeperService();
    const result = await service.processEvent({
      type: "merge",
      checkpointId: "cp-1",
      checkpointName: "Arrival",
      context: {
        storyTitle: "Story 1",
        storyDescription: "",
        currentCheckpoint: { name: "Arrival", objective: "Enter town" },
        recentCheckpoints: [],
        activeTransitions: [],
        consequences: [],
        openSeeds: [],
        roleStates: {},
        sceneMemory: [],
        foregoneTransitions: [],
        chatExcerpt: "",
      },
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("[ContinuityKeeper]", "apply failed", err);
  });

  it("returns null and warns when output has no JSON object", async () => {
    getContextMock.mockReturnValue({
      generateRaw: jest.fn().mockResolvedValue("plain text reply"),
    } as any);

    const service = new ContinuityKeeperService();
    const result = await service.processEvent({
      type: "activation",
      checkpointId: "cp-1",
      checkpointName: "Arrival",
      context: {
        storyTitle: "Story 1",
        storyDescription: "",
        currentCheckpoint: { name: "Arrival", objective: "Enter town" },
        recentCheckpoints: [],
        activeTransitions: [],
        consequences: [],
        openSeeds: [],
        roleStates: {},
        sceneMemory: [],
        foregoneTransitions: [],
        chatExcerpt: "",
      },
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("[ContinuityKeeper]", "parse failed", "no JSON object found");
  });
});
