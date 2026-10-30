import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { activate, applyAuthoringRoute, captureSettings, freshPage, preflightCommon, restoreSettings, saveSoon, settleSaves, step, stepBase, stepPrepare, stepEdits, stepRig, stepPoses, chooseCharacter, type SettingsCapture, type StepEnv, type StepResult } from './lib/pocSteps.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { assertRuntimeOnPage } from './lib/servedBundle.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { driveWizardAgent } from './lib/wizardAgentDrive.mts';
import { laneHarness } from './lib/imageHarness.mts';
import { comfyCleared, harnessGaps } from './lib/imageHarnessConfig.mts';
import { buildSpriteFromUI } from './so-sprite-builder.mts';
import { openCheckpointStudio, closeCheckpointStudio, openExtensionSettings, switchStudioTab } from './so-ui.mts';
import { openGroup, startNewChat, openChat, closeUnpinnedDrawers, readActiveChat } from './st-navigation.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { captureHeader, diffHeaders, describe } from './so-run-header.mts';
import { executeSlashCommand, waitForIdle, deleteMessage } from './st-actions.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { removeStory } from './so-library.mts';
import { cleanResidue, laneUserDir, residueLeaks } from './lib/p41Residue.mts';
import { CARD_ART_DEVIATION, cardArtPlan, cardArtProblems, giveCardArt, leakNames, markServerLog, takeServerLog } from './lib/pocCardArt.mts';
import {
  FLOORS_DATE, JOURNEY_FLOORS, JOURNEY_STEPS, P41_MARKER, PLAYER_LINES, countCalls, evidenceDirName, gpuIdleProblems, journeyCast, journeyGpuMinutes, journeyGroupName,
  journeyStory, laneProblem, parseAuthoringRoute, plumbingProblems, sampleSummary, skeletonProblems, staleFindings, staleInputFrom, stepVerdict, wizardGoal, wizardScript,
  type CastMember, type Mode, type Outcome, type StepRow,
} from './lib/pocDrivers.mts';
import {
  attachCallRecorder, forceMotion, installCandidateRoute, installDryRoutes, installProbes, playTurn, readStaleState, sampleNow, stageView, startSampler, waitStage, writeRecord,
  type DryRoutes, type TurnResult,
} from './lib/pocLive.mts';

const USAGE = `Usage (always through a lane >= 30):
  node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-p41-journey.mts run <k> [--dry] [--turns 10] [--authoring claude] [--label <x>] [--keep] [--only a,b]
  node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-p41-journey.mts cleanup [--dry]
  node scripts/debug/so-p41-journey.mts floors | steps | quote [--members 3] [--runs 2]

run <k>   one plan 41 §5 journey (k = 1|2); evidence in <debug dir>/p41/<stamp>-<label>-<mode>-run<k>/
--dry     no model, no GPU: the media, GPU, harness, judge and text-generation plugins are answered in the page by
          fakes (lib/pocFakes.mts), every request to ComfyUI/controller ports is blocked, the wizard runs a scripted
          transport. Plumbing only; never a floor result.
--only    run a subset of steps (record marked partial; never a gate)
--authoring default | claude | claude-opus | opencode | <claude|opencode>:<model>: route "Wizard and road ahead" for the run (restored at cleanup;
          default keeps the install's route, opencode Sol when offered)
--keep    leave the owned cards, group, sprites and chats (cleanup later with the cleanup command)`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] ?? fallback; };

interface Ctx extends StepEnv {
  page: Page;
  mode: Mode;
  run: number;
  dir: string;
  rows: StepRow[];
  current: string;
  cast: CastMember[];
  group: string;
  story: ReturnType<typeof journeyStory>;
  groupId: string | null;
  chatId: string | null;
  turns: TurnResult[];
  dry: DryRoutes | null;
  refusals: string[];
  models: { diffusion: string; encoder: string; vae: string };
  alpha: string;
  staleChecks: Array<{ after: string; findings: string[] }>;
  baseline: Awaited<ReturnType<typeof snapshotAssets>> | null;
  only: Set<string> | null;
  gpuBaseline: number | null;
  settings: SettingsCapture | null;
  checkpoint?(): Promise<void>;
}


const owned = (name: string) => name.trim().toLowerCase().startsWith(P41_MARKER.toLowerCase());
const slug = (member: { id: string }) => `so_p41_${member.id}`;

async function staleCheck(ctx: Ctx, after: string): Promise<string[]> {
  const state = await readStaleState(ctx.page, owned);
  const findings = staleFindings(staleInputFrom(state, owned));
  ctx.staleChecks.push({ after, findings });
  await writeRecord(ctx.dir, `stale-${ctx.staleChecks.length}-${after}.json`, { after, findings, state });
  return findings;
}

const staleResult = (findings: string[], extra: Record<string, unknown> = {}): StepResult => findings.length
  ? { outcome: 'fail', detail: `stale: ${findings.slice(0, 3).join('; ')}`, data: { findings, ...extra } }
  : { data: { findings: [], ...extra } };

