#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const GATE_STEPS = [
  "typecheck",
  "typecheck:test",
  "lint",
  "test",
  "build",
  "build:dev",
  "test:debug",
  "test:release",
  "test:replay",
  "test:plugin",
  "test-storybook:ci",
];

export function gateSteps(argv = []) {
  const skip = new Set(argv.filter((arg) => arg.startsWith("--skip=")).flatMap((arg) => arg.slice(7).split(",")).filter(Boolean));
  if (argv.includes("--no-storybook")) skip.add("test-storybook:ci");
  const unknown = [...skip].filter((step) => !GATE_STEPS.includes(step));
  return { steps: GATE_STEPS.filter((step) => !skip.has(step)), skipped: GATE_STEPS.filter((step) => skip.has(step)), unknown };
}

function main() {
  const { steps, skipped, unknown } = gateSteps(process.argv.slice(2));
  if (unknown.length) {
    console.error(`gates: unknown step(s) ${unknown.join(", ")}; the chain is ${GATE_STEPS.join(", ")}`);
    return 2;
  }
  const results = [];
  for (const step of steps) {
    const started = Date.now();
    console.log(`\n=== gates: npm run ${step} ===`);
    const run = spawnSync("npm", ["run", step], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    results.push({ step, code: run.status ?? 1, seconds });
    if (run.status !== 0) {
      console.error(`\ngates: RED at ${step} (exit ${run.status ?? run.signal}, ${seconds}s)`);
      for (const result of results) console.error(`  ${result.code === 0 ? "ok  " : "FAIL"} ${result.step} (${result.seconds}s)`);
      return 1;
    }
  }
  console.log("\ngates: all green");
  for (const result of results) console.log(`  ok   ${result.step} (${result.seconds}s)`);
  if (skipped.length) console.log(`  SKIPPED: ${skipped.join(", ")} (say so in the gate record)`);
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = main();
