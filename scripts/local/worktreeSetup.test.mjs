import { strict as assert } from "node:assert";
import { join } from "node:path";
import { test } from "node:test";
import { LOCAL_FILES, setupPlan } from "./worktreeSetup.mjs";

const fakeFs = (present) => (path) => present.includes(path.replace(/\\/g, "/"));

test("worktree setup junctions node_modules and copies only the local files the worktree lacks", () => {
  const main = "/m", worktree = "/w";
  const present = ["/m/node_modules", ...LOCAL_FILES.map((path) => join(main, path).replace(/\\/g, "/")), join(worktree, ".st-root").replace(/\\/g, "/")];
  const plan = setupPlan(worktree, main, fakeFs(present));
  assert.deepEqual(plan.actions, [{ kind: "junction", path: "node_modules" }, { kind: "copy", path: "test/sessions/adolion-stories.json" }]);
});

test("worktree setup names a local file the main checkout lacks, and refuses the main checkout itself", () => {
  const plan = setupPlan("/w", "/m", fakeFs(["/m/node_modules", "/w/node_modules"]));
  assert.deepEqual(plan.actions.map((action) => action.kind), LOCAL_FILES.map(() => "missing"));
  assert.equal(setupPlan("/m", "/m").refused, "this is the main checkout");
});
