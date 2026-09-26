import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  declaredMismatch, moveBooks, moveDir, planCandidates, readDeclared, readManifest, restoreCheck, sha256, treeHash, verifyMove,
  DEFAULT_DECLARED, type Declared,
} from './so-legacy-books.mts';

const NEVER: () => Promise<boolean> = async () => false;
const book = (entries: Record<string, { comment: string }> = {}) => JSON.stringify({ entries });
const chatLine = (version: number | null) => JSON.stringify({ chat_metadata: version == null ? {} : { story_orchestrator: { version } } }) + '\n{"mes":"hi"}\n';

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'so-books-test-'));
  const root = join(base, 'data');
  await mkdir(join(root, 'worlds'), { recursive: true });
  await mkdir(join(root, 'chats', 'Arin'), { recursive: true });
  await mkdir(join(root, 'group chats'), { recursive: true });
  const worlds: Record<string, string> = {
    'Story Orchestrator - Fixed Title.json': book(),
    'Story Orchestrator - Marked - 2026-09-20@01h00m00s000ms.json': book({ 1: { comment: 'so-owner' } }),
    'Story Orchestrator - Selected Book.json': book(),
    'Story Orchestrator - CharLore Book.json': book(),
    'Story Orchestrator - Played - 2026-09-21@02h00m00s000ms.json': book({ 1: { comment: 'x' } }),
    'Story Orchestrator - Old - 2026-09-19@03h00m00s000ms.json': book({ 1: { comment: 'y' } }),
    'Story Orchestrator - Solo - Arin - 2026-09-18@04h00m00s.json': book(),
    'Adolion World.json': book(),
  };
  for (const [name, text] of Object.entries(worlds)) await writeFile(join(root, 'worlds', name), text);
  await writeFile(join(root, 'group chats', '2026-09-21@02h00m00s000ms.jsonl'), chatLine(5));
  await writeFile(join(root, 'group chats', '2026-09-19@03h00m00s000ms.jsonl'), chatLine(4));
  await writeFile(join(root, 'group chats', '2026-09-20@01h00m00s000ms.jsonl'), chatLine(4));
  await writeFile(join(root, 'chats', 'Arin', 'Arin - 2026-09-18@04h00m00s.jsonl'), chatLine(3));
  await writeFile(join(root, 'settings.json'), JSON.stringify({
    world_info_settings: { world_info: { globalSelect: ['Adolion World', 'Story Orchestrator - Selected Book'], charLore: [{ name: 'Arin.png', extraBooks: ['Story Orchestrator - CharLore Book'] }] } },
  }));
  return { base, root, dest: join(base, 'backup', 'v2.5-plan11-test') };
}

const declaredFor = async (root: string): Promise<Declared[]> => (await planCandidates(root)).candidates.map(({ file, sha12 }) => ({ file, sha12 }));

test('D1 candidate rule: fixed-name and non-v5 per-chat books only', async () => {
  const { root } = await fixture();
  const { candidates, excluded } = await planCandidates(root);
  assert.deepEqual(candidates.map((row) => [row.file, row.kind, row.chatId]).sort(), [
    ['Story Orchestrator - Fixed Title.json', 'fixed', null],
    ['Story Orchestrator - Old - 2026-09-19@03h00m00s000ms.json', 'per-chat', '2026-09-19@03h00m00s000ms'],
    ['Story Orchestrator - Solo - Arin - 2026-09-18@04h00m00s.json', 'per-chat', 'Arin - 2026-09-18@04h00m00s'],
  ]);
  const reasons = Object.fromEntries(excluded.map((row) => [row.file, row.reason]));
  assert.equal(reasons['Story Orchestrator - Marked - 2026-09-20@01h00m00s000ms.json'], 'so-owner marker');
  assert.match(reasons['Story Orchestrator - Selected Book.json'], /selected/);
  assert.match(reasons['Story Orchestrator - CharLore Book.json'], /selected/);
  assert.match(reasons['Story Orchestrator - Played - 2026-09-21@02h00m00s000ms.json'], /v5 blob/);
  assert.equal(candidates.some((row) => row.file === 'Adolion World.json'), false);
  const old = candidates.find((row) => row.file.includes('Old'))!;
  assert.equal(old.sha12, sha256(book({ 1: { comment: 'y' } })).slice(0, 12));
  assert.deepEqual(old.chatVersions, [4]);
});

