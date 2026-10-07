import { saveSettingsNow } from './settingsSave.mts';
import { requireHarness } from './imageHarness.mts';
import { closeCheckpointStudio } from '../so-ui.mts';
import { closeUnpinnedDrawers } from '../st-navigation.mts';
import { snapshotSpriteAssets, scopedSprites, removeSpriteAssets, scopedSpriteReferences, removeSpriteReferences } from './spriteAssets.mts';

export async function buildCardBase(page, spec: { character?: string } = {}) {
  if (!spec.character) throw new Error('sprite-base needs "character": the cast member whose card art seeds the base.');
  const harness = requireHarness(['editModels', 'backgroundRemoval', 'rater']);
  const root = page.locator('#so-sprite-builder');
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites)));
  const baseline = await snapshotSpriteAssets(page);
  if (!baseline.trusted) throw new Error('The generated-file baseline is unavailable.');
  const marker = 'SO-V27-BASE';
  const seed = Math.floor(Date.now() / 1000) >>> 0;
  if (scopedSprites(baseline, marker).length || scopedSpriteReferences(baseline, marker).length) throw new Error('The base check marker already has assets.');
  try {
    await root.getByLabel('Character', { exact: true }).selectOption({ label: spec.character });
    await root.getByLabel('Output set', { exact: true }).fill('so_v27_base');
    await root.getByLabel('Seed', { exact: true }).fill(String(seed));
    await root.getByRole('button', { name: 'Discover image-edit setup' }).click({ force: true });
    for (const [field, name] of Object.entries(harness.editModels)) {
      await root.getByLabel(field, { exact: true }).selectOption(name);
    }
    const base = page.locator('#so-sprite-base');
    await base.locator('summary').click({ force: true });
    await base.getByLabel('Background removal', { exact: true }).selectOption(harness.backgroundRemoval);
    await base.getByRole('button', { name: 'Build four base candidates' }).click({ force: true });
    await page.waitForFunction(() => {
      const button = document.getElementById('so-sprite-build-base') as HTMLButtonElement | null;
      return button && !button.disabled;
    }, undefined, { polling: 500, timeout: 900000 });
    const previews = await base.getByRole('img', { name: /Base candidate/ }).count();
    const failures = await base.locator('[role="alert"]').allTextContents();
    if (!previews) throw new Error(`No base passed QA: ${failures.join(' ')}`);
    const ratings = await page.evaluate(async (raterName) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const root = document.getElementById('so-sprite-base');
      const reference = root.querySelector('img[alt="Character-card reference"]') as HTMLImageElement;
      const previews = [...root.querySelectorAll<HTMLImageElement>('img[alt^="Base candidate"]')];
      const clean = async (image: HTMLImageElement) => {
        await image.decode();
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      };
      const images = [await clean(reference), ...await Promise.all(previews.map(clean))];
      const profile = ctx.extensionSettings.connectionManager.profiles.find((profile) => profile.name === raterName);
      if (!profile) throw new Error(`The rater profile "${raterName}" is missing.`);
      const content = [{ type: 'text', text: 'Image 1 is the character reference. The remaining images are proposed neutral sprite bases. Rate each candidate independently for identity preservation and usable framing. Return only a JSON array [{"candidate":1,"sameCharacter":true,"usableFraming":true},...]. Include every candidate. Do not rate the reference as a candidate.' },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } }))];
      const answer = await ctx.ConnectionManagerRequestService.sendRequest(profile.id, [{ role: 'user', content }], 1024,
        { extractData: true, includePreset: false, includeInstruct: false, stream: false }, {});
      const text = typeof answer === 'string' ? answer : answer?.content ?? answer?.text ?? '';
      const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
      if (!Array.isArray(parsed) || parsed.length !== previews.length || parsed.some((row, at) => row.candidate !== at + 1
        || typeof row.sameCharacter !== 'boolean' || typeof row.usableFraming !== 'boolean')) throw new Error('The base rater omitted or malformed a candidate.');
      return parsed;
    }, harness.raterProfile);
    const choice = ratings.find((row) => row.sameCharacter && row.usableFraming)?.candidate;
    if (!choice) throw new Error('The independent rater found no usable same-character base.');
    await base.getByRole('button', { name: `Keep base ${choice}`, exact: true }).click({ force: true });
    await page.waitForFunction(() => document.getElementById('so-sprite-base')?.textContent.includes('Saved neutral base to '), undefined, { polling: 200, timeout: 30000 });
    const inventory = await snapshotSpriteAssets(page);
    const generated = scopedSprites(inventory, marker, baseline);
    if (generated.length !== 1 || generated[0].label !== 'neutral' || generated[0].actualHash !== generated[0].sha256) throw new Error('The chosen base did not land as one owned neutral sprite.');
    return { character: spec.character, rater: harness.raterProfile, seed, candidates: previews, failedQA: failures, ratings, chosen: choice, saved: generated[0], alphaQA: true };
  } finally {
    await page.evaluate((saved) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      ctx.extensionSettings['story-orchestrator'].settings.sprites = saved;
      (globalThis as any).storyOrchestratorRuntime.touch();
    }, saved);
    await saveSettingsNow(page);
    await closeCheckpointStudio(page); await closeUnpinnedDrawers(page);
    const after = await snapshotSpriteAssets(page);
    const references = await removeSpriteReferences(page, scopedSpriteReferences(after, marker, baseline));
    const sprites = await removeSpriteAssets(page, scopedSprites(after, marker, baseline));
    const end = await snapshotSpriteAssets(page);
    if (references.errors.length || sprites.errors.length || scopedSprites(end, marker, baseline).length || scopedSpriteReferences(end, marker, baseline).length) {
      throw new Error('The base check left generated sprites or temporary references behind.');
    }
  }
}
