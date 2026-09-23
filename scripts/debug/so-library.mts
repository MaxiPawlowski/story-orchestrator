import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';

export async function dumpStoryLibrary(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const records = ctx.extensionSettings?.['story-orchestrator']?.v2Stories;
    if (!Array.isArray(records)) return { stories: [] };
    return {
      stories: records.map((record) => ({
        id: record.id ?? null,
        version: record.version ?? null,
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

export async function dumpStory(page, idOrHash) {
  return evaluateInST(page, (needle) => {
    const ctx = SillyTavern.getContext();
    const records = ctx.extensionSettings?.['story-orchestrator']?.v2Stories;
    if (!Array.isArray(records)) return null;
    return records.find((record) => record.id === needle) ?? records.find((record) => record.hash === needle) ?? null;
  }, idOrHash);
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
  const result = await evaluateInST(page, async (needle) => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (!root || !Array.isArray(root.v2Stories)) return { removed: [], remaining: [] };
    const search = String(needle).trim().toLowerCase();
    const removed = root.v2Stories
      .filter((record) => record.id === needle || record.hash === needle || (record.title ?? '').trim().toLowerCase() === search)
      .map((record) => ({ id: record.id ?? null, hash: record.hash, title: record.title }));
    if (removed.length) root.v2Stories = root.v2Stories.filter((record) => !removed.some((gone) => gone.hash === record.hash));
    return { removed, remaining: root.v2Stories.map((record) => record.title) };
  }, hashOrTitle);
  return result.removed.length ? { ...result, saved: await saveSettingsNow(page) } : result;
}

// Per-chat state is keyed by story id (blob v3); `only` is an id, and a v2 chat's hash keys still
// match because the migration keeps unresolvable ones as `legacy-<hash>`.
export async function wipeChatMeta(page, only) {
  return evaluateInST(page, async (onlyId) => {
    const ctx = SillyTavern.getContext();
    const meta = ctx.chatMetadata?.story_orchestrator;
    if (!meta) return { wiped: false, reason: 'no story_orchestrator metadata on this chat' };
    if (onlyId) {
      const keys = meta.stories ? Object.keys(meta.stories) : [];
      const others = keys.filter((candidate) => candidate !== onlyId && candidate !== `legacy-${onlyId}`);
      if (others.length) return { wiped: false, reason: `chat also references ${others.join(', ')} — refusing partial wipe`, keys };
    }
    const summary = { selected: meta.selectedStoryId ?? meta.selectedStoryHash ?? null, storyKeys: meta.stories ? Object.keys(meta.stories) : [] };
    delete ctx.chatMetadata.story_orchestrator;
    if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
    return { wiped: true, chatId: ctx.chatId, was: summary };
  }, only ?? null);
}

const USAGE = `Usage: node so-library.mts [action] [args]

Actions:
  (none)                     Print the v2 story library (extensionSettings["story-orchestrator"].v2Stories)
  <id|hash>                  Print the full story record for an id or content hash
  remove <id|hash|title>     Remove matching stories from the library (by id first) and flush settings
  wipe-chat-meta [--id i]    Delete chat_metadata.story_orchestrator from the current chat
                             (with --id: only when the chat references solely that story)
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
      if (!target) { console.error('Usage: remove <id|hash|title>'); return { ok: false }; }
      const data = await removeStory(page, target);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-library-remove');
      return { ok: data.removed.length > 0 };
    }
    if (action === 'wipe-chat-meta') {
      const idIndex = args.indexOf('--id') >= 0 ? args.indexOf('--id') : args.indexOf('--hash');
      const only = idIndex >= 0 ? args[idIndex + 1] : undefined;
      const data = await wipeChatMeta(page, only);
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
