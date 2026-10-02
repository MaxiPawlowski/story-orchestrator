import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanesRootFor, REPO_ROOT } from '../lib/stRoot.mjs';
import {
  buildInventory, buildManifest, castResetPlan, checkInventory, diffInventories, expectedStartDisabled, lastGoodSeed, seedDrift, installerProblems, isInstalledBook, isLfsPointer, spriteFolders, stripPlan,
  type AdolionManifest, type Inventory, type LaneDisk, type RuntimeReadiness, type SpriteFolder, type SpritePackSource,
} from './lib/adolionFresh.mts';
import { applyPresetOverlay, editLabel, PRESET_OVERLAY_RECORD, type OverlayRecord } from './lib/presetOverlay.mts';
import { findReclaimable, gib, lastSeededLaneBytes, removeStaleSpriteWorktrees, seedSpaceNeed, seedSpaceRefusal, type SpaceFs } from './lib/seedSpace.mts';

const USAGE = `Usage: node scripts/debug/adolion-fresh.mts <command> [...]

v2.6 overview rule 14: a clean Adolion install on a freshly seeded lane, checked against the pinned
campaign build. Lanes 1+ only; lane 0 is the user's.

  seed <lane> [--commit <sha>] [--headed] [--stop] [--for <charterId>] [--break-lease]
       [--preset-overlay <variant>] [--no-preset-overlay]
      refused while the lane's lease.json (written by so-session stop) names a chat a later charter
      still continues, unless that charter is the one --for names or --break-lease is given;
      refused below max(5 GB, 2.5 x the last seeded lane) free on the lanes drive, naming old-pin sprite
      worktrees in other lanes and archived lanes; this lane's own old-pin sprite worktrees are removed first
      (worktree remove, never a plain delete);
      stop the lane, re-seed it (st-lanes seed --fresh), strip the campaign's assets from the copy,
      apply one variant of the preset overlay (adolion-fresh.presets.json: thinking = the default, fix = the
      2026-10-01 thinking-off control) to the lane's copied presets, settings and main profile and read it back
      (a missing preset, key or profile fails the seed; --no-preset-overlay keeps the real install's presets),
      start it, run the campaign installer at the pinned commit (adolion-fresh.pin.json), upload the
      sprite packs from an LFS checkout of that commit (a git worktree, uploads only), create the groups, select no lorebook for every chat (each story loads its own), import the nine stories, take a
      so-assets baseline, then write and check the inventory (and diff it against the lane's last one)
  check <lane> [--drop-book <name>]
      re-read the inventory of a running lane and check it; --drop-book deletes that book first
      (the planted-missing-book negative control)
  diff <a.json> <b.json>    compare two inventories, exit 1 on any difference`;

const PIN_FILE = resolve(REPO_ROOT, 'scripts', 'debug', 'adolion-fresh.pin.json');
const LANES_ROOT = lanesRootFor(process.env, REPO_ROOT);
const EXPORT_PATHS = ['build/lorebooks', 'build/cards', 'build/story', 'build/st-groups.js', 'scripts'];
const SPRITE_PNGS = 'campaign/sprites/*/sprites/*/*.png';

const lane = (n: number) => {
  const root = resolve(LANES_ROOT, String(n));
  const work = resolve(root, 'adolion-fresh');
  return { root, user: resolve(root, 'data', 'default-user'), debug: resolve(root, 'debug'), work, url: `http://127.0.0.1:${8100 + n}/` };
};

const run = (command: string, args: string[], { env = {}, echo = false }: { env?: Record<string, string>; echo?: boolean } = {}) =>
  new Promise<{ code: number; output: string }>((done) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env: { ...process.env, ...env }, windowsHide: true });
    let output = '';
    const take = (chunk: Buffer) => { output += chunk; if (echo) process.stdout.write(chunk); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (error) => { output += String(error); });
    child.on('close', (code) => done({ code: code ?? 1, output }));
  });

const must = async (label: string, command: string, args: string[], options?: Parameters<typeof run>[2]) => {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(`${label} failed (exit ${result.code}): ${result.output.slice(-1200)}`);
  return result.output;
};

const lanes = (...args: string[]) => must(`st-lanes ${args.join(' ')}`, process.execPath, ['scripts/debug/st-lanes.mts', ...args]);
const inLane = (n: number, ...args: string[]) => must(`lane ${n}: ${args.join(' ')}`, process.execPath, ['scripts/debug/st-lanes.mts', 'run', String(n), '--', ...args], { echo: true });

