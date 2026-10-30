import type { BoundaryLogEntry } from "@engine/index";
import {
  HistoryNoteCache, NOTE_ECHO_STRIPPED, applyHistoryNotes, historyNoteEchoPass, historyNotesPass, liveIds, noteBetween, noteShape, stripEchoedNote,
  type HistoryNoteDeps, type NoteRow,
} from "./historyNotes";
import { sanitizeGlobalSettings } from "./settingsModel";
import { groundingStory, playGrounding, type GroundingStep } from "../../test/support/groundingStory";

const plain = (text: string) => text;
const story = groundingStory();

const STEPS: GroundingStep[] = [
  { set: { location: "harbor" }, messageId: 1 },
  { messageId: 3 },
  { set: { story_time: 2 }, messageId: 5 },
  { messageId: 7 },
  { set: { location: "market" }, messageId: 9 },
  { set: { location: "crypt" }, messageId: 11 },
];

const live = (count: number) => Array.from({ length: count }, (_, index) => ({ mes: `message ${index}`, is_user: index % 2 === 0, extra: {} as Record<string, unknown> }));

const copyOf = (rows: ReturnType<typeof live>): NoteRow[] => rows.map((row) => ({ ...row }));

describe("v3.0 34 S1 history notes: what a note says", () => {
  test("the switch is off by default (prompt layout waits for its blind rating)", () => {
    expect(sanitizeGlobalSettings(undefined).memory.historyNotes).toBe(false);
    expect(sanitizeGlobalSettings({ memory: { historyNotes: true } }).memory.historyNotes).toBe(true);
  });

  test("only a scene break or a time step carries a note, on the first message after its boundary", () => {
    const engine = playGrounding(story, STEPS);
    const notes = new HistoryNoteCache().read("chat", story, engine.stateLog, plain);
    expect([...notes]).toEqual([
      [2, "[Day 1, morning, The harbor]"],
      [6, "[Day 1, evening, The harbor]"],
      [10, "[Day 1, evening, market]"],
    ]);
  });

  test("an unknown place never appears; a hidden scene with no time step gets no note at all", () => {
    expect(noteBetween(story, { location: "market" }, { location: "crypt" }, plain)).toBeNull();
    expect(noteBetween(story, { location: "market", story_time: 1 }, { location: "crypt", story_time: 2 }, plain)).toBe("[Day 1, evening]");
    expect(noteBetween(story, { location: "market" }, { location: "harbor", codex_l_harbor: 3 }, (text) => text.replace("harbor", "")))
      .toBeNull();
  });

  test("a story with neither a clock nor a place change writes nothing", () => {
    expect(noteBetween(story, { location: "harbor" }, { location: "harbor" }, plain)).toBeNull();
  });
});

describe("v3.0 34 S1 history notes: a note is fixed once written", () => {
  test("a later disclosure, a delayed read and a resting-filter change never rewrite an old note", () => {
    const engine = playGrounding(story, STEPS.slice(0, 5));
    const cache = new HistoryNoteCache();
    const before = cache.read("chat", story, engine.stateLog, plain);
    engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "found_crypt", v: true, source: "extractor", writer: "manual" }] });
    engine.commitBoundary({ lastMessageId: 13, chatLength: 14 });
    const after = cache.read("chat", story, engine.stateLog, () => "");
    for (const [id, text] of before) expect(after.get(id)).toBe(text);
  });

  test("a rolled-back boundary takes its note with it, and replay writes it again", () => {
    const engine = playGrounding(story, STEPS.slice(0, 5));
    const cache = new HistoryNoteCache();
    expect(cache.read("chat", story, engine.stateLog, plain).has(10)).toBe(true);
    const logged = engine.stateLog.find((entry) => entry.context.lastMessageId === 9) as BoundaryLogEntry;
    expect(engine.rollbackTo(logged.boundary - 1).ok).toBe(true);
    expect(cache.read("chat", story, engine.stateLog, plain).has(10)).toBe(false);
    engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: "location", v: "market", source: "extractor", writer: "manual" }] });
    engine.commitBoundary({ lastMessageId: 9, chatLength: 10 });
    expect(cache.read("chat", story, engine.stateLog, plain).get(10)).toBe("[Day 1, evening, market]");
  });

  test("past the 200-entry floor the cached note stays as written; with no cache and no log a message gets none", () => {
    const steps: GroundingStep[] = [{ set: { location: "harbor" }, messageId: 1 }, ...Array.from({ length: 205 }, (_, index) => ({ messageId: 3 + index * 2 }))];
    const engine = playGrounding(story, steps.slice(0, 3));
    const cache = new HistoryNoteCache();
    expect(cache.read("chat", story, engine.stateLog, plain).get(2)).toBe("[Day 1, morning, The harbor]");
    for (const step of steps.slice(3)) engine.commitBoundary({ lastMessageId: step.messageId, chatLength: step.messageId + 1 });
    expect(engine.stateLog.length).toBe(200);
    expect(engine.stateLog.some((entry) => entry.context.lastMessageId === 1)).toBe(false);
    expect(cache.read("chat", story, engine.stateLog, plain).get(2)).toBe("[Day 1, morning, The harbor]");
    expect(new HistoryNoteCache().read("chat", story, engine.stateLog, plain).has(2)).toBe(false);
  });

  test("another chat starts from nothing", () => {
    const engine = playGrounding(story, STEPS);
    const cache = new HistoryNoteCache();
    cache.read("chat", story, engine.stateLog, plain);
    expect(cache.read("other", story, [], plain).size).toBe(0);
  });
});

