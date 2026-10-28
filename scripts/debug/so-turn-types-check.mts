import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { adoptNewSandboxChat, assertInSandbox, beginSandboxSession, deleteSandboxChats, openChat, openGroup, readActiveChat, startNewGroupSession } from './st-navigation.mts';
import { sendUserMessage, waitForIdle } from './st-actions.mts';
import { settleReapPrompts } from './lib/identityVerbs.mts';

const USAGE = `Usage: node scripts/debug/so-turn-types-check.mts [--group <name>] [--image sd|synthetic|auto] [--skip-reply] [--skip-image] [--keep]

Live gate for which rendered messages commit a story boundary (TurnBridge message types).
In a sandbox chat of --group (default "AdolionGroup", whose members all greet) with a throwaway story:
  b-image     an image posted the way /sd posts it (type 'extension') commits no boundary
  a-reply     a real player turn (real generation) commits one boundary per rendered reply
  c-greetings a new group chat, whose greetings arrive before CHAT_CHANGED, commits nothing and
              inherits no story state from the chat that was open
  c-origin    the chat that was open keeps its boundary
  e-*         turn IDENTITY (R10/R11): duplicate events for one id are one turn; a late repeat of
              that id is still one turn; a swipe of the same id makes the re-render a new turn; two
              different ids inside the old 250ms window are two turns. Event-level, so no backend.
--image auto (default) uses a real /sd and falls back to a synthetic post shaped like sd's sendMessage.
Group chats only: one-on-one chats never run a story (soloRemoval.guard.test.ts), so there is no solo leg.
Every chat the run creates is deleted by id afterwards; a story it imported is removed from the library.`;

const STORY = {
  id: 'so-turn-types-check',
  title: 'Turn Types Check',
  description: 'Throwaway story for so-turn-types-check.mts.',
  qualities: [
    { key: 'message_count', type: 'int', source: 'code', monotonic: true, rubric: 'Rendered message count.' },
    { key: 'gate_seen', type: 'bool', source: 'extractor', latching: true, rubric: 'Did anyone say the word "zephyrine" aloud?' },
  ],
  checkpoints: [
    { id: 'start', name: 'Waiting', objective: 'Talk.', type: 'anchor', start: true },
    { id: 'after', name: 'After', objective: 'Keep talking.', type: 'anchor' },
  ],
  transitions: [{ from: 'start', to: 'after', priority: 1, gate: { q: 'gate_seen', op: '==', v: true } }],
  roster: [],
};

const IMAGE_PROMPT = 'a brass lantern on a stone table, candlelight';
const REPLY_TEXT = 'I sit down at the table and ask what happened here last night.';

const readArg = (args: string[], name: string, fallback: string | null = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

async function armTurnEvents(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const previous = globalThis.__soTurnTypes;
    for (const [eventName, handler] of previous?.handlers ?? []) ctx.eventSource.removeListener(eventName, handler);
    previous?.unsubscribeBoundary?.();
    const rt = globalThis.storyOrchestratorRuntime;
    if (previous?.originalAfterSpeak) rt.fireAfterSpeak = previous.originalAfterSpeak;
    const events = [];
    const commits = [];
    const afterSpeak = [];
    const at = (event) => (messageId, type) => events.push({ event, messageId, type: type ?? null, chatId: SillyTavern.getContext().chatId ?? null });
    const handlers = [
      [ctx.eventTypes.MESSAGE_RECEIVED, at('message_received')],
      [ctx.eventTypes.MESSAGE_SWIPED, at('message_swiped')],
    ];
    for (const [eventName, handler] of handlers) ctx.eventSource.on(eventName, handler);
    const unsubscribeBoundary = globalThis.storyOrchestratorRuntime.onBoundary((result) => {
      commits.push({ boundary: result.boundary, lastMessageId: result.context?.lastMessageId ?? null, storyId: globalThis.storyOrchestratorRuntime.getSnapshot().storyId ?? null, chatId: SillyTavern.getContext().chatId ?? null });
    });
    const originalAfterSpeak = rt.fireAfterSpeak;
    rt.fireAfterSpeak = function (...args) {
      afterSpeak.push({ storyId: rt.getSnapshot().storyId ?? null, chatId: SillyTavern.getContext().chatId ?? null });
      return originalAfterSpeak.apply(this, args);
    };
    globalThis.__soTurnTypes = { events, commits, afterSpeak, handlers, unsubscribeBoundary, originalAfterSpeak };
    return { armed: true };
  });
}

