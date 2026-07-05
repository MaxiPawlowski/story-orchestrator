import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectToST, PROJECT_ROOT } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';
import { openMostRecentGroupChat, startNewGroupSession } from './st-navigation.mjs';
import { deleteMessage, editMessage, executeSlashCommand, sendCompactMessage, sendUserMessage, swipeMessage, waitForIdle } from './st-actions.mjs';
import { dumpCurrentChatState } from './so-state.mjs';

const USAGE = `Usage: node scripts/debug/so-scenario.mjs run <file.json> [--sandbox] [--keep]

Step keys:
  import_story, select_story, send, send_generate, slash, extract, swipe, edit, delete, wait, expect`;

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
    requirementsReady: runtime?.requirements?.ready ?? null,
    npcFired: runtime?.firedNpcReplies ?? {},
  };
}

function compareSubset(actual, expected, path = '') {
  const failures = [];
  for (const [key, expectedValue] of Object.entries(expected ?? {})) {
    const actualValue = actual?.[key];
    const nextPath = path ? `${path}.${key}` : key;
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
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
  if (Array.isArray(expected.latched)) {
    for (const key of expected.latched) {
      if (actual.latched[key] !== true) failures.push(`latched.${key}: expected true, got ${JSON.stringify(actual.latched[key])}`);
    }
  }
  if (expected['auditCount>='] !== undefined && actual.auditCount < expected['auditCount>=']) {
    failures.push(`auditCount: expected >= ${expected['auditCount>=']}, got ${actual.auditCount}`);
  }
  if (expected.npcFired) failures.push(...compareSubset(actual.npcFired, expected.npcFired, 'npcFired'));
  if (expected.requirementsReady !== undefined && actual.requirementsReady !== expected.requirementsReady) {
    failures.push(`requirementsReady: expected ${expected.requirementsReady}, got ${actual.requirementsReady}`);
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
    if (spec.checkpoint !== undefined && runtime?.activeCheckpointId === spec.checkpoint) return last;
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
  }, importedHashes);
  if (sandboxChatStarted) {
    try { await executeSlashCommand(page, '/delchat'); } catch (err) { cleaned.chatCleanupError = err.message || String(err); }
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
  (async () => {
    if (process.argv[2] !== 'run' || !process.argv[3] || process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log(USAGE);
      process.exit(process.argv.includes('--help') || process.argv.includes('-h') ? 0 : 1);
    }
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);
      const result = await runScenario(page, process.argv[3], { sandbox: readArgFlag('--sandbox'), keep: readArgFlag('--keep') });
      if (!result.ok) process.exitCode = 1;
    } catch (err) {
      console.error('Error:', err.message || String(err));
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
