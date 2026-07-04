import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';
import { openMostRecentGroupChat } from './st-navigation.mjs';

const story = {
  format: 2,
  title: 'Runtime Gate Check',
  description: 'Plan 02 live runtime validation story.',
  requirements: { personas: ['Max'], members: ['DM Narrator'] },
  qualities: [
    { key: 'message_count', type: 'int', source: 'code', monotonic: true, rubric: 'Rendered boundary count.' },
    { key: 'messages_in_checkpoint', type: 'int', source: 'code', monotonic: true, rubric: 'Rendered boundaries in the active checkpoint.' },
    { key: 'elapsed', type: 'int', source: 'code', monotonic: true, rubric: 'Seconds since checkpoint entry.' },
    { key: 'found_key', type: 'bool', source: 'extractor', latching: true, rubric: 'Did the player find the key?' },
    { key: 'door_open', type: 'bool', source: 'extractor', latching: true, rubric: 'Did the door open?' },
  ],
  checkpoints: [
    { id: 'start', name: 'Find Key', objective: 'Find the key.', type: 'anchor', start: true },
    {
      id: 'door',
      name: 'Open Door',
      objective: 'Open the door.',
      type: 'anchor',
      effects: {
        author_note: { text: 'Runtime check: keep focus on the vault door.', inject_blackboard: true },
        npc_replies: [{ trigger: 'onEnter', member: 'DM Narrator', kind: 'scripted', text: 'The vault door waits for proof.', maxTriggers: 1 }],
      },
    },
    { id: 'end', name: 'Inside', objective: 'Enter the vault.', type: 'anchor' },
  ],
  transitions: [
    { from: 'start', to: 'door', priority: 1, gate: { q: 'found_key', op: '==', v: true } },
    { from: 'door', to: 'end', priority: 1, gate: { q: 'door_open', op: '==', v: true } },
  ],
  roster: [{ id: 'DM Narrator', name: 'DM Narrator' }],
};

async function readCurrentState(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    const selected = blob?.selectedStoryHash ?? null;
    const entry = selected ? blob?.stories?.[selected] ?? null : null;
    return { chatId: ctx.chatId, groupId: ctx.groupId, selected, entry };
  });
}

async function runSlash(page, command) {
  return evaluateInST(page, async (cmd) => {
    const ctx = SillyTavern.getContext();
    const result = await ctx.executeSlashCommandsWithOptions(cmd, { handleParserErrors: true, handleExecutionErrors: true });
    return { isError: result?.isError ?? false, errorMessage: result?.errorMessage ?? null };
  }, command);
}

async function waitForCheckpoint(page, checkpointId) {
  const deadline = Date.now() + 10000;
  let current = null;
  while (Date.now() < deadline) {
    current = await readCurrentState(page);
    if (current?.entry?.engineState?.activeCheckpointId === checkpointId) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for checkpoint ${checkpointId}: ${JSON.stringify(current)}`);
}

async function importStoryThroughUi(page) {
  await page.waitForFunction(() => Boolean(globalThis.storyOrchestratorRuntime), null, { timeout: 10000 });
  const imported = await evaluateInST(page, async (raw) => {
    const ok = await globalThis.storyOrchestratorRuntime.importStory(JSON.stringify(raw));
    return { ok, snapshot: globalThis.storyOrchestratorRuntime.getSnapshot() };
  }, story);
  if (!imported?.ok) throw new Error(`Import failed: ${JSON.stringify(imported)}`);
  await waitForCheckpoint(page, 'start');
  return imported;
}

export async function runRuntimeCheck(page) {
  const opened = await openMostRecentGroupChat(page);
  const importResult = await importStoryThroughUi(page);
  const imported = await readCurrentState(page);
  const cpState = await runSlash(page, '/cp state');
  const setKey = await runSlash(page, '/cp set found_key true');
  await waitForCheckpoint(page, 'door');
  const afterSet = await readCurrentState(page);
  const macro = await evaluateInST(page, () => SillyTavern.getContext().substituteParams('{{story_blackboard}}'));
  const activate = await runSlash(page, '/cp activate end');
  await waitForCheckpoint(page, 'end');
  const afterActivate = await readCurrentState(page);
  return { opened, importResult, imported, cpState, setKey, afterSet, macro, activate, afterActivate };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);
      const result = await runRuntimeCheck(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-runtime-check');
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) browser.close();
    }
  })();
}
