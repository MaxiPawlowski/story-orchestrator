import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { openMostRecentGroupChat, startNewGroupSession } from './st-navigation.mts';
import { deleteMessage, editMessage, executeSlashCommand, sendCompactMessage, swipeMessage } from './st-actions.mts';

const USAGE = `Usage: node scripts/debug/so-mutation-check.mts [--keep]

Creates a scratch group chat, prepares one multi-swipe message, runs swipe/edit/delete,
and verifies ST emitted MESSAGE_SWIPED, MESSAGE_EDITED, and MESSAGE_DELETED.`;

async function armMutationEvents(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const previous = globalThis.__soMutationDebug;
    if (previous?.handlers) {
      for (const [eventName, handler] of previous.handlers) {
        ctx.eventSource.removeListener?.(eventName, handler);
        ctx.eventSource.off?.(eventName, handler);
      }
    }
    const events = [];
    const handlers = [
      [ctx.eventTypes.MESSAGE_SWIPED, (messageId) => events.push({ type: 'message_swiped', messageId })],
      [ctx.eventTypes.MESSAGE_EDITED, (messageId) => events.push({ type: 'message_edited', messageId })],
      [ctx.eventTypes.MESSAGE_DELETED, (messageId) => events.push({ type: 'message_deleted', messageId })],
    ];
    for (const [eventName, handler] of handlers) ctx.eventSource.on(eventName, handler);
    globalThis.__soMutationDebug = { events, handlers };
    return { armed: true };
  });
}

async function readMutationEvents(page) {
  return evaluateInST(page, () => globalThis.__soMutationDebug?.events ?? []);
}

async function prepareMultiSwipeMessage(page) {
  await sendCompactMessage(page, 'Mutation gate base message.');
  return evaluateInST(page, async () => {
    const ctx = SillyTavern.getContext();
    const messageId = (ctx.chat?.length ?? 0) - 1;
    const message = ctx.chat?.[messageId];
    if (!message) throw new Error('No message was created.');
    message.swipe_id = 0;
    message.swipes = [message.mes, 'Mutation gate alternate swipe.'];
    message.swipe_info = [
      { send_date: message.send_date, gen_started: message.gen_started, gen_finished: message.gen_finished, extra: structuredClone(message.extra ?? {}) },
      { send_date: message.send_date, gen_started: message.gen_started, gen_finished: message.gen_finished, extra: structuredClone(message.extra ?? {}) },
    ];
    await ctx.updateMessageBlock?.(messageId, message);
    await ctx.saveChat?.();
    return { messageId, swipeCount: message.swipes.length };
  });
}

function assertEvent(events, type, messageId) {
  if (!events.some((event) => event.type === type && Number(event.messageId) === Number(messageId))) {
    throw new Error(`Missing ${type} event for message ${messageId}: ${JSON.stringify(events)}`);
  }
}

export async function runMutationCheck(page, { keep = false } = {}) {
  const opened = await openMostRecentGroupChat(page);
  const scratch = await startNewGroupSession(page);
  await armMutationEvents(page);
  const prepared = await prepareMultiSwipeMessage(page);
  const swiped = await swipeMessage(page, prepared.messageId, 1);
  const edited = await editMessage(page, prepared.messageId, 'Mutation gate edited message.');
  const deleted = await deleteMessage(page, prepared.messageId);
  const events = await readMutationEvents(page);
  assertEvent(events, 'message_swiped', prepared.messageId);
  assertEvent(events, 'message_edited', prepared.messageId);
  assertEvent(events, 'message_deleted', prepared.messageId);
  const result: Record<string, unknown> = { ok: true, opened, scratch, prepared, swiped, edited, deleted, events };
  if (!keep) {
    try { result.cleanup = await executeSlashCommand(page, '/delchat'); }
    catch (err) { result.cleanup = { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    const result = await runMutationCheck(page, { keep: process.argv.includes('--keep') });
    console.log(JSON.stringify(result, null, 2));
    await writeJSON(result, 'so-mutation-check');
  });
}
