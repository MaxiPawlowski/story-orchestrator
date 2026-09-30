// v2.6 plan 13 R2: a throwaway copy of the working tree to mutate, so a crashed run can never leave
// a mutant in the real checkout. The path is fixed per purpose, which keeps jest's transform cache warm.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const SKIP = [/^test\/journeys\/records\//, /^dist(-dev)?\//, /\.(png|jpe?g|webp|gif|mp4)$/i];

export function trackedFiles(root) {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split('\0').filter(Boolean).filter((path) => !SKIP.some((pattern) => pattern.test(path)));
}

export function stageCopy(root, purpose) {
  const dir = join(tmpdir(), `so-${purpose}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const path of trackedFiles(root)) {
    const from = join(root, path);
    if (!existsSync(from)) continue;
    const to = join(dir, path);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
  const modules = join(root, 'node_modules');
  if (!existsSync(modules)) throw new Error(`${modules} is missing: install or link node_modules first`);
  symlinkSync(modules, join(dir, 'node_modules'), 'junction');
  return dir;
}

/** Runs jest in `dir` over `args` and returns its --json result (null when jest wrote none). */
export function runJest(dir, args, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const out = join(dir, '.jest-result.json');
  rmSync(out, { force: true });
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(dir, 'node_modules', 'jest', 'bin', 'jest.js'), '--runInBand', '--ci', '--silent', '--json', `--outputFile=${out}`, ...args], { cwd: dir, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  const ms = Date.now() - started;
  if (run.error?.code === 'ETIMEDOUT') return { result: null, ms, timedOut: true, stderr: '' };
  const result = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : null;
  return { result, ms, timedOut: false, stderr: run.stderr ?? '' };
}

/** The same run without blocking, so several staged copies can be driven at once. */
export function runJestAsync(dir, args, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const out = join(dir, '.jest-result.json');
  rmSync(out, { force: true });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(dir, 'node_modules', 'jest', 'bin', 'jest.js'), '--runInBand', '--ci', '--silent', '--json', `--outputFile=${out}`, ...args], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
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

export const failingTitles = (result) => (result?.testResults ?? []).flatMap((suite) => (suite.assertionResults ?? []).filter((test) => test.status === 'failed').map((test) => test.fullName));
