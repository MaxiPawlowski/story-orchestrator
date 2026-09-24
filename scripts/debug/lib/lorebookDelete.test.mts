import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deleteLorebooksInPage } from './lorebookDelete.mts';

const FAKE_MODULE = `
const host = () => globalThis.__soFakeWorldInfo;
export const worldInfoCache = {
  delete: (name) => host().cache.delete(name),
  has: (name) => host().cache.has(name),
};
export async function updateWorldInfoList() { host().calls.push('update'); host().listed = [...host().files]; }
export async function deleteWorldInfo(name) {
  host().calls.push('delete:' + name);
  if (!host().listed.includes(name)) return false;
  host().files = host().files.filter((file) => file !== name);
  if (host().evicts) host().cache.delete(name);
  return true;
}
`;

const moduleUrl = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'so-wi-'));
  const file = join(dir, 'world-info.mjs');
  writeFileSync(file, FAKE_MODULE);
  return pathToFileURL(file).href;
})();

const g = globalThis as any;
const page = { evaluate: (fn, arg) => fn(arg) };

const install = ({ files, listed, cached, evicts = true }: { files: string[]; listed: string[]; cached: string[]; evicts?: boolean }) => {
  const posts: string[] = [];
  g.__soFakeWorldInfo = { files: [...files], listed: [...listed], cache: new Set(cached), calls: [] as string[], evicts };
  g.SillyTavern = { getContext: () => ({ getWorldInfoNames: () => [...g.__soFakeWorldInfo.listed], getRequestHeaders: () => ({}) }) };
  g.fetch = async (url: string, init: { body: string }) => {
    const { name } = JSON.parse(init.body);
    posts.push(`${url}:${name}`);
    g.__soFakeWorldInfo.files = g.__soFakeWorldInfo.files.filter((file: string) => file !== name);
    return { ok: true, status: 200 };
  };
  return posts;
};

test('a listed book goes through ST deleteWorldInfo after the list is refreshed, and leaves no cached copy (seed D)', async () => {
  const posts = install({ files: ['SO-J9 Lore'], listed: [], cached: ['SO-J9 Lore'] });
  const report = await deleteLorebooksInPage(page, ['SO-J9 Lore'], { moduleUrl });
  assert.deepEqual(g.__soFakeWorldInfo.calls.slice(0, 2), ['update', 'delete:SO-J9 Lore']);
  assert.deepEqual(report.viaHost, ['SO-J9 Lore']);
  assert.deepEqual(report.unlisted, []);
  assert.deepEqual(report.staleCache, []);
  assert.deepEqual(posts, []);
});

test('a book ST does not list falls back to the raw delete plus an explicit cache eviction', async () => {
  const posts = install({ files: ['SO-J9 Ghost'], listed: [], cached: ['SO-J9 Ghost'] });
  g.__soFakeWorldInfo.files = [];
  const report = await deleteLorebooksInPage(page, ['SO-J9 Ghost'], { moduleUrl });
  assert.deepEqual(posts, ['/api/worldinfo/delete:SO-J9 Ghost']);
  assert.deepEqual(report.unlisted, ['SO-J9 Ghost']);
  assert.deepEqual(report.evicted, ['SO-J9 Ghost']);
  assert.deepEqual(report.staleCache, []);
});

test('control: a delete that leaves the parsed copy cached is reported stale, so so-assets cannot call it clean', async () => {
  install({ files: ['SO-J9 Lore'], listed: [], cached: ['SO-J9 Lore'], evicts: false });
  const report = await deleteLorebooksInPage(page, ['SO-J9 Lore'], { moduleUrl });
  assert.deepEqual(report.lorebooks, ['SO-J9 Lore']);
  assert.deepEqual(report.staleCache, ['SO-J9 Lore']);
});

test('nothing named touches nothing', async () => {
  install({ files: ['Real Book'], listed: ['Real Book'], cached: ['Real Book'] });
  const report = await deleteLorebooksInPage(page, [], { moduleUrl });
  assert.deepEqual(g.__soFakeWorldInfo.calls, []);
  assert.deepEqual(report.lorebooks, []);
});
