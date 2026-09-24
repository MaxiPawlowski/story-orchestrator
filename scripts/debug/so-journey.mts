import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { beginSandboxSession, closeUnpinnedDrawers, deleteSandboxChats, openGroup, openMostRecentGroupChat, waitForSettledChat } from './st-navigation.mts';

type SandboxGuard = Awaited<ReturnType<typeof beginSandboxSession>>['guard'];
import { executeSlashCommand } from './st-actions.mts';
import { deleteSandboxMirrorBooks, recordSandboxStory, releaseBlockedRoutes, runSteps } from './so-scenario.mts';
import { validateFixture } from './lib/scenarioSchema.mts';
import { readExtractionSettings, restoreExtractionSettings } from './lib/extractionSettings.mts';
import { computeTallies, firstAttemptOf, gateFailures, readScoredHumanIds, reconcileExpected, renderTallies } from './lib/journeyTallies.mts';
import { selectMemoryProfile } from './so-ui.mts';
import { readSessionJournal } from './so-journal.mts';
import { removeMarkedAssets, snapshotAssets } from './so-assets.mts';
import { wipeChatMeta } from './so-library.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { archiveJourneyRecord, unselectedDependencies } from './lib/journeyArchive.mts';
import { applyExtSetting, restoreExtSettings } from './lib/interopVerbs.mts';
import { cleanupBranchChats, settleReapPrompts } from './lib/identityVerbs.mts';
import { BLOCKING_DIALOGS, mergeRestore, removableStories, shouldRecoverConfig, validateJourneyExtraction, type DeclaredExtraction, type LibraryCapture } from './lib/configRestore.mts';

const JOURNEY_DIR = resolve(PROJECT_ROOT, 'test/journeys');
const CONFIG_SNAPSHOT = resolve(DEBUG_DIR, 'so-journey-config-snapshot.json');
const ASSET_BASELINE = resolve(DEBUG_DIR, 'so-journey-asset-baseline.json');
const EXTENSION_KEY = 'story-orchestrator';

const USAGE = `Usage: node scripts/debug/so-journey.mts <command> [args]

Commands:
  --list                       List the journey catalog (id, title, status, check counts)
  run <id|file> [options]      Run one journey end to end
  restore-config [--file p]    Re-apply the global-settings snapshot left by a dead run
  archive <record.json> <dir>  Copy a run's record + matrix into test/journeys/records/<dir>; refuses a partial (--only) or runner-errored record

run options:
  --strict        treat "blocked" as failure (acceptance mode; baseline runs without it)
  --keep          skip cleanup (leave the sandbox chat and imported stories in place)
  --only <ids>    comma-separated check ids to run; the rest report "skipped"
  --no-config     never touch global extension settings, whatever the journey's setup says
  --group <id>    pin the group for this run, overriding the journey's setup.group
  --require-human-record <file>  fail when a human check has no scored row in that file

Check outcomes: pass | fail | blocked | not-runnable | skipped.

Three gates are counted and reported separately: automated, human and cleanup. Exit code 1
when an automated check fails, when cleanup failed or leaked (always, not only under --strict),
when the runner itself errored, or — with --strict — when anything is blocked, not-runnable or
skipped. --only marks the record "partial", so a subset run cannot stand for a gate.`;

const OUTCOME_ICON = { pass: 'PASS', fail: 'FAIL', blocked: 'BLOCKED', 'not-runnable': 'N/A', skipped: 'SKIP' };

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function listJourneys() {
  const files = (await readdir(JOURNEY_DIR)).filter((file) => file.endsWith('.journey.json')).sort();
  const journeys = [];
  for (const file of files) {
    const journey = await readJSON(resolve(JOURNEY_DIR, file));
    journeys.push({
      id: journey.id,
      title: journey.title,
      status: journey.status ?? 'active',
      file: `test/journeys/${file}`,
      objective: journey.objective ?? '',
      auto: (journey.checks ?? []).filter((check) => check.mode !== 'human').length,
      human: (journey.checks ?? []).filter((check) => check.mode === 'human').length,
    });
  }
  return journeys;
}

// A journey's checks carry the same steps a scenario does, so they get the same closed-vocabulary
// check before the run starts (v2.3 plan 01 §C). A typo'd `expect` key inside a journey check was
// exactly as silent as one inside a scenario.
function assertValidJourney(journey, path) {
  const problems = [...validateFixture(journey, basename(String(path))), ...validateJourneyExtraction(journey?.setup)];
  if (problems.length) throw new Error(`This journey would not test what it says:\n  - ${problems.join('\n  - ')}`);
  return journey;
}

