import { TalkControlService } from "@services/TalkControlService";
import { getContext } from "@services/STAPI";
import { subscribeToEventSource } from "@utils/event-source";
import { createArinContext, createTalkControlStory } from "@services/__mocks__/testData";

const selectActionMock = jest.fn();
const resolveCharacterMock = jest.fn();
const pickStaticReplyTextMock = jest.fn();
const generateLlmReplyMock = jest.fn();
const injectMessageMock = jest.fn();
const resetStatesMock = jest.fn();
const updateTurnMock = jest.fn();

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
}));

jest.mock("@utils/event-source", () => ({
  subscribeToEventSource: jest.fn(),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: () => ({
      runtime: { activeCheckpointKey: "cp-1" },
    }),
  },
}));

jest.mock("@services/TalkControl/ReplySelector", () => ({
  ReplySelector: jest.fn().mockImplementation(() => ({
    selectAction: selectActionMock,
    resetStates: resetStatesMock,
    updateTurn: updateTurnMock,
  })),
}));

jest.mock("@services/TalkControl/CharacterResolver", () => ({
  CharacterResolver: jest.fn().mockImplementation(() => ({
    resolveCharacter: resolveCharacterMock,
  })),
}));

jest.mock("@services/TalkControl/MessageInjector", () => ({
  MessageInjector: jest.fn().mockImplementation(() => ({
    pickStaticReplyText: pickStaticReplyTextMock,
    generateLlmReply: generateLlmReplyMock,
    injectMessage: injectMessageMock,
  })),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const subscribeToEventSourceMock = subscribeToEventSource as jest.MockedFunction<typeof subscribeToEventSource>;

describe("TalkControlService", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    subscribeToEventSourceMock.mockReset();
    selectActionMock.mockReset();
    resolveCharacterMock.mockReset();
    pickStaticReplyTextMock.mockReset();
    generateLlmReplyMock.mockReset();
    injectMessageMock.mockReset();
    resetStatesMock.mockReset();
    updateTurnMock.mockReset();
    getContextMock.mockReturnValue(createArinContext({ eventSource: {}, eventTypes: {}, chat: [] }) as any);
  });

  it("intercepts loud generation and dispatches pending static reply", async () => {
    getContextMock.mockReturnValue(createArinContext() as any);

    const state = { lastActionTurn: -1, actionTurnStamp: 1, actionsThisTurn: 0, totalTriggerCount: 0 };
    selectActionMock.mockReturnValue({
      event: { id: 1, type: "onEnter", checkpointId: "cp-1" },
      checkpointId: "cp-1",
      reply: { memberId: "Arin", content: { kind: "static" } },
      state,
      replyIndex: 0,
    });
    resolveCharacterMock.mockReturnValue({ id: 0, character: { name: "Arin" } });
    pickStaticReplyTextMock.mockReturnValue("hello");
    injectMessageMock.mockResolvedValue(true);

    const service = new TalkControlService({
      story: createTalkControlStory() as any,
    });
    service.setCheckpoint("cp-1");

    const abort = jest.fn();
    const interceptor = service.getInterceptor();
    await interceptor([], 0, abort, "normal");
    service.dispose();

    expect(abort).toHaveBeenCalledWith(true);
    expect(injectMessageMock).toHaveBeenCalled();
    expect(state.totalTriggerCount).toBeGreaterThanOrEqual(1);
  });

  it("does not intercept quiet generation", async () => {
    getContextMock.mockReturnValue(createArinContext() as any);
    selectActionMock.mockReturnValue({
      event: { id: 1, type: "onEnter", checkpointId: "cp-1" },
      checkpointId: "cp-1",
      reply: { memberId: "Arin", content: { kind: "static" } },
      state: { lastActionTurn: -1, actionTurnStamp: 1, actionsThisTurn: 0, totalTriggerCount: 0 },
      replyIndex: 0,
    });

    const service = new TalkControlService({
      story: createTalkControlStory() as any,
    });
    service.setCheckpoint("cp-1");

    const abort = jest.fn();
    const interceptor = service.getInterceptor();
    await interceptor([], 0, abort, "quiet");
    service.dispose();

    expect(abort).not.toHaveBeenCalled();
    expect(injectMessageMock).not.toHaveBeenCalled();
  });

  it("subscribes on start and unsubscribes on dispose", () => {
    const off = jest.fn();
    subscribeToEventSourceMock.mockReturnValue(off as any);
    getContextMock.mockReturnValue(createArinContext({
      chatId: "chat-1",
      eventSource: {},
      eventTypes: {
        MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
        GENERATION_STARTED: "GENERATION_STARTED",
        GENERATION_STOPPED: "GENERATION_STOPPED",
        GENERATION_ENDED: "GENERATION_ENDED",
        CHAT_CHANGED: "CHAT_CHANGED",
        CHAT_CREATED: "CHAT_CREATED",
        GROUP_CHAT_CREATED: "GROUP_CHAT_CREATED",
        CHAT_DELETED: "CHAT_DELETED",
        GROUP_CHAT_DELETED: "GROUP_CHAT_DELETED",
      },
    }) as any);

    const service = new TalkControlService({
      story: createTalkControlStory() as any,
    });
    service.start();
    service.dispose();

    expect(subscribeToEventSourceMock).toHaveBeenCalled();
    expect(off).toHaveBeenCalled();
    expect(resetStatesMock).toHaveBeenCalled();
  });
});
