import assert from "node:assert/strict";
import { existsSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { testTempDirSync } from "../lib/testTemp.mjs";
import { GUARD_PREFIX, guardEnv, guarded, leftovers, STALE_MS, sweepStale } from "./tmpGuard.mjs";

const LEAK = "const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); fs.mkdtempSync(path.join(os.tmpdir(), 'so-leak-'));";
const CLEAN = "const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); fs.rmSync(fs.mkdtempSync(path.join(os.tmpdir(), 'so-clean-')), { recursive: true });";

test("a run that leaves a temp dir is named and its private dir is removed", async () => {
  const root = testTempDirSync("so-guard-root-");
  const result = await guarded(["-e", LEAK], { root, stdio: "ignore" });
  assert.equal(result.code, 0);
  assert.equal(result.left.length, 1);
  assert.match(result.left[0], /^so-leak-/);
  assert.equal(existsSync(result.dir), false);
});

test("a run that cleans up leaves nothing, and a failing run keeps its own exit code", async () => {
  const root = testTempDirSync("so-guard-root-");
  assert.deepEqual((await guarded(["-e", CLEAN], { root, stdio: "ignore" })).left, []);
  assert.equal((await guarded(["-e", "process.exit(3)"], { root, stdio: "ignore" })).code, 3);
});

test("the child sees the private dir as every temp variable, and reusable caches are ignored", () => {
  assert.deepEqual([guardEnv("X", {}).TEMP, guardEnv("X", {}).TMP, guardEnv("X", {}).TMPDIR], ["X", "X", "X"]);
  const dir = testTempDirSync("so-guard-left-");
  mkdirSync(join(dir, "node-compile-cache"));
  mkdirSync(join(dir, "so-x-1"));
  assert.deepEqual(leftovers(dir), ["so-x-1"]);
});

test("only guard dirs older than a day are swept, so a concurrent run keeps its own", () => {
  const root = testTempDirSync("so-guard-sweep-");
  for (const name of [`${GUARD_PREFIX}old`, `${GUARD_PREFIX}new`, "so-other-old"]) mkdirSync(join(root, name));
  const old = new Date(Date.now() - STALE_MS - 60_000);
  utimesSync(join(root, `${GUARD_PREFIX}old`), old, old);
  utimesSync(join(root, "so-other-old"), old, old);
  assert.equal(sweepStale(root), 1);
  assert.deepEqual([existsSync(join(root, `${GUARD_PREFIX}old`)), existsSync(join(root, `${GUARD_PREFIX}new`)), existsSync(join(root, "so-other-old"))], [false, true, true]);
});
