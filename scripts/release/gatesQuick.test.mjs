import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { quickPlan } from "./gatesQuick.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const exists = () => true;
const storiesIn = (path) => (path === "src/components/drawer/HudStrip.tsx" ? ["src/components/drawer/HudStrip.stories.tsx"] : []);

test("plan 26: gates:quick lints and relates only the changed src files, and names the stories beside them", () => {
  const plan = quickPlan(["src/components/drawer/HudStrip.tsx", "src/engine/engine.test.ts", "docs/x.md", "scripts/debug/a.mts"], { exists, storiesIn });
  assert.deepEqual(plan.lint, ["src/components/drawer/HudStrip.tsx"]);
  assert.deepEqual(plan.jest, ["src/components/drawer/HudStrip.tsx", "src/engine/engine.test.ts"]);
  assert.equal(plan.typecheckTest, true);
  assert.deepEqual(plan.stories, ["src/components/drawer/HudStrip.stories.tsx"]);
});

test("plan 26: a config or test-support change runs the whole jest suite; a deleted file is not linted", () => {
  for (const path of ["package.json", "jest.config.cjs", "tsconfig.jest.json", "test/support/codeHealth.ts"]) assert.equal(quickPlan([path], { exists, storiesIn }).jest, "all", path);
  const plan = quickPlan(["src/gone.ts", "src/kept.ts"], { exists: (path) => path !== "src/gone.ts", storiesIn });
  assert.deepEqual(plan.lint, ["src/kept.ts"]);
  assert.equal(plan.typecheckTest, false);
});

test("plan 26: npm run gates:quick is wired", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["gates:quick"], "node scripts/release/gatesQuick.mjs");
});
