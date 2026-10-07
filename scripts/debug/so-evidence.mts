import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { lanesRootFor } from '../lib/stRoot.mjs';
import { copyArchive, destinationProblems, planArchive, verifyArchive } from './lib/evidenceArchive.mts';
import { rowEvidenceProblems, ROW_FILES } from './lib/rowEvidence.mts';
import { releaseVerdict } from './so-pod.mts';
import { podDir } from './lib/podCapture.mts';

const USAGE = `Usage: node scripts/debug/so-evidence.mts <command> [...]

Run evidence lives outside the repo (<so-lanes>/<n>/debug, <so-lanes>/pods/<k>, ST's lane server logs), where a
lane re-seed, a lane archive or a deleted pod can take it. This copies it into the PRIVATE so-sessions work tree,
under evidence/phase-c/<label>/ (ignored by the public repo), sha256-checked; then \`npm run sessions:archive\`
commits and pushes the private repo. Nothing here is ever written into the public repo.

  check [--lanes 1,2] [--pods 0]
                 every batch row under the lanes' debug/batch: re-check its evidence.json / required files;
                 every pod: the teardown check. Exit 1 on any INCOMPLETE row or unreleased pod
  archive --label <name> [--lanes 1,2] [--pods 0] [--since <iso>] [--dry-run] [--allow-incomplete]
                 copy lanes' debug/{batch,runs,b1,payload,screenshots}, run headers, journey records, journals,
                 tails (*.jsonl), scenario results, server.log, pod.json, adolion-fresh reports, the batch
                 summaries and every pods/<k>/ file into <so-sessions>/evidence/phase-c/<label>/ with ARCHIVE.json
                 (path, bytes, sha256 per file). Never copies data/, chromium-profile, secrets or session.json.
                 Refuses when the check fails (unless --allow-incomplete) or the destination is not both inside the
                 so-sessions work tree and ignored by the public repo
  verify <dir>   re-hash an archive against its ARCHIVE.json`;

const LANES_ROOT = lanesRootFor(process.env, PROJECT_ROOT);

const argValue = (args: string[], name: string, fallback: string | null = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const numbers = (raw: string | null) => (raw ? raw.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0) : []);

export function sessionsRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SO_SESSIONS_ROOT) return resolve(env.SO_SESSIONS_ROOT);
  const gitDir = env.SO_SESSIONS_GIT ?? 'C:/dev/so-sessions.git';
  try {
    const worktree = execFileSync('git', [`--git-dir=${gitDir}`, 'config', '--get', 'core.worktree'], { encoding: 'utf-8' }).trim();
    return worktree ? resolve(worktree) : null;
  } catch {
    return null;
  }
}

function publicIgnored(dest: string, sessions: string): boolean | null {
  const publicRoot = resolve(sessions, '..', '..');
  try {
    execFileSync('git', ['-C', publicRoot, 'check-ignore', '-q', resolve(dest, 'ARCHIVE.json')], { stdio: 'ignore' });
    return true;
  } catch (error: any) {
    return error?.status === 1 ? false : null;
  }
}

const allLanes = () => (existsSync(LANES_ROOT) ? readdirSync(LANES_ROOT).filter((name) => /^\d+$/.test(name)).map(Number) : []);
const allPods = () => (existsSync(resolve(LANES_ROOT, 'pods')) ? readdirSync(resolve(LANES_ROOT, 'pods')).filter((name) => /^\d+$/.test(name)).map(Number) : []);

