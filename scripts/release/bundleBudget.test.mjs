import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BUNDLE_BUDGET_BYTES, budgetIssues } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const noProd = !existsSync(join(root, "dist", "manifest.json")) && "no dist/manifest.json: run npm run build first";
const config = (mode = "production") => createRequire(import.meta.url)(join(root, "webpack.config.js"))({}, { mode });

test("F1: the main entry is within the predeclared 1 250 000 byte budget", { skip: noProd }, () => {
  const manifest = JSON.parse(readFileSync(join(root, "dist", "manifest.json"), "utf8"));
  assert.deepEqual(budgetIssues(manifest), []);
});

test("F1 control: one byte over the budget fails, and the budget is the predeclared number", () => {
  assert.equal(BUNDLE_BUDGET_BYTES, 1300000);
  assert.deepEqual(budgetIssues({ bundle: { bytes: 1300001 } }), ["dist/index.js is 1300001 bytes, over the 1300000 byte budget"]);
  assert.deepEqual(budgetIssues({ bundle: {} }), ["dist/manifest.json names no bundle size"]);
});

test("F1: the one build fails on an overrun instead of warning, in every mode", () => {
  const budget = { hints: "error", maxEntrypointSize: BUNDLE_BUDGET_BYTES, maxAssetSize: BUNDLE_BUDGET_BYTES };
  assert.deepEqual(config().performance, budget);
  assert.deepEqual(config("development").performance, budget);
  assert.equal(config().output.path, join(root, "dist"));
  assert.equal(config("development").output.path, join(root, "dist"), "a watch build writes the same dist/ ST loads");
});

test("F1: the Studio graph (cytoscape) is not in the main entry, a lazy chunk carries it", { skip: noProd }, () => {
  const count = (name) => (readFileSync(join(root, "dist", name), "utf8").match(/cytoscape/g) ?? []).length;
  assert.equal(count("index.js"), 0);
  assert.ok(readdirSync(join(root, "dist")).filter((name) => /^\d+\.index\.js$/.test(name)).some((name) => count(name) > 0), "control: no chunk carries cytoscape, so the absence above proves nothing");
});
