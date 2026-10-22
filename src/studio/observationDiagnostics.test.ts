import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { imposesMind, instructs } from "./observationDiagnostics";
import { OBSERVATION_CORPUS } from "../../test/support/observationLab";

const SRC = join(process.cwd(), "src");

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
});

describe("v2.9 08 O3 (deterministic half): nothing imposes, instructs or leaks", () => {
  test("the 40 frozen texts raise no imposes-mind and no instructs warning", () => {
    expect(OBSERVATION_CORPUS.observations.filter((observation) => imposesMind(observation.text) || instructs(observation.text)).map((observation) => observation.id)).toEqual([]);
  });

  test.each([
    ["You feel watched.", true, false], ["You sense he is lying.", true, false], ["You realise the door was forced.", true, false],
    ["Your gut says the ledger is fake.", true, false], ["You should check the boat.", false, true], ["Look under the bench.", false, true],
    ["The lock is scratched. Check the hinge too.", false, true], ["Rain beads on the window.", false, false], ["A gull watches from the post.", false, false],
  ])("%s: imposes %s, instructs %s", (text, mind, order) => {
    expect(imposesMind(text)).toBe(mind);
    expect(instructs(text)).toBe(order);
  });

  test("observation text and records reach only the page: no prompt, injection, memory or extraction module imports them", () => {
    const allowed = new Set([
      "runtime/widgets.ts", "runtime/gamePort.ts", "runtime/rollback.ts", "runtime/extras.ts", "runtime/snapshotBuilder.ts", "runtime/managerWiring.ts",
      "runtime/gameSnapshot.ts", "runtime/types.ts", "runtime/observationView.ts", "runtime/observationKit.ts",
    ]);
    const importers = files(SRC).filter((path) => /from "(?:\.\/|@runtime\/)observation(?:View|Records|Kit)"/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path).replace(/\\/g, "/"));
    expect(importers.filter((path) => !allowed.has(path))).toEqual([]);
    const registry = readFileSync(join(SRC, "constants/injectionRegistry.ts"), "utf8");
    expect(registry).not.toMatch(/observ|noticed/i);
  });
});
