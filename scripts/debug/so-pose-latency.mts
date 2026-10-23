import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { snapshotSpriteAssets, scopedSprites } from './lib/spriteAssets.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers, readActiveChat } from './st-navigation.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { captureHeader } from './so-run-header.mts';
import { closeCheckpointStudio } from './so-ui.mts';
import { removeStory } from './so-library.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { CARD_ART_DEVIATION, cardArtPlan, cardArtProblems, giveCardArt, leakNames, markServerLog, takeServerLog } from './lib/pocCardArt.mts';
import {
  FLOORS_DATE, POSE_FLOORS, POSE_MARKER, PLAYER_LINES, armOrder, checkpointForTurn, countCalls, directedPoses, evidenceDirName, latencyVerdict, poseCast, poseStory,
  sampleSummary, type Mode, type PoseMember, type StepRow,
} from './lib/pocDrivers.mts';
import { attachCallRecorder, forceMotion, installCandidateRoute, installDryRoutes, installProbes, playTurn, sampleNow, startSampler, writeRecord, type DryRoutes, type TurnResult } from './lib/pocLive.mts';
import {
  DRY_MODELS, activate, captureSettings, freshPage, preflightCommon, restoreSettings, saveSoon, settleSaves, step, stepBase, stepPoses, stepPrepare, type SettingsCapture, type StepEnv, type StepResult,
} from './lib/pocSteps.mts';

const USAGE = `Usage (always through a lane >= 30):
  node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-pose-latency.mts run <k> [--dry] [--turns 8] [--candidate] [--keep] [--settle-min 20]
  node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-pose-latency.mts cleanup [--dry]
  node scripts/debug/so-pose-latency.mts floors

Plan 33 §6 Acceptance on one install: a synthetic 3-member story (3 looks x 4 directed poses x 3 labels).
run <k> sets up the cast through the product path (cards, base, Prepare presentation, Prepare story poses before play), then plays the
arm pair on fresh chats of one group: "off" (sprites off, the no-sprites arm) and "on" (sprites, poses and on-demand
renders on), order off->on for odd k and on->off for even k. Each arm plays --turns player turns (default 8) walking
c1..c4 with /cp activate; send->reply is timed in the page (MESSAGE_SENT -> last CHARACTER_MESSAGE_RENDERED).
After arm on it waits up to --settle-min minutes (default 20 real, 2 dry) for the directed pose bodies, then reads
the owned sprite manifests: every directed (member, pose) of the walked checkpoints must have a product-path body.
--dry answers media/GPU/harness/text plugins with in-page fakes (no model, no GPU); plumbing only, no floor result.`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };
const owned = (name: string) => name.trim().toLowerCase().startsWith(POSE_MARKER.toLowerCase());
const setOf = (member: { id: string }) => `so_pl_${member.id}`;

interface Ctx extends StepEnv {
  run: number; dir: string; rows: StepRow[]; refusals: string[]; current: string; only: Set<string> | null;
  cast: PoseMember[]; story: ReturnType<typeof poseStory>; groupId: string | null; dry: DryRoutes | null;
  settings: SettingsCapture | null; baseline: Awaited<ReturnType<typeof snapshotAssets>> | null; spriteBaseline: Awaited<ReturnType<typeof snapshotSpriteAssets>> | null;
  arms: Record<string, { chatId: string | null; turns: TurnResult[] }>;
}

async function provision(ctx: Ctx): Promise<StepResult> {
  const group = `${POSE_MARKER} Forge`;
  const created = await ctx.page.evaluate(async ({ cast, group, story }) => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const out: unknown[] = [];
    for (const member of cast) out.push(await rt.applyProvisioning({ kind: 'createCharacterCard', name: member.name, description: member.description }, story));
    out.push(await rt.applyProvisioning({ kind: 'createGroup', name: group, members: cast.map((member: any) => member.name) }, story));
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { out, groupId: ctx.groups.find((row: any) => row.name === group)?.id ?? null };
  }, { cast: ctx.cast, group, story: ctx.story });
  const failed = created.out.filter((row: any) => !row?.ok).map((row: any) => String(row?.message));
  ctx.groupId = created.groupId;
  if (failed.length || !ctx.groupId) return { outcome: 'fail', detail: failed.join('; ') || 'no group', data: created };
  return { data: { groupId: ctx.groupId } };
}

