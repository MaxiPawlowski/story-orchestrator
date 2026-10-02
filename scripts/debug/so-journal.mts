import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_DIR } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { openMostRecentGroupChat } from './st-navigation.mts';

const USAGE = `Usage: node scripts/debug/so-journal.mts <export|show|follow> [options]

Exports the session journal of the current chat — the correlated timeline of status changes,
boundaries, transitions, extraction reads, accepted deltas, reconciliation, injected payloads,
speaker decisions and player flags — to .debug/journal-<chat>.md|json.

  --md      markdown only (default: both)
  --json    json only
  --kind    keep only these event kinds (status,flag,story,boundary,transition,extraction,delta,reconciliation,payload,talk,stagecraft,judge)
  --limit   keep only the last N events

show: print the timeline to stdout without writing files.

follow [--out <file.jsonl>] [--interval-ms 1000] [--kind k,k] [--no-audits]
  Live tail — what the machine saw, while a human plays in the browser (v2.3 plan 01 §A0).
  Prints each new journal event as it appears and, unless --no-audits, the full extraction
  audit behind every read: window, trigger reason, scope, prompt, raw response and each
  rejected line with its reason. Follows the player across chat switches and page reloads.
  With --out, every line is also appended as JSONL — the P0 record. Ctrl-C to stop.`;

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

