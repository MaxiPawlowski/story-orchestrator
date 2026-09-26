import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PROD_GLOBAL_ALLOWLIST } from "./buildChecks.mjs";
import { bundleIssues, chunkRequestIssues, consoleIssues, globalIssues } from "./smokeChecks.mjs";

const base = "http://127.0.0.1:8000/scripts/extensions/third-party/story-orchestrator/dist";

test("SM 5: only allowlisted storyOrchestrator globals, and the generate interceptor stays", () => {
  assert.deepEqual(globalIssues(["SillyTavern", "talkControlInterceptor", "jQuery"], PROD_GLOBAL_ALLOWLIST), []);
  assert.deepEqual(globalIssues(["talkControlInterceptor", "storyOrchestratorRuntime"], PROD_GLOBAL_ALLOWLIST), ["the artifact exposes storyOrchestratorRuntime, which is not on the prod allowlist"]);
  assert.deepEqual(globalIssues(["SillyTavern"], PROD_GLOBAL_ALLOWLIST), ["talkControlInterceptor is missing: manifest.json generate_interceptor names it"]);
});

test("SM 3b: every lazy chunk the Studio loads answers 200, and a run that loaded none is not a pass", () => {
  assert.deepEqual(chunkRequestIssues([{ url: `${base}/index.js`, status: 200 }, { url: `${base}/345.index.js`, status: 200 }, { url: `${base}/999.index.js`, status: 200 }]), []);
  assert.deepEqual(chunkRequestIssues([{ url: `${base}/345.index.js`, status: 404 }]), [`${base}/345.index.js answered 404`]);
  assert.equal(chunkRequestIssues([{ url: `${base}/index.js`, status: 200 }]).length, 1);
  assert.deepEqual(consoleIssues(["ok", "ChunkLoadError: Loading chunk 345 failed.", "[story-orchestrator] Failed to load cytoscape-dagre"]).length, 2);
});

test("SM 6: the served bundle is the built one, and the built one is the released one", () => {
  assert.deepEqual(bundleIssues({ served: "a".repeat(64), built: "a".repeat(64) }), []);
  assert.deepEqual(bundleIssues({ served: "a".repeat(64), built: "a".repeat(64), released: "a".repeat(64) }), []);
  assert.equal(bundleIssues({ served: "b".repeat(64), built: "a".repeat(64) }).length, 1);
  assert.equal(bundleIssues({ served: "a".repeat(64), built: "a".repeat(64), released: "c".repeat(64) }).length, 1);
  assert.equal(bundleIssues({ served: null, built: null }).length, 1);
});
