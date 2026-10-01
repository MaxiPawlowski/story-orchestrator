import { createModelCallVia } from "./modelCallCore";
import { acceptModelCall, rollbackModelCalls, type ModelCallRecord } from "./modelCallLog";

const row = (extra: Partial<ModelCallRecord> = {}): ModelCallRecord => ({
  at: "t", role: "read", pass: "read", route: "p", result: "ok", ms: 1, samplers: "applied", ...extra,
} as ModelCallRecord);

describe("CR-E14: a model call is logged against the chat it was asked from", () => {
  it("stamps the chat and the newest message when the call starts, not when it answers", async () => {
    const opened = { chatId: "chat-a", messageId: 4 };
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => { release = resolve; });
    const records: ModelCallRecord[] = [];
    const call = createModelCallVia(async () => { await answered; return { text: "ok" } as never; }, {
      settings: () => ({ profileId: "p" }) as never,
      exists: () => true,
      planted: false,
      record: (record) => records.push(record),
      stamp: () => ({ ...opened }),
    });
    const pending = call("prompt", { role: "read", pass: "read" });
    opened.chatId = "chat-b";
    opened.messageId = 9;
    release();
    await pending;
    expect(records).toEqual([expect.objectContaining({ chatId: "chat-a", messageId: 4, route: "p" })]);
  });

  it("a record stamped for another chat is dropped; an unstamped one (the live suite) is kept", () => {
    const ring = [row({ chatId: "chat-a", messageId: 1 })];
    expect(acceptModelCall(ring, row({ chatId: "chat-b", messageId: 2 }), "chat-a")).toBe(ring);
    expect(acceptModelCall(ring, row({ chatId: "chat-a", messageId: 2 }), "chat-a")).toHaveLength(2);
    expect(acceptModelCall(ring, row(), "chat-a")).toHaveLength(2);
  });

  it("a rollback forgets the calls asked at or after the edited message", () => {
    const ring = [row({ chatId: "a", messageId: 2 }), row({ chatId: "a", messageId: 5 }), row()];
    expect(rollbackModelCalls(ring, 5).map((record) => record.messageId)).toEqual([2, undefined]);
  });
});
