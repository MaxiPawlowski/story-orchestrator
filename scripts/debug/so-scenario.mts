import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { STEP_MODIFIERS, validateFixture } from './lib/scenarioSchema.mts';
import { payloadFailures } from './lib/payloadAssert.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { removableStories, type LibraryCapture } from './lib/configRestore.mts';
import { readExtractionSettings, restoreExtractionSettings } from './lib/extractionSettings.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { adoptNewSandboxChat, assertInSandbox, beginSandboxSession, deleteSandboxChats, openGroup, openMostRecentGroupChat, readActiveChat, readChatOnDisk, reopenSandboxChat } from './st-navigation.mts';
import { deleteMessage, editMessage, executeSlashCommand, sendCompactMessage, sendUserMessage, swipeMessage, waitForIdle } from './st-actions.mts';
import { dumpCurrentChatState } from './so-state.mts';
import { answerWizardQuestions, applyWizardProvisioning, assertPlayerClean, closeCheckpointStudio, decideCuratorOp, getPipelineState, getStagecraftState, getWizardState, getMemoryQueueState, memoryQueueAction, openCheckpointStudio, openExtensionSettings, openStoryDrawer, openWizard, runWizardStage, saveStudioDraft, selectMemoryProfile, switchDrawerTab, switchStudioTab, takeAnnotatedScreenshot, hitTest } from './so-ui.mts';
import { leakCount, listMarkedAssets, removeMarkedAssets } from './so-assets.mts';

const USAGE = `Usage: node scripts/debug/so-scenario.mts run <file.json> [--sandbox] [--keep] [--group <id|name>]

--sandbox runs in a new chat of the most recent group, or of --group when given, and only ever stays on,
or deletes, chats the run created. Pin --group when the install has chats that are not yours: "most recent"
is whichever group was last active, which may be another session's.
Every step first checks the page is still on a sandbox chat and aborts ("sandbox escaped") if it is not.
Sandbox cleanup deletes the run's chats, then each memory-mirror book named for one of them
("Story Orchestrator - <title> - <owned chat id>"), and clears every storyOrchestratorDebug* response (also cleared at start).
A step that deliberately opens a new chat carries "adoptsNewChat": true next to its verb, e.g. {"eval": "...", "adoptsNewChat": true}.
"log": true (or a character budget) next to a verb prints its output after the ok line, so a run log shows what a
nondeterministic step actually got (e.g. which op kind the real curator proposed).

Step keys:
  import_story, seed_metadata, select_story, restart_story, studio_save, send, send_generate, slash, extract, expand, eval, copilot, ui, stagecraft, assets, reload, swipe, edit, delete, wait, expect, expect_ui,
  block_route ({pattern, status?} — fails the URL at the transport, so the page's fetch throws; a positive status answers instead), unblock_route ({pattern?} — every block when no pattern)

ui actions ({ui: {action, label?, note?}}):
  open-drawer, drawer-tab, open-settings, select-profile, open-studio, close-studio, studio-tab, studio-save, flag, screenshot,
  open-wizard, new-story-wizard, wizard-run ({stage?, message?}), wizard-answer ({answers?}), wizard-apply ({index?}), wizard-state,
  stagecraft ({minOps?, timeoutMs?} — waits for that many review cards), curator-accept ({index?, text?, pick?: 'text-first'}), curator-reject ({index?, pick?})

copilot actions ({copilot: {action, ...}}):
  stage ({draft, stage, message?, debug?, expect?: "questions"|"ok"} — throws if the outcome is not what expect says),
  provision ({op, debug?} — applies one provisioning op through the runtime; expectFail:true asserts create-only rejection),
  environment (the provisioning environment the wizard sees),
  suggest ({debug?}), report ({debug?}), nudge ({text}), clear-nudge, probe ({debug?}), advance ({id})

assets steps:
  {assets: {action: "list"|"expect"|"remove"|"assert-clean", marker?, characters?, groups?, lorebooks?}} —
  marker-scoped view of the ST assets a wizard run created; assert-clean is J9's leak assertion.

stagecraft steps ({stagecraft: {action, ...}}):
  curate ({reason?, debugResponse?, expectProposal?, expectOps?, attempts?} — runs one WI curator pass, real model unless debugResponse;
          expectOps retries the pass while every line was dropped, so an unparseable reply is a retry, not a fake failure),
  accept | reject ({id?} — decides every pending op of a proposal, newest by default),
  accept-op | reject-op ({id?, index?}), apply (writes accepted ops now, as a boundary would), state

expect verbs:
  storyId, storyIdentity ({id,playedVersion,libraryVersion,pinned,drifted}),
  storyVersion ({played,library,drifted}), hotSwap ({applied,classification,choice,boundaryAtLeast,dropped}),
  activeCheckpoint, activeCheckpointIn, blackboard, blackboardMissing, latched, auditCount>=, npcFired,
  expansion, tension, pacingPrompt, requirementsReady, convergence, reconciliationEvents>=,
  memory ({tier: {count, contains}}), sceneBreaks>=, memoryInjection ({tier: bool}),
  arcs ({open, resolved, summarized, openContains, resolvedContains}), canon ({present, contains}),
  epistemic ({count, contains:[{subject,tag,contains,hiddenFrom?}]}), ledger ({count, contains:[{entity,field,value}]}), capability (bool),
  copilot ({enabled, activeNudge, nudgeInjected}),
  background ("<file>" or {name, locked}),
  effectsLedger ({count, countAtLeast, unsupported, has:[{effect,status?,targetKind?,targetContains?,before?,after?,reasonContains?}], absent:[{effect,status?}]}),
  groupDisabled ({disabled:[name], enabled:[name], exact:[name]} — read from the OPEN GROUP, not our mirror),
  stagecraft ({proposals, proposalsAtLeast, applied, appliedAtLeast, opStatus:[...], scope:[...], dropped:[...], curatorEnabled, acceptMode, noError})

wait verbs:
  idle, schedulerIdle (+quietMs, default 3000 — every off-path queue empty for that long), boundary, auditCount, acceptedDelta, expansionStatus, checkpoint, checkpointNot, checkpointIn, progress (+progressAnchor), reconciliationEvents, talkDecisions, memoryEntries (+memoryTier), arcsSummarized, canonPresent, backfillComplete`;

