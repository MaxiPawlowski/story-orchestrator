import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow } from "../validate";
import type { PrimitiveValue } from "../schema";
import { cueAtKey, cueLandedKey, normSeenKey } from "../cueSchema";
import { cueProvider } from "./cues";
import { selectOffer, type OfferCandidate, type OfferReceipt } from "./offers";

const STORY = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/reactive-cues.story.json"), "utf8")));
type Values = Record<string, PrimitiveValue>;

interface Opportunity {
  recipient: string;
  boundary: number;
  values?: Values;
  latest?: string;
  offered?: Array<[string, number]>;
  expected: string | null;
}

const LEDGER = { [cueAtKey("mara", "ledger")]: 5 };
const TOM_LEDGER = { [cueAtKey("tom", "ledger")]: 5 };
const RAISE = "Mara, what about the ledger?";

const CORPUS: Opportunity[] = [
  { recipient: "mara", boundary: 5, expected: null },
  { recipient: "mara", boundary: 5, values: LEDGER, expected: "cue:mara:ledger" },
  { recipient: "mara", boundary: 8, values: LEDGER, expected: null },
  { recipient: "mara", boundary: 7, values: LEDGER, expected: "cue:mara:ledger" },
  { recipient: "mara", boundary: 5, values: { ...LEDGER, guild_angry: true }, expected: "cue:mara:warn" },
  { recipient: "mara", boundary: 5, values: { location: "market" }, expected: "cue:mara:market" },
  { recipient: "mara", boundary: 5, values: { ...LEDGER, location: "market" }, expected: "cue:mara:market" },
  { recipient: "mara", boundary: 6, values: { ...LEDGER, location: "market" }, offered: [["cue:mara:market", 5]], expected: null },
  { recipient: "mara", boundary: 7, values: { ...LEDGER, location: "market" }, offered: [["cue:mara:market", 5]], expected: "cue:mara:ledger" },
  { recipient: "mara", boundary: 8, values: { location: "market" }, offered: [["cue:mara:market", 5]], expected: "cue:mara:market" },
  { recipient: "mara", boundary: 7, values: { location: "market" }, offered: [["cue:mara:market", 5]], expected: null },
  { recipient: "mara", boundary: 5, latest: RAISE, expected: "topic" },
  { recipient: "mara", boundary: 5, latest: RAISE, values: { guild_angry: true }, expected: "cue:mara:warn" },
  { recipient: "mara", boundary: 5, latest: RAISE, values: { location: "market" }, expected: "topic" },
  { recipient: "mara", boundary: 5, latest: "I saw Mara at the docks with the ledger.", expected: null },
  { recipient: "mara", boundary: 5, latest: "((OOC: Mara, the ledger?))", expected: null },
  { recipient: "tom", boundary: 5, latest: RAISE, expected: null },
  { recipient: "mara", boundary: 5, latest: "Mara, Tom, the ledger?", expected: null },
  { recipient: "mara", boundary: 5, latest: "*I look at Mara* \"The ledger?\"", expected: null },
  { recipient: "mara", boundary: 5, latest: RAISE, offered: [["topic", 4]], expected: null },
  { recipient: "mara", boundary: 5, values: { guild_angry: true, [cueLandedKey("mara", "warn")]: 3 }, expected: null },
  { recipient: "mara", boundary: 5, values: { guild_angry: true }, offered: [["cue:mara:warn", 1], ["cue:mara:warn", 3]], expected: null },
  { recipient: "mara", boundary: 5, values: { guild_angry: true }, offered: [["cue:mara:warn", 4]], expected: "cue:mara:warn" },
  { recipient: "tom", boundary: 5, values: TOM_LEDGER, expected: "cue:tom:ledger" },
  { recipient: "tom", boundary: 7, values: TOM_LEDGER, expected: null },
  { recipient: "tom", boundary: 6, values: TOM_LEDGER, expected: "cue:tom:ledger" },
  { recipient: "tom", boundary: 5, values: { location: "docks" }, expected: "cue:tom:river" },
  { recipient: "tom", boundary: 5, values: { ...TOM_LEDGER, location: "docks" }, expected: "cue:tom:ledger" },
  { recipient: "tom", boundary: 5, values: { location: "docks" }, offered: [["cue:tom:river", 3]], expected: null },
  { recipient: "tom", boundary: 6, values: { ...TOM_LEDGER, location: "docks" }, offered: [["cue:tom:ledger", 5]], expected: null },
  { recipient: "tom", boundary: 7, values: { ...TOM_LEDGER, location: "docks" }, offered: [["cue:tom:ledger", 5]], expected: "cue:tom:river" },
  { recipient: "bryn", boundary: 5, values: { [normSeenKey("steel", "bryn")]: 4 }, expected: "norm:steel:bryn" },
  { recipient: "bryn", boundary: 7, values: { [normSeenKey("steel", "bryn")]: 4 }, expected: null },
  { recipient: "bryn", boundary: 5, values: { [normSeenKey("steel", "bryn")]: 4 }, offered: [["norm:steel:bryn", 4]], expected: null },
  { recipient: "mara", boundary: 5, values: { [normSeenKey("steel", "mara")]: 4 }, expected: "norm:steel:mara" },
  { recipient: "mara", boundary: 5, values: { ...LEDGER, [normSeenKey("steel", "mara")]: 4 }, expected: "norm:steel:mara" },
  { recipient: "mara", boundary: 5, values: { location: "market", [normSeenKey("steel", "mara")]: 4 }, expected: "norm:steel:mara" },
  { recipient: "mara", boundary: 5, values: { guild_angry: true, [normSeenKey("steel", "mara")]: 4 }, expected: "cue:mara:warn" },
  { recipient: "narrator", boundary: 5, values: { ...LEDGER, guild_angry: true }, expected: null },
  { recipient: "bryn", boundary: 5, values: LEDGER, expected: null },
];

