import { ImageRowQueue, postsRow, rowDropReason, type PendingImageRow } from "./imageRows";

type Chat = { id: string; messages: Array<{ mes: string; extra?: { media?: Array<{ url: string }> } }> };

const media = (url: string) => ({ url, type: "image" as const, title: "t", source: "generated" as const, image_director: {} });

const harness = (initial: Chat | null, saved: Record<string, string[]> = {}) => {
  const state: { chat: Chat | null; saved: Record<string, string[]>; live: Record<string, string[]> } = { chat: initial, saved, live: { ...saved } };
  const place = jest.fn(async (row: PendingImageRow) => {
    state.chat?.messages.push({ mes: row.caption, extra: { media: [{ url: row.media.url }] } });
    state.saved = { ...state.live };
    return { ok: true as const, placed: true as const };
  });
  const discard = jest.fn(async (path: string) => ({ ok: true as const, path }));
  const dropped = jest.fn();
  const record = {
    load: (chatId: string) => state.live[chatId] ?? [],
    write: jest.fn(async (chatId: string, paths: string[], persist: boolean) => {
      state.live[chatId] = paths;
      if (persist) state.saved = { ...state.live };
      return { ok: true as const, chatId };
    }),
  };
  const queue = new ImageRowQueue({ chat: () => state.chat, place, discard, record, dropped });
  return { state, place, discard, dropped, record, queue };
};
const reload = (chatState: Chat, saved: Record<string, string[]>) => harness(chatState, { ...saved });

const chat = (...texts: string[]): Chat => ({ id: "c1", messages: texts.map((mes) => ({ mes })) });

