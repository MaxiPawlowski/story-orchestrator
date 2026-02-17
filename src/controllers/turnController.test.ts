import { createTurnController } from "@controllers/turnController";
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

describe("turnController", () => {
  beforeEach(() => {
    getCharacterNameByIdMock.mockReset();
    subscribeToEventSourceMock.mockReset();
  });

  it("handles user messages once per unique message signature", () => {
    let chatMessages: any[] = [{ is_user: true, mes: "hello", mesId: 1 }];
    const handlers = new Map<string, (...args: any[]) => void>();
    subscribeToEventSourceMock.mockImplementation(({ eventName, handler }: any) => {
      handlers.set(eventName, handler);
      return jest.fn();
    });
    getContextMock.mockImplementation(() => ({
      chat: chatMessages,
      eventSource: {},
      eventTypes: {
        MESSAGE_SENT: "MESSAGE_SENT",
        GROUP_MEMBER_DRAFTED: "GROUP_MEMBER_DRAFTED",
        GENERATION_STARTED: "GENERATION_STARTED",
        GENERATION_STOPPED: "GENERATION_STOPPED",
        GENERATION_ENDED: "GENERATION_ENDED",
      },
    }) as any);

    const orchestrator = {
      handleUserText: jest.fn(),
      setActiveRole: jest.fn(),
    } as any;

    const controller = createTurnController();
    controller.attach(orchestrator);
    controller.start();

    handlers.get("MESSAGE_SENT")?.();
    handlers.get("MESSAGE_SENT")?.();
    expect(orchestrator.handleUserText).toHaveBeenCalledTimes(1);
    expect(orchestrator.handleUserText).toHaveBeenCalledWith("hello");

    chatMessages = [{ is_user: true, mes: "hello again", mesId: 2 }];
    handlers.get("MESSAGE_SENT")?.();
    expect(orchestrator.handleUserText).toHaveBeenCalledTimes(2);
    expect(orchestrator.handleUserText).toHaveBeenLastCalledWith("hello again");
  });

  it("applies drafted role on generation start and gates role application by epoch", () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    subscribeToEventSourceMock.mockImplementation(({ eventName, handler }: any) => {
      handlers.set(eventName, handler);
      return jest.fn();
    });
    getCharacterNameByIdMock.mockReturnValue("Arin");
    getContextMock.mockReturnValue({
      chat: [],
      eventSource: {},
      eventTypes: {
        MESSAGE_SENT: "MESSAGE_SENT",
        GROUP_MEMBER_DRAFTED: "GROUP_MEMBER_DRAFTED",
        GENERATION_STARTED: "GENERATION_STARTED",
        GENERATION_STOPPED: "GENERATION_STOPPED",
        GENERATION_ENDED: "GENERATION_ENDED",
      },
    } as any);

    const orchestrator = {
      handleUserText: jest.fn(),
      setActiveRole: jest.fn(),
    } as any;
    const controller = createTurnController();
    controller.attach(orchestrator);
    controller.start();

    handlers.get("GROUP_MEMBER_DRAFTED")?.(5);
    handlers.get("GENERATION_STARTED")?.({});
    expect(orchestrator.setActiveRole).toHaveBeenCalledWith("Arin");

    expect(controller.shouldApplyRole("dm" as any, 1)).toBe(true);
    expect(controller.shouldApplyRole("dm" as any, 1)).toBe(false);
    handlers.get("GENERATION_STARTED")?.({});
    expect(controller.shouldApplyRole("dm" as any, 1)).toBe(true);
  });

  it("cleans up listeners on stop", () => {
    const off1 = jest.fn();
    const off2 = jest.fn();
    const off3 = jest.fn();
    const off4 = jest.fn();
    const off5 = jest.fn();
    subscribeToEventSourceMock
      .mockReturnValueOnce(off1)
      .mockReturnValueOnce(off2)
      .mockReturnValueOnce(off3)
      .mockReturnValueOnce(off4)
      .mockReturnValueOnce(off5);
    getContextMock.mockReturnValue({
      chat: [],
      eventSource: {},
      eventTypes: {
        MESSAGE_SENT: "MESSAGE_SENT",
        GROUP_MEMBER_DRAFTED: "GROUP_MEMBER_DRAFTED",
        GENERATION_STARTED: "GENERATION_STARTED",
        GENERATION_STOPPED: "GENERATION_STOPPED",
        GENERATION_ENDED: "GENERATION_ENDED",
      },
    } as any);

    const controller = createTurnController();
    controller.attach({ handleUserText: jest.fn(), setActiveRole: jest.fn() } as any);
    controller.start();
    controller.stop();

    expect(off1).toHaveBeenCalledTimes(1);
    expect(off2).toHaveBeenCalledTimes(1);
    expect(off3).toHaveBeenCalledTimes(1);
    expect(off4).toHaveBeenCalledTimes(1);
    expect(off5).toHaveBeenCalledTimes(1);
  });
});
