import { MessageInjector } from "@services/TalkControl/MessageInjector";
import { getContext, getMessageTimeStamp } from "@services/STAPI";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
  getMessageTimeStamp: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getMessageTimeStampMock = getMessageTimeStamp as jest.MockedFunction<typeof getMessageTimeStamp>;

describe("MessageInjector", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    getMessageTimeStampMock.mockReset();
    getMessageTimeStampMock.mockReturnValue(12345 as any);
  });

  it("expands static replies through substituteParams", () => {
    getContextMock.mockReturnValue({
      substituteParams: jest.fn().mockReturnValue("expanded text"),
    } as any);

    const injector = new MessageInjector();
    const text = injector.pickStaticReplyText({
      content: { kind: "static", text: "raw" },
    } as any);

    expect(text).toBe("expanded text");
  });

  it("continues quiet generation when first llm output is truncated", async () => {
    const generateQuietPrompt = jest
      .fn()
      .mockResolvedValueOnce("This answer")
      .mockResolvedValueOnce(" is completed.");
    getContextMock.mockReturnValue({
      generateQuietPrompt,
    } as any);

    const injector = new MessageInjector();
    injector.setContinuationOptions(true, 1);

    const text = await injector.generateLlmReply(
      { memberId: "Arin", content: { kind: "llm", instruction: "respond" } } as any,
      0
    );

    expect(generateQuietPrompt).toHaveBeenCalledTimes(2);
    expect(text).toBe("This answer is completed.");
  });

  it("injects message into chat and emits host events", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const addOneMessage = jest.fn();
    const saveChat = jest.fn().mockResolvedValue(undefined);
    const chat: any[] = [];
    const metadata: Record<string, unknown> = {};

    getContextMock.mockReturnValue({
      chatMetadata: metadata,
      getThumbnailUrl: jest.fn().mockReturnValue("thumb"),
      addOneMessage,
      saveChat,
      groupId: "g1",
      chat,
      eventSource: { emit },
      eventTypes: { MESSAGE_RECEIVED: "mr", CHARACTER_MESSAGE_RENDERED: "cmr" },
    } as any);

    const injector = new MessageInjector();
    const ok = await injector.injectMessage({
      reply: { memberId: "Arin" } as any,
      checkpointId: "cp-1",
      eventType: "onEnter" as any,
      charId: 0,
      character: { name: "Arin", avatar: "arin.png" },
      text: "hello",
      kind: "static",
    });

    expect(ok).toBe(true);
    expect(chat).toHaveLength(1);
    expect((metadata as any).tainted).toBe(true);
    expect(emit).toHaveBeenCalledWith("mr", 0, "talkControl");
    expect(emit).toHaveBeenCalledWith("cmr", 0, "talkControl");
    expect(addOneMessage).toHaveBeenCalledTimes(1);
    expect(saveChat).toHaveBeenCalledTimes(1);
  });
});
