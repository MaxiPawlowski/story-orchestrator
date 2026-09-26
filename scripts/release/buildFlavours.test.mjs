import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { absolutePathValues, fileListIssues, flavourIssues, livereloadHits } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readManifest = (dir) => JSON.parse(readFileSync(join(root, dir, "manifest.json"), "utf8"));
const listing = (dir) => readdirSync(join(root, dir)).filter((name) => name !== "manifest.json").sort();
const noProd = !existsSync(join(root, "dist", "manifest.json")) && "no dist/manifest.json: run npm run build first";

test("dist/ holds the prod flavour; a dev manifest there is refused", { skip: noProd }, () => {
  assert.deepEqual(flavourIssues(readManifest("dist"), "prod"), []);
  assert.deepEqual(flavourIssues({ ...readManifest("dist"), flavor: "dev" }, "prod"), ["manifest flavor is \"dev\", expected \"prod\""]);
  assert.deepEqual(flavourIssues({ kind: "build-manifest" }, "prod"), ["manifest flavor is undefined, expected \"prod\""]);
});

test("the dev flavour exists in dist-dev/ and was built from the same source as dist/", { skip: noProd }, () => {
  assert.ok(existsSync(join(root, "dist-dev", "manifest.json")), "dist-dev/manifest.json is missing: run npm run build:dev");
  const dev = readManifest("dist-dev");
  assert.deepEqual(flavourIssues(dev, "dev"), []);
  assert.equal(dev.source.sha256, readManifest("dist").source.sha256, "the dev and prod builds come from different sources");
});

test("every file in dist/ is named in dist/manifest.json and every named file exists", { skip: noProd }, () => {
  const manifest = readManifest("dist");
  assert.deepEqual(fileListIssues(listing("dist"), manifest), []);
  assert.deepEqual(fileListIssues([...listing("dist"), "index.js.map"], manifest), ["index.js.map is in the output dir but not in the manifest"]);
  assert.deepEqual(fileListIssues(listing("dist").filter((name) => name !== "index.js"), manifest), ["index.js is in the manifest but not in the output dir"]);
});

test("the prod manifest names every emitted file with its hash", { skip: noProd }, () => {
  const manifest = readManifest("dist");
  const index = manifest.files.find((file) => file.path === "index.js");
  assert.ok(index, "index.js is not in the file list");
  assert.equal(index.sha256, manifest.bundle.sha256);
  assert.ok(manifest.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256) && file.bytes > 0));
  assert.ok(manifest.files.every((file) => !file.path.endsWith(".map")), "the prod build emitted a source map");
});

test("no string in the prod manifest is an absolute path", { skip: noProd }, () => {
  const manifest = readManifest("dist");
  assert.deepEqual(absolutePathValues(manifest), []);
  assert.deepEqual(absolutePathValues({ ...manifest, host: { ...manifest.host, root: "C:\\dev\\SillyTavern" } }), ["host.root"]);
  assert.deepEqual(absolutePathValues({ nested: [{ at: "/home/user/st" }] }), ["nested.0.at"]);
});

test("the prod bundle carries no livereload client", { skip: noProd }, () => {
  assert.equal(livereloadHits(readFileSync(join(root, "dist", "index.js"), "utf8")), 0);
  assert.equal(livereloadHits("document.write('<script src=\"//localhost:35729/livereload.js\"></script>')"), 1);
});
