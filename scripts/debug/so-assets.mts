import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { markerNamed, parseAssetsArgs } from './lib/assetScope.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { deleteLorebooksInPage } from './lib/lorebookDelete.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

// The wizard creates real assets in the user's install. J9 therefore names everything it creates
// with a marker prefix and deletes exactly those at the end — a leaked asset is a gate failure, not
// untidiness (plan 06 §Asset-leak safety). Nothing here ever touches an unmarked asset.
export const DEFAULT_MARKER = 'SO-J9';

// What the install held before a run: the wizard sessions (with their ledgers) and every asset by
// identity. It is what lets cleanup tell what this run created from what the user already had.
//
// An EMPTY baseline is not "the install had nothing", it is "we do not know", and the two are
// indistinguishable downstream — which is how a J11 run deleted another session's character card and
// lorebook and wiped its wizard session while reporting clean:true (2026-09-20). A baseline is
// therefore trusted only when the settings root exists and ST has finished loading its lists; an
// untrusted one is ignored entirely rather than believed, falling back to marker-only scope.
export async function snapshotAssets(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    const sessions = root?.wizardSessions;
    const characters = (ctx.characters ?? []).map((entry) => entry?.avatar).filter((avatar) => typeof avatar === 'string');
    const lorebooks = (ctx.getWorldInfoNames?.() ?? []) as string[];
    const untrusted: string[] = [];
    if (!root) untrusted.push('the story-orchestrator settings root is absent (cleared config?)');
    if (!characters.length) untrusted.push('ST lists no characters yet (page still loading?)');
    if (!lorebooks.length) untrusted.push('ST lists no lorebooks yet (page still loading?)');
    return {
      takenAt: new Date().toISOString(),
      trusted: untrusted.length === 0,
      untrusted,
      sessions: Array.isArray(sessions) ? JSON.parse(JSON.stringify(sessions)) : [],
      characters,
      groups: (ctx.groups ?? []).map((entry) => entry?.id).filter((id) => id !== undefined && id !== null).map(String),
      lorebooks,
    };
  });
}

