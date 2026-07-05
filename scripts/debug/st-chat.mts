// Inspect chat messages and metadata from the running SillyTavern instance.
//
// getChatMessages returns the last N messages with truncated content.
// getChatMetadata returns the full chat_metadata object.

import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

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
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
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
  });
}
