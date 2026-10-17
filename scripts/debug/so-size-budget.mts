import fs from 'node:fs';
import path from 'node:path';
import { blobBytesOf, settingsSizes, summarize, type DataRootSizes } from './lib/sizeBudget.mts';

const usage = 'node scripts/debug/so-size-budget.mts <data/default-user dir>... [--out <file>]';
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : null;
const roots = args.filter((arg, index) => arg !== '--out' && index !== outAt + 1);
if (!roots.length) {
  console.error(usage);
  process.exit(2);
}

const firstLine = (file: string): string => {
  const fd = fs.openSync(file, 'r');
  try {
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(1 << 20);
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read <= 0) break;
      const newline = buffer.subarray(0, read).indexOf(10);
      if (newline >= 0) { chunks.push(Buffer.from(buffer.subarray(0, newline))); break; }
      chunks.push(Buffer.from(buffer.subarray(0, read)));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
};

const chatFiles = (root: string): string[] => ['chats', 'group chats'].flatMap((dir) => {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join((entry as { parentPath?: string }).parentPath ?? base, entry.name));
});

const measure = (root: string): DataRootSizes => {
  const settingsFile = path.join(root, 'settings.json');
  const settingsText = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : 'null';
  const blobs: number[] = [];
  let maxChatBytes = 0;
  const files = chatFiles(root);
  for (const file of files) {
    maxChatBytes = Math.max(maxChatBytes, fs.statSync(file).size);
    let header: unknown = null;
    try { header = JSON.parse(firstLine(file)); } catch { header = null; }
    const bytes = blobBytesOf(header);
    if (bytes) blobs.push(bytes);
  }
  return {
    root, settingsBytes: Buffer.byteLength(settingsText, 'utf8'), ...settingsSizes(JSON.parse(settingsText)),
    chats: files.length, chatsWithStory: blobs.length, maxChatBytes, maxBlobBytes: Math.max(0, ...blobs), blobBytes: blobs,
  };
};

const rows = roots.map(measure);
const result = { measuredAt: new Date().toISOString(), summary: summarize(rows), rows: rows.map(({ blobBytes, ...row }) => ({ ...row, root: row.root.split(path.sep).join('/').replace(/^.*?\/dev\//, '').replace(/\/data\/default-user\/?$/, '') })) };
const text = `${JSON.stringify(result, null, 2)}\n`;
if (out) fs.writeFileSync(out, text);
process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
