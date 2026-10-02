// v2.3 plan 01 §A0: the run header every live gate opens and closes with.
//
// The v2.2 gates could not tell a product fault from a leftover setting, because nothing recorded
// what the install looked like when a run started. `capture` pins every variable a v2.3 recipe
// declares (build, host, profiles, judge, stagecraft, extraction, chat, story, group cast) plus the
// three inventories the seeds S8/S11/S12 showed a run can quietly mutate: the story library, the
// wizard sessions and the global lorebook selection.
//
// `diff` is the gate: the closing capture must differ from the opening one only in the fields the
// recipe declared with --allow. Anything else failed the run, whoever caused it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { readLivePresets } from './lib/sessionPageReads.mts';
import type { LivePresets } from './lib/presetOverlay.mts';

const USAGE = `Usage: node scripts/debug/so-run-header.mts <capture|diff|show> [options]

  capture [--label <name>] [--out <path>]
      Record every pinned variable of a live run. Writes .debug/run-header-<label>.json
      (or --out) and prints the header.

  diff <baseline.json> [--allow <paths>] [--owned <chatIds>] [--served-identity] [--label <name>]
      Capture now and compare against <baseline.json>. Exits 1 on any difference that
      --allow does not cover. chat.chatLength is play progress only on a chat the run
      owns (--owned, comma-separated): a length change on the same chat at both ends
      that is not owned is blocking (H-a: a reply landed in a chat after the run left it).
      --served-identity: when bundle.served.sha256 is identical at both ends the code under
      test did not change, so build.head, build.manifest.* and the bundle-mismatch warning
      naming that served bundle are allowed (a rebuild or merge of the repo mid-run).
      --allow takes a comma-separated list of:
        chatId                     any change at that path (or any path ending in it)
        inventory.v2Stories        any change at or under that path
        inventory.v2Stories:+SO-J12   only the addition of that item
        inventory.v2Stories:-SO-J12   only the removal of that item
        inventory.v2Stories:~SO-J12   only that item's version moving up (one id@old out, one id@new in)
        inventory.characterCount=+9   only a numeric field moving by exactly that much
      --allow-file <path> reads more entries from a JSON array of strings, so an item may
      carry a comma (a character or lorebook name).

  show
      Capture and print without writing a file.

Fields: build.head/manifest (dist), campaign.pinCommit/pinBranch (adolion-fresh pin) and
campaign.installed.commit/sha256 (this lane's adolion-fresh inventory, null off an adolion-fresh lane),
bundle.served (the hash of what the page is running),
host.stVersion/mainApi/onlineStatus, profiles.selected/extraction,
judge.plugin/model/enabled/uses, stagecraft.*, extraction.*, spikes.* (v2.5 plan 09 flags), chat.groupId/chatId/authorView,
story.id/playedVersion/contentHash, group.disabledMembers, inventory.v2Stories/wizardSessions/
wizardApplied (<session key>/<ledgered name>)/lorebooksSelected/groups (<id>@<name>).`;

const safeName = (value: string) => String(value ?? 'run').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

function argValue(args: string[], name: string, fallback: string | null = null): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
}

// The build half is read from disk, not the page: the page serves whatever bundle was built last,
// and plan 08's manifest is what ties the two together. Absent manifest is recorded as null rather
// than omitted, so a diff against a post-plan-08 baseline still shows the field appearing.
export function readBuild() {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  };
  const manifestPath = resolve(PROJECT_ROOT, 'dist', 'manifest.json');
  let manifest = null;
  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // The real shape (plan 08) nests everything: `extension.version`, `bundle.sha256`, `source.*`,
      // `host.*`. Reading flat fields named the wrong build forever — every hold-out read null, so a
      // diff could not tell one bundle from another and no header could say what ran (2026-09-22).
      manifest = {
        version: parsed.extension?.version ?? null,
        flavor: parsed.flavor ?? null,
        commit: parsed.source?.commit ?? parsed.commit ?? null,
        sourceSha256: parsed.source?.sha256 ?? null,
        sourceFiles: parsed.source?.files ?? null,
        bundleSha256: parsed.bundle?.sha256 ?? null,
        bundleBytes: parsed.bundle?.bytes ?? null,
        hostVersion: parsed.host?.version ?? null,
        builtAt: parsed.builtAt ?? null,
        fileSha256: createHash('sha256').update(raw).digest('hex').slice(0, 16),
      };
    } catch {
      manifest = { error: 'unreadable' };
    }
  }
  return {
    head: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain') ? true : false,
    manifest,
  };
}

export const CAMPAIGN_PIN_FILE = resolve(PROJECT_ROOT, 'scripts', 'debug', 'adolion-fresh.pin.json');

