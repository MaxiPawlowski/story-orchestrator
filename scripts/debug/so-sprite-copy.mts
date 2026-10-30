import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { lanesRootFor, requireStRoot } from '../lib/stRoot.mjs';
import { matchesSet, parseCopyArgs, planCopy, rigAssetRel, rigRefsFor, summarize, wantedFolder, type RigRef, type SourceFile } from './lib/spriteCopy.mts';

const USAGE = `Usage: node scripts/debug/so-sprite-copy.mts --lane <n> [--set <id>] [--members "Folder A,Folder B"] [--confirm]

Copies a prepared sprite set (made by so-cast-presentation.mts on lane <n>) from the lane's copy to the owner's
SillyTavern install: characters/<folder>/<set>/ and characters/<folder>/anim-<set>/ (plus the --front variants
<set>a..d), and local rig assets the lane's live-head refs for that set point at.
Without --confirm it only lists what it would copy (dry run). With --confirm it copies only files the owner lacks:
a file the owner already has with other bytes is a conflict and is never overwritten; nothing is ever deleted.
The live-head refs the rigs need are written to rig-settings.json in the report for the owner to apply.
Report in <lane>/debug/sprite-copy/<stamp>/plan.json.`;

const args = parseCopyArgs(process.argv.slice(2));
if (args.help) { console.log(USAGE); process.exit(0); }
if (args.errors.length) { console.log([...args.errors, USAGE].join('\n')); process.exit(2); }

const lanesRoot = lanesRootFor(process.env);
const source = resolve(lanesRoot, String(args.lane), 'data', 'default-user');
const target = resolve(requireStRoot(process.env), 'data', 'default-user');
if (!existsSync(source)) throw new Error(`lane ${args.lane} has no data at ${source}`);
if (!existsSync(target)) throw new Error(`the owner's install has no data folder at ${target}`);
if (resolve(source) === resolve(target)) throw new Error('source and target are the same folder');

const sha = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const walk = async (dir: string): Promise<string[]> => {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
};
const relOf = (path: string) => relative(source, path).split(sep).join('/');

const characters = join(source, 'characters');
const folders = existsSync(characters) ? (await readdir(characters, { withFileTypes: true })).filter((entry) => entry.isDirectory() && wantedFolder(entry.name, args.members)).map((entry) => entry.name) : [];
const missing = args.members.filter((name) => !folders.some((folder) => folder.toLowerCase() === name.toLowerCase()));
const files: string[] = [];
const touched: string[] = [];
for (const folder of folders) {
  const sets = (await readdir(join(characters, folder), { withFileTypes: true })).filter((entry) => entry.isDirectory() && matchesSet(entry.name, args.set));
  if (sets.length) touched.push(folder);
  for (const set of sets) files.push(...await walk(join(characters, folder, set.name)));
}
const settings = JSON.parse(await readFile(join(source, 'settings.json'), 'utf8').catch(() => '{}'));
const refs = rigRefsFor(settings?.extension_settings?.['story-orchestrator']?.settings?.sprites?.liveHeadRigs ?? {}, args.set, touched);
for (const ref of Object.values(refs) as RigRef[]) {
  const rel = rigAssetRel(ref.manifest);
  if (rel && existsSync(join(source, rel)) && !files.includes(join(source, rel))) files.push(join(source, rel));
}
const sourceFiles: SourceFile[] = await Promise.all(files.map(async (path) => ({ rel: relOf(path), size: (await stat(path)).size, hash: await sha(path) })));
const destination = new Map(await Promise.all(sourceFiles.map(async (file): Promise<[string, string | null]> => {
  const path = join(target, file.rel);
  return [file.rel, existsSync(path) ? await sha(path) : null];
})));
const plan = planCopy(sourceFiles, destination);
const report = resolve(lanesRoot, String(args.lane), 'debug', 'sprite-copy', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(report, { recursive: true });
await writeFile(join(report, 'rig-settings.json'), JSON.stringify({ path: 'extension_settings["story-orchestrator"].settings.sprites.liveHeadRigs', merge: refs }, null, 2));
const copied: string[] = [];
const failed: Array<{ rel: string; error: string }> = [];
if (args.confirm) {
  for (const entry of plan.filter((row) => row.action === 'copy')) {
    const to = join(target, entry.rel);
    if (!resolve(to).startsWith(resolve(target) + sep)) { failed.push({ rel: entry.rel, error: 'outside the target' }); continue; }
    try {
      await mkdir(dirname(to), { recursive: true });
      await copyFile(join(source, entry.rel), to, constants.COPYFILE_EXCL);
      copied.push(entry.rel);
    } catch (error) { failed.push({ rel: entry.rel, error: String(error) }); }
  }
}
const result = { mode: args.confirm ? 'copied' : 'dry-run', source, target, set: args.set, folders: touched, missingMembers: missing, summary: summarize(plan),
  conflicts: plan.filter((row) => row.action === 'conflict').map((row) => row.rel), rigRefs: Object.keys(refs).length, copied: copied.length, failed, report };
await writeFile(join(report, 'plan.json'), JSON.stringify({ ...result, plan }, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!args.confirm) for (const row of plan) console.log(`${row.action.padEnd(8)} ${row.rel}`);
if (failed.length || missing.length) process.exitCode = 1;
