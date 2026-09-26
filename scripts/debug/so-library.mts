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

export async function dumpStory(page, id) {
  return evaluateInST(page, (needle) => {
    const ctx = SillyTavern.getContext();
    const records = ctx.extensionSettings?.['story-orchestrator']?.v2Stories;
    if (!Array.isArray(records)) return null;
    return records.find((record) => record.id === needle) ?? null;
  }, id);
}

export async function removeStory(page, idOrTitle) {
  const result = await evaluateInST(page, async (needle) => {
    const ctx = SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'];
    if (!root || !Array.isArray(root.v2Stories)) return { removed: [], remaining: [] };
    const search = String(needle).trim().toLowerCase();
    const removed = root.v2Stories
      .filter((record) => record.id === needle || (record.title ?? '').trim().toLowerCase() === search)
      .map((record) => ({ id: record.id ?? null, title: record.title }));
    if (removed.length) root.v2Stories = root.v2Stories.filter((record) => !removed.some((gone) => gone.id === record.id));
    return { removed, remaining: root.v2Stories.map((record) => record.title) };
  }, idOrTitle);
  return result.removed.length ? { ...result, saved: await saveSettingsNow(page) } : result;
}

// Per-chat state is keyed by story id; `only` is an id.
export async function wipeChatMeta(page, only) {
  return evaluateInST(page, async (onlyId) => {
    const ctx = SillyTavern.getContext();
    const meta = ctx.chatMetadata?.story_orchestrator;
    if (!meta) return { wiped: false, reason: 'no story_orchestrator metadata on this chat' };
    if (onlyId) {
      const keys = meta.stories ? Object.keys(meta.stories) : [];
      const others = keys.filter((candidate) => candidate !== onlyId);
      if (others.length) return { wiped: false, reason: `chat also references ${others.join(', ')} — refusing partial wipe`, keys };
    }
    const summary = { selected: meta.selectedStoryId ?? null, storyKeys: meta.stories ? Object.keys(meta.stories) : [] };
    delete ctx.chatMetadata.story_orchestrator;
    if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
    return { wiped: true, chatId: ctx.chatId, was: summary };
  }, only ?? null);
}

const USAGE = `Usage: node so-library.mts [action] [args]

Actions:
  (none)                     Print the v2 story library (extensionSettings["story-orchestrator"].v2Stories)
  <id>                       Print the full story record for an id
  remove <id|title>          Remove matching stories from the library (by id first) and flush settings
  wipe-chat-meta [--id i]    Delete chat_metadata.story_orchestrator from the current chat
                             (with --id: only when the chat references solely that story)`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    const args = stripCommonArgs(process.argv.slice(2));
    const action = args[0];

    if (action === 'remove') {
      const target = args.slice(1).join(' ');
      if (!target) { console.error('Usage: remove <id|title>'); return { ok: false }; }
      const data = await removeStory(page, target);
      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'so-library-remove');
      return { ok: data.removed.length > 0 };
    }
    if (action === 'wipe-chat-meta') {
      const idIndex = args.indexOf('--id');
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
