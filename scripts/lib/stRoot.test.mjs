import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { configuredStRoot, lanesRootFor, requireStRoot, stRootIssue } from "./stRoot.mjs";

const repo = () => mkdtempSync(join(tmpdir(), "so-stroot-"));

test("ST_ROOT wins over .st-root", () => {
  const dir = repo();
  writeFileSync(join(dir, ".st-root"), "D:/other\n");
  assert.equal(configuredStRoot({ ST_ROOT: "E:/st" }, dir), resolve("E:/st"));
  assert.equal(configuredStRoot({}, dir), resolve("D:/other"));
});

test("nothing configured is null and requireStRoot refuses, never derives a parent", () => {
  const dir = repo();
  assert.equal(configuredStRoot({}, dir), null);
  assert.throws(() => requireStRoot({}, dir), /ST_ROOT is not set/);
  assert.throws(() => lanesRootFor({}, dir), /ST_ROOT is not set/);
});

test("a directory that is not SillyTavern is refused by name", () => {
  const dir = repo();
  assert.match(stRootIssue(dir), /no src\/plugin-loader\.js/);
  assert.throws(() => requireStRoot({ ST_ROOT: dir }, dir), /not a SillyTavern root/);
});

test("lanes sit beside the ST root unless SO_LANES_ROOT says otherwise", () => {
  const dir = repo();
  assert.equal(lanesRootFor({ ST_ROOT: "C:/dev/SillyTavern-MainBranch" }, dir), resolve("C:/dev/so-lanes"));
  assert.equal(lanesRootFor({ SO_LANES_ROOT: "F:/lanes" }, dir), resolve("F:/lanes"));
});