async function resolveJourney(idOrFile) {
  if (idOrFile.endsWith('.json')) {
    const path = resolve(PROJECT_ROOT, idOrFile);
    return { path, journey: assertValidJourney(await readJSON(path), path) };
  }
  const files = (await readdir(JOURNEY_DIR)).filter((file) => file.endsWith('.journey.json'));
  for (const file of files) {
    const path = resolve(JOURNEY_DIR, file);
    const journey = await readJSON(path);
    if (String(journey.id).toLowerCase() === idOrFile.toLowerCase() || basename(file, '.journey.json') === idOrFile) {
      return { path, journey: assertValidJourney(journey, path) };
    }
  }
  throw new Error(`Journey "${idOrFile}" not found in test/journeys/.`);
}

// Surgical and crash-safe: only extensionSettings["story-orchestrator"] is ever read or written.
// Connection Manager profiles and every other extension's settings are never touched.
async function snapshotGlobalConfig(page) {
  const data = await evaluateInST(page, (key) => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.[key] ?? null;
    return { trusted: Boolean(ctx.extensionSettings) && typeof ctx.extensionSettings === 'object', present: root !== null && root !== undefined, value: root ? JSON.parse(JSON.stringify(root)) : null };
  }, EXTENSION_KEY);
  await mkdir(DEBUG_DIR, { recursive: true });
  await writeFile(CONFIG_SNAPSHOT, JSON.stringify({ takenAt: new Date().toISOString(), key: EXTENSION_KEY, ...data }, null, 2), 'utf-8');
  console.log(`Global config snapshot: ${CONFIG_SNAPSHOT}`);
  return data;
}

// The story library (`v2Stories`) and the wizard's sessions live in this same root and are shared with
// every other session, so a restore keeps whatever another session added after the snapshot (S12,
// `mergeRestore`). Replacing the root wholesale cost a peer a story record on 2026-09-20.
async function writeGlobalConfig(page, value) {
  const live = await evaluateInST(page, (key) => {
    const root = SillyTavern.getContext().extensionSettings?.[key];
    return root ? JSON.parse(JSON.stringify(root)) : null;
  }, EXTENSION_KEY);
  const { next, preservedStories, preservedSessions } = mergeRestore(value, live);
  const written = await evaluateInST(page, async ({ key, next }) => {
    const ctx = SillyTavern.getContext();
    if (next === null) delete ctx.extensionSettings[key];
    else ctx.extensionSettings[key] = next;
    return { key, cleared: next === null, keys: next ? Object.keys(next) : [] };
  }, { key: EXTENSION_KEY, next });
  const saved = await saveSettingsNow(page);
  return { ...written, saved, preservedStories, preservedSessions };
}

export async function restoreGlobalConfig(page, file = CONFIG_SNAPSHOT) {
  const snapshot = await readJSON(file);
  // A restore may never turn a populated config into an empty one. A run that snapshots an empty
  // root (because an earlier run cleared it and died) would otherwise write that emptiness back
  // every time, so the clear survives forever and takes extraction.profileId with it (2026-09-20).
  const snapshotEmpty = !snapshot.present || !snapshot.value || Object.keys(snapshot.value).length === 0;
  if (snapshotEmpty) {
    const live = await evaluateInST(page, (key) => Object.keys(SillyTavern.getContext().extensionSettings?.[key] ?? {}), EXTENSION_KEY);
    if (live.length) {
      console.log(`Refusing to restore an empty config over a populated one (live keys: ${live.join(', ')}) — snapshot ${file} looks like the residue of a crashed run.`);
      return { key: EXTENSION_KEY, skipped: 'empty snapshot over populated config', liveKeys: live };
    }
  }
  const result = await writeGlobalConfig(page, snapshot.present ? snapshot.value : null);
  await writeFile(file, JSON.stringify({ ...snapshot, restoredAt: new Date().toISOString() }, null, 2), 'utf-8');
  console.log(`Restored global config from ${file}: ${JSON.stringify(result)}`);
  return result;
}

// S7: a run that died between clearing the config and restoring it left an UNRESTORED snapshot on
// disk and a root that reads cleared. The next setup puts the snapshot back before taking its own,
// which would otherwise capture the emptiness and restore it forever.
async function recoverCrashedConfig(page) {
  const snapshot = await readJSON(CONFIG_SNAPSHOT).catch(() => null);
  if (!snapshot) return null;
  const liveKeys = await evaluateInST(page, (key) => Object.keys(SillyTavern.getContext().extensionSettings?.[key] ?? {}), EXTENSION_KEY);
  if (!shouldRecoverConfig(liveKeys, snapshot)) return null;
  const result = await restoreGlobalConfig(page, CONFIG_SNAPSHOT);
  const recovered = { from: CONFIG_SNAPSHOT, takenAt: snapshot.takenAt ?? null, liveKeysBefore: liveKeys, result };
  console.log(`RECOVERED a crashed run's cleared config from ${CONFIG_SNAPSHOT} (taken ${snapshot.takenAt}); the live root held only [${liveKeys.join(', ')}].`);
  return recovered;
}

