#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const GATE_DEPS = {
  "test:replay": [],
  "test-storybook:ci": [],
  test: [],
  build: [],
  "test:debug": ["build"],
  typecheck: [],
  "typecheck:test": [],
  lint: [],
  "debug:typecheck": [],
  "test:plugin": [],
  "test:release": ["build"],
};

export const GATE_STEPS = Object.keys(GATE_DEPS);

export const DEFAULT_JOBS = Math.max(2, Math.min(6, Math.floor(availableParallelism() / 3)));

export const REPLAY_WORKERS_UNDER_GATES = "4";

export const RECORD_PATH = resolve(root, ".build", "gates-last.json");

export const RESUME_INPUT_FILES = [".st-root", "test/sessions/adolion-stories.json", "package-lock.json", "node_modules/.package-lock.json"];

export const RESUME_ENV = /^(SO_|ST_|NODE_|JEST_|CI$)/;

const USAGE = `npm run gates -- [--serial] [--no-storybook] [--skip=a,b] [--jobs=n] [--resume]
  Runs ${GATE_STEPS.join(", ")}.
  Each step starts as soon as the steps it needs are done (test:release and
  test:debug after build: so-run-header reads dist/manifest.json, which webpack clears while it builds),
  longest first, at most --jobs at once (default ${DEFAULT_JOBS}); --serial runs one at a time.
  The first red step stops new starts; running steps finish and print.
  With typecheck in the run, the builds skip their own type check (SO_BUILD_TYPECHECK=0); the replay
  runs ${REPLAY_WORKERS_UNDER_GATES} workers beside the other steps (SO_REPLAY_WORKERS overrides).
  Every finished step is recorded in .build/gates-last.json against a hash of the working tree
  (HEAD, the diff against it, untracked files), the gitignored inputs the steps read
  (${RESUME_INPUT_FILES.join(", ")}), the node version and the SO_/ST_/NODE_/JEST_/CI environment.
  --resume (opt-in) reuses the steps already green on that exact state and runs the rest: for a flaky
  or environment failure, not a code change (any edit changes the hash, so every step runs again).
  A step whose dependant reruns reruns too (build before test:debug/test:release), and a step that
  ends on a changed tree is not kept.
  Per-change work: npm run gates:quick (scripts/release/gatesQuick.mjs --help).`;

export function gateSteps(argv = []) {
  const skip = new Set(argv.filter((arg) => arg.startsWith("--skip=")).flatMap((arg) => arg.slice(7).split(",")).filter(Boolean));
  if (argv.includes("--no-storybook")) skip.add("test-storybook:ci");
  const unknown = [...skip].filter((step) => !GATE_STEPS.includes(step));
  const serial = argv.includes("--serial");
  const jobsArg = argv.find((arg) => arg.startsWith("--jobs="));
  const jobsValue = jobsArg?.slice(7) ?? (argv.includes("--jobs") ? argv[argv.indexOf("--jobs") + 1] : undefined);
  const jobs = serial ? 1 : Math.max(1, Number(jobsValue) || DEFAULT_JOBS);
  const steps = GATE_STEPS.filter((step) => !skip.has(step));
  return { steps, skipped: GATE_STEPS.filter((step) => skip.has(step)), unknown, serial, jobs, resume: argv.includes("--resume"), help: argv.includes("--help") };
}

const runGit = (args, input) => execFileSync("git", args, { cwd: root, input, maxBuffer: 1 << 30 });

export function resumeInputs(env = process.env, read = (path) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path)) : "absent")) {
  const vars = Object.keys(env).filter((key) => RESUME_ENV.test(key)).sort().map((key) => `${key}=${env[key]}`);
  return [process.version, process.platform, process.arch, ...vars, ...RESUME_INPUT_FILES.flatMap((path) => [path, createHash("sha256").update(read(path)).digest("hex")])].join("\0");
}

export function treeId(git = runGit, inputs = resumeInputs()) {
  const hash = createHash("sha256");
  hash.update(inputs);
  hash.update(git(["rev-parse", "HEAD"]));
  hash.update(git(["diff", "HEAD", "--binary"]));
  const untracked = git(["ls-files", "-o", "--exclude-standard", "-z"]).toString().split("\0").filter(Boolean).sort();
  if (untracked.length) {
    hash.update(untracked.join("\0"));
    hash.update(git(["hash-object", "--stdin-paths"], untracked.join("\n")));
  }
  return hash.digest("hex");
}

export function reusableSteps(record, tree, steps) {
  const green = new Set(record && tree && record.tree === tree ? steps.filter((step) => record.steps?.[step]?.code === 0) : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of steps) {
      if (green.has(step)) continue;
      for (const dep of GATE_DEPS[step] ?? []) if (green.delete(dep)) changed = true;
    }
  }
  return steps.filter((step) => green.has(step));
}

