import { readFileSync } from "fs";
import { join } from "path";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", `${name}.json`), "utf8")) as { revision: number; rows: Array<Record<string, unknown>> };

const levels = [0, 1, 2, 3, 4];

describe("v2.7 35 Phase 5: the N3 and N5 spike fixtures are shaped before any answer is read", () => {
  it("N3 adversity: 20 rows, 4 per level, unique ids, a player name and a reply each", () => {
    const { revision, rows } = fixture("spike-n3");
    expect(revision).toBe(1);
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.id)).size).toBe(20);
    expect(levels.map((level) => rows.filter((row) => row.level === level).length)).toEqual([4, 4, 4, 4, 4]);
    expect(rows.every((row) => typeof row.playerName === "string" && typeof row.reply === "string" && String(row.reply).length > 20)).toBe(true);
  });

  it("N5 nothing-happens: 20 rows, change and tension on the 0-4 scale, idle and still-tense rows both present", () => {
    const { revision, rows } = fixture("spike-n5");
    expect(revision).toBe(1);
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.id)).size).toBe(20);
    expect(rows.every((row) => levels.includes(row.change as number) && levels.includes(row.tension as number) && typeof row.reply === "string")).toBe(true);
    const idle = rows.filter((row) => (row.change as number) < 2.5 && (row.tension as number) < 1.5);
    const stillTense = rows.filter((row) => (row.change as number) < 2.5 && (row.tension as number) >= 3);
    expect(idle.length).toBeGreaterThanOrEqual(6);
    expect(stillTense.length).toBeGreaterThanOrEqual(3);
  });
});