export interface CampaignState {
  pinCommit: string | null;
  pinBranch: string | null;
  installed: { commit: string | null; sha256: string } | { error: string } | null;
}

export function readCampaign(pinFile = CAMPAIGN_PIN_FILE, laneWork = resolve(DEBUG_DIR, '..', 'adolion-fresh')): { campaign: CampaignState; warnings: string[] } {
  const warnings: string[] = [];
  const parse = (path: string) => {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return undefined;
    }
  };
  const pin = existsSync(pinFile) ? parse(pinFile) : null;
  if (pin === null) warnings.push(`the adolion-fresh pin (${pinFile}) is missing: the campaign commit is not recorded`);
  if (pin === undefined) warnings.push(`the adolion-fresh pin (${pinFile}) is unreadable: the campaign commit is not recorded`);
  const inventoryPath = resolve(laneWork, 'inventory-latest.json');
  let installed: CampaignState['installed'] = null;
  if (existsSync(inventoryPath)) {
    const inventory = parse(inventoryPath);
    if (inventory && typeof inventory === 'object') {
      installed = { commit: typeof inventory.commit === 'string' ? inventory.commit : null, sha256: createHash('sha256').update(JSON.stringify(inventory)).digest('hex').slice(0, 16) };
    } else {
      installed = { error: 'unreadable' };
      warnings.push(`the lane's adolion-fresh inventory (${inventoryPath}) is unreadable: the installed campaign is unknown`);
    }
  }
  return { campaign: { pinCommit: typeof pin?.commit === 'string' ? pin.commit : null, pinBranch: typeof pin?.branch === 'string' ? pin.branch : null, installed }, warnings };
}

