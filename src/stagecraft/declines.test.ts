import { DECLINE_MEMORY_BOUNDARIES, DECLINE_MEMORY_LIMIT, forgetDecline, mergeDeclined, rememberDecline, standingDeclines } from "./declines";
import type { CuratorEntryView, CuratorOpRecord, WiCuratorOp } from "./types";

const meta: CuratorEntryView = { lorebook: "Adolion Chronicle", comment: "Chronicle - About this book", keys: ["adolion-chronicle-about"], content: "[This book holds what THIS campaign has changed.]", disabled: true, uid: 0 };
const enable: WiCuratorOp = { kind: "enable", lorebook: meta.lorebook, comment: meta.comment, uid: 0 };
const record = (op: WiCuratorOp, before = meta): CuratorOpRecord => ({ op, status: "pending", before: { content: before.content, disabled: before.disabled } });

describe("curator decline memory", () => {
  it("stands while the entry is unchanged and inside the window", () => {
    const declines = rememberDecline([], record(enable), 4);
    expect(standingDeclines(declines, [meta], 4 + DECLINE_MEMORY_BOUNDARIES - 1)).toEqual([enable]);
    expect(standingDeclines(declines, [{ ...meta, content: ` ${meta.content}\n` }], 8)).toEqual([enable]);
  });

  it("lapses when the entry's text or switch changes, when it is gone, or after the window", () => {
    const declines = rememberDecline([], record(enable), 4);
    expect(standingDeclines(declines, [{ ...meta, content: "rewritten" }], 8)).toEqual([]);
    expect(standingDeclines(declines, [{ ...meta, disabled: false }], 8)).toEqual([]);
    expect(standingDeclines(declines, [], 8)).toEqual([]);
    expect(standingDeclines(declines, [meta], 4 + DECLINE_MEMORY_BOUNDARIES)).toEqual([]);
  });

  it("keeps one row per op, refreshes its boundary, caps the list and ignores warden notes", () => {
    const once = rememberDecline([], record(enable), 4);
    expect(rememberDecline(once, record(enable), 9)).toEqual([{ ...once[0], boundary: 9 }]);
    const many = Array.from({ length: DECLINE_MEMORY_LIMIT + 3 }, (_, index) => ({ ...enable, comment: `Entry ${index}` }))
      .reduce((list, op) => rememberDecline(list, record(op), 4), [] as ReturnType<typeof rememberDecline>);
    expect(many).toHaveLength(DECLINE_MEMORY_LIMIT);
    expect(many[0].op.comment).toBe("Entry 3");
    const note: CuratorOpRecord = { op: { kind: "note", text: "x", facts: [], replyMessageId: 1 }, status: "pending" };
    expect(rememberDecline(once, note, 5)).toBe(once);
  });

  it("forgets on accept and merges with the ring's declines without duplicates", () => {
    const declines = rememberDecline([], record(enable), 4);
    expect(forgetDecline(declines, enable)).toEqual([]);
    expect(forgetDecline(declines, { ...enable, kind: "disable" })).toBe(declines);
    expect(mergeDeclined([enable], [{ ...enable, comment: meta.comment.toUpperCase() }], [{ ...enable, kind: "disable" }])).toEqual([enable, { ...enable, kind: "disable" }]);
  });
});
