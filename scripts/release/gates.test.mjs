import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_STEPS, gateSteps } from "./gates.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ciRuns = (yaml) => [...yaml.matchAll(/^\s+run: npm (?:run )?([\w:-]+)\s*$/gm)].map((match) => match[1]);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("CR-P21: npm run gates is the overview rule 16 chain, in order, and every step is a real script", () => {
  assert.deepEqual(GATE_STEPS, ["typecheck", "typecheck:test", "lint", "test", "build", "build:dev", "test:debug", "test:release", "test:replay", "test:plugin", "test-storybook:ci"]);
  assert.equal(pkg.scripts.gates, "node scripts/release/gates.mjs");
  assert.deepEqual(GATE_STEPS.filter((step) => !pkg.scripts[step]), []);
  assert.ok(GATE_STEPS.indexOf("build") < GATE_STEPS.indexOf("build:dev") && GATE_STEPS.indexOf("build:dev") < GATE_STEPS.indexOf("test:release"), "test:release reads both builds");
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
