// Inspect chat messages and metadata from the running SillyTavern instance.
//
// getChatMessages returns the last N messages with truncated content.
// getChatMetadata returns the full chat_metadata object.

import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

export async function getChatMessages(page, count = 10) {
  return evaluateInST(page, (n) => {
    const ctx = SillyTavern.getContext();
    const chat = ctx.chat || [];
    const slice = chat.slice(-n);
    const startIndex = chat.length - slice.length;
    return slice.map((m, i) => ({
      index: startIndex + i,
      name: m.name,
      is_user: m.is_user,
      mes: typeof m.mes === 'string' ? m.mes.slice(0, 200) : m.mes,
      send_date: m.send_date,
    }));
  }, count);
}

export async function getChatMetadata(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return ctx.chatMetadata ?? null;
  });
}

const USAGE = `Usage: node st-chat.mjs [count|metadata]

No args or count: print last N messages (default 10).
metadata: print full chat_metadata object.`;

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

      const subcommand = process.argv[2];

      if (subcommand === 'metadata') {
        const meta = await getChatMetadata(page);
        console.log(JSON.stringify(meta, null, 2));
        await writeJSON(meta, 'chat-metadata');
      } else {
        const count = subcommand ? parseInt(subcommand, 10) || 10 : 10;
        const messages = await getChatMessages(page, count);
        console.log(JSON.stringify(messages, null, 2));
        await writeJSON(messages, 'chat-messages');
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
