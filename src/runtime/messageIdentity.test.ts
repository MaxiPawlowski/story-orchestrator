import { ChatIdentity, decodeDelete, describeDecode, messageKey, messageKeys } from "./messageIdentity";

interface Message { send_date: string; name: string; is_user: boolean; is_system?: boolean; swipe_id?: number; mes: string }

const message = (index: number, text = `line ${index}`, user = index % 2 === 0): Message => ({ send_date: `2026-09-24 10:${String(index).padStart(2, "0")}`, name: user ? "Player" : "Arin", is_user: user, mes: text });
const chatOf = (count: number): Message[] => Array.from({ length: count }, (_, index) => message(index));
const without = (chat: Message[], start: number, count = 1): Message[] => [...chat.slice(0, start), ...chat.slice(start + count)];

describe("v2.4 T1: decodeDelete", () => {
  it("decodes a middle delete to the removed message, not to the post-delete length", () => {
    const chat = chatOf(6);
    const after = without(chat, 2);
    expect(decodeDelete(messageKeys(chat), after, after.length)).toEqual({ start: 2, count: 1, basis: "exact" });
  });

  it("decodes a tail delete to the post-delete length, which is the removed message", () => {
    const chat = chatOf(4);
    const after = chat.slice(0, 3);
    expect(decodeDelete(messageKeys(chat), after, 3)).toEqual({ start: 3, count: 1, basis: "exact" });
  });

  it("decodes one event that removed a tool-call run with its reply (multi-count)", () => {
    const chat = chatOf(7);
    const after = without(chat, 2, 3);
    expect(decodeDelete(messageKeys(chat), after, after.length)).toEqual({ start: 2, count: 3, basis: "exact" });
  });

  it("decodes a /cut range event by event when the snapshot is refreshed after each delete", () => {
    const identity = new ChatIdentity();
    let chat = chatOf(6);
    identity.refresh("chat-a", chat);
    const starts: Array<{ start: number; basis: string }> = [];
    for (let step = 0; step < 3; step += 1) {
      chat = without(chat, 1);
      const decoded = identity.decode("chat-a", chat, chat.length);
      starts.push({ start: decoded.start, basis: decoded.basis });
    }
    expect(starts).toEqual([{ start: 1, basis: "exact" }, { start: 1, basis: "exact" }, { start: 1, basis: "exact" }]);
  });

  it("takes the earliest candidate when repeated messages allow more than one start", () => {
    const repeated = message(9, "Aye.", false);
    const chat = [message(0), { ...repeated }, { ...repeated }, message(3)];
    const after = [chat[0], chat[2], chat[3]];
    expect(decodeDelete(messageKeys(chat), after, 3)).toEqual({ start: 1, count: 1, basis: "ambiguous" });
  });

  it("falls back to the post-delete length when there is no snapshot, the chat did not shrink, or nothing lines up", () => {
    const chat = chatOf(4);
    expect(decodeDelete(null, chat.slice(0, 3), 3)).toEqual({ start: 3, count: 0, basis: "stale" });
    expect(decodeDelete(messageKeys(chat.slice(0, 3)), chat.slice(0, 3), 3)).toEqual({ start: 3, count: 0, basis: "stale" });
    const edited = [chat[0], { ...chat[2], mes: "rewritten without an event" }, chat[3]];
    expect(decodeDelete(messageKeys(chat), edited, 3)).toEqual({ start: 3, count: 1, basis: "stale" });
  });

  it("decodes exactly when a row was hidden between refreshes (is_system is not identity)", () => {
    const chat = chatOf(5);
    const before = messageKeys(chat);
    const hidden = chat.map((row, index) => (index === 3 ? { ...row, is_system: true } : row));
    const after = without(hidden, 1);
    expect(decodeDelete(before, after, after.length)).toEqual({ start: 1, count: 1, basis: "exact" });
  });

  it("does not key on swipe_id, which a lower swipe's deletion decrements with mes unchanged", () => {
    const row = message(1);
    expect(messageKey({ ...row, swipe_id: 3 })).toBe(messageKey({ ...row, swipe_id: 2 }));
    expect(messageKey({ ...row, mes: "another swipe" })).not.toBe(messageKey(row));
  });

  it("control: a snapshot from another chat is never used to decode this one", () => {
    const identity = new ChatIdentity();
    const chat = chatOf(4);
    identity.refresh("chat-a", chat);
    const after = without(chat, 1);
    expect(identity.decode("chat-b", after, after.length).basis).toBe("stale");
  });

  it("journals every decode that is not exact, and nothing for an exact one", () => {
    expect(describeDecode({ start: 2, count: 1, basis: "exact" }, 5)).toBeNull();
    expect(describeDecode({ start: 1, count: 1, basis: "ambiguous" }, 3)?.summary).toBe("message delete decoded ambiguously");
    expect(describeDecode({ start: 3, count: 0, basis: "stale" }, 3)?.note).toContain("post-delete length 3");
  });

  it("re-keys a message whose text changed in place", () => {
    const row = message(2);
    const first = messageKey(row);
    row.mes = "edited";
    expect(messageKey(row)).not.toBe(first);
  });
});