const landmarksUp = async (): Promise<boolean> => {
  const port = process.env.SO_LANDMARKS_PORT ?? '8096';
  try { return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
};

async function stepPreflight(ctx: Ctx): Promise<StepResult> {
  if (ctx.mode !== 'dry' && !(await landmarksUp())) return { outcome: 'fail', detail: 'the face landmark check is down (node scripts/local/landmarks.mjs start); without it the head box falls back to a fixed fraction' };
  const common = await preflightCommon(ctx, P41_MARKER);
  ctx.baseline = common.baseline;
  ctx.settings = await captureSettings(ctx.page);
  const authoring = await applyAuthoringRoute(ctx.page, parseAuthoringRoute(value('--authoring', 'default')));
  const header = await captureHeader(ctx.page, `p41-before-run${ctx.run}`);
  await writeRecord(ctx.dir, 'run-header-before.json', header);
  const gpu = await sampleNow(ctx.mode);
  ctx.gpuBaseline = gpu.gpuUsedMiB;
  return { data: { bundle: common.served, authoring, baselineTrusted: true, gpuBaselineMiB: ctx.gpuBaseline, warm: common.warm, models: ctx.models, alpha: ctx.alpha } };
}

async function stepWizard(ctx: Ctx): Promise<StepResult> {
  await openCheckpointStudio(ctx.page);
  await ctx.page.waitForFunction(() => Boolean((globalThis as any).storyOrchestratorStudioDraft && (globalThis as any).storyOrchestratorWizardAgent), undefined, { timeout: 30000 });
  if (ctx.mode === 'dry') {
    await ctx.page.evaluate((script: string[]) => {
      const agent = (globalThis as any).storyOrchestratorWizardAgent;
      const queue = [...script];
      agent.__pocResolve = agent.resolveAgentHarness;
      agent.resolveAgentHarness = async () => ({ call: async () => queue.shift() ?? JSON.stringify({ done: 'script exhausted' }) });
    }, wizardScript(ctx.cast, ctx.group));
  }
  try {
    const result: any = await driveWizardAgent(ctx.page, { goal: wizardGoal(ctx.cast, ctx.group), title: ctx.story.title, mode: 'review', route: 'harness', maxSteps: 12,
      provision: 'apply', seed: ctx.story as unknown as Record<string, unknown> });
    await writeRecord(ctx.dir, 'wizard.json', { session: result.session, bridge: result.bridge, lapsed: result.lapsed, validationErrors: result.validationErrors });
    const env = await evaluateInST(ctx.page, (names: { cards: string[]; group: string }) => {
      const c = (globalThis as any).SillyTavern.getContext();
      return { cards: names.cards.filter((name) => c.characters.some((row: any) => row.name === name)), group: c.groups.find((row: any) => row.name === names.group)?.id ?? null };
    }, { cards: ctx.cast.map((member) => member.name), group: ctx.group });
    const skeleton = skeletonProblems(result.draft, ctx.story);
    const problems = [...ctx.cast.filter((member) => !env.cards.includes(member.name)).map((member) => `card ${member.name} missing`),
      ...(env.group ? [] : [`group ${ctx.group} missing`]), ...skeleton, ...(result.lapsed ? [`lapsed: ${result.lapsed}`] : [])];
    const refused = (result.session?.steps ?? []).filter((row: any) => row.status === 'refused').map((row: any) => String(row.observation ?? row.call?.tool));
    ctx.groupId = env.group;
    if (!skeleton.length) ctx.story = { ...result.draft, id: ctx.story.id, title: ctx.story.title };
    return { outcome: problems.length ? 'fail' : 'pass', detail: problems.join('; ') || undefined, refusals: refused,
      data: { transport: result.bridge?.transport, steps: result.session?.steps?.length ?? 0, validationErrors: result.validationErrors, created: env } };
  } finally {
    if (ctx.mode === 'dry') await ctx.page.evaluate(() => { const agent = (globalThis as any).storyOrchestratorWizardAgent; if (agent.__pocResolve) { agent.resolveAgentHarness = agent.__pocResolve; delete agent.__pocResolve; } });
    await closeCheckpointStudio(ctx.page).catch(() => undefined);
  }
}

async function stepStory(ctx: Ctx): Promise<StepResult> {
  if (!ctx.groupId) throw new Error('no group from the wizard step');
  await settleSaves(ctx.page);
  await openGroup(ctx.page, ctx.groupId);
  await settleSaves(ctx.page);
  await startNewChat(ctx.page);
  await closeUnpinnedDrawers(ctx.page);
  const now = await readActiveChat(ctx.page);
  if (now.groupId !== ctx.groupId || !now.chatId) throw new Error(`not on the journey group (${now.groupId}/${now.chatId})`);
  ctx.chatId = now.chatId;
  const imported = await ctx.page.evaluate(async ({ story, dry }) => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    home.settings ??= {};
    root.storyOrchestratorSprites.updateSettings({ enabled: true, explicit: true, stage: 'always', poses: true, liveHead: true, onDemand: true });
    home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false };
    if (dry) home.settings.image = { ...home.settings.image, enabled: true, backend: 'comfy', directorProfileId: '' };
    const result = await rt.importStory(JSON.stringify(story));
    if (dry) rt.setExtractionSettings({ enabled: false });
    rt.setUiSettings({ authorView: true, briefingSeen: true });
    rt.notify();
    const snap = rt.getSnapshot();
    return { result, storyId: snap?.storyId ?? null, errors: (snap?.validationErrors ?? []).slice(0, 8).map((row: any) => `${row.path}: ${row.message}`) };
  }, { story: ctx.story, dry: ctx.mode === 'dry' });
  if (imported.storyId !== ctx.story.id) throw new Error(`story not active: ${imported.errors.join('; ') || JSON.stringify(imported.result)}`);
  const saved = await saveSoon(ctx.page);
  if (!saved.ok) console.log(`WARN settings not persisted: ${saved.error}`);
  await installProbes(ctx.page);
  if (await ctx.page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(ctx.page);
  if (imported.storyId !== ctx.story.id) throw new Error(`story not active: ${JSON.stringify(imported.result).slice(0, 200)}`);
  return { data: { chatId: ctx.chatId, storyId: imported.storyId } };
}

