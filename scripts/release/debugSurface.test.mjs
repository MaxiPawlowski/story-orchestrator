import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { surfaceNames } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scripts = (dir) => readdirSync(join(root, dir)).filter((name) => name.endsWith(".js")).map((name) => readFileSync(join(root, dir, name), "utf8")).join("\n");
const noBuild = !existsSync(join(root, "dist", "index.js")) && "needs npm run build";

test("D1 (one build, 2026-10-07): the shipped bundle reads the debug response globals", { skip: noBuild }, () => {
  assert.ok((scripts("dist").match(/storyOrchestratorDebug\w+/g) ?? []).length >= 13, "the bundle lost its debug responses");
});

test("D2: the shipped bundle carries the harness handles and the generate interceptor", { skip: noBuild }, () => {
  const bundle = scripts("dist");
  const names = surfaceNames(bundle);
  assert.deepEqual(["storyOrchestratorRuntime", "storyOrchestratorJudge", "storyOrchestratorLiveSuite", "storyOrchestratorStop"].filter((name) => !names.includes(name)), []);
  assert.ok(bundle.includes("talkControlInterceptor"), "the generate interceptor ST calls (manifest.json generate_interceptor) is gone");
});

test("D3: the shipped bundle carries the warm-batch lease", { skip: noBuild }, () => {
  assert.ok(scripts("dist").includes("A sprite-build batch is already open."));
});

test("D4: the shipped bundle carries every settings control the prod build used to strip", { skip: noBuild }, () => {
  const bundle = scripts("dist");
  assert.deepEqual(["so-inner-fanout", "so-chapter-fold", "so-chapter-story-so-far"].filter((marker) => !bundle.includes(marker)), []);
});

const FIXED_RESERVE = /MiB[^,;]{0,16}>=\s*\d{3,}/;

test("D5 (v2.7 32 W4): the bundle compares no GPU or RAM headroom against a fixed reserve", { skip: noBuild }, () => {
  assert.equal(FIXED_RESERVE.test(scripts("dist")), false);
});

test("D5 control: a planted fixed reserve is caught", () => {
  assert.ok(FIXED_RESERVE.test("return(s.gpuFreeMiB??0)>=2048&&(s.ramAvailableMiB??0)>=4096"));
  assert.equal(FIXED_RESERVE.test("return(s.gpuFreeMiB??0)>=s.reserveGpuMiB"), false);
});

test("D2 control: a planted global name is caught", () => {
  assert.deepEqual(surfaceNames("x.storyOrchestratorRuntime=m;y[\"storyOrchestratorStop\"]=s;story-orchestrator"), ["storyOrchestratorRuntime", "storyOrchestratorStop"]);
});