export function checkRows(lanesRoot: string, lanes: number[]) {
  const rows: Array<{ dir: string; complete: boolean; problems: string[] }> = [];
  for (const n of lanes) {
    const batchRoot = resolve(lanesRoot, String(n), 'debug', 'batch');
    if (!existsSync(batchRoot)) continue;
    for (const stamp of readdirSync(batchRoot)) {
      const stampDir = resolve(batchRoot, stamp);
      if (!existsSync(resolve(stampDir, 'batch.json'))) continue;
      for (const row of readdirSync(stampDir)) {
        const dir = resolve(stampDir, row);
        const evidencePath = resolve(dir, ROW_FILES.evidence);
        if (!existsSync(evidencePath)) {
          if (existsSync(resolve(dir, ROW_FILES.runner))) rows.push({ dir, complete: false, problems: [`${ROW_FILES.evidence} is missing: the row was never checked`] });
          continue;
        }
        const evidence = JSON.parse(readFileSync(evidencePath, 'utf-8'));
        const notRunnable = existsSync(resolve(dir, ROW_FILES.runner)) && /not-runnable: /.test(readFileSync(resolve(dir, ROW_FILES.runner), 'utf-8'));
        const problems = [...new Set([...(evidence.problems ?? []), ...rowEvidenceProblems(dir, { record: !notRunnable, page: true, pod: evidence.podSummary !== null && evidence.podSummary !== undefined })])];
        rows.push({ dir, complete: problems.length === 0, problems });
      }
    }
  }
  return rows;
}

function check(lanes: number[], pods: number[]) {
  const rows = checkRows(LANES_ROOT, lanes);
  const podVerdicts = pods.map((k) => ({ pod: k, ...releaseVerdict(podDir(LANES_ROOT, k)) }));
  const incomplete = rows.filter((row) => !row.complete);
  return { ok: !incomplete.length && podVerdicts.every((verdict) => verdict.ok), rows: rows.length, incomplete, pods: podVerdicts };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  const lanes = argValue(rest, '--lanes') ? numbers(argValue(rest, '--lanes')) : allLanes();
  const pods = argValue(rest, '--pods') ? numbers(argValue(rest, '--pods')) : allPods();
  if (command === 'check') {
    const out = check(lanes, pods);
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = out.ok ? 0 : 1;
  } else if (command === 'archive') {
    const label = argValue(rest, '--label');
    if (!label || !/^[A-Za-z0-9._-]+$/.test(label)) throw new Error('archive needs --label <name> (letters, digits, . _ -)');
    const verdict = check(lanes, pods);
    if (!verdict.ok && !rest.includes('--allow-incomplete')) {
      console.log(JSON.stringify(verdict, null, 2));
      throw new Error('archive refused: evidence is incomplete or a pod is not released (so-pod.mts release <k>); --allow-incomplete archives it anyway and records the verdict');
    }
    const sessions = sessionsRoot();
    const dest = resolve(sessions ?? resolve(PROJECT_ROOT, 'test', 'sessions'), 'evidence', 'phase-c', label);
    const problems = destinationProblems(dest, { sessionsRoot: sessions, publicIgnored: sessions ? publicIgnored(dest, sessions) : null });
    if (problems.length) throw new Error(`archive refused: ${problems.join('; ')}`);
    if (existsSync(resolve(dest, 'ARCHIVE.json'))) throw new Error(`${dest} already holds an archive: pick a new --label`);
    const since = argValue(rest, '--since');
    const plan = planArchive(LANES_ROOT, { lanes, pods, since: since ? Date.parse(since) : 0 });
    if (rest.includes('--dry-run')) {
      console.log(JSON.stringify({ dest, files: plan.items.length, bytes: plan.items.reduce((sum, item) => sum + item.bytes, 0), skipped: plan.skipped, list: plan.items.map((item) => item.to) }, null, 2));
      return;
    }
    const manifest = copyArchive(plan, dest, { label, lanes, pods, since, lanesRoot: LANES_ROOT, verdict });
    const after = verifyArchive(dest);
    console.log(JSON.stringify({ dest, files: manifest.files, bytes: manifest.bytes, problems: after, next: 'npm run sessions:archive (private repo; run it from the main checkout)' }, null, 2));
    process.exitCode = after.length ? 1 : 0;
  } else if (command === 'verify') {
    const dir = rest[0];
    if (!dir) { console.log(USAGE); process.exitCode = 2; return; }
    const problems = verifyArchive(resolve(dir));
    console.log(problems.length ? problems.join('\n') : 'ok');
    process.exitCode = problems.length ? 1 : 0;
  } else { console.log(USAGE); process.exitCode = 2; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