export function readRecord(path = RECORD_PATH) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeRecord(record, path = RECORD_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 1)}\n`);
}

export function nextReady(steps, done, running) {
  return steps.find((step) => !done.has(step) && !running.has(step) && GATE_DEPS[step].every((dep) => done.has(dep) || !steps.includes(dep)));
}

export function stepEnv(steps, serial, base = process.env) {
  const env = { ...base };
  if (!serial && !base.SO_REPLAY_WORKERS) env.SO_REPLAY_WORKERS = REPLAY_WORKERS_UNDER_GATES;
  if (steps.includes("typecheck") && base.SO_BUILD_TYPECHECK === undefined) env.SO_BUILD_TYPECHECK = "0";
  return env;
}

function runStep(step, live, env) {
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn("npm", ["run", step], { cwd: root, env, stdio: live ? "inherit" : ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
    const chunks = [];
    if (!live) {
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.on("data", (chunk) => chunks.push(chunk));
    }
    child.on("close", (code, signal) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (!live) {
        console.log(`\n=== gates: npm run ${step} (${seconds}s, exit ${code ?? signal}) ===`);
        process.stdout.write(Buffer.concat(chunks));
      }
      done({ step, code: code ?? 1, signal, seconds });
    });
  });
}

async function main() {
  const { steps, skipped, unknown, serial, jobs, resume, help } = gateSteps(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return 0;
  }
  if (unknown.length) {
    console.error(`gates: unknown step(s) ${unknown.join(", ")}; the chain is ${GATE_STEPS.join(", ")}`);
    return 2;
  }
  const started = Date.now();
  const env = stepEnv(steps, serial);
  const results = [];
  const done = new Set();
  const running = new Map();
  let red = false;
  let kept = true;
  const tree = treeId();
  const previous = readRecord();
  const record = { tree, steps: previous?.tree === tree ? { ...previous.steps } : {} };
  const reused = resume ? reusableSteps(previous, tree, steps) : [];
  for (const step of reused) {
    done.add(step);
    results.push({ step, code: 0, seconds: previous.steps[step].seconds, reused: previous.steps[step].at });
  }
  if (resume) console.log(`\n=== gates: --resume reuses ${reused.length} step(s) green on this tree${reused.length ? `: ${reused.join(", ")}` : ""} ===`);
  console.log(`\n=== gates: ${steps.length - reused.length} step(s), at most ${jobs} at once${serial ? " (serial)" : ""}; each log prints when its step ends ===`);
  while (done.size < steps.length) {
    let step;
    while (!red && running.size < jobs && (step = nextReady(steps, done, running))) {
      const name = step;
      const offset = ((Date.now() - started) / 1000).toFixed(1);
      if (serial) console.log(`\n=== gates: npm run ${name} ===`);
      else console.log(`gates: start ${name} at ${offset}s`);
      running.set(name, runStep(name, serial, env).then((result) => ({ ...result, startedAt: Number(offset) })));
    }
    if (!running.size) break;
    const result = await Promise.race(running.values());
    running.delete(result.step);
    done.add(result.step);
    results.push(result);
    if (kept && treeId() !== tree) {
      kept = false;
      writeRecord({ tree: null, steps: {} });
      console.error(`\ngates: the working tree changed during ${result.step}; nothing is kept for --resume`);
    }
    if (kept) {
      record.steps[result.step] = { code: result.code, seconds: result.seconds, at: new Date().toISOString() };
      writeRecord(record);
    }
    if (result.code !== 0) red = true;
  }
  const wall = ((Date.now() - started) / 1000).toFixed(1);
  const failed = results.filter((result) => result.code !== 0);
  const line = (result) => (result.reused ? `  ok   ${result.step} (reused: green on this tree at ${result.reused})`
    : `  ${result.code === 0 ? "ok  " : "FAIL"} ${result.step} (${result.seconds}s, started at ${result.startedAt}s)`);
  if (failed.length || done.size < steps.length) {
    console.error(`\ngates: RED at ${failed.map((result) => `${result.step} (exit ${result.code})`).join(", ")} after ${wall}s`);
    for (const result of results) console.error(line(result));
    const notRun = steps.filter((step) => !done.has(step));
    if (notRun.length) console.error(`  NOT RUN: ${notRun.join(", ")}`);
    console.error("  Flaky or environment failure? Fix it, then npm run gates -- --resume reruns only what is not green on this tree.");
    return 1;
  }
  console.log(`\ngates: all green in ${wall}s${reused.length ? ` (${reused.length} step(s) reused from a run on this exact tree)` : ""}`);
  for (const result of results) console.log(line(result));
  if (skipped.length) console.log(`  SKIPPED: ${skipped.join(", ")} (say so in the gate record)`);
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = await main();