export async function capturePage(page) {
  return evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const runtime = (globalThis as any).storyOrchestratorRuntime;
    const root = ctx.extensionSettings?.['story-orchestrator'] ?? {};
    const settings = runtime?.getGlobalSettings?.() ?? root.settings ?? {};

    const stVersion = await fetch('/version', { headers: ctx.getRequestHeaders() })
      .then((response: any) => (response.ok ? response.json() : null))
      .then((body: any) => (body ? `${body.pkgVersion ?? '?'}${body.gitRevision ? ` (${body.gitRevision})` : ''}` : null))
      .catch(() => null);

    // Which bundle the PAGE is actually running, hashed from what the server serves — the fact the
    // disk manifest cannot know and the one plan 08's stale-ETag trap hides: a reload that re-executes
    // a cached bundle leaves a correct-looking build on disk running nothing (2026-09-22).
    const served = await (async () => {
      try {
        const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js');
        if (!response.ok) return { http: response.status, sha256: null, bytes: null };
        const buffer = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return { http: response.status, sha256, bytes: buffer.byteLength };
      } catch {
        return { http: 0, sha256: null, bytes: null };
      }
    })();

    // The judge plugin is probed only when the judge is on: a 404 per header capture would be
    // noise for people who never enabled it (v2.2 settings-panel precedent).
    const judgeEnabled = settings?.judge?.enabled === true;
    const plugin = judgeEnabled
      ? await fetch('/api/plugins/story-orchestrator-judge/status', { headers: ctx.getRequestHeaders() })
        .then(async (response: any) => ({ http: response.status, configured: response.ok ? (await response.json())?.configured === true : null }))
        .catch(() => ({ http: 0, configured: null }))
      : { http: null, configured: null };

    const connectionManager = ctx.extensionSettings?.connectionManager ?? {};
    const profileName = (id: string | null) => {
      if (!id) return null;
      const found = (connectionManager.profiles ?? []).find((profile: any) => String(profile?.id) === String(id));
      return found ? `${found.name ?? id} [${found.api ?? '?'}${found.model ? ` ${found.model}` : ''}]` : `${id} (unknown profile)`;
    };

    const group = (ctx.groups ?? []).find((entry: any) => String(entry.id) === String(ctx.groupId)) ?? null;

    // `selected_world_info` is the truth; `world_info.globalSelect` is a debounced mirror that
    // reads stale right after an activation (v2.1 plan 07 finding).
    let lorebooksSelected: string[] | null = null;
    try {
      const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { selected_world_info?: string[] };
      lorebooksSelected = [...(wi.selected_world_info ?? [])].sort();
    } catch {
      // No silent `[]` fallback: "the import failed" and "no books are selected" are different
      // facts, and recording the second for the first is the unknown-as-empty trap the asset
      // baseline already had to be fixed for (gotchas, 2026-09-20).
      lorebooksSelected = null;
    }

    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    const selectedStoryId = blob?.selectedStoryId ?? null;
    const storyEntry = selectedStoryId && blob?.stories ? blob.stories[selectedStoryId] ?? null : null;
    const snapshot = runtime?.getSnapshot?.() ?? null;

    // A field this script cannot read would record `null` forever — and a value that never changes
    // can never fail a diff, which is the vacuous pass the whole v2.3 evidence plan exists to stop.
    // Anything unreadable is named here instead, and `warnings` is diffed like any other field.
    const warnings: string[] = [];
    if (!runtime) warnings.push('no storyOrchestratorRuntime handle: settings and author view fall back to raw extension settings');
    else if (!snapshot) warnings.push('runtime handle exposes no getSnapshot(): author view not read');
    if (!ctx.extensionSettings?.['story-orchestrator']) warnings.push('no story-orchestrator extension settings root: inventories are empty, not proven empty');
    else if (typeof root.schema !== 'number') warnings.push('the settings root carries no schema stamp: its shape baseline is not read');
    if (ctx.groupId && !(ctx.groups ?? []).some((entry: any) => String(entry.id) === String(ctx.groupId))) warnings.push('open group is not in ctx.groups: cast is not read');
    if (!stVersion) warnings.push('/version did not answer: host version not read');
    if (lorebooksSelected === null) warnings.push('world-info.js did not load: the lorebook selection is unknown, not empty');
    const debugGlobals = Object.keys(globalThis).filter((key) => key.startsWith('storyOrchestratorDebug'));
    // A leftover mock outlives a run until the page reloads and will silently steer the next real
    // pass (debug-scripts rule, 2026-09-19). A header that cannot see one cannot pin the run.
    if (debugGlobals.length) warnings.push(`debug response mocks are set: ${debugGlobals.join(', ')}`);

    const oai = ctx.chatCompletionSettings ?? {};
    const textgen = ctx.textCompletionSettings ?? {};
    return {
      rawProfiles: (connectionManager.profiles ?? []).map((profile: any) => ({ name: profile?.name ?? null, api: profile?.api ?? null, url: profile?.['api-url'] ?? null })),
      rawSampler: {
        mainApi: ctx.mainApi ?? null,
        textgen: { preset: textgen.preset ?? null, temp: textgen.temp ?? null, top_p: textgen.top_p ?? null },
        oai: { preset: oai.preset_settings_openai ?? null, temp: oai.temp_openai ?? null, top_p: oai.top_p_openai ?? null },
      },
      warnings,
      settings: { schema: typeof root.schema === 'number' ? root.schema : null },
      bundle: { served },
      host: {
        stVersion,
        mainApi: ctx.mainApi ?? null,
        onlineStatus: ctx.onlineStatus ?? null,
        macroEngine: ctx.powerUserSettings?.experimental_macro_engine === true ? 'experimental' : 'macrosParser',
      },
      profiles: {
        selected: profileName(connectionManager.selectedProfile ?? null),
        extraction: profileName(settings?.extraction?.profileId ?? null),
      },
      judge: {
        pluginHttp: plugin.http,
        pluginConfigured: plugin.configured,
        enabled: settings?.judge?.enabled ?? null,
        model: settings?.judge?.model ?? null,
        timeoutMs: settings?.judge?.timeoutMs ?? null,
        uses: settings?.judge?.uses ?? null,
        expansion: settings?.judge?.expansion ?? null,
      },
      stagecraft: {
        curatorEnabled: settings?.stagecraft?.curatorEnabled ?? null,
        acceptMode: settings?.stagecraft?.acceptMode ?? null,
        wardenEnabled: settings?.stagecraft?.wardenEnabled ?? null,
        wardenAcceptMode: settings?.stagecraft?.wardenAcceptMode ?? null,
      },
      extraction: {
        enabled: settings?.extraction?.enabled ?? null,
        cadence: settings?.extraction?.cadence ?? null,
        stabilityLag: settings?.extraction?.stabilityLag ?? null,
        reconciliationMultiplier: settings?.extraction?.reconciliationMultiplier ?? null,
        profileId: settings?.extraction?.profileId ?? null,
        profiles: settings?.extraction?.profiles ?? {},
      },
      spikes: settings?.spikes ?? null,
      display: {
        announceTransitions: settings?.display?.announceTransitions ?? null,
        hudEnabled: settings?.display?.hudEnabled ?? null,
        talkEnabled: settings?.talk?.enabled ?? null,
      },
      chat: {
        groupId: ctx.groupId ?? null,
        chatId: ctx.chatId ?? null,
        chatLength: Array.isArray(ctx.chat) ? ctx.chat.length : null,
        // `authorView` is nested under the snapshot's `ui` slice (runtime/types.ts UiRuntimeSettings),
        // not top level: reading it flat gave a permanent null on a live install (2026-09-20).
        authorView: snapshot ? snapshot.ui?.authorView ?? null : null,
      },
      story: {
        id: selectedStoryId,
        title: storyEntry?.storyTitle ?? null,
        playedVersion: storyEntry?.playedVersion ?? null,
        contentHash: storyEntry?.contentHashAtLoad ?? null,
        activeCheckpointId: storyEntry?.engineState?.activeCheckpointId ?? null,
        boundary: storyEntry?.engineState?.boundary ?? null,
      },
      group: {
        name: group?.name ?? null,
        members: [...((group?.members ?? []) as string[])].sort(),
        disabledMembers: [...((group?.disabled_members ?? []) as string[])].sort(),
      },
      // The three inventories a run can mutate without anyone noticing (S8, S11, S12).
      inventory: {
        v2Stories: (root.v2Stories ?? []).map((record: any) => `${record.id ?? '?'}@${record.version ?? '?'}`).sort(),
        wizardSessions: (Array.isArray(root.wizardSessions)
          ? root.wizardSessions.map((session: any, index: number) => (typeof session?.key === 'string' ? session.key : String(index)))
          : Object.keys(root.wizardSessions ?? {})).sort(),
        wizardApplied: (Array.isArray(root.wizardSessions) ? root.wizardSessions : [])
          .flatMap((session: any) => (typeof session?.key === 'string' && Array.isArray(session.applied) ? session.applied : [])
            .filter((name: unknown) => typeof name === 'string' && name.length > 0)
            .map((name: string) => `${session.key}/${name}`))
          .sort(),
        debugGlobals: debugGlobals.sort(),
        lorebooksSelected,
        lorebookCount: (ctx.getWorldInfoNames?.() ?? []).length,
        characterCount: (ctx.characters ?? []).length,
        groupChats: (ctx.groups ?? [])
          .flatMap((entry: any) => (Array.isArray(entry?.chats) ? entry.chats : []).map((chat: unknown) => `${entry?.id ?? '?'}/${String(chat)}`))
          .sort(),
        groups: (ctx.groups ?? []).map((entry: any) => `${entry?.id ?? '?'}@${entry?.name ?? ''}`).sort(),
      },
    };
  });
}