const tarBinary = () => (process.platform === 'win32' ? resolve(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar');

async function readPin(commitArg: string | null) {
  const pin = JSON.parse(await readFile(PIN_FILE, 'utf-8'));
  const repo = process.env.ADOLION_CAMPAIGN || pin.repo;
  const commit = (await must('git rev-parse', 'git', ['-C', repo, 'rev-parse', '--verify', `${commitArg ?? pin.commit}^{commit}`])).trim();
  return { repo, commit, pinned: !commitArg || commit === pin.commit };
}

async function exportCampaign(repo: string, commit: string, target: string) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const archive = `${target}.tar`;
  await must('git archive', 'git', ['-C', repo, 'archive', '--format=tar', '-o', archive, commit, ...EXPORT_PATHS]);
  await must('tar', tarBinary(), ['-xf', archive, '-C', target]);
  await rm(archive, { force: true });
}

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'));

const spriteCheckoutDir = (work: string, commit: string) => join(work, `sprites-${commit.slice(0, 12)}`);

async function dirBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += await dirBytes(path);
    else if (entry.isFile()) total += (await lstat(path)).size;
  }
  return total;
}

const spaceFs: SpaceFs = { list: (dir) => readdir(dir), bytes: dirBytes, readJson: (file) => readJson(file) };

async function freeBytes(path: string) {
  const stats = await statfs(existsSync(path) ? path : dirname(path));
  return Number(stats.bavail) * Number(stats.bsize);
}

async function spacePreflight(n: number, repo: string, commit: string) {
  const { root, work } = lane(n);
  const cleaned = await removeStaleSpriteWorktrees(repo, work, commit, spaceFs, (args) => run('git', args));
  for (const path of cleaned.removed) console.log(`      removed stale sprite worktree ${path}`);
  for (const { path, reason } of cleaned.failed) console.log(`      stale sprite worktree left in place (git worktree remove failed): ${path}: ${reason}`);
  const lastLaneBytes = (await lastSeededLaneBytes(LANES_ROOT, spaceFs)) ?? (existsSync(root) ? await dirBytes(root) : null);
  const free = await freeBytes(LANES_ROOT);
  const need = seedSpaceNeed(lastLaneBytes);
  if (free < need) {
    const refusal = seedSpaceRefusal({ root: LANES_ROOT, freeBytes: free, lastLaneBytes, reclaimable: await findReclaimable(LANES_ROOT, n, commit, spaceFs) });
    if (refusal) throw new Error(refusal);
  }
  console.log(`      ${gib(free)} free on the lanes drive, ${gib(need)} needed`);
  return { freeBytes: free, needBytes: need, lastLaneBytes, removedSpriteWorktrees: cleaned.removed, staleSpriteWorktreesLeft: cleaned.failed };
}

async function prepareSpriteCheckout(repo: string, commit: string, target: string) {
  const head = existsSync(join(target, '.git')) ? (await run('git', ['-C', target, 'rev-parse', 'HEAD'])).output.trim() : '';
  if (head !== commit) {
    if (existsSync(target)) await run('git', ['-C', repo, 'worktree', 'remove', '--force', target]);
    await rm(target, { recursive: true, force: true });
    await must('git worktree prune', 'git', ['-C', repo, 'worktree', 'prune']);
    await must('git worktree add', 'git', ['-C', repo, 'worktree', 'add', '--detach', target, commit], { env: { GIT_LFS_SKIP_SMUDGE: '1' } });
  }
  await must('git lfs pull', 'git', ['-C', target, 'lfs', 'pull', `--include=${SPRITE_PNGS}`]);
  return join(target, 'campaign', 'sprites');
}

async function readSpritePacks(spriteDir: string): Promise<SpritePackSource[]> {
  const slugs = (await readdir(spriteDir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && existsSync(join(spriteDir, entry.name, 'sets.json')));
  const pointers: string[] = [];
  const packs = await Promise.all(slugs.map(async ({ name: slug }) => {
    const spec = await readJson(join(spriteDir, slug, 'sets.json'));
    const sets = await Promise.all((Array.isArray(spec.sets) ? spec.sets : []).map(async (set: { id: string }) => {
      const dir = join(spriteDir, slug, 'sprites', set.id);
      const files = existsSync(dir) ? (await readdir(dir)).filter((file) => file.toLowerCase().endsWith('.png')) : [];
      for (const file of files) if (isLfsPointer((await readFile(join(dir, file))).subarray(0, 40).toString('utf-8'))) pointers.push(`${slug}/${set.id}/${file}`);
      return { id: String(set.id), labels: files.map((file) => file.replace(/\.png$/i, '')), neutral: files.includes('neutral.png') };
    }));
    return { name: String(spec.name), folder: spec.folder ? String(spec.folder) : undefined, sets };
  }));
  if (pointers.length) throw new Error(`${pointers.length} sprite file(s) in ${spriteDir} are Git LFS pointers, not images (first: ${pointers[0]}); run git lfs pull there`);
  return packs;
}

async function laneSprites(user: string, packs: SpriteFolder[]): Promise<SpriteFolder[]> {
  return Promise.all(packs.map(async (pack) => {
    const dir = join(user, 'characters', ...pack.folder.split('/'));
    const files = existsSync(dir) ? (await readdir(dir, { withFileTypes: true })).filter((entry) => !entry.isDirectory() && entry.name.toLowerCase().endsWith('.png')).map((entry) => entry.name.replace(/\.png$/i, '')) : [];
    return { folder: pack.folder, labels: files };
  }));
}

export async function manifestFromExport(dir: string, commit: string, spriteDir: string | null = null): Promise<AdolionManifest> {
  const storyDir = join(dir, 'build', 'story');
  const cardDir = join(dir, 'build', 'cards');
  const bookDir = join(dir, 'build', 'lorebooks');
  const stories = await Promise.all((await readdir(storyDir)).filter((file) => file.endsWith('.story.json')).map((file) => readJson(join(storyDir, file))));
  const cards = await Promise.all((await readdir(cardDir)).filter((file) => file.endsWith('.png')).map(async (file) => ({
    avatar: file, data: await readJson(join(cardDir, file.replace(/\.png$/, '.json'))).catch(() => ({})),
  })));
  const books = await Promise.all((await readdir(bookDir)).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, ''))
    .filter(isInstalledBook).map(async (name) => ({ name, data: await readJson(join(bookDir, `${name}.json`)) })));
  const sprites = spriteDir ? spriteFolders(await readSpritePacks(spriteDir), cards.map((card) => card.avatar.replace(/\.png$/i, ''))) : [];
  return buildManifest({ commit, stories, cards, books, groupScript: await readFile(join(dir, 'build', 'st-groups.js'), 'utf-8'), sprites });
}

