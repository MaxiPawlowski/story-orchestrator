import type { StoryIndexEntry } from './sessionCharters.mts';
import type { ContinuedAtPin } from './sessionLanes.mts';
import { defectCounts } from './modelDefects.mts';

const repairNote = (repair: { swiped?: boolean; repaired?: unknown[]; unrepaired?: Array<{ messageId?: number }> } | null | undefined, messageId: number | null | undefined) => {
  if (!repair) return '';
  if (Array.isArray(repair.repaired)) {
    if (repair.repaired.includes(messageId)) return ' (swiped once)';
    return repair.unrepaired?.some((entry) => entry.messageId === messageId) ? ' (left in the chat)' : '';
  }
  return repair.swiped ? ' (swiped once)' : '';
};

export const ANOMALY_KINDS = [
  'stall', 'extraction-rejected', 'empty-private-block', 'lore-force-lost', 'lore-constant-missed', 'judge-fallback',
  'save-lost', 'unexpected-jump', 'rollback', 'console-error', 'model-call-failure', 'model-defect', 'harness-error',
] as const;
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

export const STALL_BOUNDARIES = 10;
export const CONTEXT_TURNS = 3;
export const PRIVATE_BLOCK_HEADER = 'Your private knowledge (stay in character';
const PRIVATE_TAGS = ['knows', 'suspects', 'believes', 'unaware', 'hiding', 'intends'];
const ROLLBACK_NOTE = /stepped back|rolled back|retained history|delete (?:not )?decoded|decoded ambiguously/i;
const SAVE_NOTE = /^save (?:not confirmed|reported success but the server holds an older state|could not be verified|skipped)/i;
const EXTENSION_SOURCE = /story-orchestrator|storyOrchestrator|\[SO\]|Story Orchestrator/i;
const HARNESS_LINE = /^(?:\S+ )?(?:Error:|ERROR:|WARNING:)|Unhandled|Traceback/;

export interface Row<T = any> { line: number; value: T }
export interface Evidence { path: string; line: number }
export interface Anomaly { kind: AnomalyKind; at: string | null; chatId: string | null; summary: string; evidence: Evidence; detail?: Record<string, unknown> }
export interface ChatMessage { id: number; name: string; isUser: boolean; text: string }
export interface Flag { at: string; chatId: string | null; messageId: number; note: string; evidence: Evidence; context: ChatMessage[]; contextFrom: 'event-time' | 'end-of-session' | 'none' }

export interface EndState { characters?: Array<{ index: number; name: string }>; epistemic?: any[]; payloadEpoch?: string | null }

export interface SessionFiles {
  session: { charter: string; tier: string; playFrom?: string | null; story?: { kind: string; id?: string }; continuedAtPin?: ContinuedAtPin | null };
  journal: Row[];
  payloads: Row[];
  console: Row[];
  logs: Record<string, Row<string>[]>;
  chats: Record<string, ChatMessage[]>;
  states: Record<string, EndState>;
  story: StoryIndexEntry | null;
  stories?: Record<string, StoryIndexEntry>;
  turns?: Row[];
  missing?: string[];
}

export interface JudgeHealth { calls: number; answered: number; busy: number; timeout: number; otherFallbacks: number; busyRate: number | null; busyByUse: Record<string, number> }

export interface Digest {
  charter: string; tier: string; continuedAtPin: ContinuedAtPin | null; flags: Flag[]; anomalies: Anomaly[]; counts: Record<string, number>; countsByChat: Record<string, Record<string, number>>;
  valid: boolean; invalid: string[]; unverifiable: { privateBlock: number }; judge: JudgeHealth; modelDefects: ReturnType<typeof defectCounts>;
}

export function judgeHealth(rows: Row[]): JudgeHealth {
  const health: JudgeHealth = { calls: 0, answered: 0, busy: 0, timeout: 0, otherFallbacks: 0, busyRate: null, busyByUse: {} };
  for (const row of rows) {
    const fallback = row.value?.detail?.fallback;
    if (fallback === 'disabled') continue;
    health.calls += 1;
    if (!fallback) health.answered += 1;
    else if (fallback === 'busy') {
      health.busy += 1;
      const use = String(row.value.detail?.use ?? '?');
      health.busyByUse[use] = (health.busyByUse[use] ?? 0) + 1;
    } else if (fallback === 'timeout') health.timeout += 1;
    else health.otherFallbacks += 1;
  }
  health.busyRate = health.calls ? Math.round((health.busy / health.calls) * 1000) / 1000 : null;
  return health;
}

