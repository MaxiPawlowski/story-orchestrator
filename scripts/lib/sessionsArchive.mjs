import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, statSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { pathToFileURL } from "node:url";

export const SESSIONS_GIT_DIR = "C:/dev/so-sessions.git";
export const GZIP_OVER_BYTES = 90 * 1024 * 1024;
export const REFUSE_OVER_BYTES = 95 * 1024 * 1024;

function git(gitDir, workTree, args) {
  const out = spawnSync("git", [`--git-dir=${gitDir}`, `--work-tree=${workTree}`, ...args], { cwd: workTree, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (out.error) throw out.error;
  if (out.status !== 0) throw new Error(`git ${args.join(" ")} failed (${out.status}): ${(out.stderr || out.stdout).trim()}`);
  return out.stdout;
}

export function workTreeOf(gitDir) {
  const out = spawnSync("git", [`--git-dir=${gitDir}`, "config", "--get", "core.worktree"], { encoding: "utf8" });
  const value = String(out.stdout ?? "").trim();
  if (!value) throw new Error(`${gitDir} has no core.worktree`);
  return value;
}

export function changedFiles(gitDir, workTree) {
  const raw = git(gitDir, workTree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const entries = raw.split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (status[0] === "R" || status[0] === "C") i += 1;
    if (status.includes("D")) continue;
    files.push(path);
  }
  return files;
}

export async function gzipLarge(workTree, files, { gzipOver = GZIP_OVER_BYTES } = {}) {
  const zipped = [];
  for (const rel of files) {
    if (rel.endsWith(".gz")) continue;
    const abs = join(workTree, rel);
    if (!existsSync(abs)) continue;
    const size = statSync(abs).size;
    if (size <= gzipOver) continue;
    const gz = `${abs}.gz`;
    await pipeline(createReadStream(abs), createGzip({ level: 9 }), createWriteStream(gz));
    unlinkSync(abs);
    zipped.push({ file: rel, gz: `${rel}.gz`, bytes: size, gzBytes: statSync(gz).size });
  }
  return zipped;
}

export function oversized(workTree, files, { refuseOver = REFUSE_OVER_BYTES } = {}) {
  return files
    .map((rel) => ({ rel, abs: join(workTree, rel) }))
    .filter(({ abs }) => existsSync(abs) && statSync(abs).size > refuseOver)
    .map(({ rel, abs }) => ({ file: rel, bytes: statSync(abs).size }));
}

export async function archiveSessions({
  gitDir = SESSIONS_GIT_DIR,
  workTree = workTreeOf(gitDir),
  message = "session evidence",
  push = true,
  gzipOver = GZIP_OVER_BYTES,
  refuseOver = REFUSE_OVER_BYTES,
  log = console.log,
} = {}) {
  const zipped = await gzipLarge(workTree, changedFiles(gitDir, workTree), { gzipOver });
  for (const z of zipped) log(`gzipped ${z.file} (${z.bytes} B) -> ${z.gz} (${z.gzBytes} B)`);
  const tooBig = oversized(workTree, changedFiles(gitDir, workTree), { refuseOver });
  if (tooBig.length > 0) {
    const names = tooBig.map((t) => `${t.file} (${t.bytes} B)`).join(", ");
    throw new Error(`refusing to archive: over ${refuseOver} B after gzip: ${names}`);
  }
  git(gitDir, workTree, ["add", "-A"]);
  const staged = git(gitDir, workTree, ["diff", "--cached", "--name-only"]).trim();
  if (!staged) {
    log("nothing to archive");
    return { zipped, committed: false, pushed: false };
  }
  git(gitDir, workTree, ["commit", "-q", "-m", message]);
  if (push) git(gitDir, workTree, ["push", "-q", "origin", "master"]);
  return { zipped, committed: true, pushed: push };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  archiveSessions().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
