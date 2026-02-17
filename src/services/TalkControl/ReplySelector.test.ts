import { ReplySelector } from "@services/TalkControl/ReplySelector";
import { PLAYER_SPEAKER_ID } from "@constants/main";

function buildReply(overrides: Partial<any> = {}) {
  return {
    enabled: true,
    probability: 100,
    trigger: "afterSpeak",
    normalizedId: "companion",
    normalizedSpeakerId: PLAYER_SPEAKER_ID,
    ...overrides,
  };
}

describe("ReplySelector", () => {
  it("throttles same reply in the same turn and respects maxTriggers", () => {
    const reply = buildReply({ maxTriggers: 1 });
    const config = {
      checkpoints: new Map([
        [
          "cp-1",
          {
            replies: [reply],
            repliesByTrigger: new Map([["afterSpeak", [reply]]]),
          },
        ],
      ]),
    };
    const resolver = {
      buildExpectedSpeakerIds: jest.fn().mockReturnValue([]),
    };

    const selector = new ReplySelector(config as any, resolver as any);
    selector.updateTurn(5);

    const event = {
      id: 1,
      type: "afterSpeak",
      checkpointId: "cp-1",
      metadata: { speakerId: PLAYER_SPEAKER_ID },
    } as any;

    const first = selector.selectAction(event, null);
    expect(first).not.toBeNull();

    first!.state.lastActionTurn = 5;
    first!.state.totalTriggerCount = 1;

    const secondSameTurn = selector.selectAction(event, null);
    expect(secondSameTurn).toBeNull();

    selector.updateTurn(6);
    const blockedByMax = selector.selectAction(event, null);
    expect(blockedByMax).toBeNull();
  });

  it("skips afterSpeak replies when speaker does not match expected ids", () => {
    const reply = buildReply({ normalizedSpeakerId: "narrator" });
    const config = {
      checkpoints: new Map([
        [
          "cp-2",
          {
            replies: [reply],
            repliesByTrigger: new Map([["afterSpeak", [reply]]]),
          },
        ],
      ]),
    };
    const resolver = {
      buildExpectedSpeakerIds: jest.fn().mockReturnValue(["narrator"]),
    };

    const selector = new ReplySelector(config as any, resolver as any);
    selector.updateTurn(2);

    const event = {
      id: 2,
      type: "afterSpeak",
      checkpointId: "cp-2",
      metadata: { speakerId: "player" },
    } as any;

    const selected = selector.selectAction(event, null);
    expect(selected).toBeNull();
  });

  it("uses probability gate to filter replies", () => {
    const reply = buildReply({ probability: 30, trigger: "onEnter" });
    const config = {
      checkpoints: new Map([
        [
          "cp-3",
          {
            replies: [reply],
            repliesByTrigger: new Map([["onEnter", [reply]]]),
          },
        ],
      ]),
    };
    const resolver = {
      buildExpectedSpeakerIds: jest.fn().mockReturnValue([]),
    };

    const selector = new ReplySelector(config as any, resolver as any);
    selector.updateTurn(1);

    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.9);
    const selected = selector.selectAction(
      { id: 3, type: "onEnter", checkpointId: "cp-3" } as any,
      null
    );
    randomSpy.mockRestore();

    expect(selected).toBeNull();
  });
});