function readArgFlag(name) {
  return process.argv.includes(name);
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

// T1: an unknown assertion key used to be ignored, so a typo asserted nothing and the step still
// reported ok. A fixture is checked against the closed vocabulary BEFORE it runs, so a typo is a
// load error naming the key instead of a check that quietly never fired.
export async function loadFixture(path) {
  const doc = await readJSON(path);
  const name = String(path).split(/[\\/]/).pop();
  const problems = validateFixture(doc, name);
  if (problems.length) {
    throw new Error(`This fixture would not test what it says:\n  - ${problems.join('\n  - ')}`);
  }
  return doc;
}

async function resolveStory(value, scenarioDir) {
  if (value?.file) return readJSON(resolve(scenarioDir, value.file));
  return value;
}

// Migration gates need a blob this build never wrote. The fixture is captured verbatim from a real
// chat (`test/fixtures/legacy-v2-chat-blob.json` carries its provenance), written into the sandbox
// chat as-is, and hydrated through the ordinary load path — no synthesizing from live state.
async function seedMetadata(page, spec, scenarioDir) {
  const raw = spec?.file ? await readJSON(resolve(scenarioDir, spec.file)) : spec?.blob;
  const blob = raw?.blob ?? raw;
  if (!blob || typeof blob !== 'object') throw new Error('seed_metadata needs {file} pointing at a chat-metadata fixture, or {blob}');
  return evaluateInST(page, async (seed) => {
    const ctx = SillyTavern.getContext();
    ctx.chatMetadata.story_orchestrator = JSON.parse(JSON.stringify(seed));
    await ctx.saveMetadata?.();
    await globalThis.storyOrchestratorRuntime.loadSelectedFromChat();
    const now = ctx.chatMetadata.story_orchestrator;
    return { version: now?.version ?? null, selectedStoryId: now?.selectedStoryId ?? now?.selectedStoryHash ?? null, keys: Object.keys(now?.stories ?? {}) };
  }, blob);
}

// The key a rejected DELTA line names. A rejection is asserted by quality, not by raw text, so a
// fixture says "entered_mines was refused for this reason" without pinning the model's formatting.
const deltaKey = (line) => (typeof line === 'string' ? /^\s*DELTA\s+(\S+)/.exec(line)?.[1] ?? null : null);

// The audit ring lives on the per-chat runtime record (`state.state.extraction` in the dump); the
// top-level `extraction` key is the compact view and carries counts only.
function lastAuditOf(state) {
  return state?.state?.extraction?.lastAudit ?? state?.extraction?.lastAudit ?? null;
}

function compactState(state) {
  const runtime = state?.state ?? null;
  const audit = lastAuditOf(state);
  return {
    chatId: state?.chatId ?? null,
    activeCheckpoint: runtime?.activeCheckpointId ?? null,
    boundary: runtime?.boundary ?? null,
    blackboard: runtime?.blackboard ?? {},
    latched: runtime?.latched ?? {},
    auditCount: runtime?.extraction?.auditCount ?? 0,
    expansion: state?.liveSnapshot?.expansion ?? runtime?.expansion ?? null,
    requirementsReady: runtime?.requirements?.ready ?? null,
    npcFired: runtime?.firedNpcReplies ?? {},
    tension: state?.liveSnapshot?.tension ?? runtime?.tension ?? null,
    pacingPrompt: state?.pacingPrompt ?? null,
    lastAudit: audit
      ? {
        accepted: audit.acceptedDeltas.map((entry) => entry.delta.q),
        rejected: audit.rejected.map((entry) => ({ q: deltaKey(entry.line), reason: entry.reason })),
      }
      : null,
    copilot: {
      enabled: state?.liveSnapshot?.copilot?.enabled ?? null,
      activeNudge: state?.activeNudge ?? null,
      nudgeInjected: Boolean((state?.copilotNudgePrompt as { value?: unknown } | null)?.value),
    },
  };
}

function compareSubset(actual, expected, path = '') {
  const failures = [];
  for (const [key, expectedValue] of Object.entries(expected ?? {})) {
    const actualValue = actual?.[key];
    const nextPath = path ? `${path}.${key}` : key;
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue) && typeof expectedValue['approx'] === 'number') {
      const approximate = expectedValue as { approx: number; tolerance?: number };
      const tolerance = typeof approximate.tolerance === 'number' ? approximate.tolerance : 0.000001;
      if (typeof actualValue !== 'number' || Math.abs(actualValue - approximate.approx) > tolerance) {
        failures.push(`${nextPath}: expected approx ${approximate.approx}, got ${JSON.stringify(actualValue)}`);
      }
    } else if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      failures.push(...compareSubset(actualValue, expectedValue, nextPath));
    } else if (actualValue !== expectedValue) {
      failures.push(`${nextPath}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
    }
  }
  return failures;
}

function evaluateExpect(state, expected) {
  const actual = compactState(state);
  const failures = [];
  // v2.3 plan 05: what a request that was actually sent contains, scoped to a region when the check
  // names one (a whole-body search passes on the shared transcript — the J5.8 false positive).
  if (expected.payloadContains || expected.payloadAbsent) {
    failures.push(...payloadFailures(state?.payloadEntries ?? [], { payloadContains: expected.payloadContains, payloadAbsent: expected.payloadAbsent }));
  }
  if (expected.storyIdentity) failures.push(...compareSubset(state?.liveSnapshot?.storyIdentity ?? {}, expected.storyIdentity, 'storyIdentity'));
  if (expected.storyId !== undefined && (state?.liveSnapshot?.storyId ?? null) !== expected.storyId) {
    failures.push(`storyId: expected ${expected.storyId}, got ${state?.liveSnapshot?.storyId ?? null}`);
  }
  if (expected.activeCheckpoint !== undefined && actual.activeCheckpoint !== expected.activeCheckpoint) {
    failures.push(`activeCheckpoint: expected ${expected.activeCheckpoint}, got ${actual.activeCheckpoint}`);
  }
  // Real-model runs can overshoot a checkpoint between polls; assert the set the story may be in.
  if (Array.isArray(expected.activeCheckpointIn) && !expected.activeCheckpointIn.includes(actual.activeCheckpoint)) {
    failures.push(`activeCheckpoint: expected one of ${expected.activeCheckpointIn.join(', ')}, got ${actual.activeCheckpoint}`);
  }
  // assertStoryVersion: what this chat plays versus what the library holds (plan 05).
  if (expected.storyVersion) {
    const identity = state?.liveSnapshot?.storyIdentity ?? {};
    const spec = expected.storyVersion as { played?: number; library?: number; drifted?: boolean };
    if (spec.played !== undefined && identity.playedVersion !== spec.played) failures.push(`storyVersion.played: expected ${spec.played}, got ${identity.playedVersion}`);
    if (spec.library !== undefined && identity.libraryVersion !== spec.library) failures.push(`storyVersion.library: expected ${spec.library}, got ${identity.libraryVersion}`);
    if (spec.drifted !== undefined && Boolean(identity.drifted) !== spec.drifted) failures.push(`storyVersion.drifted: expected ${spec.drifted}, got ${Boolean(identity.drifted)}`);
  }
  // assertHotSwap: the last library→chat update and what it cost the run.
  if (expected.hotSwap) {
    const update = state?.lastStoryUpdate ?? null;
    const spec = expected.hotSwap as { applied?: boolean; classification?: string; choice?: string; boundaryAtLeast?: number; dropped?: string[] };
    if (!update) failures.push('hotSwap: no story update recorded in this chat');
    else {
      if (spec.applied !== undefined && update.applied !== spec.applied) failures.push(`hotSwap.applied: expected ${spec.applied}, got ${update.applied} (${update.reason ?? 'no reason'})`);
      if (spec.classification !== undefined && update.classification !== spec.classification) failures.push(`hotSwap.classification: expected ${spec.classification}, got ${update.classification}`);
      if (spec.choice !== undefined && update.choice !== spec.choice) failures.push(`hotSwap.choice: expected ${spec.choice}, got ${update.choice}`);
      for (const key of spec.dropped ?? []) {
        if (!(update.dropped ?? []).includes(key)) failures.push(`hotSwap.dropped: expected ${key} to be dropped, got ${JSON.stringify(update.dropped)}`);
      }
    }
    if (spec.boundaryAtLeast !== undefined && (actual.boundary ?? 0) < spec.boundaryAtLeast) {
      failures.push(`hotSwap.boundaryAtLeast: expected the run to survive to boundary >= ${spec.boundaryAtLeast}, got ${actual.boundary}`);
    }
  }
  // R6's positive activation: the audit must show the candidate in what the model actually returned,
  // and the enforcement must be visible as a named rejection.
  if (Array.isArray(expected.auditRawContains)) {
    const audit = lastAuditOf(state);
    const raw = String(audit?.rawResponse ?? audit?.raw ?? '');
    if (!audit) failures.push('auditRawContains: no audit recorded in this chat');
    else {
      for (const needle of expected.auditRawContains) {
        if (!raw.includes(needle)) failures.push(`auditRawContains: "${needle}" is not in the audit's raw response (${raw.slice(0, 160)})`);
      }
    }
  }
  if (Array.isArray(expected.rejected)) {
    const audit = lastAuditOf(state);
    if (!audit) failures.push('rejected: no audit recorded in this chat');
    else {
      for (const want of expected.rejected) {
        const hit = (actual.lastAudit?.rejected ?? []).find((entry) => entry.q === want.q);
        if (!hit) failures.push(`rejected.${want.q}: not rejected — the audit refused ${JSON.stringify((actual.lastAudit?.rejected ?? []).map((entry) => entry.q))}`);
        else if (want.reason !== undefined && !String(hit.reason).includes(want.reason)) failures.push(`rejected.${want.q}: expected reason containing "${want.reason}", got "${hit.reason}"`);
      }
    }
  }
  if (Array.isArray(expected.accepted)) {
    const audit = lastAuditOf(state);
    if (!audit) failures.push('accepted: no audit recorded in this chat');
    else {
      for (const q of expected.accepted) {
        if (!(actual.lastAudit?.accepted ?? []).includes(q)) failures.push(`accepted.${q}: not accepted — the audit took ${JSON.stringify(actual.lastAudit?.accepted ?? [])}`);
      }
    }
  }
  if (expected.blackboard) failures.push(...compareSubset(actual.blackboard, expected.blackboard, 'blackboard'));
  if (Array.isArray(expected.blackboardMissing)) {
    for (const key of expected.blackboardMissing) {
      if (Object.prototype.hasOwnProperty.call(actual.blackboard, key)) failures.push(`blackboard.${key}: expected missing, got ${JSON.stringify(actual.blackboard[key])}`);
    }
  }
  if (Array.isArray(expected.latched)) {
    for (const key of expected.latched) {
      if (actual.latched[key] !== true) failures.push(`latched.${key}: expected true, got ${JSON.stringify(actual.latched[key])}`);
    }
  }
  if (expected['auditCount>='] !== undefined && actual.auditCount < expected['auditCount>=']) {
    failures.push(`auditCount: expected >= ${expected['auditCount>=']}, got ${actual.auditCount}`);
  }
  if (expected.npcFired) failures.push(...compareSubset(actual.npcFired, expected.npcFired, 'npcFired'));
  if (expected.expansion) failures.push(...compareSubset(actual.expansion, expected.expansion, 'expansion'));
  if (expected.tension) failures.push(...compareSubset(actual.tension, expected.tension, 'tension'));
  if (expected.pacingPrompt) failures.push(...compareSubset(actual.pacingPrompt, expected.pacingPrompt, 'pacingPrompt'));
  if (expected.requirementsReady !== undefined && actual.requirementsReady !== expected.requirementsReady) {
    failures.push(`requirementsReady: expected ${expected.requirementsReady}, got ${actual.requirementsReady}`);
  }
  if (expected.convergence) {
    const liveConvergence = state?.liveSnapshot?.convergence ?? [];
    for (const want of expected.convergence) {
      const found = liveConvergence.find((entry: any) => entry?.anchorId === want.anchorId);
      if (!found) { failures.push(`convergence.${want.anchorId}: not found`); continue; }
      if (want.progress !== undefined && found.progress !== want.progress) failures.push(`convergence.${want.anchorId}.progress: expected ${want.progress}, got ${found.progress}`);
      if (want.threshold !== undefined && found.threshold !== want.threshold) failures.push(`convergence.${want.anchorId}.threshold: expected ${want.threshold}, got ${found.threshold}`);
      if (want.reached !== undefined && found.reached !== want.reached) failures.push(`convergence.${want.anchorId}.reached: expected ${want.reached}, got ${found.reached}`);
    }
  }
  if (expected['reconciliationEvents>='] !== undefined) {
    const count = state?.liveSnapshot?.extraction?.reconciliationEvents?.length ?? state?.state?.extraction?.reconciliationEventCount ?? 0;
    if (count < expected['reconciliationEvents>=']) failures.push(`reconciliationEvents: expected >= ${expected['reconciliationEvents>=']}, got ${count}`);
  }
  if (expected.memory) {
    const entries = state?.liveSnapshot?.memory?.entries ?? [];
    for (const [tier, spec] of Object.entries(expected.memory) as Array<[string, { count?: number; contains?: string[]; validity?: string; source?: string }]>) {
      const tierEntries = entries.filter((entry: any) => entry?.tier === tier);
      if (spec.count !== undefined && tierEntries.length !== spec.count) failures.push(`memory.${tier}.count: expected ${spec.count}, got ${tierEntries.length}`);
      if (Array.isArray(spec.contains)) {
        for (const substring of spec.contains) {
          if (!tierEntries.some((entry: any) => typeof entry?.text === 'string' && entry.text.includes(substring))) {
            failures.push(`memory.${tier}.contains: expected an entry containing "${substring}"`);
          }
        }
      }
      // v2.3 plan 05: the ENVELOPE, not just the text. Quarantine does not delete a row — it changes
      // what the row's origin says and takes it out of every injection — so a check that only counts
      // or matches text can pass while the row is quarantined, and a check on text alone cannot tell
      // an extractor's claim from the author's. `validity`/`source` apply to the entries `contains`
      // selected, or to the whole tier when it named none.
      const scoped = Array.isArray(spec.contains) && spec.contains.length
        ? tierEntries.filter((entry: any) => spec.contains!.some((substring) => String(entry?.text ?? '').includes(substring)))
        : tierEntries;
      for (const [field, want] of [['validity', spec.validity], ['source', spec.source]] as Array<[string, string | undefined]>) {
        if (want === undefined) continue;
        for (const entry of scoped) {
          const actual = (entry as any)?.provenance?.[field] ?? null;
          if (actual !== want) {
            failures.push(`memory.${tier}.${field}: expected "${want}" for "${String((entry as any)?.text ?? '').slice(0, 60)}", got ${actual === null ? 'no envelope' : `"${actual}"`}`);
          }
        }
      }
    }
  }
  if (expected['sceneBreaks>='] !== undefined) {
    const sceneCount = state?.liveSnapshot?.memory?.sceneCount ?? 0;
    if (sceneCount < expected['sceneBreaks>=']) failures.push(`sceneBreaks: expected >= ${expected['sceneBreaks>=']}, got ${sceneCount}`);
  }
  if (expected.memoryInjection) {
    const prompts = state?.memoryPrompts ?? {};
    for (const [tier, want] of Object.entries(expected.memoryInjection) as Array<[string, boolean]>) {
      const present = Boolean((prompts as Record<string, { value?: unknown } | null>)?.[tier]?.value);
      if (present !== want) failures.push(`memoryInjection.${tier}: expected present=${want}, got ${present}`);
    }
  }
  if (expected.arcs) {
    const arcs = state?.liveSnapshot?.memory?.arcs ?? [];
    const open = arcs.filter((a: any) => a?.status === 'open');
    const resolved = arcs.filter((a: any) => a?.status === 'resolved');
    const spec = expected.arcs as { open?: number; resolved?: number; summarized?: number; openContains?: string[]; resolvedContains?: string[] };
    if (spec.open !== undefined && open.length !== spec.open) failures.push(`arcs.open: expected ${spec.open}, got ${open.length}`);
    if (spec.resolved !== undefined && resolved.length !== spec.resolved) failures.push(`arcs.resolved: expected ${spec.resolved}, got ${resolved.length}`);
    if (spec.summarized !== undefined) {
      const summarized = resolved.filter((a: any) => a?.summary).length;
      if (summarized !== spec.summarized) failures.push(`arcs.summarized: expected ${spec.summarized}, got ${summarized}`);
    }
    for (const substring of spec.openContains ?? []) {
      if (!open.some((a: any) => typeof a?.text === 'string' && a.text.includes(substring))) failures.push(`arcs.openContains: expected an open arc containing "${substring}"`);
    }
    for (const substring of spec.resolvedContains ?? []) {
      if (!resolved.some((a: any) => typeof a?.text === 'string' && a.text.includes(substring))) failures.push(`arcs.resolvedContains: expected a resolved arc containing "${substring}"`);
    }
  }
  if (expected.canon) {
    const canon = state?.liveSnapshot?.memory?.canon ?? null;
    const spec = expected.canon as { present?: boolean; contains?: string[] };
    if (spec.present !== undefined && Boolean(canon?.text) !== spec.present) failures.push(`canon.present: expected ${spec.present}, got ${Boolean(canon?.text)}`);
    for (const substring of spec.contains ?? []) {
      if (typeof canon?.text !== 'string' || !canon.text.includes(substring)) failures.push(`canon.contains: expected canon containing "${substring}"`);
    }
  }
  if (expected.epistemic) {
    const entries = (state?.liveSnapshot?.memory?.epistemic ?? []).filter((e: any) => !e?.supersededBy);
    const spec = expected.epistemic as { count?: number; contains?: Array<{ subject: string; tag: string; contains: string; hiddenFrom?: string }> };
    if (spec.count !== undefined && entries.length !== spec.count) failures.push(`epistemic.count: expected ${spec.count}, got ${entries.length}`);
    for (const want of spec.contains ?? []) {
      const hit = entries.some((e: any) => e?.tag === want.tag && String(e?.subject).toLowerCase() === want.subject.toLowerCase() && String(e?.content).includes(want.contains) && (want.hiddenFrom === undefined || String(e?.hiddenFrom ?? '').toLowerCase() === want.hiddenFrom.toLowerCase()));
      if (!hit) failures.push(`epistemic.contains: expected [${want.tag}] ${want.subject}${want.hiddenFrom ? ` from ${want.hiddenFrom}` : ''} containing "${want.contains}"`);
    }
  }
  if (expected.ledger) {
    const entries = state?.liveSnapshot?.memory?.ledger ?? [];
    const spec = expected.ledger as { count?: number; contains?: Array<{ entity: string; field: string; value: string }> };
    if (spec.count !== undefined && entries.length !== spec.count) failures.push(`ledger.count: expected ${spec.count}, got ${entries.length}`);
    for (const want of spec.contains ?? []) {
      const hit = entries.some((e: any) => String(e?.entity).toLowerCase() === want.entity.toLowerCase() && String(e?.field).toLowerCase() === want.field.toLowerCase() && String(e?.value).includes(want.value));
      if (!hit) failures.push(`ledger.contains: expected ${want.entity}.${want.field} containing "${want.value}"`);
    }
  }
  if (expected.capability !== undefined) {
    const cap = state?.liveSnapshot?.memory?.settings?.epistemicLedgerCapable;
    if (Boolean(cap) !== expected.capability) failures.push(`capability: expected ${expected.capability}, got ${Boolean(cap)}`);
  }
  // Deterministic stagecraft: the background the chat is actually showing, by filename.
  if (expected.background !== undefined) {
    const current = state?.background?.name ?? null;
    const wanted: { name?: string; locked?: boolean } = typeof expected.background === 'string' ? { name: expected.background } : expected.background;
    if (wanted.name !== undefined && current !== wanted.name) failures.push(`background: expected ${wanted.name}, got ${current}`);
    if (wanted.locked !== undefined && Boolean(state?.background?.locked) !== wanted.locked) failures.push(`background.locked: expected ${wanted.locked}, got ${Boolean(state?.background?.locked)}`);
  }
  // The curator: what it proposed, what got written, and what it may write at all.
  if (expected.stagecraft) {
    const live = state?.liveSnapshot?.stagecraft ?? null;
    const proposals = live?.proposals ?? [];
    const ops = proposals.flatMap((record: any) => record?.ops ?? []);
    const spec = expected.stagecraft as { proposals?: number; proposalsAtLeast?: number; opsAtLeast?: number; applied?: number; appliedAtLeast?: number; opStatus?: string[]; scope?: string[]; curatorEnabled?: boolean; acceptMode?: string; noError?: boolean; dropped?: string[] };
    if (!live) failures.push('stagecraft: no stagecraft slice in the snapshot');
    if (spec.opsAtLeast !== undefined && ops.length < spec.opsAtLeast) {
      failures.push(`stagecraft.ops: expected >= ${spec.opsAtLeast} reviewable op(s), got ${ops.length} (dropped: ${JSON.stringify(proposals.flatMap((record: any) => record?.dropped ?? []))})`);
    }
    if (spec.proposals !== undefined && proposals.length !== spec.proposals) failures.push(`stagecraft.proposals: expected ${spec.proposals}, got ${proposals.length}`);
    if (spec.proposalsAtLeast !== undefined && proposals.length < spec.proposalsAtLeast) failures.push(`stagecraft.proposals: expected >= ${spec.proposalsAtLeast}, got ${proposals.length}`);
    const applied = ops.filter((op: any) => op?.status === 'applied').length;
    if (spec.applied !== undefined && applied !== spec.applied) failures.push(`stagecraft.applied: expected ${spec.applied}, got ${applied}`);
    if (spec.appliedAtLeast !== undefined && applied < spec.appliedAtLeast) failures.push(`stagecraft.applied: expected >= ${spec.appliedAtLeast}, got ${applied}`);
    for (const status of spec.opStatus ?? []) {
      if (!ops.some((op: any) => op?.status === status)) failures.push(`stagecraft.opStatus: expected an op with status "${status}", got ${JSON.stringify(ops.map((op: any) => op?.status))}`);
    }
    for (const name of spec.scope ?? []) {
      if (!(state?.liveSnapshot?.stagecraftScope ?? []).includes(name)) failures.push(`stagecraft.scope: expected "${name}" in ${JSON.stringify(state?.liveSnapshot?.stagecraftScope ?? [])}`);
    }
    for (const needle of spec.dropped ?? []) {
      if (!proposals.some((record: any) => (record?.dropped ?? []).some((line: string) => line.includes(needle)))) failures.push(`stagecraft.dropped: expected a dropped line containing "${needle}"`);
    }
    if (spec.curatorEnabled !== undefined && Boolean(live?.settings?.curatorEnabled) !== spec.curatorEnabled) failures.push(`stagecraft.curatorEnabled: expected ${spec.curatorEnabled}, got ${Boolean(live?.settings?.curatorEnabled)}`);
    if (spec.acceptMode !== undefined && live?.settings?.acceptMode !== spec.acceptMode) failures.push(`stagecraft.acceptMode: expected ${spec.acceptMode}, got ${live?.settings?.acceptMode}`);
    if (spec.noError && live?.lastError) failures.push(`stagecraft.lastError: ${live.lastError}`);
  }
  // v2.3 plan 06: what this chat's effects did to host state it does not own. A `cast` switch is only
  // evidence of an owned effect if the row carries the value it REPLACED, so `before` is matched as a
  // subset rather than merely counted.
  if (expected.effectsLedger) {
    const effects = state?.liveSnapshot?.effects ?? null;
    const ledger = effects?.ledger ?? [];
    const spec = expected.effectsLedger as {
      count?: number; countAtLeast?: number; unsupported?: number;
      has?: Array<{ effect: string; status?: string; targetKind?: string; targetContains?: string; before?: Record<string, unknown>; after?: Record<string, unknown>; reasonContains?: string }>;
      absent?: Array<{ effect: string; status?: string }>;
    };
    if (!effects) failures.push('effectsLedger: no effects slice in the snapshot');
    if (spec.count !== undefined && ledger.length !== spec.count) failures.push(`effectsLedger.count: expected ${spec.count}, got ${ledger.length}`);
    if (spec.countAtLeast !== undefined && ledger.length < spec.countAtLeast) failures.push(`effectsLedger.count: expected >= ${spec.countAtLeast}, got ${ledger.length}`);
    const targetText = (row: any) => Object.values(row?.target ?? {}).filter((value) => typeof value === 'string').join(' ');
    for (const want of spec.has ?? []) {
      const matches = ledger.filter((row: any) => row?.effect === want.effect
        && (want.status === undefined || row?.status === want.status)
        && (want.targetKind === undefined || row?.target?.kind === want.targetKind)
        && (want.targetContains === undefined || targetText(row).includes(want.targetContains))
        && (want.reasonContains === undefined || String(row?.reason ?? '').includes(want.reasonContains)));
      if (!matches.length) {
        failures.push(`effectsLedger.has: no ${want.effect}${want.status ? ` (${want.status})` : ''}${want.targetContains ? ` for ${want.targetContains}` : ''} row — the ledger holds ${JSON.stringify(ledger.map((row: any) => [row?.effect, row?.status, targetText(row)]))}`);
        continue;
      }
      if (want.before !== undefined) {
        const withBefore = matches.filter((row: any) => compareSubset(row?.before ?? {}, want.before, 'before').length === 0);
        if (!withBefore.length) {
          failures.push(`effectsLedger.has: the ${want.effect} row does not record before=${JSON.stringify(want.before)} — it holds ${JSON.stringify(matches.map((row: any) => row?.before ?? null))}`);
        }
      }
      if (want.after !== undefined && !matches.some((row: any) => compareSubset(row?.after ?? {}, want.after, 'after').length === 0)) {
        failures.push(`effectsLedger.has: the ${want.effect} row does not record after=${JSON.stringify(want.after)} — it holds ${JSON.stringify(matches.map((row: any) => row?.after ?? null))}`);
      }
    }
    for (const want of spec.absent ?? []) {
      const hit = ledger.find((row: any) => row?.effect === want.effect && (want.status === undefined || row?.status === want.status));
      if (hit) failures.push(`effectsLedger.absent: expected no ${want.effect}${want.status ? ` (${want.status})` : ''} row, found ${JSON.stringify(hit)}`);
    }
    if (spec.unsupported !== undefined) {
      const unsupported = ledger.filter((row: any) => row?.status === 'failed' && /Text Completion|not supported|unsupported/i.test(String(row?.reason ?? ''))).length;
      if (unsupported !== spec.unsupported) failures.push(`effectsLedger.unsupported: expected ${spec.unsupported}, got ${unsupported}`);
    }
  }
  // v2.3 plan 06: the group's own `disabled_members`, which outlives the chat that wrote it. Named by
  // MEMBER, because that is how an author and a roster name one; a name the group does not hold is a
  // fixture error, not a pass (the resolution a `cast_changes` effect performs has to work too).
  if (expected.groupDisabled) {
    const group = state?.group ?? null;
    const spec = expected.groupDisabled as { disabled?: string[]; enabled?: string[]; exact?: string[] };
    if (!group) failures.push('groupDisabled: no group is open, so there is no disabled_members to read');
    else {
      const disabled: string[] = group.disabledMembers ?? [];
      const avatarFor = (name: string): string | null => {
        const wanted = name.trim().toLowerCase();
        const hit = (group.members ?? []).find((member: any) => String(member?.name ?? '').toLowerCase() === wanted || String(member?.avatar ?? '').toLowerCase() === wanted || String(member?.avatar ?? '').replace(/\.[a-z0-9]+$/i, '').toLowerCase() === wanted);
        return hit?.avatar ?? null;
      };
      for (const [names, want] of [[spec.disabled ?? [], true], [spec.enabled ?? [], false]] as Array<[string[], boolean]>) {
        for (const name of names) {
          const avatar = avatarFor(name);
          if (!avatar) { failures.push(`groupDisabled: "${name}" is not a member of ${group.name ?? group.id} — ${JSON.stringify((group.members ?? []).map((member: any) => member?.name ?? member?.avatar))}`); continue; }
          if (disabled.includes(avatar) !== want) failures.push(`groupDisabled.${name}: expected ${want ? 'disabled' : 'enabled'}, got ${!want ? 'disabled' : 'enabled'} (disabled_members: ${JSON.stringify(disabled)})`);
        }
      }
      if (Array.isArray(spec.exact)) {
        const wanted = new Set(spec.exact.map((name) => avatarFor(name)).filter((avatar): avatar is string => Boolean(avatar)));
        const extra = disabled.filter((avatar) => !wanted.has(avatar));
        const missing = [...wanted].filter((avatar) => !disabled.includes(avatar));
        if (extra.length || missing.length) failures.push(`groupDisabled.exact: expected exactly ${JSON.stringify([...wanted])}, got ${JSON.stringify(disabled)} (extra: ${JSON.stringify(extra)}, missing: ${JSON.stringify(missing)})`);
      }
    }
  }
  if (expected.copilot) {
    const spec = expected.copilot as { enabled?: boolean; activeNudge?: string | null; nudgeInjected?: boolean };
    if (spec.enabled !== undefined && actual.copilot.enabled !== spec.enabled) failures.push(`copilot.enabled: expected ${spec.enabled}, got ${actual.copilot.enabled}`);
    if (spec.activeNudge !== undefined && actual.copilot.activeNudge !== spec.activeNudge) failures.push(`copilot.activeNudge: expected ${JSON.stringify(spec.activeNudge)}, got ${JSON.stringify(actual.copilot.activeNudge)}`);
    if (spec.nudgeInjected !== undefined && actual.copilot.nudgeInjected !== spec.nudgeInjected) failures.push(`copilot.nudgeInjected: expected ${spec.nudgeInjected}, got ${actual.copilot.nudgeInjected}`);
  }
  return { ok: failures.length === 0, failures, actual };
}