// A served bundle that is not the built one is the stale-ETag trap, and it is worse than a failed
// build: everything reads correct and the code under test is the previous bundle. The comparison is
// pure so it is testable without a page (gotchas, 2026-09-22).
export function bundleWarning(served: string | null, built: string | null | undefined): string | null {
  if (!served) return 'the served bundle could not be hashed: what the page is running is unknown';
  if (!built) return 'dist/manifest.json names no bundle: what the page is running cannot be compared to a build';
  if (served !== built) return `the page is running a bundle that is not the built one: served ${served.slice(0, 16)} vs dist ${built.slice(0, 16)}`;
  return null;
}

// V22b. Plan 11 claimed a profile restore was "proven by run-header diff" while the header recorded
// profile names only, so a profile repointed at a pod and never put back diffed clean. And V24 found
// the header blind to the sampler: a fixture left the whole install on its probe preset (temp 0.42)
// and the batch's diff read 0. Both are shaped here, outside the page, so they are unit-tested.
export function profileInventory(raw: Array<{ name: string | null; api: string | null; url: string | null }> | undefined): string[] {
  return (raw ?? []).map((profile) => `${profile.name ?? '(unnamed)'} [${profile.api ?? '?'}] -> ${profile.url ?? '(no api-url)'}`).sort();
}

export function samplerState(raw: { mainApi: string | null; textgen: Record<string, unknown>; oai: Record<string, unknown> } | undefined) {
  if (!raw) return { api: null, preset: null, temp: null, top_p: null };
  const source = raw.mainApi === 'textgenerationwebui' ? raw.textgen : raw.mainApi === 'openai' ? raw.oai : null;
  return { api: raw.mainApi, preset: (source?.preset as string | null) ?? null, temp: (source?.temp as number | null) ?? null, top_p: (source?.top_p as number | null) ?? null };
}

export function promptSetup(live: LivePresets | null | undefined) {
  if (!live) return null;
  const setting = (path: string) => live.settings?.[path] ?? null;
  const startReplyWith = setting('power_user.user_prompt_bias');
  const prefix = setting('power_user.reasoning.prefix');
  const thinking = typeof startReplyWith === 'string' && typeof prefix === 'string' && prefix !== '' && startReplyWith.startsWith(prefix) && setting('power_user.reasoning.auto_parse') === true;
  return {
    thinking, instruct: live.instruct?.preset ?? null, lastOutputSequence: live.instruct?.last_output_sequence ?? null,
    sequencesAsStopStrings: live.instruct?.sequences_as_stop_strings ?? null, startReplyWith,
    namesAsStopStrings: live.context?.names_as_stop_strings ?? null, reasoningParse: setting('power_user.reasoning.auto_parse'),
    reasoningTemplate: setting('power_user.reasoning.name'), responseTokens: setting('amount_gen'),
    samplers: live.textgen?.samplers ?? null, profile: live.profile ?? null,
  };
}

