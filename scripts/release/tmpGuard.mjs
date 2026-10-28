#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GUARD_PREFIX = "so-tmpguard-";

export const IGNORED = ["node-compile-cache"];

export const STALE_MS = 24 * 60 * 60 * 1000;

const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };

const USAGE = `node scripts/release/tmpGuard.mjs <node args...>
  Runs node with TEMP/TMP/TMPDIR pointed at a private ${GUARD_PREFIX}* dir under ${tmpdir()},
  then fails (exit 1, or the run's own code) when anything is left in it (${IGNORED.join(", ")} ignored),
  and removes the dir either way. Private per run, so concurrent runs never see each other's files.`;

export const guardEnv = (dir, base = process.env) => ({ ...base, TEMP: dir, TMP: dir, TMPDIR: dir });

export const leftovers = (dir) => readdirSync(dir).filter((name) => !IGNORED.includes(name)).sort();

export function sweepStale(root = tmpdir(), now = Date.now()) {
  let swept = 0;
  for (const name of readdirSync(root).filter((entry) => entry.startsWith(GUARD_PREFIX))) {
    const path = join(root, name);
    try {
      if (now - statSync(path).mtimeMs < STALE_MS) continue;
      rmSync(path, RM);
      swept += 1;
    } catch {
      continue;
    }
  }
  return swept;
}

export function guarded(args, { root = tmpdir(), stdio = "inherit" } = {}) {
  const dir = mkdtempSync(join(root, GUARD_PREFIX));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio, env: guardEnv(dir) });
    const finish = (code) => {
      const left = leftovers(dir);
      rmSync(dir, RM);
      resolve({ code, left, dir });
    };
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code ?? 1));
  });
}

async function main(argv) {
  if (!argv.length || argv[0] === "--help") {
    console.log(USAGE);
    return argv.length ? 0 : 2;
  }
  sweepStale();
  const { code, left } = await guarded(argv);
  if (!left.length) return code;
  console.error(`\ntmp guard: node ${argv.join(" ")} left ${left.length} entr${left.length === 1 ? "y" : "ies"} in its temp dir (removed now): ${left.slice(0, 40).join(", ")}${left.length > 40 ? ", ..." : ""}`);
  console.error("tmp guard: a test that makes a temp dir removes it (scripts/lib/testTemp.mjs testTempDir/testTempDirSync)");
  return code || 1;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = await main(process.argv.slice(2));
