import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

export async function dumpStoryLibrary(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const records = ctx.extensionSettings?.['story-orchestrator']?.v2Stories;
    if (!Array.isArray(records)) return { stories: [] };
    return {
      stories: records.map((record) => ({
        hash: record.hash,
        title: record.title,
        description: record.description ?? null,
        checkpointCount: Array.isArray(record.raw?.checkpoints) ? record.raw.checkpoints.length : 0,
        transitionCount: Array.isArray(record.raw?.transitions) ? record.raw.transitions.length : 0,
        importedAt: record.importedAt ?? null,
      })),
    };
  });
}

export async function dumpStory(page, hash) {
  return evaluateInST(page, (needle) => {
    const ctx = SillyTavern.getContext();
    const records = ctx.extensionSettings?.['story-orchestrator']?.v2Stories;
    if (!Array.isArray(records)) return null;
    return records.find((record) => record.hash === needle) ?? null;
  }, hash);
}

export async function dumpLegacyLibrary(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const studio = ctx.extensionSettings?.['story-orchestrator']?.studio;
    if (!studio?.stories) return { stories: [], lastSelectedKey: null };
    return {
      stories: studio.stories.map((record) => ({
        id: record.id,
        name: record.name,
        checkpointCount: Array.isArray(record.story?.checkpoints) ? record.story.checkpoints.length : 0,
        transitionCount: Array.isArray(record.story?.transitions) ? record.story.transitions.length : 0,
        updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
        meta: record.meta ?? null,
      })),
      lastSelectedKey: studio.lastSelectedKey ?? null,
    };
  });
}

export async function removeStory(page, hashOrTitle) {
  return evaluateInST(page, async (needle) => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (!root || !Array.isArray(root.v2Stories)) return { removed: [], remaining: [] };
    const search = String(needle).trim().toLowerCase();
    const removed = root.v2Stories
      .filter((record) => record.hash === needle || (record.title ?? '').trim().toLowerCase() === search)
      .map((record) => ({ hash: record.hash, title: record.title }));
    if (removed.length) {
      root.v2Stories = root.v2Stories.filter((record) => !removed.some((gone) => gone.hash === record.hash));
      if (typeof ctx.saveSettings === 'function') await ctx.saveSettings();
      else { ctx.saveSettingsDebounced(); await new Promise((resolve) => setTimeout(resolve, 1500)); }
    }
    return { removed, remaining: root.v2Stories.map((record) => record.title) };
  }, hashOrTitle);
}

export async function wipeChatMeta(page, hash) {
  return evaluateInST(page, async (onlyHash) => {
    const ctx = SillyTavern.getContext();
    const meta = ctx.chatMetadata?.story_orchestrator;
    if (!meta) return { wiped: false, reason: 'no story_orchestrator metadata on this chat' };
    if (onlyHash) {
      const hashes = meta.stories ? Object.keys(meta.stories) : [];
      const others = hashes.filter((candidate) => candidate !== onlyHash);
      if (others.length) return { wiped: false, reason: `chat also references ${others.join(', ')} — refusing partial wipe`, hashes };
    }
    const summary = { selectedStoryHash: meta.selectedStoryHash ?? null, storyHashes: meta.stories ? Object.keys(meta.stories) : [] };
    delete ctx.chatMetadata.story_orchestrator;
    if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
    return { wiped: true, chatId: ctx.chatId, was: summary };
  }, hash ?? null);
}

const USAGE = `Usage: node so-library.mts [action] [args]

Actions:
  (none)                     Print the v2 story library (extensionSettings["story-orchestrator"].v2Stories)
  <hash>                     Print the full v2 story record for a hash
  remove <hash|title>        Remove matching stories from the v2 library and flush settings
  wipe-chat-meta [--hash h]  Delete chat_metadata.story_orchestrator from the current chat
                             (with --hash: only when the chat references solely that story)
  --legacy                   Print the legacy v1 studio library instead`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    const args = stripCommonArgs(process.argv.slice(2));
    const action = args[0];

    if (args.includes('--legacy')) {
      const data = await dumpLegacyLibrary(page);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-library-legacy');
      return;
    }
    if (action === 'remove') {
      const target = args.slice(1).join(' ');
      if (!target) { console.error('Usage: remove <hash|title>'); return { ok: false }; }
      const data = await removeStory(page, target);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-library-remove');
      return { ok: data.removed.length > 0 };
    }
    if (action === 'wipe-chat-meta') {
      const hashIndex = args.indexOf('--hash');
      const hash = hashIndex >= 0 ? args[hashIndex + 1] : undefined;
      const data = await wipeChatMeta(page, hash);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-library-wipe-chat-meta');
      return { ok: data.wiped };
    }
    if (action) {
      const data = await dumpStory(page, action);
      if (!data) {
        console.error(`Story "${action}" not found in the v2 library.`);
        return { ok: false };
      }
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, `so-story-${action}`);
      return;
    }
    const data = await dumpStoryLibrary(page);
    console.log(JSON.stringify(data, null, 2));
    await writeJSON(data, 'so-library');
  });
}
