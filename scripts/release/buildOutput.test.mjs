import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { absolutePathValues, fileListIssues, livereloadHits } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readManifest = (dir) => JSON.parse(readFileSync(join(root, dir, "manifest.json"), "utf8"));
const listing = (dir) => readdirSync(join(root, dir)).filter((name) => name !== "manifest.json").sort();
const noBuild = !existsSync(join(root, "dist", "manifest.json")) && "no dist/manifest.json: run npm run build first";

test("there is one build: the manifest names no flavor", { skip: noBuild }, () => {
  assert.equal("flavor" in readManifest("dist"), false);
});

test("every file in dist/ is named in dist/manifest.json and every named file exists", { skip: noBuild }, () => {
  const manifest = readManifest("dist");
  assert.deepEqual(fileListIssues(listing("dist"), manifest), []);
  assert.deepEqual(fileListIssues([...listing("dist"), "index.js.map"], manifest), ["index.js.map is in the output dir but not in the manifest"]);
  assert.deepEqual(fileListIssues(listing("dist").filter((name) => name !== "index.js"), manifest), ["index.js is in the manifest but not in the output dir"]);
});

test("the manifest names every emitted file with its hash", { skip: noBuild }, () => {
  const manifest = readManifest("dist");
  const index = manifest.files.find((file) => file.path === "index.js");
  assert.ok(index, "index.js is not in the file list");
  assert.equal(index.sha256, manifest.bundle.sha256);
  assert.ok(manifest.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256) && file.bytes > 0));
  assert.ok(manifest.files.every((file) => !file.path.endsWith(".map")), "npm run build emitted a source map");
});

test("no string in the manifest is an absolute path", { skip: noBuild }, () => {
  const manifest = readManifest("dist");
  assert.deepEqual(absolutePathValues(manifest), []);
  assert.deepEqual(absolutePathValues({ ...manifest, host: { ...manifest.host, root: "C:\\dev\\SillyTavern" } }), ["host.root"]);
  assert.deepEqual(absolutePathValues({ nested: [{ at: "/home/user/st" }] }), ["nested.0.at"]);
});

test("the bundle carries no livereload client", { skip: noBuild }, () => {
  assert.equal(livereloadHits(readFileSync(join(root, "dist", "index.js"), "utf8")), 0);
  assert.equal(livereloadHits("document.write('<script src=\"//localhost:35729/livereload.js\"></script>')"), 1);
});
