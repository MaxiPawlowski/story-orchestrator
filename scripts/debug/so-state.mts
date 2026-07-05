import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { openMostRecentGroupChat } from './st-navigation.mts';

function decodeRuntime(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const engine = entry.engineState ?? {};
  return {
    storyHash: entry.storyHash ?? null,
    storyTitle: entry.storyTitle ?? null,
    activeCheckpointId: engine.activeCheckpointId ?? null,
    boundary: engine.boundary ?? 0,
    checkpointStartedBoundary: engine.checkpointStartedBoundary ?? null,
    visitedAnchors: engine.visitedAnchors ?? [],
    blackboard: engine.blackboard?.values ?? {},
    versions: engine.blackboard?.versions ?? {},
    latched: engine.blackboard?.latched ?? {},
    requirements: entry.extras?.requirements ?? null,
    firedNpcReplies: entry.extras?.firedNpcReplies ?? {},
    extraction: entry.extras?.extraction ? {
      settings: entry.extras.extraction.settings ?? null,
      scheduler: entry.extras.extraction.scheduler ?? null,
      lastReadBoundary: entry.extras.extraction.lastReadBoundary ?? 0,
      factCount: Array.isArray(entry.extras.extraction.facts) ? entry.extras.extraction.facts.length : 0,
      auditCount: Array.isArray(entry.extras.extraction.audits) ? entry.extras.extraction.audits.length : 0,
      lastAudit: Array.isArray(entry.extras.extraction.audits) && entry.extras.extraction.audits.length
        ? entry.extras.extraction.audits[entry.extras.extraction.audits.length - 1]
        : null,
    } : null,
    expansion: entry.extras?.expansion ? {
      scheduler: entry.extras.expansion.scheduler ?? null,
      entries: entry.extras.expansion.entries ?? {},
      entryCount: entry.extras.expansion.entries ? Object.keys(entry.extras.expansion.entries).length : 0,
    } : null,
    pacing: entry.extras?.pacing ?? null,
    tension: entry.extras?.tension ?? null,
    updatedAt: entry.extras?.updatedAt ?? null,
  };
}

export async function dumpStoryState(page) {
  return await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return ctx.chatMetadata?.story_orchestrator ?? null;
  });
}

export async function dumpCurrentChatState(page) {
  const before = await evaluateInST(page, () => ({ chatId: SillyTavern.getContext().chatId, groupId: SillyTavern.getContext().groupId }));
  if (!before?.chatId) {
    await openMostRecentGroupChat(page);
  }
  const data = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    const selected = blob?.selectedStoryHash ?? null;
    const entry = selected && blob?.stories ? blob.stories[selected] ?? null : null;
    const runtimeSnapshot = globalThis.storyOrchestratorRuntime?.getSnapshot?.() ?? null;
    const pacingPrompt = ctx.extensionPrompts?.story_orchestrator_pacing ?? null;
    return {
      chatId: ctx.chatId,
      groupId: ctx.groupId ?? null,
      selectedStoryHash: selected,
      version: blob?.version ?? null,
      storyCount: blob?.stories ? Object.keys(blob.stories).length : 0,
      entry,
      runtimeSnapshot,
      pacingPrompt,
    };
  });

  return {
    chatId: data?.chatId ?? null,
    groupId: data?.groupId ?? null,
    version: data?.version ?? null,
    selectedStoryHash: data?.selectedStoryHash ?? null,
    storyCount: data?.storyCount ?? 0,
    state: decodeRuntime(data?.entry),
    liveSnapshot: data?.runtimeSnapshot ?? null,
    pacingPrompt: data?.pacingPrompt ?? null,
    _note: 'State is from chatMetadata.story_orchestrator for the current chat.',
  };
}

function compactCurrent(data) {
  const state = data?.state ?? null;
  return {
    chatId: data?.chatId ?? null,
    groupId: data?.groupId ?? null,
    selectedStoryHash: data?.selectedStoryHash ?? null,
    storyTitle: state?.storyTitle ?? null,
    activeCheckpointId: state?.activeCheckpointId ?? null,
    boundary: state?.boundary ?? 0,
    blackboard: state?.blackboard ?? {},
    latched: state?.latched ?? {},
    requirementsReady: state?.requirements?.ready ?? null,
    auditCount: state?.extraction?.auditCount ?? 0,
    factCount: state?.extraction?.factCount ?? 0,
    expansion: data?.liveSnapshot?.expansion ?? state?.expansion ?? null,
    tension: data?.liveSnapshot?.tension ?? state?.tension ?? null,
    pacingPrompt: data?.pacingPrompt ?? null,
  };
}

function parseExpectedValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const number = Number(value);
  if (value.trim() !== '' && Number.isFinite(number)) return number;
  return value;
}

function getPath(data, path) {
  const aliases = { activeCheckpoint: 'activeCheckpointId', bb: 'blackboard' };
  return path.split('.').reduce((current, part) => current?.[aliases[part] ?? part], data);
}

function checkExpectations(data, args) {
  const failures = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--expect') continue;
    const raw = args[index + 1] ?? '';
    const eq = raw.indexOf('=');
    if (eq < 1) {
      failures.push(`Invalid expectation: ${raw}`);
      continue;
    }
    const path = raw.slice(0, eq);
    const expected = parseExpectedValue(raw.slice(eq + 1));
    const actual = getPath(data, path);
    if (actual !== expected) failures.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return failures;
}

const USAGE = `Usage: node scripts/debug/so-state.mts [current|all] [--full] [--expect path=value]

Examples:
  node scripts/debug/so-state.mts
  node scripts/debug/so-state.mts current --expect activeCheckpointId=door --expect bb.player_has_key=true`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    const args = process.argv.slice(2);
    const subcommand = args.find((arg) => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--')) ?? 'current';
    const full = args.includes('--full');

    if (subcommand === 'current') {
      const data = await dumpCurrentChatState(page);
      const output = full ? data : compactCurrent(data);
      console.log(JSON.stringify(output, null, 2));
      const failures = checkExpectations(output, args);
      if (failures.length) {
        console.error(`Expectation failed: ${failures.join('; ')}`);
        process.exitCode = 1;
      }
      await writeJSON(data, 'so-state-current');
    } else {
      const data = await dumpStoryState(page);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-state-all');
    }
  });
}