test('control: a marked mirror book is never a candidate even when its chat is not v5', async () => {
  const { root } = await fixture();
  const { candidates } = await planCandidates(root);
  assert.equal(candidates.some((row) => row.file.includes('Marked')), false);
});

test('the committed predeclared list holds the 18 plan-table books', async () => {
  const declared = await readDeclared(DEFAULT_DECLARED);
  assert.equal(declared.length, 18);
  assert.equal(new Set(declared.map((row) => row.file)).size, 18);
  assert.equal(declared.filter((row) => row.sha12 === '48fa736bfd49').length, 6);
  assert.ok(declared.every((row) => /^[0-9a-f]{12}$/.test(row.sha12) && row.file.startsWith('Story Orchestrator - ') && row.file.endsWith('.json')));
});

test('move refuses when the candidate set differs from the predeclared list, moving nothing', async () => {
  const { root, dest } = await fixture();
  const declared = await declaredFor(root);
  const before = await readdir(join(root, 'worlds'));
  const cases: Declared[][] = [
    declared.slice(1),
    [...declared, { file: 'Story Orchestrator - Extra.json', sha12: '000000000000' }],
    declared.map((row, index) => index === 0 ? { ...row, sha12: 'ffffffffffff' } : row),
  ];
  for (const wrong of cases) {
    await assert.rejects(moveBooks({ root, dest, declared: wrong, port: 8000, probe: NEVER }), /differs from the predeclared list/);
    assert.equal(existsSync(dest), false);
    assert.deepEqual(await readdir(join(root, 'worlds')), before);
  }
  assert.deepEqual(declaredMismatch(declared, declared), []);
});

test('move refuses while the ST port answers', async () => {
  const { root, dest } = await fixture();
  const seen: number[] = [];
  const probe = async (port: number) => { seen.push(port); return true; };
  await assert.rejects(moveBooks({ root, dest, declared: await declaredFor(root), port: 8123, probe }), /127\.0\.0\.1:8123 answers/);
  assert.deepEqual(seen, [8123]);
  assert.equal(existsSync(dest), false);
});

test('collision: an existing destination root or an existing dst refuses before the first rename', async () => {
  const { root, dest } = await fixture();
  await mkdir(dest, { recursive: true });
  let renames = 0;
  const renameFn = (async () => { renames += 1; }) as never;
  await assert.rejects(moveBooks({ root, dest, declared: await declaredFor(root), port: 8000, probe: NEVER, renameFn }), /already exists/);
  assert.equal(renames, 0);
  assert.equal((await planCandidates(root)).candidates.length, 3);
});

test('a failed rename aborts the run and the manifest says how far it got', async () => {
  const { root, dest } = await fixture();
  const renameFn = (async () => { throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }); }) as never;
  await assert.rejects(moveBooks({ root, dest, declared: await declaredFor(root), port: 8000, probe: NEVER, renameFn }), /aborted after 0 of 3/);
  const manifest = await readManifest(dest);
  assert.equal(manifest.complete, false);
  assert.equal(manifest.moved, 0);
  assert.match(manifest.error!, /EXDEV/);
  assert.equal((await planCandidates(root)).candidates.length, 3);
});

