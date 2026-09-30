import * as fs from "node:fs";
import * as path from "node:path";

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [full] : [];
});

const LAZY_ROOTS = ["src/studio", "src/copilot"];
const SETS_GLOBAL = /Object\.assign\(\s*globalThis|globalThis(?:\s+as\s+[^)]*\))?\)?\.storyOrchestrator\w+\s*=(?!=)|Reflect\.set\(\s*globalThis/;

describe("v2.6 plan 01 (E4 cycle): the lazy Studio chunk sets no global of its own", () => {
  it("leaves every storyOrchestrator global to the mount registry, so storyOrchestratorStop removes it", () => {
    const offenders = LAZY_ROOTS.flatMap((root) => walk(path.join(process.cwd(), root)))
      .filter((file) => SETS_GLOBAL.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
