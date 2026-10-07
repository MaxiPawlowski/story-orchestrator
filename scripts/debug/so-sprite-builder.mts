import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './lib/cli.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { openCheckpointStudio } from './so-ui.mts';
import { dismissBriefing } from './lib/briefingHarness.mts';
import { readBuilderError } from './lib/spriteBuilderUI.mts';

const args = process.argv.slice(2);
const value = (flag: string, fallback: string): string => { const at = args.indexOf(flag); return at < 0 ? fallback : args[at + 1] ?? fallback; };

export async function buildSpriteFromUI(page, options: { character: string; set: string; label: string; kind: string; box: number[]; reference: string; seed: number; steps: number; value?: string; resolution?: number; region?: Record<string, number> }) {
  const root = page.locator('#so-sprite-builder');
  if (!await root.isVisible()) await page.locator('#so-studio-tab-sprites').click({ force: true });
  await root.getByLabel('Character', { exact: true }).selectOption({ label: options.character });
  await root.getByLabel('Output set', { exact: true }).fill(options.set);
  await root.getByLabel('Reference sprite', { exact: true }).selectOption({ label: options.reference });
  if (!await root.getByLabel('diffusion', { exact: true }).isVisible()) {
    await root.getByRole('button', { name: 'Discover image-edit setup' }).click({ force: true });
    await page.waitForFunction(() => {
      const root = document.getElementById('so-sprite-builder');
      return root?.querySelector('[aria-label="diffusion"]') || root?.querySelector(':scope > [role="alert"]');
    }, undefined, { polling: 250, timeout: 35000 });
    const error = await readBuilderError(root);
    if (error) throw new Error(error);
  }
  await root.getByLabel('diffusion', { exact: true }).selectOption('qwen_image_2.1_int8_convrot.safetensors');
  await root.getByLabel('encoder', { exact: true }).selectOption('qwen3vl_8b_int8_convrot.safetensors');
  await root.getByLabel('vae', { exact: true }).selectOption('qwen_image_2.1_vae_bf16.safetensors');
  for (const [at, field] of ['x', 'y', 'width', 'height'].entries()) await root.getByLabel(field, { exact: true }).fill(String(options.box[at]));
  await root.getByLabel('Edit', { exact: true }).selectOption(options.kind);
  if (options.kind === 'look') await root.getByLabel('Visible change', { exact: true }).fill(options.value ?? '');
  await root.getByLabel('Expression label', { exact: true }).fill(options.label);
  await root.getByLabel('Seed', { exact: true }).fill(String(options.seed));
  await root.getByLabel('Steps', { exact: true }).fill(String(options.steps));
  if (options.resolution) await root.getByLabel('Edit resolution', { exact: true }).selectOption(String(options.resolution));
  if (options.region) {
    const controls = root.locator('#so-sprite-mouth-region');
    if (!await controls.getByLabel('Mouth x', { exact: true }).isVisible()) await controls.locator('summary').click({ force: true });
    for (const [key, value] of Object.entries(options.region)) await controls.getByLabel(`Mouth ${key}`, { exact: true }).fill(String(value));
  }
  await root.getByRole('button', { name: 'Generate preview' }).click({ force: true });
  await page.waitForFunction(() => {
    const root = document.getElementById('so-sprite-builder');
    return !!root?.querySelector(':scope > [role="alert"]') || [...root?.querySelectorAll('button') ?? []].some((button) => button.textContent === 'Keep this sprite');
  }, undefined, { polling: 500, timeout: 900_000 });
  const error = await readBuilderError(root);
  if (error) throw new Error(error);
  const preview = root.locator('[data-so="sprite-preview"]');
  const timings = await preview.getAttribute('data-timings');
  const raw = preview.locator('img[alt="Raw edit"]');
  const reference = preview.locator('img[alt="Reference crop"]');
  return { character: options.character, set: options.set, label: options.label, kind: options.kind,
    evidence: await root.innerText(), timings: timings ? JSON.parse(timings) : null,
    raw: await raw.count() ? await raw.getAttribute('src') : null, referenceCrop: await reference.count() ? await reference.getAttribute('src') : null,
    preview: await root.locator('img[alt$="preview"]').getAttribute('src').then((src) => Boolean(src?.startsWith('data:image/png'))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli(async (page) => {
  const command = args[0] ?? 'state';
  if (command === 'setup') {
    const story = JSON.parse(await readFile(resolve(value('--story', 'test/scenarios/v27-belle-pilot.story.json')), 'utf8'));
    const result = await page.evaluate(async (story) => {
      const ctx = SillyTavern.getContext();
      if (!ctx.groupId || !ctx.chatId) throw new Error('Open the explicitly pinned pilot group before setup.');
      const rt = globalThis.storyOrchestratorRuntime;
      rt.setExtractionSettings({ enabled: false });
      const result = await rt.importStory(JSON.stringify(story));
      rt.setUiSettings({ authorView: true });
      return { result, chatId: ctx.chatId, groupId: ctx.groupId, storyId: rt.getSnapshot().storyId };
    }, story);
    if (await page.locator('dialog#so-briefing[open]').count()) await dismissBriefing(page);
    await openCheckpointStudio(page);
    await page.locator('#so-studio-tab-sprites').click({ force: true });
    await writeJSON(result, 'sprite-builder-setup');
  } else if (command === 'build') {
    if (!await page.locator('#so-studio-modal[open]').count()) await openCheckpointStudio(page);
    const result = await buildSpriteFromUI(page, {
      character: value('--character', 'Belle'), set: value('--set', 'so_belle_pilot'), label: value('--label', 'happy'), kind: value('--kind', 'expression'),
      reference: value('--reference', 'neutral'), box: value('--box', '221,11,320,320').split(',').map(Number), seed: Number(value('--seed', '1')), steps: Number(value('--steps', '25')),
    });
    await writeJSON(result, 'sprite-builder-preview');
    await page.locator('#so-sprite-builder img[alt$="preview"]').scrollIntoViewIfNeeded();
    await writeScreenshot(page, 'sprite-builder-preview');
  } else if (command === 'save') {
    await page.locator('#so-sprite-builder').getByRole('button', { name: 'Keep this sprite' }).click({ force: true });
    await page.waitForFunction(() => document.getElementById('so-sprite-builder')?.innerText.includes('Saved to '), undefined, { polling: 250, timeout: 30_000 });
    await writeJSON({ evidence: await page.locator('#so-sprite-builder').innerText() }, 'sprite-builder-saved');
  } else if (command === 'pilot-pack') {
    if (!await page.locator('#so-studio-modal[open]').count()) await openCheckpointStudio(page);
    for (const label of ['neutral', 'happy', 'angry', 'worried']) {
      const exists = await page.evaluate(async (args) => {
        const ctx = SillyTavern.getContext();
        const response = await fetch('/api/plugins/story-orchestrator-media/sprites/read', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(args) });
        const data = await response.json();
        return response.ok && data?.labels?.[args.label]?.status === 'complete';
      }, { character: 'Belle', set: 'so_belle_pilot', label });
      if (!exists) {
        const result = await buildSpriteFromUI(page, { character: 'Belle', set: 'so_belle_pilot', label, kind: 'expression', reference: 'neutral', box: [221, 11, 320, 320], seed: 1, steps: 25 });
        await writeJSON(result, `sprite-pilot-${label}`);
        await page.locator('#so-sprite-builder').getByRole('button', { name: 'Keep this sprite' }).click({ force: true });
        await page.waitForFunction(() => document.getElementById('so-sprite-builder')?.innerText.includes('Saved to '), undefined, { polling: 250, timeout: 30_000 });
      }
    }
    for (const label of ['neutral', 'happy', 'angry', 'worried']) for (const kind of ['blink', 'talk', 'talk2']) {
      const exists = await page.evaluate(async (args) => {
        const ctx = SillyTavern.getContext();
        const response = await fetch('/api/plugins/story-orchestrator-media/sprites/read', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(args) });
        const data = await response.json();
        return response.ok && data?.labels?.[args.label]?.status === 'complete';
      }, { character: 'Belle', set: 'anim-so_belle_pilot', label: `${label}.${kind}` });
      if (exists) continue;
      const result = await buildSpriteFromUI(page, { character: 'Belle', set: 'so_belle_pilot', label, kind, reference: `so_belle_pilot/${label}`, box: [221, 11, 320, 320], seed: 1, steps: 25 });
      await writeJSON(result, `sprite-pilot-${label}-${kind}`);
      await page.locator('#so-sprite-builder').getByRole('button', { name: 'Keep this sprite' }).click({ force: true });
      await page.waitForFunction(() => document.getElementById('so-sprite-builder')?.innerText.includes('Saved to '), undefined, { polling: 250, timeout: 30_000 });
    }
    await writeJSON({ complete: true, expressions: 4, frames: 12 }, 'sprite-pilot-pack');
  } else if (command === 'look-check') {
    await page.waitForFunction(() => globalThis.storyOrchestratorSprites.view().actors.some((actor) => actor.set.startsWith('look_')),
      undefined, { polling: 500, timeout: 900_000 });
    const result = await page.evaluate(() => {
      const rt = globalThis.storyOrchestratorRuntime, stage = globalThis.storyOrchestratorSprites;
      const snapshot = rt.getSnapshot(), actor = stage.view().actors.find((actor) => actor.name === 'Belle');
      if (snapshot.blackboard.belle_hair !== 'green' || !actor?.set.startsWith('look_')) throw new Error('The applied public look did not select its generated set.');
      return { hair: snapshot.blackboard.belle_hair, set: actor.set, path: actor.path };
    });
    await writeJSON(result, 'sprite-pilot-look');
    await writeScreenshot(page, 'sprite-pilot-look');
  } else if (command === 'cancel') {
    await page.locator('#so-sprite-builder').getByRole('button', { name: 'Cancel render' }).click({ force: true });
    await writeJSON({ clicked: true }, 'sprite-builder-cancel');
  } else if (command === 'state') {
    await writeJSON({ evidence: await page.locator('#so-sprite-builder').innerText() }, 'sprite-builder-state');
  } else throw new Error('Use setup, build, save, pilot-pack, cancel or state.');
});
