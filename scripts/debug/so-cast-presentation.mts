import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withST } from './lib/cli.mts';
import { DEBUG_DIR } from './lib/connection.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { chooseCharacter, preflightCommon, saveSoon, step, stepBase, stepEdits, stepPrepare, stepRig, type Member, type StepCtx, type StepEnv, type StepResult } from './lib/pocSteps.mts';
import { cleanupProblems, parseCastArgs, pickMembers, type CleanupReport } from './lib/castPresentation.mts';
import { settleReapPrompts } from './lib/identityVerbs.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { openGroup, closeUnpinnedDrawers, startNewChat, deleteSandboxChats } from './st-navigation.mts';
import { closeCheckpointStudio } from './so-ui.mts';
import { removeStory } from './so-library.mts';
import { captureHeader, diffHeaders } from './so-run-header.mts';

const USAGE = `Usage (lane >= 1, never lane 0 or the owner's ST; posts to the lane's ComfyUI, so the lane must be cleared for it):
  node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-cast-presentation.mts --group <name|id> [--members "Name A,Name B"]
    [--set <id>] [--only base,prepare,expressions,frames,rig] [--front] [--allow <run-header path,...>]

Prepares the product presentation (base, bust, expressions, blink/talk frames per expression, rig) for an existing
group's members through Studio > Sprites, in a new sandbox chat with a temporary workshop story. The cast is read
from the group; --members keeps only those names. --front retries up to 4 seeds until the rig accepts a front-facing
base (replaces base, prepare and rig). Afterwards the sandbox chat is deleted (reap prompts settled), the workshop
story removed, the install-wide sprite settings restored, and the run header diffed (--allow declares expected paths).
The prepared sets stay in the lane's character folders; so-sprite-copy.mts lists and copies them to the owner's
install only with --confirm. Evidence in <debug dir>/cast-presentation/<stamp>/record.json; exit 1 on any cleanup gap.`;

const args = parseCastArgs(process.argv.slice(2));
if (args.help) { console.log(USAGE); process.exit(0); }
if (args.errors.length) { console.log([...args.errors, USAGE].join('\n')); process.exit(2); }
if (!Number.isInteger(Number(process.env.SO_LANE)) || Number(process.env.SO_LANE) < 1) throw new Error('Use an isolated lane: st-lanes.mts run <n> -- ... with n >= 1.');

const EXPRESSIONS = ['happy', 'angry', 'worried'];
const FRONT_TRIES = 4;
const WORKSHOP = { id: 'so-cast-presentation', title: 'SO Cast presentation workshop' };
const chosen = new Map<string, string>();
const set = args.set;

async function frontBase(env: StepEnv, member: Member): Promise<StepResult> {
  const tries: unknown[] = [];
  for (let attempt = 1; attempt <= FRONT_TRIES; attempt += 1) {
    chosen.set(member.id, `${set}${'abcd'[attempt - 1]}`);
    const root = await chooseCharacter(env, member);
    await root.getByLabel('Seed', { exact: true }).fill(String(5000 + env.seedOf(member) * 10 + attempt * 7));
    const base = env.page.locator('#so-sprite-base');
    if (!await base.getByRole('button', { name: 'Build a base candidate' }).isVisible().catch(() => false)) await base.locator('summary').click({ force: true });
    await base.getByLabel('Background removal', { exact: true }).selectOption(env.alpha);
    await base.getByRole('button', { name: 'Build a base candidate' }).click({ force: true });
    await env.page.waitForFunction(() => { const b = document.getElementById('so-sprite-build-base') as HTMLButtonElement | null; return b && !b.disabled; }, undefined, { polling: 500, timeout: 1_800_000 });
    const count = await base.getByRole('img', { name: /Base candidate/ }).count();
    if (!count) { tries.push({ attempt, outcome: 'no candidate' }); continue; }
    await base.getByRole('button', { name: `Keep base ${count}`, exact: true }).click({ force: true });
    await env.page.waitForFunction(() => document.getElementById('so-sprite-base')?.textContent?.includes('Saved neutral base to '), undefined, { polling: 250, timeout: 60000 });
    const prepared = await stepPrepare(env, member);
    if (prepared.outcome === 'refused') { tries.push({ attempt, prepare: prepared.detail }); continue; }
    const rig = await stepRig(env, member);
    tries.push({ attempt, rig: rig.outcome ?? 'pass', detail: rig.detail?.slice(0, 200) });
    if (!rig.outcome) return { data: { attempt, tries } };
  }
  return { outcome: 'refused', detail: `no front-facing base in ${FRONT_TRIES} tries`, data: { tries } };
}

