import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanesRootFor, REPO_ROOT } from '../lib/stRoot.mjs';
import {
  buildInventory, buildManifest, checkInventory, diffInventories, expectedStartDisabled, installerProblems, isInstalledBook, stripPlan,
  type AdolionManifest, type Inventory, type LaneDisk, type RuntimeReadiness,
} from './lib/adolionFresh.mts';

const USAGE = `Usage: node scripts/debug/adolion-fresh.mts <command> [...]

v2.6 overview rule 14: a clean Adolion install on a freshly seeded lane, checked against the pinned
campaign build. Lanes 1+ only; lane 0 is the user's.

  seed <lane> [--commit <sha>] [--headed] [--stop]
      stop the lane, re-seed it (st-lanes seed --fresh), strip the campaign's assets from the copy,
      start it, run the campaign installer at the pinned commit (adolion-fresh.pin.json), create the
      groups, select exactly the lorebooks the stories require, import the nine stories, take a
      so-assets baseline, then write and check the inventory (and diff it against the lane's last one)
  check <lane> [--drop-book <name>]
      re-read the inventory of a running lane and check it; --drop-book deletes that book first
      (the planted-missing-book negative control)
  diff <a.json> <b.json>    compare two inventories, exit 1 on any difference`;

const PIN_FILE = resolve(REPO_ROOT, 'scripts', 'debug', 'adolion-fresh.pin.json');
const LANES_ROOT = lanesRootFor(process.env, REPO_ROOT);
const EXPORT_PATHS = ['build/lorebooks', 'build/cards', 'build/story', 'build/st-groups.js', 'scripts'];

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

export async function manifestFromExport(dir: string, commit: string): Promise<AdolionManifest> {
  const storyDir = join(dir, 'build', 'story');
  const cardDir = join(dir, 'build', 'cards');
  const bookDir = join(dir, 'build', 'lorebooks');
  const stories = await Promise.all((await readdir(storyDir)).filter((file) => file.endsWith('.story.json')).map((file) => readJson(join(storyDir, file))));
  const cards = await Promise.all((await readdir(cardDir)).filter((file) => file.endsWith('.png')).map(async (file) => ({
    avatar: file, data: await readJson(join(cardDir, file.replace(/\.png$/, '.json'))).catch(() => ({})),
  })));
  const books = await Promise.all((await readdir(bookDir)).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, ''))
    .filter(isInstalledBook).map(async (name) => ({ name, data: await readJson(join(bookDir, `${name}.json`)) })));
  return buildManifest({ commit, stories, cards, books, groupScript: await readFile(join(dir, 'build', 'st-groups.js'), 'utf-8') });
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
  for (const dir of plan.chatDirs) await rm(join(user, 'chats', dir), { recursive: true, force: true });
  for (const file of plan.groupFiles) await rm(join(user, 'groups', file), { force: true });
  for (const file of plan.groupChats) await rm(join(user, 'group chats', file), { force: true });
  await writeFile(join(user, 'settings.json'), JSON.stringify(plan.settings, null, 4), 'utf-8');
  return { worlds: plan.worlds.length, characters: plan.characters.length, chatDirs: plan.chatDirs.length, groups: plan.groupFiles.length, groupChats: plan.groupChats.length, ...plan.removed };
}