describe("v3.0 image rows never stay the last chat row", () => {
  it("posts a row only for message placement or an inline picture with no reply", () => {
    expect(postsRow("message", 3)).toBe(true);
    expect(postsRow("message", null)).toBe(true);
    expect(postsRow("inline", null)).toBe(true);
    expect(postsRow("inline", 3)).toBe(false);
    expect(postsRow("background", null)).toBe(false);
  });

  it("queues the row instead of posting it, so the reply stays last", async () => {
    const { state, place, queue } = harness(chat("opening", "reply"));
    expect(await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") })).toBe(true);
    expect(place).not.toHaveBeenCalled();
    expect(state.chat?.messages.at(-1)?.mes).toBe("reply");
    expect(queue.waiting).toBe(1);
  });

  it("posts on the next normal start, not on swipe, regenerate, continue, quiet, impersonate or a dry run", async () => {
    const { place, queue } = harness(chat("opening", "reply"));
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    for (const type of ["swipe", "regenerate", "continue", "quiet", "impersonate"]) await queue.post(type, false);
    await queue.post("normal", true);
    expect(place).not.toHaveBeenCalled();
    await queue.post("normal", false);
    expect(place).toHaveBeenCalledTimes(1);
    expect(place.mock.calls[0][0]).toEqual(expect.objectContaining({ chatId: "c1", anchor: 1, caption: "pic" }));
    expect(queue.waiting).toBe(0);
    await queue.post(undefined, false);
    expect(place).toHaveBeenCalledTimes(1);
  });

  it("drops and deletes the picture when Regenerate removed the reply it illustrates", async () => {
    const { state, place, discard, dropped, queue } = harness(chat("opening", "reply"));
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    state.chat?.messages.pop();
    await queue.post("normal", false);
    expect(place).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith("/a.png");
    expect(dropped.mock.calls[0][0]).toContain("removed before the next reply");
  });

  it("drops when a swipe replaced the reply text, and when another chat is open", async () => {
    const swiped = harness(chat("opening", "reply"));
    await swiped.queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    swiped.state.chat!.messages[1] = { mes: "another swipe" };
    await swiped.queue.post("normal", false);
    expect(swiped.place).not.toHaveBeenCalled();
    expect(swiped.dropped.mock.calls[0][0]).toContain("changed before the next reply");
    const moved = harness(chat("opening", "reply"));
    await moved.queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/b.png") });
    moved.state.chat = { id: "c2", messages: [] };
    await moved.queue.post("normal", false);
    expect(moved.place).not.toHaveBeenCalled();
    expect(moved.discard).toHaveBeenCalledWith("/b.png");
  });

  it("refuses to queue for a chat that is not open", async () => {
    const { queue } = harness(chat("opening"));
    expect(await queue.queue({ chatId: "other", target: null, targetText: null, caption: "pic", media: media("/a.png") })).toBe(false);
    expect(await harness(null).queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/a.png") })).toBe(false);
  });

  it("names a refused post and keeps the file, and clear deletes what waits", async () => {
    const { place, discard, dropped, queue } = harness(chat("opening", "reply"));
    place.mockResolvedValueOnce({ ok: false, reason: "The image was not saved to this chat." } as never);
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    await queue.post("normal", false);
    expect(discard).not.toHaveBeenCalled();
    expect(dropped.mock.calls[0][0]).toContain("not saved");
    await queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/c.png") });
    await queue.clear();
    expect(discard).toHaveBeenCalledWith("/c.png");
    expect(queue.waiting).toBe(0);
  });

  it("a row posted before the next reply leaves that reply last", async () => {
    const { state, queue } = harness(chat("opening", "reply"));
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    await queue.post("normal", false);
    state.chat?.messages.push({ mes: "next reply" });
    expect(state.chat?.messages.map((row) => row.mes)).toEqual(["opening", "reply", "pic", "next reply"]);
    expect(rowDropReason({ chatId: "c1", target: 1, targetText: "reply", anchor: 1, caption: "pic", media: media("/a.png") }, state.chat)).toBeNull();
  });

  it("a queued picture is saved in the chat's record, and a posted one leaves it in the same save", async () => {
    const { state, record, queue } = harness(chat("opening", "reply"));
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    expect(state.saved.c1).toEqual(["/a.png"]);
    await queue.post("normal", false);
    expect(state.saved.c1).toEqual([]);
    expect(record.write.mock.calls.at(-1)).toEqual(["c1", [], false]);
  });

  it("after a reload a picture that was queued but never posted is deleted", async () => {
    const before = harness(chat("opening", "reply"));
    await before.queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    const after = reload(chat("opening", "reply"), before.state.saved);
    const result = await after.queue.sweep("c1", () => true);
    expect(result).toEqual({ done: true, deleted: ["/a.png"], kept: [] });
    expect(after.discard).toHaveBeenCalledWith("/a.png");
    expect(after.state.saved.c1).toEqual([]);
  });

  it("a recorded picture that a posted message shows is kept, never deleted", async () => {
    const posted = chat("opening", "reply");
    posted.messages.push({ mes: "pic", extra: { media: [{ url: "/a.png" }] } });
    const after = reload(posted, { c1: ["/a.png", "/b.png"] });
    const result = await after.queue.sweep("c1", () => true);
    expect(result.kept).toEqual(["/a.png"]);
    expect(result.deleted).toEqual(["/b.png"]);
    expect(after.discard).not.toHaveBeenCalledWith("/a.png");
    expect(after.state.saved.c1).toEqual([]);
  });

  it("a sweep skips a picture still waiting in this page, another chat, a lapsed run, and keeps a path whose delete failed", async () => {
    const live = harness(chat("opening", "reply"));
    await live.queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    expect((await live.queue.sweep("c1", () => true)).deleted).toEqual([]);
    expect(live.discard).not.toHaveBeenCalled();
    const other = reload(chat("opening"), { c1: ["/a.png"] });
    other.state.chat = { id: "c2", messages: [] };
    expect((await other.queue.sweep("c1", () => true)).done).toBe(false);
    const lapsed = reload(chat("opening"), { c1: ["/a.png"] });
    expect((await lapsed.queue.sweep("c1", () => false)).done).toBe(false);
    expect(other.discard).not.toHaveBeenCalled();
    expect(lapsed.discard).not.toHaveBeenCalled();
    const failed = reload(chat("opening"), { c1: ["/a.png"] });
    failed.discard.mockResolvedValueOnce({ ok: false, reason: "ST did not remove the unused image (500)." } as never);
    expect(await failed.queue.sweep("c1", () => true)).toEqual({ done: true, deleted: [], kept: [] });
    expect(failed.state.saved.c1).toEqual(["/a.png"]);
  });

  it("a refused post stays recorded so the next load can check the chat, and drops forget what they deleted", async () => {
    const { state, place, queue } = harness(chat("opening", "reply"));
    place.mockResolvedValueOnce({ ok: false, reason: "The image was not saved to this chat." } as never);
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    await queue.post("normal", false);
    expect(state.saved.c1).toEqual(["/a.png"]);
    await queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/b.png") });
    state.chat?.messages.splice(1);
    await queue.post("normal", false);
    expect(state.live.c1).toEqual(["/a.png"]);
    await queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/c.png") });
    await queue.clear();
    expect(state.live.c1).toEqual(["/a.png"]);
  });
});
