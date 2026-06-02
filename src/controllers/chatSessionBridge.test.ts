import {
  getChatSessionBridgeSnapshot,
  parseChatContextPayload,
  parseDraftedSpeakerPayload,
  parseGenerationStartedPayload,
  parseMessageReceivedArgs,
  parseReceivedMessagePayload,
  parseUserMessagePayload,
  pickUserTextFromChat,
  releaseChatSessionBridge,
  resetChatSessionBridgeForTests,
  retainChatSessionBridge,
  subscribeToChatSessionBridge,
} from "@controllers/chatSessionBridge";
import { getCharacterNameById, getContext, subscribeToHostEvent } from "@services/STAPI";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
  getCharacterNameById: jest.fn(),
  subscribeToHostEvent: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getCharacterNameByIdMock = getCharacterNameById as jest.MockedFunction<typeof getCharacterNameById>;
const subscribeToHostEventMock = subscribeToHostEvent as jest.MockedFunction<typeof subscribeToHostEvent>;

describe("chatSessionBridge", () => {
  beforeEach(() => {
    jest.useRealTimers();
    resetChatSessionBridgeForTests();
    getContextMock.mockReset();
    getCharacterNameByIdMock.mockReset();
    subscribeToHostEventMock.mockReset();
  });

  afterEach(() => {
    releaseChatSessionBridge();
    resetChatSessionBridgeForTests();
  });

  it("reads fresh context inside chat handlers and normalizes message events", () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    subscribeToHostEventMock.mockImplementation((eventName: any, handler: any) => {
      handlers.set(eventName, handler);
      return jest.fn();
    });

    let contextState: any = {
      chatId: "chat-1",
      groupId: "group-1",
      chat: [{ is_user: true, mes: "hello", mesId: 1 }],
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
    subscribeToHostEventMock.mockImplementation((eventName: any, handler: any) => {
      handlers.set(eventName, handler);
      return jest.fn();
    });

    let contextState: any = {
      chatId: "chat-1",
      groupId: "group-1",
      chat: [],
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

describe("payload parsers", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    getCharacterNameByIdMock.mockReset();
  });

  describe("parseChatContextPayload", () => {
    it("returns chatId and groupChatSelected from context", () => {
      getContextMock.mockReturnValue({ chatId: "abc", groupId: "g1" } as any);
      expect(parseChatContextPayload()).toEqual({ chatId: "abc", groupChatSelected: true });
    });

    it("returns null chatId when chatId is null", () => {
      getContextMock.mockReturnValue({ chatId: null, groupId: null } as any);
      expect(parseChatContextPayload()).toEqual({ chatId: null, groupChatSelected: false });
    });

    it("returns null chatId for empty string chatId", () => {
      getContextMock.mockReturnValue({ chatId: "  ", groupId: null } as any);
      expect(parseChatContextPayload()).toEqual({ chatId: null, groupChatSelected: false });
    });

    it("returns safe defaults when getContext throws", () => {
      getContextMock.mockImplementation(() => { throw new Error("boom"); });
      expect(parseChatContextPayload()).toEqual({ chatId: null, groupChatSelected: false });
    });
  });

  describe("parseDraftedSpeakerPayload", () => {
    it("resolves numeric character id to name", () => {
      getCharacterNameByIdMock.mockReturnValue("Arin");
      expect(parseDraftedSpeakerPayload(5)).toBe("Arin");
      expect(getCharacterNameByIdMock).toHaveBeenCalledWith(5);
    });

    it("resolves array payload [charId]", () => {
      getCharacterNameByIdMock.mockReturnValue("Bela");
      expect(parseDraftedSpeakerPayload([7])).toBe("Bela");
      expect(getCharacterNameByIdMock).toHaveBeenCalledWith(7);
    });

    it("falls back to .name on object payload", () => {
      getCharacterNameByIdMock.mockReturnValue(undefined);
      expect(parseDraftedSpeakerPayload({ name: "Custom NPC" })).toBe("Custom NPC");
    });

    it("returns null for unresolvable payload", () => {
      getCharacterNameByIdMock.mockReturnValue(undefined);
      expect(parseDraftedSpeakerPayload(undefined)).toBeNull();
    });

    it("returns null for numeric id that resolves to undefined", () => {
      getCharacterNameByIdMock.mockReturnValue(undefined);
      expect(parseDraftedSpeakerPayload(999)).toBeNull();
    });

    it("returns null for object without name", () => {
      getCharacterNameByIdMock.mockReturnValue(undefined);
      expect(parseDraftedSpeakerPayload({ id: 42 })).toBeNull();
    });
  });

  describe("parseUserMessagePayload", () => {
    it("extracts text and key from {mes, mesId} object", () => {
      expect(parseUserMessagePayload({ mes: "hello world", mesId: 5 })).toEqual({
        text: "hello world",
        key: "id:5",
      });
    });

    it("extracts text from {text, id} object", () => {
      expect(parseUserMessagePayload({ text: "hi there", id: 10 })).toEqual({
        text: "hi there",
        key: "id:10",
      });
    });

    it("falls back to text-based key when no id", () => {
      expect(parseUserMessagePayload({ mes: "No ID" })).toEqual({
        text: "No ID",
        key: "text:no id",
      });
    });

    it("returns null when no args", () => {
      expect(parseUserMessagePayload()).toBeNull();
    });

    it("returns null for empty text", () => {
      expect(parseUserMessagePayload({ mes: "", mesId: 1 })).toBeNull();
    });

    it("skips null args and finds the first non-null object", () => {
      expect(parseUserMessagePayload(null, undefined, { mes: "found", mesId: 3 })).toEqual({
        text: "found",
        key: "id:3",
      });
    });
  });

  describe("pickUserTextFromChat", () => {
    it("picks last user message from chat", () => {
      getContextMock.mockReturnValue({
        chat: [
          { is_user: true, mes: "first", mesId: 1 },
          { is_user: false, mes: "reply", name: "NPC" },
          { is_user: true, mes: "second", mesId: 2 },
        ],
      } as any);
      expect(pickUserTextFromChat()).toEqual({ text: "second", key: "id:2" });
    });

    it("falls back to index-based key when no mesId", () => {
      getContextMock.mockReturnValue({
        chat: [{ is_user: true, mes: "only" }],
      } as any);
      expect(pickUserTextFromChat()).toEqual({ text: "only", key: "idx:0" });
    });

    it("returns null for empty chat", () => {
      getContextMock.mockReturnValue({ chat: [] } as any);
      expect(pickUserTextFromChat()).toBeNull();
    });

    it("returns null when chat has no user messages", () => {
      getContextMock.mockReturnValue({
        chat: [{ is_user: false, mes: "npc talk", name: "NPC" }],
      } as any);
      expect(pickUserTextFromChat()).toBeNull();
    });
  });

  describe("parseReceivedMessagePayload", () => {
    it("parses a normal NPC message", () => {
      getContextMock.mockReturnValue({
        chat: [{ is_user: false, is_system: false, name: "Arin", extra: {} }],
      } as any);
      const result = parseReceivedMessagePayload(0, "normal");
      expect(result).toEqual({
        messageId: 0,
        messageType: "normal",
        speakerName: "Arin",
        speakerId: "arin",
        isUser: false,
        isSystem: false,
        isSelfDispatched: false,
      });
    });

    it("parses a user message", () => {
      getContextMock.mockReturnValue({
        chat: [{ is_user: true, name: "Player", extra: {} }],
      } as any);
      const result = parseReceivedMessagePayload(0);
      expect(result).toEqual(expect.objectContaining({
        isUser: true,
        speakerName: "$player",
        speakerId: "$player",
      }));
    });

    it("detects self-dispatched talk control messages", () => {
      getContextMock.mockReturnValue({
        chat: [{ is_user: false, name: "NPC", extra: { storyOrchestratorTalkControl: true } }],
      } as any);
      expect(parseReceivedMessagePayload(0)?.isSelfDispatched).toBe(true);
    });

    it("returns null for out-of-bounds messageId", () => {
      getContextMock.mockReturnValue({ chat: [] } as any);
      expect(parseReceivedMessagePayload(5)).toBeNull();
    });
  });

  describe("parseGenerationStartedPayload", () => {
    it("parses positional args: (type, params, dryRun, payload)", () => {
      const result = parseGenerationStartedPayload(
        ["normal", {}, true, { character: "Arin" }],
        null,
      );
      expect(result).toEqual({ type: "normal", dryRun: true, speakerCandidate: "Arin" });
    });

    it("prefers draftedSpeakerName over payload character", () => {
      const result = parseGenerationStartedPayload(
        ["normal", {}, false, { character: "Other" }],
        "Drafted",
      );
      expect(result).toEqual({ type: "normal", dryRun: false, speakerCandidate: "Drafted" });
    });

    it("extracts type from first-arg object", () => {
      const result = parseGenerationStartedPayload(
        [{ type: "quiet", character: "NPC" }],
        null,
      );
      expect(result).toEqual({ type: "quiet", dryRun: false, speakerCandidate: "NPC" });
    });

    it("reads dryRun from second-arg object", () => {
      const result = parseGenerationStartedPayload(
        [{}, { dryRun: true }],
        null,
      );
      expect(result).toEqual({ type: null, dryRun: true, speakerCandidate: null });
    });

    it("handles empty args gracefully", () => {
      const result = parseGenerationStartedPayload([], null);
      expect(result).toEqual({ type: null, dryRun: false, speakerCandidate: null });
    });

    it("reads quietName from payload when character is missing", () => {
      const result = parseGenerationStartedPayload(
        ["quiet", {}, false, { quietName: "System" }],
        null,
      );
      expect(result).toEqual({ type: "quiet", dryRun: false, speakerCandidate: "System" });
    });

    it("reads payload from array wrapper in fourth arg", () => {
      const result = parseGenerationStartedPayload(
        ["normal", {}, false, [{ character: "Wrapped" }]],
        null,
      );
      expect(result).toEqual({ type: "normal", dryRun: false, speakerCandidate: "Wrapped" });
    });
  });

  describe("parseMessageReceivedArgs", () => {
    it("parses positional (messageId, messageType)", () => {
      expect(parseMessageReceivedArgs([42, "normal"])).toEqual({
        messageId: 42,
        messageType: "normal",
      });
    });

    it("coerces non-number messageId", () => {
      expect(parseMessageReceivedArgs(["7"])).toEqual({
        messageId: 7,
        messageType: undefined,
      });
    });

    it("returns NaN for missing messageId", () => {
      const result = parseMessageReceivedArgs([]);
      expect(Number.isNaN(result.messageId)).toBe(true);
      expect(result.messageType).toBeUndefined();
    });
  });
});
