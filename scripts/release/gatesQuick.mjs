#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const USAGE = `npm run gates:quick -- [--base <ref>] [--no-replay] [--full-jest]
  Per-change gates (v2.8 plan 26), against the files changed since the merge-base with --base
  (default master) plus uncommitted and untracked files:
    typecheck (whole project), typecheck:test when a test file changed,
    eslint on the changed src files, jest --findRelatedTests on the changed src files,
    the defect replay with --cached (rows no change can reach are reused),
    and the Storybook stories beside a changed component are listed (run npm run test-storybook:ci for them).
  A change to package.json, a jest/ts config or test/support runs the whole jest suite.
  Not a plan-close gate: plans close and releases ship on npm run gates.`;

const WHOLE_SUITE = [/^package(-lock)?\.json$/, /^jest\.config\.cjs$/, /^tsconfig[\w.]*\.json$/, /^test\/support\//, /^scripts\/jest-findings-reporter\.cjs$/];

const git = (args) => {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  return run.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
};

export function quickPlan(changed, { exists = (path) => existsSync(join(root, path)), storiesIn = listStories } = {}) {
  const present = changed.filter(exists);
  const source = present.filter((path) => /^src\/.*\.(ts|tsx)$/.test(path));
  const lint = source.filter((path) => !/\.test\.tsx?$/.test(path) && !/\.stories\.tsx$/.test(path));
  const whole = changed.some((path) => WHOLE_SUITE.some((pattern) => pattern.test(path)));
  const testsChanged = changed.some((path) => /\.test\.tsx?$/.test(path) || path.startsWith("test/"));
  const stories = [...new Set(source.flatMap((path) => (path.endsWith(".stories.tsx") ? [path] : storiesIn(path))))].sort();
  return { changed: present, lint, jest: whole ? "all" : source, typecheckTest: testsChanged || whole, stories };
}

function listStories(path) {
  const dir = dirname(join(root, path));
  const stem = basename(path).replace(/\.(test\.)?tsx?$/, "");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name === `${stem}.stories.tsx`).map((name) => `${dirname(path)}/${name}`);
}

function run(label, command, args) {
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("close", (code) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`\n=== gates:quick: ${label} (${seconds}s, exit ${code}) ===`);
      process.stdout.write(Buffer.concat(chunks));
      done({ label, code: code ?? 1, seconds });
    });
  });
}

const node = (script, args = []) => [process.execPath, [join(root, script), ...args]];

async function main(argv) {
  if (argv.includes("--help")) {
    console.log(USAGE);
    return 0;
  }
  const at = argv.indexOf("--base");
  const base = at >= 0 ? argv[at + 1] : "master";
  const mergeBase = git(["merge-base", "HEAD", base])[0];
  const changed = [...new Set([...git(["diff", "--name-only", mergeBase]), ...git(["ls-files", "--others", "--exclude-standard"])])].sort();
  const plan = quickPlan(changed);
  if (argv.includes("--full-jest")) plan.jest = "all";
  console.log(`gates:quick: ${plan.changed.length} changed file(s) since ${base} (${mergeBase.slice(0, 8)}); jest ${plan.jest === "all" ? "whole suite" : `related to ${plan.jest.length} src file(s)`}; lint ${plan.lint.length} file(s)`);
  const started = Date.now();
  const steps = [run("typecheck", ...node("node_modules/typescript/bin/tsc", ["--noEmit"]))];
  if (plan.typecheckTest) steps.push(run("typecheck:test", ...node("node_modules/typescript/bin/tsc", ["-p", "tsconfig.test.json"])));
  if (plan.lint.length) steps.push(run("lint (changed)", ...node("node_modules/eslint/bin/eslint.js", ["--ext", ".ts,.tsx", ...plan.lint])));
  if (plan.jest === "all") steps.push(run("jest", ...node("node_modules/jest/bin/jest.js", ["--ci", "--silent"])));
  else if (plan.jest.length) steps.push(run("jest (related)", ...node("node_modules/jest/bin/jest.js", ["--ci", "--silent", "--passWithNoTests", "--findRelatedTests", ...plan.jest])));
  if (!argv.includes("--no-replay")) steps.push(run("defect replay (--cached)", ...node("scripts/suite/defect-replay.mjs", ["--cached", "--workers", "4"])));
  const results = await Promise.all(steps);
  if (plan.stories.length) console.log(`\ngates:quick: stories beside the change (not run here): ${plan.stories.join(", ")}`);
  const red = results.filter((result) => result.code !== 0);
  const wall = ((Date.now() - started) / 1000).toFixed(1);
  for (const result of results) console.log(`  ${result.code === 0 ? "ok  " : "FAIL"} ${result.label} (${result.seconds}s)`);
  console.log(red.length ? `gates:quick: RED in ${wall}s` : `gates:quick: green in ${wall}s (per-change only; plans close on npm run gates)`);
  return red.length ? 1 : 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = await main(process.argv.slice(2));
