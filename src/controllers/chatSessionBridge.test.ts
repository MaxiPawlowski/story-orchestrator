import {
  getChatSessionBridgeSnapshot,
  releaseChatSessionBridge,
  resetChatSessionBridgeForTests,
  retainChatSessionBridge,
  subscribeToChatSessionBridge,
} from "@controllers/chatSessionBridge";
import { getCharacterNameById, getContext } from "@services/STAPI";
import { subscribeToEventSource } from "@utils/event-source";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
  getCharacterNameById: jest.fn(),
}));

jest.mock("@utils/event-source", () => ({
  subscribeToEventSource: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getCharacterNameByIdMock = getCharacterNameById as jest.MockedFunction<typeof getCharacterNameById>;
const subscribeToEventSourceMock = subscribeToEventSource as jest.MockedFunction<typeof subscribeToEventSource>;

describe("chatSessionBridge", () => {
  beforeEach(() => {
    jest.useRealTimers();
    resetChatSessionBridgeForTests();
    getContextMock.mockReset();
    getCharacterNameByIdMock.mockReset();
    subscribeToEventSourceMock.mockReset();
  });

  afterEach(() => {
    releaseChatSessionBridge();
    resetChatSessionBridgeForTests();
  });

  it("reads fresh context inside chat handlers and normalizes message events", () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    subscribeToEventSourceMock.mockImplementation(({ eventName, handler }: any) => {
      handlers.set(eventName, handler);
      return jest.fn();
    });

    let contextState: any = {
      chatId: "chat-1",
      groupId: "group-1",
      chat: [{ is_user: true, mes: "hello", mesId: 1 }],
      eventSource: {},
      eventTypes: {
        CHAT_CHANGED: "CHAT_CHANGED",
        CHAT_CREATED: "CHAT_CREATED",
        GROUP_CHAT_CREATED: "GROUP_CHAT_CREATED",
        CHAT_DELETED: "CHAT_DELETED",
        GROUP_CHAT_DELETED: "GROUP_CHAT_DELETED",
        MESSAGE_SENT: "MESSAGE_SENT",
        MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
        GROUP_MEMBER_DRAFTED: "GROUP_MEMBER_DRAFTED",
        GENERATION_STARTED: "GENERATION_STARTED",
        GENERATION_STOPPED: "GENERATION_STOPPED",
        GENERATION_ENDED: "GENERATION_ENDED",
      },
    };
    getContextMock.mockImplementation(() => contextState);
    getCharacterNameByIdMock.mockReturnValue("Arin");

    const received: Array<any> = [];
    const off = subscribeToChatSessionBridge((event) => {
      received.push(event);
    });

    retainChatSessionBridge();

    contextState = { ...contextState, chatId: "chat-2", groupId: null };
    handlers.get("CHAT_CHANGED")?.();

    contextState = {
      ...contextState,
      chat: [{ is_user: true, mes: "fresh hello", mesId: 2 }],
    };
    handlers.get("MESSAGE_SENT")?.();

    contextState = {
      ...contextState,
      chat: [{ is_user: false, is_system: false, name: "Arin", extra: { storyOrchestratorTalkControl: true } }],
    };
    handlers.get("MESSAGE_RECEIVED")?.(0, "normal");
    handlers.get("GROUP_MEMBER_DRAFTED")?.(5);
    handlers.get("GENERATION_STARTED")?.("normal", {}, false, {});

    expect(getChatSessionBridgeSnapshot().chat).toEqual({ chatId: "chat-2", groupChatSelected: false });
    expect(received).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "chat", chat: { chatId: "chat-2", groupChatSelected: false } }),
      expect.objectContaining({ type: "user-message", message: { text: "fresh hello", key: "id:2" } }),
      expect.objectContaining({
        type: "message-received",
        message: expect.objectContaining({ speakerName: "Arin", speakerId: "arin", isSelfDispatched: true }),
      }),
      expect.objectContaining({ type: "generation-drafted", generation: expect.objectContaining({ draftedSpeakerName: "Arin" }) }),
      expect.objectContaining({ type: "generation-started", generation: expect.objectContaining({ speakerName: "Arin", active: true }) }),
    ]));

    off();
  });

  it("retries MESSAGE_SENT once when chat state lags behind the event", () => {
    jest.useFakeTimers();

    const handlers = new Map<string, (...args: any[]) => void>();
    subscribeToEventSourceMock.mockImplementation(({ eventName, handler }: any) => {
      handlers.set(eventName, handler);
      return jest.fn();
    });

    let contextState: any = {
      chatId: "chat-1",
      groupId: "group-1",
      chat: [],
      eventSource: {},
      eventTypes: {
        CHAT_CHANGED: "CHAT_CHANGED",
        CHAT_CREATED: "CHAT_CREATED",
        GROUP_CHAT_CREATED: "GROUP_CHAT_CREATED",
        CHAT_DELETED: "CHAT_DELETED",
        GROUP_CHAT_DELETED: "GROUP_CHAT_DELETED",
        MESSAGE_SENT: "MESSAGE_SENT",
        MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
        GROUP_MEMBER_DRAFTED: "GROUP_MEMBER_DRAFTED",
        GENERATION_STARTED: "GENERATION_STARTED",
        GENERATION_STOPPED: "GENERATION_STOPPED",
        GENERATION_ENDED: "GENERATION_ENDED",
      },
    };
    getContextMock.mockImplementation(() => contextState);

    const received: Array<any> = [];
    subscribeToChatSessionBridge((event) => {
      received.push(event);
    });

    retainChatSessionBridge();
    handlers.get("MESSAGE_SENT")?.();

    expect(received.filter((event) => event.type === "user-message")).toHaveLength(0);

    contextState = {
      ...contextState,
      chat: [{ is_user: true, mes: "delayed hello", mesId: 9 }],
    };

    jest.runOnlyPendingTimers();

    expect(received).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "user-message", message: { text: "delayed hello", key: "id:9" } }),
    ]));
  });
});