// Off-path passes (P1 reads, P2 scene/short-term/epistemic, P4 curator/consolidation) keep landing
// after the chat goes idle, and one pass can queue the next: a check that measures "nothing else
// changed" has to start once the scheduler has stayed empty for a while, not the instant it is.
async function waitForSchedulerIdle(page, timeoutMs, quietMs) {
  const deadline = Date.now() + timeoutMs;
  let quietSince = null;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime?.getSnapshot?.().extraction?.scheduler ?? null);
    const busy = !last || last.inFlight || last.queueDepth > 0 || last.heavyInFlight || (last.heavyQueueDepth ?? 0) > 0;
    if (busy) quietSince = null;
    else if (quietSince === null) quietSince = Date.now();
    else if (Date.now() - quietSince >= quietMs) return { scheduler: last, quietMs };
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for the extraction scheduler to drain: ${JSON.stringify(last)}`);
}

async function waitForCondition(page, spec) {
  const timeout = spec.timeoutMs ?? 10000;
  const deadline = Date.now() + timeout;
  let last = null;
  if (spec.schedulerIdle) return waitForSchedulerIdle(page, timeout, spec.quietMs ?? 3000);
  while (Date.now() < deadline) {
    if (spec.idle) return waitForIdle(page, timeout);
    last = await dumpCurrentChatState(page);
    const runtime = last?.state;
    if (spec.boundary !== undefined && runtime?.boundary >= spec.boundary) return last;
    if (spec.auditCount !== undefined && (runtime?.extraction?.auditCount ?? 0) >= spec.auditCount) return last;
    if (spec.acceptedDelta !== undefined) {
      const audits = last?.liveSnapshot?.extraction?.audits ?? [];
      if (audits.some((audit: any) => (audit?.acceptedDeltas ?? []).some((entry: any) => entry?.delta?.q === spec.acceptedDelta))) return last;
    }
    if (spec.expansionStatus !== undefined) {
      const entries = Object.values(last?.liveSnapshot?.expansion?.entries ?? runtime?.expansion?.entries ?? {});
      if (entries.some((entry: any) => entry?.status === spec.expansionStatus)) return last;
    }
    if (spec.checkpoint !== undefined && runtime?.activeCheckpointId === spec.checkpoint) return last;
    if (spec.checkpointNot !== undefined && runtime?.activeCheckpointId && runtime.activeCheckpointId !== spec.checkpointNot) return last;
    if (Array.isArray(spec.checkpointIn) && spec.checkpointIn.includes(runtime?.activeCheckpointId)) return last;
    if (spec.progress !== undefined) {
      const anchor = spec.progressAnchor;
      const convergence = last?.liveSnapshot?.convergence ?? [];
      const entry = anchor ? convergence.find((item: any) => item?.anchorId === anchor) : convergence[0];
      const progress = entry?.progress ?? 0;
      if (progress >= spec.progress) return last;
    }
    if (spec.reconciliationEvidence !== undefined && spec.reconciliationEvidence) {
      const events = last?.liveSnapshot?.extraction?.reconciliationEvents ?? [];
      if (events.some((event: any) => Array.isArray(event?.evidence) && event.evidence.length > 0)) return last;
    }
    if (spec.reconciliationEvents !== undefined) {
      const events = last?.liveSnapshot?.extraction?.reconciliationEvents ?? [];
      if (events.length >= spec.reconciliationEvents) return last;
    }
    if (spec.talkDecisions !== undefined) {
      const decisions = last?.liveSnapshot?.talk?.decisions ?? [];
      if (decisions.length >= spec.talkDecisions) return last;
    }
    if (spec.memoryEntries !== undefined) {
      const entries = last?.liveSnapshot?.memory?.entries ?? [];
      const tier = spec.memoryTier;
      const count = tier ? entries.filter((entry: any) => entry?.tier === tier).length : entries.length;
      if (count >= spec.memoryEntries) return last;
    }
    if (spec.arcsSummarized !== undefined) {
      const arcs = last?.liveSnapshot?.memory?.arcs ?? [];
      if (arcs.filter((arc: any) => arc?.status === 'resolved' && arc?.summary).length >= spec.arcsSummarized) return last;
    }
    if (spec.canonPresent !== undefined && spec.canonPresent) {
      if (last?.liveSnapshot?.memory?.canon?.text) return last;
    }
    if (spec.backfillComplete !== undefined && spec.backfillComplete) {
      const backfill = last?.liveSnapshot?.memory?.backfill;
      if (backfill && !backfill.running && backfill.processed === backfill.total) return last;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(spec)}. Last state: ${JSON.stringify(compactState(last))}`);
}