export function renderMarkdown(journal) {
  const lines = [
    `# Session journal — ${journal.storyTitle ?? 'no story'}`,
    '',
    `- chat: \`${journal.chatId}\``,
    `- checkpoint at export: ${journal.activeCheckpoint ?? '—'} (boundary ${journal.boundary})`,
    `- events: ${journal.events.length}`,
    '',
    '| # | at | kind | boundary | msg | route | summary |',
    '|---|---|---|---|---|---|---|',
  ];
  journal.events.forEach((event, index) => {
    const summary = String(event.summary ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
    lines.push(`| ${index + 1} | ${event.at} | ${event.kind} | ${event.boundary >= 0 ? event.boundary : '—'} | ${event.messageId >= 0 ? event.messageId : '—'} | ${event.detail?.route ?? '—'} | ${summary} |`);
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

// The live tail. Reads the derived journal plus the raw audit ring, because the journal's
// extraction summary keeps only rejection *reasons* — a P0 record has to be able to answer "what
// did the model actually say, and which line was thrown away" months later.
export async function readFollowFrame(page, wantAudits) {
  return evaluateInST(page, (wantAudits) => {
    const ctx = SillyTavern.getContext();
    const runtime = globalThis.storyOrchestratorRuntime;
    if (!runtime || typeof runtime.getSessionJournal !== 'function') return { ready: false, chatId: ctx.chatId ?? null };
    const snapshot = runtime.getSnapshot?.() ?? {};
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    const selected = blob?.selectedStoryId ?? null;
    const entry = selected && blob?.stories ? blob.stories[selected] ?? null : null;
    const loadedChat = typeof runtime.getLoadedChatId === 'function' ? runtime.getLoadedChatId() : undefined;
    return {
      ready: true,
      chatId: ctx.chatId ?? null,
      journalChatId: loadedChat === undefined ? ctx.chatId ?? null : loadedChat ?? ctx.chatId ?? null,
      groupId: ctx.groupId ?? null,
      storyId: loadedChat === undefined ? selected : snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null,
      activeCheckpointName: snapshot.activeCheckpointName ?? null,
      boundary: snapshot.boundary ?? 0,
      chatLength: Array.isArray(ctx.chat) ? ctx.chat.length : 0,
      events: runtime.getSessionJournal(),
      // Plan 01 §A: the live ring. The persisted blob lags the page and is capped separately.
      audits: wantAudits ? (typeof runtime.getExtractionAudits === 'function' ? runtime.getExtractionAudits() : (entry?.extras?.extraction?.audits ?? [])) : [],
      auditSource: typeof runtime.getExtractionAudits === 'function' ? 'live' : 'persisted',
    };
  }, wantAudits);
}

// The detail is part of the identity. One read can accept the same quality twice with different
// evidence, and those rows share timestamp, kind, boundary, message id and summary — keyed on
// those alone the second one vanished from the record (Astra review, 2026-09-20). Erring toward a
// duplicate row is right here: losing a delta that really happened is the worse failure.
const eventKey = (event) => `${event.at}|${event.kind}|${event.boundary}|${event.messageId}|${event.summary}|${JSON.stringify(event.detail ?? null)}`;

export async function followSessionJournal(page, { out = null, intervalMs = 1000, kinds = null, audits = true, onLine = null, shouldStop = null, onReady = null } = {}) {
  let announced = false;
  const seenEvents = new Set();
  const seenAudits = new Set();
  let session = null;
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const done = () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  };

  if (out) await mkdir(resolve(out, '..'), { recursive: true });
  // The file is the record; the console is a convenience. A closed stdout (piped to `head`, a
  // detached terminal) must not end a session tail — on 2026-09-20 an EPIPE from `| head -12` cut
  // a live run off mid-poll and the record silently lost every audit of that poll.
  process.stdout.on('error', () => {});
  const emit = async (row) => {
    const line = JSON.stringify(row);
    if (out) await appendFile(out, `${line}\n`, 'utf-8');
    if (onLine) onLine(row);
    else {
      try {
        console.log(`${row.at} ${String(row.kind).padEnd(12)} ${row.summary}`);
      } catch {}
    }
  };

  while (!stopped) {
    let frame;
    try {
      frame = await readFollowFrame(page, audits);
    } catch (err) {
      // A reload or a chat switch destroys the execution context mid-read. That is ordinary during
      // a played session, so the tail waits and re-reads rather than ending the record.
      await new Promise((done) => setTimeout(done, intervalMs));
      continue;
    }
    if (!frame?.ready) {
      await new Promise((done) => setTimeout(done, intervalMs));
      continue;
    }

    const chatId = frame.journalChatId ?? frame.chatId;
    const stamp = `${chatId}|${frame.storyId}`;
    if (stamp !== session) {
      session = stamp;
      // Re-derivation after a switch would replay the new chat's whole history as "new"; the
      // session row makes the boundary between chats explicit in the record instead.
      await emit({
        at: new Date().toISOString(),
        kind: 'session',
        boundary: frame.boundary,
        messageId: -1,
        summary: `chat ${chatId} · story ${frame.storyId ?? 'none'} · at ${frame.activeCheckpointName ?? frame.activeCheckpointId ?? '—'} (boundary ${frame.boundary}, ${frame.chatLength} messages)`,
        detail: { chatId, openChatId: frame.chatId, groupId: frame.groupId, storyId: frame.storyId, activeCheckpointId: frame.activeCheckpointId, boundary: frame.boundary, chatLength: frame.chatLength },
      });
    }

    for (const event of frame.events ?? []) {
      const owner = typeof event.inheritedFrom === 'string' ? event.inheritedFrom : chatId;
      const key = `${owner}|${frame.storyId}|${eventKey(event)}`;
      if (seenEvents.has(key)) continue;
      seenEvents.add(key);
      if (kinds?.length && !kinds.includes(event.kind)) continue;
      await emit({ ...event, chatId: owner });
    }

    for (const audit of frame.audits ?? []) {
      if (!audit?.id || seenAudits.has(audit.id)) continue;
      seenAudits.add(audit.id);
      await emit({
        at: audit.createdAt,
        kind: 'audit',
        boundary: -1,
        messageId: audit.window?.to ?? -1,
        chatId,
        summary: `audit ${audit.reason} msgs ${audit.window?.from}-${audit.window?.to} scope [${(audit.scope ?? []).join(', ')}] → ${(audit.acceptedDeltas ?? []).length} accepted, ${(audit.rejected ?? []).length} rejected`,
        detail: {
          reason: audit.reason,
          priority: audit.priority,
          window: audit.window,
          scope: audit.scope,
          accepted: (audit.acceptedDeltas ?? []).map((item) => ({ q: item.delta?.q, v: item.delta?.v, evidence: item.evidence })),
          rejected: audit.rejected ?? [],
          judged: audit.judged ?? null,
          sceneBreak: audit.sceneBreak ?? null,
          prompt: audit.prompt,
          rawResponse: audit.rawResponse,
        },
      });
    }

    if (!announced && onReady) {
      announced = true;
      await onReady({ chatId, storyId: frame.storyId, boundary: frame.boundary });
    }
    if (shouldStop?.()) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  done();
  return { events: seenEvents.size, audits: seenAudits.size };
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

  if (args[0] === 'follow') {
    const outIndex = args.indexOf('--out');
    const intervalIndex = args.indexOf('--interval-ms');
    const out = outIndex >= 0 && args[outIndex + 1] ? resolve(process.cwd(), args[outIndex + 1]) : null;
    const intervalMs = intervalIndex >= 0 ? Number(args[intervalIndex + 1]) || 1000 : 1000;
    const ack = args.includes('--ack') && out ? await import('./lib/sessionTails.mts') : null;
    if (ack && out) await ack.clearAcks(out);
    runCli(async (page) => {
      console.log(`Following the session journal${out ? ` → ${out}` : ''} every ${intervalMs} ms. Ctrl-C to stop.`);
      const result = await followSessionJournal(page, {
        out, intervalMs, kinds, audits: !args.includes('--no-audits'),
        onReady: ack && out ? (where) => ack.writeAck(ack.ackPaths(out).ready, { tail: 'journal', ...where }) : null,
        shouldStop: ack && out ? ack.drainGate(ack.drainRequested(out)) : null,
      });
      if (ack && out) await ack.writeAck(ack.ackPaths(out).drained, { tail: 'journal', ok: true, ...result });
      console.log(`\nStopped after ${result.events} events and ${result.audits} audits.`);
    }, { keepOpen: true });
  } else runCli(async (page) => {
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
