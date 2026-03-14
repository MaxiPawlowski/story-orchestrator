import { TalkControlService } from "@services/TalkControlService";
import { getContext } from "@services/STAPI";
import { createArinContext, createTalkControlStory } from "@services/__mocks__/testData";
import {
  getChatSessionBridgeSnapshot,
  releaseChatSessionBridge,
  retainChatSessionBridge,
  subscribeToChatSessionBridge,
} from "@controllers/chatSessionBridge";

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

jest.mock("@controllers/chatSessionBridge", () => ({
  getChatSessionBridgeSnapshot: jest.fn(() => ({ chat: { chatId: "chat-1", groupChatSelected: true } })),
  retainChatSessionBridge: jest.fn(),
  releaseChatSessionBridge: jest.fn(),
  subscribeToChatSessionBridge: jest.fn(),
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
const getChatSessionBridgeSnapshotMock = getChatSessionBridgeSnapshot as jest.MockedFunction<typeof getChatSessionBridgeSnapshot>;
const retainChatSessionBridgeMock = retainChatSessionBridge as jest.MockedFunction<typeof retainChatSessionBridge>;
const releaseChatSessionBridgeMock = releaseChatSessionBridge as jest.MockedFunction<typeof releaseChatSessionBridge>;
const subscribeToChatSessionBridgeMock = subscribeToChatSessionBridge as jest.MockedFunction<typeof subscribeToChatSessionBridge>;

describe("TalkControlService", () => {
  let bridgeHandler: ((event: any) => void) | undefined;

  beforeEach(() => {
    jest.useRealTimers();
    getContextMock.mockReset();
    getChatSessionBridgeSnapshotMock.mockReset();
    retainChatSessionBridgeMock.mockReset();
    releaseChatSessionBridgeMock.mockReset();
    subscribeToChatSessionBridgeMock.mockReset();
    selectActionMock.mockReset();
    resolveCharacterMock.mockReset();
    pickStaticReplyTextMock.mockReset();
    generateLlmReplyMock.mockReset();
    injectMessageMock.mockReset();
    resetStatesMock.mockReset();
    updateTurnMock.mockReset();
    bridgeHandler = undefined;
    getContextMock.mockReturnValue(createArinContext({ eventSource: {}, eventTypes: {}, chat: [] }) as any);
    getChatSessionBridgeSnapshotMock.mockReturnValue({ chat: { chatId: "chat-1", groupChatSelected: true } } as any);
    subscribeToChatSessionBridgeMock.mockImplementation((listener: any) => {
      bridgeHandler = listener;
      return jest.fn();
    });
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
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });
    service.start();
    bridgeHandler?.({ type: "generation-started", generation: { type: "normal", dryRun: false } });
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
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });
    service.setCheckpoint("cp-1");

    const abort = jest.fn();
    const interceptor = service.getInterceptor();
    await interceptor([], 0, abort, "quiet");
    service.dispose();

    expect(abort).not.toHaveBeenCalled();
    expect(injectMessageMock).not.toHaveBeenCalled();
  });

  it("flushes queued actions after generation settles", async () => {
    getContextMock.mockReturnValue(createArinContext() as any);
    selectActionMock.mockReturnValue({
      event: { id: 1, type: "onEnter", checkpointId: "cp-1" },
      checkpointId: "cp-1",
      reply: { memberId: "Arin", content: { kind: "static" } },
      state: { lastActionTurn: -1, actionTurnStamp: 1, actionsThisTurn: 0, totalTriggerCount: 0 },
      replyIndex: 0,
    });
    resolveCharacterMock.mockReturnValue({ id: 0, character: { name: "Arin" } });
    pickStaticReplyTextMock.mockReturnValue("hello");
    injectMessageMock.mockResolvedValue(true);

    const service = new TalkControlService({
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });
    service.start();
    bridgeHandler?.({ type: "generation-started", generation: { type: "normal", dryRun: false } });
    service.setCheckpoint("cp-1");

    await Promise.resolve();
    expect(injectMessageMock).not.toHaveBeenCalled();

    bridgeHandler?.({ type: "generation-ended", generation: { active: false, type: null, dryRun: false } });
    await Promise.resolve();
    await Promise.resolve();
    service.dispose();

    expect(injectMessageMock).toHaveBeenCalled();
  });

  it("subscribes on start and unsubscribes on dispose", () => {
    const off = jest.fn();
    subscribeToChatSessionBridgeMock.mockReturnValue(off as any);

    const service = new TalkControlService({
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });
    service.start();
    service.dispose();

    expect(retainChatSessionBridgeMock).toHaveBeenCalled();
    expect(subscribeToChatSessionBridgeMock).toHaveBeenCalled();
    expect(off).toHaveBeenCalled();
    expect(releaseChatSessionBridgeMock).toHaveBeenCalled();
    expect(resetStatesMock).toHaveBeenCalled();
  });

  it("flushes multiple queued actions in order", async () => {
    getContextMock.mockReturnValue(createArinContext() as any);

    const firstState = { lastActionTurn: -1, actionTurnStamp: 1, actionsThisTurn: 0, totalTriggerCount: 0 };
    const secondState = { lastActionTurn: -1, actionTurnStamp: 1, actionsThisTurn: 0, totalTriggerCount: 0 };
    selectActionMock
      .mockReturnValueOnce({
        event: { id: 1, type: "onEnter", checkpointId: "cp-1" },
        checkpointId: "cp-1",
        reply: { memberId: "Arin", content: { kind: "static" } },
        state: firstState,
        replyIndex: 0,
      })
      .mockReturnValueOnce({
        event: { id: 2, type: "onEnter", checkpointId: "cp-1" },
        checkpointId: "cp-1",
        reply: { memberId: "Arin", content: { kind: "static" } },
        state: secondState,
        replyIndex: 1,
      })
      .mockReturnValue(null);
    resolveCharacterMock.mockReturnValue({ id: 0, character: { name: "Arin" } });
    pickStaticReplyTextMock.mockReturnValue("hello");
    injectMessageMock.mockResolvedValue(true);

    const service = new TalkControlService({
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });

    service.setCheckpoint("cp-1");
    service.notifyArbiterPhase("before");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    service.dispose();

    expect(injectMessageMock).toHaveBeenCalledTimes(2);
  });

  it("ignores bridge message-received events during self dispatch", async () => {
    getContextMock.mockReturnValue(createArinContext() as any);

    const state = { lastActionTurn: -1, actionTurnStamp: 1, actionsThisTurn: 0, totalTriggerCount: 0 };
    selectActionMock
      .mockReturnValueOnce({
        event: { id: 1, type: "onEnter", checkpointId: "cp-1" },
        checkpointId: "cp-1",
        reply: { memberId: "Arin", content: { kind: "static" } },
        state,
        replyIndex: 0,
      })
      .mockReturnValue(null);
    resolveCharacterMock.mockReturnValue({ id: 0, character: { name: "Arin" } });
    pickStaticReplyTextMock.mockReturnValue("hello");
    injectMessageMock.mockImplementation(async () => {
      bridgeHandler?.({
        type: "message-received",
        message: {
          messageId: 3,
          messageType: "talkControl",
          speakerId: "arin",
          speakerName: "Arin",
          isSystem: false,
          isSelfDispatched: true,
        },
      });
      return true;
    });

    const service = new TalkControlService({
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });
    service.start();
    service.setCheckpoint("cp-1");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    service.dispose();

    expect(injectMessageMock).toHaveBeenCalledTimes(1);
    expect(selectActionMock).toHaveBeenCalledTimes(2);
  });

  it("resets queued state on chat changes", async () => {
    getContextMock.mockReturnValue(createArinContext() as any);
    selectActionMock.mockReturnValue(null);

    const service = new TalkControlService({
      story: createTalkControlStory({ talkControl: { checkpoints: new Map() } }) as any,
    });
    service.start();
    service.setCheckpoint("cp-1");
    bridgeHandler?.({ type: "chat", chat: { chatId: "chat-2", groupChatSelected: true } });

    await Promise.resolve();
    await Promise.resolve();
    service.dispose();

    expect(resetStatesMock).toHaveBeenCalled();
    expect(injectMessageMock).not.toHaveBeenCalled();
  });
});
