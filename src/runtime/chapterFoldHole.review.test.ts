jest.mock("@services/STAPI", () => ({ registerHostMacro: jest.fn(), unregisterHostMacro: jest.fn(), getContext: () => ({ chat: [] }) }));

import { foldRange, foldRows, type FoldRow } from "./chapterKit";
import type { ChapterRecord } from "@memory/types";

const IGNORE = Symbol.for("ignore");

const record = (chapterId: string, from: number, to: number): ChapterRecord => ({ id: `${chapterId}#1`, chapterId, range: { from, to } }) as unknown as ChapterRecord;

const setOpenAIMessages = (chat: FoldRow[]): Array<{ content: string } | undefined> => {
  const messages: Array<{ content: string } | undefined> = [];
  let j = 0;
  for (let i = chat.length - 1; i >= 0; i--) {
    if ((chat[j].extra as Record<symbol, unknown> | undefined)?.[IGNORE]) {
      j++;
      continue;
    }
    messages[i] = { content: String(chat[j].mes) };
    j++;
  }
  return [...messages].reverse();
};

const chatOf = (length: number) => {
  const live = Array.from({ length }, () => ({ extra: {} as Record<string | symbol, unknown> }));
  const ids = new Map<unknown, number>(live.map((message, index) => [message.extra, index]));
  const rows: FoldRow[] = live.map((message, index) => ({ mes: `m${index}`, extra: message.extra }));
  return { rows, idOf: (row: FoldRow) => ids.get(row.extra) ?? null };
};

const ignored = (rows: FoldRow[]) => rows.flatMap((row, index) => ((row.extra as Record<symbol, unknown>)[IGNORE] ? [index] : []));

describe("the chapter fold leaves no interior IGNORE hole on Chat Completion (v2.9 triage M05)", () => {
  it("two sealed chapters fold one leading block, so ST's setOpenAIMessages (openai.js:578-647) assigns every slot", () => {
    const { rows, idOf } = chatOf(50);
    const ranges = foldRange([record("ch1", 0, 20), record("ch2", 21, 40)], null);
    expect(ranges).toEqual([{ from: 0, to: 34 }]);
    expect(foldRows(rows, idOf, ranges)).toEqual({ folded: 35, kept: 15, missing: 0 });
    expect(ignored(rows)).toEqual(Array.from({ length: 35 }, (_, index) => index));
    const sent = setOpenAIMessages(rows);
    expect(sent.some((message) => message === undefined)).toBe(false);
    expect(sent.filter(Boolean)).toHaveLength(15);
  });

  it("stops at a coverage gap and before a chapter that does not fold", () => {
    expect(foldRange([record("ch1", 0, 20), record("ch3", 41, 60)], null)).toEqual([{ from: 0, to: 14 }]);
    expect(foldRange([record("ch2", 21, 40), record("ch1", 0, 20)], null)).toEqual([{ from: 0, to: 34 }]);
    const story = { chapterById: { ch2: { seal: { fold_messages: false } } } } as unknown as Parameters<typeof foldRange>[1];
    expect(foldRange([record("ch1", 0, 20), record("ch2", 21, 40), record("ch3", 41, 60)], story)).toEqual([{ from: 0, to: 14 }]);
  });

  it("folds only a leading run of rows: a kept row before a folded one stops the fold", () => {
    const { rows, idOf } = chatOf(30);
    expect(foldRows(rows, idOf, [{ from: 5, to: 20 }])).toEqual({ folded: 0, kept: 30, missing: 0 });
    expect(setOpenAIMessages(rows).some((message) => message === undefined)).toBe(false);
  });

  it("a row it cannot place folds with its neighbours inside the block and stays outside it", () => {
    const { rows, idOf } = chatOf(20);
    rows.splice(3, 0, { mes: "stray", extra: {} });
    rows.push({ mes: "tail stray", extra: {} });
    expect(foldRows(rows, idOf, [{ from: 0, to: 9 }])).toEqual({ folded: 11, kept: 10, missing: 1 });
    expect(setOpenAIMessages(rows).some((message) => message === undefined)).toBe(false);
  });
});