async function openArmChat(ctx: Ctx, arm: 'off' | 'on' | 'setup') {
  await closeCheckpointStudio(ctx.page).catch(() => undefined);
  await settleSaves(ctx.page);
  await openGroup(ctx.page, ctx.groupId!);
  await settleSaves(ctx.page);
  await startNewChat(ctx.page);
  await closeUnpinnedDrawers(ctx.page);
  const now = await readActiveChat(ctx.page);
  if (now.groupId !== ctx.groupId || !now.chatId) throw new Error(`not on the pose group (${now.groupId}/${now.chatId})`);
  const result = await ctx.page.evaluate(async ({ story, arm, dry }) => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    home.settings ??= {};
    root.storyOrchestratorSprites.updateSettings(arm === 'off' ? { enabled: false }
      : { enabled: true, explicit: true, stage: 'always', poses: true, liveHead: true, onDemand: arm === 'on' });
    home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false };
    const imported = await rt.importStory(JSON.stringify(story));
    if (dry) rt.setExtractionSettings({ enabled: false });
    rt.setUiSettings({ authorView: true, briefingSeen: true });
    rt.notify();
    const snap = rt.getSnapshot();
    return { imported, storyId: snap?.storyId ?? null, errors: (snap?.validationErrors ?? []).slice(0, 6).map((row: any) => `${row.path}: ${row.message}`) };
  }, { story: ctx.story, arm, dry: ctx.mode === 'dry' });
  if (result.storyId !== ctx.story.id) throw new Error(`story not active: ${result.errors.join('; ') || JSON.stringify(result.imported)}`);
  const saved = await saveSoon(ctx.page);
  if (!saved.ok) console.log(`WARN settings not persisted: ${saved.error}`);
  await installProbes(ctx.page);
  if (await ctx.page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(ctx.page);
  return now.chatId;
}

async function playArm(ctx: Ctx, arm: 'off' | 'on', turns: number): Promise<StepResult> {
  const chatId = await openArmChat(ctx, arm);
  const rows: TurnResult[] = [];
  ctx.arms[arm] = { chatId, turns: rows };
  const motion = await forceMotion(ctx.page);
  try {
    let active = 'c1';
    for (let turn = 0; turn < turns; turn += 1) {
      const want = checkpointForTurn(turn, turns);
      if (want !== active) { await activate(ctx, want); active = want; }
      const result = await playTurn(ctx.page, PLAYER_LINES[turn % PLAYER_LINES.length]);
      rows.push(result);
      await appendFile(resolve(ctx.dir, 'turns.jsonl'), `${JSON.stringify({ arm, turn, checkpoint: active, ...result })}\n`);
    }
  } finally { await motion.detach(); }
  const silent = rows.filter((row) => !row.replied || row.ms === null).length;
  return { outcome: silent ? 'fail' : 'pass', detail: silent ? `${silent} turn(s) without a timed reply` : undefined,
    data: { chatId, ms: rows.map((row) => row.ms), firstTokenMs: rows.map((row) => row.firstTokenMs) } };
}

async function poseCoverage(ctx: Ctx) {
  const wanted = directedPoses(ctx.cast, 4);
  const manifests = await ctx.page.evaluate(async (names: string[]) => {
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    const out: Record<string, any[]> = {};
    for (const character of names) out[character] = await fetch('/api/plugins/story-orchestrator-media/sprites/list', { method: 'POST', headers, body: JSON.stringify({ character }) })
      .then((r) => r.ok ? r.json() : []).catch(() => []);
    return out;
  }, ctx.cast.map((member) => member.name));
  const bodies = Object.entries(manifests).flatMap(([character, sets]) => (sets ?? []).flatMap((set: any) => Object.values(set.labels ?? {})
    .map((label: any) => ({ character, set: set.set, pose: label?.inputs?.body?.pose ?? null, route: label?.inputs?.poseRoute ?? label?.inputs?.pose?.route ?? null, secondReference: label?.inputs?.poseSecondReference ?? null })).filter((row) => row.pose)));
  const missing = wanted.filter((row) => !bodies.some((body) => body.character === row.member && body.pose === row.pose));
  const routes = bodies.reduce<Record<string, number>>((out, body) => { const key = `${body.route ?? 'none'}${body.secondReference ? '+ref2' : ''}`; out[key] = (out[key] ?? 0) + 1; return out; }, {});
  return { wanted: wanted.length, rendered: wanted.length - missing.length, missing, bodies: bodies.length, routes };
}