const listDir = async (path: string, keep: (name: string, isDir: boolean) => boolean) => {
  if (!existsSync(path)) return [] as string[];
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((entry) => keep(entry.name, entry.isDirectory())).map((entry) => entry.name);
};

async function readLaneDisk(user: string): Promise<LaneDisk> {
  const groupFiles = await listDir(join(user, 'groups'), (name, dir) => !dir && name.endsWith('.json'));
  const groups = await Promise.all(groupFiles.map(async (file) => {
    const group = await readJson(join(user, 'groups', file));
    return { file, id: String(group.id), name: String(group.name ?? ''), chats: Array.isArray(group.chats) ? group.chats.map(String) : [], members: group.members ?? [], disabled_members: group.disabled_members ?? [] };
  }));
  return {
    worlds: (await listDir(join(user, 'worlds'), (name, dir) => !dir && name.endsWith('.json'))).map((name) => name.replace(/\.json$/, '')),
    characters: await listDir(join(user, 'characters'), (name, dir) => !dir && name.toLowerCase().endsWith('.png')),
    spriteDirs: await listDir(join(user, 'characters'), (_, dir) => dir),
    chatDirs: await listDir(join(user, 'chats'), (_, dir) => dir),
    groups,
    groupChats: await listDir(join(user, 'group chats'), (name, dir) => !dir && name.endsWith('.jsonl')),
    settings: await readJson(join(user, 'settings.json')),
  };
}

async function strip(manifest: AdolionManifest, user: string) {
  const plan = stripPlan(manifest, await readLaneDisk(user));
  for (const name of plan.worlds) await rm(join(user, 'worlds', `${name}.json`), { force: true });
  for (const avatar of plan.characters) await rm(join(user, 'characters', avatar), { force: true });
  for (const dir of plan.spriteDirs) await rm(join(user, 'characters', dir), { recursive: true, force: true });
  for (const dir of plan.chatDirs) await rm(join(user, 'chats', dir), { recursive: true, force: true });
  for (const file of plan.groupFiles) await rm(join(user, 'groups', file), { force: true });
  for (const file of plan.groupChats) await rm(join(user, 'group chats', file), { force: true });
  await writeFile(join(user, 'settings.json'), JSON.stringify(plan.settings, null, 4), 'utf-8');
  return { worlds: plan.worlds.length, characters: plan.characters.length, spriteDirs: plan.spriteDirs.length, chatDirs: plan.chatDirs.length, groups: plan.groupFiles.length, groupChats: plan.groupChats.length, ...plan.removed, swipes: plan.swipes };
}

async function laneInventory(manifest: AdolionManifest, user: string, exportDir: string, runtime: Record<string, RuntimeReadiness> | null, openGroup: string | null = null): Promise<Inventory> {
  const disk = await readLaneDisk(user);
  const titles = manifest.stories.map((story) => `Story Orchestrator - ${story.title}`);
  const wanted = disk.worlds.filter((name) => isInstalledBook(name) || name.startsWith('Adolion') || titles.some((title) => name.startsWith(title)));
  const books = await Promise.all(wanted.map(async (name) => ({ name, data: await readJson(join(user, 'worlds', `${name}.json`)) })));
  const ledgerPath = join(exportDir, 'build', 'installed.json');
  return buildInventory(manifest, {
    commit: manifest.commit, books, characters: disk.characters, groups: disk.groups as any, settings: disk.settings,
    ledger: existsSync(ledgerPath) ? await readJson(ledgerPath) : null, runtime, openGroup, sprites: await laneSprites(user, manifest.sprites),
  });
}

