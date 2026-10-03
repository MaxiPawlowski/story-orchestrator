import { evaluateInST } from './evaluate.mts';
import { deleteLorebooksInPage } from './lorebookDelete.mts';
import { saveSettingsNow } from './settingsSave.mts';

export const RESIDUE_MARKER = 'SO-';

export interface ResidueSnapshot {
  lorebooks: string[];
  selected: string[];
  characters: Array<{ name: string; avatar: string }>;
  sessions: Array<{ key: string; applied: string[] }>;
  spikes: Record<string, unknown> | null;
}

export interface ResiduePlan {
  lorebooks: string[];
  deselect: string[];
  characters: Array<{ name: string; avatar: string }>;
  sessions: { drop: string[]; prune: Record<string, string[]> };
  spikes: Record<string, unknown> | null | undefined;
}

const lower = (value: string) => value.trim().toLowerCase();
const marked = (name: string, marker: string) => lower(name).startsWith(lower(marker));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function residueOf(before: ResidueSnapshot, after: ResidueSnapshot, marker = RESIDUE_MARKER): ResiduePlan {
  const booksBefore = new Set(before.lorebooks.map(lower));
  const lorebooks = after.lorebooks.filter((name) => marked(name, marker) && !booksBefore.has(lower(name)));
  const deleting = new Set(lorebooks.map(lower));
  const selectedBefore = new Set(before.selected.map(lower));
  const deselect = after.selected.filter((name) => marked(name, marker) && !selectedBefore.has(lower(name)) && !deleting.has(lower(name)));
  const avatarsBefore = new Set(before.characters.map((entry) => entry.avatar));
  const characters = after.characters.filter((entry) => marked(entry.name, marker) && !avatarsBefore.has(entry.avatar));
  const appliedBefore = new Map(before.sessions.map((session) => [session.key, new Set(session.applied.map(lower))]));
  const prune: Record<string, string[]> = {};
  const drop: string[] = [];
  for (const session of after.sessions) {
    const known = appliedBefore.get(session.key);
    const added = session.applied.filter((name) => marked(name, marker) && !known?.has(lower(name)));
    if (added.length) prune[session.key] = added;
    if (!known && session.applied.every((name) => added.includes(name))) drop.push(session.key);
  }
  return { lorebooks, deselect, characters, sessions: { drop, prune }, spikes: same(before.spikes, after.spikes) ? undefined : before.spikes };
}

export const residueCount = (plan: ResiduePlan) => plan.lorebooks.length + plan.deselect.length + plan.characters.length + plan.sessions.drop.length + Object.keys(plan.sessions.prune).length + (plan.spikes === undefined ? 0 : 1);

export async function captureResidue(page): Promise<ResidueSnapshot> {
  return evaluateInST(page, async () => {
    const ctx = SillyTavern.getContext();
    const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { updateWorldInfoList?: () => Promise<void>; selected_world_info?: string[] };
    await wi.updateWorldInfoList?.();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    const sessions = Array.isArray(root?.wizardSessions) ? root.wizardSessions : [];
    return {
      lorebooks: [...((ctx.getWorldInfoNames?.() ?? []) as string[])],
      selected: [...(wi.selected_world_info ?? [])],
      characters: (ctx.characters ?? []).filter((entry) => typeof entry?.avatar === 'string').map((entry) => ({ name: String(entry.name ?? ''), avatar: entry.avatar })),
      sessions: sessions.filter((session) => typeof session?.key === 'string').map((session) => ({ key: session.key, applied: (Array.isArray(session.applied) ? session.applied : []).filter((name) => typeof name === 'string') })),
      spikes: root?.settings?.spikes ? JSON.parse(JSON.stringify(root.settings.spikes)) : null,
    };
  });
}

export async function sweepResidue(page, before: ResidueSnapshot | null, marker = RESIDUE_MARKER) {
  if (!before) return { swept: false, reason: 'no pre-run capture' };
  const plan = residueOf(before, await captureResidue(page), marker);
  if (!residueCount(plan)) return { swept: false, clean: true };
  const books = await deleteLorebooksInPage(page, plan.lorebooks);
  const host = await evaluateInST(page, async ({ plan, spikesBefore }) => {
    const ctx = SillyTavern.getContext();
    const errors: string[] = [];
    for (const name of plan.deselect) {
      const result = await ctx.executeSlashCommandsWithOptions(`/world silent=true state=off ${JSON.stringify(name)}`, { handleParserErrors: false, handleExecutionErrors: false }).catch((error) => ({ isError: true, errorMessage: String(error?.message ?? error) }));
      if (result?.isError) errors.push(`deselect ${name}: ${result.errorMessage}`);
    }
    for (const character of plan.characters) {
      const response = await fetch('/api/characters/delete', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: character.avatar, delete_chats: true }) });
      if (!response.ok) errors.push(`character ${character.name}: ${response.status}`);
    }
    if (plan.characters.length) await ctx.getCharacters?.();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (root && Array.isArray(root.wizardSessions)) {
      root.wizardSessions = root.wizardSessions
        .filter((session) => !plan.sessions.drop.includes(session?.key))
        .map((session) => (plan.sessions.prune[session?.key] ? { ...session, applied: (session.applied ?? []).filter((name) => !plan.sessions.prune[session.key].includes(name)) } : session));
    }
    if (root?.settings && plan.spikes !== undefined) {
      if (spikesBefore === null) delete root.settings.spikes;
      else root.settings.spikes = spikesBefore;
    }
    return { errors };
  }, { plan, spikesBefore: plan.spikes ?? null });
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const left = residueOf(before, await captureResidue(page), marker);
  return { swept: true, plan, books, errors: [...books.errors, ...host.errors], saved, leaked: residueCount(left) ? left : null, clean: residueCount(left) === 0 && !books.errors.length && !host.errors.length };
}
