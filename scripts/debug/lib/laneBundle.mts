import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { laneFs } from '../../lib/laneSafety.mjs';
const { cpSync, mkdirSync, renameSync, rmSync, writeFileSync } = laneFs;
import { resolve } from 'node:path';
import { loadAllowlist, neverIssues, stageList, stageTree } from '../../release/artifact.mjs';

export const EXTENSION_PATH = '/scripts/extensions/third-party/story-orchestrator/';
export const BUNDLE_ROUTE_PATTERN = `**${EXTENSION_PATH}**`;
export const LANE_BUNDLE_FILE = 'bundle.json';
export const BUNDLE_ROUTE_READY = 'bundle-route.ready.json';

export interface LaneBundle { sha256: string; source: string; kind: 'checkout' | 'slot'; frozenAt: string; dir: string; pid?: number | null }
export interface RowBundle { frozen: string | null; start: string | null; end: string | null }
export interface ServedBundle { sha256: string | null; http: number }

export function bundleSha(extensionDir: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(resolve(extensionDir, 'dist', 'manifest.json'), 'utf-8'));
    return typeof manifest?.bundle?.sha256 === 'string' ? manifest.bundle.sha256 : null;
  } catch {
    return null;
  }
}

export const frozenDirFor = (laneRoot: string, sha256: string) => resolve(laneRoot, 'bundle', sha256.slice(0, 16));

export function readLaneBundle(laneRoot: string): LaneBundle | null {
  try {
    return JSON.parse(readFileSync(resolve(laneRoot, LANE_BUNDLE_FILE), 'utf-8'));
  } catch {
    return null;
  }
}

export const writeLaneBundle = (laneRoot: string, record: LaneBundle) => writeFileSync(resolve(laneRoot, LANE_BUNDLE_FILE), JSON.stringify(record, null, 2), 'utf-8');

export function sourceKind(source: string): LaneBundle['kind'] {
  if (!existsSync(resolve(source, 'dist', 'manifest.json'))) throw new Error(`${source} holds no dist/manifest.json: build it (npm run build) or name a staged extension slot`);
  if (existsSync(resolve(source, 'package.json')) && existsSync(resolve(source, 'scripts', 'release', 'artifact-allowlist.json'))) return 'checkout';
  if (!existsSync(resolve(source, 'manifest.json'))) throw new Error(`${source} is neither a checkout (package.json + the release allowlist) nor a staged slot (manifest.json)`);
  return 'slot';
}

export function copyBundle({ source, laneRoot, now = () => new Date() }: { source: string; laneRoot: string; now?: () => Date }): LaneBundle {
  const from = resolve(source);
  const kind = sourceKind(from);
  const sha256 = bundleSha(from);
  if (!sha256) throw new Error(`${from}/dist/manifest.json names no bundle.sha256`);
  const dest = frozenDirFor(laneRoot, sha256);
  const staging = `${dest}.copying`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  if (kind === 'checkout') {
    const allowlist = loadAllowlist(from);
    const list = stageList(from, allowlist, JSON.parse(readFileSync(resolve(from, 'dist', 'manifest.json'), 'utf-8')));
    const never = neverIssues(list, allowlist);
    if (never.length) throw new Error(never.join('; '));
    stageTree(from, staging, list);
  } else {
    cpSync(from, staging, { recursive: true, filter: (path) => !/[\\/](\.debug|node_modules)([\\/]|$)/.test(path) });
  }
  if (bundleSha(staging) !== sha256) throw new Error(`the copy of ${from} does not hash as its manifest (${sha256}): the source changed while it was copied`);
  rmSync(dest, { recursive: true, force: true });
  renameSync(staging, dest);
  return { sha256, source: from, kind, frozenAt: now().toISOString(), dir: dest };
}

const CONTENT_TYPES: Record<string, string> = { js: 'application/javascript', mjs: 'application/javascript', json: 'application/json', css: 'text/css', map: 'application/json', wasm: 'application/wasm', html: 'text/html', md: 'text/markdown', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2' };

export function frozenFileFor(dir: string, url: string): { file: string; contentType: string } | null {
  const path = decodeURIComponent(new URL(url).pathname);
  const at = path.indexOf(EXTENSION_PATH);
  if (at < 0) return null;
  const name = path.slice(at + EXTENSION_PATH.length);
  if (!name || !/^[A-Za-z0-9_./@ -]+$/.test(name) || name.split('/').includes('..')) return null;
  return { file: resolve(dir, name), contentType: CONTENT_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream' };
}

type Fulfil = { fulfill(options: { status: number; contentType?: string; body: string | Buffer; headers?: Record<string, string> }): Promise<void> };

export async function serveFrozen(route: Fulfil, dir: string, url: string): Promise<'served' | 'missing'> {
  const hit = frozenFileFor(dir, url);
  if (!hit || !existsSync(hit.file)) {
    await route.fulfill({ status: 404, body: '', headers: { 'x-so-bundle': 'frozen-missing' } });
    return 'missing';
  }
  await route.fulfill({ status: 200, contentType: hit.contentType, body: await readFile(hit.file), headers: { 'cache-control': 'no-store', 'x-so-bundle': 'frozen' } });
  return 'served';
}

export async function servedBundleInPage(page: { evaluate: (fn: any, arg?: any) => Promise<any> }): Promise<ServedBundle> {
  return page.evaluate(async (path: string) => {
    try {
      const response = await fetch(`${path}dist/manifest.json`, { cache: 'no-store' });
      if (!response.ok) return { sha256: null, http: response.status };
      const manifest = await response.json();
      return { sha256: typeof manifest?.bundle?.sha256 === 'string' ? manifest.bundle.sha256 : null, http: response.status };
    } catch {
      return { sha256: null, http: 0 };
    }
  }, EXTENSION_PATH);
}

export function rowBundleProblems(row: RowBundle): string[] {
  const out: string[] = [];
  if (!row.start) out.push('the bundle the lane page is served could not be read when the row started');
  if (row.frozen && row.start && row.start !== row.frozen) out.push(`the row started on bundle ${row.start.slice(0, 8)}, the batch froze ${row.frozen.slice(0, 8)}`);
  if (row.start && row.end !== row.start) out.push(`the bundle the lane page is served changed during the row: ${row.start.slice(0, 8)} -> ${String(row.end).slice(0, 8)}`);
  return out;
}

export function sessionBundleProblem(pinned: string | null | undefined, now: string | null): string | null {
  if (!pinned) return null;
  if (now === pinned) return null;
  return `the lane page is served bundle ${String(now).slice(0, 8)}, the session started on ${pinned.slice(0, 8)}: the turn was not played (freeze the lane: so-session start --bundle, or st-lanes.mts bundle <n> freeze)`;
}
