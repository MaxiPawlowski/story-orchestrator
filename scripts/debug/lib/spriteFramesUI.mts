import { saveSettingsNow } from './settingsSave.mts';
import { requireHarness, builderBox } from './imageHarness.mts';
import { parseBox, setSlug, slugName } from './imageHarnessConfig.mts';
import { buildSpriteFromUI } from '../so-sprite-builder.mts';
import { snapshotSpriteAssets, scopedSpriteReferences, removeSpriteReferences } from './spriteAssets.mts';
import { firstSeedRate, frameJobs } from './imageCast.mts';

export interface FrameSpec { character?: string; folder?: string; labels?: string[]; kinds?: string[]; looks?: string[]; box?: string; seed?: number; steps?: number; resolution?: number; floor?: number }

export async function buildFramePreviews(page, spec: FrameSpec = {}) {
  if (!spec.character) throw new Error('sprite-frames needs "character": the cast member whose original expressions seed the frames.');
  const models = requireHarness(['editModels']).editModels;
  const character = spec.character;
  const folder = spec.folder ?? character;
  const labels = spec.labels ?? ['neutral', 'happy', 'angry', 'worried'];
  const kinds = spec.kinds ?? ['blink', 'talk'];
  const jobs = frameJobs(labels, kinds, spec.looks ?? []);
  const floor = spec.floor ?? 0.9;
  const set = `so_frames_${setSlug(character)}`;
  const marker = `SO-FRAMES-${slugName(character)}`;
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites)));
  const baseline = await snapshotSpriteAssets(page);
  if (!baseline.trusted) throw new Error('A trusted sprite baseline is required.');
  const box = await builderBox(page, folder, parseBox(spec.box ?? null));
  const seed = (spec.seed ?? Math.floor(Date.now() / 1000)) >>> 0;
  const rows: Array<{ label: string; kind: string; value: string | null; ok: boolean; seconds: number; error?: string; timings?: unknown }> = [];
  try {
    for (const [at, job] of jobs.entries()) {
      const started = Date.now();
      try {
        const result = await buildSpriteFromUI(page, { character, set, label: job.label, kind: job.kind, models, reference: job.label, box,
          seed: (seed + at) >>> 0, steps: spec.steps ?? 25, resolution: spec.resolution, value: job.value ?? undefined });
        if (!result.preview) throw new Error('Preview PNG missing.');
        rows.push({ ...job, ok: true, seconds: (Date.now() - started) / 1000, timings: result.timings });
      } catch (error) {
        rows.push({ ...job, ok: false, seconds: (Date.now() - started) / 1000, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await page.evaluate((sprites) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      ctx.extensionSettings['story-orchestrator'].settings.sprites = sprites;
      (globalThis as any).storyOrchestratorRuntime.touch();
    }, saved);
    await saveSettingsNow(page);
    const after = await snapshotSpriteAssets(page);
    const released = await removeSpriteReferences(page, scopedSpriteReferences(after, marker, baseline));
    if (released.errors.length) throw new Error(`Temporary references remained: ${released.errors.join('; ')}`);
  }
  const rate = firstSeedRate(rows);
  if (rate < floor) throw new Error(`${character}: ${rows.filter((row) => !row.ok).length} of ${rows.length} frame previews failed QA on the first seed (rate ${rate.toFixed(2)}, floor ${floor}): ${JSON.stringify(rows.filter((row) => !row.ok).map((row) => `${row.label}/${row.kind}: ${row.error}`))}`);
  return { character, folder, set, seed, box, previews: rows.length, firstSeedRate: rate, floor, rows, kept: 0 };
}
