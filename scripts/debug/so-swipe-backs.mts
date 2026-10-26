import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupsFor, countChat, parseChatJsonl, report, type Snapshot } from './lib/swipeBacks.mts';

const USAGE = `Usage: node scripts/debug/so-swipe-backs.mts <chat.jsonl> [<chat.jsonl> ...] [--backups <dir> | --no-backups]

v3.0 01 SP1 S4 (owner decision 2026-10-26 item 12): natural swipe-backs per 100 player turns over the owner's own play.
Offline, read-only: reads SillyTavern chat files (a group chat lives in <data>/group chats/<chat id>.jsonl) and, unless
--no-backups, that chat's own backups (chat_<key>_<stamp>.jsonl in --backups, default <data>/backups next to the chat
folder), oldest first, the chat file last. A swipe-back = a reply whose shown version moved to an earlier one it already
had: its swipe index went down between two saves, or it gained a version and still shows an older one, or it first appears
showing an older one. A deleted version is not a swipe-back. Player turns = the player's own messages in the chat file.
Prints counts only (never message text). Floor: >= 3 per 100 over >= 300 player turns (fewer turns: insufficient). Exits 1 unless the verdict is pass.`;

const defaultBackups = (chatPath: string) => join(dirname(dirname(chatPath)), 'backups');

export async function countChats(paths: readonly string[], options: { backups?: string | null } = {}) {
  const chats = await Promise.all(paths.map(async (path) => {
    const chat = basename(path).replace(/\.jsonl$/i, '');
    const folder = options.backups === null ? null : options.backups ?? defaultBackups(path);
    const files = folder ? await readdir(folder).catch(() => [] as string[]) : [];
    const snapshots: Snapshot[] = await Promise.all(backupsFor(chat, files).map(async (file) => ({ label: file, rows: parseChatJsonl(await readFile(join(folder as string, file), 'utf-8')) })));
    snapshots.push({ label: basename(path), rows: parseChatJsonl(await readFile(path, 'utf-8')) });
    return countChat(chat, snapshots);
  }));
  return report(chats);
}

const parse = (argv: readonly string[]) => {
  const paths: string[] = [];
  let backups: string | null | undefined;
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === '--no-backups') backups = null;
    else if (arg === '--backups') backups = argv[++at];
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else paths.push(arg);
  }
  return { paths, backups };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help')) {
    console.log(USAGE);
    process.exitCode = argv.length ? 0 : 1;
  } else {
    const { paths, backups } = parse(argv);
    const result = await countChats(paths, { backups });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.verdict === 'pass' ? 0 : 1;
  }
}
