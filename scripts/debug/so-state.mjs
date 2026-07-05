import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';
import { openMostRecentGroupChat } from './st-navigation.mjs';

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
    return {
      chatId: ctx.chatId,
      groupId: ctx.groupId ?? null,
      selectedStoryHash: selected,
      version: blob?.version ?? null,
      storyCount: blob?.stories ? Object.keys(blob.stories).length : 0,
      entry,
    };
  });

  return {
    chatId: data?.chatId ?? null,
    groupId: data?.groupId ?? null,
    version: data?.version ?? null,
    selectedStoryHash: data?.selectedStoryHash ?? null,
    storyCount: data?.storyCount ?? 0,
    state: decodeRuntime(data?.entry),
    _note: 'State is from chatMetadata.story_orchestrator for the current chat.',
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