const dir = resolve(DEBUG_DIR, 'cast-presentation', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(dir, { recursive: true });

await withST(async (page) => {
  let cast: Member[] = [];
  const env: StepEnv = { page, mode: 'real', models: { diffusion: '', encoder: '', vae: '' }, alpha: '', setOf: (member) => chosen.get(member.id) ?? set,
    seedOf: (member) => cast.findIndex((row) => row.id === member.id) };
  const ctx: StepCtx = { page, dir, rows: [], refusals: [], current: 'setup', only: args.only };
  const save = (extra: Record<string, unknown> = {}) => writeFile(resolve(dir, 'record.json'), JSON.stringify({ set, members: cast, rows: ctx.rows, refusals: ctx.refusals, ...extra }, null, 2));
  const pre = await preflightCommon(env, 'SO-CAST');
  await openGroup(page, args.group);
  const group = await page.evaluate(() => {
    const st = (globalThis as any).SillyTavern.getContext();
    const found = (st.groups ?? []).find((entry: { id: string }) => String(entry.id) === String(st.groupId));
    const names = (found?.members ?? []).map((avatar: string) => st.characters.find((character: { avatar: string }) => character.avatar === avatar)?.name).filter(Boolean);
    return { id: found ? String(found.id) : null, names: names as string[], chats: (found?.chats ?? []) as string[] };
  });
  if (!group.id) throw new Error(`group "${args.group}" did not open`);
  const picked = pickMembers(group.names, args.members);
  if (picked.missing.length) throw new Error(`not in group "${args.group}": ${picked.missing.join(', ')}`);
  if (!picked.cast.length) throw new Error(`group "${args.group}" has no members to prepare`);
  cast = picked.cast;
  const before = await captureHeader(page, 'cast-presentation-before');
  const spritesBefore = await page.evaluate(() => {
    const root = (globalThis as any).SillyTavern.getContext().extensionSettings['story-orchestrator'];
    const raw = root?.settings?.sprites;
    return raw === undefined ? { absent: true } : { absent: false, value: structuredClone(raw) };
  });
  await startNewChat(page);
  const sandboxChat = await page.evaluate(() => String((globalThis as any).SillyTavern.getContext().chatId ?? '')) || null;
  if (!sandboxChat || group.chats.includes(sandboxChat)) throw new Error('the sandbox chat did not open; refusing to bind the workshop story to an existing chat');
  const cleanup: CleanupReport = { removed: null, chats: null, reapPrompts: null, spriteSettings: { restored: false }, differences: null };
  try {
    await page.evaluate(() => (globalThis as any).storyOrchestratorSprites.updateSettings({ enabled: true, explicit: true, stage: 'always', poses: true, liveHead: true, onDemand: false }));
    await saveSoon(page);
    await page.evaluate(async ({ cast, workshop }) => {
      const rt = (globalThis as any).storyOrchestratorRuntime;
      const story = { ...workshop, description: 'Temporary workshop for preparing character presentation.',
        roster: cast.map((member: { id: string; name: string }) => ({ id: member.id, name: member.name, role: 'Portrait subject' })),
        requirements: { members: cast.map((member: { name: string }) => member.name) },
        qualities: [{ key: 'workshop', type: 'bool', source: 'code', rubric: 'Workshop marker.' }],
        checkpoints: [{ id: 'start', name: 'Workshop', type: 'anchor', start: true, objective: 'Prepare presentation.', illustrate: false }], transitions: [] };
      await rt.importStory(JSON.stringify(story));
      if (rt.getSnapshot().storyId !== story.id) throw new Error(`workshop import refused: ${JSON.stringify(rt.getSnapshot().validationErrors)}`);
      rt.setUiSettings({ authorView: true });
    }, { cast, workshop: WORKSHOP });
    for (let attempt = 0; attempt < 5 && await page.locator('dialog#so-briefing[open]').count(); attempt += 1) {
      await dismissBriefing(page).catch(() => page.waitForTimeout(2000));
    }
    await closeUnpinnedDrawers(page);
    for (const member of cast) {
      for (const [id, run] of [
        ...(args.front ? [['front', () => frontBase(env, member)]] as const : [['base', () => stepBase(env, member)], ['prepare', () => stepPrepare(env, member)]] as const),
        ['expressions', () => stepEdits(env, member, EXPRESSIONS.map((label) => ({ label, kind: 'expression', reference: `${env.setOf(member)}/neutral` })))],
        ['frames', () => stepEdits(env, member, ['neutral', ...EXPRESSIONS].flatMap((label) => ['blink', 'talk'].map((kind) => ({ label, kind, reference: `${env.setOf(member)}/${label}` }))))],
        ...(args.front ? [] : [['rig', () => stepRig(env, member)]] as const),
      ] as const) {
        await step(ctx, id, member.id, run);
        await save();
      }
    }
  } finally {
    await closeCheckpointStudio(page).catch(() => undefined);
    cleanup.removed = await removeStory(page, WORKSHOP.title).catch((error) => ({ error: String(error) }));
    cleanup.chats = await deleteSandboxChats(page, { groupId: group.id, owned: [sandboxChat], preexisting: group.chats }).catch((error) => ({ error: String(error) }));
    cleanup.reapPrompts = await settleReapPrompts(page, [sandboxChat]).catch((error) => ({ error: String(error) }));
    cleanup.spriteSettings = await page.evaluate((snapshot) => {
      const st = (globalThis as any).SillyTavern.getContext();
      const root = st.extensionSettings['story-orchestrator'] ??= {};
      root.settings ??= {};
      if (snapshot.absent) delete root.settings.sprites;
      else root.settings.sprites = snapshot.value;
      (globalThis as any).storyOrchestratorRuntime?.touch?.();
      return JSON.stringify(root.settings.sprites ?? null) === JSON.stringify(snapshot.absent ? null : snapshot.value);
    }, spritesBefore).then(async (restored) => { await saveSettingsNow(page); return { restored }; }, (error) => ({ restored: false, error: String(error) }));
    const after = await captureHeader(page, 'cast-presentation-after').catch((error) => ({ error: String(error) }));
    cleanup.differences = 'error' in (after as object) ? after as { error: string } : diffHeaders(before, after, args.allow, { ownedChats: [sandboxChat] });
    const problems = cleanupProblems(cleanup, sandboxChat);
    await save({ preflight: { warm: pre.warm }, group: { id: group.id, sandboxChat }, cleanup, problems });
    console.log(JSON.stringify({ dir, rows: ctx.rows.map((row) => `${row.member}:${row.id}:${row.outcome}`), problems }));
    if (problems.length) process.exitCode = 1;
  }
});
