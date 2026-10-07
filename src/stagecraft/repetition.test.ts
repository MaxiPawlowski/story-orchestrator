import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mineRepetition, replyTexts, repetitionText } from "./repetition";

interface Row {
  id: string;
  label: "loops" | "fresh";
  hot: string[];
  replies: string[];
}

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/repetition/n6-windows.json"), "utf8")) as { revision: number; rows: Row[] };

const LOOPS_RECALL_FLOOR = 0.8;
const FRESH_SPECIFICITY_FLOOR = 0.95;

describe("v2.7 33 W3 N6: the repetition miner (no model) against its fixture", () => {
  const scored = FIXTURE.rows.map((row) => ({ row, report: mineRepetition(row.replies) }));
  const loops = scored.filter((entry) => entry.row.label === "loops");
  const fresh = scored.filter((entry) => entry.row.label === "fresh");

  it("is 20 rows, 10 loops and 10 fresh", () => {
    expect([loops.length, fresh.length]).toEqual([10, 10]);
  });

  it("meets the predeclared floors: loops recall >= 0.8, fresh specificity >= 0.95 (the judge-off column)", () => {
    const recall = loops.filter((entry) => entry.report.loops).length / loops.length;
    const specificity = fresh.filter((entry) => !entry.report.loops).length / fresh.length;
    console.log(`v2.7 33 N6 ${JSON.stringify({ revision: FIXTURE.revision, recall, specificity, missed: loops.filter((entry) => !entry.report.loops).map((entry) => entry.row.id), falseAlarms: fresh.filter((entry) => entry.report.loops).map((entry) => ({ id: entry.row.id, hot: entry.report.hot })) })}`);
    expect(recall).toBeGreaterThanOrEqual(LOOPS_RECALL_FLOOR);
    expect(specificity).toBeGreaterThanOrEqual(FRESH_SPECIFICITY_FLOOR);
  });

  it("names the labelled phrase for every caught loop", () => {
    const unnamed = loops.filter((entry) => entry.report.loops && !entry.row.hot.some((phrase) => entry.report.hot.some((found) => found.includes(phrase.toLowerCase().replace(/,/g, "")) || phrase.toLowerCase().replace(/,/g, "").includes(found)) || entry.report.constructions.length > 0));
    expect(unnamed.map((entry) => ({ id: entry.row.id, hot: entry.report.hot }))).toEqual([]);
  });

  it("needs the latest reply to repeat: a phrase only earlier replies share is not a loop", () => {
    expect(mineRepetition(["The ferryman spits into the river.", "Fog.", "The ferryman spits into the river again.", "A bump.", "A jetty.", "You step ashore."]).loops).toBe(false);
  });

  it("ignores names and places, and needs at least three replies", () => {
    expect(mineRepetition(["At the Silver Stag Inn.", "Back at the Silver Stag Inn.", "Again the Silver Stag Inn."]).hot).toEqual([]);
    expect(mineRepetition(["A shiver ran down her spine.", "A shiver ran down her spine."]).loops).toBe(false);
  });

  it("reads only character replies from chat rows, and says nothing when there is no loop", () => {
    expect(replyTexts([{ is_user: true, mes: "hi" }, { is_user: false, mes: "Hello." }, { is_system: true, mes: "note" }, { mes: "" }, null])).toEqual(["Hello."]);
    expect(repetitionText({ replies: 6, hot: [], constructions: [], loops: false })).toBeNull();
    expect(repetitionText({ replies: 6, hot: ["a shiver ran down her spine"], constructions: [], loops: true })).toBe("Repeating across the last 6 replies: \"a shiver ran down her spine\"");
  });
});