async function settlePoses(ctx: Ctx): Promise<StepResult> {
  const deadline = Date.now() + Number(value('--settle-min', ctx.mode === 'dry' ? '2' : '20')) * 60000;
  let coverage = await poseCoverage(ctx);
  while (coverage.missing.length && Date.now() < deadline) {
    await ctx.page.waitForTimeout(10000);
    coverage = await poseCoverage(ctx);
  }
  const refused = await ctx.page.evaluate(() => {
    const view = (globalThis as any).storyOrchestratorSprites?.view?.();
    return { actors: (view?.actors ?? []).map((actor: any) => ({ name: actor.name, set: actor.set, pose: actor.pose ?? null })) };
  });
  return { outcome: coverage.missing.length ? 'fail' : 'pass', detail: coverage.missing.length ? `${coverage.missing.length} of ${coverage.wanted} directed poses without a body` : undefined,
    data: { ...coverage, stage: refused } };
}

async function cleanup(page: Page, ctx: { baseline: Ctx['baseline']; spriteBaseline: Ctx['spriteBaseline']; settings: SettingsCapture | null; storyId: string }) {
  await closeCheckpointStudio(page).catch(() => undefined);
  const removed = await removeMarkedAssets(page, POSE_MARKER, { baseline: ctx.baseline });
  await page.evaluate((marker: string) => {
    const root = globalThis as any, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    const sprites = { ...(home.settings?.sprites ?? {}) };
    for (const key of ['builders', 'visualSources'] as const) sprites[key] = Object.fromEntries(Object.entries(sprites[key] ?? {}).filter(([name]) => !name.toLowerCase().startsWith(marker.toLowerCase())));
    sprites.liveHeadRigs = Object.fromEntries(Object.entries(sprites.liveHeadRigs ?? {}).filter(([, ref]: [string, any]) => !String(ref?.source ?? '').includes(encodeURIComponent(marker))));
    home.settings = { ...(home.settings ?? {}), sprites };
  }, POSE_MARKER);
  const library = await removeStory(page, ctx.storyId).catch((error) => ({ error: String(error) }));
  const restored = await restoreSettings(page, ctx.settings).catch((error) => ({ error: String(error) }));
  const after = await snapshotSpriteAssets(page);
  const sprites = ctx.spriteBaseline?.trusted && after.trusted ? scopedSprites(after, POSE_MARKER, ctx.spriteBaseline).length : null;
  const inventory = ctx.spriteBaseline?.trusted && after.trusted ? { before: ctx.spriteBaseline.rows.length, after: after.rows.length } : null;
  const found = await listMarkedAssets(page, POSE_MARKER, { baseline: ctx.baseline });
  const leaked = leakCount(found);
  return { removed: { characters: removed.removed.characters.length, groups: removed.removed.groups.length, errors: removed.removed.errors }, library, restored,
    ownedSpritesLeft: sprites, inventory, inventoryUnchanged: inventory ? inventory.before === inventory.after && sprites === 0 : null, leaked, leakedAssets: leakNames(found) };
}

