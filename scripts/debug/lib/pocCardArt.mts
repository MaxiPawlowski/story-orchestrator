import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Page } from 'playwright';
import { fileSize, sliceServerLog } from './rowEvidence.mts';
import { spriteAssetId, type SpriteAsset, type SpriteReference } from './spriteAssets.mts';

export const SHOWCASE_ART_ROOT = process.env.SO_SHOWCASE_ART ?? 'C:/dev/so-showcase-art';
export const SHOWCASE_AVATARS = ['wren-avatar.png', 'garrick-avatar.png', 'pim-avatar.png'] as const;
export const CARD_ART_DEVIATION = 'no product path draws a card portrait: each provisioned card gets the existing POC showcase avatar through SillyTavern\'s own card picture upload (/api/characters/edit-avatar) before the base step';

export const SHOWCASE_AVATAR_LOOKS: Readonly<Record<(typeof SHOWCASE_AVATARS)[number], readonly string[]>> = {
  'wren-avatar.png': ['red hair', 'green eyes', 'green tunic'],
  'garrick-avatar.png': ['black hair', 'plate armour', 'blue cape'],
  'pim-avatar.png': ['silver hair', 'violet eyes', 'purple witch hat'],
};

export function cardTextProblems(cast: ReadonlyArray<{ name: string; description: string }>): string[] {
  return cast.flatMap((member, at) => {
    const avatar = SHOWCASE_AVATARS[at];
    const missing = (avatar ? SHOWCASE_AVATAR_LOOKS[avatar] : []).filter((trait) => !member.description.toLowerCase().includes(trait));
    return missing.length ? [`${member.name}: card text does not describe its showcase art ${avatar} (missing ${missing.join(', ')})`] : [];
  });
}

export interface CardArtPlanRow { name: string; file: string }

export function cardArtPlan(cast: ReadonlyArray<{ name: string }>, root = SHOWCASE_ART_ROOT): CardArtPlanRow[] {
  if (cast.length > SHOWCASE_AVATARS.length) throw new Error(`only ${SHOWCASE_AVATARS.length} showcase avatars exist for ${cast.length} members`);
  return cast.map((member, at) => ({ name: member.name, file: resolve(root, SHOWCASE_AVATARS[at]) }));
}

export interface CardArtResult { name: string; file: string; avatar: string | null; ok: boolean; reason?: string; servedBytes?: number; placeholderBytes?: number; servedSha?: string }

export function cardArtProblems(rows: CardArtResult[]): string[] {
  return rows.filter((row) => !row.ok).map((row) => `${row.name}: ${row.reason ?? 'not attached'}`);
}

export async function giveCardArt(page: Page, plan: CardArtPlanRow[]): Promise<CardArtResult[]> {
  const images = await Promise.all(plan.map(async (row) => ({ ...row, data: (await readFile(row.file)).toString('base64') })));
  return page.evaluate(async (rows) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const headers = { ...ctx.getRequestHeaders() };
    delete headers['Content-Type'];
    const sha = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const placeholder = await fetch('/img/ai4.png', { cache: 'reload' }).then((r) => r.arrayBuffer());
    const placeholderSha = await sha(placeholder);
    const out: any[] = [];
    for (const row of rows) {
      const card = ctx.characters.find((entry: any) => entry.name === row.name);
      if (!card?.avatar) { out.push({ name: row.name, file: row.file, avatar: null, ok: false, reason: 'card not installed' }); continue; }
      const form = new FormData();
      form.append('avatar_url', card.avatar);
      form.append('avatar', new File([Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0))], 'avatar.png', { type: 'image/png' }));
      const response = await fetch('/api/characters/edit-avatar', { method: 'POST', headers, body: form });
      if (!response.ok) { out.push({ name: row.name, file: row.file, avatar: card.avatar, ok: false, reason: `edit-avatar ${response.status}` }); continue; }
      const served = await fetch(`/characters/${encodeURIComponent(card.avatar)}`, { cache: 'reload' }).then((r) => r.arrayBuffer());
      const servedSha = await sha(served);
      const ok = servedSha !== placeholderSha && served.byteLength > 0;
      out.push({ name: row.name, file: row.file, avatar: card.avatar, ok, servedBytes: served.byteLength, placeholderBytes: placeholder.byteLength, servedSha: servedSha.slice(0, 12),
        ...(ok ? {} : { reason: 'the served card picture is still the default picture' }) });
    }
    await ctx.getCharacters?.();
    return out;
  }, images);
}

export interface LeakSource {
  characters: Array<{ name: string }>; groups: Array<{ name: string }>; lorebooks: string[]; personas?: Array<{ name: string }>;
  regexScripts?: Array<{ name: string }>; qrSets?: string[]; sprites?: SpriteAsset[]; spriteReferences?: SpriteReference[];
}

export function leakNames(found: LeakSource): string[] {
  return [
    ...found.characters.map((row) => `character ${row.name}`),
    ...found.groups.map((row) => `group ${row.name}`),
    ...found.lorebooks.map((name) => `lorebook ${name}`),
    ...(found.personas ?? []).map((row) => `persona ${row.name}`),
    ...(found.regexScripts ?? []).map((row) => `regex ${row.name}`),
    ...(found.qrSets ?? []).map((name) => `qr ${name}`),
    ...(found.sprites ?? []).map((row) => `sprite ${spriteAssetId(row)}`),
    ...(found.spriteReferences ?? []).map((row) => `sprite-ref ${row.name}${row.set ? ` (${row.character ?? '?'}/${row.set})` : ''}`),
  ];
}

export function laneServerLog(env: NodeJS.ProcessEnv, debugDir: string): string | null {
  return env.SO_LANE ? resolve(dirname(debugDir), 'server.log') : null;
}

export function markServerLog(env: NodeJS.ProcessEnv, debugDir: string): { path: string | null; offset: number } {
  const path = laneServerLog(env, debugDir);
  return { path, offset: path ? fileSize(path) : 0 };
}

export function takeServerLog(mark: { path: string | null; offset: number }, dir: string) {
  if (!mark.path) return { taken: false, reason: 'not a lane run (SO_LANE unset)' };
  return { taken: true, file: 'server.log', ...sliceServerLog(mark.path, mark.offset, resolve(dir, 'server.log')) };
}
