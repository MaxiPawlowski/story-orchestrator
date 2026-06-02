import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

function decodePersistedEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    storySignature: entry.storySignature ?? null,
    storyKey: entry.storyKey ?? null,
    checkpointIndex: entry.checkpointIndex ?? 0,
    activeCheckpointKey: entry.activeCheckpointKey ?? null,
    turnsSinceEval: entry.turnsSinceEval ?? 0,
    checkpointTurnCount: entry.checkpointTurnCount ?? 0,
    checkpointStatusMap: entry.checkpointStatusMap ?? {},
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null,
    roadmap: entry.roadmap ?? null,
  };
}

export async function dumpStoryState(page) {
  const raw = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return ctx.extensionSettings?.['story-orchestrator']?.storyState ?? null;
  });

  if (!raw || typeof raw !== 'object') return null;

  const result = {};
  for (const [chatKey, entry] of Object.entries(raw)) {
    result[chatKey] = decodePersistedEntry(entry);
  }
  return result;
}

export async function dumpCurrentChatState(page) {
  const data = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const chatId = ctx.chatId;
    const groupId = ctx.groupId ?? null;
    const ext = ctx.extensionSettings?.['story-orchestrator'];
    const stateMap = ext?.storyState;
    const storySelected = ext?.studio?.lastSelectedKey ?? null;

    if (!stateMap || !chatId) {
      return { chatId, groupId, entry: null, checkpointNames: null, activeStory: null, storySelected };
    }

    const entry = stateMap[chatId] ?? null;
    let checkpointNames = null;
    let activeStory = null;

    if (entry?.storyKey && ext?.studio?.stories) {
      const storyId = entry.storyKey.replace(/^saved:/, '');
      const record = ext.studio.stories.find((s) => s.id === storyId);
      if (record?.story) {
        const checkpoints = Array.isArray(record.story.checkpoints) ? record.story.checkpoints : [];
        const transitions = Array.isArray(record.story.transitions) ? record.story.transitions : [];
        checkpointNames = {};
        for (const cp of checkpoints) {
          if (cp.id) checkpointNames[cp.id] = cp.name || cp.id;
        }
        activeStory = {
          id: record.id,
          name: record.name,
          checkpointCount: checkpoints.length,
          transitionCount: transitions.length,
        };
      }
    }

    return { chatId, groupId, entry, checkpointNames, activeStory, storySelected };
  });

  if (!data) return null;

  const decoded = decodePersistedEntry(data.entry);
  if (!decoded) return { chatId: data.chatId, groupId: data.groupId, state: null };

  if (data.checkpointNames && decoded.checkpointStatusMap) {
    const enriched = {};
    for (const [key, status] of Object.entries(decoded.checkpointStatusMap)) {
      const name = data.checkpointNames[key];
      enriched[key] = name ? `${status} (${name})` : status;
    }
    decoded.checkpointStatusMap = enriched;
  }

  if (data.checkpointNames && decoded.activeCheckpointKey) {
    const name = data.checkpointNames[decoded.activeCheckpointKey];
    if (name) decoded.activeCheckpointName = name;
  }

  return {
    chatId: data.chatId,
    groupId: data.groupId,
    storySelected: data.storySelected,
    activeStory: data.activeStory,
    state: decoded,
    _note: 'State is from persisted snapshot — live Zustand values (e.g. turnsSinceEval between persists) may differ.',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);

      const subcommand = process.argv[2];

      if (subcommand === 'current') {
        const data = await dumpCurrentChatState(page);
        console.log(JSON.stringify(data, null, 2));
        await writeJSON(data, 'so-state-current');
      } else {
        const data = await dumpStoryState(page);
        console.log(JSON.stringify(data, null, 2));
        await writeJSON(data, 'so-state-all');
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) browser.close();
    }
  })();
}