async function runPose(page: Page) {
  const mode: Mode = flag('--dry') ? 'dry' : 'real';
  const run = Number(args[1] ?? '1');
  if (!Number.isInteger(run) || run < 1) throw new Error('run <k>: k must be a positive integer');
  const stamp = new Date().toISOString();
  const dir = resolve(DEBUG_DIR, 'pose-latency', evidenceDirName(value('--label', 'pose'), run, mode, stamp));
  await mkdir(dir, { recursive: true });
  const cast = poseCast();
  const ctx: Ctx = { page, mode, run, dir, rows: [], refusals: [], current: 'setup', only: null, cast, story: poseStory(cast), groupId: null, dry: null, settings: null,
    baseline: null, spriteBaseline: null, arms: {}, models: { ...DRY_MODELS }, alpha: 'dry_alpha', setOf, seedOf: (member) => cast.findIndex((row) => row.id === member.id) };
  const turns = Number(value('--turns', '8'));
  const order = armOrder(run);
  console.log(`pose latency run ${run} (${mode}), arms ${order.join(' -> ')} -> ${dir}`);
  const distDir = mode === 'dry' || flag('--candidate') ? resolve(PROJECT_ROOT, 'dist') : null;
  let candidate: { stop(): Promise<void> } | null = null;
  if (mode === 'dry') ctx.dry = await installDryRoutes(page, owned, distDir);
  else if (distDir) candidate = await installCandidateRoute(page, distDir);
  const sampler = startSampler(mode, resolve(dir, 'samples.jsonl'));
  const calls = attachCallRecorder(page, () => ctx.current, resolve(dir, 'calls.jsonl'));
  const serverLog = markServerLog(process.env, DEBUG_DIR);
  let cleaned: unknown = 'kept (--keep)';
  let gpuBaseline: number | null = null;
  try {
    if (distDir) await freshPage(page);
    const pre = await step(ctx, 'preflight', null, async () => {
      const common = await preflightCommon(ctx, POSE_MARKER);
      ctx.baseline = common.baseline;
      ctx.spriteBaseline = await snapshotSpriteAssets(page);
      ctx.settings = await captureSettings(page);
      await writeRecord(dir, 'run-header-before.json', await captureHeader(page, `pose-before-run${run}`));
      gpuBaseline = (await sampleNow(mode)).gpuUsedMiB;
      return { data: { bundle: common.served, warm: common.warm, models: ctx.models, gpuBaselineMiB: gpuBaseline, spriteRows: ctx.spriteBaseline.rows.length } };
    });
    if (pre.outcome === 'fail') throw new Error(`preflight: ${pre.detail}`);
    const prov = await step(ctx, 'provision', null, () => provision(ctx));
    if (prov.outcome === 'fail') throw new Error(`provision: ${prov.detail}`);
    await step(ctx, 'card-art', null, async () => {
      const rows = await giveCardArt(page, cardArtPlan(cast));
      const problems = cardArtProblems(rows);
      return { outcome: problems.length ? 'fail' : 'pass', detail: problems.join('; ') || undefined, data: { deviation: CARD_ART_DEVIATION, rows } };
    });
    const setup = await step(ctx, 'setup-chat', null, async () => ({ data: { chatId: await openArmChat(ctx, 'setup') } }));
    if (setup.outcome === 'fail') throw new Error(`setup-chat: ${setup.detail}`);
    for (const member of cast) await step(ctx, 'base', member.name, () => stepBase(ctx, member));
    for (const member of cast) await step(ctx, 'prepare', member.name, () => stepPrepare(ctx, member));
    await step(ctx, 'poses', null, () => stepPoses(ctx));
    await closeCheckpointStudio(page).catch(() => undefined);
    for (const arm of order) {
      await step(ctx, `arm-${arm}`, null, () => playArm(ctx, arm, turns));
      if (arm === 'on') await step(ctx, 'pose-renders', null, () => settlePoses(ctx));
    }
  } catch (error) {
    console.log(`ABORT ${error instanceof Error ? error.message : String(error)}`);
    ctx.rows.push({ id: 'abort', outcome: 'fail', ms: 0, startedAt: new Date().toISOString(), detail: error instanceof Error ? error.message : String(error) });
  } finally {
    sampler.stop();
    calls.stop();
    await writeRecord(dir, 'run-header-after.json', await captureHeader(page, `pose-after-run${run}`).catch((error) => ({ error: String(error) })));
    if (!ctx.baseline) cleaned = 'skipped: preflight captured no baseline (run the cleanup command)';
    else if (!flag('--keep')) cleaned = await cleanup(page, { baseline: ctx.baseline, spriteBaseline: ctx.spriteBaseline, settings: ctx.settings, storyId: ctx.story.id }).catch((error) => ({ error: String(error) }));
    if (ctx.dry) await ctx.dry.stop();
    if (candidate) await candidate.stop();
    const serverSlice = takeServerLog(serverLog, dir);
    const ms = (arm: string) => (ctx.arms[arm]?.turns ?? []).map((row) => row.ms).filter((row): row is number => typeof row === 'number');
    const latency = latencyVerdict(ms('on'), ms('off'));
    const poses = ctx.rows.find((row) => row.id === 'pose-renders');
    const required = ['preflight', 'provision', 'setup-chat', 'base', 'prepare', 'poses', 'arm-off', 'arm-on', 'pose-renders'];
    const plumbing = [
      ...ctx.rows.filter((row) => row.id === 'abort').map((row) => `aborted: ${row.detail}`),
      ...required.filter((id) => !ctx.rows.some((row) => row.id === id)).map((id) => `${id}: not run`),
      ...ctx.rows.filter((row) => row.thrown).map((row) => `${row.id}${row.member ? `[${row.member}]` : ''}: driver error (${row.detail})`),
      ...(cleaned && typeof cleaned === 'object' && 'error' in cleaned ? [`cleanup: ${(cleaned as any).error}`] : []),
      ...(cleaned && typeof cleaned === 'object' && (cleaned as any).leaked > 0 ? [`cleanup: ${(cleaned as any).leaked} owned asset(s) leaked`] : []),
    ];
    const misses = [
      ...ctx.rows.filter((row) => row.id !== 'abort' && row.outcome !== 'pass').map((row) => `${row.id}${row.member ? `[${row.member}]` : ''}: ${row.outcome}${row.detail ? ` (${row.detail})` : ''}`),
      ...(latency.pass ? [] : [`latency: on/off median ${latency.ratio === null ? 'n/a' : latency.ratio.toFixed(3)} > ${latency.limit}`]),
      ...(cleaned && typeof cleaned === 'object' && (cleaned as any).inventoryUnchanged === false ? ['cleanup: owned sprite inventory changed'] : []),
    ];
    const record = {
      kind: 'pose-latency', mode, run, order, turns, startedAt: stamp, finishedAt: new Date().toISOString(), floorsDate: FLOORS_DATE, floors: POSE_FLOORS,
      verdict: mode === 'dry' ? (plumbing.length ? 'PLUMBING-FAIL' : 'PLUMBING-OK (dry: no floor result)') : (misses.length ? 'NOT GREEN' : 'GREEN'),
      plumbing, misses, latency, poses: poses?.data ?? null, steps: ctx.rows, arms: ctx.arms, modelCalls: countCalls(calls.rows), refusals: ctx.refusals,
      samples: sampleSummary(sampler.samples), gpuBaselineMiB: gpuBaseline, cleanup: cleaned, serverLog: serverSlice,
      dry: ctx.dry ? { fakeCalls: ctx.dry.fake.calls.length, renders: ctx.dry.fake.jobs.size, blocked: ctx.dry.blocked, textReplies: ctx.dry.replies } : null,
    };
    const path = await writeRecord(dir, 'record.json', record);
    console.log(`RECORD ${path}`);
    console.log(`LATENCY on ${latency.onMedianMs} ms / off ${latency.offMedianMs} ms = ${latency.ratio?.toFixed(3) ?? 'n/a'} (limit ${latency.limit})`);
    console.log(`VERDICT ${record.verdict}${plumbing.length ? `\n  plumbing: ${plumbing.join('\n  plumbing: ')}` : ''}${misses.length ? `\n  ${misses.join('\n  ')}` : ''}`);
    if (mode === 'real' ? misses.length : plumbing.length) process.exitCode = 1;
  }
}

async function cleanupCommand(page: Page) {
  const dry = flag('--dry') ? await installDryRoutes(page, owned) : null;
  try {
    const result = await cleanup(page, { baseline: null, spriteBaseline: null, settings: null, storyId: poseStory(poseCast()).id });
    console.log(JSON.stringify(result, null, 2));
    if (result.leaked) process.exitCode = 1;
  } finally { await dry?.stop(); }
}

if (hasHelpFlag() || !args[0] || args[0] === 'help') console.log(USAGE);
else if (args[0] === 'floors') console.log([`Pose acceptance floors (plan 33 §6, predeclared 2026-10-10; driver ${FLOORS_DATE}):`, ...POSE_FLOORS.map((line) => `- ${line}`)].join('\n'));
else if (args[0] === 'run') await runCli(async (page) => { await runPose(page); return { ok: !process.exitCode }; });
else if (args[0] === 'cleanup') await runCli(async (page) => { await cleanupCommand(page); return { ok: !process.exitCode }; });
else { console.log(USAGE); process.exitCode = 1; }
