#!/usr/bin/env node
// v2.6 plan 13 R4: move the archived run records no gate record, attestation, test or script cites out
// of the repo, into a backup with a sha256 manifest. Cited records stay (scripts/lib/suiteInventory.mjs
// `isCitedRecord`); a gate directory whose every file moved keeps a MOVED.md pointer so its citation
// still resolves. The files stay reachable in git history too.
//
//   node scripts/suite/move-records.mjs [--dest C:\dev\backups\story-orchestrator\records] [--dry-run]
//
// It copies and verifies every file before deleting any; `git rm` is left to the caller.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isCitedRecord, isGenericCitation } from '../lib/suiteInventory.mjs';
import { recordCitations } from './inventory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORDS = 'test/journeys/records/';
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function main() {
  const dest = arg('--dest', 'C:\\dev\\backups\\story-orchestrator\\records');
  const dry = process.argv.includes('--dry-run');
  const files = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 }).stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const records = files.filter((path) => path.startsWith(RECORDS));
  const citations = recordCitations(files);
  const moving = records.filter((path) => !isCitedRecord(path, citations));
  const bytes = moving.reduce((sum, path) => sum + statSync(join(ROOT, path)).size, 0);
  console.log(`${records.length} record files; ${moving.length} uncited (${(bytes / 1048576).toFixed(2)} MB) -> ${dest}`);
  if (dry) return 0;
  const commit = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).stdout.trim();
  const manifest = [];
  for (const path of moving) {
    const from = join(ROOT, path);
    const to = join(dest, path.slice(RECORDS.length));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    const digest = sha(from);
    if (sha(to) !== digest) throw new Error(`copy of ${path} does not match; nothing deleted`);
    manifest.push({ path, bytes: statSync(from).size, sha256: digest });
  }
  const manifestPath = join(dest, 'manifest.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : { moves: [] };
  previous.moves.push({ at: new Date().toISOString(), fromCommit: commit, plan: 'v2.6 plan 13 R4', rule: 'moved = not cited by any doc, attestation, test or script (scripts/lib/suiteInventory.mjs isCitedRecord)', files: manifest });
  writeFileSync(manifestPath, `${JSON.stringify(previous, null, 2)}\n`, 'utf-8');
  for (const entry of manifest) rmSync(join(ROOT, entry.path));
  const pointers = [];
  for (const cited of citations.filter((path) => isGenericCitation(path))) {
    const dir = join(ROOT, cited);
    const rel = cited.replace(/\/+$/, '');
    if (!records.some((path) => path.startsWith(`${rel}/`))) continue;
    const kept = records.some((path) => path.startsWith(`${rel}/`) && !moving.includes(path));
    if (kept) continue;
    mkdirSync(dir, { recursive: true });
    const pointer = join(dir, 'MOVED.md');
    const count = manifest.filter((entry) => entry.path.startsWith(`${rel}/`)).length;
    writeFileSync(pointer, `# Moved\n\nThe ${count} run record(s) that lived here were not cited file by file by any gate record or attestation, so v2.6 plan 13 R4 moved them out of the repo (from commit \`${commit}\`).\n\n- Backup: \`${dest}\\${rel.slice(RECORDS.length).replace(/\//g, '\\')}\`\n- Manifest (path, bytes, sha256): \`${manifestPath}\`\n- Git history: \`git show ${commit}:${rel}/<file>\`\n`, 'utf-8');
    pointers.push(`${rel}/MOVED.md`);
  }
  console.log(`moved ${manifest.length} files; manifest ${manifestPath}; pointers: ${pointers.join(', ') || 'none'}`);
  return 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, '/').toLowerCase() : '';
if (fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === invoked) process.exitCode = main();
