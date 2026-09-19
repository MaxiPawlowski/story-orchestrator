import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

// The wizard creates real assets in the user's install. J9 therefore names everything it creates
// with a marker prefix and deletes exactly those at the end — a leaked asset is a gate failure, not
// untidiness (plan 06 §Asset-leak safety). Nothing here ever touches an unmarked asset.
export const DEFAULT_MARKER = 'SO-J9';

// What the install held before a run: the wizard sessions (with their ledgers) and every asset by
// identity. It is what lets cleanup tell what this run created from what the user already had.
export async function snapshotAssets(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const sessions = ctx.extensionSettings?.['story-orchestrator']?.wizardSessions;
    return {
      takenAt: new Date().toISOString(),
      sessions: Array.isArray(sessions) ? JSON.parse(JSON.stringify(sessions)) : [],
      characters: (ctx.characters ?? []).map((entry) => entry?.avatar).filter((avatar) => typeof avatar === 'string'),
      groups: (ctx.groups ?? []).map((entry) => entry?.id).filter((id) => id !== undefined && id !== null).map(String),
      lorebooks: (ctx.getWorldInfoNames?.() ?? []) as string[],
    };
  });
}

function requireMarker(marker: string) {
  if (typeof marker !== 'string' || !marker.trim()) throw new Error('a non-empty --marker is required: an empty prefix matches every asset');
  return marker;
}

// Two sources, because the marker alone is not enough: the model can drift off the name a journey
// asked for, and the wizard records every asset it actually created in its session (`applied`).
// Only TEST ledgers count: sessions keyed by the slugged marker (a journey drives a marker-named
// draft), plus — given a `baseline` — entries recorded since it was taken. A real author's session is
// never read, and with a baseline an asset that already existed is never in scope by ledger alone.
// `ledger` pins the scope: the post-removal leak check must still see the names it just pruned.
export async function listMarkedAssets(page, marker = DEFAULT_MARKER, { baseline = null, ledger = null } = {}) {
  return evaluateInST(page, ({ marker, baseline, pinned }) => {
    const lower = (value: unknown) => String(value).trim().toLowerCase();
    const needle = lower(marker);
    const sessionNeedle = needle.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const testSession = (key: unknown) => typeof key === 'string' && sessionNeedle !== '' && key.startsWith(sessionNeedle);
    const assetNames = (session): string[] => (Array.isArray(session?.applied) ? session.applied : [])
      .filter((entry): entry is string => typeof entry === 'string' && !entry.includes('/'));
    const ctx = SillyTavern.getContext();
    const stored = ctx.extensionSettings?.['story-orchestrator']?.wizardSessions;
    const sessions = Array.isArray(stored) ? stored : [];
    const recordedBefore = new Map<string, Set<string>>((baseline?.sessions ?? []).map((session) => [session?.key, new Set(assetNames(session).map(lower))]));
    const scoped: { name: string; session: string; reason: string }[] = pinned ?? sessions.flatMap((session) => {
      if (testSession(session?.key)) return assetNames(session).map((name) => ({ name, session: session.key, reason: 'test-session' }));
      if (!baseline) return [];
      return assetNames(session)
        .filter((name) => !recordedBefore.get(session?.key)?.has(lower(name)))
        .map((name) => ({ name, session: session.key, reason: 'this-run' }));
    });
    const ledgerNames = new Set(scoped.map((entry) => lower(entry.name)));
    const existed = {
      character: new Set(baseline?.characters ?? []),
      group: new Set(baseline?.groups ?? []),
      lorebook: new Set((baseline?.lorebooks ?? []).map(lower)),
    };
    const spared: { kind: string; name: string }[] = [];
    const inScope = (kind: 'character' | 'group' | 'lorebook', name: unknown, identity: string) => {
      if (typeof name !== 'string') return false;
      const key = lower(name);
      if (key.startsWith(needle)) return true;
      if (!ledgerNames.has(key)) return false;
      if (existed[kind].has(identity)) {
        spared.push({ kind, name });
        return false;
      }
      return true;
    };
    const wi = (ctx.getWorldInfoNames?.() ?? []) as string[];
    return {
      marker,
      baseline: baseline?.takenAt ?? null,
      ledger: scoped,
      sessions: sessions.map((session) => session?.key).filter(testSession),
      characters: (ctx.characters ?? []).filter((entry) => inScope('character', entry?.name, entry?.avatar)).map((entry) => ({ name: entry.name, avatar: entry.avatar })),
      groups: (ctx.groups ?? []).filter((entry) => inScope('group', entry?.name, String(entry?.id))).map((entry) => ({ id: entry.id, name: entry.name })),
      // A marked story's memory mirror: `Story Orchestrator - <title> - <chatId>` (runtime/memoryMirror.ts).
      lorebooks: wi.filter((name) => inScope('lorebook', name, lower(name)) || lower(name).startsWith(`story orchestrator - ${needle}`)),
      protected: spared,
    };
  }, { marker: requireMarker(marker), baseline, pinned: ledger });
}

