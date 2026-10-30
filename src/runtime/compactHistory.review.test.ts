jest.mock("@services/STAPI", () => ({ registerHostMacro: jest.fn(), unregisterHostMacro: jest.fn(), getContext: () => ({ chat: [] }) }));

import { foldRange, foldRows, type FoldRow } from "./chapterKit";
import { compact, compactRows, compactionCeiling, type CompactRow } from "./compactHistory";
import { DEFAULT_CHAPTER_SETTINGS } from "./chapters";
import type { ChapterPort } from "./chapterPort";
import type { ChapterRecord } from "@memory/types";

const IGNORE = Symbol.for("ignore");
const isIgnored = (row: CompactRow) => Boolean((row.extra as Record<symbol, unknown>)[IGNORE]);

const setOpenAIMessages = (chat: CompactRow[]): Array<{ content: string } | undefined> => {
  const messages: Array<{ content: string } | undefined> = [];
  let j = 0;
  for (let i = chat.length - 1; i >= 0; i--) {
    if (isIgnored(chat[j])) {
      j++;
      continue;
    }
    messages[i] = { content: String(chat[j].mes) };
    j++;
  }
  return [...messages].reverse();
};

const message = (index: number) => `m${index} ${"word ".repeat(30)}`.trim();

const chatOf = (length: number) => {
  const live = Array.from({ length }, () => ({ extra: {} as Record<string | symbol, unknown> }));
  const rows: CompactRow[] = live.map((entry, index) => ({ mes: message(index), extra: entry.extra }));
  const ids = new Map<unknown, number>(live.map((entry, index) => [entry.extra, index]));
  return { live, rows, idOf: (row: CompactRow) => ids.get(row.extra) ?? null };
};

const portOf = (chapters: Record<string, unknown>, shortTermSummaryEnd: number, enabled = true) => {
  const journal = jest.fn();
  const port = {
    compactedTo: null as number | null,
    host: { memory: () => ({ settings: { enabled, chapters }, shortTermSummaryEnd }), deps: { chapterHost: { journal } } },
  } as unknown as ChapterPort;
  return { port, journal };
};

const kept = (rows: CompactRow[]) => rows.filter((row) => !isIgnored(row)).map((row) => row.mes);