const RAISE_LINE = { messageId: 10, revision: "p10" };

const winnerOf = (row: Opportunity): string | null => {
  const values = row.values ?? {};
  const latestPlayer = row.latest ? { ...RAISE_LINE, text: row.latest } : null;
  const base = { story: STORY, values, boundary: row.boundary, recipient: row.recipient, chatId: "chat", latestPlayer };
  const all = cueProvider({ ...base, receipts: [] });
  const receipts: OfferReceipt[] = (row.offered ?? []).map(([key, boundary], index) => {
    const candidate = all.find((entry) => entry.key === key || (key === "topic" && entry.source.kind === "topic")) as OfferCandidate;
    return { key: candidate.key, defRev: candidate.defRev, source: candidate.source, recipient: row.recipient, chatId: "chat", messageId: 20 + index, revision: "m",
      boundary, textHash: "h", ...(candidate.gap ? { gap: true as const } : {}) };
  });
  const winner = selectOffer({ candidates: cueProvider({ ...base, receipts }), receipts, boundary: row.boundary, recipient: "ok", refuse: () => null }).winner;
  return winner ? (winner.candidate.source.kind === "topic" ? "topic" : winner.candidate.key) : null;
};

describe("v2.9 plan 04 C1: cue selection corpus (floor 95 %)", () => {
  it("holds 40 opportunities across three members", () => {
    expect(CORPUS).toHaveLength(40);
    expect(new Set(CORPUS.map((row) => row.recipient)).size).toBeGreaterThanOrEqual(3);
    expect(CORPUS.filter((row) => row.expected === null).length).toBeGreaterThan(10);
  });

  it.each(CORPUS.map((row, index) => [index + 1, row] as const))("opportunity %i picks the expected winner", (_index, row) => {
    expect(winnerOf(row)).toBe(row.expected);
  });

  it("scores at or above the floor", () => {
    const correct = CORPUS.filter((row) => winnerOf(row) === row.expected).length;
    expect(correct / CORPUS.length).toBeGreaterThanOrEqual(0.95);
  });
});
