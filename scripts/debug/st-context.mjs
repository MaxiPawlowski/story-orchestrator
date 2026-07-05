// Dump SillyTavern's getContext() API - the canonical runtime inspection surface.
//
// Provides a filtered default summary (safe for large chats) and per-key deep extraction.

import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

export async function dumpSTContext(page, keys) {
  if (keys && keys.length > 0) {
    return evaluateInST(page, (requestedKeys) => {
      const ctx = SillyTavern.getContext();
      const result = {};
      for (const k of requestedKeys) {
        const val = ctx[k];
        if (typeof val === 'function') {
          result[k] = '[function]';
        } else {
          try { JSON.stringify(val); result[k] = val; }
          catch { result[k] = '[non-serializable]'; }
        }
      }
      return result;
    }, keys);
  }

  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const chat = ctx.chat || [];
    const lastMessages = chat.slice(-3).map((m) => ({
      name: m.name,
      is_user: m.is_user,
      mes: typeof m.mes === 'string' ? m.mes.slice(0, 200) : m.mes,
      send_date: m.send_date,
    }));

    const characters = (ctx.characters || []).map((c) => c.name || c.avatar);
    const groups = (ctx.groups || []).map((g) => g.name || g.id);

    return {
      chatId: ctx.chatId,
      groupId: ctx.groupId,
      name1: ctx.name1,
      name2: ctx.name2,
      mainApi: ctx.mainApi,
      onlineStatus: ctx.onlineStatus,
      chat: { length: chat.length, lastMessages },
      characters,
      groups,
    };
  });
}

export async function getSTContextKey(page, key) {
  return evaluateInST(page, (k) => {
    const ctx = SillyTavern.getContext();
    const val = ctx[k];
    if (typeof val === 'function') return '[function]';
    try { JSON.stringify(val); return val; }
    catch { return '[non-serializable]'; }
  }, key);
}

const USAGE = `Usage: node st-context.mjs [key1 key2 ...]

No args: print summary (chatId, groupId, name1, name2, mainApi, recent messages).
With keys: print those specific getContext() fields.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  (async () => {
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);

      const keys = process.argv.slice(2);
      const data = keys.length > 0
        ? await dumpSTContext(page, keys)
        : await dumpSTContext(page);

      console.log(JSON.stringify(data, null, 2));
      await writeJSON(data, 'st-context');
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
