import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PROD_GLOBAL_ALLOWLIST, surfaceNames } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scripts = (dir) => readdirSync(join(root, dir)).filter((name) => name.endsWith(".js")).map((name) => readFileSync(join(root, dir, name), "utf8")).join("\n");
const noBuilds = !(existsSync(join(root, "dist", "index.js")) && existsSync(join(root, "dist-dev", "index.js"))) && "needs npm run build and npm run build:dev";

test("D1: the prod bundle reads no debug response global; the dev bundle does", { skip: noBuilds }, () => {
  assert.equal((scripts("dist").match(/storyOrchestratorDebug/g) ?? []).length, 0);
  assert.ok((scripts("dist-dev").match(/storyOrchestratorDebug\w+/g) ?? []).length >= 13, "control: the dev bundle lost its debug responses, so the grep proves nothing");
});

test("D2: the prod bundle names no storyOrchestrator global outside the allowlist; talkControlInterceptor stays", { skip: noBuilds }, () => {
  const prod = scripts("dist");
  assert.deepEqual(surfaceNames(prod).filter((name) => !PROD_GLOBAL_ALLOWLIST.includes(name)), []);
  assert.ok(prod.includes("talkControlInterceptor"), "the generate interceptor ST calls (manifest.json generate_interceptor) is gone");
  const dev = surfaceNames(scripts("dist-dev"));
  assert.ok(["storyOrchestratorRuntime", "storyOrchestratorJudge", "storyOrchestratorLiveSuite"].every((name) => dev.includes(name)), "control: the dev bundle lost its handles");
});

test("D3 (v2.7 31 §B): the prod bundle carries no warm-batch lease; the dev bundle does", { skip: noBuilds }, () => {
  const marker = "A sprite-build batch is already open.";
  assert.equal(scripts("dist").includes(marker), false);
  assert.ok(scripts("dist-dev").includes(marker), "control: the dev bundle lost the warm-batch lease, so the grep proves nothing");
});

test("D4 (v2.7 29): the prod bundle carries no dev-only settings control; the dev bundle does", { skip: noBuilds }, () => {
  const markers = ["so-inner-fanout", "so-chapter-fold", "so-chapter-story-so-far"];
  const prod = scripts("dist");
  assert.deepEqual(markers.filter((marker) => prod.includes(marker)), []);
  const dev = scripts("dist-dev");
  assert.deepEqual(markers.filter((marker) => !dev.includes(marker)), [], "control: the dev bundle lost a dev-only control, so the grep proves nothing");
});

test("D2 control: a planted global name is caught", () => {
  assert.deepEqual(surfaceNames("x.storyOrchestratorRuntime=m;y[\"storyOrchestratorStop\"]=s;story-orchestrator"), ["storyOrchestratorRuntime", "storyOrchestratorStop"]);
});