async function importStory(page, rawStory) {
  await page.waitForFunction(() => Boolean(globalThis.storyOrchestratorRuntime), null, { timeout: 10000 });
  return evaluateInST(page, async (story) => {
    const ok = await globalThis.storyOrchestratorRuntime.importStory(JSON.stringify(story));
    return { ok, snapshot: globalThis.storyOrchestratorRuntime.getSnapshot() };
  }, rawStory);
}

async function selectStory(page, selector) {
  return evaluateInST(page, async (selector) => {
    const runtime = globalThis.storyOrchestratorRuntime;
    const library = runtime.getSnapshot().library ?? [];
    const record = library.find((entry) => entry.id === selector || entry.hash === selector || entry.title === selector);
    const target = record?.id ?? selector;
    const ok = await runtime.selectStory(target);
    if (!ok) throw new Error(`Story not found: ${selector}`);
    const snapshot = runtime.getSnapshot();
    return { ok, id: snapshot.storyId, title: snapshot.storyTitle, identity: snapshot.storyIdentity };
  }, selector);
}

// Restart asks for confirmation, so the step answers the popup the way the verb's argument says
// ({restart_story: true} confirms, false cancels) instead of hanging on an unattended dialog.
async function restartStory(page, spec) {
  const confirm = spec !== false;
  const pending = evaluateInST(page, async () => {
    const ok = await globalThis.storyOrchestratorRuntime.restartStory();
    return { ok, activeCheckpointId: globalThis.storyOrchestratorRuntime.getSnapshot().activeCheckpointId };
  });
  const button = page.locator(confirm ? 'dialog[open] .popup-button-ok' : 'dialog[open] .popup-button-cancel');
  await button.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  await button.click().catch(() => undefined);
  return pending;
}

