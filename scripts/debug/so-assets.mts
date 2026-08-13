import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

// The wizard creates real assets in the user's install. J9 therefore names everything it creates
// with a marker prefix and deletes exactly those at the end — a leaked asset is a gate failure, not
// untidiness (plan 06 §Asset-leak safety). Nothing here ever touches an unmarked asset.
export const DEFAULT_MARKER = 'SO-J9';

// Two sources, because the marker alone is not enough: the model can drift off the name a journey
// asked for. The wizard records every asset it actually created in its session (`applied`), so
// cleanup is exact even when the name is not the one the journey prescribed.
export async function listMarkedAssets(page, marker = DEFAULT_MARKER) {
  return evaluateInST(page, (marker) => {
    const needle = marker.trim().toLowerCase();
    const ctx = SillyTavern.getContext();
    const sessions = ctx.extensionSettings?.['story-orchestrator']?.wizardSessions;
    const createdByWizard = new Set(
      (Array.isArray(sessions) ? sessions : [])
        .flatMap((session) => (Array.isArray(session?.applied) ? session.applied : []))
        .filter((entry): entry is string => typeof entry === 'string' && !entry.includes('/'))
        .map((entry) => entry.trim().toLowerCase()),
    );
    const marked = (value: unknown) => {
      if (typeof value !== 'string') return false;
      const key = value.trim().toLowerCase();
      return key.startsWith(needle) || createdByWizard.has(key);
    };
    const wi = (ctx.getWorldInfoNames?.() ?? []) as string[];
    return {
      marker,
      wizardCreated: [...createdByWizard],
      characters: (ctx.characters ?? []).filter((entry) => marked(entry?.name)).map((entry) => ({ name: entry.name, avatar: entry.avatar })),
      groups: (ctx.groups ?? []).filter((entry) => marked(entry?.name)).map((entry) => ({ id: entry.id, name: entry.name })),
      lorebooks: wi.filter((name) => marked(name)),
    };
  }, marker);
}

export async function removeMarkedAssets(page, marker = DEFAULT_MARKER) {
  const found = await listMarkedAssets(page, marker);
  const removed = await evaluateInST(page, async (targets) => {
    const ctx = SillyTavern.getContext();
    const headers = ctx.getRequestHeaders();
    const report = { characters: [], groups: [], lorebooks: [], errors: [] };
    const post = async (url: string, body: unknown, label: string) => {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) report.errors.push(`${label}: ${response.status}`);
      return response.ok;
    };
    // Groups first: deleting a member card out from under a group leaves the group broken.
    for (const group of targets.groups) {
      if (await post('/api/groups/delete', { id: group.id }, `group ${group.name}`)) report.groups.push(group.name);
    }
    for (const character of targets.characters) {
      if (await post('/api/characters/delete', { avatar_url: character.avatar, delete_chats: true }, `character ${character.name}`)) report.characters.push(character.name);
    }
    for (const lorebook of targets.lorebooks) {
      if (await post('/api/worldinfo/delete', { name: lorebook }, `lorebook ${lorebook}`)) report.lorebooks.push(lorebook);
    }
    await ctx.getCharacters?.();
    if (typeof ctx.updateWorldInfoList === 'function') await ctx.updateWorldInfoList();
    // Drop the wizard's own record too, so the next run starts from a clean ledger.
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (root && Array.isArray(root.wizardSessions)) {
      root.wizardSessions = [];
      ctx.saveSettingsDebounced?.();
    }
    return report;
  }, found);
  const leaked = await listMarkedAssets(page, marker);
  const leakCount = leaked.characters.length + leaked.groups.length + leaked.lorebooks.length;
  return { marker, found, removed, leaked, clean: leakCount === 0 };
}

const USAGE = `Usage: node scripts/debug/so-assets.mts <list|remove|assert-clean> [--marker <prefix>]

Marker-scoped view of the ST assets a wizard journey created. Only assets whose name starts with
the marker (default "${DEFAULT_MARKER}") are ever listed or deleted — pre-existing user assets are
never touched.

  list          print marked characters / groups / lorebooks
  remove        delete every marked asset, then re-check for leaks
  assert-clean  exit 1 if any marked asset is still present`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  if (hasHelpFlag() || args.length === 0) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const markerIndex = args.indexOf('--marker');
  const marker = markerIndex >= 0 ? args[markerIndex + 1] : DEFAULT_MARKER;
  const command = args[0];
  runCli(async (page) => {
    if (command === 'remove') {
      const result = await removeMarkedAssets(page, marker);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-assets-remove');
      if (!result.clean) throw new Error(`assets leaked: ${JSON.stringify(result.leaked)}`);
      return;
    }
    const found = await listMarkedAssets(page, marker);
    console.log(JSON.stringify(found, null, 2));
    await writeJSON(found, 'so-assets-list');
    if (command === 'assert-clean' && found.characters.length + found.groups.length + found.lorebooks.length > 0) {
      throw new Error(`assets leaked: ${JSON.stringify(found)}`);
    }
  });
}
