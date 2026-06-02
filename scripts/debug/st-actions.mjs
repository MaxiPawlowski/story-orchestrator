// Chat and generation debug tools for SillyTavern via Playwright.
//
// WARNING: sendUserMessage triggers real LLM generation. Use with care.
// The /checkpoint slash command is registered by Story Orchestrator.
//
// All action functions call waitForIdle after triggering generation.

import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

export async function getGenerationState(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const sp = ctx.streamingProcessor;
    const isGenerating = sp
      ? (sp.isFinished === false || sp.isStopped === false)
      : false;

    return {
      isGenerating,
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
    // generation may not have been triggered — that's fine
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

const USAGE = `Usage: node st-actions.mjs <action> [args...]

Actions:
  generation-state              Check if generation is in progress
  wait-idle [timeout_ms]        Wait until generation finishes (default 30s)
  send <text>                   Send a user message (triggers LLM generation!)
  slash <command>               Execute a slash command (e.g. "/checkpoint list")
  checkpoint <id_or_index>      Activate a checkpoint by id or 1-based index
  checkpoint list               List checkpoints via /checkpoint list
  checkpoint eval               Queue arbiter evaluation via /checkpoint eval`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const action = process.argv[2];
    if (!action || action === '--help' || action === '-h') {
      console.log(USAGE);
      process.exit(0);
    }

    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);

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
        default:
          console.error(`Unknown action: ${action}`);
          console.log(USAGE);
          process.exitCode = 1;
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) browser.close();
    }
  })();
}
