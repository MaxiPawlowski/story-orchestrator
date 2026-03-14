import { createTurnController } from "@controllers/turnController";
import {
  retainChatSessionBridge,
  releaseChatSessionBridge,
  subscribeToChatSessionBridge,
} from "@controllers/chatSessionBridge";

jest.mock("@controllers/chatSessionBridge", () => ({
  retainChatSessionBridge: jest.fn(),
  releaseChatSessionBridge: jest.fn(),
  subscribeToChatSessionBridge: jest.fn(),
}));

const retainChatSessionBridgeMock = retainChatSessionBridge as jest.MockedFunction<typeof retainChatSessionBridge>;
const releaseChatSessionBridgeMock = releaseChatSessionBridge as jest.MockedFunction<typeof releaseChatSessionBridge>;
const subscribeToChatSessionBridgeMock = subscribeToChatSessionBridge as jest.MockedFunction<typeof subscribeToChatSessionBridge>;

describe("turnController", () => {
  beforeEach(() => {
    retainChatSessionBridgeMock.mockReset();
    releaseChatSessionBridgeMock.mockReset();
    subscribeToChatSessionBridgeMock.mockReset();
  });

  it("handles user messages once per unique message signature", () => {
    let handler: ((event: any) => void) | undefined;
    subscribeToChatSessionBridgeMock.mockImplementation((listener: any) => {
      handler = listener;
      return jest.fn();
    });

    const orchestrator = {
      handleUserText: jest.fn(),
      setActiveRole: jest.fn(),
    } as any;

    const controller = createTurnController();
    controller.attach(orchestrator);
    controller.start();

    handler?.({ type: "user-message", message: { text: "hello", key: "id:1" } });
    handler?.({ type: "user-message", message: { text: "hello", key: "id:1" } });
    expect(orchestrator.handleUserText).toHaveBeenCalledTimes(1);
    expect(orchestrator.handleUserText).toHaveBeenCalledWith("hello");

    handler?.({ type: "user-message", message: { text: "hello again", key: "id:2" } });
    expect(orchestrator.handleUserText).toHaveBeenCalledTimes(2);
    expect(orchestrator.handleUserText).toHaveBeenLastCalledWith("hello again");
  });

  it("applies drafted role on generation start and gates role application by epoch", () => {
    let handler: ((event: any) => void) | undefined;
    subscribeToChatSessionBridgeMock.mockImplementation((listener: any) => {
      handler = listener;
      return jest.fn();
    });

    const orchestrator = {
      handleUserText: jest.fn(),
      setActiveRole: jest.fn(),
    } as any;
    const controller = createTurnController();
    controller.attach(orchestrator);
    controller.start();

    handler?.({ type: "generation-started", generation: { speakerName: null, draftedSpeakerName: "Arin" } });
    expect(orchestrator.setActiveRole).toHaveBeenCalledWith("Arin");

    expect(controller.shouldApplyRole("dm" as any, 1)).toBe(true);
    expect(controller.shouldApplyRole("dm" as any, 1)).toBe(false);
    handler?.({ type: "generation-started", generation: { speakerName: null, draftedSpeakerName: "Arin" } });
    expect(controller.shouldApplyRole("dm" as any, 1)).toBe(true);
  });

  it("cleans up listeners on stop", () => {
    const off = jest.fn();
    subscribeToChatSessionBridgeMock.mockReturnValue(off);

    const controller = createTurnController();
    controller.attach({ handleUserText: jest.fn(), setActiveRole: jest.fn() } as any);
    controller.start();
    controller.stop();

    expect(off).toHaveBeenCalledTimes(1);
    expect(releaseChatSessionBridgeMock).toHaveBeenCalledTimes(1);
  });
});
