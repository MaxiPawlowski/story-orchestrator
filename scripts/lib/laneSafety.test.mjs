import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testTempDirSync } from "./testTemp.mjs";
import { createHarnessFs, createLaneFs, laneSafetyContext, laneWriteIssue, LaneSafetyError, linksUnder, protectedIssue, realPathDeep, servedTreeIssue } from "./laneSafety.mjs";

function world() {
  const base = testTempDirSync("so-lane-safety-");
  const owner = join(base, "SillyTavern");
  const user = join(owner, "data", "default-user");
  mkdirSync(join(owner, "src"), { recursive: true });
  writeFileSync(join(owner, "src", "plugin-loader.js"), "");
  mkdirSync(user, { recursive: true });
  writeFileSync(join(user, "settings.json"), '{"owner":true}');
  writeFileSync(join(user, "secrets.json"), '{"key":"owner"}');
  const repo = join(base, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, ".st-root"), owner);
  const lanes = join(base, "so-lanes");
  mkdirSync(lanes);
  const env = { SO_LANES_ROOT: lanes };
  return { base, owner, user, repo, lanes, env, context: () => laneSafetyContext(env, repo) };
}

const junction = (target, path) => symlinkSync(target, path, "junction");

test("a lane path that is a junction to the owner's data is refused (planted control: the plain lane passes)", async () => {
  const w = world();
  const fs = createLaneFs(w.context);
  const plain = join(w.lanes, "1", "data", "default-user");
  mkdirSync(plain, { recursive: true });
  await fs.writeFile(join(plain, "settings.json"), "{}");
  assert.equal(readFileSync(join(plain, "settings.json"), "utf8"), "{}");
  mkdirSync(join(w.lanes, "2", "data"), { recursive: true });
  junction(w.user, join(w.lanes, "2", "data", "default-user"));
  const target = join(w.lanes, "2", "data", "default-user", "settings.json");
  assert.equal(realPathDeep(target), realPathDeep(join(w.user, "settings.json")));
  await assert.rejects(fs.writeFile(target, "{}"), (error) => error instanceof LaneSafetyError && /owner's SillyTavern data/.test(error.message));
  assert.throws(() => fs.writeFileSync(join(w.lanes, "2", "data", "default-user", "secrets.json"), "{}"), LaneSafetyError);
  await assert.rejects(fs.rm(join(w.lanes, "2", "data", "default-user", "secrets.json"), { force: true }), LaneSafetyError);
  assert.equal(readFileSync(join(w.user, "settings.json"), "utf8"), '{"owner":true}');
  assert.equal(readFileSync(join(w.user, "secrets.json"), "utf8"), '{"key":"owner"}');
});

test("a junction higher up (the whole lane data dir) and a not-yet-existing file under it are refused", () => {
  const w = world();
  mkdirSync(join(w.lanes, "3"), { recursive: true });
  junction(join(w.owner, "data"), join(w.lanes, "3", "data"));
  assert.match(laneWriteIssue(join(w.lanes, "3", "data", "default-user", "new", "file.json"), w.context()), /owner's SillyTavern data/);
});

test("a path outside the lanes root is refused even when it is not the owner's", () => {
  const w = world();
  const elsewhere = join(w.base, "elsewhere");
  mkdirSync(elsewhere);
  assert.match(laneWriteIssue(join(elsewhere, "x.json"), w.context()), /outside the lanes root/);
  const outward = join(w.lanes, "4");
  junction(elsewhere, outward);
  assert.match(laneWriteIssue(join(outward, "x.json"), w.context()), /outside the lanes root/);
  assert.equal(laneWriteIssue(join(w.lanes, "5", "x.json"), w.context()), null);
});

test("a lanes root inside the owner's data or ST tree refuses everything", () => {
  const w = world();
  const inside = join(w.user, "lanes");
  const context = laneSafetyContext({ SO_LANES_ROOT: inside }, w.repo);
  assert.match(laneWriteIssue(join(inside, "1", "x"), context), /lanes root .* inside the owner's SillyTavern data/);
  const inTree = laneSafetyContext({ SO_LANES_ROOT: join(w.owner, "lanes") }, w.repo);
  assert.match(laneWriteIssue(join(w.owner, "lanes", "1", "x"), inTree), /inside a SillyTavern tree/);
});

test("an ST copy whose data/default-user is a junction to the owner's data is refused; the owner tree and a real copy pass", () => {
  const w = world();
  const copy = join(w.base, "st-copy");
  mkdirSync(join(copy, "data"), { recursive: true });
  junction(w.user, join(copy, "data", "default-user"));
  assert.match(servedTreeIssue(copy, { ST_ROOT: copy }, w.repo), /junction or symlink/);
  const copyData = join(w.base, "st-copy-2");
  mkdirSync(copyData);
  junction(join(w.owner, "data"), join(copyData, "data"));
  assert.match(servedTreeIssue(copyData, { ST_ROOT: copyData }, w.repo), /junction or symlink/);
  assert.equal(servedTreeIssue(w.owner, {}, w.repo), null);
  const real = join(w.base, "st-real-copy");
  mkdirSync(join(real, "data", "default-user"), { recursive: true });
  assert.equal(servedTreeIssue(real, { ST_ROOT: real }, w.repo), null);
});

test("ST_ROOT pointing at a copy still protects the owner's data it links to", () => {
  const w = world();
  const copy = join(w.base, "st-copy");
  mkdirSync(join(copy, "data"), { recursive: true });
  junction(w.user, join(copy, "data", "default-user"));
  writeFileSync(join(w.repo, ".st-root"), "");
  const context = laneSafetyContext({ SO_LANES_ROOT: w.lanes, ST_ROOT: copy }, w.repo);
  assert.match(protectedIssue(join(w.user, "settings.json"), context), /owner's SillyTavern data/);
});

test("cp dereferences links so a seed never copies a junction, and recursive rm refuses a tree holding a link into the owner's data", async () => {
  const w = world();
  const fs = createLaneFs(w.context);
  const source = join(w.base, "src-tree");
  mkdirSync(source);
  writeFileSync(join(source, "a.json"), "a");
  junction(w.user, join(source, "linked"));
  const dest = join(w.lanes, "6", "data", "default-user");
  await fs.cp(source, dest, { recursive: true });
  assert.deepEqual(linksUnder(dest), []);
  assert.equal(readFileSync(join(dest, "linked", "settings.json"), "utf8"), '{"owner":true}');
  const trap = join(w.lanes, "7");
  mkdirSync(trap);
  junction(w.user, join(trap, "user"));
  await assert.rejects(fs.rm(trap, { recursive: true, force: true }), /link to .* owner's SillyTavern data/);
  assert.ok(existsSync(join(w.user, "secrets.json")));
});

test("harness fs refuses only the owner's data", async () => {
  const w = world();
  const fs = createHarnessFs(() => ({ protected: laneSafetyContext(w.env, w.repo).protected }));
  const out = join(w.base, "report.json");
  await fs.writeFile(out, "{}");
  assert.ok(existsSync(out));
  await assert.rejects(fs.writeFile(join(w.user, "settings.json"), "{}"), LaneSafetyError);
});