const logSize = async (root: string) => (existsSync(join(root, 'server.log')) ? (await readFile(join(root, 'server.log'))).length : 0);

async function mediaCallsSince(root: string, from: number) {
  const log = await readFile(join(root, 'server.log')).catch(() => Buffer.alloc(0));
  return log.subarray(from).toString('utf-8').split(/\r?\n/).filter((line) => /ComfyUI|:8188|\/api\/sd\//i.test(line));
}

async function writeRecord(n: number, inventory: Inventory, problems: string[], extra: Record<string, unknown>) {
  const { work } = lane(n);
  await mkdir(work, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const latest = join(work, 'inventory-latest.json');
  const reports = await Promise.all((await readdir(work)).filter((name) => /^report-.+\.json$/.test(name)).map(async (name) => ({ name, report: await readJson(join(work, name)).catch(() => ({})) })));
  const good = lastGoodSeed(reports);
  const previous = good && existsSync(String(good.report.file)) ? await readJson(String(good.report.file)) : null;
  const { sameAsPrevious, drift } = seedDrift(previous, inventory);
  const file = join(work, `inventory-${stamp}.json`);
  await writeFile(file, JSON.stringify(inventory, null, 2), 'utf-8');
  await writeFile(latest, JSON.stringify(inventory, null, 2), 'utf-8');
  const comparedWith = previous && good ? { report: good.name, file: good.report.file, commit: previous.commit, sameBuild: previous.commit === inventory.commit } : null;
  const report = { lane: n, file, problems, sameAsPrevious, comparedWith, drift, ...extra };
  await writeFile(join(work, `report-${stamp}.json`), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

const summary = (inventory: Inventory) => ({
  books: inventory.books.length, cards: inventory.cards.length, groups: inventory.groups.length, stories: inventory.library.length,
  selected: inventory.selected.length, ready: Object.values(inventory.runtime ?? {}).filter((entry) => entry.ready).length,
  spriteFolders: inventory.sprites.filter((entry) => entry.labels.length).length, sprites: inventory.sprites.reduce((total, entry) => total + entry.labels.length, 0),
});

async function presetOverlay(n: number, disabled: boolean, variant: string | null): Promise<OverlayRecord> {
  const paths = lane(n);
  const record = await applyPresetOverlay(paths.user, {
    read: async (path) => (existsSync(path) ? readFile(path, 'utf-8') : null),
    write: (path, text) => writeFile(path, text, 'utf-8'),
  }, { disabled, variant });
  await mkdir(paths.work, { recursive: true });
  await writeFile(join(paths.work, PRESET_OVERLAY_RECORD), JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

async function seed(n: number, commitArg: string | null, headed: boolean, stopAfter: boolean, noPresetOverlay = false, overlayVariant: string | null = null) {
  const { lanePreflight } = await import('./st-lanes.mts');
  const refused = lanePreflight();
  if (refused) throw new Error(`adolion-fresh needs the dev bundle: ${refused}`);
  const pin = await readPin(commitArg);
  const paths = lane(n);
  console.log(`[0/7] disk space on ${LANES_ROOT}`);
  const space = await spacePreflight(n, pin.repo, pin.commit);
  const exportDir = join(paths.work, `campaign-${pin.commit.slice(0, 12)}`);
  console.log(`[1/7] export campaign ${pin.commit} from ${pin.repo}, and its sprite packs (LFS worktree)`);
  await exportCampaign(pin.repo, pin.commit, exportDir);
  const spriteDir = await prepareSpriteCheckout(pin.repo, pin.commit, spriteCheckoutDir(paths.work, pin.commit));
  const manifest = await manifestFromExport(exportDir, pin.commit, spriteDir);
  console.log(`      ${manifest.sprites.length} sprite folder(s), ${manifest.sprites.reduce((total, entry) => total + entry.labels.length, 0)} file(s)`);
  console.log(`[2/7] re-seed lane ${n}`);
  await lanes('stop', String(n));
  await lanes('seed', String(n), '--fresh');
  const stripped = await strip(manifest, paths.user);
  console.log(`      stripped ${JSON.stringify(stripped)}`);
  const presets = await presetOverlay(n, noPresetOverlay, overlayVariant);
  console.log(presets.applied ? `      preset overlay ${presets.variant} ${presets.sha256.slice(0, 12)}: ${presets.edits.map((edit) => `${editLabel(edit)}${edit.changed ? '' : ' (unchanged)'}${edit.mirror ? ' +settings.json' : ''}`).join(', ')}` : `      preset overlay OFF (${presets.reason})`);
  const logFrom = await logSize(paths.root);
  console.log(`[3/7] start lane ${n}`);
  await lanes('start', String(n), ...(headed ? ['--headed'] : []));
  console.log(`[4/7] campaign installer -> ${paths.url}`);
  const install = await run('python', [join(exportDir, 'scripts', 'install_st.py')], { env: { ADOLION_ST_URL: paths.url.replace(/\/$/, ''), PYTHONIOENCODING: 'utf-8' } });
  const refusedLines = installerProblems(install.output);
  if (install.code !== 0 || refusedLines.length) throw new Error(`installer: exit ${install.code}; ${refusedLines.join('; ') || install.output.slice(-800)}`);
  console.log(`      ${install.output.split(/\r?\n/).filter(Boolean).length} lines, no FAIL/SKIP/WARN`);
  const spriteInstaller = join(spriteDir, '..', '..', 'scripts', 'install_st.py');
  const sprites = await run('python', [spriteInstaller, '--sprites'], { env: { ADOLION_ST_URL: paths.url.replace(/\/$/, ''), PYTHONIOENCODING: 'utf-8' } });
  const spriteRefused = installerProblems(sprites.output);
  if (sprites.code !== 0 || spriteRefused.length) throw new Error(`sprite upload: exit ${sprites.code}; ${spriteRefused.slice(0, 5).join('; ') || sprites.output.slice(-800)}`);
  console.log(`      sprites: ${sprites.output.split(/\r?\n/).filter((line) => /sprites uploaded/.test(line)).length} folder(s) uploaded, no FAIL`);
  console.log('[5/7] reload the page, then groups, lorebook selection, story imports');
  await inLane(n, 'scripts/debug/st-session.mts', 'reload');
  const pageOut = join(paths.work, 'page-seed.json');
  await rm(pageOut, { force: true });
  await inLane(n, 'scripts/debug/adolion-fresh.mts', '_page', 'seed', exportDir, pin.commit, pageOut);
  const page = await readJson(pageOut);
  await writeFile(join(paths.debug, 'adolion-fresh-asset-baseline.json'), JSON.stringify(page.baseline, null, 2), 'utf-8');
  console.log('[6/7] inventory');
  const inventory = await laneInventory(manifest, paths.user, exportDir, page.runtime, page.openGroup ?? null);
  const mediaCalls = await mediaCallsSince(paths.root, logFrom);
  const problems = [...page.problems, ...checkInventory(manifest, inventory), ...(pin.pinned ? [] : [`campaign ${pin.commit} is not the pinned commit`]),
    ...(mediaCalls.length ? [`the lane server made ${mediaCalls.length} image-generation call(s) during the seed: ${mediaCalls[0]}`] : [])];
  const report = await writeRecord(n, inventory, problems, {
    commit: pin.commit, pinned: pin.pinned, stripped, baseline: join(paths.debug, 'adolion-fresh-asset-baseline.json'), baselineTrusted: page.baseline?.trusted ?? false,
    extraction: page.extraction, groups: page.groups, imports: page.imports, castResets: page.castResets ?? [], notes: page.notes ?? [], summary: summary(inventory),
    space, laneBytes: await dirBytes(paths.root), presetOverlay: presets,
  });
  if (stopAfter) { console.log('[7/7] stop lane'); await lanes('stop', String(n)); } else console.log(`[7/7] lane ${n} left running at ${paths.url}`);
  return report;
}

async function check(n: number, dropBook: string | null) {
  const paths = lane(n);
  const latest = join(paths.work, 'inventory-latest.json');
  if (!existsSync(latest)) throw new Error(`lane ${n} has no adolion-fresh inventory: run \`adolion-fresh.mts seed ${n}\` first`);
  const commit = (await readJson(latest)).commit as string;
  const exportDir = join(paths.work, `campaign-${commit.slice(0, 12)}`);
  const spriteDir = join(spriteCheckoutDir(paths.work, commit), 'campaign', 'sprites');
  const manifest = await manifestFromExport(exportDir, commit, existsSync(spriteDir) ? spriteDir : null);
  const logFrom = await logSize(paths.root);
  const pageOut = join(paths.work, 'page-check.json');
  await rm(pageOut, { force: true });
  await inLane(n, 'scripts/debug/adolion-fresh.mts', '_page', 'check', exportDir, commit, pageOut, ...(dropBook ? ['--drop-book', dropBook] : []));
  const page = await readJson(pageOut);
  const inventory = await laneInventory(manifest, paths.user, exportDir, page.runtime, page.openGroup ?? null);
  const mediaCalls = await mediaCallsSince(paths.root, logFrom);
  const problems = [...page.problems, ...checkInventory(manifest, inventory), ...(mediaCalls.length ? [`the lane server made ${mediaCalls.length} image-generation call(s): ${mediaCalls[0]}`] : [])];
  const previous = await readJson(latest);
  const drift = diffInventories(previous, inventory);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { lane: n, commit, droppedBook: dropBook, dropped: page.dropped ?? null, problems, driftFromSeed: drift, summary: summary(inventory) };
  await writeFile(join(paths.work, `check-${stamp}.json`), JSON.stringify({ ...report, inventory }, null, 2), 'utf-8');
  return report;
}

async function pagePhase(mode: 'seed' | 'check', exportDir: string, commit: string, outFile: string, dropBook: string | null) {
  const [{ runCli }, { evaluateInST }, { waitForSettledChat }, { snapshotAssets }, { evalInST }, { saveSettingsNow }, { readExtractionSettings, restoreExtractionSettings }, { deleteLorebooksInPage }, { waitForAppReady, cardListing }] = await Promise.all([
    import('./lib/cli.mts'), import('./lib/evaluate.mts'), import('./st-navigation.mts'), import('./so-assets.mts'), import('./st-eval.mts'),
    import('./lib/settingsSave.mts'), import('./lib/extractionSettings.mts'), import('./lib/lorebookDelete.mts'), import('./lib/stAppReady.mts'),
  ]);
  const manifest = await manifestFromExport(exportDir, commit);
  await runCli(async (page) => {
    const problems: string[] = [];
    const notes: string[] = [];
    const out: Record<string, unknown> = { mode, problems, notes };
    const settle = async () => {
      await waitForSettledChat(page, { quietMs: 1500, timeoutMs: 60000 });
      const started = Date.now();
      while (Date.now() - started < 30000) {
        const saving = await evaluateInST(page, async () => Boolean(((await import(/* webpackIgnore: true */ '/script.js' as string)) as { isChatSaving?: boolean }).isChatSaving));
        if (!saving) break;
        await page.waitForTimeout(250);
      }
      let last = '';
      let stableSince = Date.now();
      const groupsStarted = Date.now();
      while (Date.now() - groupsStarted < 90000) {
        const now = await evaluateInST(page, async () => {
          const ctx = SillyTavern.getContext();
          const response = await fetch('/api/groups/all', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' });
          const groups = response.ok ? await response.json() : [];
          return JSON.stringify(groups.filter((group) => String(group.name ?? '').startsWith('Adolion - ')).map((group) => [group.id, [...(group.disabled_members ?? [])].sort(), group.chat_id]));
        });
        if (now !== last) { last = now; stableSince = Date.now(); }
        else if (Date.now() - stableSince >= 4000) break;
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1000);
    };
    const waitForStartCast = async (groupName: string, expected: string[]) => {
      const started = Date.now();
      let last = -1;
      let progressAt = Date.now();
      let disabled = 0;
      while (Date.now() - progressAt < 60000 && Date.now() - started < 900000) {
        const now = await evaluateInST(page, async (name: string) => {
          const ctx = SillyTavern.getContext();
          const response = await fetch('/api/groups/all', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' });
          const groups = response.ok ? await response.json() : [];
          return (groups.find((group: { name?: string }) => group.name === name)?.disabled_members ?? []) as string[];
        }, groupName);
        disabled = expected.filter((avatar) => now.includes(avatar)).length;
        const extra = now.filter((avatar) => !expected.includes(avatar)).length;
        if (disabled === expected.length && !extra) return { done: true, expected: expected.length, disabled, ms: Date.now() - started, stalledMs: 0 };
        if (disabled !== last) { last = disabled; progressAt = Date.now(); }
        await page.waitForTimeout(1000);
      }
      return { done: false, expected: expected.length, disabled, ms: Date.now() - started, stalledMs: Date.now() - progressAt };
    };
    const openBound = async (name: string) => {
      const opened = await evaluateInST(page, async (groupName: string) => {
        const ctx = SillyTavern.getContext();
        const chats = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { openGroupById: (id: string) => Promise<boolean>; is_group_generating?: boolean };
        const script = await import(/* webpackIgnore: true */ '/script.js' as string) as { isChatSaving?: boolean; is_send_press?: boolean };
        const group = (ctx.groups ?? []).find((candidate) => candidate.name === groupName);
        if (!group) return { ok: false, reason: 'no such group' };
        const started = Date.now();
        let refusals = 0;
        while (Date.now() - started < 120000) {
          if (ctx.groupId === group.id && SillyTavern.getContext().chatId) return { ok: true, refusals };
          if (SillyTavern.getContext().groupId !== group.id && !(await chats.openGroupById(group.id))) refusals += 1;
          await new Promise((done) => setTimeout(done, 1000));
          if (SillyTavern.getContext().groupId === group.id && SillyTavern.getContext().chatId) return { ok: true, refusals };
        }
        return { ok: false, reason: 'openGroupById never took', refusals, isChatSaving: Boolean(script.isChatSaving), sendPress: Boolean(script.is_send_press), groupGenerating: Boolean(chats.is_group_generating), groupId: SillyTavern.getContext().groupId ?? null };
      }, name);
      if (!opened.ok) throw new Error(`open group ${name}: ${JSON.stringify(opened)}`);
      await settle();
      const where = await evaluateInST(page, (groupName) => {
        const ctx = SillyTavern.getContext();
        const group = (ctx.groups ?? []).find((candidate) => candidate.name === groupName);
        return { expected: group?.id ?? null, groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null };
      }, name);
      if (!where.expected || where.groupId !== where.expected || !where.chatId) throw new Error(`could not open group ${name}: ${JSON.stringify(where)}`);
      return where;
    };

    const extraction = await readExtractionSettings(page);
    await evaluateInST(page, () => { (globalThis as any).storyOrchestratorRuntime?.setExtractionSettings({ enabled: false }); });
    if (mode === 'seed') {
      await waitForAppReady(page);
      const avatars = manifest.cards.map((card) => card.avatar);
      const listedFrom = Date.now();
      let listing = await evaluateInST(page, cardListing, avatars);
      while ((!listing.ready || listing.missing.length) && Date.now() - listedFrom < 90000) {
        await page.waitForTimeout(2000);
        listing = await evaluateInST(page, cardListing, avatars);
      }
      if (!listing.ready) throw new Error('SillyTavern lost APP_READY while the seed listed the cards (the page reloaded under the seed)');
      if (listing.missing.length) throw new Error(`the page does not list ${listing.missing.length} installed card(s): ${listing.missing.slice(0, 10).join(', ')}`);
      const groups = await evalInST(page, await readFile(join(exportDir, 'build', 'st-groups.js'), 'utf-8'));
      if (!groups.ok) throw new Error(`st-groups.js failed: ${groups.error}`);
      out.groups = groups.value;
      const failed = ((groups.value as any[]) ?? []).filter((entry) => entry?.error || (entry?.status && entry.status !== 200));
      if (failed.length) throw new Error(`st-groups.js: ${failed.map((entry) => `${entry.name}: ${entry.error ?? entry.status}`).join('; ')}`);
      await saveSettingsNow(page);
      await page.waitForTimeout(2500);

      out.selected = await evaluateInST(page, async () => {
        const ctx = SillyTavern.getContext();
        const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { updateWorldInfoList: () => Promise<void>; selected_world_info: string[] };
        await wi.updateWorldInfoList();
        const slash = (command: string) => ctx.executeSlashCommandsWithOptions(command, { handleParserErrors: false, handleExecutionErrors: false });
        for (const name of [...wi.selected_world_info]) await slash(`/world state=off silent=true "${name}"`);
        return [...wi.selected_world_info].sort();
      });
      await saveSettingsNow(page);

      const imports: Record<string, unknown>[] = [];
      for (const group of manifest.groups) {
        const story = manifest.stories.find((candidate) => candidate.id === group.story);
        if (!story) { problems.push(`group ${group.name} names unknown story ${group.story}`); continue; }
        const where = await openBound(group.name);
        const raw = await readFile(join(exportDir, 'build', 'story', `${story.id}.story.json`), 'utf-8');
        const result = await evaluateInST(page, async ({ raw, id }) => {
          const rt = (globalThis as any).storyOrchestratorRuntime;
          const ok = await rt.importStory(raw);
          const started = Date.now();
          while (Date.now() - started < 30000 && rt.getSnapshot()?.storyId !== id) await new Promise((done) => setTimeout(done, 250));
          const snapshot = rt.getSnapshot();
          return { ok, storyId: snapshot?.storyId ?? null, checkpoint: snapshot?.engine?.activeCheckpointId ?? snapshot?.activeCheckpointId ?? null, status: snapshot?.status ?? null };
        }, { raw, id: story.id });
        const cast = await waitForStartCast(group.name, expectedStartDisabled(manifest, group));
        imports.push({ story: story.id, group: group.name, chatId: where.chatId, ...result, cast });
        if (!result.ok || result.storyId !== story.id) problems.push(`import ${story.id}: ${JSON.stringify(result)}`);
        if (!cast.done) notes.push(`import ${story.id}: the start cast was not complete after the import (${cast.disabled}/${cast.expected} disabled, stalled ${cast.stalledMs} ms); a refused write-ahead is re-applied by the next hydrate`);
        await settle();
      }
      out.imports = imports;
    }

    if (dropBook) out.dropped = await deleteLorebooksInPage(page, [dropBook]);

    const runtime: Record<string, RuntimeReadiness> = {};
    for (const group of manifest.groups) {
      await openBound(group.name);
      runtime[group.story] = await evaluateInST(page, () => {
        const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.();
        const requirements = snapshot?.requirements ?? {};
        return {
          ready: requirements.ready === true, storyId: snapshot?.storyId ?? null,
          missingLorebooks: requirements.missingLorebooks ?? [], missingMembers: requirements.missingMembers ?? [], missingPersonas: requirements.missingPersonas ?? [],
        };
      });
    }
    out.runtime = runtime;
    await settle();
    out.openGroup = await evaluateInST(page, () => {
      const ctx = SillyTavern.getContext();
      return (ctx.groups ?? []).find((group) => group.id === ctx.groupId)?.name ?? null;
    });
    if (mode === 'seed') {
      const listGroups = () => evaluateInST(page, async () => {
        const ctx = SillyTavern.getContext();
        const response = await fetch('/api/groups/all', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' });
        const groups = response.ok ? await response.json() : [];
        return groups.map((group: { id: string; name?: string; disabled_members?: string[] }) => ({ id: String(group.id), name: String(group.name ?? ''), disabled_members: group.disabled_members ?? [] }));
      });
      const resets = castResetPlan(manifest, await listGroups(), (out.openGroup as string | null) ?? null);
      if (resets.length) {
        await evaluateInST(page, async (plan: Array<{ id: string; now: string[] }>) => {
          const ctx = SillyTavern.getContext();
          const chats = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { editGroup: (id: string, immediately?: boolean, reload?: boolean) => Promise<void> };
          for (const reset of plan) {
            const group = (ctx.groups ?? []).find((candidate) => String(candidate.id) === reset.id);
            if (!group) continue;
            group.disabled_members = [...reset.now];
            await chats.editGroup(reset.id, true, false);
          }
        }, resets.map((reset) => ({ id: reset.id, now: reset.now })));
        await page.waitForTimeout(2500);
        const left = castResetPlan(manifest, await listGroups(), (out.openGroup as string | null) ?? null);
        for (const still of left) problems.push(`group ${still.group}: cast reset did not land: disabled [${still.was.join(', ')}], want [${still.now.join(', ')}]`);
        notes.push(`cast reset to the campaign's initial state before the check: ${resets.map((reset) => `${reset.group} disabled [${reset.was.join(', ')}] -> [${reset.now.join(', ')}]`).join('; ')}`);
      }
      out.castResets = resets;
    }
    const restore = await restoreExtractionSettings(page, extraction);
    out.extraction = { before: extraction, restore };
    if ((restore as { ok?: boolean }).ok === false) problems.push(`extraction settings not restored: ${JSON.stringify(restore)}`);
    if (mode === 'seed') out.baseline = await snapshotAssets(page);
    await saveSettingsNow(page);
    await writeFile(outFile, JSON.stringify(out, null, 2), 'utf-8');
    return { ok: true };
  });
}

const argValue = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
};

const laneArg = (value: string | undefined) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error(`lane must be 1..50 (lane 0 is the user's), got ${value}`);
  return n;
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  if (command === '_page') {
    const [mode, exportDir, commit, outFile] = rest;
    await pagePhase(mode as 'seed' | 'check', exportDir, commit, outFile, argValue(rest, '--drop-book'));
    return;
  }
  let report: { problems: string[] } & Record<string, unknown>;
  if (command === 'seed') {
    const n = laneArg(rest[0]);
    if (!rest.includes('--break-lease')) {
      const { leaseRefusal, readLease, sessionsUnder } = await import('./lib/sessionLanes.mts');
      const refused = leaseRefusal(await readLease(lane(n).root), await sessionsUnder(resolve(REPO_ROOT, 'test', 'sessions')), argValue(rest, '--for'));
      if (refused) throw new Error(`refusing to re-seed: ${refused}`);
    }
    if (rest.includes('--no-preset-overlay') && argValue(rest, '--preset-overlay')) throw new Error('--preset-overlay and --no-preset-overlay exclude each other');
    report = await seed(n, argValue(rest, '--commit'), rest.includes('--headed'), rest.includes('--stop'), rest.includes('--no-preset-overlay'), argValue(rest, '--preset-overlay'));
  }
  else if (command === 'check') report = await check(laneArg(rest[0]), argValue(rest, '--drop-book'));
  else if (command === 'diff') {
    const drift = diffInventories(await readJson(resolve(rest[0])), await readJson(resolve(rest[1])));
    report = { problems: drift, identical: drift.length === 0 };
  } else { console.log(USAGE); process.exitCode = 2; return; }
  const { drift, driftFromSeed, ...shown } = report as Record<string, unknown>;
  console.log(JSON.stringify({ ...shown, driftCount: Array.isArray(drift) ? drift.length : Array.isArray(driftFromSeed) ? (driftFromSeed as unknown[]).length : undefined, drift: Array.isArray(drift) ? (drift as string[]).slice(0, 20) : Array.isArray(driftFromSeed) ? (driftFromSeed as string[]).slice(0, 20) : undefined }, null, 2));
  if (report.problems.length || (report as { sameAsPrevious?: boolean }).sameAsPrevious === false) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