// S6: what the library held before this run. `trusted: false` when the settings could not be read at
// all — then cleanup removes no story, instead of reading an unread library as an empty one.
async function captureLibrary(page): Promise<LibraryCapture> {
  return evaluateInST(page, () => {
    const settings = SillyTavern.getContext().extensionSettings;
    if (!settings || typeof settings !== 'object') return { trusted: false, hashes: [] };
    const records = settings['story-orchestrator']?.v2Stories;
    return { trusted: true, hashes: Array.isArray(records) ? records.map((record) => record.hash).filter(Boolean) : [] };
  });
}

// Capabilities answer "does this build have the feature at all?" and are probed lazily, right
// before the first check that needs one: a check earlier in the journey may be what puts the
// surface on screen. Missing capability => blocked, never a fake failure. A probe may be async
// (a fetch), because a probe that reads a global set by an earlier check goes false the moment a
// check reloads the page — which silently blocked five J11 checks (2026-09-19).
function capabilityProbe(page, capabilities) {
  const cache = {};
  return {
    cache,
    async has(id) {
      if (id in cache) return cache[id];
      const expression = (capabilities ?? {})[id];
      cache[id] = expression === undefined ? false : await evaluateInST(page, async (code) => {
        try {
          const value = new Function(`return (${code});`)();
          return Boolean(value && typeof value.then === 'function' ? await value : value);
        } catch {
          return false;
        }
      }, expression);
      return cache[id];
    },
  };
}

// A story's `requirements.lorebooks` is satisfied only by the *globally selected* set, which is
// install-wide and which no journey used to establish — so J1.5/J3/J7 passed on whatever happened to
// be selected and failed the moment another session changed it (2026-09-20). The run activates what
// the story needs and cleanup deactivates exactly what it turned on, leaving the install as found.
async function activateLorebooks(page, names: string[]) {
  const wanted = (names ?? []).filter((name) => typeof name === 'string' && name.trim());
  if (!wanted.length) return { activated: [], alreadyActive: [], missing: [] };
  // Refresh the server's list first: an empty or stale `world_names` right after a chat change is
  // "unknown", not "the book does not exist", and skipping on it silently produced a J1.5 failure
  // that looked like a product regression (2026-09-20).
  const state = await evaluateInST(page, async ({ wanted }) => {
    const mod = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as {
      selected_world_info?: string[];
      updateWorldInfoList?: () => Promise<void>;
      world_names?: string[];
    };
    await mod.updateWorldInfoList?.();
    const known: string[] = mod.world_names ?? (SillyTavern.getContext().getWorldInfoNames?.() ?? []) as string[];
    const selected: string[] = mod.selected_world_info ?? [];
    return {
      known: known.length,
      alreadyActive: wanted.filter((name: string) => selected.includes(name)),
      missing: known.length ? wanted.filter((name: string) => !known.includes(name)) : [],
      listUnavailable: known.length === 0,
    };
  }, { wanted });
  if (state.listUnavailable) throw new Error('setup.activateLorebooks: ST listed no lorebooks at all, so the install state is unknown — refusing to guess');
  if (state.missing.length) throw new Error(`setup.activateLorebooks: this install has no lorebook named ${state.missing.join(', ')}`);
  const toActivate = wanted.filter((name) => !state.alreadyActive.includes(name));
  for (const name of toActivate) await executeSlashCommand(page, `/world silent=true state=on ${JSON.stringify(name)}`);
  // Verify rather than assume: `/world` is fire-and-forget and a stale save can lose the write.
  const after = await evaluateInST(page, async ({ wanted }) => {
    const mod = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { selected_world_info?: string[] };
    const selected: string[] = mod.selected_world_info ?? [];
    return { notSelected: wanted.filter((name: string) => !selected.includes(name)) };
  }, { wanted });
  if (after.notSelected.length) throw new Error(`setup.activateLorebooks: ${after.notSelected.join(', ')} did not become active after /world state=on`);
  return { activated: toActivate, alreadyActive: state.alreadyActive, missing: [] };
}