export async function removeMarkedAssets(page, marker = DEFAULT_MARKER, { baseline = null } = {}) {
  const found = await listMarkedAssets(page, marker, { baseline });
  const removed = await evaluateInST(page, async ({ targets, baseline }) => {
    const ctx = SillyTavern.getContext();
    const headers = ctx.getRequestHeaders();
    const report: { characters: string[]; groups: string[]; lorebooks: string[]; errors: string[]; deselected?: string[]; sessions?: { kept: string[]; dropped: string[] } } = { characters: [], groups: [], lorebooks: [], errors: [] };
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
    // Deleting a lorebook leaves its name selected in the user's World Info settings (ST keeps
    // `selected_world_info` as-is), so a journey that activated a book must also deselect it —
    // otherwise it leaves a phantom active book behind (plan 07 live finding).
    if (report.lorebooks.length) {
      const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { selected_world_info?: string[] };
      const selected = wi.selected_world_info;
      if (Array.isArray(selected)) {
        const gone = new Set(report.lorebooks.map((name: string) => name.toLowerCase()));
        for (let index = selected.length - 1; index >= 0; index -= 1) {
          if (gone.has(String(selected[index]).toLowerCase())) selected.splice(index, 1);
        }
        report.deselected = report.lorebooks;
        ctx.saveSettingsDebounced?.();
      }
    }
    // Only test sessions go, so a real author keeps their resume state. With a baseline the sessions
    // return to exactly what the run found (undoing anything the run touched) minus the marker's.
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (root && Array.isArray(root.wizardSessions)) {
      const sessionNeedle = String(targets.marker).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const source = baseline ? baseline.sessions : root.wizardSessions;
      const kept = source.filter((session) => !(typeof session?.key === 'string' && session.key.startsWith(sessionNeedle)));
      const keptKeys = kept.map((session) => session.key);
      report.sessions = { kept: keptKeys, dropped: root.wizardSessions.map((session) => session?.key).filter((key) => !keptKeys.includes(key)) };
      root.wizardSessions = kept;
      ctx.saveSettingsDebounced?.();
    }
    return report;
  }, { targets: found, baseline });
  const leaked = await listMarkedAssets(page, marker, { baseline, ledger: found.ledger });
  const leakCount = leaked.characters.length + leaked.groups.length + leaked.lorebooks.length;
  return { marker, found, removed, leaked, clean: leakCount === 0 };
}

const USAGE = `Usage: node scripts/debug/so-assets.mts <list|remove|assert-clean> [--marker <prefix>]

Marker-scoped view of the ST assets a wizard journey created (default marker "${DEFAULT_MARKER}").
In scope: assets whose name starts with the marker, plus the names in the created-asset ledger of
TEST wizard sessions only — sessions whose key starts with the slugged marker ("so-j9-wizard").
A real author's wizard sessions, and the assets they created, are never touched. A journey also
passes the baseline it took at start: that adds ledger entries recorded during the run, and spares
any asset that already existed. Run "list" first: "ledger" says where each ledger name came from.

  list          print in-scope characters / groups / lorebooks
  remove        delete them, drop the test sessions, then re-check for leaks
  assert-clean  exit 1 if any in-scope asset is still present`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  if (hasHelpFlag() || args.length === 0) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const markerIndex = args.indexOf('--marker');
  const marker = markerIndex >= 0 ? args[markerIndex + 1] ?? '' : DEFAULT_MARKER;
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