describe("chunked history compaction at the generate interceptor (v3.0 40 A3)", () => {
  it("is off by default: the prompt keeps every row, as today", () => {
    expect(DEFAULT_CHAPTER_SETTINGS.compact).toBe(false);
    const { live, rows } = chatOf(200);
    const { port } = portOf({}, 199);
    expect(compact(port, rows, "normal", live, 2000, 199)).toBeNull();
    expect(rows.some(isIgnored)).toBe(false);
  });

  it("when on, drops a leading chunk once the history passes three quarters of the prompt budget", () => {
    const { live, rows } = chatOf(200);
    const { port, journal } = portOf({ compact: true }, 199);
    const outcome = compact(port, rows, "normal", live, 2000, 199);
    expect(outcome?.compacted).toBeGreaterThan(0);
    const ignoredIds = rows.flatMap((row, index) => (isIgnored(row) ? [index] : []));
    expect(ignoredIds).toEqual(Array.from({ length: outcome?.compacted ?? 0 }, (_, index) => index));
    expect(setOpenAIMessages(rows).some((entry) => entry === undefined)).toBe(false);
    expect(journal).toHaveBeenCalledTimes(1);
  });

  it("keeps the cut for later turns, so the prompt start stays the same", () => {
    const { live } = chatOf(260);
    const { port, journal } = portOf({ compact: true }, 259);
    const cuts = Array.from({ length: 60 }, (_, step) => {
      const rows = chatOf(200 + step).rows.map((row, index) => ({ ...row, extra: live[index].extra }));
      return compact(port, rows, "normal", live, 2000, 199 + step)?.cutId;
    });
    const moves = cuts.filter((cut, index) => index > 0 && cut !== cuts[index - 1]).length;
    expect(moves).toBeGreaterThan(0);
    expect(moves).toBeLessThanOrEqual(6);
    expect(journal).toHaveBeenCalledTimes(moves + 1);
  });

  it("never drops a message past the last read window or the short-term summary", () => {
    const { live, rows } = chatOf(200);
    const { port } = portOf({ compact: true }, 40);
    const outcome = compact(port, rows, "normal", live, 2000, 199);
    expect(outcome?.cutId).toBeLessThanOrEqual(41);
    expect(outcome?.clamped).toBe(true);
    expect(compactionCeiling(30, 40)).toBe(30);
    expect(compactionCeiling(-1, 40)).toBeNull();
    expect(compactionCeiling(null, 40)).toBeNull();
    const unread = chatOf(200);
    expect(compact(portOf({ compact: true }, 199).port, unread.rows, "normal", unread.live, 2000, -1)).toBeNull();
    expect(unread.rows.some(isIgnored)).toBe(false);
  });

  it("does nothing with memory off, on a quiet or impersonate run, or without a prompt budget", () => {
    for (const [enabled, type, budget] of [[false, "normal", 2000], [true, "quiet", 2000], [true, "impersonate", 2000], [true, "normal", 0]] as const) {
      const { live, rows } = chatOf(200);
      expect(compact(portOf({ compact: true }, 199, enabled).port, rows, type, live, budget, 199)).toBeNull();
      expect(rows.some(isIgnored)).toBe(false);
    }
  });

  it("only removes rows: every kept row's text reaches the prompt unchanged and no text is added", () => {
    const { live, rows } = chatOf(200);
    const before = rows.map((row) => row.mes);
    compact(portOf({ compact: true }, 199).port, rows, "normal", live, 2000, 199);
    expect(rows.map((row) => row.mes)).toEqual(before);
    const sent = setOpenAIMessages(rows).filter(Boolean).map((entry) => entry?.content);
    expect(sent).toEqual(kept(rows));
    expect(before.slice(-sent.length)).toEqual(sent);
  });

  it("joins the chapter fold into one leading block, so Chat Completion gets no interior hole (M05)", () => {
    const { live, rows, idOf } = chatOf(200);
    const record = { id: "ch1#1", chapterId: "ch1", range: { from: 0, to: 30 } } as unknown as ChapterRecord;
    foldRows(rows as FoldRow[], idOf as (row: FoldRow) => number | null, foldRange([record], null));
    const folded = rows.filter(isIgnored).length;
    expect(folded).toBeGreaterThan(0);
    const outcome = compact(portOf({ compact: true }, 199).port, rows, "normal", live, 2000, 199);
    expect(outcome?.compacted).toBeGreaterThan(0);
    const ignoredIds = rows.flatMap((row, index) => (isIgnored(row) ? [index] : []));
    expect(ignoredIds).toEqual(Array.from({ length: ignoredIds.length }, (_, index) => index));
    expect(setOpenAIMessages(rows).some((entry) => entry === undefined)).toBe(false);
  });

  it("is a function of the chat, so a rollback to an earlier message plans the cut that message had (rollback ≡ replay)", () => {
    const { live } = chatOf(260);
    const plan = (length: number) => {
      const rows = chatOf(length).rows.map((row, index) => ({ ...row, extra: live[index].extra }));
      return compact(portOf({ compact: true }, length - 1).port, rows, "normal", live, 2000, length - 1)?.cutId ?? 0;
    };
    const grown = Array.from({ length: 60 }, (_, step) => plan(200 + step));
    expect(plan(230)).toBe(grown[30]);
    expect(plan(205)).toBe(grown[5]);
  });

  it("a row it cannot place drops with its neighbours inside the block and stays outside it", () => {
    const { rows, idOf } = chatOf(20);
    rows.splice(3, 0, { mes: "stray", extra: {} });
    rows.push({ mes: "tail stray", extra: {} });
    expect(compactRows(rows, idOf, 10)).toBe(11);
    expect(rows.at(-1)?.extra && isIgnored(rows.at(-1) as CompactRow)).toBe(false);
  });
});