async function deactivateLorebooks(page, names: string[]) {
  const report: Record<string, unknown> = {};
  for (const name of names ?? []) {
    report[name] = await executeSlashCommand(page, `/world silent=true state=off ${JSON.stringify(name)}`)
      .then(() => ({ deactivated: true }))
      .catch((error) => ({ error: error.message }));
  }
  return report;
}

// Plan 01 §E: the cadence and lag a journey was measured at, applied after the pre-run capture (which
// cleanup restores) and read back, so a run never proceeds on settings it did not ask for.
async function applyDeclaredExtraction(page, declared: DeclaredExtraction) {
  await evaluateInST(page, ({ cadence, stabilityLag }) => {
    globalThis.storyOrchestratorRuntime?.setExtractionSettings({ cadence, stabilityLag });
    return true;
  }, declared);
  const now = await readExtractionSettings(page);
  if (now?.cadence !== declared.cadence || now?.stabilityLag !== declared.stabilityLag) {
    throw new Error(`setup.extraction did not take: declared cadence ${declared.cadence} / lag ${declared.stabilityLag}, the install reads ${JSON.stringify(now)}`);
  }
  console.log(`extraction declared by the journey: cadence ${declared.cadence}, stabilityLag ${declared.stabilityLag}, profile ${declared.profile}`);
  return now;
}

async function configureExtraction(page, setup) {
  const selected = await selectMemoryProfile(page);
  const settings = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime?.getSnapshot()?.extraction?.settings ?? null);
  console.log(`extraction configured via the settings panel: profile="${selected.profile}" ${JSON.stringify(settings)}`);
  return { ...selected, settings };
}

