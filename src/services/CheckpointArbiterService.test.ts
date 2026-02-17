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
      "```json\n{\"decision\":\"transition\",\"selected_transition_id\":\"next\",\"reason\":\"clear\",\"confidence\":0.9}\n```"
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
    expect(updateStoryMacroSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ chatExcerpt: expect.stringContaining("Player: hello") })
    );
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
  });
});
