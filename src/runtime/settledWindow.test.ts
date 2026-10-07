import { windowOf } from "@extraction/chatRows";
import { settledLastIndex, settledWindowAccess, swipePending } from "./settledWindow";

const DISCARDED = "The innkeeper hands over the cellar key and points at the trapdoor.";

const base = () => [
  { name: "Mara", is_user: false, mes: "Welcome to the inn.", gen_started: "t0", gen_finished: "t1" },
  { name: "Max", is_user: true, mes: "Where is the cellar?" },
];

const swiping = () => [...base(), { name: "Mara", is_user: false, mes: DISCARDED, swipes: [DISCARDED], swipe_id: 1, swipe_info: [{}], extra: {} }];
const settledSwipe = () => [...base(), { name: "Mara", is_user: false, mes: "She shrugs.", swipes: [DISCARDED, "She shrugs."], swipe_id: 1, gen_started: "t2", gen_finished: "t3" }];

const access = (chat: unknown[], size = 8) => settledWindowAccess(() => chat, (from, to) => windowOf(chat, from, to), size);

describe("Sol finding 10: a swipe regeneration reads the chat without the reply it discards", () => {
  it("reads a new swipe slot ST has not filled yet as pending (script.js:10393-10401, saveReply 6671-6673)", () => {
    expect(swipePending(swiping()[2])).toBe(true);
    expect(swipePending(settledSwipe()[2])).toBe(false);
    expect(swipePending({ mes: "plain" })).toBe(false);
    expect(settledLastIndex(swiping())).toBe(1);
    expect(settledLastIndex(settledSwipe())).toBe(2);
    expect(settledLastIndex([])).toBe(-1);
  });

  it("the window during a swipe equals the window of the same chat with that reply removed, and never holds its text", () => {
    const during = access(swiping());
    const equivalent = access(base());
    expect(during.recentWindow()).toEqual(equivalent.recentWindow());
    expect(during.recentTurns()).toEqual(equivalent.recentTurns());
    expect(JSON.stringify([during.recentWindow(), during.recentTurns()])).not.toContain("cellar key");
  });

  it("keeps the window size: the oldest message is not dropped to make room for the discarded one", () => {
    const long = [...Array.from({ length: 6 }, (_, index) => ({ name: "Mara", is_user: false, mes: `line ${index}` })), ...swiping()];
    expect(access(long, 4).recentWindow().map((line) => line.text)).toEqual(["line 4", "line 5", "Welcome to the inn.", "Where is the cellar?"]);
  });

  it("control: once the new swipe lands, the window holds it; the message id the rest of the runtime keys on never moves", () => {
    expect(access(settledSwipe()).recentWindow().at(-1)).toEqual({ speaker: "Mara", text: "She shrugs." });
    expect(access(swiping()).chatLastId()).toBe(2);
  });
});
