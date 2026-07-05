import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';
import { openMostRecentGroupChat } from './st-navigation.mjs';

const story = {
  format: 2,
  title: 'Extraction Gate Check',
  description: 'Plan 03 live extraction validation story.',
  qualities: [
    { key: 'message_count', type: 'int', source: 'code', monotonic: true, rubric: 'Rendered boundary count.' },
    { key: 'player_has_key', type: 'bool', source: 'extractor', latching: true, rubric: 'Did the player explicitly take the brass key?' },
  ],
  checkpoints: [
    { id: 'start', name: 'Find Key', objective: 'Find the brass key.', type: 'anchor', start: true },
    { id: 'door', name: 'Use Key', objective: 'Use the key at the door.', type: 'anchor' },
  ],
  transitions: [
    { from: 'start', to: 'door', priority: 1, gate: { q: 'player_has_key', op: '==', v: true }, extractor_trigger: 'brass key', extraction_hint: 'Look for the player taking possession of the brass key.' },
  ],
  roster: [],
};

const debugResponse = 'DELTA q=player_has_key value=true evidence="I take the brass key"\nFACT importance=2 text="Max took the brass key." evidence="I take the brass key"';

async function readState(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator;
    const selected = blob?.selectedStoryHash;
    return selected ? blob?.stories?.[selected] ?? null : null;
  });
}

export async function runExtractionCheck(page) {
  const opened = await openMostRecentGroupChat(page);
  await page.waitForFunction(() => Boolean(globalThis.storyOrchestratorRuntime), null, { timeout: 10000 });
  const imported = await evaluateInST(page, async (raw) => {
    return await globalThis.storyOrchestratorRuntime.importStory(JSON.stringify(raw));
  }, story);
  const sent = await evaluateInST(page, async () => {
    const ctx = SillyTavern.getContext();
    return await ctx.executeSlashCommandsWithOptions('/send compact=true I take the brass key from the hook.', { handleParserErrors: true, handleExecutionErrors: true });
  });
  const extracted = await evaluateInST(page, async (response) => {
    return await globalThis.storyOrchestratorRuntime.runExtractionNow(response, 'cue:start->door');
  }, debugResponse);
  const state = await readState(page);
  return { opened, imported, sent: { isError: sent?.isError ?? false, errorMessage: sent?.errorMessage ?? null }, extracted, state };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);
      const result = await runExtractionCheck(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-extraction-check');
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) browser.close();
    }
  })();
}
