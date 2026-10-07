import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export const LANE_DEBUG_DIRS = ['batch', 'runs', 'b1', 'screenshots', 'payload'];
export const LANE_DEBUG_FILE = /^(?:run-header-.*\.json|journey-.*\.(?:json|md)|.*_journey-.*\.json|journal-.*|engine-history-.*|.*so-scenario-(?:result|failure)\.json|.*\.jsonl|so-journey-(?:config-snapshot|asset-baseline)\.json|adolion-fresh-asset-baseline\.json)$/;
export const LANE_ROOT_FILES = ['server.log', 'pod.json', 'lease.json'];
export const NEVER = /(?:^|[\\/])(?:chromium-profile|data|node_modules)(?:[\\/]|$)|secrets|\.env$|session\.json$/i;

export interface ArchiveItem { from: string; to: string; bytes: number }
export interface ArchivePlan { items: ArchiveItem[]; skipped: string[] }

function walk(dir: string, out: string[] = [], base: string = dir): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (NEVER.test(relative(base, path))) continue;
    const info = statSync(path);
    if (info.isDirectory()) walk(path, out, base);
    else if (info.isFile()) out.push(path);
  }
  return out;
}

export function planArchive(lanesRoot: string, { lanes, pods, since = 0 }: { lanes: number[]; pods: number[]; since?: number }): ArchivePlan {
  const items: ArchiveItem[] = [];
  const skipped: string[] = [];
  const add = (from: string, to: string) => {
    if (NEVER.test(relative(lanesRoot, from))) { skipped.push(from); return; }
    const info = statSync(from);
    if (info.mtimeMs < since) return;
    items.push({ from, to: to.replace(/\\/g, '/'), bytes: info.size });
  };
  for (const n of lanes) {
    const root = resolve(lanesRoot, String(n));
    const debug = resolve(root, 'debug');
    for (const name of LANE_ROOT_FILES) if (existsSync(resolve(root, name))) add(resolve(root, name), `lane-${n}/${name}`);
    for (const file of walk(resolve(root, 'adolion-fresh'))) if (/\.(?:json|jsonl)$/.test(file)) add(file, `lane-${n}/adolion-fresh/${relative(resolve(root, 'adolion-fresh'), file)}`);
    if (existsSync(debug)) {
      for (const name of readdirSync(debug)) {
        const path = resolve(debug, name);
        const info = statSync(path);
        if (info.isFile() && LANE_DEBUG_FILE.test(name)) add(path, `lane-${n}/debug/${name}`);
        else if (info.isDirectory() && LANE_DEBUG_DIRS.includes(name)) for (const file of walk(path)) add(file, `lane-${n}/debug/${relative(debug, file)}`);
      }
    }
  }
  for (const k of pods) {
    const dir = resolve(lanesRoot, 'pods', String(k));
    for (const file of walk(dir)) add(file, `pod-${k}/${relative(dir, file)}`);
  }
  if (existsSync(lanesRoot)) for (const name of readdirSync(lanesRoot)) if (/^batch-.*\.json$/.test(name)) add(resolve(lanesRoot, name), `batches/${name}`);
  return { items, skipped };
}

export const sha256File = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function inside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function destinationProblems(dest: string, { sessionsRoot, publicIgnored }: { sessionsRoot: string | null; publicIgnored: boolean | null }): string[] {
  const problems: string[] = [];
  if (!sessionsRoot) problems.push('the private so-sessions work tree is unknown (set SO_SESSIONS_ROOT, or the so-sessions git dir core.worktree)');
  else if (!inside(dest, sessionsRoot)) problems.push(`${dest} is not inside the private so-sessions work tree ${sessionsRoot}`);
  if (publicIgnored !== true) problems.push(`${dest} is not ignored by the public repo's .gitignore: evidence there could be committed publicly`);
  return problems;
}

export function copyArchive(plan: ArchivePlan, dest: string, meta: Record<string, unknown> = {}) {
  const files: Array<{ path: string; bytes: number; sha256: string; from: string }> = [];
  const problems: string[] = [];
  for (const item of plan.items) {
    const to = resolve(dest, item.to);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(item.from, to);
    const source = sha256File(item.from);
    const copy = sha256File(to);
    if (source !== copy) problems.push(`${item.to}: the copy does not match its source (the file changed while copying?)`);
    files.push({ path: item.to, bytes: statSync(to).size, sha256: copy, from: item.from });
  }
  const manifest = { at: new Date().toISOString(), ...meta, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), problems, list: files };
  mkdirSync(dest, { recursive: true });
  writeFileSync(resolve(dest, 'ARCHIVE.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

export function verifyArchive(dest: string): string[] {
  const path = resolve(dest, 'ARCHIVE.json');
  if (!existsSync(path)) return ['ARCHIVE.json is missing'];
  const manifest = JSON.parse(readFileSync(path, 'utf-8'));
  const problems: string[] = [...(manifest.problems ?? [])];
  for (const file of manifest.list ?? []) {
    const at = resolve(dest, file.path);
    if (!existsSync(at)) problems.push(`${file.path} is missing from the archive`);
    else if (sha256File(at) !== file.sha256) problems.push(`${file.path} changed after archiving`);
  }
  return problems;
}
