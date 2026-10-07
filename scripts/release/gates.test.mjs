import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_PHASES, GATE_STEPS, gateSteps } from "./gates.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ciRuns = (yaml) => [...yaml.matchAll(/^\s+run: npm (?:run )?([\w:-]+)\s*$/gm)].map((match) => match[1]);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("CR-P21: npm run gates is the overview rule 16 chain, in order, and every step is a real script", () => {
  assert.deepEqual([...GATE_STEPS].sort(), ["build", "build:dev", "debug:typecheck", "lint", "test", "test-storybook:ci", "test:debug", "test:plugin", "test:release", "test:replay", "typecheck", "typecheck:test"]);
  assert.equal(new Set(GATE_STEPS).size, GATE_STEPS.length);
  assert.equal(pkg.scripts.gates, "node scripts/release/gates.mjs");
  assert.deepEqual(GATE_STEPS.filter((step) => !pkg.scripts[step]), []);
  const phaseOf = (step) => GATE_PHASES.findIndex((phase) => phase.includes(step));
  assert.ok(phaseOf("build") < phaseOf("test:release") && phaseOf("build:dev") < phaseOf("test:release"), "test:release reads both builds, so both finish in an earlier phase");
  assert.ok(phaseOf("test") < phaseOf("test:replay"), "replay needs a green suite first");
});

test("concurrent phases: --serial runs one step at a time, a skipped step leaves its phase, an emptied phase is dropped", () => {
  assert.equal(gateSteps(["--serial"]).serial, true);
  assert.ok(gateSteps(["--no-storybook"]).phases.every((phase) => !phase.includes("test-storybook:ci")));
  assert.deepEqual(gateSteps(["--skip=test"]).phases.length, GATE_PHASES.length - 1);
});

test("CR-P21: CI runs every step of the gates chain", () => {
  const runs = ciRuns(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8"));
  assert.deepEqual(GATE_STEPS.filter((step) => !runs.includes(step)), []);
});

test("CR-P21: --no-storybook and --skip drop only the named steps, and an unknown step is refused", () => {
  assert.deepEqual(gateSteps([]).steps, GATE_STEPS);
  assert.deepEqual(gateSteps(["--no-storybook"]).skipped, ["test-storybook:ci"]);
  assert.deepEqual(gateSteps(["--skip=test:replay,lint"]).skipped, ["lint", "test:replay"]);
  assert.deepEqual(gateSteps(["--skip=tests"]).unknown, ["tests"]);
});

test("CR-P21: overview rule 16 names the same chain", () => {
  const overview = readFileSync(join(root, "docs", "plans", "v2.6", "00-overview.md"), "utf8");
  const rule = overview.slice(overview.indexOf("16. **Every plan ends with the overall gates**"), overview.indexOf("17. **The suite is reviewed"));
  assert.match(rule, /npm run gates/);
  assert.deepEqual(GATE_STEPS.filter((step) => !rule.includes(`\`${step}\``)), []);
});
