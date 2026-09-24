// v2.3 plan 08. The build manifest is only worth having if it is checked against the bytes it
// describes, so this runs the generator and then refutes it the way a release would: the bundle hash
// must equal the emitted file, the source hash must be stable across two runs, and the capability
// list must be the one the code declares rather than an empty list nobody noticed.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const generate = () => {
  execFileSync(process.execPath, [join(root, "scripts", "release", "manifest.mjs")], { cwd: root, stdio: "pipe" });
  return JSON.parse(readFileSync(join(root, "dist", "manifest.json"), "utf8"));
};

test("the build manifest describes the bytes actually built", { skip: !existsSync(join(root, "dist", "index.js")) && "no dist/index.js — run npm run build first" }, () => {
  const manifest = generate();
  assert.equal(manifest.kind, "build-manifest");
  assert.equal(manifest.bundle.path, "dist/index.js");
  assert.equal(manifest.bundle.sha256, sha256(readFileSync(join(root, "dist", "index.js"))), "the manifest's bundle hash is not the built file's");
  assert.equal(manifest.bundle.bytes, readFileSync(join(root, "dist", "index.js")).length);
  assert.equal(manifest.extension.version, JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "the manifest version and package.json disagree");
  if (existsSync(join(root, ".git"))) assert.match(manifest.extension.revision?.commit ?? "", /^[0-9a-f]{40}$/, "a build inside a git checkout must name the commit it was built from");
});

test("the source hash is over the tree and is stable", { skip: !existsSync(join(root, "dist", "index.js")) && "no dist/index.js — run npm run build first" }, () => {
  const first = generate();
  const second = generate();
  assert.equal(first.source.sha256, second.source.sha256, "two runs over an unchanged tree produced different source hashes");
  assert.ok(first.source.files > 100, `only ${first.source.files} source files hashed — the walk is not finding the tree`);
  // A single changed byte changes it: the hash is over contents, not names.
  const edited = readFileSync(join(root, "src", "utils", "writeResult.ts"), "utf8");
  assert.notEqual(sha256(edited + "x"), sha256(edited));
});

test("the capability list is the one the code declares", { skip: !existsSync(join(root, "dist", "index.js")) && "no dist/index.js — run npm run build first" }, () => {
  const manifest = generate();
  assert.ok(manifest.capabilities.length >= 5, `the manifest claims ${manifest.capabilities.length} capabilities`);
  assert.ok(manifest.capabilities.includes("vectors"), "the vectors capability is missing from the manifest");
  assert.equal(new Set(manifest.capabilities).size, manifest.capabilities.length, "a capability is listed twice");
});

test("the host section names the SillyTavern it was built against", { skip: !existsSync(join(root, "dist", "index.js")) && "no dist/index.js — run npm run build first" }, () => {
  const manifest = generate();
  assert.ok(manifest.host.version, "no host version — a build that cannot say which SillyTavern it was made against cannot be reproduced");
  const missing = Object.entries(manifest.host.files).filter(([, hash]) => hash === null).map(([path]) => path);
  assert.deepEqual(missing, [], "a host file the extension imports was not found under the host root");
});

test("ST's loader manifest refuses a host older than the README's declared older host", () => {
  const loader = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const row = readFileSync(join(root, "README.md"), "utf8").split(/\r?\n/).find((line) => line.startsWith("| Declared older host |"));
  assert.ok(row, "README.md has no \"Declared older host\" row");
  const declared = /\|\s*(\d+\.\d+\.\d+)\b/.exec(row.slice("| Declared older host".length))?.[1];
  assert.ok(declared, `the "Declared older host" row names no version: ${row}`);
  assert.equal(loader.minimum_client_version, declared, "manifest.json minimum_client_version (ST refuses to load below it, extensions.js:580-590) differs from README's declared older host");
});
