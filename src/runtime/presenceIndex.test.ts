import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { composeChapterCards } from "./chapterCards";
import {
  continueRows, dropPlay, groupPlays, lastPlayedText, PLAYS_LIMIT, playRow, playRowFromBlob, sanitizePlays, upsertPlay, type PlayRow, type PlaysIndex,
} from "./playsIndex";
import { BACKFILL_CAP, planBackfill, runBackfill, sanitizeBackfill, type BackfillState, type BackfillTarget } from "./playsBackfill";

const chapters = parseStoryV2OrThrow(JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/chapters-mini.story.json"), "utf8")));
const NOW = "2026-10-03T10:00:00.000Z";

const row = (overrides: Partial<PlayRow> = {}): PlayRow => ({
  storyId: "sun-ruins", title: "Sun Ruins", groupId: "g1", checkpointName: "The Gate", kind: "story", updatedAt: NOW, ...overrides,
});

describe("v2.7 06 A: the plays index", () => {
  it("writes a row only when a field changes, and stamps it when it does", () => {
    const first = upsertPlay({}, "chat-1", { storyId: "s", title: "S", groupId: "g", checkpointName: "A", kind: "story" }, NOW);
    expect(first.changed).toBe(true);
    const same = upsertPlay(first.plays, "chat-1", { storyId: "s", title: "S", groupId: "g", checkpointName: "A", kind: "story" }, "2026-10-04T00:00:00.000Z");
    expect(same).toEqual({ plays: first.plays, changed: false });
    const moved = upsertPlay(first.plays, "chat-1", { storyId: "s", title: "S", groupId: "g", checkpointName: "B", kind: "story" }, "2026-10-04T00:00:00.000Z");
    expect(moved.plays["chat-1"]).toMatchObject({ checkpointName: "B", updatedAt: "2026-10-04T00:00:00.000Z" });
  });

  it(`caps at ${PLAYS_LIMIT} rows, dropping the oldest updatedAt`, () => {
    const plays: PlaysIndex = {};
    for (let index = 0; index < PLAYS_LIMIT; index += 1) plays[`chat-${index}`] = row({ updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() });
    const next = upsertPlay(plays, "chat-new", { storyId: "s", title: "S", groupId: "g", checkpointName: null, kind: "story" }, NOW);
    expect(Object.keys(next.plays)).toHaveLength(PLAYS_LIMIT);
    expect(next.plays["chat-0"]).toBeUndefined();
    expect(next.plays["chat-new"]).toBeDefined();
  });

  it("F14: removing a story from the library keeps the rows of chats that still pin it", () => {
    const plays = { "chat-1": row(), "chat-2": row({ storyId: "other", title: "Other" }) };
    const rows = continueRows(plays, (storyId) => (storyId === "sun-ruins" ? undefined : {}), true);
    expect(rows.map((entry) => entry.chatId).sort()).toEqual(["chat-1", "chat-2"]);
  });

  it("drops a deleted chat's row, and a story cleared in its chat", () => {
    expect(dropPlay({ "chat-1": row() }, "chat-1")).toEqual({ plays: {}, changed: true });
    expect(dropPlay({ "chat-1": row() }, "chat-9").changed).toBe(false);
  });

  it("holds player copy only: the checkpoint's player name and the chapter's player title, never an id", () => {
    const view = playRow({ story: chapters, storyId: chapters.id ?? "chapters-mini", activeCheckpointId: "walls", groupId: "g1" });
    expect(view).toEqual({
      storyId: chapters.id, title: chapters.title, groupId: "g1", checkpointName: chapters.checkpointById.walls.player_name ?? null, chapterTitle: "The Siege", kind: "saga",
    });
    expect(JSON.stringify(view)).not.toMatch(/"walls"|"siege"/);
  });

  it("sanitizes a stored index and refuses rows without their identity", () => {
    expect(sanitizePlays({ "chat-1": row(), "chat-2": { title: "no story" }, "": row(), "chat-3": { ...row(), updatedAt: "yesterday" } })).toEqual({ "chat-1": row() });
    expect(sanitizePlays("nope")).toEqual({});
  });

  it("derives a group's view from its most recently played chat, and counts a bound group with no rows", () => {
    const groups = groupPlays({ a: row({ updatedAt: "2026-10-01T00:00:00.000Z" }), b: row({ title: "Newer", updatedAt: "2026-10-02T00:00:00.000Z" }) }, { g2: "x" });
    expect(groups.get("g1")).toMatchObject({ chatId: "b", row: { title: "Newer" } });
    expect(groups.get("g2")).toEqual({ groupId: "g2", chatId: null, row: null, bound: true });
  });

  it("Continue lists newest first and honours the story's continue_list toggle and the install veto", () => {
    const plays = { a: row({ updatedAt: "2026-10-01T00:00:00.000Z" }), b: row({ storyId: "hidden", updatedAt: "2026-10-02T00:00:00.000Z" }), c: row({ updatedAt: "2026-10-03T00:00:00.000Z" }) };
    const displayOf = (storyId: string) => (storyId === "hidden" ? { continue_list: false } : null);
    expect(continueRows(plays, displayOf, true).map((entry) => entry.chatId)).toEqual(["c", "a"]);
    expect(continueRows(plays, displayOf, false)).toEqual([]);
  });

  it("reads a row out of a stored chat blob, for backfill", () => {
    const blob = {
      version: 6, chatId: "chat-1", selectedStoryId: "chapters-mini",
      stories: { "chapters-mini": { pinnedStory: JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/chapters-mini.story.json"), "utf8")), engineState: { activeCheckpointId: "fire" }, extras: { updatedAt: "2026-09-30T00:00:00.000Z" } } },
    };
    expect(playRowFromBlob(blob, "chat-1", "g1", NOW)).toMatchObject({ storyId: "chapters-mini", title: chapters.title, chapterTitle: "Night Camp", kind: "saga", updatedAt: "2026-09-30T00:00:00.000Z" });
    expect(playRowFromBlob(blob, "chat-2", "g1", NOW)).toBeNull();
    expect(playRowFromBlob({ ...blob, selectedStoryId: null }, "chat-1", "g1", NOW)).toBeNull();
  });

  it("words last played in whole units", () => {
    expect(lastPlayedText(NOW, Date.parse(NOW) + 2 * 86400000)).toBe("2 days ago");
    expect(lastPlayedText(NOW, Date.parse(NOW) + 30000)).toBe("just now");
  });
});

describe("v2.7 06 A: backfill, one idle background pass", () => {
  const groups = [{ id: "g1", chats: ["a", "b", "c"] }, { id: "g2", chats: ["d"] }];

  const harness = (state: BackfillState, options: { generatingFor?: number; killAfter?: number } = {}) => {
    const reads: string[] = [];
    const writes: string[] = [];
    const saved: BackfillState[] = [];
    const waits: number[] = [];
    let generating = options.generatingFor ?? 0;
    return {
      reads, writes, saved, waits,
      run: () => runBackfill(state, {
        alive: () => options.killAfter === undefined || reads.length < options.killAfter,
        generating: () => generating-- > 0,
        read: async (target: BackfillTarget) => { reads.push(target.chatId); return target.chatId === "c" ? null : row(); },
        write: (chatId) => { writes.push(chatId); },
        save: (next) => { saved.push(next); },
        wait: async (ms) => { waits.push(ms); },
      }),
    };
  };

  it("plans the group chats not yet indexed, capped", () => {
    expect(planBackfill(groups, new Set(["b"])).pending.map((target) => target.chatId)).toEqual(["c", "a", "d"]);
    const many = [{ id: "g", chats: Array.from({ length: BACKFILL_CAP + 50 }, (_, index) => `chat-${index}`) }];
    expect(planBackfill(many, new Set()).pending).toHaveLength(BACKFILL_CAP);
    expect(planBackfill([], new Set()).done).toBe(true);
  });

  it("reads one chat at a time with a throttle between reads, writes what it found and finishes done", async () => {
    const run = harness(planBackfill(groups, new Set()));
    const final = await run.run();
    expect(run.reads).toEqual(["c", "b", "a", "d"]);
    expect(run.writes).toEqual(["b", "a", "d"]);
    expect(final).toEqual({ done: true, pending: [], scanned: 4 });
    expect(run.waits.length).toBe(3);
  });

  it("pauses while a generation runs, without reading", async () => {
    const run = harness(planBackfill(groups, new Set()), { generatingFor: 3 });
    await run.run();
    expect(run.waits.slice(0, 3)).toHaveLength(3);
    expect(run.reads).toHaveLength(4);
  });

  it("resumes from the saved state after it was stopped, and never repeats once done", async () => {
    const first = harness(planBackfill(groups, new Set()), { killAfter: 2 });
    const stopped = await first.run();
    expect(stopped.done).toBe(false);
    const resumed = sanitizeBackfill(JSON.parse(JSON.stringify(first.saved[first.saved.length - 1])));
    const second = harness(resumed as BackfillState);
    await second.run();
    expect({ first: first.reads, second: second.reads }).toEqual({ first: ["c", "b"], second: ["b", "a", "d"] });
    expect(first.writes).toEqual([]);
    const third = harness({ done: true, pending: [], scanned: 4 });
    await third.run();
    expect(third.reads).toEqual([]);
  });
});

describe("v2.7 06 C3: chapter title cards", () => {
  const engine = () => {
    const instance = new StoryEngine({ now: () => 0 });
    instance.loadStory(chapters);
    return instance;
  };

  it("opens a card under the message that entered each new chapter, and one for the opening chapter", () => {
    const instance = engine();
    for (let step = 1; step <= 4; step += 1) {
      instance.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: step, to: step }, deltas: [{ q: "step", v: step, source: "extractor" }] });
      instance.commitBoundary({ lastMessageId: step * 2, chatLength: step * 2 + 1 });
    }
    const cards = composeChapterCards(chapters, instance.stateLog);
    expect(cards.map((entry) => [entry.messageId, entry.title, entry.number, entry.interlude])).toEqual([
      [0, "Arrival", 1, false], [4, "Night Camp", null, true], [6, "The Siege", 2, false],
    ]);
    expect(cards[2].final).toBe(true);
  });

  it("a rollback past a chapter entry takes its card with it", () => {
    const instance = engine();
    for (let step = 1; step <= 3; step += 1) {
      instance.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: step, to: step }, deltas: [{ q: "step", v: step, source: "extractor" }] });
      instance.commitBoundary({ lastMessageId: step * 2, chatLength: step * 2 + 1 });
    }
    instance.rollbackTo(1);
    expect(composeChapterCards(chapters, instance.stateLog).map((entry) => entry.title)).toEqual(["Arrival"]);
  });

  it("a story without chapters has no cards", () => {
    const plain = { ...chapters, chapters: undefined };
    expect(composeChapterCards(plain, engine().stateLog)).toEqual([]);
  });
});