describe("v3.0 34 S1 history notes: the prompt copy", () => {
  const engine = playGrounding(story, STEPS);
  const deps = (patch: Partial<HistoryNoteDeps> = {}, rows = live(12)): HistoryNoteDeps => ({
    enabled: () => true, chatId: () => "chat", ownedChat: () => "chat", story: () => story, log: () => engine.stateLog, live: () => rows, resting: () => plain, ...patch,
  });

  test("notes go on ST's copy only, once, even when the interceptor runs twice", () => {
    const rows = live(12);
    const pass = historyNotesPass(deps({}, rows));
    const copy = copyOf(rows);
    expect(pass.apply(copy, "normal", false)).toBe(3);
    expect(pass.apply(copy, "normal", false)).toBe(0);
    expect(copy[2].mes).toBe("[Day 1, morning, The harbor]\nmessage 2");
    expect(copy.filter((row) => String(row.mes).startsWith("[")).length).toBe(3);
    expect(rows.every((row, index) => row.mes === `message ${index}`)).toBe(true);
  });

  test("floor D: across 40 cuts notes land only on scene and time-step messages", () => {
    const rows = live(12);
    const pass = historyNotesPass(deps({}, rows));
    let wrong = 0;
    for (let cut = 1; cut <= 40; cut += 1) {
      const copy = copyOf(rows).slice(0, 1 + (cut % 12));
      pass.apply(copy, "normal", false);
      wrong += copy.filter((row, index) => String(row.mes).startsWith("[") !== [2, 6, 10].includes(index)).length;
    }
    expect(wrong).toBe(0);
  });

  test("quiet, impersonate, another chat or the switch off add nothing; a folded row has no id and no note", () => {
    const rows = live(12);
    for (const [patch, withheld] of [[{}, true], [{ ownedChat: () => "other" }, false], [{ enabled: () => false }, false]] as const) {
      const copy = copyOf(rows);
      expect(historyNotesPass(deps(patch, rows)).apply(copy, "normal", withheld)).toBe(0);
    }
    const folded = copyOf(rows).map((row) => ({ ...row, extra: {} }));
    expect(applyHistoryNotes(folded, liveIds(rows), new Map([[2, "[x]"]]), false)).toBe(0);
  });

  test("a continue leaves the message being continued alone", () => {
    const rows = live(11);
    const copy = copyOf(rows);
    expect(applyHistoryNotes(copy, liveIds(rows), new Map([[10, "[note]"]]), true)).toBe(0);
    expect(applyHistoryNotes(copy, liveIds(rows), new Map([[10, "[note]"]]), false)).toBe(1);
  });
});

describe("v3.0 34 S1 history notes: an echoed note is taken out", () => {
  const shape = noteShape(story);

  test("a reply opening with a known note or the note shape loses only the note", () => {
    expect(stripEchoedNote("[Day 2, evening, the docks]\nShe waves.", [], shape)).toBe("She waves.");
    expect(stripEchoedNote("  [Day 1, morning, The harbor] She waves.", ["[Day 1, morning, The harbor]"], null)).toBe("She waves.");
    expect(stripEchoedNote("[She waves.] Hello.", [], shape)).toBeNull();
    expect(stripEchoedNote("[Day 2, evening]", [], shape)).toBeNull();
    expect(stripEchoedNote("No note here.", ["[Day 1, morning, The harbor]"], shape)).toBeNull();
  });

  test("the repair writes the visible text only and keeps the reasoning", () => {
    const engine = playGrounding(story, STEPS);
    const writes: Array<{ id: number; mes: string; reasoning: string }> = [];
    const journal: string[] = [];
    const base: HistoryNoteDeps = { enabled: () => true, chatId: () => "chat", ownedChat: () => "chat", story: () => story, log: () => engine.stateLog, live: () => [], resting: () => plain };
    const pass = historyNoteEchoPass({
      ...base,
      read: () => ({ mes: "[Day 1, evening, market]\nWren nods.", reasoning: "kept thought", isUser: false, name: "Wren" }),
      write: (id, text) => { writes.push({ id, ...text }); return { ok: true }; },
      journal: (summary) => journal.push(summary),
    }, new HistoryNoteCache());
    pass(12);
    expect(writes).toEqual([{ id: 12, mes: "Wren nods.", reasoning: "kept thought" }]);
    expect(journal).toEqual([NOTE_ECHO_STRIPPED]);
    const off = historyNoteEchoPass({ ...base, enabled: () => false, read: () => ({ mes: "[Day 1, evening, market]\nx", reasoning: "", isUser: false, name: "Wren" }), write: () => { throw new Error("no write"); }, journal: () => {} }, new HistoryNoteCache());
    expect(() => off(12)).not.toThrow();
  });
});
