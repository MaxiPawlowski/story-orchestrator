import { ImageRowQueue, postsRow, rowDropReason, type PendingImageRow } from "./imageRows";

type Chat = { id: string; messages: Array<{ mes: string }> };

const media = (url: string) => ({ url, type: "image" as const, title: "t", source: "generated" as const, image_director: {} });

const harness = (initial: Chat | null) => {
  const state: { chat: Chat | null } = { chat: initial };
  const place = jest.fn(async (row: PendingImageRow) => {
    state.chat?.messages.push({ mes: row.caption });
    return { ok: true as const, placed: true as const };
  });
  const discard = jest.fn(async () => undefined);
  const dropped = jest.fn();
  const queue = new ImageRowQueue({ chat: () => state.chat, place, discard, dropped });
  return { state, place, discard, dropped, queue };
};

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
    expect(queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") })).toBe(true);
    expect(place).not.toHaveBeenCalled();
    expect(state.chat?.messages.at(-1)?.mes).toBe("reply");
    expect(queue.waiting).toBe(1);
  });

  it("posts on the next normal start, not on swipe, regenerate, continue, quiet, impersonate or a dry run", async () => {
    const { place, queue } = harness(chat("opening", "reply"));
    queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
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
    queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    state.chat?.messages.pop();
    await queue.post("normal", false);
    expect(place).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith("/a.png");
    expect(dropped.mock.calls[0][0]).toContain("removed before the next reply");
  });

  it("drops when a swipe replaced the reply text, and when another chat is open", async () => {
    const swiped = harness(chat("opening", "reply"));
    swiped.queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    swiped.state.chat!.messages[1] = { mes: "another swipe" };
    await swiped.queue.post("normal", false);
    expect(swiped.place).not.toHaveBeenCalled();
    expect(swiped.dropped.mock.calls[0][0]).toContain("changed before the next reply");
    const moved = harness(chat("opening", "reply"));
    moved.queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/b.png") });
    moved.state.chat = { id: "c2", messages: [] };
    await moved.queue.post("normal", false);
    expect(moved.place).not.toHaveBeenCalled();
    expect(moved.discard).toHaveBeenCalledWith("/b.png");
  });

  it("refuses to queue for a chat that is not open", () => {
    const { queue } = harness(chat("opening"));
    expect(queue.queue({ chatId: "other", target: null, targetText: null, caption: "pic", media: media("/a.png") })).toBe(false);
    expect(harness(null).queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/a.png") })).toBe(false);
  });

  it("names a refused post and keeps the file, and clear deletes what waits", async () => {
    const { place, discard, dropped, queue } = harness(chat("opening", "reply"));
    place.mockResolvedValueOnce({ ok: false, reason: "The image was not saved to this chat." } as never);
    queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    await queue.post("normal", false);
    expect(discard).not.toHaveBeenCalled();
    expect(dropped.mock.calls[0][0]).toContain("not saved");
    queue.queue({ chatId: "c1", target: null, targetText: null, caption: "pic", media: media("/c.png") });
    await queue.clear();
    expect(discard).toHaveBeenCalledWith("/c.png");
    expect(queue.waiting).toBe(0);
  });

  it("a row posted before the next reply leaves that reply last", async () => {
    const { state, queue } = harness(chat("opening", "reply"));
    queue.queue({ chatId: "c1", target: 1, targetText: "reply", caption: "pic", media: media("/a.png") });
    await queue.post("normal", false);
    state.chat?.messages.push({ mes: "next reply" });
    expect(state.chat?.messages.map((row) => row.mes)).toEqual(["opening", "reply", "pic", "next reply"]);
    expect(rowDropReason({ chatId: "c1", target: 1, targetText: "reply", anchor: 1, caption: "pic", media: media("/a.png") }, state.chat)).toBeNull();
  });
});