test('move writes the manifest, verify passes, restore-check matches every file', async () => {
  const { root, dest } = await fixture();
  const before = (await readdir(join(root, 'worlds'))).sort();
  const declared = await declaredFor(root);
  const manifest = await moveBooks({ root, dest, declared, port: 8000, probe: NEVER, commit: 'abc123', now: () => new Date('2026-09-25T10:00:00Z') });
  assert.equal(manifest.commit, 'abc123');
  assert.equal(manifest.time, '2026-09-25T10:00:00.000Z');
  assert.equal(manifest.complete, true);
  assert.equal(manifest.moved, 3);
  assert.deepEqual(manifest.preMoveListing, before);
  for (const entry of manifest.files) {
    assert.equal(existsSync(entry.src), false);
    const bytes = await readFile(entry.dst);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256(bytes), entry.sha256);
    assert.equal(entry.dst, join(dest, 'worlds', entry.src.split(/[\\/]/).pop()!));
  }
  assert.deepEqual(await readManifest(dest), manifest);
  const verified = await verifyMove(root, dest);
  assert.equal(verified.ok, true, JSON.stringify(verified));
  assert.equal(verified.now, before.length - 3);
  const restore = await restoreCheck(dest);
  assert.deepEqual([restore.ok, restore.matched, restore.total], [true, 3, 3]);
});

test('verify fails when an unlisted book also left worlds/', async () => {
  const { root, dest } = await fixture();
  await moveBooks({ root, dest, declared: await declaredFor(root), port: 8000, probe: NEVER, commit: 'x' });
  const { rename } = await import('node:fs/promises');
  await rename(join(root, 'worlds', 'Adolion World.json'), join(root, 'Adolion World.json'));
  const verified = await verifyMove(root, dest);
  assert.equal(verified.ok, false);
  assert.deepEqual(verified.missing, ['Adolion World.json']);
});

test('restore-check catches a tampered backup file', async () => {
  const { root, dest } = await fixture();
  const manifest = await moveBooks({ root, dest, declared: await declaredFor(root), port: 8000, probe: NEVER, commit: 'x' });
  await writeFile(manifest.files[1].dst, '{"entries":{"tampered":{}}}');
  const restore = await restoreCheck(dest);
  assert.equal(restore.ok, false);
  assert.equal(restore.matched, 2);
  assert.deepEqual(restore.mismatched, [manifest.files[1].dst.split(/[\\/]/).pop()]);
});

test('D2 move-dir: the tree hash matches before and after, and a changed tree hashes differently', async () => {
  const base = await mkdtemp(join(tmpdir(), 'so-dir-test-'));
  const src = join(base, 'lanes-src', '1', 'data');
  await mkdir(join(src, 'default-user', 'worlds'), { recursive: true });
  await writeFile(join(src, 'default-user', 'settings.json'), '{"a":1}');
  await writeFile(join(src, 'default-user', 'worlds', 'b.json'), '{"entries":{}}');
  const before = await treeHash(src);
  assert.equal(before.files, 2);
  const dst = join(base, 'backup', 'lanes', '1', 'data');
  const result = await moveDir({ src, dst, port: 8101, probe: NEVER, commit: 'c', now: () => new Date(0) });
  assert.equal(result.match, true);
  assert.equal(result.before.sha256, before.sha256);
  assert.equal(result.after!.sha256, before.sha256);
  assert.equal(existsSync(src), false);
  assert.deepEqual(JSON.parse(await readFile(`${dst}.manifest.json`, 'utf8')).after, result.after);
  await writeFile(join(dst, 'default-user', 'settings.json'), '{"a":2}');
  assert.notEqual((await treeHash(dst)).sha256, before.sha256);
});

test('D2 move-dir refuses an existing destination and a live port', async () => {
  const base = await mkdtemp(join(tmpdir(), 'so-dir-test-'));
  const src = join(base, 'src');
  const dst = join(base, 'dst');
  await mkdir(src);
  await mkdir(dst);
  await assert.rejects(moveDir({ src, dst, probe: NEVER }), /already exists/);
  await assert.rejects(moveDir({ src, dst: join(base, 'other'), port: 8101, probe: async () => true }), /8101 answers/);
  assert.equal(existsSync(src), true);
});