export const REQUIRED_CAPTURES = ['journal.jsonl', 'payloads.jsonl', 'console.jsonl'] as const;

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function heldAtCapture(item: any, capture: { boundary: number | null; lastMessageId: number | null }): boolean {
  if (!PRIVATE_TAGS.includes(item?.tag)) return false;
  const created = finite(item.createdAt);
  const source = finite(item.messageId);
  if (capture.boundary === null && capture.lastMessageId === null) return false;
  if (capture.boundary !== null && (created === null || created >= capture.boundary)) return false;
  if (capture.lastMessageId !== null && source !== null && source >= capture.lastMessageId) return false;
  if (capture.boundary === null && source === null) return false;
  const retired = item.retiredAt ? finite(item.retiredAt.boundary) : null;
  if (item.supersededBy && (retired === null || capture.boundary === null || retired <= capture.boundary)) return false;
  return true;
}

export const parseJsonl = (text: string): Row[] => text.split(/\r?\n/).flatMap((raw, at) => {
  if (!raw.trim()) return [];
  try { return [{ line: at + 1, value: JSON.parse(raw) }]; } catch { return [{ line: at + 1, value: { unparsed: raw } }]; }
});

export const parseLines = (text: string): Row<string>[] => text.split(/\r?\n/).map((value, at) => ({ line: at + 1, value })).filter((row) => row.value.trim());