// v2.4 plan 01 (X10): another extension's setting a run flipped and never put back is residue the
// header could not see. `watched` names the settings a fixture is known to flip (Stepped Thinking's
// is_enabled for the T6 live row); the installed list and the disabled list catch the rest.
export const WATCHED_EXTENSION_SETTINGS: Record<string, string[]> = { 'st-stepped-thinking': ['is_enabled', 'mode', 'is_shutdown'] };

export function thirdPartyState(raw: { disabled?: unknown; installed?: unknown; settings?: Record<string, Record<string, unknown> | undefined> } | undefined) {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String).sort() : null);
  const watched = Object.fromEntries(Object.entries(WATCHED_EXTENSION_SETTINGS).map(([extension, keys]) => {
    const holder = raw?.settings?.[extension];
    return [extension, holder ? Object.fromEntries(keys.map((key) => [key, holder[key] ?? null])) : null];
  }));
  return { disabledExtensions: list(raw?.disabled), installed: list(raw?.installed), watched };
}

export async function captureThirdParty(page) {
  return evaluateInST(page, async (watchedNames: string[]) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const settings = ctx.extensionSettings ?? {};
    const installed = await fetch('/api/extensions/discover', { headers: ctx.getRequestHeaders() }).then((response) => (response.ok ? response.json() : null)).then((list) => (Array.isArray(list) ? list.filter((entry: any) => entry.type !== 'system').map((entry: any) => entry.name) : null)).catch(() => null);
    return { disabled: settings.disabledExtensions ?? null, installed, settings: Object.fromEntries(watchedNames.map((name) => [name, settings[name] ?? null])) };
  }, Object.keys(WATCHED_EXTENSION_SETTINGS));
}

export async function captureHeader(page, label: string) {
  const { rawProfiles, rawSampler, ...page_ } = await capturePage(page) as any;
  const build = readBuild();
  const warning = bundleWarning(page_.bundle?.served?.sha256 ?? null, build.manifest?.bundleSha256);
  if (warning) page_.warnings = [...page_.warnings, warning];
  const sampler = samplerState(rawSampler);
  if (!sampler.preset) page_.warnings = [...page_.warnings, `the active sampler preset was not read (main API ${sampler.api ?? 'unknown'}): a preset left behind by a run cannot be diffed`];
  const thirdParty = thirdPartyState(await captureThirdParty(page).catch(() => undefined));
  const prompt = promptSetup(await readLivePresets(page).catch(() => null));
  if (!prompt) page_.warnings = [...page_.warnings, 'the prompt setup (instruct, Start Reply With, reasoning parse, response length) was not read: a thinking/non-thinking switch cannot be diffed'];
  if (thirdParty.installed === null) page_.warnings = [...page_.warnings, 'the installed extension list was not read (/api/extensions/discover): an extension installed or removed by a run cannot be diffed'];
  const { campaign, warnings: campaignWarnings } = readCampaign();
  page_.warnings = [...page_.warnings, ...campaignWarnings];
  return { label, capturedAt: new Date().toISOString(), build, campaign, ...page_, profiles: { ...page_.profiles, urls: profileInventory(rawProfiles) }, sampler, prompt, thirdParty };
}

// Flatten to dot-paths so a diff names the exact field. Arrays stay whole at their leaf, because
// "the library gained SO-J12" is one finding, not one per index. An EMPTY object is a leaf too:
// recursing into it emitted nothing, so a whole section appearing or vanishing compared clean.
function flatten(value: unknown, prefix = '', into: Record<string, unknown> = {}): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length) {
      // An empty object is a leaf so that a whole section appearing or vanishing is a difference.
      // The root is the exception: an empty header flattens to nothing, not to a key named "".
      if (prefix) into[prefix] = value;
      return into;
    }
    for (const [key, child] of entries) flatten(child, prefix ? `${prefix}.${key}` : key, into);
    return into;
  }
  into[prefix] = value;
  return into;
}

// Only what genuinely cannot carry information between two captures of the same run.
// `build.dirty` is NOT here: a tree that went dirty mid-run changed the code under test, which is
// the single most important thing a run header can catch.
const VOLATILE = new Set(['capturedAt', 'label']);

