export interface SpriteAsset {
  character: string;
  set: string;
  label: string;
  sha256: string;
  actualHash: string | null;
  story: string | null;
}

export interface SpriteInventory {
  trusted: boolean;
  rows: SpriteAsset[];
  reason?: string;
  references?: SpriteReference[];
}

export interface SpriteReference { name: string; unused: boolean; sha256: string; set: string | null; character: string | null; story: string | null }

export function scopedSpriteReferences(inventory: SpriteInventory, marker: string, baseline?: SpriteInventory | null): SpriteReference[] {
  const before = new Set(baseline?.trusted ? (baseline.references ?? []).map((row) => row.name) : []);
  return (inventory.references ?? []).filter((reference) => !before.has(reference.name) && scopedSprites({ trusted: inventory.trusted,
    rows: [{ character: reference.character ?? '', set: reference.set ?? '', label: '', sha256: reference.sha256, actualHash: null, story: reference.story }] }, marker).length > 0);
}

export const spriteAssetId = (row: SpriteAsset): string => `${row.character}/${row.set}/${row.label}`;

export function scopedSprites(inventory: SpriteInventory, marker: string, baseline?: SpriteInventory | null): SpriteAsset[] {
  if (!marker.trim()) throw new Error('A non-empty marker is required for sprite cleanup.');
  if (!inventory.trusted) return [];
  const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const needle = slug(marker);
  const marked = (value: string) => slug(value) === needle || slug(value).startsWith(`${needle}-`);
  const before = new Set(baseline?.trusted ? baseline.rows.map(spriteAssetId) : []);
  return inventory.rows.filter((row) => !before.has(spriteAssetId(row))
    && (marked(row.set.replace(/^anim-/, '')) || marked(row.character) || Boolean(row.story && marked(row.story))));
}

export async function snapshotSpriteAssets(page): Promise<SpriteInventory> {
  return page.evaluate(async () => {
    try {
      const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
      const response = await fetch('/api/plugins/story-orchestrator-media/sprites/inventory', { headers });
      if (response.status === 404) return { trusted: false, rows: [], reason: 'The media plugin is not installed.' };
      const data = await response.json();
      if (!response.ok || data?.trusted !== true || !Array.isArray(data.rows)) throw new Error('The generated sprite inventory could not be read.');
      for (const row of data.rows) {
        if (!row || !['character', 'set', 'label', 'sha256'].every((key) => typeof row[key] === 'string')
          || !/^[a-f0-9]{64}$/.test(row.sha256) || row.story !== null && typeof row.story !== 'string'
          || row.actualHash !== null && !/^[a-f0-9]{64}$/.test(row.actualHash)) throw new Error('The generated sprite inventory is incomplete.');
      }
      return data;
    } catch (error) { return { trusted: false, rows: [], reason: error.message }; }
  });
}

export async function removeSpriteAssets(page, rows: SpriteAsset[]): Promise<{ deleted: string[]; errors: string[] }> {
  return page.evaluate(async (rows) => {
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    const report = { deleted: [] as string[], errors: [] as string[] };
    for (const row of rows) {
      const id = `${row.character}/${row.set}/${row.label}`;
      if (row.actualHash !== row.sha256) { report.errors.push(`${id}: the owned file is missing or changed`); continue; }
      try {
        const response = await fetch('/api/plugins/story-orchestrator-media/sprites/delete', { method: 'POST', headers,
          body: JSON.stringify({ character: row.character, set: row.set, label: row.label, expectedHash: row.sha256 }) });
        const data = await response.json();
        if (!response.ok || data?.deleted !== true) throw new Error(data?.error ?? 'Sprite deletion was not confirmed.');
        report.deleted.push(id);
      } catch (error) { report.errors.push(`${id}: ${error.message}`); }
    }
    return report;
  }, rows);
}

export async function removeSpriteReferences(page, rows: SpriteReference[]): Promise<{ released: string[]; errors: string[] }> {
  return page.evaluate(async (rows) => {
    const report = { released: [] as string[], errors: [] as string[] };
    const headers = (globalThis as any).SillyTavern.getContext().getRequestHeaders();
    for (const row of rows) {
      const response = await fetch('/api/plugins/story-orchestrator-media/reference/release', { method: 'POST', headers, body: JSON.stringify({ name: row.name }) });
      const data = await response.json();
      if (!response.ok || data?.released !== true || data.prune?.deferred || data.prune?.errors?.length) {
        report.errors.push(`${row.name}: ${data?.error ?? data?.prune?.deferred ?? JSON.stringify(data?.prune?.errors)}`);
      } else report.released.push(row.name);
    }
    return report;
  }, rows);
}