async function extract(page, spec) {
  const debugResponse = typeof spec === 'string' ? spec : spec?.debugResponse;
  const reason = typeof spec === 'object' && spec?.reason ? spec.reason : 'scenario';
  return evaluateInST(page, async ({ debugResponse, reason }) => {
    const runtime = globalThis.storyOrchestratorRuntime;
    const before = runtime.getEngineState?.() ?? null;
    const ok = await runtime.runExtractionNow(debugResponse, reason);
    const after = runtime.getEngineState?.() ?? null;
    return { ok, before: before ? { boundary: before.boundary, lastMessageId: before.lastMessageId } : null, after: after ? { boundary: after.boundary, lastMessageId: after.lastMessageId } : null, snapshot: runtime.getSnapshot() };
  }, { debugResponse, reason });
}

async function expand(page, spec) {
  const debugResponse = typeof spec === 'string' ? spec : spec?.debugResponse;
  return evaluateInST(page, async (debugResponse) => {
    const ok = await globalThis.storyOrchestratorRuntime.runExpansionNow(debugResponse);
    return { ok, snapshot: globalThis.storyOrchestratorRuntime.getSnapshot() };
  }, debugResponse);
}

async function evalStep(page, code) {
  return evaluateInST(page, (code) => {
    const fn = new Function(`return (async () => { ${code} })();`);
    return fn();
  }, code);
}

// v2.3 plan 06's blocked-save check. The block lives at the TRANSPORT (Playwright's route handler is
// applied below every wrapper in the page), because a page-side patch would sit either above or below
// the save watcher depending on which installed first — and above it, the watcher never sees the
// failure and reports a save that was never attempted (measured on the CDP-attached page, 2026-09-22).
const blockedRoutes = new Map<string, string>();

async function blockRoute(page, spec) {
  const pattern = typeof spec === 'string' ? spec : spec?.pattern;
  if (typeof pattern !== 'string' || !pattern.trim()) throw new Error('block_route needs a URL pattern (a glob, e.g. "**/api/chats/save")');
  const status = typeof spec === 'object' && typeof spec?.status === 'number' && spec.status > 0 ? spec.status : null;
  if (blockedRoutes.has(pattern)) await page.unroute(pattern).catch(() => undefined);
  await page.route(pattern, async (route) => {
    if (status) await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { message: `blocked by the harness (${pattern})` } }) });
    else await route.abort('failed');
  });
  const mode = status ? `answers ${status}` : 'aborted';
  blockedRoutes.set(pattern, mode);
  return { pattern, mode, blocked: [...blockedRoutes.keys()] };
}

async function unblockRoute(page, spec) {
  const pattern = typeof spec === 'string' ? spec : spec?.pattern ?? null;
  const patterns = pattern ? [pattern] : [...blockedRoutes.keys()];
  if (!patterns.length) throw new Error('unblock_route: nothing is blocked, so this would prove nothing');
  for (const entry of patterns) {
    await page.unroute(entry).catch(() => undefined);
    blockedRoutes.delete(entry);
  }
  return { unblocked: patterns, stillBlocked: [...blockedRoutes.keys()] };
}

/** Release every block, whatever the run did. A blocked save endpoint left behind would fail every
 *  later run's persistence in silence, so both runners call this in their `finally`. */
export async function releaseBlockedRoutes(page) {
  if (!blockedRoutes.size) return null;
  return await unblockRoute(page, null).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
}

async function copilotStep(page, spec) {
  return evaluateInST(page, async (spec) => {
    const runtime = globalThis.storyOrchestratorRuntime;
    if (!runtime) throw new Error('storyOrchestratorRuntime not ready');
    const action = spec?.action;
    if (action === 'stage') {
      const result = await runtime.runCopilotStage({ draft: spec.draft, stage: spec.stage, message: spec.message ?? '', history: spec.history ?? [], environment: spec.environment }, spec.debug);
      const wanted = spec.expect ?? 'ok';
      if (result.status !== wanted) throw new Error(`copilot stage returned "${result.status}", expected "${wanted}": ${result.issues.join('; ') || result.questions.map((q) => q.text).join(' | ')}`);
      return { status: result.status, proposal: result.proposal, questions: result.questions, diagnostics: result.preview.diagnostics.length };
    }
    // Provisioning goes through the runtime, so create-only validation is exercised where it lives.
    if (action === 'provision') {
      const outcome = await runtime.applyProvisioning(spec.op, spec.draft);
      if (spec.expectFail && outcome.ok) throw new Error(`provisioning was expected to be rejected but succeeded: ${outcome.message}`);
      if (!spec.expectFail && !outcome.ok) throw new Error(`provisioning failed: ${outcome.message}`);
      if (spec.messageContains && !String(outcome.message).includes(spec.messageContains)) throw new Error(`provisioning message "${outcome.message}" does not contain "${spec.messageContains}"`);
      return outcome;
    }
    if (action === 'environment') return runtime.getProvisioningEnvironment(spec.draft);
    if (action === 'suggest') return { suggestions: await runtime.runCopilotSuggest(spec.debug) };
    if (action === 'report') return { report: await runtime.runCopilotReport(spec.debug) };
    if (action === 'nudge') { runtime.setCopilotNudge(spec.text ?? '', spec.depth ?? 1); return { activeNudge: runtime.getActiveNudge() }; }
    if (action === 'clear-nudge') { runtime.clearCopilotNudge(); return { activeNudge: runtime.getActiveNudge() }; }
    if (action === 'probe') { const ok = await runtime.runExtractionNow(spec.debug, 'probe'); return { ok }; }
    if (action === 'advance') { const ok = await runtime.activateCheckpoint(spec.id); return { ok, activeCheckpointId: runtime.getSnapshot().activeCheckpointId }; }
    throw new Error(`Unknown copilot action: ${action}`);
  }, spec);
}

