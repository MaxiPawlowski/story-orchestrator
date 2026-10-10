import { saveSettingsNow } from './settingsSave.mts';
import { requireHarness } from './imageHarness.mts';
import { closeCheckpointStudio } from '../so-ui.mts';
import { closeUnpinnedDrawers } from '../st-navigation.mts';

export async function adoptExpressionPack(page, spec: { character: string; pack?: string; models?: { diffusion: string; encoder: string; vae: string } }) {
  const pack = spec.pack ?? '';
  const models = spec.models ?? requireHarness(['editModels']).editModels;
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites)));
  const inventory = async (folder: string) => page.evaluate(async ({ folder, pack }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const post = async (route, body) => {
      const response = await fetch(`/api/plugins/story-orchestrator-media/${route}`, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Reference inventory failed.');
      return data;
    };
    const reference = await post('sprites/reference-pack', { character: folder, set: pack });
    const response = await fetch('/api/plugins/story-orchestrator-media/sprites/inventory', { headers: ctx.getRequestHeaders() });
    const generated = await response.json();
    if (!response.ok || generated?.trusted !== true) throw new Error('Generated ownership inventory failed.');
    return { reference, generated };
  }, { folder, pack });
  try {
    const root = page.locator('#so-sprite-builder');
    await root.getByLabel('Character', { exact: true }).selectOption({ label: spec.character });
    const folder = await root.getByLabel('Character', { exact: true }).inputValue();
    const before = await inventory(folder);
    if (!before.reference.files.length) throw new Error('The reference pack is empty; this check would prove nothing.');
    await root.getByRole('button', { name: 'Discover image-edit setup' }).click({ force: true });
    for (const key of ['diffusion', 'encoder', 'vae'] as const) await root.getByLabel(key, { exact: true }).selectOption(models[key]);
    await root.getByLabel('Reference pack', { exact: true }).selectOption(pack);
    await page.waitForFunction(() => !(document.getElementById('so-sprite-use-reference') as HTMLButtonElement)?.disabled, undefined, { polling: 100, timeout: 30000 });
    await root.getByRole('button', { name: 'Use this expression pack' }).click({ force: true });
    await page.waitForFunction(() => {
      const root = document.getElementById('so-sprite-builder');
      return root?.textContent?.includes('Original images stay protected.') || Boolean(root?.querySelector('[role="alert"]'));
    }, undefined, { polling: 100, timeout: 180000 });
    const error = await root.locator('[role="alert"]').textContent().catch(() => null);
    if (error) throw new Error(error);
    const after = await inventory(folder);
    if (before.reference.sha256 !== after.reference.sha256) throw new Error('Adopting an expression pack changed its original image bytes.');
    if (JSON.stringify(before.generated) !== JSON.stringify(after.generated)) throw new Error('Reference adoption changed generated-file ownership.');
    const config = await page.evaluate((folder) => (globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites.builders[folder], folder);
    if (config?.baseSet !== pack || (['diffusion', 'encoder', 'vae'] as const).some((key) => config.models?.[key] !== models[key])) throw new Error('The reference settings did not land.');
    return { character: spec.character, folder, pack, expressions: before.reference.files.length, hash: before.reference.sha256,
      originalUnchanged: true, ownershipUnchanged: true, configSaved: true };
  } finally {
    await page.evaluate((saved) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      (ctx.extensionSettings['story-orchestrator'].settings ??= {}).sprites = saved;
      (globalThis as any).storyOrchestratorRuntime.touch();
    }, saved);
    await saveSettingsNow(page);
    await closeCheckpointStudio(page);
    await closeUnpinnedDrawers(page);
  }
}
