import { readFileSync } from "fs";
import { join } from "path";
import { IGNORE, WitnessBook, filterUnwitnessed, presenceOf, scoreWitnessAgreement, type WitnessRow } from "./witnessFilter";

interface TranscriptRow {
  marker: string;
  speaker: string;
  text: string;
  witnesses: string[];
}

const transcript = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/v25-09-witness.transcript.json"), "utf8")) as { members: string[]; messages: TranscriptRow[] };

interface LiveRow {
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  extra: Record<string, unknown>;
}

const liveChat = (): LiveRow[] => transcript.messages.map((row, index) => ({
  name: row.speaker === "player" ? "You" : row.speaker,
  is_user: row.speaker === "player",
  is_system: false,
  mes: row.text,
  extra: { gen_id: index, api: "openai" },
}));

const coreChatOf = (chat: LiveRow[]): WitnessRow[] => chat.map((row, index) => ({ ...row, mes: row.mes, index })).map((row) => ({ ...row }));

const authoredBook = (chat: LiveRow[]) => {
  const book = new WitnessBook();
  transcript.messages.forEach((row, index) => book.author(chat[index].extra, row.witnesses));
  return book;
};

const snapshot = (chat: LiveRow[]) => chat.map((row) => ({ json: JSON.stringify(row.extra), symbols: Object.getOwnPropertySymbols(row.extra).length }));

const measureF2 = () => {
  const rows: Array<{ member: string; unwitnessedVisible: string[]; witnessedHidden: string[]; witnessedChecked: number }> = [];
  for (const member of transcript.members) {
    const chat = liveChat();
    const core = coreChatOf(chat);
    filterUnwitnessed(core, member, authoredBook(chat).lookup, false);
    const row = { member, unwitnessedVisible: [] as string[], witnessedHidden: [] as string[], witnessedChecked: 0 };
    transcript.messages.forEach((message, index) => {
      const hidden = Boolean((core[index].extra as Record<PropertyKey, unknown>)[IGNORE]);
      const shouldSee = message.speaker === member || message.witnesses.includes(member);
      if (shouldSee) {
        row.witnessedChecked += 1;
        if (hidden) row.witnessedHidden.push(message.marker);
      } else if (!hidden) row.unwitnessedVisible.push(message.marker);
    });
    rows.push(row);
  }
  return rows;
};

describe("SP9 F1 (jest leg): the filter never mutates the chat", () => {
  it("leaves every live extra deep-equal and symbol-free after each member is drafted", () => {
    const chat = liveChat();
    const before = snapshot(chat);
    for (const member of transcript.members) {
      const core = coreChatOf(chat);
      const outcome = filterUnwitnessed(core, member, authoredBook(chat).lookup, false);
      expect(outcome.hidden + outcome.kept + outcome.unknown).toBe(chat.length);
    }
    expect(snapshot(chat)).toEqual(before);
  });

  it("control: setting the symbol on the shared extra, as a naive filter would, is caught", () => {
    const chat = liveChat();
    const before = snapshot(chat);
    const core = coreChatOf(chat);
    (core[6].extra as Record<PropertyKey, unknown>)[IGNORE] = true;
    expect(snapshot(chat)).not.toEqual(before);
  });
});

describe("SP9 F2 (jest leg): authored witness sets", () => {
  it("hides every unwitnessed message and keeps every witnessed one, for each drafted member", () => {
    const rows = measureF2();
    expect(rows.map((row) => ({ member: row.member, unwitnessedVisible: row.unwitnessedVisible, witnessedHidden: row.witnessedHidden })))
      .toEqual(transcript.members.map((member) => ({ member, unwitnessedVisible: [], witnessedHidden: [] })));
    expect(rows.map((row) => row.witnessedChecked)).toEqual([24, 19, 18]);
  });

  it("control: with no witness source every message is kept (fail-open), so the F2 count above is the filter's doing", () => {
    const chat = liveChat();
    const core = coreChatOf(chat);
    const outcome = filterUnwitnessed(core, "Ponticius", () => null, false);
    expect(outcome).toEqual({ hidden: 0, kept: 5, unknown: 19 });
    expect(core.every((row) => !(row.extra as Record<PropertyKey, unknown>)[IGNORE])).toBe(true);
  });

  it("keeps the drafted member's own words and the continued message, and replaces the element rather than its extra", () => {
    const chat = liveChat();
    const core = coreChatOf(chat);
    const original = core[6];
    filterUnwitnessed(core, "Ponticius", authoredBook(chat).lookup, true);
    expect(core[6]).not.toBe(original);
    expect(core[6].extra).not.toBe(chat[6].extra);
    expect((core[6].extra as Record<PropertyKey, unknown>).gen_id).toBe(6);
    expect((core[8].extra as Record<PropertyKey, unknown>)[IGNORE]).toBeUndefined();
    const keepLast = coreChatOf(chat).slice(0, 13);
    filterUnwitnessed(keepLast, "Ponticius", authoredBook(chat).lookup, true);
    expect((keepLast[12].extra as Record<PropertyKey, unknown>)[IGNORE]).toBeUndefined();
    expect((keepLast[11].extra as Record<PropertyKey, unknown>)[IGNORE]).toBe(true);
  });
});

describe("SP9 witness source", () => {
  it("presence is the enabled members plus the speaker, and authored sets win over presence", () => {
    expect(presenceOf(["DM Narrator", "Arin"], { name: "Ponticius", is_user: false })).toEqual(["DM Narrator", "Arin", "Ponticius"]);
    expect(presenceOf(["DM Narrator", "Arin"], { name: "You", is_user: true })).toEqual(["DM Narrator", "Arin"]);
    const book = new WitnessBook();
    const extra = {};
    book.record(extra, ["Arin", "Ponticius"]);
    expect(book.lookup({ extra })).toEqual(["Arin", "Ponticius"]);
    book.author(extra, ["Arin"]);
    expect(book.lookup({ extra })).toEqual(["Arin"]);
    book.clearAuthored();
    expect(book.lookup({ extra })).toEqual(["Arin", "Ponticius"]);
    expect(book.lookup({ extra: {} })).toBeNull();
    expect(book.lookup({})).toBeNull();
  });

  it("scores agreement as exact sets per labelled message, an unrecorded message counting as a disagreement", () => {
    expect(scoreWitnessAgreement({ 1: ["Arin", "DM Narrator"], 2: ["Arin"], 3: null }, { 1: ["DM Narrator", "Arin"], 2: ["Arin", "Ponticius"], 3: ["Arin"] }))
      .toEqual({ total: 3, agree: 1, rate: 1 / 3, disagreements: [2, 3] });
  });
});