// Reload the ST page and wait for the extension to come back up: the honest way to test
// hydration, migration and "return after a gap" paths.
async function reloadStep(page, spec, guard = null) {
  const timeout = (typeof spec === 'object' && spec?.timeoutMs) || 60000;
  await page.reload({ waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => Boolean(globalThis.storyOrchestratorRuntime), null, { timeout });
  await page.waitForTimeout(1500);
  // ST comes back on the welcome screen, so reopening the chat is part of "returning to it".
  const reopen = spec?.reopenChat !== false;
  const chatId = await evaluateInST(page, () => SillyTavern.getContext().chatId ?? null);
  if (!chatId && reopen) {
    if (guard) await reopenSandboxChat(page, guard);
    else await openMostRecentGroupChat(page);
  }
  await page.waitForTimeout(1500);
  return evaluateInST(page, () => ({ chatId: SillyTavern.getContext().chatId ?? null, ready: globalThis.storyOrchestratorRuntime?.getSnapshot?.().ready ?? false }));
}

async function uiStep(page, spec) {
  const action = typeof spec === 'string' ? spec : spec?.action;
  const label = typeof spec === 'object' ? spec?.label : undefined;
  if (action === 'open-drawer') return openStoryDrawer(page);
  if (action === 'drawer-tab') return switchDrawerTab(page, label);
  if (action === 'open-settings') return openExtensionSettings(page);
  if (action === 'select-profile') return selectMemoryProfile(page, label);
  if (action === 'open-studio') return openCheckpointStudio(page);
  if (action === 'close-studio') return closeCheckpointStudio(page);
  if (action === 'studio-tab') return switchStudioTab(page, label);
  if (action === 'studio-save') return saveStudioDraft(page, (typeof spec === 'object' ? spec?.choice : null) ?? null);
  if (action === 'open-wizard') return openWizard(page);
  if (action === 'new-story-wizard') return openWizard(page, { newStory: true, title: spec?.title ?? null });
  if (action === 'wizard-state') return getWizardState(page);
  if (action === 'wizard-run') return runWizardStage(page, { stage: spec?.stage ?? null, message: spec?.message ?? '', timeoutMs: spec?.timeoutMs });
  if (action === 'wizard-answer') return answerWizardQuestions(page, spec?.answers ?? null, { timeoutMs: spec?.timeoutMs });
  if (action === 'wizard-apply') return applyWizardProvisioning(page, spec?.index ?? 0, { timeoutMs: spec?.timeoutMs });
  if (action === 'stagecraft') return getStagecraftState(page, { minOps: spec?.minOps ?? 0, timeoutMs: spec?.timeoutMs });
  if (action === 'curator-accept') return decideCuratorOp(page, 'accept', { index: spec?.index ?? 0, text: spec?.text ?? null, pick: spec?.pick ?? null, timeoutMs: spec?.timeoutMs });
  if (action === 'curator-reject') return decideCuratorOp(page, 'reject', { index: spec?.index ?? 0, pick: spec?.pick ?? null, timeoutMs: spec?.timeoutMs });
  if (action === 'memory-queue') return spec?.op ? memoryQueueAction(page, { action: spec.op, key: spec.key ?? null, side: spec.side ?? 0, index: spec.index ?? 0 }) : getMemoryQueueState(page);
  if (action === 'screenshot') return takeAnnotatedScreenshot(page, label ?? 'so-scenario');
  if (action === 'pipeline') return getPipelineState(page);
  // §H: a scripted `.click()` fires whether or not the element is on top, so a control can be
  // unreachable to a real pointer while every journey that drives it passes.
  if (action === 'hit-test') {
    const result = await hitTest(page, spec?.selector ?? label);
    if (!result.clickable) throw new Error(`${result.selector} is not clickable by a pointer: ${result.reason}`);
    return result;
  }
  if (action === 'assert-player-clean') {
    const result = await assertPlayerClean(page);
    if (!result.ok) throw new Error(`player surface leaks: ${result.findings.map((finding) => `${finding.tab}:${finding.needle}`).join(', ')}`);
    return result;
  }
  if (action === 'flag') {
    await openStoryDrawer(page);
    const button = page.locator('#so-flag-moment');
    if (!(await button.count())) throw new Error('Flag control (#so-flag-moment) not found in the drawer.');
    await button.click();
    const note = typeof spec === 'object' ? spec?.note ?? '' : '';
    if (note) await page.locator('#so-flag-note').fill(note);
    await page.locator('#so-flag-submit').click();
    return { flagged: true, note };
  }
  throw new Error(`Unknown ui action: ${action}`);
}

// The stagecraft side (plan 07): drive one curator pass, review it the way an author does, and let a
// boundary write it. `curate` is a real model call unless a debugResponse is supplied.
async function stagecraftStep(page, spec) {
  const action = typeof spec === 'string' ? spec : spec?.action ?? 'state';
  if (action === 'accept' || action === 'reject' || action === 'accept-op' || action === 'reject-op') {
    return evaluateInST(page, async ({ action, id, index }) => {
      const runtime = globalThis.storyOrchestratorRuntime;
      const proposals = runtime.getStagecraftState().proposals ?? [];
      const target = id ? proposals.find((record) => record.id === id) : proposals[proposals.length - 1];
      if (!target) throw new Error('no curator proposal to decide on');
      const status = action.startsWith('accept') ? 'accepted' : 'rejected';
      if (action.endsWith('-op')) await runtime.setCuratorOpDecision(target.id, index ?? 0, status);
      else await runtime.decideCuratorProposal(target.id, status);
      return { id: target.id, ops: runtime.getStagecraftState().proposals.find((record) => record.id === target.id)?.ops.map((entry) => entry.status) };
    }, { action, id: spec?.id ?? null, index: spec?.index ?? 0 });
  }
  if (action === 'apply') {
    return evaluateInST(page, async () => ({ applied: await globalThis.storyOrchestratorRuntime.applyCuratorProposals() }));
  }
  if (action === 'curate') {
    // A small model formats a line unparseably now and then: the pass runs, every line is dropped and
    // the proposal carries no reviewable op. That is scheduler-retry territory, not a mock — so ask
    // again up to `attempts` times when the caller says it needs ops (`expectOps`).
    const attempts = Math.max(1, spec?.attempts ?? (spec?.expectOps ? 3 : 1));
    let last = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      last = await curatePass(page, spec);
      const opCount = (last?.record?.ops ?? []).length;
      if (!spec?.expectOps || opCount >= (typeof spec.expectOps === 'number' ? spec.expectOps : 1)) return last;
    }
    const pass = last?.state?.lastPass ?? null;
    throw new Error(`the curator produced no reviewable op in ${attempts} pass(es) (dropped: ${JSON.stringify(pass?.dropped ?? [])}) — raw response: ${JSON.stringify(String(pass?.rawResponse ?? '').slice(0, 600))}`);
  }
  return evaluateInST(page, () => ({
    settings: globalThis.storyOrchestratorRuntime.getStagecraftState().settings,
    scope: globalThis.storyOrchestratorRuntime.getSnapshot().stagecraftScope,
    proposals: globalThis.storyOrchestratorRuntime.getStagecraftState().proposals,
  }));
}

// One curator pass. A boundary may already have a P4 pass in flight: forcing another one is refused,
// and treating that refusal as "the curator proposed nothing" blamed the model for a call that was
// never made (plan 07 live finding) — so wait for the running pass and report *its* result. A pass
// writes lastPass before it finishes saving, so `before` can already be the running pass's own
// audit: while waiting, ask again too, and once the other pass is done ours runs for real.
async function curatePass(page, spec) {
  const before = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime.getStagecraftState().lastPass?.at ?? null);
  const run = () => evaluateInST(page, async ({ debugResponse, reason }) => {
    const outcome = await globalThis.storyOrchestratorRuntime.runWiCuratorPass(reason ?? 'scenario', debugResponse ?? undefined);
    return { ...outcome, proposed: Boolean(outcome.record), state: globalThis.storyOrchestratorRuntime.getStagecraftState() };
  }, { debugResponse: spec?.debugResponse ?? null, reason: spec?.reason ?? null });
  let result = await run();
  if (result?.skipped === 'in-flight') {
    const deadline = Date.now() + (spec?.timeoutMs ?? 120000);
    while (Date.now() < deadline && result?.skipped === 'in-flight') {
      await page.waitForTimeout(1000);
      const state = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime.getStagecraftState());
      if ((state?.lastPass?.at ?? null) !== before) {
        const record = (state.proposals ?? []).slice(-1)[0] ?? null;
        result = { ran: true, observed: true, record: state.lastPass?.proposed ? record : null, proposed: Boolean(state.lastPass?.proposed), state };
        break;
      }
      result = await run();
    }
  }
  if (spec?.expectProposal && !result?.proposed) {
    const pass = result?.state?.lastPass ?? null;
    throw new Error(`the curator proposed nothing (ran: ${result?.ran}, skipped: ${result?.skipped ?? 'none'}, error: ${JSON.stringify(result?.state?.lastError ?? null)}, dropped: ${JSON.stringify(pass?.dropped ?? [])}) — raw response: ${JSON.stringify(String(pass?.rawResponse ?? '').slice(0, 600))}`);
  }
  return result;
}