async function laneInventory(manifest: AdolionManifest, user: string, exportDir: string, runtime: Record<string, RuntimeReadiness> | null, openGroup: string | null = null): Promise<Inventory> {
  const disk = await readLaneDisk(user);
  const titles = manifest.stories.map((story) => `Story Orchestrator - ${story.title}`);
  const wanted = disk.worlds.filter((name) => isInstalledBook(name) || name.startsWith('Adolion') || titles.some((title) => name.startsWith(title)));
  const books = await Promise.all(wanted.map(async (name) => ({ name, data: await readJson(join(user, 'worlds', `${name}.json`)) })));
  const ledgerPath = join(exportDir, 'build', 'installed.json');
  return buildInventory(manifest, {
    commit: manifest.commit, books, characters: disk.characters, groups: disk.groups as any, settings: disk.settings,
    ledger: existsSync(ledgerPath) ? await readJson(ledgerPath) : null, runtime, openGroup,
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
  const previous = existsSync(latest) ? await readJson(latest) : null;
  const drift = previous ? diffInventories(previous, inventory) : null;
  const file = join(work, `inventory-${stamp}.json`);
  await writeFile(file, JSON.stringify(inventory, null, 2), 'utf-8');
  await writeFile(latest, JSON.stringify(inventory, null, 2), 'utf-8');
  const report = { lane: n, file, problems, sameAsPrevious: drift ? drift.length === 0 : null, drift, ...extra };
  await writeFile(join(work, `report-${stamp}.json`), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

const summary = (inventory: Inventory) => ({
  books: inventory.books.length, cards: inventory.cards.length, groups: inventory.groups.length, stories: inventory.library.length,
  selected: inventory.selected.length, ready: Object.values(inventory.runtime ?? {}).filter((entry) => entry.ready).length,
});

async function seed(n: number, commitArg: string | null, headed: boolean, stopAfter: boolean) {
  const { lanePreflight } = await import('./st-lanes.mts');
  const refused = lanePreflight();
  if (refused) throw new Error(`adolion-fresh needs the dev bundle: ${refused}`);
  const pin = await readPin(commitArg);
  const paths = lane(n);
  const exportDir = join(paths.work, `campaign-${pin.commit.slice(0, 12)}`);
  console.log(`[1/7] export campaign ${pin.commit} from ${pin.repo}`);
  await exportCampaign(pin.repo, pin.commit, exportDir);
  const manifest = await manifestFromExport(exportDir, pin.commit);
  console.log(`[2/7] re-seed lane ${n}`);
  await lanes('stop', String(n));
  await lanes('seed', String(n), '--fresh');
  const stripped = await strip(manifest, paths.user);
  console.log(`      stripped ${JSON.stringify(stripped)}`);
  const logFrom = await logSize(paths.root);
  console.log(`[3/7] start lane ${n}`);
  await lanes('start', String(n), ...(headed ? ['--headed'] : []));
  console.log(`[4/7] campaign installer -> ${paths.url}`);
  const install = await run('python', [join(exportDir, 'scripts', 'install_st.py')], { env: { ADOLION_ST_URL: paths.url.replace(/\/$/, ''), PYTHONIOENCODING: 'utf-8' } });
  const refusedLines = installerProblems(install.output);
  if (install.code !== 0 || refusedLines.length) throw new Error(`installer: exit ${install.code}; ${refusedLines.join('; ') || install.output.slice(-800)}`);
  console.log(`      ${install.output.split(/\r?\n/).filter(Boolean).length} lines, no FAIL/SKIP/WARN`);
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
    extraction: page.extraction, groups: page.groups, imports: page.imports, notes: page.notes ?? [], summary: summary(inventory),
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
  const manifest = await manifestFromExport(exportDir, commit);
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
  const [{ runCli }, { evaluateInST }, { waitForSettledChat }, { snapshotAssets }, { evalInST }, { saveSettingsNow }, { readExtractionSettings, restoreExtractionSettings }, { deleteLorebooksInPage }] = await Promise.all([
    import('./lib/cli.mts'), import('./lib/evaluate.mts'), import('./st-navigation.mts'), import('./so-assets.mts'), import('./st-eval.mts'),
    import('./lib/settingsSave.mts'), import('./lib/extractionSettings.mts'), import('./lib/lorebookDelete.mts'),
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
      const unlisted = await evaluateInST(page, async (avatars: string[]) => {
        const ctx = SillyTavern.getContext();
        const started = Date.now();
        let missing = avatars;
        while (Date.now() - started < 90000) {
          await ctx.getCharacters();
          const have = new Set((ctx.characters ?? []).map((character) => character?.avatar));
          missing = avatars.filter((avatar) => !have.has(avatar));
          if (!missing.length) break;
          await new Promise((done) => setTimeout(done, 2000));
        }
        return missing;
      }, manifest.cards.map((card) => card.avatar));
      if (unlisted.length) throw new Error(`the page does not list ${unlisted.length} installed card(s): ${unlisted.slice(0, 10).join(', ')}`);
      const groups = await evalInST(page, await readFile(join(exportDir, 'build', 'st-groups.js'), 'utf-8'));
      if (!groups.ok) throw new Error(`st-groups.js failed: ${groups.error}`);
      out.groups = groups.value;
      const failed = ((groups.value as any[]) ?? []).filter((entry) => entry?.error || (entry?.status && entry.status !== 200));
      if (failed.length) throw new Error(`st-groups.js: ${failed.map((entry) => `${entry.name}: ${entry.error ?? entry.status}`).join('; ')}`);
      await saveSettingsNow(page);
      await page.waitForTimeout(2500);

      out.selected = await evaluateInST(page, async (required: string[]) => {
        const ctx = SillyTavern.getContext();
        const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { updateWorldInfoList: () => Promise<void>; selected_world_info: string[] };
        await wi.updateWorldInfoList();
        const slash = (command: string) => ctx.executeSlashCommandsWithOptions(command, { handleParserErrors: false, handleExecutionErrors: false });
        for (const name of [...wi.selected_world_info]) if (!required.includes(name)) await slash(`/world state=off silent=true "${name}"`);
        for (const name of required) if (!wi.selected_world_info.includes(name)) await slash(`/world state=on silent=true "${name}"`);
        return [...wi.selected_world_info].sort();
      }, manifest.requiredBooks);
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
  if (command === 'seed') report = await seed(laneArg(rest[0]), argValue(rest, '--commit'), rest.includes('--headed'), rest.includes('--stop'));
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