// Play advances these by design, so a start/end diff of an ordinary session would fail on them and
// nobody would read the real findings underneath. They are still recorded, still printed by
// `diff`, and blocking only under --strict-progress.
const PROGRESS = new Set(['chat.chatLength', 'story.boundary', 'story.activeCheckpointId']);

// The playbook writes `--allow chatId`; the field lives at `chat.chatId`. Rather than guessing by
// last segment (which let `--allow enabled` clear several unrelated switches), the shorthands are
// an explicit, closed list.
const ALLOW_ALIASES: Record<string, string> = {
  chatId: 'chat.chatId',
  groupId: 'chat.groupId',
  storyId: 'story.id',
  storyVersion: 'story.playedVersion',
  contentHash: 'story.contentHash',
  authorView: 'chat.authorView',
  cadence: 'extraction.cadence',
  profile: 'profiles.extraction',
  v2Stories: 'inventory.v2Stories',
  wizardSessions: 'inventory.wizardSessions',
  lorebooksSelected: 'inventory.lorebooksSelected',
  disabledMembers: 'group.disabledMembers',
  groupChats: 'inventory.groupChats',
};

export function allowFileEntries(text: string): string[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) throw new Error('--allow-file must hold a JSON array of strings');
  return parsed.filter((entry: string) => entry.length > 0);
}

export interface AllowEntry {
  raw: string;
  path: string;
  sign?: 'added' | 'removed' | 'changed';
  item?: string;
  delta?: number;
}

const DELTA_ALLOW = /^([^:=]+)=([+-]\d+)$/;

// A malformed allowance used to over-permit silently: anything after ':' that was not '+' counted
// as a removal, and an empty item turned into a whole-field pass. Parsing is now strict and a bad
// entry is an error, not a permission.
export function parseAllow(entries: string[]): { allow: AllowEntry[]; errors: string[] } {
  const allow: AllowEntry[] = [];
  const errors: string[] = [];
  for (const raw of entries) {
    const delta = DELTA_ALLOW.exec(raw);
    if (delta) {
      allow.push({ raw, path: ALLOW_ALIASES[delta[1]] ?? delta[1], delta: Number(delta[2]) });
      continue;
    }
    if (raw.includes('=') && !raw.includes(':')) {
      errors.push(`--allow entry "${raw}" must give a signed whole number after = (path=+9 or path=-1)`);
      continue;
    }
    const colon = raw.indexOf(':');
    const head = colon >= 0 ? raw.slice(0, colon) : raw;
    const item = colon >= 0 ? raw.slice(colon + 1) : null;
    const path = ALLOW_ALIASES[head] ?? head;
    if (!path) {
      errors.push(`empty path in --allow entry "${raw}"`);
      continue;
    }
    if (item === null) {
      allow.push({ raw, path });
      continue;
    }
    if (!item.startsWith('+') && !item.startsWith('-') && !item.startsWith('~')) {
      errors.push(`--allow entry "${raw}" must name an item as :+added, :-removed or :~changed`);
      continue;
    }
    if (item.length < 2) {
      errors.push(`--allow entry "${raw}" names no item after ${item[0]}`);
      continue;
    }
    allow.push({ raw, path, sign: item.startsWith('+') ? 'added' : item.startsWith('-') ? 'removed' : 'changed', item: item.slice(1) });
  }
  return { allow, errors };
}

export interface HeaderDifference {
  path: string;
  before: unknown;
  after: unknown;
  added?: string[];
  removed?: string[];
  allowed: boolean;
  allowedBy?: string;
  progress?: boolean;
  foreignChat?: string;
}

export function foreignChatGrowth(before: unknown, after: unknown, ownedChats: string[] = []): string | null {
  const chatOf = (header: unknown) => (header && typeof header === 'object' ? (header as { chat?: { chatId?: unknown; chatLength?: unknown } }).chat ?? null : null);
  const a = chatOf(before);
  const b = chatOf(after);
  if (!a || !b || typeof a.chatId !== 'string' || !a.chatId || a.chatId !== b.chatId) return null;
  if (typeof a.chatLength !== 'number' || typeof b.chatLength !== 'number' || a.chatLength === b.chatLength) return null;
  return ownedChats.includes(a.chatId) ? null : a.chatId;
}

// Exact path, or a path prefix at a dot boundary. Last-segment matching is deliberately gone:
// `--allow enabled` used to clear judge.enabled, extraction.enabled and display.* at once.
function matchesPath(allow: string, path: string): boolean {
  return allow === path || path.startsWith(`${allow}.`);
}

const matchesItem = (value: string, item: string) => value === item || value.startsWith(`${item}@`);

const versionOf = (value: string) => {
  const at = value.lastIndexOf('@');
  const version = at >= 0 ? Number(value.slice(at + 1)) : Number.NaN;
  return Number.isFinite(version) ? version : null;
};

