import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { archiveSessions, changedFiles, SESSIONS_GIT_DIR } from "./sessionsArchive.mjs";

function run(gitDir, workTree, args) {
  const out = spawnSync("git", [`--git-dir=${gitDir}`, `--work-tree=${workTree}`, ...args], { cwd: workTree, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "so-sessions-archive-"));
  const gitDir = join(root, "repo.git");
  const workTree = join(root, "sessions");
  mkdirSync(workTree);
  spawnSync("git", ["init", "-q", `--separate-git-dir=${gitDir}`, workTree], { encoding: "utf8" });
  run(gitDir, workTree, ["config", "user.email", "t@example.invalid"]);
  run(gitDir, workTree, ["config", "user.name", "t"]);
  run(gitDir, workTree, ["config", "core.autocrlf", "false"]);
  writeFileSync(join(workTree, "seed.txt"), "seed\n");
  run(gitDir, workTree, ["add", "-A"]);
  run(gitDir, workTree, ["commit", "-q", "-m", "seed"]);
  return { gitDir, workTree };
}

const quiet = () => {};

test("the default git dir is the private so-sessions repo", () => {
  assert.equal(SESSIONS_GIT_DIR, "C:/dev/so-sessions.git");
});

test("a new or modified file over the gzip threshold is replaced by its -9 .gz before add, small files stay", async () => {
  const { gitDir, workTree } = sandbox();
  mkdirSync(join(workTree, "t1"));
  const big = Buffer.alloc(4096, "a");
  writeFileSync(join(workTree, "t1", "big.jsonl"), big);
  writeFileSync(join(workTree, "t1", "small.json"), "{}");
  writeFileSync(join(workTree, "seed.txt"), Buffer.alloc(2048, "b"));
  const result = await archiveSessions({ gitDir, workTree, push: false, gzipOver: 1024, refuseOver: 8192, log: quiet });
  assert.deepEqual(result.zipped.map((z) => z.file).sort(), ["seed.txt", "t1/big.jsonl"]);
  assert.equal(existsSync(join(workTree, "t1", "big.jsonl")), false);
  assert.deepEqual(gunzipSync(readFileSync(join(workTree, "t1", "big.jsonl.gz"))), big);
  const tracked = run(gitDir, workTree, ["ls-files"]).trim().split("\n").sort();
  assert.deepEqual(tracked, ["seed.txt.gz", "t1/big.jsonl.gz", "t1/small.json"]);
  assert.equal(result.committed, true);
  assert.equal(result.pushed, false);
  assert.deepEqual(changedFiles(gitDir, workTree), []);
});

test("an unchanged large tracked file is left alone", async () => {
  const { gitDir, workTree } = sandbox();
  writeFileSync(join(workTree, "old.bin"), Buffer.alloc(4096, "c"));
  run(gitDir, workTree, ["add", "-A"]);
  run(gitDir, workTree, ["commit", "-q", "-m", "old"]);
  writeFileSync(join(workTree, "note.txt"), "x");
  const result = await archiveSessions({ gitDir, workTree, push: false, gzipOver: 1024, refuseOver: 8192, log: quiet });
  assert.deepEqual(result.zipped, []);
  assert.equal(existsSync(join(workTree, "old.bin")), true);
});

test("a .gz still over the refuse threshold stops the archive before add, nothing committed", async () => {
  const { gitDir, workTree } = sandbox();
  writeFileSync(join(workTree, "noise.bin"), randomBytes(16384));
  const head = run(gitDir, workTree, ["rev-parse", "HEAD"]);
  await assert.rejects(
    archiveSessions({ gitDir, workTree, push: false, gzipOver: 1024, refuseOver: 8192, log: quiet }),
    /refusing to archive: over 8192 B after gzip: noise\.bin\.gz/,
  );
  assert.equal(run(gitDir, workTree, ["rev-parse", "HEAD"]), head);
  assert.equal(run(gitDir, workTree, ["diff", "--cached", "--name-only"]).trim(), "");
});

test("nothing changed commits nothing", async () => {
  const { gitDir, workTree } = sandbox();
  const result = await archiveSessions({ gitDir, workTree, push: false, log: quiet });
  assert.equal(result.committed, false);
});
