import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_DIR } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { openMostRecentGroupChat } from './st-navigation.mts';

const USAGE = `Usage: node scripts/debug/so-journal.mts export [--md|--json] [--kind k,k] [--limit n]

Exports the session journal of the current chat — the correlated timeline of status changes,
boundaries, transitions, extraction reads, accepted deltas, reconciliation, injected payloads,
speaker decisions and player flags — to .debug/journal-<chat>.md|json.

  --md      markdown only (default: both)
  --json    json only
  --kind    keep only these event kinds (status,flag,boundary,transition,extraction,delta,reconciliation,payload,talk)
  --limit   keep only the last N events

show: print the timeline to stdout without writing files.`;

const safeName = (value: string) => String(value ?? 'chat').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

export async function readSessionJournal(page) {
  const before = await evaluateInST(page, () => SillyTavern.getContext().chatId ?? null);
  if (!before) await openMostRecentGroupChat(page);
  return evaluateInST(page, () => {
    const runtime = globalThis.storyOrchestratorRuntime;
    if (!runtime || typeof runtime.getSessionJournal !== 'function') return { error: 'runtime handle has no getSessionJournal (build too old?)' };
    const snapshot = runtime.getSnapshot();
    return {
      chatId: SillyTavern.getContext().chatId ?? null,
      storyTitle: snapshot.storyTitle ?? null,
      activeCheckpoint: snapshot.activeCheckpointName ?? null,
      boundary: snapshot.boundary ?? 0,
      events: runtime.getSessionJournal(),
    };
  });
}

function renderMarkdown(journal) {
  const lines = [
    `# Session journal — ${journal.storyTitle ?? 'no story'}`,
    '',
    `- chat: \`${journal.chatId}\``,
    `- checkpoint at export: ${journal.activeCheckpoint ?? '—'} (boundary ${journal.boundary})`,
    `- events: ${journal.events.length}`,
    '',
    '| # | at | kind | boundary | msg | summary |',
    '|---|---|---|---|---|---|',
  ];
  journal.events.forEach((event, index) => {
    const summary = String(event.summary ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
    lines.push(`| ${index + 1} | ${event.at} | ${event.kind} | ${event.boundary >= 0 ? event.boundary : '—'} | ${event.messageId >= 0 ? event.messageId : '—'} | ${summary} |`);
  });
  const flags = journal.events.filter((event) => event.kind === 'flag');
  if (flags.length) {
    lines.push('', '## Flagged moments', '');
    for (const flag of flags) lines.push(`- \`${flag.at}\` (msg ${flag.messageId}) — ${flag.detail?.note ?? flag.summary}`);
  }
  lines.push('');
  return lines.join('\n');
}

function applyFilters(journal, { kinds, limit }) {
  let events = journal.events ?? [];
  if (kinds?.length) events = events.filter((event) => kinds.includes(event.kind));
  if (limit) events = events.slice(-limit);
  return { ...journal, events };
}

export async function exportSessionJournal(page, { md = true, json = true, kinds = null, limit = 0 } = {}) {
  const raw = await readSessionJournal(page);
  if (raw?.error) throw new Error(raw.error);
  const journal = applyFilters(raw, { kinds, limit });
  const base = `journal-${safeName(journal.chatId)}`;
  await mkdir(DEBUG_DIR, { recursive: true });
  const written = [];
  if (json) {
    const path = resolve(DEBUG_DIR, `${base}.json`);
    await writeFile(path, JSON.stringify(journal, null, 2), 'utf-8');
    written.push(path);
  }
  if (md) {
    const path = resolve(DEBUG_DIR, `${base}.md`);
    await writeFile(path, renderMarkdown(journal), 'utf-8');
    written.push(path);
  }
  for (const path of written) console.log(`Wrote ${path}`);
  return { journal, written };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = stripCommonArgs(process.argv.slice(2));
  if (hasHelpFlag() || args.length === 0) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  const kindIndex = args.indexOf('--kind');
  const limitIndex = args.indexOf('--limit');
  const kinds = kindIndex >= 0 && args[kindIndex + 1] ? args[kindIndex + 1].split(',').map((kind) => kind.trim()) : null;
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) || 0 : 0;

  runCli(async (page) => {
    if (args[0] === 'show') {
      const journal = applyFilters(await readSessionJournal(page), { kinds, limit });
      for (const event of journal.events ?? []) console.log(`${event.at} ${String(event.kind).padEnd(14)} ${event.summary}`);
      console.log(`\n${(journal.events ?? []).length} events`);
      return;
    }
    if (args[0] !== 'export') {
      console.log(USAGE);
      return { ok: false };
    }
    const md = !args.includes('--json') || args.includes('--md');
    const json = !args.includes('--md') || args.includes('--json');
    const { journal } = await exportSessionJournal(page, { md, json, kinds, limit });
    console.log(JSON.stringify({ chatId: journal.chatId, events: journal.events.length, kinds: [...new Set(journal.events.map((event) => event.kind))] }, null, 2));
  });
}
