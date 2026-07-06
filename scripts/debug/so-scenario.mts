import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { openMostRecentGroupChat, startNewGroupSession } from './st-navigation.mts';
import { deleteMessage, editMessage, executeSlashCommand, sendCompactMessage, sendUserMessage, swipeMessage, waitForIdle } from './st-actions.mts';
import { dumpCurrentChatState } from './so-state.mts';

const USAGE = `Usage: node scripts/debug/so-scenario.mts run <file.json> [--sandbox] [--keep]

Step keys:
  import_story, select_story, send, send_generate, slash, extract, expand, eval, swipe, edit, delete, wait, expect

expect verbs:
  activeCheckpoint, blackboard, blackboardMissing, latched, auditCount>=, npcFired,
  expansion, tension, pacingPrompt, requirementsReady, convergence, reconciliationEvents>=,
  memory ({tier: {count, contains}}), sceneBreaks>=, memoryInjection ({tier: bool}),
  arcs ({open, resolved, summarized, openContains, resolvedContains}), canon ({present, contains}),
  epistemic ({count, contains:[{subject,tag,contains,hiddenFrom?}]}), ledger ({count, contains:[{entity,field,value}]}), capability (bool)

wait verbs:
  idle, boundary, auditCount, acceptedDelta, expansionStatus, checkpoint, progress (+progressAnchor), reconciliationEvents, memoryEntries (+memoryTier), arcsSummarized, canonPresent, backfillComplete`;

function readArgFlag(name) {
  return process.argv.includes(name);
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

async function resolveStory(value, scenarioDir) {
  if (value?.file) return readJSON(resolve(scenarioDir, value.file));
  return value;
}

function compactState(state) {
  const runtime = state?.state ?? null;
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
  if (expected.activeCheckpoint !== undefined && actual.activeCheckpoint !== expected.activeCheckpoint) {
    failures.push(`activeCheckpoint: expected ${expected.activeCheckpoint}, got ${actual.activeCheckpoint}`);
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
    for (const [tier, spec] of Object.entries(expected.memory) as Array<[string, { count?: number; contains?: string[] }]>) {
      const tierEntries = entries.filter((entry: any) => entry?.tier === tier);
      if (spec.count !== undefined && tierEntries.length !== spec.count) failures.push(`memory.${tier}.count: expected ${spec.count}, got ${tierEntries.length}`);
      if (Array.isArray(spec.contains)) {
        for (const substring of spec.contains) {
          if (!tierEntries.some((entry: any) => typeof entry?.text === 'string' && entry.text.includes(substring))) {
            failures.push(`memory.${tier}.contains: expected an entry containing "${substring}"`);
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
  return { ok: failures.length === 0, failures, actual };
}

async function waitForCondition(page, spec) {
  const timeout = spec.timeoutMs ?? 10000;
  const deadline = Date.now() + timeout;
  let last = null;
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
    const record = library.find((entry) => entry.hash === selector || entry.title === selector);
    if (!record) throw new Error(`Story not found: ${selector}`);
    const ok = await runtime.selectStory(record.hash);
    return { ok, hash: record.hash, title: record.title };
  }, selector);
}

async function extract(page, spec) {
  const debugResponse = typeof spec === 'string' ? spec : spec?.debugResponse;
  const reason = typeof spec === 'object' && spec?.reason ? spec.reason : 'scenario';
  return evaluateInST(page, async ({ debugResponse, reason }) => {
    const ok = await globalThis.storyOrchestratorRuntime.runExtractionNow(debugResponse, reason);
    return { ok, snapshot: globalThis.storyOrchestratorRuntime.getSnapshot() };
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

async function cleanupScenario(page, importedHashes, sandboxChatStarted, keep) {
  if (keep) return { kept: true };
  const cleaned = await evaluateInST(page, async (hashes) => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (root?.v2Stories && Array.isArray(root.v2Stories)) {
      root.v2Stories = root.v2Stories.filter((entry) => !hashes.includes(entry.hash));
      ctx.saveSettingsDebounced?.();
    }
    return { removedStoryHashes: hashes };
  }, importedHashes) as Record<string, unknown>;
  if (sandboxChatStarted) {
    try { await executeSlashCommand(page, '/delchat'); } catch (err) { cleaned.chatCleanupError = err instanceof Error ? err.message : String(err); }
  }
  return cleaned;
}

async function runScenario(page, file, { sandbox = false, keep = false } = {}) {
  const scenarioPath = resolve(PROJECT_ROOT, file);
  const scenarioDir = dirname(scenarioPath);
  const scenario = await readJSON(scenarioPath);
  const steps = Array.isArray(scenario) ? scenario : scenario.steps;
  if (!Array.isArray(steps)) throw new Error('Scenario must be an array or { steps: [] }.');
  const result = { file, steps: [], ok: true, cleanup: null };
  const importedHashes = [];
  let sandboxChatStarted = false;

  if (sandbox) {
    await openMostRecentGroupChat(page);
    await startNewGroupSession(page);
    sandboxChatStarted = true;
  }

  try {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const key = Object.keys(step)[0];
      const value = step[key];
      const startedAt = Date.now();
      let output;
      try {
        if (key === 'import_story') {
          output = await importStory(page, await resolveStory(value, scenarioDir));
          if (output?.snapshot?.storyHash) importedHashes.push(output.snapshot.storyHash);
        } else if (key === 'select_story') output = await selectStory(page, value);
        else if (key === 'send') output = await sendCompactMessage(page, value);
        else if (key === 'send_generate') output = await sendUserMessage(page, value);
        else if (key === 'slash') output = await executeSlashCommand(page, value);
        else if (key === 'extract') output = await extract(page, value);
        else if (key === 'expand') output = await expand(page, value);
        else if (key === 'eval') output = await evalStep(page, value);
        else if (key === 'swipe') output = await swipeMessage(page, value.messageId, value.swipeId ?? null);
        else if (key === 'edit') output = await editMessage(page, value.messageId, value.text);
        else if (key === 'delete') output = await deleteMessage(page, value.messageId ?? value);
        else if (key === 'wait') output = await waitForCondition(page, value);
        else if (key === 'expect') {
          const assertion = evaluateExpect(await dumpCurrentChatState(page), value);
          if (!assertion.ok) throw new Error(assertion.failures.join('; '));
          output = assertion.actual;
        } else throw new Error(`Unknown step key: ${key}`);
        const entry = { index, key, ok: true, ms: Date.now() - startedAt };
        result.steps.push(entry);
        console.log(`${index + 1}/${steps.length} ${key} ok ${entry.ms}ms`);
      } catch (err) {
        const entry = { index, key, ok: false, ms: Date.now() - startedAt, error: err.message || String(err), output };
        result.steps.push(entry);
        result.ok = false;
        console.log(`${index + 1}/${steps.length} ${key} FAIL ${entry.error}`);
        await writeJSON({ result, state: await dumpCurrentChatState(page).catch(() => null) }, 'so-scenario-failure');
        break;
      }
    }
  } finally {
    if (sandbox) result.cleanup = await cleanupScenario(page, importedHashes, sandboxChatStarted, keep);
  }

  await writeJSON(result, 'so-scenario-result');
  console.log(JSON.stringify({ ok: result.ok, steps: result.steps.length, cleanup: result.cleanup }, null, 2));
  return result;
}

export { runScenario };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'run' || !process.argv[3] || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => runScenario(page, process.argv[3], { sandbox: readArgFlag('--sandbox'), keep: readArgFlag('--keep') }));
}
