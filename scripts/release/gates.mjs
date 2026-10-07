#!/usr/bin/env node
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const GATE_DEPS = {
  "test:replay": [],
  "test-storybook:ci": [],
  test: [],
  build: [],
  "build:dev": [],
  "test:debug": ["build"],
  typecheck: [],
  "typecheck:test": [],
  lint: [],
  "debug:typecheck": [],
  "test:plugin": [],
  "test:release": ["build", "build:dev"],
};

export const GATE_STEPS = Object.keys(GATE_DEPS);

export const DEFAULT_JOBS = Math.max(2, Math.min(6, Math.floor(availableParallelism() / 3)));

export const REPLAY_WORKERS_UNDER_GATES = "4";

const USAGE = `npm run gates -- [--serial] [--no-storybook] [--skip=a,b] [--jobs=n]
  Runs ${GATE_STEPS.join(", ")}.
  Each step starts as soon as the steps it needs are done (test:release after build and build:dev,
  test:debug after build: so-run-header reads dist/manifest.json, which webpack clears while it builds),
  longest first, at most --jobs at once (default ${DEFAULT_JOBS}); --serial runs one at a time.
  The first red step stops new starts; running steps finish and print.
  With typecheck in the run, the builds skip their own type check (SO_BUILD_TYPECHECK=0); the replay
  runs ${REPLAY_WORKERS_UNDER_GATES} workers beside the other steps (SO_REPLAY_WORKERS overrides).
  Per-change work: npm run gates:quick (scripts/release/gatesQuick.mjs --help).`;

export function gateSteps(argv = []) {
  const skip = new Set(argv.filter((arg) => arg.startsWith("--skip=")).flatMap((arg) => arg.slice(7).split(",")).filter(Boolean));
  if (argv.includes("--no-storybook")) skip.add("test-storybook:ci");
  const unknown = [...skip].filter((step) => !GATE_STEPS.includes(step));
  const serial = argv.includes("--serial");
  const jobsArg = argv.find((arg) => arg.startsWith("--jobs="));
  const jobs = serial ? 1 : Math.max(1, Number(jobsArg?.slice(7)) || DEFAULT_JOBS);
  const steps = GATE_STEPS.filter((step) => !skip.has(step));
  return { steps, skipped: GATE_STEPS.filter((step) => skip.has(step)), unknown, serial, jobs, help: argv.includes("--help") };
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
  const { steps, skipped, unknown, serial, jobs, help } = gateSteps(process.argv.slice(2));
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
  console.log(`\n=== gates: ${steps.length} step(s), at most ${jobs} at once${serial ? " (serial)" : ""}; each log prints when its step ends ===`);
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
    if (result.code !== 0) red = true;
  }
  const wall = ((Date.now() - started) / 1000).toFixed(1);
  const failed = results.filter((result) => result.code !== 0);
  const line = (result) => `  ${result.code === 0 ? "ok  " : "FAIL"} ${result.step} (${result.seconds}s, started at ${result.startedAt}s)`;
  if (failed.length || done.size < steps.length) {
    console.error(`\ngates: RED at ${failed.map((result) => `${result.step} (exit ${result.code})`).join(", ")} after ${wall}s`);
    for (const result of results) console.error(line(result));
    const notRun = steps.filter((step) => !done.has(step));
    if (notRun.length) console.error(`  NOT RUN: ${notRun.join(", ")}`);
    return 1;
  }
  console.log(`\ngates: all green in ${wall}s`);
  for (const result of results) console.log(line(result));
  if (skipped.length) console.log(`  SKIPPED: ${skipped.join(", ")} (say so in the gate record)`);
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = await main();