const timeOf = (at: unknown) => {
  const parsed = Date.parse(String(at ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const inPlay = (at: unknown, playFrom: number | null) => {
  if (playFrom === null) return true;
  const time = timeOf(at);
  return time === null || time >= playFrom;
};

const normalize = (name: unknown) => String(name ?? '').trim().toLowerCase();

export function isDraftedReply(body: string, name: string | null): boolean {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return true; }
  const request = parsed as { prompt?: unknown; messages?: unknown };
  if (Array.isArray(request.messages)) return request.messages.length > 1;
  if (typeof request.prompt !== 'string') return true;
  const tail = request.prompt.trimEnd().toLowerCase();
  return name ? tail.endsWith(`${normalize(name)}:`) : /\n[^\n]{1,80}:$/.test(tail);
}

function contextFor(chat: ChatMessage[] | undefined, messageId: number): ChatMessage[] {
  if (!chat?.length || messageId < 0) return [];
  return chat.filter((message) => message.id >= messageId - CONTEXT_TURNS && message.id <= messageId + CONTEXT_TURNS);
}

const rowChat = (row: Row) => String(row.value.chatId ?? row.value.detail?.chatId ?? '');
const namesNoStory = (row: Row) => row.value.kind === 'session' && Object.prototype.hasOwnProperty.call(row.value.detail ?? {}, 'storyId') && row.value.detail.storyId === null;

export function withoutForeignRows(rows: Row[]): Row[] {
  const foreign = new Set<string>();
  return rows.filter((row) => {
    if (row.value.kind !== 'session') return !foreign.has(rowChat(row));
    if (namesNoStory(row)) foreign.add(rowChat(row));
    else foreign.delete(rowChat(row));
    return !namesNoStory(row);
  });
}

export function digestSession(files: SessionFiles, paths: { journal: string; payloads: string; console: string; logs: Record<string, string>; turns?: string } = {
  journal: 'journal.jsonl', payloads: 'payloads.jsonl', console: 'console.jsonl', logs: {},
}): Digest {
  const playFrom = timeOf(files.session.playFrom);
  const anomalies: Anomaly[] = [];
  const add = (kind: AnomalyKind, row: Row, path: string, summary: string, detail?: Record<string, unknown>) =>
    anomalies.push({ kind, at: row.value?.at ?? row.value?.capturedAt ?? null, chatId: row.value?.chatId ?? null, summary, evidence: { path, line: row.line }, ...(detail ? { detail } : {}) });
  const journal = withoutForeignRows(files.journal.filter((row) => row.value && !row.value.unparsed));
  const played = journal.filter((row) => inPlay(row.value.at, playFrom));
  const storyFor = (storyId: unknown): StoryIndexEntry | null => {
    if (typeof storyId !== 'string' || !storyId) return files.story;
    if (storyId === files.session.story?.id) return files.story;
    return files.stories?.[storyId] ?? null;
  };

  const flags: Flag[] = [];
  const seenFlags = new Set<string>();
  const flagTurns = (files.turns ?? []).filter((row) => row.value?.kind === 'flag' && Array.isArray(row.value?.context?.messages));
  const eventContext = (at: unknown, note: string, chatId: string | null) => {
    const exact = flagTurns.find((row) => row.value.flag?.at === at);
    const byNote = flagTurns.filter((row) => String(row.value.note ?? '') === note && (!chatId || !row.value.context?.chatId || row.value.context.chatId === chatId));
    return (exact ?? byNote[0])?.value.context ?? null;
  };
  for (const row of played.filter((candidate) => candidate.value.kind === 'flag')) {
    const key = `${row.value.at}|${row.value.summary}`;
    if (seenFlags.has(key)) continue;
    seenFlags.add(key);
    const chatId = row.value.chatId ?? null;
    const messageId = Number(row.value.messageId ?? -1);
    const note = String(row.value.detail?.note ?? row.value.summary ?? '');
    const atEvent = eventContext(row.value.at, note, chatId);
    const fromEvent = atEvent ? contextFor(atEvent.messages as ChatMessage[], messageId >= 0 ? messageId : Number(atEvent.messageId ?? -1)) : [];
    const fromEnd = contextFor(chatId ? files.chats[chatId] : undefined, messageId);
    const context = fromEvent.length ? fromEvent : fromEnd;
    flags.push({
      at: row.value.at, chatId, messageId, note, evidence: { path: paths.journal, line: row.line }, context,
      contextFrom: fromEvent.length ? 'event-time' : fromEnd.length ? 'end-of-session' : 'none',
    });
  }

  const byChat = new Map<string, Row[]>();
  for (const row of journal) {
    const chatId = rowChat(row);
    byChat.set(chatId, [...(byChat.get(chatId) ?? []), row]);
  }
  for (const [chatId, rows] of byChat) {
    let story = files.story;
    let edges = new Set((story?.edges ?? []).map(([from, to]) => `${from}>${to}`));
    let outgoing = new Set((story?.edges ?? []).map(([from]) => from));
    let active: string | null = null;
    let since = 0;
    let reported = false;
    let maxBoundary = -1;
    for (const row of rows) {
      const event = row.value;
      if (event.kind === 'session') {
        story = storyFor(event.detail?.storyId);
        edges = new Set((story?.edges ?? []).map(([from, to]) => `${from}>${to}`));
        outgoing = new Set((story?.edges ?? []).map(([from]) => from));
        active = event.detail?.activeCheckpointId ?? active;
        maxBoundary = Math.max(maxBoundary, Number(event.detail?.boundary ?? -1));
        continue;
      }
      if (event.kind === 'transition') {
        const [from, to] = String(event.summary ?? '').split(' → ').map((part) => part.trim());
        if (to) active = to;
        since = 0;
        reported = false;
        if (inPlay(event.at, playFrom) && story && from && to && !edges.has(`${from}>${to}`)) {
          const authored = story.checkpoints.some((checkpoint) => checkpoint.id === to);
          add('unexpected-jump', row, paths.journal, `${from} → ${to} is not an authored transition${authored ? '' : ' (a generated route?)'}`, { from, to, authored });
        }
        continue;
      }
      if (event.kind !== 'boundary') continue;
      const boundary = Number(event.boundary ?? -1);
      if (!inPlay(event.at, playFrom)) { maxBoundary = Math.max(maxBoundary, boundary); continue; }
      if (boundary >= 0 && boundary < maxBoundary) {
        add('rollback', row, paths.journal, `boundary went back from ${maxBoundary} to ${boundary}`, { from: maxBoundary, to: boundary });
        since = 0;
        reported = false;
      }
      maxBoundary = Math.max(maxBoundary, boundary);
      if (event.detail?.source === 'manual') add('unexpected-jump', row, paths.journal, `manual checkpoint change at boundary ${boundary} (an author /cp or driver move, not play)`, { source: 'manual' });
      since += 1;
      const pending = !story || !active || outgoing.has(active);
      if (since >= STALL_BOUNDARIES && !reported && pending) {
        reported = true;
        add('stall', row, paths.journal, `${since} boundaries without a transition at ${active ?? 'an unknown checkpoint'} while its exits were pending`, { checkpoint: active, boundaries: since, chat: chatId || null });
      }
    }
  }

  const audits = played.filter((row) => row.value.kind === 'audit');
  const reads = audits.length ? audits : played.filter((row) => row.value.kind === 'extraction');
  for (const row of reads) {
    const rejected = Array.isArray(row.value.detail?.rejected) ? row.value.detail.rejected : [];
    if (!rejected.length) continue;
    const reasons = rejected.map((item: any) => (typeof item === 'string' ? item : `${item?.line ?? ''} (${item?.reason ?? 'rejected'})`.trim()));
    add('extraction-rejected', row, paths.journal, `${rejected.length} extraction line(s) rejected: ${reasons.slice(0, 3).join('; ')}`, { rejected });
  }

  for (const row of played.filter((candidate) => candidate.value.kind === 'lore')) {
    const summary = String(row.value.summary ?? '');
    if (summary.startsWith('lore-force-lost')) add('lore-force-lost', row, paths.journal, summary, { note: row.value.detail?.note ?? null });
    if (summary.startsWith('lore-constant-missed')) add('lore-constant-missed', row, paths.journal, summary, { note: row.value.detail?.note ?? null });
  }

  for (const row of played.filter((candidate) => candidate.value.kind === 'judge')) {
    const fallback = row.value.detail?.fallback;
    if (fallback && fallback !== 'disabled') add('judge-fallback', row, paths.journal, `judge ${row.value.detail?.use ?? '?'} fell back (${fallback})`, { use: row.value.detail?.use, fallback });
  }

  for (const row of played.filter((candidate) => candidate.value.kind === 'story')) {
    const summary = String(row.value.summary ?? '');
    if (SAVE_NOTE.test(summary)) add('save-lost', row, paths.journal, summary, { note: row.value.detail?.note ?? null });
    else if (ROLLBACK_NOTE.test(summary)) add('rollback', row, paths.journal, summary, { note: row.value.detail?.note ?? null });
  }

  for (const row of played.filter((candidate) => candidate.value.kind === 'model-call')) {
    const result = row.value.detail?.result;
    if (result && result !== 'ok' && result !== 'fallback') add('model-call-failure', row, paths.journal, `${row.value.detail?.pass ?? 'call'} via ${row.value.detail?.route ?? '?'}: ${result}`, { result, pass: row.value.detail?.pass });
  }

  const playedTurns = (files.turns ?? []).filter((row) => row.value && !row.value.unparsed && inPlay(row.value.at, playFrom));
  for (const row of playedTurns) {
    for (const defect of Array.isArray(row.value.modelDefects) ? row.value.modelDefects : []) {
      add('model-defect', row, paths.turns ?? 'turns.jsonl', `model ${defect.kind} in message ${defect.messageId ?? '?'}${defect.speaker ? ` (${defect.speaker})` : ''}: ${String(defect.sample ?? '').slice(0, 120)}${repairNote(row.value.autoRepair, defect.messageId)}`, { kind: defect.kind, messageId: defect.messageId ?? null, rule: defect.rule ?? null });
    }
  }

  const reportedPrivate = new Set<string>();
  let unverifiablePrivate = 0;
  for (const row of files.payloads) {
    const entry = row.value;
    if (!entry || entry.unparsed || entry.draftMember === null || entry.draftMember === undefined) continue;
    if (!inPlay(entry.capturedAt, playFrom)) continue;
    const body = typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body ?? '');
    if (!/"(?:prompt|messages)"/.test(body) || body.includes(PRIVATE_BLOCK_HEADER)) continue;
    const chatId = typeof entry.chatId === 'string' && entry.chatId ? entry.chatId : null;
    const state = chatId ? files.states[chatId] : undefined;
    const capture = { boundary: finite(entry.boundary), lastMessageId: finite(entry.lastMessageId) };
    const sameEpoch = Boolean(state?.payloadEpoch) && state!.payloadEpoch === entry.epoch;
    const name = typeof entry.draftMemberName === 'string' && entry.draftMemberName ? entry.draftMemberName
      : sameEpoch ? (state!.characters ?? []).find((character) => String(character.index) === String(entry.draftMember))?.name ?? null
        : typeof entry.draftMember === 'string' ? entry.draftMember : null;
    if (!isDraftedReply(body, name)) continue;
    if (!state || !name || (capture.boundary === null && capture.lastMessageId === null)) { unverifiablePrivate += 1; continue; }
    const held = (state.epistemic ?? []).filter((item) => normalize(item.subject) === normalize(name) && heldAtCapture(item, capture));
    const key = `${entry.epoch ?? ''}|${entry.index ?? row.line}|${name}`;
    if (!held.length || reportedPrivate.has(key)) continue;
    reportedPrivate.add(key);
    add('empty-private-block', { ...row, value: { ...entry, chatId } }, paths.payloads, `${name} was drafted in ${chatId} at boundary ${capture.boundary ?? '?'} with no private block while holding ${held.length} private entr${held.length === 1 ? 'y' : 'ies'} acquired before it`, { member: name, chatId, boundary: capture.boundary, lastMessageId: capture.lastMessageId, held: held.map((item) => `${item.tag}: ${item.content} (boundary ${item.createdAt})`) });
  }

  for (const row of files.console) {
    const entry = row.value;
    if (!entry || entry.unparsed) continue;
    if (entry.type !== 'error' && entry.type !== 'pageerror') continue;
    const text = `${entry.text ?? ''} ${entry.location ?? ''} ${entry.stack ?? ''}`;
    if (!EXTENSION_SOURCE.test(text)) continue;
    add('console-error', row, paths.console, String(entry.text ?? '').slice(0, 200), { type: entry.type, location: entry.location ?? null });
  }

  for (const [name, rows] of Object.entries(files.logs)) {
    for (const row of rows) if (HARNESS_LINE.test(row.value)) add('harness-error', { line: row.line, value: {} }, paths.logs[name] ?? name, row.value.slice(0, 200));
  }

  anomalies.sort((left, right) => (timeOf(left.at) ?? 0) - (timeOf(right.at) ?? 0) || ANOMALY_KINDS.indexOf(left.kind) - ANOMALY_KINDS.indexOf(right.kind));
  const counts = Object.fromEntries(ANOMALY_KINDS.map((kind) => [kind, anomalies.filter((anomaly) => anomaly.kind === kind).length]));
  const countsByChat: Record<string, Record<string, number>> = {};
  for (const anomaly of anomalies) {
    const chat = anomaly.chatId ?? '(no chat)';
    countsByChat[chat] = { ...countsByChat[chat], [anomaly.kind]: (countsByChat[chat]?.[anomaly.kind] ?? 0) + 1 };
  }
  const invalid = (files.missing ?? []).map((name) => `${name} is missing: zero anomalies from it would mean no evidence, not a clean run`);
  return {
    charter: files.session.charter, tier: files.session.tier, continuedAtPin: files.session.continuedAtPin ?? null, flags, anomalies, counts: { flags: flags.length, ...counts }, countsByChat,
    valid: invalid.length === 0, invalid, unverifiable: { privateBlock: unverifiablePrivate },
    judge: judgeHealth(played.filter((row) => row.value.kind === 'judge')),
    modelDefects: defectCounts(playedTurns.map((row) => row.value)),
  };
}

export function registerRows(digest: Digest, sessionDir: string) {
  const tierNumber = digest.tier.replace(/^T/, '');
  const rows = [
    ...digest.flags.map((flag) => ({ source: 'flag', what: flag.note || 'flagged moment', evidence: `${sessionDir}/${flag.evidence.path}:${flag.evidence.line}`, klass: '' })),
    ...digest.anomalies.map((anomaly) => ({ source: anomaly.kind, what: anomaly.summary, evidence: `${sessionDir}/${anomaly.evidence.path}:${anomaly.evidence.line}`, klass: anomaly.kind === 'harness-error' ? 'harness' : '' })),
  ];
  return rows.map((row, at) => ({ id: `T${tierNumber}-?${at + 1}`, tier: digest.tier, severity: '', class: row.klass, what: row.what, source: row.source, evidence: row.evidence, status: 'draft', fixCommit: '', eval: '' }));
}

const cell = (value: string) => value.replace(/\|/g, '/').replace(/\r?\n/g, ' ');

export function renderJudgeHealth(health: JudgeHealth): string[] {
  if (!health.calls) return ['No judge calls in play.'];
  const percent = health.busyRate === null ? 'n/a' : `${(health.busyRate * 100).toFixed(1)}%`;
  const uses = Object.entries(health.busyByUse).sort((a, b) => b[1] - a[1]).map(([use, count]) => `${use} ${count}`).join(', ');
  return [
    `- calls: ${health.calls} (answered ${health.answered}, busy ${health.busy}, timeout ${health.timeout}, other fallbacks ${health.otherFallbacks})`,
    `- busy rate: ${percent}${uses ? ` (by use: ${uses})` : ''}`,
    '- a busy fallback was never sent: the lane\'s judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path',
  ];
}

export function renderFindings(digest: Digest, sessionDir: string): string {
  const out = [`# Findings draft: ${digest.charter}`, '', `Session \`${sessionDir}\`. Draft rows for \`docs/plans/v2.6/14-findings.md\`; severity and class are decided in the review.`, ''];
  if (!digest.valid) out.push('## INVALID SESSION', '', ...digest.invalid.map((line) => `- ${line}`), '', 'The counts below cover only what was captured.', '');
  if (digest.continuedAtPin) out.push('## Continued at the lane\'s pin', '', `- ${digest.charter} continued ${digest.continuedAtPin.holder}\'s chat \`${digest.continuedAtPin.chat}\` on a lane seeded from \`${digest.continuedAtPin.lanePin}\`; the story index was \`${digest.continuedAtPin.indexPin}\`. The lane inventory matched its seed record \`${digest.continuedAtPin.seedRecord}\`, so the story data played is the lane\'s pin, not the index.`, '');
  if (digest.unverifiable.privateBlock) out.push(`Private-block checks that could not be reconstructed (capture without chat, boundary or member identity): ${digest.unverifiable.privateBlock}.`, '');
  out.push('## Counts', '', `- flags: ${digest.flags.length}`, ...ANOMALY_KINDS.map((kind) => `- ${kind}: ${digest.counts[kind] ?? 0}`), '');
  const chats = Object.entries(digest.countsByChat ?? {});
  if (chats.length > 1) {
    out.push('### By chat', '');
    for (const [chat, byKind] of chats) out.push(`- \`${chat}\`: ${Object.entries(byKind).map(([kind, count]) => `${kind} ${count}`).join(', ')}`);
    out.push('');
  }
  out.push('## Judge health', '', ...renderJudgeHealth(digest.judge), '');
  out.push('## Model defects', '', digest.modelDefects.turns
    ? `- ${digest.modelDefects.turns} turn(s) with a defective reply: loop ${digest.modelDefects.loop}, corrupt ${digest.modelDefects.corrupt}; swiped once by the loop guard: ${digest.modelDefects.repaired}; ` +
      `left in the chat (not the last reply): ${digest.modelDefects.unrepaired} message(s)`
    : 'None detected.', '');
  out.push('## Flags', '');
  if (!digest.flags.length) out.push('None.', '');
  for (const flag of digest.flags) {
    out.push(`### ${flag.at} (message ${flag.messageId})`, '', `- note: ${flag.note || '(no note)'}`, `- evidence: \`${flag.evidence.path}:${flag.evidence.line}\``);
    if (flag.context.length) {
      out.push(`- context (${flag.contextFrom}):`);
      for (const message of flag.context) out.push(`  - ${message.id === flag.messageId ? '**' : ''}#${message.id} ${message.name}: ${cell(message.text).slice(0, 300)}${message.id === flag.messageId ? '**' : ''}`);
    }
    out.push('');
  }
  out.push('## Anomalies', '');
  if (!digest.anomalies.length) out.push('None.', '');
  for (const kind of ANOMALY_KINDS) {
    const rows = digest.anomalies.filter((anomaly) => anomaly.kind === kind);
    if (!rows.length) continue;
    out.push(`### ${kind} (${rows.length})`, '');
    for (const anomaly of rows) out.push(`- ${anomaly.at ?? '-'} ${cell(anomaly.summary)} (\`${anomaly.evidence.path}:${anomaly.evidence.line}\`)`);
    out.push('');
  }
  out.push('## Draft register rows', '', '| id | tier | severity | class | evidence | status | fix commit | eval | what |', '|---|---|---|---|---|---|---|---|---|');
  for (const row of registerRows(digest, sessionDir)) out.push(`| ${row.id} | ${row.tier} | ${row.severity} | ${row.class} | \`${row.evidence}\` | ${row.status} | ${row.fixCommit} | ${row.eval} | ${cell(row.what)} |`);
  return `${out.join('\n')}\n`;
}
