// Chat and generation debug tools for SillyTavern via Playwright.
//
// WARNING: sendUserMessage triggers real LLM generation. Use with care.
// The /checkpoint slash command is registered by Story Orchestrator.
//
// All action functions call waitForIdle after triggering generation.

import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

export async function getGenerationState(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const sp = ctx.streamingProcessor;
    const sendButton = document.getElementById('send_but') as HTMLButtonElement | null;
    const sendButtonDisabled = Boolean(sendButton?.disabled || sendButton?.classList?.contains('disabled'));
    const isGenerating = sp
      ? (sp.isFinished === false || sp.isStopped === false)
      : sendButtonDisabled;

    return {
      isGenerating,
      sendButtonDisabled,
      streamingProcessor: sp ? {
        isFinished: sp.isFinished ?? null,
        isStopped: sp.isStopped ?? null,
        generator: sp.generator ? 'active' : null,
      } : null,
    };
  });
}

export async function waitForIdle(page, timeout = 30000) {
  const pollInterval = 500;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const state = await getGenerationState(page);
    if (!state.isGenerating) return state;
    await page.waitForTimeout(pollInterval);
  }

  const finalState = await getGenerationState(page);
  if (!finalState.isGenerating) return finalState;
  throw new Error(`Generation still active after ${timeout}ms timeout.`);
}

export async function sendCompactMessage(page, text) {
  if (!text || typeof text !== 'string') {
    throw new Error('sendCompactMessage requires a non-empty text string.');
  }
  return executeSlashCommand(page, `/send compact=true ${text}`);
}

export async function sendUserMessage(page, text) {
  if (!text || typeof text !== 'string') {
    throw new Error('sendUserMessage requires a non-empty text string.');
  }

  await waitForIdle(page, 10000);

  const textarea = page.locator('#send_textarea');
  if (!(await textarea.count())) {
    throw new Error('Chat textarea (#send_textarea) not found.');
  }

  const chatLenBefore = await evaluateInST(page, () => {
    return SillyTavern.getContext().chat?.length ?? 0;
  });

  await textarea.fill(text);
  await textarea.dispatchEvent('input');

  const sendBtn = page.locator('#send_but');
  if (!(await sendBtn.count())) {
    throw new Error('Send button (#send_but) not found.');
  }
  await sendBtn.click();

  await waitForIdle(page, 60000);

  const chatLenAfter = await evaluateInST(page, () => {
    return SillyTavern.getContext().chat?.length ?? 0;
  });

  return {
    sent: text,
    messagesBefore: chatLenBefore,
    messagesAfter: chatLenAfter,
    newMessages: chatLenAfter - chatLenBefore,
  };
}

export async function triggerGroupMember(page, member) {
  if (!member || typeof member !== 'string') {
    throw new Error('triggerGroupMember requires a group member name or 0-based index.');
  }

  await waitForIdle(page, 10000);

  const before = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return { groupId: ctx.groupId, chatLength: ctx.chat?.length ?? 0 };
  });
  if (!before.groupId) throw new Error('No active group chat. trigger requires an open group.');

  await evaluateInST(page, async (arg) => {
    const ctx = SillyTavern.getContext();
    await ctx.executeSlashCommandsWithOptions(`/trigger await=true ${arg}`);
  }, member);

  await waitForIdle(page, 120000);

  const after = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const last = ctx.chat?.[ctx.chat.length - 1];
    return {
      chatLength: ctx.chat?.length ?? 0,
      lastSpeaker: last?.name ?? null,
      lastMessage: (last?.mes ?? '').slice(0, 200),
    };
  });

  return {
    triggered: member,
    messagesBefore: before.chatLength,
    messagesAfter: after.chatLength,
    newMessages: after.chatLength - before.chatLength,
    lastSpeaker: after.lastSpeaker,
    lastMessage: after.lastMessage,
  };
}

