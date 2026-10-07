// v2.6 plan 13 R2: a throwaway copy of the working tree to mutate, so a crashed run can never leave
// a mutant in the real checkout. The path is fixed per purpose and checkout, which keeps jest's transform cache warm
// and keeps parallel worktrees from deleting each other's copy. Re-staging copies only files whose size or mtime
// differ and deletes what the tree no longer holds (v2.8 plan 26), so a leftover mutant is always replaced.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, utimes } from 'node:fs/promises';

const SKIP = [/^test\/journeys\/records\//, /^dist(-dev)?\//, /\.(png|jpe?g|webp|gif|mp4)$/i];

export function trackedFiles(root) {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split('\0').filter(Boolean).filter((path) => !SKIP.some((pattern) => pattern.test(path)));
}

export function stagedFiles(dir) {
  const found = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && entry.name === 'node_modules') continue;
      if (entry.isDirectory()) walk(path);
      else found.push(path);
    }
  };
  if (existsSync(dir)) walk('');
  return found;
}

const sameFile = (from, to) => from.size === to.size && Math.abs(from.mtimeMs - to.mtimeMs) < 2;

export function stageDir(root, purpose) {
  return join(tmpdir(), `so-${purpose}-${createHash('sha256').update(resolve(root)).digest('hex').slice(0, 8)}`);
}

const sourceStats = (root, files) => files.map((path) => ({ path, from: join(root, path), source: statSync(join(root, path), { throwIfNoEntry: false }) })).filter((entry) => entry.source?.isFile());

function stagePlan(dir, sources) {
  mkdirSync(dir, { recursive: true });
  const wanted = new Set();
  const copies = [];
  for (const { path, from, source } of sources) {
    wanted.add(path);
    const to = join(dir, path);
    const staged = statSync(to, { throwIfNoEntry: false });
    if (!staged || !sameFile(source, staged)) copies.push({ from, to, source });
  }
  const removals = stagedFiles(dir).filter((path) => !wanted.has(path)).map((path) => join(dir, path));
  return { wanted, copies, removals };
}

function finishStage(root, dir, plan) {
  for (const path of plan.removals) rmSync(path, { force: true });
  const modules = join(root, 'node_modules');
  if (!existsSync(modules)) throw new Error(`${modules} is missing: install or link node_modules first`);
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(modules, join(dir, 'node_modules'), 'junction');
  return { dir, copied: plan.copies.length, removed: plan.removals.length, files: plan.wanted.size };
}

export function stageCopy(root, purpose, files = trackedFiles(root)) {
  const dir = stageDir(root, purpose);
  const plan = stagePlan(dir, sourceStats(root, files));
  for (const { from, to } of plan.copies) {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { preserveTimestamps: true });
  }
  stageCopy.last = finishStage(root, dir, plan);
  return dir;
}

export async function stageCopies(root, purposes, files = trackedFiles(root), { concurrency = 64 } = {}) {
  const staged = [];
  const sources = sourceStats(root, files);
  for (const purpose of purposes) {
    const dir = stageDir(root, purpose);
    const plan = stagePlan(dir, sources);
    for (const to of new Set(plan.copies.map((copy) => dirname(copy.to)))) mkdirSync(to, { recursive: true });
    let next = 0;
    const lane = async () => {
      while (next < plan.copies.length) {
        const { from, to, source } = plan.copies[next];
        next += 1;
        await copyFile(from, to);
        await utimes(to, source.atime, source.mtime);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, lane));
    staged.push(finishStage(root, dir, plan));
  }
  return staged;
}

/** Runs jest in `dir` over `args` and returns its --json result (null when jest wrote none). */
export function runJest(dir, args, { timeoutMs = 20 * 60 * 1000, inBand = true } = {}) {
  const out = join(dir, '.jest-result.json');
  rmSync(out, { force: true });
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(dir, 'node_modules', 'jest', 'bin', 'jest.js'), ...(inBand ? ['--runInBand'] : []), '--ci', '--silent', '--json', `--outputFile=${out}`, ...args], { cwd: dir, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  const ms = Date.now() - started;
  if (run.error?.code === 'ETIMEDOUT') return { result: null, ms, timedOut: true, stderr: '' };
  const result = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : null;
  return { result, ms, timedOut: false, stderr: run.stderr ?? '' };
}

/** The same run without blocking, so several staged copies can be driven at once. */
export function runJestAsync(dir, args, { timeoutMs = 5 * 60 * 1000, inBand = true } = {}) {
  const out = join(dir, '.jest-result.json');
  rmSync(out, { force: true });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(dir, 'node_modules', 'jest', 'bin', 'jest.js'), ...(inBand ? ['--runInBand'] : []), '--ci', '--silent', '--json', `--outputFile=${out}`, ...args], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
    let timedOut = false;
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      let result = null;
      try { result = !timedOut && existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : null; } catch { result = null; }
      resolve({ result, ms: Date.now() - started, timedOut, stderr });
    });
  });
}

export function withMutated(dir, file, mutated, body) {
  const path = join(dir, file);
  const original = readFileSync(path, 'utf-8');
  writeFileSync(path, mutated, 'utf-8');
  try {
    return body();
  } finally {
    writeFileSync(path, original, 'utf-8');
  }
}

export async function withMutatedAsync(dir, file, mutated, body) {
  const path = join(dir, file);
  const original = readFileSync(path, 'utf-8');
  writeFileSync(path, mutated, 'utf-8');
  try {
    return await body();
  } finally {
    writeFileSync(path, original, 'utf-8');
  }
}

export const failingTitles = (result) => (result?.testResults ?? []).flatMap((suite) => (suite.assertionResults ?? []).filter((test) => test.status === 'failed').map((test) => test.fullName));