// A baseline we cannot trust is worse than none: every foreign session's ledger would read as
// "recorded during this run" and nothing would be spared for having existed before. The flag alone
// is not enough — a baseline read from an older file, or minted before this check existed, can claim
// trust while carrying an empty inventory, so the contents are re-checked here too.
function baselineTrust(baseline) {
  if (!baseline) return { usable: null, reasons: [] };
  const reasons = [...(baseline.trusted === false ? baseline.untrusted ?? ['baseline marked untrusted'] : [])];
  if (!(Array.isArray(baseline.characters) && baseline.characters.length)) reasons.push('baseline lists no characters — an empty inventory is unknown, not empty');
  if (!(Array.isArray(baseline.lorebooks) && baseline.lorebooks.length)) reasons.push('baseline lists no lorebooks — an empty inventory is unknown, not empty');
  return { usable: reasons.length ? null : baseline, reasons };
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
  const { usable, reasons } = baselineTrust(baseline);
  const found = await evaluateInST(page, async ({ marker, baseline, pinned }) => {
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
      // Reached only with a baseline we trust (an untrusted one is dropped before we get here): an
      // entry counts when that session did not already record it, and `inScope` still spares any
      // asset that existed before the run, so both halves must agree before anything is deleted.
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
    const regex = Array.isArray(ctx.extensionSettings?.regex) ? ctx.extensionSettings.regex : [];
    let qrNames: string[] = [];
    let qrError: string | null = null;
    try {
      const { QuickReplySet } = await import(/* webpackIgnore: true */ '/scripts/extensions/quick-reply/src/QuickReplySet.js' as string) as { QuickReplySet: { list: Array<{ name?: string }> } };
      qrNames = QuickReplySet.list.map((set) => set?.name).filter((name): name is string => typeof name === 'string');
    } catch (error) {
      qrError = error instanceof Error ? error.message : String(error);
    }
    return {
      allLorebooks: wi,
      allRegex: regex.filter((script) => typeof script?.scriptName === 'string').map((script) => ({ id: script.id, name: script.scriptName })),
      allQrSets: qrNames,
      qrError,
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
  }, { marker: requireMarker(marker), baseline: usable, pinned: ledger });
  // S9: regex scripts and QR sets carry no ledger, so the marker is their whole scope.
  const regexNames = new Set(markerNamed(found.allRegex.map((script) => script.name), marker));
  const scoped = {
    ...found,
    regexScripts: found.allRegex.filter((script) => regexNames.has(script.name)),
    qrSets: markerNamed(found.allQrSets, marker),
  };
  return baseline && !usable ? { ...scoped, baselineUntrusted: reasons } : scoped;
}

export const leakCount = (found) => found.characters.length + found.groups.length + found.lorebooks.length + (found.regexScripts?.length ?? 0) + (found.qrSets?.length ?? 0);

export async function removeMarkedAssets(page, marker = DEFAULT_MARKER, { baseline = null } = {}) {
  const { usable, reasons } = baselineTrust(baseline);
  if (baseline && !usable) console.log(`Asset baseline untrusted, falling back to marker-only scope: ${reasons.join('; ')}`);
  const found = await listMarkedAssets(page, marker, { baseline });
  const books = await deleteLorebooksInPage(page, found.lorebooks);
  const removed = await evaluateInST(page, async ({ targets, baseline, books }) => {
    const ctx = SillyTavern.getContext();
    const headers = ctx.getRequestHeaders();
    const report: { characters: string[]; groups: string[]; lorebooks: string[]; lorebooksViaHost: string[]; lorebooksUnlisted: string[]; regexScripts: string[]; qrSets: string[]; evicted: string[]; staleCache: string[]; errors: string[]; sessions?: { kept: string[]; dropped: string[] } } = { characters: [], groups: [], lorebooks: books.lorebooks, lorebooksViaHost: books.viaHost, lorebooksUnlisted: books.unlisted, regexScripts: [], qrSets: [], evicted: books.evicted, staleCache: books.staleCache, errors: [...books.errors] };
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
    await ctx.getCharacters?.();
    if (targets.regexScripts.length && Array.isArray(ctx.extensionSettings?.regex)) {
      const ids = new Set(targets.regexScripts.map((script) => script.id));
      const before = ctx.extensionSettings.regex;
      ctx.extensionSettings.regex = before.filter((script) => !ids.has(script?.id));
      report.regexScripts = before.filter((script) => ids.has(script?.id)).map((script) => script.scriptName);
    }
    if (targets.qrSets.length) {
      const { QuickReplySet } = await import(/* webpackIgnore: true */ '/scripts/extensions/quick-reply/src/QuickReplySet.js' as string) as { QuickReplySet: { get: (name: string) => { delete: () => Promise<void>; isDeleted?: boolean } | undefined } };
      for (const name of targets.qrSets) {
        const set = QuickReplySet.get(name);
        if (!set) { report.errors.push(`qr set ${name}: not found`); continue; }
        await set.delete();
        if (set.isDeleted) report.qrSets.push(name);
        else report.errors.push(`qr set ${name}: delete refused`);
      }
    }
    // Only this run's own sessions go, so a real author keeps their resume state — and so does a
    // peer who started a wizard while the run was in flight. That is the marker's sessions, plus any
    // session whose ledger entry we actually deleted (which is what makes it this run's). The live
    // list is the source: rebuilding it from a baseline deletes every session the baseline missed.
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (root && Array.isArray(root.wizardSessions)) {
      const sessionNeedle = String(targets.marker).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const deleted = new Set([...report.characters, ...report.groups, ...report.lorebooks].map((name) => String(name).trim().toLowerCase()));
      const owned = new Set((targets.ledger ?? []).filter((entry) => deleted.has(String(entry?.name).trim().toLowerCase())).map((entry) => entry?.session));
      const isTestKey = (key: unknown) => typeof key === 'string' && sessionNeedle !== '' && key.startsWith(sessionNeedle);
      const kept = root.wizardSessions.filter((session) => !isTestKey(session?.key) && !owned.has(session?.key));
      const keptKeys = kept.map((session) => session?.key);
      report.sessions = { kept: keptKeys, dropped: root.wizardSessions.map((session) => session?.key).filter((key) => !keptKeys.includes(key)) };
      root.wizardSessions = kept;
    }
    return report;
  }, { targets: found, baseline: usable, books });
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const leaked = await listMarkedAssets(page, marker, { baseline, ledger: found.ledger });
  return { marker, found, removed, saved, leaked, clean: leakCount(leaked) === 0 && removed.staleCache.length === 0 && !('error' in saved) };
}

const USAGE = `Usage: node scripts/debug/so-assets.mts <list|remove|assert-clean> [--marker <prefix>] [--baseline <file>]

Marker-scoped view of the ST assets a wizard journey created (default marker "${DEFAULT_MARKER}").
In scope: assets whose name starts with the marker, plus the names in the created-asset ledger of
TEST wizard sessions only — sessions whose key starts with the slugged marker ("so-j9-wizard").
A real author's wizard sessions, and the assets they created, are never touched. A journey also
passes the baseline it took at start: that adds ledger entries recorded during the run, and spares
any asset that already existed. Run "list" first: "ledger" says where each ledger name came from.

Marker-named global regex scripts and Quick Reply sets are in scope too (by name only; they have no
ledger).

  --baseline <file>        an asset baseline (so-journey writes .debug/so-journey-asset-baseline.json).
                           Never implied: a stale one would count every ledger entry since it was taken.

  list          print in-scope characters / groups / lorebooks / regex scripts / QR sets
  remove        delete them, drop the test sessions, evict deleted books from the page cache, re-check
  assert-clean  exit 1 if any in-scope asset is still present`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  if (hasHelpFlag() || args.length === 0) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const { command, marker, baselineFile } = parseAssetsArgs(args, DEFAULT_MARKER);
  runCli(async (page) => {
    const baseline = baselineFile ? JSON.parse(await readFile(baselineFile, 'utf-8')) : null;
    if (command === 'remove') {
      const result = await removeMarkedAssets(page, marker, { baseline });
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-assets-remove');
      if (!result.clean) throw new Error(`assets leaked: ${JSON.stringify(result.leaked)}`);
      return;
    }
    const found = await listMarkedAssets(page, marker, { baseline });
    console.log(JSON.stringify(found, null, 2));
    await writeJSON(found, 'so-assets-list');
    if (command === 'assert-clean' && leakCount(found) > 0) {
      throw new Error(`assets leaked: ${JSON.stringify(found)}`);
    }
  });
}