export async function executeSlashCommand(page, command) {
  if (!command || typeof command !== 'string') {
    throw new Error('executeSlashCommand requires a non-empty command string.');
  }

  const chatLenBefore = await evaluateInST(page, () => {
    return SillyTavern.getContext().chat?.length ?? 0;
  });

  const result = await evaluateInST(page, async (cmd) => {
    const ctx = SillyTavern.getContext();
    try {
      const res = await ctx.executeSlashCommandsWithOptions(cmd);
      return {
        ok: true,
        pipe: typeof res?.pipe === 'string' ? res.pipe.slice(0, 500) : null,
      };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }, command);

  try {
    await waitForIdle(page, 15000);
  } catch {
    // generation may not have been triggered - that's fine
  }

  const chatLenAfter = await evaluateInST(page, () => {
    return SillyTavern.getContext().chat?.length ?? 0;
  });

  return {
    command,
    ...result,
    messagesBefore: chatLenBefore,
    messagesAfter: chatLenAfter,
    newMessages: chatLenAfter - chatLenBefore,
  };
}

export async function triggerCheckpoint(page, idOrIndex) {
  if (idOrIndex === undefined || idOrIndex === null || idOrIndex === '') {
    throw new Error('triggerCheckpoint requires an id or index argument.');
  }
  const cmd = `/checkpoint ${idOrIndex}`;
  return executeSlashCommand(page, cmd);
}

export async function swipeMessage(page, messageId, targetSwipeId = null) {
  return evaluateInST(page, async ({ messageId: rawId, targetSwipeId: rawSwipeId }) => {
    const ctx = SillyTavern.getContext();
    const id = rawId === 'last' ? (ctx.chat?.length ?? 0) - 1 : Number(rawId);
    const message = ctx.chat?.[id];
    if (!Number.isInteger(id) || !message) throw new Error(`Message ${rawId} not found.`);
    const current = Number(message.swipe_id ?? 0);
    const target = rawSwipeId === null || rawSwipeId === undefined
      ? current + 1
      : Number(rawSwipeId);
    if (!Array.isArray(message.swipes) || target >= message.swipes.length) {
      throw new Error(`Message ${id} has no deterministic swipe ${target}. Create a multi-swipe message or pass an existing swipe id.`);
    }
    const seen = [];
    const handler = (value) => seen.push(value);
    ctx.eventSource.on(ctx.eventTypes.MESSAGE_SWIPED, handler);
    try {
      await ctx.swipe.to(null, target > current ? 'right' : 'left', {
        source: 'swipe_picker',
        forceMesId: id,
        forceSwipeId: target,
        forceDuration: 0,
      });
    } finally {
      ctx.eventSource.removeListener?.(ctx.eventTypes.MESSAGE_SWIPED, handler);
      ctx.eventSource.off?.(ctx.eventTypes.MESSAGE_SWIPED, handler);
    }
    return {
      messageId: id,
      previousSwipeId: current,
      swipeId: ctx.chat[id]?.swipe_id ?? null,
      eventPayloads: seen,
    };
  }, { messageId, targetSwipeId });
}

export async function editMessage(page, messageId, text) {
  if (!text || typeof text !== 'string') throw new Error('edit requires non-empty text.');
  return evaluateInST(page, async ({ messageId: rawId, text }) => {
    const ctx = SillyTavern.getContext();
    const id = rawId === 'last' ? (ctx.chat?.length ?? 0) - 1 : Number(rawId);
    const message = ctx.chat?.[id];
    if (!Number.isInteger(id) || !message) throw new Error(`Message ${rawId} not found.`);
    const before = message.mes;
    message.mes = text;
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id)) {
      message.swipes[message.swipe_id] = text;
    }
    await ctx.updateMessageBlock?.(id, message);
    await ctx.saveChat?.();
    await ctx.eventSource.emit(ctx.eventTypes.MESSAGE_EDITED, id);
    return { messageId: id, before, after: text };
  }, { messageId, text });
}

export async function deleteMessage(page, messageId) {
  return evaluateInST(page, async (rawId) => {
    const ctx = SillyTavern.getContext();
    const id = rawId === 'last' ? (ctx.chat?.length ?? 0) - 1 : Number(rawId);
    if (!Number.isInteger(id) || id < 0 || id >= (ctx.chat?.length ?? 0)) throw new Error(`Message ${rawId} not found.`);
    const beforeLength = ctx.chat.length;
    const removed = ctx.chat.slice(id).map((message) => ({ name: message.name, mes: String(message.mes ?? '').slice(0, 120) }));
    ctx.chat.length = id;
    if (ctx.chatMetadata) ctx.chatMetadata.tainted = true;
    document.querySelectorAll(`.mes[mesid]`).forEach((element) => {
      const elementId = Number(element.getAttribute('mesid'));
      if (elementId >= id) element.remove();
    });
    await ctx.saveChat?.();
    await ctx.eventSource.emit(ctx.eventTypes.MESSAGE_DELETED, id);
    return { messageId: id, beforeLength, afterLength: ctx.chat.length, removed };
  }, messageId);
}