export function versionMovedUp(added: string[], removed: string[], item: string): boolean {
  const into = added.filter((value) => matchesItem(value, item));
  const out = removed.filter((value) => matchesItem(value, item));
  if (into.length !== 1 || out.length !== 1) return false;
  const [after, before] = [versionOf(into[0]), versionOf(out[0])];
  return after !== null && before !== null && after > before;
}

export const SERVED_ALLOWANCE = 'served-bundle';
export const SERVED_IDENTITY_PATHS = ['build.head', 'build.manifest'];
const BUNDLE_MISMATCH = /^the page is running a bundle that is not the built one: served ([0-9a-f]+) vs dist [0-9a-f]+$/;

export function servedBundleIdentity(before: unknown, after: unknown): string | null {
  const shaOf = (header: unknown) => {
    const sha = (header as { bundle?: { served?: { sha256?: unknown } } } | null)?.bundle?.served?.sha256;
    return typeof sha === 'string' && sha.length > 0 ? sha : null;
  };
  const a = shaOf(before);
  return a !== null && a === shaOf(after) ? a : null;
}

function servedIdentityCovers(difference: HeaderDifference, served: string): boolean {
  if (SERVED_IDENTITY_PATHS.some((path) => matchesPath(path, difference.path))) return true;
  if (difference.path !== 'warnings') return false;
  const items = [...(difference.added ?? []), ...(difference.removed ?? [])];
  return items.length > 0 && items.every((item) => {
    const match = BUNDLE_MISMATCH.exec(item);
    return Boolean(match && served.startsWith(match[1]));
  });
}

export function diffHeaders(
  before: unknown,
  after: unknown,
  allow: string[] | AllowEntry[] = [],
  { strictProgress = false, ownedChats = [], servedIdentity = false }: { strictProgress?: boolean; ownedChats?: string[]; servedIdentity?: boolean } = {},
): HeaderDifference[] {
  const foreign = foreignChatGrowth(before, after, ownedChats);
  const served = servedIdentity ? servedBundleIdentity(before, after) : null;
  const parsed: AllowEntry[] = allow.length && typeof allow[0] === 'string'
    ? parseAllow(allow as string[]).allow
    : (allow as AllowEntry[]);
  const flatBefore = flatten(before);
  const flatAfter = flatten(after);
  const paths = [...new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)])].sort();
  const differences: HeaderDifference[] = [];

  for (const path of paths) {
    if (VOLATILE.has(path)) continue;
    const a = flatBefore[path];
    const b = flatAfter[path];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;

    const isForeign = path === 'chat.chatLength' && foreign !== null;
    const isProgress = PROGRESS.has(path) && !isForeign;
    const difference: HeaderDifference = { path, before: a, after: b, allowed: isProgress && !strictProgress, ...(isProgress ? { progress: true } : {}), ...(isForeign ? { foreignChat: foreign } : {}) };
    if (difference.allowed) difference.allowedBy = 'progress';
    if (Array.isArray(a) || Array.isArray(b)) {
      const listA = (Array.isArray(a) ? a : []).map(String);
      const listB = (Array.isArray(b) ? b : []).map(String);
      difference.added = listB.filter((item) => !listA.includes(item));
      difference.removed = listA.filter((item) => !listB.includes(item));
    }

    if (!difference.allowed) {
      for (const entry of parsed) {
        if (!matchesPath(entry.path, path)) continue;
        if (entry.delta !== undefined) {
          if (entry.path === path && typeof a === 'number' && typeof b === 'number' && b - a === entry.delta) {
            difference.allowed = true;
            difference.allowedBy = entry.raw;
            break;
          }
          continue;
        }
        if (!entry.sign) {
          difference.allowed = true;
          difference.allowedBy = entry.raw;
          break;
        }
        const moved = (item: string) => versionMovedUp(difference.added ?? [], difference.removed ?? [], item);
        if (entry.sign === 'changed') {
          if (!moved(entry.item as string)) continue;
        } else if (!((difference[entry.sign] ?? []) as string[]).some((value) => matchesItem(value, entry.item as string))) continue;
        // An item allowance covers this difference only when EVERY added and removed item is
        // covered by some allowance — a run that adds the declared story and also drops someone
        // else's is a failure, not a pass (the S12 library-loss case).
        const covered = (values: string[] | undefined, wanted: 'added' | 'removed') => (values ?? []).every((value) => parsed.some((other) => matchesPath(other.path, path) && matchesItem(value, other.item as string)
          && (other.sign === wanted || (other.sign === 'changed' && moved(other.item as string)))));
        if (covered(difference.added, 'added') && covered(difference.removed, 'removed')) {
          difference.allowed = true;
          difference.allowedBy = entry.raw;
          break;
        }
      }
    }
    if (!difference.allowed && served && servedIdentityCovers(difference, served)) {
      difference.allowed = true;
      difference.allowedBy = `${SERVED_ALLOWANCE} ${served.slice(0, 16)}`;
    }
    differences.push(difference);
  }
  return differences;
}

