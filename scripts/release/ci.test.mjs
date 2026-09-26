import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATES = ["typecheck", "typecheck:test", "lint", "test", "build", "build:dev", "test:release", "test:plugin", "test:debug", "debug:typecheck", "test-storybook:ci"];

export const ciRuns = (yaml) => [...yaml.matchAll(/^\s+run: npm (?:run )?([\w:-]+)\s*$/gm)].map((match) => match[1]);

test("Q2t: CI runs every machine gate, build before build:dev before test:release", () => {
  const yaml = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const runs = ciRuns(yaml);
  assert.deepEqual(GATES.filter((gate) => !runs.includes(gate)), []);
  assert.ok(runs.indexOf("build") < runs.indexOf("build:dev") && runs.indexOf("build:dev") < runs.indexOf("test:release"), "test:release reads both builds");
  assert.match(yaml, /branches: \[master\]/);
  assert.match(yaml, /tags: \["v\*"\]/);
  assert.match(yaml, /npm run test:release --release/);
});

test("Q2t control: a workflow missing a gate is caught", () => {
  assert.deepEqual(ciRuns("      - run: x\n        run: npm test\n        run: npm run lint\n"), ["test", "lint"]);
  assert.deepEqual(GATES.filter((gate) => !["test", "lint"].includes(gate)).length, GATES.length - 2);
});