async function readTurnEvents(page) {
  return evaluateInST(page, () => [...(globalThis.__soTurnTypes?.events ?? [])]);
}

async function readCommits(page) {
  return evaluateInST(page, () => ({ commits: [...(globalThis.__soTurnTypes?.commits ?? [])], afterSpeak: [...(globalThis.__soTurnTypes?.afterSpeak ?? [])] }));
}

async function mark(page) {
  const { commits, afterSpeak } = await readCommits(page);
  return { events: (await readTurnEvents(page)).length, commits: commits.length, afterSpeak: afterSpeak.length };
}

async function since(page, from) {
  const { commits, afterSpeak } = await readCommits(page);
  return { events: (await readTurnEvents(page)).slice(from.events), commits: commits.slice(from.commits), afterSpeak: afterSpeak.slice(from.afterSpeak) };
}

async function disarmTurnEvents(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    for (const [eventName, handler] of globalThis.__soTurnTypes?.handlers ?? []) ctx.eventSource.removeListener(eventName, handler);
    globalThis.__soTurnTypes?.unsubscribeBoundary?.();
    if (globalThis.__soTurnTypes?.originalAfterSpeak) globalThis.storyOrchestratorRuntime.fireAfterSpeak = globalThis.__soTurnTypes.originalAfterSpeak;
    delete globalThis.__soTurnTypes;
    return { disarmed: true };
  });
}

async function readState(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const rt = globalThis.storyOrchestratorRuntime;
    const snapshot = rt.getSnapshot();
    const blob = ctx.chatMetadata?.story_orchestrator;
    const stories = blob?.stories ?? {};
    return {
      chatId: ctx.chatId ?? null,
      groupId: ctx.groupId ?? null,
      chatLength: ctx.chat?.length ?? 0,
      storyId: snapshot.storyId ?? null,
      boundary: rt.getEngineState()?.boundary ?? null,
      lastRollback: snapshot.lastRollback ?? null,
      persisted: {
        selectedStoryId: blob?.selectedStoryId ?? null,
        storyIds: Object.keys(stories),
        boundaries: Object.fromEntries(Object.entries(stories).map(([id, record]) => [id, (record as { engineState?: { boundary?: number } })?.engineState?.boundary ?? null])),
      },
    };
  });
}

