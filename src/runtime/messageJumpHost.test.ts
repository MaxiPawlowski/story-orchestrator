const mockHost = { chat: [{ mes: "a" }, { mes: "b" }, { mes: "c" }] as unknown[], sent: [] as number[], accepted: true };

jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chat: mockHost.chat }),
  sendChatJump: async (id: number) => {
    mockHost.sent.push(id);
    return mockHost.accepted ? { ok: true, id } : { ok: false, reason: "SillyTavern did not take the /chat-jump command" };
  },
}));

import { jumpToMessage } from "./messageJumpHost";

describe("jumping to a cited message (v2.4 plan 08 T19d)", () => {
  beforeEach(() => {
    mockHost.sent = [];
    mockHost.accepted = true;
  });

  it("sends /chat-jump for a message the chat holds, and says only that it was sent", async () => {
    await expect(jumpToMessage(1, null)).resolves.toEqual({ ok: true, id: 1, changed: false, bestEffort: true });
    expect(mockHost.sent).toEqual([1]);
  });

  it("refuses before sending anything when the message is gone or legacy, because ST's answer is not evidence", async () => {
    await expect(jumpToMessage(3, null)).resolves.toMatchObject({ ok: false });
    await expect(jumpToMessage(-1, null)).resolves.toMatchObject({ ok: false });
    expect(mockHost.sent).toEqual([]);
  });

  it("reads the live chat length at the click, not a stale index", async () => {
    await expect(jumpToMessage(2, { chatLength: 99, known: null, changed: [] })).resolves.toMatchObject({ ok: true, id: 2 });
    await expect(jumpToMessage(50, { chatLength: 99, known: null, changed: [] })).resolves.toMatchObject({ ok: false });
  });

  it("passes on a command ST did not take as a failure", async () => {
    mockHost.accepted = false;
    await expect(jumpToMessage(0, null)).resolves.toEqual({ ok: false, reason: "SillyTavern did not take the /chat-jump command" });
  });
});