// The wizard writes to the user's real install, so a journey that creates assets must be able to
// prove it cleaned up after itself. Only marker-prefixed assets and test-session ledgers are ever in
// scope; a journey passes the baseline it took at start so its own ledger entries count too.
async function assetsStep(page, spec, baseline = null) {
  const action = typeof spec === 'string' ? spec : spec?.action ?? 'list';
  const marker = (typeof spec === 'object' ? spec?.marker : null) ?? undefined;
  if (action === 'remove') {
    const result = await removeMarkedAssets(page, marker, { baseline });
    if (!result.clean) throw new Error(`assets leaked after cleanup: ${JSON.stringify(result.leaked)}`);
    return result;
  }
  const found = await listMarkedAssets(page, marker, { baseline });
  if (action === 'assert-clean' && leakCount(found) > 0) {
    throw new Error(`assets leaked: ${JSON.stringify(found)}`);
  }
  if (action === 'expect' && typeof spec === 'object') {
    for (const name of spec.characters ?? []) if (!found.characters.some((entry) => entry.name === name)) throw new Error(`expected a character named "${name}"`);
    for (const name of spec.groups ?? []) if (!found.groups.some((entry) => entry.name === name)) throw new Error(`expected a group named "${name}"`);
    for (const name of spec.lorebooks ?? []) if (!found.lorebooks.includes(name)) throw new Error(`expected a lorebook named "${name}"`);
    // Counts, not names: the model chooses the names, so proving the host seam really wrote is what
    // matters. `assets: {action: "list"}` in the artifact records exactly what it created.
    const atLeast = (kind: string, actual: number, wanted: unknown) => {
      if (typeof wanted === 'number' && actual < wanted) throw new Error(`expected at least ${wanted} created ${kind}, got ${actual}: ${JSON.stringify(found)}`);
    };
    atLeast('characters', found.characters.length, spec.minCharacters);
    atLeast('groups', found.groups.length, spec.minGroups);
    atLeast('lorebooks', found.lorebooks.length, spec.minLorebooks);
  }
  return found;
}

async function readUiText(page, selector) {
  return evaluateInST(page, (target) => {
    const node = document.querySelector(target);
    return node ? (node as HTMLElement).innerText ?? node.textContent ?? '' : null;
  }, selector);
}

async function evaluateExpectUi(page, spec) {
  const selector = spec.selector ?? '#drawer-manager';
  // UI assertions retry: React re-renders and ST popups land a beat after the state they reflect.
  const deadline = Date.now() + (spec.timeoutMs ?? 5000);
  let text = await readUiText(page, selector);
  while (Date.now() < deadline) {
    const failing = uiFailures(selector, text, spec);
    if (!failing.length) break;
    await page.waitForTimeout(500);
    text = await readUiText(page, selector);
  }
  const failures = uiFailures(selector, text, spec);
  return { ok: failures.length === 0, failures, actual: { selector, length: (text ?? '').length } };
}

function uiFailures(selector, text, spec) {
  const failures = [];
  if (text === null) failures.push(`${selector}: not present in the DOM`);
  for (const needle of spec.contains ?? []) {
    if (!(text ?? '').includes(needle)) failures.push(`${selector}: expected to contain "${needle}"`);
  }
  for (const needle of spec.notContains ?? []) {
    if ((text ?? '').includes(needle)) failures.push(`${selector}: expected NOT to contain "${needle}"`);
  }
  return failures;
}

// S6: an unreadable library is `trusted: false`, never an empty one.
async function libraryHashes(page): Promise<LibraryCapture> {
  return evaluateInST(page, () => {
    const settings = SillyTavern.getContext().extensionSettings;
    if (!settings || typeof settings !== 'object') return { trusted: false, hashes: [] };
    const records = settings['story-orchestrator']?.v2Stories;
    return { trusted: true, hashes: Array.isArray(records) ? records.map((record) => record.hash).filter(Boolean) : [] };
  });
}

// `storyOrchestratorDebug*` responses stand in for the model until the page reloads, so one run's
// mock answered the next run's first real pass (plan07-memory, second run) and would answer a real
// player's in the shared browser. A sandbox run starts and ends without any.
async function clearDebugResponses(page) {
  return evaluateInST(page, () => {
    const keys = Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'));
    for (const key of keys) delete globalThis[key];
    return keys;
  });
}

// The memory mirror files each chat's memory in its own book, `Story Orchestrator - <title> - <chatId>`
// (src/runtime/memoryMirror.ts), which outlives the chat. The guard remembers every story a sandbox
// played and every book the runtime recorded, so cleanup can name the books the run's chats own.
async function recordSandboxStory(page, guard) {
  const seen = await evaluateInST(page, () => {
    const snapshot = globalThis.storyOrchestratorRuntime?.getSnapshot?.();
    return { title: snapshot?.storyTitle ?? null, book: snapshot?.memory?.wiBook ?? null };
  }).catch(() => null);
  if (seen?.title && !guard.storyTitles.includes(seen.title)) guard.storyTitles.push(seen.title);
  const book = seen?.book;
  if (book?.name && guard.owned.includes(book.chatId) && !guard.mirrorBooks.some((entry) => entry.name === book.name)) {
    guard.mirrorBooks.push({ name: book.name, chatId: book.chatId });
  }
}

// Runs after the chats are gone, so no pass of theirs can re-create a book behind it. Only a listed
// book whose name ends in ` - <owned chat id>` is ever deleted; names compare as the server files
// them (sanitized, case-insensitive), the way `stHost/worldInfo.ts` resolves them.
async function deleteSandboxMirrorBooks(page, guard) {
  return evaluateInST(page, async ({ owned, titles, books }) => {
    const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as {
      updateWorldInfoList: () => Promise<void>;
      deleteWorldInfo: (name: string) => Promise<boolean>;
    };
    const illegal = new Set([...'/?<>\\:*|"']);
    const control = (char: string) => char.charCodeAt(0) <= 0x1f || (char.charCodeAt(0) >= 0x80 && char.charCodeAt(0) <= 0x9f);
    const fileId = (name: string) => [...name.trim()].filter((char) => !illegal.has(char) && !control(char)).join('').toLowerCase();
    const owners = new Map<string, string>();
    for (const chatId of owned) for (const title of titles) owners.set(fileId(`Story Orchestrator - ${title} - ${chatId}`), chatId);
    for (const book of books) if (owned.includes(book.chatId)) owners.set(fileId(book.name), book.chatId);
    const ownedBook = (name: string) => {
      const id = fileId(name);
      const chatId = owners.get(id);
      return Boolean(chatId) && id.startsWith('story orchestrator - ') && id.endsWith(` - ${fileId(chatId)}`);
    };
    await wi.updateWorldInfoList();
    const deleted = [];
    const failed = [];
    for (const name of SillyTavern.getContext().getWorldInfoNames().filter(ownedBook)) (await wi.deleteWorldInfo(name) ? deleted : failed).push(name);
    await wi.updateWorldInfoList();
    return { deleted, failed, leaked: SillyTavern.getContext().getWorldInfoNames().filter(ownedBook) };
  }, { owned: [...guard.owned], titles: [...guard.storyTitles], books: [...guard.mirrorBooks] });
}

// Only stories this run introduced may be removed: a scenario story whose content matches a
// record the user already had would otherwise delete the user's library entry.
async function cleanupScenario(page, importedHashes, guard, keep, libraryBefore: LibraryCapture | null = null) {
  if (keep) return { kept: true, sandboxChatId: guard?.sandboxChatId ?? null, owned: guard?.owned ?? [] };
  const { remove: removable, kept, untrusted } = removableStories(importedHashes, libraryBefore);
  const cleaned = await evaluateInST(page, async (hashes) => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (root?.v2Stories && Array.isArray(root.v2Stories)) {
      root.v2Stories = root.v2Stories.filter((entry) => !hashes.includes(entry.hash));
    }
    return { removedStoryHashes: hashes };
  }, removable) as Record<string, unknown>;
  if (removable.length) cleaned.saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  if (untrusted && importedHashes.length) cleaned.libraryUntrusted = 'the library before this run could not be read, so no imported story was removed';
  else if (kept.length) cleaned.keptPreExistingStories = kept;
  if (guard) {
    cleaned.clearedDebugResponses = await clearDebugResponses(page).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));
    await recordSandboxStory(page, guard);
    try { Object.assign(cleaned, await deleteSandboxChats(page, guard)); } catch (err) { cleaned.chatCleanupError = err instanceof Error ? err.message : String(err); }
    try { cleaned.mirrorBooks = await deleteSandboxMirrorBooks(page, guard); } catch (err) { cleaned.mirrorBookCleanupError = err instanceof Error ? err.message : String(err); }
    // The chat the page was on before this run is none of the run's business. Read it back from the
    // server and say so loudly if it shrank: a silent loss here is the user's story, and nothing else
    // in the harness can see it (2026-09-21).
    const openBefore = guard.preexistingOpen;
    if (openBefore?.chatId && typeof openBefore.messages === 'number') {
      const after = await readChatOnDisk(page, openBefore.chatId).catch(() => null);
      if (after && typeof after.messages === 'number' && after.messages < openBefore.messages) {
        cleaned.preexistingChatDamaged = { chatId: openBefore.chatId, before: openBefore.messages, after: after.messages };
      } else if (after) {
        cleaned.preexistingChat = { chatId: openBefore.chatId, messages: after.messages };
      }
    }
  }
  return cleaned;
}

