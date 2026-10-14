import type { Page } from 'playwright';
import { buildSpriteFromUI } from '../so-sprite-builder.mts';
import { openCheckpointStudio, switchStudioTab } from '../so-ui.mts';
import { executeSlashCommand } from '../st-actions.mts';
import { dismissBriefing } from './briefingHarness.mts';
import { DEBUG_DIR } from './connection.mts';
import { readExtractionSettings, restoreExtractionSettings, type ExtractionSettingsSnapshot } from './extractionSettings.mts';
import { laneHarness } from './imageHarness.mts';
import { comfyCleared, harnessGaps } from './imageHarnessConfig.mts';
import { assertRuntimeOnPage } from './servedBundle.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { snapshotAssets, listMarkedAssets, leakCount } from '../so-assets.mts';
import { laneProblem, type Mode, type Outcome, type StepRow } from './pocDrivers.mts';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface Member { id: string; name: string }

export interface StepCtx { page: Page; dir: string; rows: StepRow[]; refusals: string[]; current: string; only: Set<string> | null }

export type StepResult = { outcome?: Outcome; detail?: string; data?: unknown; refusals?: string[] };

export interface StepEnv {
  page: Page;
  mode: Mode;
  models: { diffusion: string; encoder: string; vae: string };
  alpha: string;
  setOf(member: Member): string;
  seedOf(member: Member): number;
}

