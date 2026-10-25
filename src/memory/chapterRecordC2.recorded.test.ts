import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow, type Story } from "@engine/index";
import { stripChannelNoise } from "@extraction/parse";
import type { ChapterInput } from "./chapterInput";
import { buildChapterRecordPrompt, parseChapterRecord, properNouns, verifyChapterRecord, verifySaga } from "./chapterRecord";
import type { ChapterRecord } from "./types";

const golden = (name: string) => readFileSync(join(process.cwd(), "test/goldens", name), "utf8").replace(/\r\n/g, "\n");
const story = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/scenarios/v28-45-carry-source.story.json"), "utf8")) as Story);
const roster = [{ id: "mara", name: "Arin" }, { id: "tom", name: "Luke" }, { id: "narrator", name: "DM Narrator" }];

const coast = parseChapterRecord(stripChannelNoise(golden("chapter-seal-c2-coast.response.txt")), { items: [], openArcs: [], blackboardDelta: {}, places: [], roster, previous: null });
if (!coast.ok) throw new Error(coast.reason);
const previous = { playerTitle: "The Dark Harbour", ...coast.record } as unknown as ChapterRecord;

const state = (key: string, from: unknown, to: unknown) => ({ id: `q:${key}`, kind: "state" as const, text: `${key}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}` });
const input: ChapterInput = {
  items: [
    state("coast_fate", null, "lit"), state("harbour_mood", null, "grateful"), state("lantern_relit", null, true), state("ledger_found", null, true),
    state("ledger_seen", null, true), state("quest_ledger_closed", null, "done"), state("rep_guild", 0, 3), state("rep_guild_move_relit", null, 3),
    state("rep_guild_seen_mara", 0, 3),
  ],
  openArcs: [], blackboardDelta: {}, places: ["the lantern tower"], roster, previous,
};
const known = [story.title, "", ...(story.chapters ?? []).flatMap((chapter) => [chapter.title, chapter.player_title ?? ""]), ...story.checkpoints.map((checkpoint) => checkpoint.player_name ?? "")];

describe("v2.9 13 C2: the final chapter record the real model wrote on the 45 seal", () => {
  it("the fixture input renders the prompt the model was sent", () => {
    const sent = golden("chapter-seal-c2-final1.prompt.txt").replace(/^<\|turn>user\nuser: /, "").replace(/<turn\|>\n<\|turn>model\n$/, "");
    expect(buildChapterRecordPrompt(story.title, "The Last Lantern", input)).toBe(sent);
  });

  it.each(["chapter-seal-c2-final1.response.txt", "chapter-seal-c2-final2.response.txt"])("%s parses and verifies: a cast name in the possessive is not an invented name", (name) => {
    const parsed = parseChapterRecord(stripChannelNoise(golden(name)), input);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.record.consequences).toHaveLength(4);
    expect(verifyChapterRecord(parsed.record, input, known)).toEqual([]);
  });

  it("a name nobody gave is still refused, possessive or not", () => {
    const parsed = parseChapterRecord(stripChannelNoise(golden("chapter-seal-c2-final1.response.txt")), input);
    if (!parsed.ok) throw new Error(parsed.reason);
    const invented = { ...parsed.record, summary: `${parsed.record.summary} They burned Orsolya's ledger and thanked Brannoc.` };
    expect(verifyChapterRecord(invented, input, known)).toEqual(["names not in the inputs: Orsolya, Brannoc"]);
  });

  it("properNouns folds the possessive for the saga check too", () => {
    expect(properNouns("The bell rang. Then Luke's lamp and the Lamplighters' hall went dark, and Arin’s hand shook.")).toEqual(["Luke", "Lamplighters", "Arin"]);
    const record = { summary: "Arin and Luke relit the lantern.", playerTitle: "The Last Lantern", consequences: [], people: [] } as unknown as ChapterRecord;
    const epilogue = `${"Arin and Luke climbed the tower in the wind. ".repeat(14)}In the end Luke's lamp burned over the water.`;
    expect(verifySaga(epilogue, [record], ["Arin", "Luke"])).toEqual([]);
  });
});