export async function getWIStatus(page, book, comment) {
  return evaluateInST(page, async ({ book, comment }) => {
    const ctx = SillyTavern.getContext();
    const lorebook = await ctx.loadWorldInfo(book);
    if (!lorebook?.entries) return { book, comment, exists: false, enabled: false, disabled: null, uid: null };
    const entry: any = Object.values(lorebook.entries as Record<string, any>).find((entry: any) => entry?.comment?.trim() === comment.trim());
    return {
      book,
      comment,
      exists: Boolean(entry),
      enabled: entry ? entry.disable !== true : false,
      disabled: entry ? entry.disable === true : null,
      uid: entry?.uid ?? null,
    };
  }, { book, comment });
}

const USAGE = `Usage: node st-actions.mjs <action> [args...]

Actions:
  generation-state              Check if generation is in progress
  wait-idle [timeout_ms]        Wait until generation finishes (default 30s)
  send <text>                   Send a user message (triggers LLM generation!)
  send-compact <text>           Add a message via /send compact=true (no generation)
  trigger <member>              Draft a specific group member (/trigger await=true; real generation!)
  slash <command>               Execute a slash command (e.g. "/checkpoint list")
  checkpoint <id_or_index>      Activate a checkpoint by id or 1-based index
  checkpoint list               List checkpoints via /checkpoint list
  checkpoint eval               Queue arbiter evaluation via /checkpoint eval
  swipe <messageId> [swipeId]   Switch to an existing swipe and emit MESSAGE_SWIPED
  edit <messageId> <text>       Edit a message and emit MESSAGE_EDITED
  delete <messageId>            Delete message and later messages, emit MESSAGE_DELETED
  wi-status <book> <comment>    Report WI entry exists/enabled state`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (!action || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }

  runCli(async (page) => {
    switch (action) {
      case 'generation-state': {
        const state = await getGenerationState(page);
        console.log(JSON.stringify(state, null, 2));
        await writeJSON(state, 'st-generation-state');
        break;
      }
      case 'wait-idle': {
        const timeout = process.argv[3] ? Number(process.argv[3]) : 30000;
        const state = await waitForIdle(page, timeout);
        console.log('Idle:', JSON.stringify(state, null, 2));
        break;
      }
      case 'send': {
        const text = process.argv.slice(3).join(' ');
        if (!text) { console.error('Missing message text.'); process.exitCode = 1; break; }
        console.log(`Sending: "${text}"`);
        const result = await sendUserMessage(page, text);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-send-result');
        break;
      }
      case 'send-compact': {
        const text = process.argv.slice(3).join(' ');
        if (!text) { console.error('Missing message text.'); process.exitCode = 1; break; }
        const result = await sendCompactMessage(page, text);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-send-compact-result');
        break;
      }
      case 'trigger': {
        const member = process.argv.slice(3).join(' ');
        if (!member) { console.error('Missing group member name or index.'); process.exitCode = 1; break; }
        const result = await triggerGroupMember(page, member);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-trigger-result');
        break;
      }
      case 'slash': {
        const cmd = process.argv.slice(3).join(' ');
        if (!cmd) { console.error('Missing slash command.'); process.exitCode = 1; break; }
        const result = await executeSlashCommand(page, cmd);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-slash-result');
        break;
      }
      case 'checkpoint': {
        const arg = process.argv.slice(3).join(' ');
        if (!arg) { console.error('Missing checkpoint id/index.'); process.exitCode = 1; break; }
        const result = await triggerCheckpoint(page, arg);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-checkpoint-result');
        break;
      }
      case 'swipe': {
        const messageId = Number(process.argv[3]);
        const swipeId = process.argv[4] === undefined ? null : Number(process.argv[4]);
        const result = await swipeMessage(page, messageId, swipeId);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-swipe-result');
        break;
      }
      case 'edit': {
        const messageId = Number(process.argv[3]);
        const text = process.argv.slice(4).join(' ');
        const result = await editMessage(page, messageId, text);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-edit-result');
        break;
      }
      case 'delete': {
        const messageId = Number(process.argv[3]);
        const result = await deleteMessage(page, messageId);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-delete-result');
        break;
      }
      case 'wi-status': {
        const book = process.argv[3];
        const comment = process.argv.slice(4).join(' ');
        if (!book || !comment) { console.error('wi-status requires <book> <comment>.'); process.exitCode = 1; break; }
        const result = await getWIStatus(page, book, comment);
        console.log(JSON.stringify(result, null, 2));
        await writeJSON(result, 'st-wi-status');
        break;
      }
      default:
        console.error(`Unknown action: ${action}`);
        console.log(USAGE);
        process.exitCode = 1;
    }
  });
}
