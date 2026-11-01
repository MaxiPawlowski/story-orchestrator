import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { E0PoolQuestion } from "./e0Ranking";
import { compareWindowArm } from "./e0Window";

const pool = (path: string): E0PoolQuestion[] => JSON.parse(readFileSync(path, "utf8")).questions;
const synthetic = join(__dirname, "../../test/measurements/v2.8/21-e0/synthetic.pool.json");
const privatePool = process.env.SO_E0_PRIVATE_POOL;

describe("v3.0 41 B4: E0 arm f (window-weighted query, normalised terms) against arm c", () => {
  it("synthetic set: arm f hit@4 is not below arm c (floor F-B4, informational)", () => {
    const { c, f } = compareWindowArm(pool(synthetic));
    process.stdout.write(`${JSON.stringify({ set: "synthetic", c: { hitAt4: c.hitAt4, mrrAt4: c.mrrAt4 }, f: { hitAt4: f.hitAt4, mrrAt4: f.mrrAt4 } })}\n`);
    expect(f.questions).toBe(c.questions);
    expect(f.hitAt4).toBeGreaterThanOrEqual(c.hitAt4);
  });

  (privatePool && existsSync(privatePool) ? it : it.skip)("private set (SO_E0_PRIVATE_POOL, outside the repo): prints counts and scores only", () => {
    const { c, f } = compareWindowArm(pool(privatePool as string));
    process.stdout.write(`${JSON.stringify({ set: "private", questions: c.questions, poolRecall: c.poolRecall, c: { hitAt4: c.hitAt4, mrrAt4: c.mrrAt4 }, f: { hitAt4: f.hitAt4, mrrAt4: f.mrrAt4 } })}\n`);
    expect(f.questions).toBe(c.questions);
  });
});