export async function openSprites(ctx: StepEnv) {
  if (await ctx.page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(ctx.page);
  if (!await ctx.page.locator('#so-studio-modal[open]').count()) await openCheckpointStudio(ctx.page);
  const root = ctx.page.locator('#so-sprite-builder');
  if (!await root.isVisible().catch(() => false)) await switchStudioTab(ctx.page, 'Sprites');
  await root.waitFor({ state: 'visible', timeout: 30000 });
  return root;
}

export async function chooseCharacter(ctx: StepEnv, member: Member) {
  const root = await openSprites(ctx);
  await root.getByLabel('Character', { exact: true }).selectOption({ label: member.name });
  await root.getByLabel('Output set', { exact: true }).fill(ctx.setOf(member));
  if (!await root.getByLabel('diffusion', { exact: true }).isVisible().catch(() => false)) {
    await root.getByRole('button', { name: 'Discover image-edit setup' }).click({ force: true });
    await ctx.page.waitForFunction(() => {
      const el = document.getElementById('so-sprite-builder');
      return el?.querySelector('[aria-label="diffusion"]') || el?.querySelector(':scope > [role="alert"]');
    }, undefined, { polling: 250, timeout: 60000 });
  }
  for (const key of ['diffusion', 'encoder', 'vae'] as const) await root.getByLabel(key, { exact: true }).selectOption(ctx.models[key]);
  return root;
}

export async function readBox(ctx: StepEnv): Promise<number[]> {
  const root = ctx.page.locator('#so-sprite-builder');
  return Promise.all(['x', 'y', 'width', 'height'].map(async (field) => Number(await root.getByLabel(field, { exact: true }).inputValue())));
}

export async function stepBase(ctx: StepEnv, member: Member): Promise<StepResult> {
  const root = await chooseCharacter(ctx, member);
  await root.getByLabel('Seed', { exact: true }).fill(String(1234 + ctx.seedOf(member)));
  const base = ctx.page.locator('#so-sprite-base');
  if (!await base.getByRole('button', { name: 'Build four base candidates' }).isVisible().catch(() => false)) await base.locator('summary').click({ force: true });
  await base.getByLabel('Background removal', { exact: true }).selectOption(ctx.alpha);
  await base.getByRole('button', { name: 'Build four base candidates' }).click({ force: true });
  await ctx.page.waitForFunction(() => { const b = document.getElementById('so-sprite-build-base') as HTMLButtonElement | null; return b && !b.disabled; }, undefined, { polling: 500, timeout: 1_800_000 });
  const candidates = await base.getByRole('img', { name: /Base candidate/ }).count();
  const refusals = await base.locator('[role="alert"]').allTextContents();
  if (!candidates) return { outcome: 'refused', detail: `no base passed QA: ${refusals.join(' ').slice(0, 300)}`, refusals };
  await base.getByRole('button', { name: 'Keep base 1', exact: true }).click({ force: true });
  await ctx.page.waitForFunction(() => document.getElementById('so-sprite-base')?.textContent?.includes('Saved neutral base to '), undefined, { polling: 250, timeout: 60000 });
  return { data: { candidates, pick: 1, policy: 'author keeps the first QA-passing candidate' }, refusals };
}

export async function stepPrepare(ctx: StepEnv, member: Member): Promise<StepResult> {
  await chooseCharacter(ctx, member);
  const root = ctx.page.locator('#so-sprite-builder');
  await root.getByLabel('Reference sprite', { exact: true }).selectOption({ label: `${ctx.setOf(member)}/neutral` });
  await ctx.page.waitForTimeout(500);
  const section = ctx.page.locator('#so-prepare-presentation');
  await section.getByRole('button', { name: 'Review selected base and bust' }).click({ force: true });
  await ctx.page.waitForFunction(() => {
    const el = document.getElementById('so-prepare-presentation');
    return Boolean(el?.querySelector('img[alt="Bust to approve"]') || el?.querySelector('[role="alert"]'));
  }, undefined, { polling: 250, timeout: 120000 });
  const alert = await section.locator('[role="alert"]').allTextContents();
  if (alert.length) return { outcome: 'refused', detail: alert.join(' ').slice(0, 300), refusals: alert };
  await section.getByRole('button', { name: 'Accept base and bust identity' }).click({ force: true });
  await ctx.page.waitForFunction(() => /Accepted source revision \d+/.test(document.getElementById('so-prepare-presentation')?.textContent ?? '') || Boolean(document.querySelector('#so-prepare-presentation [role="alert"]')), undefined, { polling: 250, timeout: 60000 });
  const after = await section.locator('[role="alert"]').allTextContents();
  if (after.length) return { outcome: 'refused', detail: after.join(' ').slice(0, 300), refusals: after };
  const source = await ctx.page.evaluate((name) => {
    const row = (globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites.visualSources?.[name];
    return row ? { id: row.id, revision: row.revision, baseSha: row.base?.sha256, bustSha: row.bust?.sha256, box: row.box } : null;
  }, member.name);
  if (!source) throw new Error('accepted, but no persisted visual source');
  return { data: source };
}

export async function buildAndKeep(ctx: StepEnv, member: Member, label: string, kind: string, reference: string, seed: number) {
  const box = await readBox(ctx);
  const result = await buildSpriteFromUI(ctx.page, { character: member.name, set: ctx.setOf(member), label, kind, reference, box, seed, steps: 25, models: ctx.models });
  const root = ctx.page.locator('#so-sprite-builder');
  await root.getByRole('button', { name: 'Keep this sprite' }).click({ force: true });
  await ctx.page.waitForFunction(() => document.getElementById('so-sprite-builder')?.innerText.includes('Saved to '), undefined, { polling: 250, timeout: 60000 });
  return { label, kind, timings: result.timings };
}

export const MASK_REFUSAL = /shifted by|redrew the picture outside its mask|spills past its mask edge|different aspect ratio/;

export async function stepEdits(ctx: StepEnv, member: Member, jobs: Array<{ label: string; kind: string; reference: string }>): Promise<StepResult> {
  await chooseCharacter(ctx, member);
  const done: unknown[] = [], refusals: string[] = [];
  for (const [at, job] of jobs.entries()) {
    try { done.push(await buildAndKeep(ctx, member, job.label, job.kind, job.reference, 2000 + at)); }
    catch (error) { refusals.push(`${job.label}/${job.kind}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
  }
  const mask = refusals.filter((text) => MASK_REFUSAL.test(text)).length;
  return { outcome: refusals.length ? 'refused' : 'pass', detail: refusals.length ? `${refusals.length} of ${jobs.length} refused (${mask} mask-import)` : undefined,
    refusals, data: { kept: done, maskImportRefusals: mask } };
}

export async function stepRig(ctx: StepEnv, member: Member, look = 'accepted look'): Promise<StepResult> {
  await chooseCharacter(ctx, member);
  const section = ctx.page.locator('#so-changed-look-rebuild');
  await section.waitFor({ state: 'visible', timeout: 30000 });
  const button = section.getByRole('button', { name: `Rebuild bust and rig for ${look}` });
  if (!await button.count()) return { outcome: 'refused', detail: `no rebuild row for ${look}: ${(await section.innerText()).slice(0, 200)}` };
  await button.click({ force: true });
  await ctx.page.waitForFunction(() => {
    const el = document.getElementById('so-changed-look-rebuild');
    return Boolean(el?.querySelector('[data-so="changed-look-review"]') || el?.querySelector(':scope > [role="alert"]'));
  }, undefined, { polling: 250, timeout: 300000 });
  const alert = await section.locator(':scope > [role="alert"]').allTextContents();
  if (alert.length) return { outcome: 'refused', detail: alert.join(' ').slice(0, 300), refusals: alert };
  const review = section.locator('[data-so="changed-look-review"]');
  const rigged = await review.getByRole('button', { name: 'Accept rebuilt bust and rig' }).count();
  const check = await review.locator('[data-so="landmark-check"]').getAttribute('data-status').catch(() => null);
  const why = rigged ? null : (await review.innerText()).slice(0, 300);
  await review.getByRole('button', { name: rigged ? 'Accept rebuilt bust and rig' : 'Accept rebuilt bust only' }).click({ force: true });
  await ctx.page.waitForFunction(() => !document.querySelector('#so-changed-look-rebuild [data-so="changed-look-review"]'), undefined, { polling: 250, timeout: 60000 });
  const after = await section.locator(':scope > [role="alert"]').allTextContents();
  if (after.length) return { outcome: 'refused', detail: after.join(' ').slice(0, 300), refusals: after };
  return rigged ? { data: { landmarkCheck: check } } : { outcome: 'refused', detail: `bust only, rig not prepared: ${why}`, refusals: [why ?? 'rig not prepared'], data: { landmarkCheck: check } };
}

export async function activate(ctx: StepEnv, checkpoint: string) {
  const out = await executeSlashCommand(ctx.page, `/cp activate ${checkpoint}`);
  const active = await ctx.page.evaluate(() => (globalThis as any).storyOrchestratorRuntime.getSnapshot()?.activeCheckpointId ?? null);
  if (active !== checkpoint) throw new Error(`/cp activate ${checkpoint} left ${active} active (${JSON.stringify(out).slice(0, 200)})`);
}

export async function freshPage(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await cdp.detach().catch(() => undefined);
  await page.waitForFunction(() => {
    const ctx = (globalThis as any).SillyTavern?.getContext?.();
    const fired = ctx?.eventSource?.autoFireLastArgs;
    return Boolean((globalThis as any).storyOrchestratorRuntime && ctx?.characters?.length && ctx.extensionSettings?.['story-orchestrator']
      && (fired instanceof Map ? fired.has(ctx.eventTypes.APP_READY) : true));
  }, undefined, { timeout: 120000 });
  await page.waitForTimeout(2000);
}

export async function settleSaves(page: Page, timeoutMs = 60000): Promise<boolean> {
  return page.evaluate(async (limit) => {
    const script = await import(/* webpackIgnore: true */ '/script.js' as string) as { isChatSaving?: boolean };
    const until = Date.now() + limit;
    let quietSince = Date.now();
    while (Date.now() < until) {
      const busy = script.isChatSaving || document.body.dataset.generating === 'true' || (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.()?.schedulerIdle === false;
      if (busy) quietSince = Date.now();
      else if (Date.now() - quietSince >= 2000) return true;
      await new Promise((done) => setTimeout(done, 100));
    }
    return false;
  }, timeoutMs);
}

export async function saveSoon(page: Page, attempts = 3): Promise<{ ok: boolean; attempts: number; error?: string }> {
  let error = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { await saveSettingsNow(page, 30000); return { ok: true, attempts: attempt }; }
    catch (reason) { error = reason instanceof Error ? reason.message : String(reason); await page.waitForTimeout(2000); }
  }
  return { ok: false, attempts, error };
}

export interface SettingsCapture { settings: Record<string, unknown>; reducedMotion: boolean | null; extraction: ExtractionSettingsSnapshot | null }

export async function captureSettings(page: Page): Promise<SettingsCapture> {
  const captured = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext(), home = ctx.extensionSettings['story-orchestrator'] ?? {};
    const settings = home.settings ?? {};
    return { settings: Object.fromEntries(['sprites', 'display', 'image'].map((key) => [key, settings[key] === undefined ? null : JSON.parse(JSON.stringify(settings[key]))])),
      reducedMotion: typeof ctx.powerUserSettings?.reduced_motion === 'boolean' ? ctx.powerUserSettings.reduced_motion : null };
  });
  return { ...captured, extraction: await readExtractionSettings(page) };
}

export async function restoreSettings(page: Page, capture: SettingsCapture | null) {
  if (!capture) return { restored: false, reason: 'no capture' };
  await page.evaluate((captured) => {
    const ctx = (globalThis as any).SillyTavern.getContext(), home = ctx.extensionSettings['story-orchestrator'];
    home.settings ??= {};
    for (const [key, value] of Object.entries(captured.settings)) { if (value === null) delete home.settings[key]; else home.settings[key] = value; }
    if (captured.reducedMotion !== null) ctx.powerUserSettings.reduced_motion = captured.reducedMotion;
    (globalThis as any).storyOrchestratorRuntime?.notify?.();
  }, capture);
  const extraction = await restoreExtractionSettings(page, capture.extraction);
  const saved = await saveSoon(page);
  return { restored: true, extraction, saved };
}

export async function preflightCommon(env: StepEnv, marker: string) {
  const problem = laneProblem(process.env.ST_URL, DEBUG_DIR);
  if (problem) throw new Error(problem);
  const served = await assertRuntimeOnPage(env.page);
  const baseline = await snapshotAssets(env.page);
  if (!baseline.trusted) throw new Error(`asset baseline untrusted: ${baseline.untrusted.join('; ')}`);
  const leftover = leakCount(await listMarkedAssets(env.page, marker, { baseline: null }));
  if (leftover) throw new Error(`${leftover} ${marker} assets already exist; run the cleanup command first`);
  let warm: unknown = 'dry: none';
  if (env.mode === 'real') {
    const loaded = laneHarness();
    const gaps = harnessGaps(loaded, ['editModels', 'backgroundRemoval']);
    if (gaps.length) throw new Error(`not runnable: ${gaps.join('; ')}`);
    if (!comfyCleared(process.env, loaded.config)) throw new Error('not runnable: the lane is not cleared for ComfyUI (image-harness.json allowComfy or SO_ALLOW_COMFY=1)');
    env.models = loaded.config!.editModels!;
    env.alpha = loaded.config!.backgroundRemoval!;
    warm = await env.page.evaluate(async () => {
      const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
      const status = await fetch('/api/plugins/story-orchestrator-gpu/status', { headers }).then((r) => r.ok ? r.json() : { status: r.status }).catch((e) => ({ error: String(e) }));
      const started = Date.now();
      const start = await fetch('/api/plugins/story-orchestrator-gpu/control/start-comfy', { method: 'POST', headers, body: '{}' })
        .then(async (r) => ({ status: r.status, body: (await r.text().catch(() => '')).slice(0, 300) })).catch((e) => ({ error: String(e) }));
      return { status, start, ms: Date.now() - started };
    });
  }
  return { served, baseline, warm };
}

export const DRY_MODELS = { diffusion: 'dry_edit.safetensors', encoder: 'dry_encoder.safetensors', vae: 'dry_vae.safetensors' };


export async function step(ctx: StepCtx, id: string, member: string | null, fn: () => Promise<StepResult | void>): Promise<StepRow> {
  if (ctx.only && !ctx.only.has(id)) {
    const row: StepRow = { id, member, outcome: 'skipped', ms: 0, startedAt: new Date().toISOString(), detail: '--only' };
    ctx.rows.push(row);
    return row;
  }
  ctx.current = member ? `${id}:${member}` : id;
  const startedAt = new Date().toISOString(), started = Date.now();
  let row: StepRow;
  try {
    const result: StepResult = (await fn()) || {};
    row = { id, member, outcome: result.outcome ?? 'pass', ms: Date.now() - started, startedAt, ...(result.detail ? { detail: result.detail } : {}),
      ...(result.refusals?.length ? { refusals: result.refusals } : {}), ...(result.data !== undefined ? { data: result.data } : {}) };
  } catch (error) {
    row = { id, member, outcome: 'fail', ms: Date.now() - started, startedAt, thrown: true, detail: error instanceof Error ? error.message.split('\n')[0].slice(0, 400) : String(error) };
    if (error instanceof Error && error.stack) await appendFile(resolve(ctx.dir, 'errors.log'), `${id}${member ? `[${member}]` : ''}\n${error.stack}\n\n`).catch(() => undefined);
  }
  if (row.outcome !== 'pass' && row.outcome !== 'stub') await ctx.page.screenshot({ path: resolve(ctx.dir, `${ctx.rows.length + 1}-${id}${member ? `-${member.replace(/[^a-zA-Z0-9]+/g, '_')}` : ''}.png`) }).catch(() => undefined);
  if (row.refusals?.length) ctx.refusals.push(...row.refusals.map((text) => `${id}${member ? `[${member}]` : ''}: ${text}`));
  ctx.rows.push(row);
  await appendFile(resolve(ctx.dir, 'steps.jsonl'), `${JSON.stringify(row)}\n`);
  console.log(`STEP ${id}${member ? `[${member}]` : ''} ${row.outcome} ${row.ms} ms${row.detail ? ` — ${row.detail}` : ''}`);
  return row;
}
