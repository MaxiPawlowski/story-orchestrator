import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_DEPS, GATE_STEPS, gateSteps, nextReady } from "./gates.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ciRuns = (yaml) => [...yaml.matchAll(/^\s+run: npm (?:run )?([\w:-]+)\s*$/gm)].map((match) => match[1]);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("CR-P21: npm run gates is the overview rule 16 chain, in order, and every step is a real script", () => {
  assert.deepEqual([...GATE_STEPS].sort(), ["build", "debug:typecheck", "lint", "test", "test-storybook:ci", "test:debug", "test:plugin", "test:release", "test:replay", "typecheck", "typecheck:test"]);
  assert.equal(new Set(GATE_STEPS).size, GATE_STEPS.length);
  assert.equal(pkg.scripts.gates, "node scripts/release/gates.mjs");
  assert.deepEqual(GATE_STEPS.filter((step) => !pkg.scripts[step]), []);
  assert.deepEqual(GATE_DEPS["test:release"], ["build"], "test:release reads the build, so it waits for it");
  assert.deepEqual(Object.values(GATE_DEPS).flat().filter((dep) => !GATE_STEPS.includes(dep)), []);
  assert.deepEqual(GATE_DEPS["test:debug"], ["build"], "plan 26: so-run-header.test reads dist/manifest.json, which webpack clears mid-build");
  assert.deepEqual(GATE_DEPS["test:replay"], [], "plan 26: the replay checks its own baseline, so it does not wait for jest");
  assert.deepEqual(GATE_DEPS["test-storybook:ci"], [], "plan 26: Storybook builds its own bundle, so it starts at once");
});

test("plan 26: a step starts once its needs are done, longest first; a skipped need does not hold it", () => {
  const { steps } = gateSteps([]);
  assert.equal(nextReady(steps, new Set(), new Map()), "test:replay");
  const all = new Set(steps.filter((step) => step !== "test:release"));
  all.delete("build");
  assert.equal(nextReady(steps, all, new Map()), "build");
  assert.equal(nextReady(steps, all, new Map([["build", null]])), undefined, "test:release waits while build runs");
  all.add("build");
  assert.equal(nextReady(steps, all, new Map()), "test:release");
  const skipped = gateSteps(["--skip=build"]).steps;
  assert.equal(nextReady(skipped, new Set(skipped.filter((step) => step !== "test:release")), new Map()), "test:release");
});

test("concurrent steps: --serial runs one at a time, --jobs caps how many run at once", () => {
  assert.equal(gateSteps(["--serial"]).serial, true);
  assert.equal(gateSteps(["--serial", "--jobs=8"]).jobs, 1);
  assert.equal(gateSteps(["--jobs=3"]).jobs, 3);
  assert.ok(gateSteps([]).jobs >= 2);
  assert.ok(!gateSteps(["--no-storybook"]).steps.includes("test-storybook:ci"));
  assert.equal(gateSteps(["--skip=test"]).steps.length, GATE_STEPS.length - 1);
});

test("CR-P21: CI runs every step of the gates chain", () => {
  const runs = ciRuns(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8"));
  assert.deepEqual(GATE_STEPS.filter((step) => !runs.includes(step)), []);
});

test("CR-P21: --no-storybook and --skip drop only the named steps, and an unknown step is refused", () => {
  assert.deepEqual(gateSteps([]).steps, GATE_STEPS);
  assert.deepEqual(gateSteps(["--no-storybook"]).skipped, ["test-storybook:ci"]);
  assert.deepEqual(gateSteps(["--skip=test:replay,lint"]).skipped, ["test:replay", "lint"]);
  assert.deepEqual(gateSteps(["--skip=tests"]).unknown, ["tests"]);
});

test("CR-P21: overview rule 16 names the same chain", () => {
  const overview = readFileSync(join(root, "docs", "plans", "v2.6", "00-overview.md"), "utf8");
  const rule = overview.slice(overview.indexOf("16. **Every plan ends with the overall gates**"), overview.indexOf("17. **The suite is reviewed"));
  assert.match(rule, /npm run gates/);
  assert.deepEqual(GATE_STEPS.filter((step) => !rule.includes(`\`${step}\``)), []);
});
