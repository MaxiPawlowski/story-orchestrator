#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const GATE_PHASES = [
  ["typecheck", "typecheck:test", "lint", "debug:typecheck", "test:plugin"],
  ["test"],
  ["build", "build:dev", "test:debug"],
  ["test:release", "test:replay", "test-storybook:ci"],
];

export const GATE_STEPS = GATE_PHASES.flat();

export function gateSteps(argv = []) {
  const skip = new Set(argv.filter((arg) => arg.startsWith("--skip=")).flatMap((arg) => arg.slice(7).split(",")).filter(Boolean));
  if (argv.includes("--no-storybook")) skip.add("test-storybook:ci");
  const unknown = [...skip].filter((step) => !GATE_STEPS.includes(step));
  const phases = GATE_PHASES.map((phase) => phase.filter((step) => !skip.has(step))).filter((phase) => phase.length > 0);
  return { steps: GATE_STEPS.filter((step) => !skip.has(step)), phases, skipped: GATE_STEPS.filter((step) => skip.has(step)), unknown, serial: argv.includes("--serial") };
}

function runStep(step, live) {
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn("npm", ["run", step], { cwd: root, stdio: live ? "inherit" : ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
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
  const { phases, skipped, unknown, serial } = gateSteps(process.argv.slice(2));
  if (unknown.length) {
    console.error(`gates: unknown step(s) ${unknown.join(", ")}; the chain is ${GATE_STEPS.join(", ")}`);
    return 2;
  }
  const results = [];
  const started = Date.now();
  for (const phase of serial ? phases.flat().map((step) => [step]) : phases) {
    const live = phase.length === 1;
    if (live) console.log(`\n=== gates: npm run ${phase[0]} ===`);
    else console.log(`\n=== gates: ${phase.join(", ")} (concurrent; each log prints when its step ends) ===`);
    const ran = await Promise.all(phase.map((step) => runStep(step, live)));
    results.push(...ran);
    const red = ran.filter((result) => result.code !== 0);
    if (red.length) {
      console.error(`\ngates: RED at ${red.map((result) => `${result.step} (exit ${result.code})`).join(", ")}`);
      for (const result of results) console.error(`  ${result.code === 0 ? "ok  " : "FAIL"} ${result.step} (${result.seconds}s)`);
      return 1;
    }
  }
  console.log(`\ngates: all green in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const result of results) console.log(`  ok   ${result.step} (${result.seconds}s)`);
  if (skipped.length) console.log(`  SKIPPED: ${skipped.join(", ")} (say so in the gate record)`);
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = await main();