async function stepCardArt(ctx: Ctx): Promise<StepResult> {
  const rows = await giveCardArt(ctx.page, cardArtPlan(ctx.cast));
  const problems = cardArtProblems(rows);
  return { outcome: problems.length ? 'fail' : 'pass', detail: problems.join('; ') || undefined, data: { deviation: CARD_ART_DEVIATION, rows } };
}

async function playBlock(ctx: Ctx, from: number, count: number, label: string) {
  const rows: TurnResult[] = [];
  for (let at = 0; at < count; at += 1) {
    const line = PLAYER_LINES[(from + at) % PLAYER_LINES.length];
    const startedAt = new Date().toISOString();
    const turn = await playTurn(ctx.page, line);
    rows.push(turn);
    ctx.turns.push(turn);
    await appendFile(resolve(ctx.dir, 'turns.jsonl'), `${JSON.stringify({ block: label, startedAt, endedAt: new Date().toISOString(), ...turn })}\n`);
  }
  return rows;
}

async function stepPlay(ctx: Ctx, turns: number): Promise<StepResult> {
  await closeCheckpointStudio(ctx.page).catch(() => undefined);
  await closeUnpinnedDrawers(ctx.page);
  const motion = await forceMotion(ctx.page);
  try {
    const rows = await playBlock(ctx, 0, turns, 'close');
    const silent = rows.filter((row) => !row.replied).length;
    const viseme = rows.some((row) => row.uploads > 0 && (row.mouths > 1 || row.visemes > 1));
    const problems = [...(silent ? [`${silent} silent turn(s)`] : []), ...(viseme ? [] : ['no viseme mouth observed on a ready live head']), ...rows.filter((row) => row.error).map((row) => row.error as string)];
    return { outcome: problems.length ? 'fail' : 'pass', detail: problems.join('; ') || undefined,
      data: { turns: rows.length, replies: rows.reduce((sum, row) => sum + row.replies, 0), visemeTurns: rows.filter((row) => row.uploads > 0 && (row.mouths > 1 || row.visemes > 1)).length, ms: rows.map((row) => row.ms) } };
  } finally { await motion.detach(); }
}

async function stepPose(ctx: Ctx): Promise<StepResult> {
  await closeCheckpointStudio(ctx.page).catch(() => undefined);
  await activate(ctx, 'table');
  const wanted = Object.fromEntries(ctx.cast.map((member) => [member.name, member.poses[1]]));
  const posed = (actor: any, member: CastMember) => actor?.pose === wanted[member.name] && String(actor?.set ?? '').startsWith('lp_');
  const posedAt = Date.now();
  const waited = await waitStage(ctx.page, (view) => ctx.cast.every((member) => posed(view.actors.find((actor: any) => actor.name === member.name), member)),
    ctx.mode === 'dry' ? 120000 : 1_800_000, 2000);
  const shown = Object.fromEntries(waited.view.actors.map((actor: any) => [actor.name, { pose: actor.pose, set: actor.set }]));
  const missing = ctx.cast.filter((member) => !posed(shown[member.name], member)).map((member) => `${member.name}: ${shown[member.name]?.pose ?? 'no actor'} on set ${shown[member.name]?.set ?? 'none'} (wanted a posed ${wanted[member.name]} body)`);
  return { outcome: missing.length ? 'fail' : 'pass', detail: missing.join('; ') || undefined, data: { wanted, shown, waitedMs: Date.now() - posedAt } };
}

