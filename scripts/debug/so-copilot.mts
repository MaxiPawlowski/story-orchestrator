import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-copilot.mts <command> [options]

Driver commands (operate on the loaded story via storyOrchestratorRuntime):
  context                          Print the in-play driver context (objective, unmet gates, upcoming anchors, canon)
  suggest [--debug <json|@file>]   Run the Suggest pass (2-3 next-development suggestions)
  report  [--debug <json|@file>]   Run the Report pass (world-progression summary)
  nudge <text...>                  Inject a one-shot steering note (cleared after the next generation)
  clear-nudge                      Clear the active steering note
  probe   [--debug <deltas>]       Force a P0 targeted extraction (reason=probe)
  advance <checkpointId>           Manually activate a checkpoint (applies its effects)

Authoring command (operates on the current Studio draft store):
  stage <qualities|checkpoints|transitions|effects> [--message <text>] [--debug <json|@file>]
                                   Run an authoring stage; prints the proposal ops + diagnostics count

Notes:
  --debug takes inline JSON or @path (mocks the LLM; omit for a real-LLM run).
  'stage' needs the Studio draft store — open the Studio at least once so the draft is initialized.`;

const STAGES = ['qualities', 'checkpoints', 'transitions', 'effects'];

async function readDebug(value) {
  if (!value) return null;
  if (value.startsWith('@')) return readFile(resolve(PROJECT_ROOT, value.slice(1)), 'utf-8');
  return value;
}

function getFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function runCopilotCommand(page, args) {
  const command = args[0];
  const debug = await readDebug(getFlag(args, '--debug'));

  if (command === 'context') {
    return evaluateInST(page, () => globalThis.storyOrchestratorRuntime?.getDriverContext?.() ?? null);
  }
  if (command === 'suggest') {
    return evaluateInST(page, (debug) => globalThis.storyOrchestratorRuntime.runCopilotSuggest(debug ?? undefined), debug);
  }
  if (command === 'report') {
    return evaluateInST(page, (debug) => globalThis.storyOrchestratorRuntime.runCopilotReport(debug ?? undefined), debug);
  }
  if (command === 'nudge') {
    const text = args.slice(1).filter((arg) => !arg.startsWith('--')).join(' ');
    if (!text) throw new Error('nudge requires text');
    return evaluateInST(page, (text) => {
      globalThis.storyOrchestratorRuntime.setCopilotNudge(text);
      return { activeNudge: globalThis.storyOrchestratorRuntime.getActiveNudge() };
    }, text);
  }
  if (command === 'clear-nudge') {
    return evaluateInST(page, () => {
      globalThis.storyOrchestratorRuntime.clearCopilotNudge();
      return { activeNudge: globalThis.storyOrchestratorRuntime.getActiveNudge() };
    });
  }
  if (command === 'probe') {
    return evaluateInST(page, (debug) => globalThis.storyOrchestratorRuntime.runExtractionNow(debug ?? undefined, 'probe'), debug);
  }
  if (command === 'advance') {
    const id = args[1];
    if (!id) throw new Error('advance requires a checkpointId');
    return evaluateInST(page, async (id) => {
      const ok = await globalThis.storyOrchestratorRuntime.activateCheckpoint(id);
      return { ok, activeCheckpointId: globalThis.storyOrchestratorRuntime.getSnapshot().activeCheckpointId };
    }, id);
  }
  if (command === 'stage') {
    const stage = args[1];
    if (!STAGES.includes(stage)) throw new Error(`stage must be one of ${STAGES.join('|')}`);
    const message = getFlag(args, '--message') ?? '';
    return evaluateInST(page, async ({ stage, message, debug }) => {
      const store = globalThis.storyOrchestratorStudioDraft;
      if (!store) throw new Error('Studio draft store not ready — open the Studio once');
      const draft = store.getState().draft;
      const result = await globalThis.storyOrchestratorRuntime.runCopilotStage({ draft, stage, message, history: [] }, debug ?? undefined);
      return { status: result.status, issues: result.issues, ops: result.proposal.ops, summary: result.proposal.summary, diagnostics: result.preview.diagnostics.length };
    }, { stage, message, debug });
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (hasHelpFlag() || args.length === 0) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli(async (page) => {
    const output = await runCopilotCommand(page, args);
    console.log(JSON.stringify(output, null, 2));
    await writeJSON(output, `so-copilot-${args[0]}`);
  });
}
