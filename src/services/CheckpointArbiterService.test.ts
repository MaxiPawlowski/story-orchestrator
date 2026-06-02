import CheckpointArbiterService, { type CheckpointEvalRequest } from "@services/CheckpointArbiterService";
import { getContext } from "@services/STAPI";
import { updateStoryMacroSnapshot } from "@utils/story-macros";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
}));

jest.mock("@utils/story-macros", () => ({
  updateStoryMacroSnapshot: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const updateStoryMacroSnapshotMock = updateStoryMacroSnapshot as jest.MockedFunction<typeof updateStoryMacroSnapshot>;

function buildRequest(): CheckpointEvalRequest {
  return {
    cpName: "Checkpoint 1",
    latestText: "player input",
    reason: "manual",
    turn: 10,
    intervalTurns: 3,
    candidates: [{ id: "next" }],
  };
}

describe("CheckpointArbiterService", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    updateStoryMacroSnapshotMock.mockReset();
  });

  it("parses fenced JSON and returns advance outcome", async () => {
    const generateRaw = jest.fn().mockResolvedValue(
      "```json\n{\"decision\":\"transition\",\"selected_transition_id\":\"next\",\"reason\":\"clear\",\"confidence\":0.9,\"tension\":0.6,\"pacing_drift_note\":\"raise pressure\"}\n```"
    );
    getContextMock.mockReturnValue({
      chat: [{ name: "Player", mes: "hello" }],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 5,
      responseLength: 300,
      promptTemplate: "Evaluate checkpoint",
    });

    const payload = await service.evaluate(buildRequest());

    expect(payload.outcome).toBe("advance");
    expect(payload.nextTransitionId).toBe("next");
    expect(payload.parsed?.decision).toBe("transition");
    expect(payload.parsed?.tension).toBe(0.6);
    expect(payload.pacingDriftNote).toBe("raise pressure");
    expect(updateStoryMacroSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ chatExcerpt: expect.stringContaining("Player: hello") })
    );
  });

  it("includes tension and pacing_drift_note in the arbiter JSON schema prompt", async () => {
    const generateRaw = jest.fn().mockResolvedValue(
      '{"decision":"continue","selected_transition_id":null,"reason":"hold","confidence":0.4}'
    );
    getContextMock.mockReturnValue({
      chat: [],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 5,
      responseLength: 300,
      promptTemplate: "Evaluate checkpoint",
    });

    await service.evaluate(buildRequest());

    const prompt = generateRaw.mock.calls[0][0]?.prompt;
    expect(prompt).toContain('"tension": 0.0 to 1.0');
    expect(prompt).toContain('"pacing_drift_note": "OPTIONAL SHORT NOTE"');
  });

  it("extracts tension and pacing drift note with fallback keys", async () => {
    const generateRaw = jest.fn().mockResolvedValue(
      '{"decision":"transition","selected_transition_id":"next","reason":"clear","confidence":0.9,"scene_tension":1.4,"pacingDriftNote":"  raise pressure  "}'
    );
    getContextMock.mockReturnValue({
      chat: [{ name: "Player", mes: "hello" }],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 5,
      responseLength: 300,
      promptTemplate: "Evaluate checkpoint",
    });

    const payload = await service.evaluate(buildRequest());

    expect(payload.outcome).toBe("advance");
    expect(payload.parsed?.tension).toBe(1);
    expect(payload.tension).toBe(1);
    expect(payload.parsed?.pacingDriftNote).toBe("raise pressure");
    expect(payload.pacingDriftNote).toBe("raise pressure");
    expect(payload.parsed?.nextTransitionId).toBe("next");
  });

  it("keeps tension null when missing while preserving existing parsing behavior", async () => {
    const generateRaw = jest.fn().mockResolvedValue(
      '{"decision":"continue","selected_transition_id":null,"reason":"insufficient evidence","confidence":0.25}'
    );
    getContextMock.mockReturnValue({
      chat: [],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 2,
      responseLength: 100,
      promptTemplate: "Evaluate checkpoint",
    });

    const payload = await service.evaluate(buildRequest());

    expect(payload.outcome).toBe("continue");
    expect(payload.parsed?.decision).toBe("continue");
    expect(payload.parsed?.reason).toBe("insufficient evidence");
    expect(payload.parsed?.confidence).toBe(0.25);
    expect(payload.parsed?.tension).toBeNull();
    expect(payload.tension).toBeNull();
    expect(payload.parsed?.pacingDriftNote).toBeUndefined();
    expect(payload.pacingDriftNote).toBeUndefined();
  });

  it("continues generation when first response is truncated JSON", async () => {
    const generateRaw = jest
      .fn()
      .mockResolvedValueOnce("{\"decision\":\"transition\",\"selected_transition_id\":\"next\",")
      .mockResolvedValueOnce("\"reason\":\"continued\",\"confidence\":0.7}");

    getContextMock.mockReturnValue({
      chat: [{ name: "Companion", mes: "status" }],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 3,
      responseLength: 250,
      promptTemplate: "Evaluate checkpoint",
      enableContinuation: true,
      maxContinuationAttempts: 1,
    });

    const payload = await service.evaluate(buildRequest());

    expect(generateRaw).toHaveBeenCalledTimes(2);
    expect(generateRaw.mock.calls[1][0]?.prompt).toContain("Continue the previous JSON response");
    expect(payload.outcome).toBe("advance");
    expect(payload.parsed?.nextTransitionId).toBe("next");
  });

  it("falls back to continue when output is not parseable JSON", async () => {
    const generateRaw = jest.fn().mockResolvedValue("model answer without json");
    getContextMock.mockReturnValue({
      chat: [],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 2,
      responseLength: 100,
      promptTemplate: "Evaluate checkpoint",
    });

    const payload = await service.evaluate(buildRequest());

    expect(payload.outcome).toBe("continue");
    expect(payload.parsed).toBeNull();
    expect(payload.nextTransitionId).toBeNull();
    expect(payload.tension).toBeNull();
    expect(payload.pacingDriftNote).toBeUndefined();
  });

  it("parses numeric tension fallback keys and tolerates missing pacing fields", async () => {
    const generateRaw = jest.fn().mockResolvedValue(
      JSON.stringify({
        decision: "continue",
        selected_transition_id: null,
        reason: "steady",
        score: 0.4,
        scene_tension: 2,
        observed_events: ["door slams"],
      })
    );
    getContextMock.mockReturnValue({
      chat: [],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 2,
      responseLength: 100,
      promptTemplate: "Evaluate checkpoint",
    });

    const payload = await service.evaluate(buildRequest());

    expect(payload.outcome).toBe("continue");
    expect(payload.parsed?.confidence).toBe(0.4);
    expect(payload.parsed?.tension).toBe(1);
    expect(payload.tension).toBe(1);
    expect(payload.parsed?.pacingDriftNote).toBeUndefined();
    expect(payload.pacingDriftNote).toBeUndefined();
    expect(payload.observedEvents).toEqual(["door slams"]);
  });

  it("ignores non-numeric tension aliases and trims camelCase pacing notes", async () => {
    const generateRaw = jest.fn().mockResolvedValue(
      JSON.stringify({
        decision: "continue",
        selected_transition_id: null,
        reason: "steady",
        confidence: 0.4,
        scene_tension: " 1.4 ",
        pacingDriftNote: "  slow down a little  ",
      })
    );
    getContextMock.mockReturnValue({
      chat: [],
      generateRaw,
    } as any);

    const service = new CheckpointArbiterService({
      snapshotLimit: 2,
      responseLength: 100,
      promptTemplate: "Evaluate checkpoint",
    });

    const payload = await service.evaluate(buildRequest());

    expect(payload.parsed?.tension).toBe(1);
    expect(payload.tension).toBe(1);
    expect(payload.parsed?.pacingDriftNote).toBe("slow down a little");
    expect(payload.pacingDriftNote).toBe("slow down a little");
  });
});
