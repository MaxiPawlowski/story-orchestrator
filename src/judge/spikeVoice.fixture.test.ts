import { readFileSync } from "node:fs";
import { join } from "node:path";

type VoiceFixture = { use?: string; blocked?: { owner?: string; why?: string }; floors: { of: number }; rows: unknown[] };

const fixtureProblems = (fixture: VoiceFixture): string[] => {
  const problems: string[] = [];
  if (fixture.use !== "wardenVoice") problems.push(`use is ${String(fixture.use)}`);
  if (fixture.blocked) {
    if (!fixture.blocked.owner?.trim()) problems.push("blocked without an owner");
    if ((fixture.blocked.why?.trim().length ?? 0) < 20) problems.push("blocked without a reason");
    if (fixture.rows.length) problems.push(`blocked yet holds ${fixture.rows.length} rows`);
    return problems;
  }
  if (fixture.rows.length !== fixture.floors.of) problems.push(`${fixture.rows.length} rows, the floors are frozen for ${fixture.floors.of}`);
  return problems;
};

describe("the 37-L6-C voice warden fixture", () => {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge/spike-voice.json"), "utf8")) as VoiceFixture;

  it("is either blocked with an owner and no rows, or holds exactly the frozen row count", () => {
    expect(fixture.floors.of).toBe(20);
    expect(fixtureProblems(fixture)).toEqual([]);
  });

  it("planted controls: an unowned block, a partial collection and a blocked fixture with rows are each refused", () => {
    const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `r${index}` }));
    expect(fixtureProblems({ use: "wardenVoice", floors: { of: 20 }, rows: rows(20) })).toEqual([]);
    expect(fixtureProblems({ use: "wardenVoice", floors: { of: 20 }, rows: [] })).toEqual(["0 rows, the floors are frozen for 20"]);
    expect(fixtureProblems({ use: "wardenVoice", floors: { of: 20 }, rows: rows(19) })).toEqual(["19 rows, the floors are frozen for 20"]);
    expect(fixtureProblems({ use: "wardenVoice", blocked: { why: "the lab copy that the rows come from does not exist yet" }, floors: { of: 20 }, rows: [] })).toEqual(["blocked without an owner"]);
    expect(fixtureProblems({ use: "wardenVoice", blocked: { owner: "v2.7 38 A4", why: "the lab copy that the rows come from does not exist yet" }, floors: { of: 20 }, rows: rows(3) })).toEqual(["blocked yet holds 3 rows"]);
  });
});