export function describe(difference: HeaderDifference): string {
  const mark = difference.allowed ? 'ok  ' : 'DIFF';
  if (difference.added || difference.removed) {
    const parts = [
      difference.added?.length ? `+${difference.added.join(' +')}` : '',
      difference.removed?.length ? `-${difference.removed.join(' -')}` : '',
    ].filter(Boolean).join(' ');
    return `${mark} ${difference.path}  ${parts}${difference.allowedBy ? `  (allowed by ${difference.allowedBy})` : ''}`;
  }
  const foreign = difference.foreignChat ? `  (length changed on ${difference.foreignChat}, a chat this run does not own; pass --owned ${difference.foreignChat} if it does)` : '';
  return `${mark} ${difference.path}  ${JSON.stringify(difference.before)} -> ${JSON.stringify(difference.after)}${difference.allowedBy ? `  (allowed by ${difference.allowedBy})` : ''}${foreign}`;
}

export async function writeHeader(header: unknown, label: string, out: string | null): Promise<string> {
  await mkdir(DEBUG_DIR, { recursive: true });
  const path = out ? resolve(PROJECT_ROOT, out) : resolve(DEBUG_DIR, `run-header-${safeName(label)}.json`);
  await writeFile(path, `${JSON.stringify(header, null, 2)}\n`, 'utf-8');
  return path;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  const command = args[0];
  if (!command || hasHelpFlag() || !['capture', 'diff', 'show'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const label = argValue(args, '--label', command === 'diff' ? 'diff-end' : 'run') as string;
  const out = argValue(args, '--out');
  const allowFile = argValue(args, '--allow-file');
  const allow = [
    ...(argValue(args, '--allow') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean),
    ...(allowFile ? allowFileEntries(readFileSync(resolve(PROJECT_ROOT, allowFile), 'utf-8')) : []),
  ];
  const baseline = command === 'diff' ? args[1] : null;
  if (command === 'diff' && (!baseline || baseline.startsWith('--'))) {
    console.log(USAGE);
    process.exit(1);
  }

  runCli(async (page) => {
    const header = await captureHeader(page, label);

    if (command === 'show') {
      console.log(JSON.stringify(header, null, 2));
      return;
    }

    if (command === 'capture') {
      const path = await writeHeader(header, label, out);
      console.log(JSON.stringify(header, null, 2));
      for (const warning of header.warnings ?? []) console.error(`WARNING: ${warning}`);
      console.log(`\nWrote ${path}`);
      return;
    }

    const { allow: parsedAllow, errors } = parseAllow(allow);
    if (errors.length) {
      // A malformed allowance used to over-permit. Refuse the run instead of quietly passing it.
      for (const error of errors) console.error(`ERROR: ${error}`);
      return { ok: false };
    }
    const previous = JSON.parse(await readFile(resolve(PROJECT_ROOT, baseline as string), 'utf-8'));
    const ownedChats = (argValue(args, '--owned') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const differences = diffHeaders(previous, header, parsedAllow, { strictProgress: args.includes('--strict-progress'), ownedChats, servedIdentity: args.includes('--served-identity') });
    const blocking = differences.filter((difference) => !difference.allowed);
    for (const difference of differences) console.log(describe(difference));
    for (const warning of header.warnings ?? []) console.error(`WARNING: ${warning}`);
    const path = await writeHeader(header, label, out);
    // An unreadable input is not a clean run: two captures that both failed to read the same field
    // compare equal, which is the "unknown accepted as evidence" failure this whole plan exists to
    // stop. `warnings` on either side fails the gate unless --allow-warnings is passed.
    const warned = [...new Set([...((previous as any).warnings ?? []), ...(header.warnings ?? [])])];
    const warningsBlock = warned.length > 0 && !args.includes('--allow-warnings');
    console.log(JSON.stringify({
      baseline,
      label,
      allow,
      differences: differences.length,
      progress: differences.filter((difference) => difference.progress).length,
      blocking: blocking.length,
      blockingPaths: blocking.map((difference) => difference.path),
      servedIdentity: differences.filter((difference) => difference.allowedBy?.startsWith(SERVED_ALLOWANCE)).map((difference) => difference.path),
      warnings: warned,
      wrote: path,
      ok: blocking.length === 0 && !warningsBlock,
    }, null, 2));
    return { ok: blocking.length === 0 && !warningsBlock };
  });
}
