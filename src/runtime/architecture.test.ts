import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Structural rules the harness enforces so nobody has to remember them (v2.1 rule 9). Each budget
// here is a measured post-plan-03 fact: raising one is a decision, not a side effect.
const SRC = join(__dirname, "..");

const MANAGER_LINE_BUDGET = 700;
const COORDINATOR_LINE_BUDGET = 620;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const lineCount = (path: string) => readFileSync(path, "utf8").split("\n").length;
const importsOf = (path: string) => [...readFileSync(path, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

describe("architecture guards", () => {
  it("keeps RuntimeManager within its size budget", () => {
    expect(lineCount(join(SRC, "runtime/runtimeManager.ts"))).toBeLessThanOrEqual(MANAGER_LINE_BUDGET);
  });

  it("keeps every coordinator smaller than the manager budget", () => {
    for (const path of walk(join(SRC, "runtime/coordinators"))) {
      expect({ path, overBudget: lineCount(path) > COORDINATOR_LINE_BUDGET }).toEqual({ path, overBudget: false });
    }
  });

  it("never lets the drawer or any other component import the studio", () => {
    for (const path of walk(join(SRC, "components"))) {
      const offenders = importsOf(path).filter((specifier) => /(^@studio|studio\/(?!.*components\/studio))/.test(specifier) && !specifier.includes("components/studio"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("lets the studio reach components only through the shared primitives", () => {
    for (const path of walk(join(SRC, "studio"))) {
      const offenders = importsOf(path).filter((specifier) => specifier.includes("components") && /@components|\.\.\/components/.test(specifier) && !specifier.startsWith("@components/studio/"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("keeps drawer render paths on the snapshot instead of manager getters", () => {
    for (const path of walk(join(SRC, "components/drawer"))) {
      const getterCalls = [...readFileSync(path, "utf8").matchAll(/manager\.get\w+\(/g)].map((match) => match[0]);
      expect({ path, getterCalls }).toEqual({ path, getterCalls: [] });
    }
  });

  it("keeps engine purity: no host imports below src/engine", () => {
    for (const path of walk(join(SRC, "engine"))) {
      const offenders = importsOf(path).filter((specifier) => specifier.includes("@services") || specifier.includes("STAPI"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("keeps coordinators from importing each other outside their typed deps", () => {
    for (const path of walk(join(SRC, "runtime/coordinators"))) {
      const source = readFileSync(path, "utf8");
      const valueImports = [...source.matchAll(/^import\s+(?!type\s)(.+?)\s+from\s+"(\.\/[^"]+)"/gm)].map((match) => match[2]);
      expect({ path, valueImports }).toEqual({ path, valueImports: [] });
    }
  });
});