async function readGroupChatBlob(page, chatId) {
  return evaluateInST(page, async (id) => {
    const ctx = SillyTavern.getContext();
    const response = await fetch('/api/chats/group/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ id }) });
    const data = await response.json().catch(() => []);
    const header = Array.isArray(data) && data.length && data[0]?.chat_metadata ? data[0] : null;
    return header?.chat_metadata?.story_orchestrator ?? null;
  }, chatId);
}

async function settle(page, quietMs = 2500) {
  await waitForIdle(page, 120000, { settleMs: quietMs });
  await page.waitForTimeout(1000);
}

async function waitForState(page, predicate, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let state = await readState(page);
  while (Date.now() < deadline && !predicate(state)) {
    await page.waitForTimeout(500);
    state = await readState(page);
  }
  return state;
}

async function libraryIds(page) {
  return evaluateInST(page, () => (globalThis.storyOrchestratorRuntime.getSnapshot().library ?? []).map((entry) => entry.id));
}

async function importCheckStory(page) {
  return evaluateInST(page, async (story) => globalThis.storyOrchestratorRuntime.importStory(JSON.stringify(story)), STORY);
}

async function postImage(page, mode) {
  if (mode !== 'synthetic') {
    const viaSd = await evaluateInST(page, async (prompt) => {
      const ctx = SillyTavern.getContext();
      const before = ctx.chat.length;
      try {
        await ctx.executeSlashCommandsWithOptions(`/sd quiet=false ${prompt}`);
      } catch (error) {
        return { ok: false, error: String(error) };
      }
      const messageId = ctx.chat.length - 1;
      const media = ctx.chat[messageId]?.extra?.media;
      return { ok: ctx.chat.length > before && Array.isArray(media) && media.length > 0, messageId, before, after: ctx.chat.length, url: media?.[0]?.url ?? null };
    }, IMAGE_PROMPT);
    if (viaSd.ok) return { via: 'sd', ...viaSd };
    if (mode === 'sd') throw new Error(`/sd did not post an image: ${JSON.stringify(viaSd)}`);
  }
  const synthetic = await evaluateInST(page, async (prompt) => {
    const ctx = SillyTavern.getContext();
    const message = {
      name: ctx.groupId ? 'System' : ctx.name2,
      is_user: false,
      is_system: false,
      send_date: new Date().toISOString(),
      mes: prompt,
      extra: { media: [{ url: '/img/ai4.png', type: 'image', title: prompt, source: 'generated' }], media_display: 'gallery', media_index: 0, inline_image: false },
    };
    ctx.chat.push(message);
    const messageId = ctx.chat.length - 1;
    await ctx.eventSource.emit(ctx.eventTypes.MESSAGE_RECEIVED, messageId, 'extension');
    ctx.addOneMessage(message);
    await ctx.eventSource.emit(ctx.eventTypes.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    await ctx.saveChat();
    return { ok: true, messageId };
  }, IMAGE_PROMPT);
  return { via: 'synthetic', ...synthetic };
}

async function deleteMirrorBooks(page, chatIds) {
  return evaluateInST(page, async ({ title, ids }) => {
    const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js' as string) as { updateWorldInfoList: () => Promise<void>; deleteWorldInfo: (name: string) => Promise<boolean> };
    await wi.updateWorldInfoList();
    const deleted = [];
    for (const id of ids) {
      const name = `Story Orchestrator - ${title} - ${id}`;
      if (await wi.deleteWorldInfo(name)) deleted.push(name);
    }
    return deleted;
  }, { title: STORY.title, ids: chatIds });
}

export async function runTurnTypesCheck(page, { group = 'AdolionGroup', image = 'auto', skipReply = false, skipImage = false, keep = false } = {}) {
  const checks = [];
  const record = (id, ok, detail) => { checks.push({ id, ok: Boolean(ok), detail }); };
  const skipped: Array<{ id: string; why: string }> = [];
  const result: Record<string, unknown> = { ok: false, checks, skipped };
  let guard = null;
  let importedStory = false;
  await page.waitForFunction(() => Boolean(globalThis.storyOrchestratorRuntime), null, { timeout: 15000 });
  await armTurnEvents(page);
  try {
    await openGroup(page, group);
    const sandbox = await beginSandboxSession(page);
    guard = sandbox.guard;
    await settle(page, 1500);
    importedStory = !(await libraryIds(page)).includes(STORY.id);
    await assertInSandbox(page, guard, 'before import');
    if (!(await importCheckStory(page))) throw new Error('importStory failed');
    let state = await readState(page);
    record('setup', state.storyId === STORY.id && state.boundary === 0, { sandboxChatId: guard.sandboxChatId, state });

    if (!skipImage) {
      const before = state;
      const from = await mark(page);
      const posted = await postImage(page, image);
      await settle(page);
      await assertInSandbox(page, guard, 'after the image post');
      state = await readState(page);
      const { events, commits, afterSpeak } = await since(page, from);
      const extensionEvent = events.find((event) => event.event === 'message_received' && event.type === 'extension' && event.messageId === posted.messageId);
      record('b-image', Boolean(extensionEvent) && commits.length === 0 && afterSpeak.length === 0 && state.boundary === before.boundary, { posted, extensionEvent: extensionEvent ?? null, commits, afterSpeak, boundaryBefore: before.boundary, boundaryAfter: state.boundary, events });
    }

    if (!skipReply) {
      const before = state;
      const from = await mark(page);
      const sent = await sendUserMessage(page, REPLY_TEXT, { idleTimeoutMs: 300000 });
      await waitForState(page, (current) => (current.boundary ?? 0) > (before.boundary ?? 0), 60000);
      await settle(page, 5000);
      await assertInSandbox(page, guard, 'after the reply');
      state = await readState(page);
      const { events, commits, afterSpeak } = await since(page, from);
      const replies = events.filter((event) => event.event === 'message_received');
      const replyIds = [...new Set(replies.map((event) => event.messageId))];
      const onePerReply = commits.length === replyIds.length && commits.every((commit, index) => commit.lastMessageId === replyIds[index]);
      record('a-reply', replyIds.length > 0 && onePerReply && afterSpeak.length > 0 && state.boundary === (before.boundary ?? 0) + replyIds.length, { sent, replies, replyIds, commits, afterSpeak, boundaryBefore: before.boundary, boundaryAfter: state.boundary });
    }

    const origin = await assertInSandbox(page, guard, 'before the new group chat');
    const originState = state;
    const chatsBefore = (await readActiveChat(page)).groupChats;
    const from = await mark(page);
    await startNewGroupSession(page);
    const adopted = await adoptNewSandboxChat(page, guard, chatsBefore);
    if (!adopted.adopted) throw new Error(`the new group chat was not adopted into the sandbox: ${JSON.stringify(adopted)}`);
    await settle(page, 2500);
    await assertInSandbox(page, guard, 'in the new group chat');
    const fresh = await readState(page);
    const onDisk = await readGroupChatBlob(page, adopted.adopted);
    const newChat = await since(page, from);
    const greetings = newChat.events.filter((event) => event.event === 'message_received' && event.type === 'first_message');
    const leakedOnDisk = Boolean(onDisk?.selectedStoryId) || Object.keys(onDisk?.stories ?? {}).length > 0;
    record('c-greetings', greetings.length > 0 && newChat.commits.length === 0 && newChat.afterSpeak.length === 0 && fresh.storyId === null && fresh.persisted.selectedStoryId === null && fresh.persisted.storyIds.length === 0 && !leakedOnDisk, { newChatId: adopted.adopted, greetings, commits: newChat.commits, afterSpeak: newChat.afterSpeak, onDisk: onDisk ? { selectedStoryId: onDisk.selectedStoryId ?? null, storyIds: Object.keys(onDisk.stories ?? {}) } : null, state: fresh });
    await openChat(page, origin.chatId);
    await assertInSandbox(page, guard, 'back in the original chat');
    const reopened = await waitForState(page, (current) => current.storyId === STORY.id, 15000);
    record('c-origin', reopened.storyId === STORY.id && reopened.boundary === originState.boundary && reopened.persisted.boundaries[STORY.id] === originState.boundary, { boundaryBefore: originState.boundary, state: reopened });

    // --- e-*: turn IDENTITY (R10/R11, v2.3 plan 03). Event-level on purpose: these are about
    // which events the bridge treats as one turn, not about what a model says, so they need no
    // backend and they stay meaningful when one is unavailable.
    const emitRendered = async (id) => evaluateInST(page, async (messageId) => {
      const context = SillyTavern.getContext();
      await context.eventSource.emit(context.eventTypes.CHARACTER_MESSAGE_RENDERED, messageId, 'normal');
    }, id);
    const emitReceived = async (id) => evaluateInST(page, async (messageId) => {
      const context = SillyTavern.getContext();
      await context.eventSource.emit(context.eventTypes.MESSAGE_RECEIVED, messageId, 'normal');
    }, id);
    const emitSwiped = async (id) => evaluateInST(page, async (messageId) => {
      const context = SillyTavern.getContext();
      await context.eventSource.emit(context.eventTypes.MESSAGE_SWIPED, messageId);
    }, id);

    const lastId = await evaluateInST(page, () => (SillyTavern.getContext().chat?.length ?? 1) - 1);

    const dupFrom = await mark(page);
    await emitReceived(lastId);
    await emitRendered(lastId);
    await settle(page, 1200);
    const dup = await since(page, dupFrom);
    record('e-duplicate', dup.afterSpeak.length === 1, { note: 'two events for one message id are one accepted turn', afterSpeak: dup.afterSpeak, commits: dup.commits, messageId: lastId });

    const slowFrom = await mark(page);
    await emitRendered(lastId);
    await settle(page, 1200);
    const slow = await since(page, slowFrom);
    record('e-slow-listener', slow.afterSpeak.length === 0, { note: 'a repeat of the same id is one turn however late it arrives — identity, not elapsed time', commits: slow.commits, messageId: lastId });

    const swipeIdFrom = await mark(page);
    await emitSwiped(lastId);
    await emitRendered(lastId);
    await settle(page, 1200);
    const reswipe = await since(page, swipeIdFrom);
    record('e-swipe-same-id', reswipe.afterSpeak.length === 1, { note: 'a swipe gives the same id new content, so the re-render is a new turn', commits: reswipe.commits, messageId: lastId });

    // Needs TWO REAL message ids that this run has not already accepted. The first version emitted
    // lastId+101/+102, which name no message: the engine saw the same lastMessageId both times and
    // committed once, so the check failed for a reason that had nothing to do with turn identity.
    // The second version emitted lastId-1 and lastId — and by this point lastId has already been
    // accepted by e-duplicate and re-admitted by e-swipe-same-id, so the second emit is a duplicate
    // of a committed turn under an identity-keyed bridge (and under the old elapsed-time rule it
    // fell inside the 250 ms window and was dropped). Both readings give one accepted turn, and
    // neither says anything about distinct ids. Two freshly appended messages are what the check
    // means by "two turns" (2026-09-21).
    const appendQuiet = async (text) => evaluateInST(page, async (body) => {
      const context = SillyTavern.getContext();
      context.chat.push({ name: 'System', is_user: false, is_system: false, send_date: new Date().toISOString(), mes: body, extra: {} });
      await context.saveChat();
      return context.chat.length - 1;
    }, text);

    const rapidFirst = await appendQuiet('rapid one');
    const rapidSecond = await appendQuiet('rapid two');
    const rapidFrom = await mark(page);
    await emitRendered(rapidFirst);
    await emitRendered(rapidSecond);
    await settle(page, 1200);
    const rapid = await since(page, rapidFrom);
    // Measured on afterSpeak, not on commits. TurnBridge calls fireAfterSpeak once per turn it
    // ACCEPTS, which is the decision R10 is about; the boundary underneath is then collapsed by
    // the engine when the chat has not actually advanced, so counting commits here reported one
    // and said nothing about identity (2026-09-20).
    record('e-distinct-rapid', rapid.afterSpeak.length === 2, { note: 'two different ids inside the old 250ms window are two accepted turns', afterSpeak: rapid.afterSpeak, commits: rapid.commits, ids: [rapidFirst, rapidSecond] });

    result.ok = checks.every((check) => check.ok);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.ok = false;
  } finally {
    const cleanup: Record<string, unknown> = {};
    if (!keep) {
      if (guard && !guard.escaped) {
        try {
          await openGroup(page, group);
          const back = await readActiveChat(page);
          if (!guard.owned.includes(back.chatId)) await openChat(page, guard.owned[guard.owned.length - 1]);
          await assertInSandbox(page, guard, 'before cleanup');
          cleanup.sandbox = await deleteSandboxChats(page, guard);
          cleanup.mirrorBooks = await deleteMirrorBooks(page, guard.owned);
          cleanup.reapPrompts = await settleReapPrompts(page, guard.owned);
        } catch (error) {
          cleanup.error = error instanceof Error ? error.message : String(error);
        }
      } else if (guard?.escaped) {
        cleanup.error = `sandbox escaped to ${guard.escaped}; nothing deleted`;
      }
      if (importedStory) {
        cleanup.story = await evaluateInST(page, async (id) => globalThis.storyOrchestratorRuntime.removeStory(id), STORY.id).catch((error) => String(error));
      }
    } else {
      cleanup.kept = { owned: guard?.owned ?? [] };
    }
    await disarmTurnEvents(page).catch(() => undefined);
    result.cleanup = cleanup;
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  const args = stripCommonArgs();
  const image = readArg(args, '--image', 'auto');
  if (!['sd', 'synthetic', 'auto'].includes(image)) {
    console.log(USAGE);
    process.exit(1);
  }
  runCli(async (page) => {
    const result = await runTurnTypesCheck(page, {
      group: readArg(args, '--group', 'AdolionGroup'),
      image,
      skipReply: args.includes('--skip-reply'),
      skipImage: args.includes('--skip-image'),
      keep: args.includes('--keep'),
    });
    const summary = { ok: result.ok, error: result.error ?? null, checks: (result.checks as Array<{ id: string; ok: boolean }>).map(({ id, ok }) => ({ id, ok })), cleanup: result.cleanup };
    console.log(JSON.stringify(summary, null, 2));
    await writeJSON(result, 'so-turn-types-check');
    return result;
  });
}