async function applySetup(page, setup, { allowConfig, group = null }) {
  const applied: { configSnapshot: unknown; chat: unknown; guard?: SandboxGuard | null; extraction?: unknown; extractionBefore?: unknown; extractionDeclared?: unknown; judge?: unknown; lorebooks?: { activated: string[]; alreadyActive: string[]; missing: string[] }; dialogs?: unknown; libraryBefore?: LibraryCapture; recoveredConfig?: unknown; extensionSettings?: unknown[]; cleanup?: unknown } = { configSnapshot: null, chat: null, guard: null };
  // Unconditional, and before anything else can write them (S11).
  applied.extractionBefore = await readExtractionSettings(page);
  console.log(`extraction before this run: ${JSON.stringify(applied.extractionBefore)}`);
  if (allowConfig) applied.recoveredConfig = await recoverCrashedConfig(page);
  // Captured BEFORE a clear: read after it, a story the install already had read as this run's import,
  // and cleanup deleted it right after the restore had put it back.
  applied.libraryBefore = await captureLibrary(page);
  if (setup.clearGlobalConfig && allowConfig) {
    applied.configSnapshot = await snapshotGlobalConfig(page);
    if (!(applied.configSnapshot as { trusted?: boolean }).trusted) throw new Error('the extension settings could not be read, so a snapshot of them proves nothing; refusing to clear the config');
    await writeGlobalConfig(page, null);
  } else if (setup.snapshotGlobalConfig && allowConfig) {
    applied.configSnapshot = await snapshotGlobalConfig(page);
  }
  applied.extractionDeclared = await applyDeclaredExtraction(page, setup.extraction);
  await closeUnpinnedDrawers(page).catch(() => undefined);
  // A modal left open by a previous run blocks every chat control — and, worse, it makes the
  // navigation helpers fail SILENTLY: `open-group` times out and `openGroupById` returns without
  // switching, reporting the old group with no error, so a run proceeds against the wrong group
  // believing it moved (observed twice, 2026-09-20). Clicking through is not safe for every popup,
  // so the ones that mean "something else wrote this chat" are named and refused instead.
  // S10: the list is `BLOCKING_DIALOGS`; anything else is CANCELLED, never OK'd, because an OK is how a
  // host confirm writes. A probe that cannot read the page fails setup rather than reading as "no dialog".
  applied.dialogs = await evaluateInST(page, (blockingList) => {
    const dialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const text = (node: Element) => (node.textContent || '').replace(/\s+/g, ' ').trim();
    const hitFor = (value: string) => blockingList.find((entry) => value.toLowerCase().includes(entry.match.toLowerCase()));
    const blocking = dialogs
      .map((dialog) => ({ dialog, hit: hitFor(text(dialog)) }))
      .filter((entry) => entry.hit);
    if (blocking.length) {
      return { refused: blocking.map((entry) => ({ why: entry.hit!.why, text: text(entry.dialog).slice(0, 200) })) };
    }
    const dismissed: string[] = [];
    for (const dialog of dialogs) {
      dismissed.push(text(dialog).slice(0, 120));
      const cancel = dialog.querySelector('.popup-button-cancel, .popup-button-close') as HTMLElement | null;
      if (cancel) cancel.click();
      else (dialog as HTMLDialogElement).close();
    }
    return { dismissed: dismissed.length, texts: dismissed };
  }, BLOCKING_DIALOGS).catch((error) => { throw new Error(`setup could not read the page's open dialogs, so it cannot tell whether one blocks the run: ${error.message}`); });
  const refused = (applied.dialogs as { refused?: Array<{ why: string; text: string }> } | undefined)?.refused;
  if (refused?.length) {
    throw new Error(`a blocking dialog is open and setup will not click through it — ${refused.map((entry) => `${entry.why} [${entry.text}]`).join(' | ')}`);
  }
  const active = await evaluateInST(page, () => ({ groupId: SillyTavern.getContext().groupId ?? null }));
  // --group pins the group from the command line, the way so-scenario --sandbox --group does:
  // on a shared install the journey file's own default may not be the group this run should touch.
  const targetGroup = group ?? setup.group;
  if (targetGroup && targetGroup !== 'recent') await openGroup(page, targetGroup);
  // A group chat already open is the group we want; going via the welcome screen only risks
  // getting stuck there when a previous run died mid-journey.
  else if (!active?.groupId) await openMostRecentGroupChat(page);
  // The judgment model is install-wide, so a journey that asserts "off by default" has to put it
  // back to the shipped defaults first — otherwise an earlier session's opt-in leaks into the run.
  if (setup.resetJudge) {
    applied.judge = await evaluateInST(page, () => {
      const root = SillyTavern.getContext().extensionSettings['story-orchestrator'];
      const judge = root?.settings?.judge;
      if (!judge) return null;
      const uses = Object.fromEntries(Object.keys(judge.uses ?? {}).map((key) => [key, false]));
      root.settings.judge = { ...judge, enabled: false, timeoutMs: 1500, uses, expansion: { variants: 1, temperature: 0.7, pick: 'code' } };
      globalThis.storyOrchestratorJudge?.invalidateStatus?.();
      return { enabled: false, uses: Object.keys(uses).length };
    }).catch(() => null);
    if (applied.judge) await saveSettingsNow(page);
  }
  if (setup.newChat !== false) {
    // A chat deleted by the previous run can leave ST mid-transition; one retry settles it.
    const session = await beginSandboxSession(page).catch(async (error) => {
      console.log(`new chat retry after: ${error.message}`);
      await waitForSettledChat(page);
      await openMostRecentGroupChat(page);
      return beginSandboxSession(page);
    });
    applied.chat = { before: session.before, after: session.after };
    applied.guard = session.guard;
    if (setup.resetChatState !== false) await wipeChatMeta(page, null).catch(() => undefined);
    await evaluateInST(page, async () => {
      for (const key of Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'))) delete globalThis[key];
      await globalThis.storyOrchestratorRuntime?.loadSelectedFromChat?.();
      return true;
    });
  }
  if (setup.configureExtraction) applied.extraction = await configureExtraction(page, setup);
  if (Array.isArray(setup.activateLorebooks)) applied.lorebooks = await activateLorebooks(page, setup.activateLorebooks);
  if (Array.isArray(setup.extensionSettings)) {
    applied.extensionSettings = [];
    for (const spec of setup.extensionSettings) applied.extensionSettings.push(await applyExtSetting(page, spec));
  }
  return applied;
}

async function runCleanup(page, journey, { importedHashes, libraryBefore, configSnapshot, guard, keep, allowConfig, assetBaseline, activatedLorebooks, extractionBefore = null }) {
  const cleanup = journey.cleanup ?? {};
  const report: Record<string, unknown> = {};
  // The judge call ring lives in the chat's own metadata, so it dies with the chat a few lines
  // below. Plan 08's cost and latency report is built from these records, and the green J11 and J8
  // runs were archived without them (2026-09-20). Captured before anything deletes anything.
  report.judgeCalls = await readSessionJournal(page)
    .then((journal) => {
      const events = (journal?.events ?? []).filter((event: { kind?: string }) => event?.kind === 'judge');
      return { count: events.length, events };
    })
    .catch((error) => ({ error: error.message }));
  if (keep) return { kept: true, sandboxChatId: guard?.sandboxChatId ?? null, owned: guard?.owned ?? [], judgeCalls: report.judgeCalls };
  // Only what setup activated: a book the install already had selected is left exactly as found.
  if (activatedLorebooks?.length) report.lorebooks = await deactivateLorebooks(page, activatedLorebooks);
  // S11: put install-wide extraction settings back to the pre-run capture, always.
  report.extraction = await restoreExtractionSettings(page, extractionBefore).catch((error) => ({ error: error.message }));
  report.extensionSettings = await restoreExtSettings(page).catch((error) => ({ error: error.message }));
  // Assets go FIRST: the wizard's created-asset ledger lives in extension settings, and restoring
  // the config snapshot would wipe the very record cleanup uses to catch a renamed asset (plan 06).
  // The baseline scopes that ledger to this run: a real author's wizard sessions and the assets
  // they created are never in scope.
  if (cleanup.removeCreatedAssets) {
    const marker = typeof cleanup.removeCreatedAssets === 'string' ? cleanup.removeCreatedAssets : undefined;
    report.assets = await removeMarkedAssets(page, marker, { baseline: assetBaseline }).catch((error) => ({ error: error.message }));
  }
  if (configSnapshot && allowConfig && cleanup.restoreConfig !== false) {
    report.config = await restoreGlobalConfig(page).catch((error) => ({ error: error.message }));
  }
  const { remove: removable, kept, untrusted } = removableStories(importedHashes, libraryBefore);
  if (untrusted && importedHashes.length) report.libraryUntrusted = 'the library before this run could not be read, so no imported story was removed';
  if (cleanup.removeImportedStories !== false && removable.length) {
    report.stories = await evaluateInST(page, async (hashes) => {
      const ctx = SillyTavern.getContext();
      const root = ctx.extensionSettings?.['story-orchestrator'];
      if (!root || !Array.isArray(root.v2Stories)) return { removed: 0 };
      root.v2Stories = root.v2Stories.filter((record) => !hashes.includes(record.hash));
      return { removed: hashes.length };
    }, removable).then(async (outcome) => ({ ...outcome, saved: await saveSettingsNow(page) })).catch((error) => ({ error: error.message }));
  }
  if (kept.length && !untrusted) report.keptPreExistingStories = kept;
  if (guard && cleanup.deleteChat !== false) {
    await recordSandboxStory(page, guard);
    report.chat = await deleteSandboxChats(page, guard).catch((error) => ({ error: error.message }));
    report.branchChats = await cleanupBranchChats(page, guard).catch((error) => ({ error: error.message, leaked: [...(guard.branchChats ?? [])] }));
    report.mirrorBooks = await deleteSandboxMirrorBooks(page, guard).catch((error) => ({ error: error.message }));
    report.reapPrompts = await settleReapPrompts(page, [...guard.owned, ...(guard.branchChats ?? [])]).catch((error) => ({ error: error.message }));
  }
  // cast_changes mutates the group's disabled_members, which outlives the sandbox chat (see
  // .claude/rules/debug-scripts.md). Restore AFTER deleting the chat: enabling members while the
  // sandbox chat is still open gets undone when ST reloads the group behind the delete, which is how
  // a "clean" J5 run left Ponticius and Luke disabled (plan 04). Verified, not assumed.
  for (const member of cleanup.enableMembers ?? []) {
    report[`member:${member}`] = await executeSlashCommand(page, `/member-enable ${member}`).then(() => ({ enabled: true })).catch((error) => ({ error: error.message }));
  }
  if (cleanup.enableMembers?.length) {
    report.disabledMembers = await evaluateInST(page, () => {
      const ctx = SillyTavern.getContext();
      const group = (ctx.groups ?? []).find((entry) => entry.id === ctx.groupId);
      return group?.disabled_members ?? [];
    }).catch((error) => ({ error: error.message }));
  }
  return report;
}

function renderMatrix(journey, results) {
  const rows = results.map((row) => `| ${row.id} | ${row.mode} | ${row.findings.join(', ') || '—'} | ${row.outcome} | ${(row.detail ?? '').replace(/\|/g, '/').slice(0, 160)} |`);
  return [
    `### ${journey.id} ${journey.title} — ${journey.objective ?? ''}`,
    '',
    '| Check | Mode | Findings | Outcome | Detail |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function renderChecklist(results) {
  const human = results.filter((row) => row.mode === 'human');
  if (!human.length) return '';
  return [
    '',
    '--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---',
    ...human.map((row) => `[${row.id}] (${row.findings.join(', ') || '—'}) ${row.prompt}${row.anchors ? `\n      anchors: ${row.anchors}` : ''}`),
    '[free] What would make you stop using this?',
    '',
  ].join('\n');
}

export async function runJourney(page, idOrFile, { strict = false, keep = false, only = null, allowConfig = true, group = null, humanRecordFile = null } = {}) {
  const { journey, path } = await resolveJourney(idOrFile);
  // A human check is scored in a file, not by the runner. Without --require-human-record the
  // count is still printed, so an acceptance run cannot read as complete with rubric rows open.
  const scoredHumanIds = humanRecordFile
    ? readScoredHumanIds(await readJSON(resolve(PROJECT_ROOT, humanRecordFile)))
    : [];
  const checks = journey.checks ?? [];
  const reserved = (journey.status ?? 'active') === 'reserved';
  const results = [];
  const importedHashes = [];
  let setupApplied: { configSnapshot: unknown; chat: unknown; guard?: SandboxGuard | null; extraction?: unknown; judge?: unknown; libraryBefore?: LibraryCapture; cleanup?: unknown } = { configSnapshot: null, chat: null, guard: null };
  let runnerError = null;
  let releasedRoutes: unknown = null;
  let assetBaseline = null;
  const capabilities = capabilityProbe(page, journey.capabilities);

  console.log(`\n=== ${journey.id} ${journey.title} ===\n${journey.objective ?? ''}\n`);

  if (reserved) {
    for (const check of checks) results.push({ ...summarize(check), outcome: 'not-runnable', detail: journey.reservedReason ?? 'journey not defined on this build' });
  } else {
    try {
      // Before setup can clear the config: what the install held when the run started is how asset
      // cleanup tells this run's creations from the user's own. Persisted next to the config
      // snapshot, because a cleanup that deletes the wrong thing has to be provable afterwards, not
      // reconstructed from what the record happens to imply (2026-09-20).
      assetBaseline = await snapshotAssets(page);
      await mkdir(DEBUG_DIR, { recursive: true });
      await writeFile(ASSET_BASELINE, JSON.stringify(assetBaseline, null, 2), 'utf-8');
      if (!assetBaseline.trusted) console.log(`Asset baseline UNTRUSTED (${assetBaseline.untrusted.join('; ')}) — cleanup falls back to marker-only scope.`);
      setupApplied = await applySetup(page, journey.setup ?? {}, { allowConfig, group });
      // `reconcileExpected` lives in lib/journeyTallies.mts so it is unit-tested without a browser.
      const record = (summary, outcome, detail, extra = {}) => results.push({ ...reconcileExpected(summary, outcome, detail ?? ''), ...extra });

      for (const check of checks) {
        const summary = summarize(check);
        if (only && !only.includes(check.id)) { results.push({ ...summary, outcome: 'skipped', detail: 'not selected by --only' }); continue; }
        if (check.mode === 'human') { results.push({ ...summary, outcome: 'skipped', detail: 'human check — operator scores it' }); continue; }
        const unmet = unselectedDependencies(check, only);
        if (unmet.length) {
          record(summary, 'blocked', `depends on ${unmet.join(', ')} (state it leaves), which --only did not select`);
          console.log(`${check.id} BLOCKED (depends on ${unmet.join(', ')})`);
          continue;
        }
        const missing = [];
        for (const id of check.requires ?? []) if (!(await capabilities.has(id))) missing.push(id);
        if (missing.length) {
          record(summary, 'blocked', `missing capability: ${missing.join(', ')}`);
          console.log(`${check.id} BLOCKED (${missing.join(', ')})`);
          continue;
        }
        console.log(`--- ${check.id} ${check.goal ?? ''}`);
        const outcome = await runSteps(page, check.steps ?? [], { scenarioDir: JOURNEY_DIR, importedHashes, label: `${check.id} `, assetBaseline, guard: setupApplied.guard ?? null, requireStory: Boolean(only) });
        record(summary, outcome.ok ? 'pass' : 'fail', outcome.error ?? '', { firstAttempt: firstAttemptOf(check.expect, outcome), retries: outcome.retries ?? [] });
        if (setupApplied.guard?.escaped) {
          runnerError = outcome.error;
          console.error(`Journey stopped: ${runnerError}`);
          break;
        }
      }
    } catch (error) {
      runnerError = error instanceof Error ? error.message : String(error);
      console.error(`Runner error: ${runnerError}`);
    } finally {
      // A journey check can block a route (plan 06's blocked-save recovery). Released here for the same
      // reason the scenario runner releases it: a save endpoint left blocked fails every later run's
      // persistence in silence.
      releasedRoutes = await releaseBlockedRoutes(page);
      setupApplied.cleanup = await runCleanup(page, journey, {
        importedHashes,
        libraryBefore: (setupApplied as { libraryBefore?: LibraryCapture }).libraryBefore,
        configSnapshot: setupApplied.configSnapshot,
        guard: setupApplied.guard ?? null,
        keep,
        allowConfig,
        assetBaseline,
        activatedLorebooks: (setupApplied as { lorebooks?: { activated?: string[] } }).lorebooks?.activated ?? [],
        extractionBefore: (setupApplied as { extractionBefore?: unknown }).extractionBefore ?? null,
      }).catch((error) => ({ error: error.message }));
    }
  }

  const tally = results.reduce((acc, row) => ({ ...acc, [row.outcome]: (acc[row.outcome] ?? 0) + 1 }), {});
  // Three gates, counted apart (v2.3 plan 01 §D). One flat tally hid three different kinds of
  // "not proven": a human row reported `skipped` like a deselected one, a missing capability was
  // only caught by --strict, and cleanup failures were in the record but in nothing that decided
  // the exit code.
  const tallies = computeTallies(results, setupApplied.cleanup ?? null, scoredHumanIds);
  const reasons = gateFailures(tallies, { strict, requireHumanRecord: Boolean(humanRecordFile), runnerError });
  const failed = reasons.length > 0;

  console.log('');
  for (const row of results) console.log(`${(OUTCOME_ICON[row.outcome] ?? row.outcome).padEnd(12)} ${row.id.padEnd(8)} ${row.goal ?? row.prompt ?? ''}${row.detail ? ` — ${row.detail}` : ''}`);
  console.log(`\n${journey.id}\n${renderTallies(tallies)}`);
  if (only) console.log('PARTIAL: --only ran a subset; this record cannot stand for a gate.');
  for (const reason of reasons) console.log(`NOT GREEN: ${reason}`);
  console.log(renderChecklist(results));

  const record = {
    id: journey.id,
    title: journey.title,
    file: path,
    ranAt: new Date().toISOString(),
    strict,
    // A subset run is marked in the record itself, so an archived matrix cannot be mistaken for a
    // full one later (T4: `--only` exited green over a handful of checks).
    partial: Boolean(only),
    only: only ?? null,
    tally,
    tallies,
    notGreen: reasons,
    humanRecord: humanRecordFile ?? null,
    runnerError,
    releasedRoutes,
    capabilities: capabilities.cache,
    results,
    cleanup: setupApplied.cleanup ?? null,
  };
  await mkdir(DEBUG_DIR, { recursive: true });
  await writeFile(resolve(DEBUG_DIR, `journey-${journey.id}.md`), `${renderMatrix(journey, results)}${renderChecklist(results)}`, 'utf-8');
  await writeJSON(record, `journey-${journey.id}`);
  console.log(`Matrix: ${resolve(DEBUG_DIR, `journey-${journey.id}.md`)}`);
  return { ok: !failed, record };
}

function summarize(check) {
  return { id: check.id, mode: check.mode ?? 'auto', findings: check.findings ?? [], goal: check.goal ?? '', prompt: check.prompt ?? '', anchors: check.anchors ?? '', ...(check.expect ? { expect: check.expect } : {}) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  if (hasHelpFlag() || args.length === 0) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  if (args.includes('--list')) {
    const journeys = await listJourneys();
    for (const journey of journeys) console.log(`${journey.id.padEnd(4)} ${String(journey.status).padEnd(9)} ${journey.title.padEnd(20)} auto=${journey.auto} human=${journey.human}  ${journey.objective}`);
    process.exit(0);
  }
  const command = args[0];
  if (command === 'archive') {
    const [recordPath, gate] = [args[1], args[2]];
    if (!recordPath || !gate) {
      console.log(USAGE);
      process.exit(1);
    }
    const outcome = await archiveJourneyRecord(resolve(recordPath), resolve(PROJECT_ROOT, 'test/journeys/records', gate));
    console.log(JSON.stringify(outcome, null, 2));
    process.exit(outcome.ok ? 0 : 1);
  }
  if (command === 'restore-config') {
    runCli(async (page) => { await restoreGlobalConfig(page, argValue(args, '--file') ?? CONFIG_SNAPSHOT); });
  } else if (command === 'run') {
    const target = args[1];
    if (!target) {
      console.log(USAGE);
      process.exit(1);
    }
    const only = argValue(args, '--only');
    runCli(async (page) => {
      const { ok } = await runJourney(page, target, {
        strict: args.includes('--strict'),
        keep: args.includes('--keep'),
        only: only ? only.split(',').map((id) => id.trim()) : null,
        allowConfig: !args.includes('--no-config'),
        group: argValue(args, '--group') ?? null,
        humanRecordFile: argValue(args, '--require-human-record') ?? null,
      });
      return { ok };
    });
  } else {
    console.log(USAGE);
    process.exit(1);
  }
}