async function stepLook(ctx: Ctx): Promise<StepResult> {
  const lead = ctx.cast[0];
  const before = (await stageView(ctx.page)).actors.find((actor: any) => actor.name === lead.name);
  await activate(ctx, 'storm');
  const deadline = Date.now() + (ctx.mode === 'dry' ? 120000 : 1_800_000);
  let actor: any = null, look: { key: string; signature: string } | null = null;
  while (Date.now() < deadline) {
    actor = (await stageView(ctx.page)).actors.find((row: any) => row.name === lead.name) ?? null;
    look = await publishedLook(ctx, lead);
    if (actor && actor.set !== before?.set && look) break;
    await ctx.page.waitForTimeout(2000);
  }
  if (!actor || actor.set === before?.set || !look) return { outcome: 'fail', detail: `look did not follow: set ${actor?.set ?? 'none'} (before ${before?.set}), published look ${look?.key ?? 'none'}`, data: { before, actor, look } };
  return staleResult(await staleCheck(ctx, 'look'), { before, actor, look });
}

async function publishedLook(ctx: Ctx, member: CastMember): Promise<{ key: string; signature: string } | null> {
  return ctx.page.evaluate(({ name, value }) => {
    const looks = (globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites.visualSources?.[name]?.looks ?? {};
    const found = Object.entries(looks).find(([key, row]: [string, any]) => key !== 'default' && String(row?.signature ?? '').includes(value));
    return found ? { key: found[0], signature: String((found[1] as any).signature) } : null;
  }, { name: member.name, value: member.lookValue });
}

async function stepLookRebuild(ctx: Ctx): Promise<StepResult> {
  const lead = ctx.cast[0];
  const look = await publishedLook(ctx, lead);
  if (!look) return { outcome: 'fail', detail: 'no published changed look to rebuild' };
  const set = look.key;
  const rig = await stepRig(ctx, lead, set);
  await closeCheckpointStudio(ctx.page).catch(() => undefined);
  if (rig && rig.outcome && rig.outcome !== 'pass') return rig;
  const motion = await forceMotion(ctx.page);
  try {
    const rows = await playBlock(ctx, 4, 2, 'changed-look');
    const view = await stageView(ctx.page);
    const actor = view.actors.find((row: any) => row.name === lead.name);
    const follows = actor?.liveHead?.look === set;
    const findings = await staleCheck(ctx, 'look-rebuild');
    const problems = [...(follows ? [] : [`close shot rig look ${actor?.liveHead?.look ?? 'none'} != ${set}`]), ...findings];
    return { outcome: problems.length ? 'fail' : 'pass', detail: problems.join('; ') || undefined, data: { set, actor, visemeTurns: rows.filter((row) => row.uploads > 0 && (row.mouths > 1 || row.visemes > 1)).length, rig } };
  } finally { await motion.detach(); }
}

async function openPlayPage(ctx: Ctx) {
  await openExtensionSettings(ctx.page);
  const modal = ctx.page.locator('#so-workspace-modal');
  await modal.getByRole('button', { name: 'This story', exact: true }).click({ force: true });
  await modal.locator('#so-workspace-page-play').click({ force: true });
  const cast = modal.locator('#so-cast-scene');
  const onPlay = await cast.waitFor({ state: 'attached', timeout: 5000 }).then(() => true, () => false);
  if (!onPlay) await modal.locator('#so-workspace-page-author').click({ force: true });
  try { if (!onPlay) await cast.waitFor({ state: 'attached', timeout: 30000 }); }
  catch {
    const why = await ctx.page.evaluate(() => {
      const el = document.getElementById('so-workspace-modal');
      return { imageChat: Boolean(document.getElementById('so-image-chat')), castAnywhere: Boolean(document.getElementById('so-cast-scene')),
        ids: [...(el?.querySelectorAll('[id^="so-"]') ?? [])].map((node) => node.id).slice(0, 40), tail: (el?.textContent ?? '').slice(-300) };
    });
    throw new Error(`#so-cast-scene not on the Play page: ${JSON.stringify(why)}`);
  }
  return { modal, cast };
}

async function stepIllustration(ctx: Ctx): Promise<StepResult> {
  const { modal, cast } = await openPlayPage(ctx);
  if (!await cast.getByRole('button', { name: 'Draw current-look cast' }).isVisible().catch(() => false)) await cast.locator('summary').click({ force: true });
  const castMedia = () => ctx.page.evaluate(() => (globalThis as any).SillyTavern.getContext().chat
    .flatMap((message: any) => message.extra?.media ?? []).filter((media: any) => media?.image_director?.purpose === 'cast-scene')
    .map((media: any) => ({ url: media.url, identities: media.image_director.identities })));
  const before = (await castMedia()).length;
  for (const member of ctx.cast.slice(0, 2)) await cast.getByLabel(member.name, { exact: true }).check({ force: true });
  await cast.getByLabel('Scene direction', { exact: true }).fill('the two of them by the lamp room window during the storm');
  await cast.getByRole('button', { name: 'Draw current-look cast' }).click({ force: true });
  await ctx.page.waitForFunction((count) => {
    const media = (globalThis as any).SillyTavern.getContext().chat.flatMap((message: any) => message.extra?.media ?? []).filter((row: any) => row?.image_director?.purpose === 'cast-scene');
    return media.length > count || Boolean(document.querySelector('#so-cast-scene [role="alert"]'));
  }, before, { polling: 500, timeout: ctx.mode === 'dry' ? 120000 : 1_200_000 }).catch(() => undefined);
  const alert = await cast.locator('[role="alert"]').allTextContents();
  const after = await castMedia();
  await modal.getByRole('button', { name: /close/i }).first().click({ force: true }).catch(() => ctx.page.keyboard.press('Escape'));
  if (alert.length) return { outcome: 'refused', detail: alert.join(' ').slice(0, 300), refusals: alert };
  if (after.length <= before) return { outcome: 'fail', detail: 'no cast illustration was placed', data: { before, after } };
  const lead = await ctx.page.evaluate((name) => (globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites.visualSources?.[name] ?? null, ctx.cast[0].name);
  const newest = after.at(-1);
  const leadIdentity = newest?.identities?.find((row: any) => row.character === ctx.cast[0].name);
  const current = leadIdentity && lead ? Object.values(lead.looks ?? {}).some((row: any) => row.base?.sha256 === leadIdentity.sha256 && row.signature === leadIdentity.signature && row.signature !== '[]') : false;
  return current ? { data: { placed: newest } } : { outcome: 'fail', detail: 'cast illustration did not use the lead member\'s current look', data: { placed: newest } };
}

async function stepBackground(ctx: Ctx): Promise<StepResult> {
  const result = await ctx.page.evaluate(async () => {
    const image = (globalThis as any).storyOrchestratorImage;
    if (!image) return { error: 'no image director' };
    try { return { result: await image.direct({ purpose: 'background', text: '', messageId: null }), status: image.status() }; }
    catch (error) { return { error: String((error as Error)?.message ?? error), status: image.status() }; }
  });
  if ('error' in result && result.error) return { outcome: 'refused', detail: String(result.error).slice(0, 300), refusals: [String(result.error)], data: result };
  return { data: result };
}

async function stepSwipe(ctx: Ctx): Promise<StepResult> {
  await waitForIdle(ctx.page, 600000);
  const before = await ctx.page.evaluate(() => { const chat = (globalThis as any).SillyTavern.getContext().chat; const last = chat.at(-1); return { length: chat.length, swipes: last?.swipes?.length ?? 1, user: Boolean(last?.is_user) }; });
  if (before.user) return { outcome: 'fail', detail: 'last message is the player\'s; nothing to swipe' };
  await ctx.page.evaluate(async () => { await (globalThis as any).SillyTavern.getContext().swipe.to(null, 'right', { source: 'so-p41-journey' }); });
  await waitForIdle(ctx.page, 600000);
  const after = await ctx.page.evaluate(() => { const last = (globalThis as any).SillyTavern.getContext().chat.at(-1); return { swipes: last?.swipes?.length ?? 1, text: String(last?.mes ?? '').length }; });
  return staleResult(await staleCheck(ctx, 'swipe'), { before, after });
}

async function stepDelete(ctx: Ctx): Promise<StepResult> {
  const id = await ctx.page.evaluate(() => (globalThis as any).SillyTavern.getContext().chat.length - 1);
  await deleteMessage(ctx.page, id);
  await ctx.page.waitForTimeout(2000);
  return staleResult(await staleCheck(ctx, 'delete'), { deleted: id });
}

async function reopen(ctx: Ctx) {
  await ctx.page.waitForFunction(() => {
    const c = (globalThis as any).SillyTavern?.getContext?.();
    const fired = c?.eventSource?.autoFireLastArgs;
    return Boolean((globalThis as any).storyOrchestratorRuntime) && (fired instanceof Map ? fired.has(c.eventTypes.APP_READY) : true);
  }, undefined, { timeout: 90000 });
  await settleSaves(ctx.page);
  await openGroup(ctx.page, ctx.groupId!);
  await openChat(ctx.page, ctx.chatId!);
  const now = await readActiveChat(ctx.page);
  if (now.chatId !== ctx.chatId) throw new Error(`reopen landed on ${now.chatId}`);
}

async function stepReload(ctx: Ctx): Promise<StepResult> {
  await freshPage(ctx.page);
  await reopen(ctx);
  await installProbes(ctx.page);
  await ctx.page.waitForTimeout(3000);
  return staleResult(await staleCheck(ctx, 'reload'));
}

async function stepChatSwitch(ctx: Ctx): Promise<StepResult> {
  await settleSaves(ctx.page);
  await startNewChat(ctx.page);
  const other = await readActiveChat(ctx.page);
  await ctx.page.waitForTimeout(2500);
  const elsewhere = await staleCheck(ctx, 'chat-switch-away');
  await settleSaves(ctx.page);
  await openChat(ctx.page, ctx.chatId!);
  await ctx.page.waitForTimeout(2500);
  const back = await staleCheck(ctx, 'chat-switch-back');
  const actors = (await stageView(ctx.page)).actors.length;
  const findings = [...elsewhere.map((text) => `away: ${text}`), ...back.map((text) => `back: ${text}`), ...(actors ? [] : ['back: the stage shows no actors'])];
  return staleResult(findings, { other: other.chatId, actorsBack: actors });
}

async function stepGpuIdle(ctx: Ctx, sampler: ReturnType<typeof startSampler>): Promise<StepResult> {
  const deadline = Date.now() + (ctx.mode === 'dry' ? 20000 : 180000);
  let problems: string[] = ['not sampled'];
  while (Date.now() < deadline) {
    await sampler.tick();
    const queued = await ctx.page.evaluate(async () => {
      const r = await fetch('/api/plugins/story-orchestrator-media/sprites/inventory', { headers: (globalThis as any).SillyTavern.getContext().getRequestHeaders() }).catch(() => null);
      const jobs = (globalThis as any).storyOrchestratorImage?.status?.().jobs?.length ?? 0;
      return r ? jobs : jobs;
    });
    problems = gpuIdleProblems(sampler.samples, ctx.gpuBaseline, queued);
    if (!problems.length) break;
    await ctx.page.waitForTimeout(5000);
  }
  if (ctx.mode === 'dry') return { outcome: 'stub', detail: 'dry: GPU samples are stubs', data: { last: sampler.samples.slice(-3) } };
  return { outcome: problems.length ? 'fail' : 'pass', detail: problems.join('; ') || undefined, data: { last: sampler.samples.slice(-3) } };
}

async function cleanup(page: Page, baseline: Awaited<ReturnType<typeof snapshotAssets>> | null, settings: SettingsCapture | null = null) {
  const recovery = await ensureSTReady(page).then(() => null, async (error) => {
    await freshPage(page);
    return { reloadedForCleanup: String(error) };
  });
  await closeCheckpointStudio(page).catch(() => undefined);
  const library = await removeStory(page, journeyStory(journeyCast()).id).catch((error) => ({ error: String(error) }));
  await waitForIdle(page, 120000);
  await page.waitForFunction(async () => {
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    const response = await fetch('/api/plugins/story-orchestrator-gpu/status', { headers });
    if (response.status === 404) return true;
    if (!response.ok) throw new Error(`GPU cleanup status: ${response.status}`);
    const status = await response.json();
    return !status.imageLease && !status.imageWaiting;
  }, undefined, { polling: 1000, timeout: 120000 });
  const removed = await removeMarkedAssets(page, P41_MARKER, { baseline });
  const scrub = await page.evaluate(async (marker: string) => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    const sprites = { ...(home.settings?.sprites ?? {}) };
    const mine = (name: string) => name.toLowerCase().startsWith(marker.toLowerCase());
    const dropped: string[] = [];
    for (const key of ['builders', 'visualSources'] as const) {
      const rows = { ...(sprites[key] ?? {}) };
      for (const name of Object.keys(rows)) if (mine(name)) { delete rows[name]; dropped.push(`${key}.${name}`); }
      sprites[key] = rows;
    }
    const rigs = { ...(sprites.liveHeadRigs ?? {}) };
    for (const [key, ref] of Object.entries(rigs) as Array<[string, any]>) if (String(ref?.source ?? '').includes(encodeURIComponent(marker)) || String(ref?.source ?? '').includes(marker)) { delete rigs[key]; dropped.push(`liveHeadRigs.${key}`); }
    sprites.liveHeadRigs = rigs;
    home.settings = { ...(home.settings ?? {}), sprites };
    rt.notify();
    return { dropped };
  }, P41_MARKER);
  await saveSoon(page);
  const restored = await restoreSettings(page, settings).catch((error) => ({ error: String(error) }));
  const removedGroupIds = removed.found.groups.filter((group: { id: unknown; name: string }) => removed.removed.groups.includes(group.name)).map((group: { id: unknown }) => String(group.id));
  const residue = await cleanResidue(page, { marker: P41_MARKER, storyId: journeyStory(journeyCast()).id, removedGroupIds,
    baselineGroupIds: baseline?.groups ?? [], userDir: laneUserDir(process.env, DEBUG_DIR), save: saveSoon }).catch((error) => ({ error: String(error) }));
  const residueLeaked = 'error' in residue ? [`residue cleanup failed: ${residue.error}`] : residueLeaks(residue);
  const found = await listMarkedAssets(page, P41_MARKER, { baseline });
  return { recovery, removed: { characters: removed.removed.characters.length, groups: removed.removed.groups.length,
    errors: [...removed.removed.errors, ...removed.removed.sprites.errors, ...removed.removed.spriteReferences.errors] }, scrub, library, restored, residue,
    leaked: leakCount(found) + residueLeaked.length, leakedAssets: [...leakNames(found), ...residueLeaked] };
}

async function runJourney(page: Page) {
  const mode: Mode = flag('--dry') ? 'dry' : 'real';
  const run = Number(args[1] ?? '1');
  if (!Number.isInteger(run) || run < 1) throw new Error('run <k>: k must be a positive integer');
  const stamp = new Date().toISOString();
  const dir = resolve(DEBUG_DIR, 'p41', evidenceDirName(value('--label', 'journey'), run, mode, stamp));
  await mkdir(dir, { recursive: true });
  const cast = journeyCast();
  const ctx: Ctx = { page, mode, run, dir, rows: [], current: 'setup', cast, group: journeyGroupName(), story: journeyStory(cast), groupId: null, chatId: null, turns: [],
    dry: null, refusals: [], models: { diffusion: 'dry_edit.safetensors', encoder: 'dry_encoder.safetensors', vae: 'dry_vae.safetensors' }, alpha: 'dry_alpha', staleChecks: [],
    baseline: null, only: flag('--only') ? new Set(value('--only', '').split(',').filter(Boolean)) : null, gpuBaseline: null, settings: null, setOf: slug, seedOf: (member) => cast.findIndex((row) => row.id === member.id) };
  console.log(`p41 journey run ${run} (${mode}) -> ${dir}`);
  ctx.checkpoint = async () => { await writeRecord(dir, 'record.json', {
    kind: 'p41-journey', mode, run, startedAt: stamp, updatedAt: new Date().toISOString(), complete: false,
    verdict: 'NOT GREEN', current: ctx.current, steps: ctx.rows, refusals: ctx.refusals,
    cleanup: 'not completed', partial: Boolean(ctx.only),
  }); if (ctx.current !== 'setup' && ctx.current !== 'cleanup') await ensureSTReady(page); };
  await ctx.checkpoint();
  const distDir = mode === 'dry' || flag('--candidate') ? resolve(PROJECT_ROOT, 'dist') : null;
  let candidate: { stop(): Promise<void> } | null = null;
  if (mode === 'dry') ctx.dry = await installDryRoutes(page, owned, distDir);
  else if (distDir) candidate = await installCandidateRoute(page, distDir);
  const sampler = startSampler(mode, resolve(dir, 'samples.jsonl'));
  const calls = attachCallRecorder(page, () => ctx.current, resolve(dir, 'calls.jsonl'));
  const turns = Number(value('--turns', '10'));
  const serverLog = markServerLog(process.env, DEBUG_DIR);
  let cleaned: unknown = 'kept (--keep)';
  try {
    if (distDir) await freshPage(page);
    const pre = await step(ctx, 'preflight', null, () => stepPreflight(ctx));
    if (pre.outcome === 'fail') throw new Error(`preflight: ${pre.detail}`);
    const wizard = await step(ctx, 'wizard', null, () => stepWizard(ctx));
    if (!ctx.groupId) throw new Error(`wizard made no group: ${wizard.detail}`);
    const story = await step(ctx, 'story', null, () => stepStory(ctx));
    if (story.outcome === 'fail') throw new Error(`story: ${story.detail}`);
    await step(ctx, 'card-art', null, () => stepCardArt(ctx));
    for (const member of cast) await step(ctx, 'base', member.name, () => stepBase(ctx, member));
    for (const member of cast) await step(ctx, 'prepare', member.name, () => stepPrepare(ctx, member));
    for (const member of cast) await step(ctx, 'expressions', member.name, () => stepEdits(ctx, member, ['happy', 'angry', 'worried'].map((label) => ({ label, kind: 'expression', reference: `${slug(member)}/neutral` }))));
    for (const member of cast) await step(ctx, 'frames', member.name, () => stepEdits(ctx, member, ['blink', 'talk'].map((kind) => ({ label: 'neutral', kind, reference: `${slug(member)}/neutral` }))));
    for (const member of cast) await step(ctx, 'rig', member.name, () => stepRig(ctx, member));
    await step(ctx, 'poses', null, () => stepPoses(ctx));
    await step(ctx, 'play', null, () => stepPlay(ctx, Math.max(1, turns - 2)));
    await step(ctx, 'pose', null, () => stepPose(ctx));
    await step(ctx, 'look', null, () => stepLook(ctx));
    await step(ctx, 'look-rebuild', null, () => stepLookRebuild(ctx));
    await step(ctx, 'illustration', null, () => stepIllustration(ctx));
    await step(ctx, 'background', null, () => stepBackground(ctx));
    await step(ctx, 'swipe', null, () => stepSwipe(ctx));
    await step(ctx, 'delete', null, () => stepDelete(ctx));
    await step(ctx, 'reload', null, () => stepReload(ctx));
    await step(ctx, 'chat-switch', null, () => stepChatSwitch(ctx));
    await step(ctx, 'stale', null, async () => staleResult(await staleCheck(ctx, 'end')));
    await step(ctx, 'gpu-idle', null, () => stepGpuIdle(ctx, sampler));
  } catch (error) {
    console.log(`ABORT ${error instanceof Error ? error.message : String(error)}`);
    ctx.rows.push({ id: 'abort', outcome: 'fail', ms: 0, startedAt: new Date().toISOString(), detail: error instanceof Error ? error.message : String(error) });
  } finally {
    ctx.current = 'cleanup';
    await ctx.checkpoint();
    sampler.stop();
    calls.stop();
    const headerAfter = await captureHeader(page, `p41-after-run${run}`).catch((error) => ({ error: String(error) }));
    await writeRecord(dir, 'run-header-after.json', headerAfter);
    if (!ctx.baseline) cleaned = 'skipped: preflight captured no baseline (run the cleanup command)';
    else if (!flag('--keep')) cleaned = await cleanup(page, ctx.baseline, ctx.settings).catch((error) => ({ error: String(error) }));
    const before = existsSync(resolve(dir, 'run-header-before.json')) ? JSON.parse(await readFile(resolve(dir, 'run-header-before.json'), 'utf8')) : null;
    const afterClean = await captureHeader(page, `p41-clean-run${run}`).catch(() => null);
    const diff = before && afterClean ? diffHeaders(before, afterClean, ['chatId', 'chat', 'story', 'group', 'inventory.journal'], { ownedChats: ctx.chatId ? [ctx.chatId] : [], servedIdentity: true }).map(describe) : ['header diff not run'];
    if (ctx.dry) { await ctx.dry.stop(); }
    if (candidate) await candidate.stop();
    const serverSlice = takeServerLog(serverLog, dir);
    const misses = stepVerdict(ctx.rows.filter((row) => row.id !== 'abort'), mode, ctx.only ? [...ctx.only] : JOURNEY_STEPS);
    if (ctx.rows.some((row) => row.id === 'abort')) misses.unshift(`aborted: ${ctx.rows.find((row) => row.id === 'abort')?.detail}`);
    const plumbing = plumbingProblems(ctx.rows, ctx.only ? [...ctx.only] : JOURNEY_STEPS, cleaned);
    const record = {
      kind: 'p41-journey', mode, run, complete: true, startedAt: stamp, finishedAt: new Date().toISOString(), partial: Boolean(ctx.only), floorsDate: FLOORS_DATE, floors: JOURNEY_FLOORS,
      verdict: mode === 'dry' ? (plumbing.length ? 'PLUMBING-FAIL' : 'PLUMBING-OK (dry: no floor result)') : (misses.length || plumbing.length || ctx.only ? 'NOT GREEN' : 'GREEN'),
      plumbing, misses, steps: ctx.rows, stale: ctx.staleChecks, turns: ctx.turns, modelCalls: countCalls(calls.rows), refusals: ctx.refusals,
      samples: sampleSummary(sampler.samples), gpuBaselineMiB: ctx.gpuBaseline, cleanup: cleaned, headerDiff: diff, serverLog: serverSlice,
      dry: ctx.dry ? { fakeCalls: ctx.dry.fake.calls.length, renders: ctx.dry.fake.jobs.size, blocked: ctx.dry.blocked, textReplies: ctx.dry.replies } : null,
    };
    const path = await writeRecord(dir, 'record.json', record);
    console.log(`RECORD ${path}`);
    console.log(`VERDICT ${record.verdict}${plumbing.length ? `\n  plumbing: ${plumbing.join('\n  plumbing: ')}` : ''}${misses.length ? `\n  ${misses.join('\n  ')}` : ''}`);
    if (mode === 'real' && (misses.length || plumbing.length || ctx.only)) process.exitCode = 1;
    if (mode === 'dry' && plumbing.length) process.exitCode = 1;
  }
}

async function cleanupCommand(page: Page) {
  const dry = flag('--dry') ? await installDryRoutes(page, owned) : null;
  try {
    const result = await cleanup(page, null);
    console.log(JSON.stringify(result, null, 2));
    if (result.leaked) process.exitCode = 1;
  } finally { await dry?.stop(); }
}

if (hasHelpFlag() || !args[0] || args[0] === 'help') console.log(USAGE);
else if (args[0] === 'floors') console.log([`Journey floors (predeclared ${FLOORS_DATE}):`, ...JOURNEY_FLOORS.map((line) => `- ${line}`)].join('\n'));
else if (args[0] === 'steps') console.log(JOURNEY_STEPS.join('\n'));
else if (args[0] === 'quote') console.log(JSON.stringify({ gpuMinutes: journeyGpuMinutes(Number(value('--members', '3')), Number(value('--runs', '2'))) }));
else if (args[0] === 'run') await runCli(async (page) => { await runJourney(page); return { ok: !process.exitCode }; });
else if (args[0] === 'cleanup') await runCli(async (page) => { await cleanupCommand(page); return { ok: !process.exitCode }; });
else { console.log(USAGE); process.exitCode = 1; }