async function runStep(page, key, value, { scenarioDir = PROJECT_ROOT, importedHashes = [], assetBaseline = null, guard = null } = {}) {
  if (key === 'import_story') {
    const output = await importStory(page, await resolveStory(value, scenarioDir));
    if (output?.snapshot?.storyHash) importedHashes.push(output.snapshot.storyHash);
    return output;
  }
  if (key === 'seed_metadata') return seedMetadata(page, value, scenarioDir);
  if (key === 'select_story') return selectStory(page, value);
  if (key === 'restart_story') return restartStory(page, value);
  if (key === 'studio_save') return saveStudioDraft(page, typeof value === 'string' ? value : value?.choice ?? null);
  if (key === 'send') return sendCompactMessage(page, value);
  if (key === 'send_generate') return typeof value === 'string' ? sendUserMessage(page, value) : sendUserMessage(page, value.text, { idleTimeoutMs: value.timeoutMs, expectReply: value.expectReply === true });
  if (key === 'slash') return executeSlashCommand(page, value);
  if (key === 'extract') return extract(page, value);
  if (key === 'expand') return expand(page, value);
  if (key === 'eval') return evalStep(page, value);
  if (key === 'block_route') return blockRoute(page, value);
  if (key === 'unblock_route') return unblockRoute(page, value);
  if (key === 'copilot') return copilotStep(page, value);
  if (key === 'ui') return uiStep(page, value);
  if (key === 'stagecraft') return stagecraftStep(page, value);
  if (key === 'assets') return assetsStep(page, value, assetBaseline);
  if (key === 'reload') return reloadStep(page, value, guard);
  if (key === 'swipe') return swipeMessage(page, value.messageId, value.swipeId ?? null);
  if (key === 'edit') return editMessage(page, value.messageId, value.text);
  if (key === 'delete') return deleteMessage(page, value.messageId ?? value);
  if (key === 'wait') return waitForCondition(page, value);
  if (key === 'expect') {
    const assertion = evaluateExpect(await dumpCurrentChatState(page), value);
    if (!assertion.ok) throw new Error(assertion.failures.join('; '));
    return assertion.actual;
  }
  if (key === 'expect_ui') {
    const assertion = await evaluateExpectUi(page, value);
    if (!assertion.ok) throw new Error(assertion.failures.join('; '));
    return assertion.actual;
  }
  throw new Error(`Unknown step key: ${key}`);
}

// Shared step engine: so-scenario (feature level) and so-journey (composition level) run the
// exact same verbs. New verbs land here, never in a parallel runner. The modifier list is the
// schema's (V20a): a second copy here lacked `expectFail`, so a step whose first key was
// `expectFail` passed validation and was then dispatched AS a verb ("Unknown step key").

// With a sandbox guard every step first proves the page is still on a chat the run created, so a
// chat switched under the run (a shared debug browser) stops it before it writes anywhere else.
async function runSteps(page, steps, { scenarioDir = PROJECT_ROOT, importedHashes = [], label = '', assetBaseline = null, guard = null } = {}) {
  const result: { steps: unknown[]; ok: boolean; error: string | null; retries: Array<{ index: number; key: string; attempt: number; of: number; error: string }>; firstAttempt?: 'pass' | 'fail' } = { steps: [], ok: true, error: null, retries: [] };
  const attempts = new Map<number, number>();
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const key = Object.keys(step).find((name) => !STEP_MODIFIERS.has(name));
    const startedAt = Date.now();
    let output;
    try {
      if (guard) await assertInSandbox(page, guard, `before step ${index + 1} (${key})`);
      const chatsBeforeStep = guard && step.adoptsNewChat ? (await readActiveChat(page)).groupChats : null;
      output = await runStep(page, key, step[key], { scenarioDir, importedHashes, assetBaseline, guard });
      // T2: a verb that answered `{ok:false}` used to be logged as a passing step, so an import
      // that never landed or a restart that never happened read as green and every later
      // assertion measured the wrong world. A step that is SUPPOSED to fail says so with
      // `expectFail: true`, and then succeeding is the error.
      const reportedOk = output && typeof output === 'object' && 'ok' in output ? (output as { ok: unknown }).ok : undefined;
      if (step.expectFail) {
        if (reportedOk !== false) throw new Error(`${key}: expected this step to fail (expectFail), but it reported ok=${JSON.stringify(reportedOk)}`);
      } else if (reportedOk === false) {
        const detail = (output as { failures?: unknown[]; error?: unknown }).failures ?? (output as { error?: unknown }).error;
        throw new Error(`${key}: reported ok:false${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
      }
      if (chatsBeforeStep) await adoptNewSandboxChat(page, guard, chatsBeforeStep);
      if (guard) await recordSandboxStory(page, guard);
      const entry = { index, key, ok: true, ms: Date.now() - startedAt };
      result.steps.push(entry);
      console.log(`${label}${index + 1}/${steps.length} ${key} ok ${entry.ms}ms`);
      if (step.log) console.log(`${label}${index + 1}/${steps.length} ${key} -> ${JSON.stringify(output ?? null).slice(0, typeof step.log === 'number' ? step.log : 800)}`);
    } catch (err) {
      const entry = { index, key, ok: false, ms: Date.now() - startedAt, error: err.message || String(err), output };
      result.steps.push(entry);
      // A check that asserts ONE model sample is a coin flip, and running the journey twice does not
      // help: at a ~50% sample failure rate, two runs still red three times in four (2026-09-20).
      // `attempts` re-samples instead, and `retryBack` rewinds to the step that made the call —
      // retrying the assertion alone would re-check the same stored output forever. Opt-in per step,
      // because a rewound span re-runs its side effects.
      const allowed = Math.max(1, Number(step.attempts) || 1);
      const used = (attempts.get(index) ?? 0) + 1;
      attempts.set(index, used);
      if (used < allowed) {
        const back = Math.max(0, Number(step.retryBack) || 0);
        // S5/F1: a retry is what makes a coin-flip check reportable, but "passed eventually" and
        // "passed first time" are different claims and only the second says the product improved.
        // Every retry is recorded so a Gate record can state the first-attempt rate.
        result.retries.push({ index, key, attempt: used, of: allowed, error: entry.error });
        console.log(`${label}${index + 1}/${steps.length} ${key} attempt ${used}/${allowed} failed, retrying from step ${index - back + 1}: ${entry.error}`);
        index = index - back - 1;
        continue;
      }
      result.ok = false;
      result.error = allowed > 1 ? `${entry.error} (after ${allowed} attempts)` : entry.error;
      console.log(`${label}${index + 1}/${steps.length} ${key} FAIL ${result.error}`);
      break;
    }
  }
  if (guard && result.ok) {
    try {
      await assertInSandbox(page, guard, 'after the last step');
    } catch (err) {
      result.ok = false;
      result.error = err.message || String(err);
      console.log(`${label}FAIL ${result.error}`);
    }
  }
  // V20a: "the first attempt succeeded". It used to be "no retry happened", so a run that failed
  // outright read `firstAttempt: pass` in its record. A check that declares an expected outcome
  // (J0.5 fails by design) is judged by `firstAttemptOf` in the journey runner, which knows the
  // expectation this engine does not.
  result.firstAttempt = result.ok && result.retries.length === 0 ? 'pass' : 'fail';
  return result;
}

async function runScenario(page, file, { sandbox = false, keep = false, group = null } = {}) {
  const scenarioPath = resolve(PROJECT_ROOT, file);
  const scenarioDir = dirname(scenarioPath);
  const scenario = await loadFixture(scenarioPath);
  const steps = Array.isArray(scenario) ? scenario : scenario.steps;
  if (!Array.isArray(steps)) throw new Error('Scenario must be an array or { steps: [] }.');
  const importedHashes = [];
  let guard = null;
  let result: Record<string, unknown> = { file, steps: [], ok: true, cleanup: null };

  let libraryBefore: LibraryCapture | null = null;
  let extractionBefore = null;
  if (sandbox) {
    if (group) await openGroup(page, group);
    else await openMostRecentGroupChat(page);
    guard = (await beginSandboxSession(page)).guard;
    await clearDebugResponses(page);
    libraryBefore = await libraryHashes(page);
    // Extraction settings are INSTALL-WIDE. Scenarios write them (plan06-convergence sets
    // stabilityLag 1) and a failed read pauses extraction for the whole install — so running the
    // mocked corpus left extraction DISABLED and stabilityLag 1 behind, which a real player would
    // then inherit in silence. Measured 2026-09-20 with `so-run-header diff`. The journey runner
    // already captured and restored these; a scenario did not.
    extractionBefore = await readExtractionSettings(page);
  }

  try {
    result = { file, ...(await runSteps(page, steps, { scenarioDir, importedHashes, guard })), cleanup: null };
    if (!result.ok) await writeJSON({ result, state: await dumpCurrentChatState(page).catch(() => null) }, 'so-scenario-failure');
  } finally {
    // A route block is a change to the SHARED page's network, so it is released even when the run
    // failed midway: a save endpoint left blocked would fail every later run's persistence in silence.
    result.releasedRoutes = await releaseBlockedRoutes(page);
    if (sandbox) {
      const cleanup: Record<string, unknown> = await cleanupScenario(page, importedHashes, guard, keep, libraryBefore);
      cleanup.extraction = await restoreExtractionSettings(page, extractionBefore).catch((error) => ({ error: error.message }));
      result.cleanup = cleanup;
      const leftChats = Array.isArray(cleanup.notDeleted) ? cleanup.notDeleted : [];
      if (leftChats.length) {
        result.ok = false;
        result.error = `cleanup left sandbox chat(s) in the group: ${leftChats.join(', ')}`;
      }
    }
  }

  await writeJSON(result, 'so-scenario-result');
  console.log(JSON.stringify({ ok: result.ok, steps: (result.steps as unknown[]).length, cleanup: result.cleanup }, null, 2));
  return result;
}

export { cleanupScenario, deleteSandboxMirrorBooks, evaluateExpect, recordSandboxStory, runScenario, runSteps };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'run' || !process.argv[3] || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => runScenario(page, process.argv[3], { sandbox: readArgFlag('--sandbox'), keep: readArgFlag('--keep'), group: readArgValue('--group') }));
}
