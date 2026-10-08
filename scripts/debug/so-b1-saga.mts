import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { sendCompactMessage, sendTimeoutMs, sendUserMessage, waitForIdle } from './st-actions.mts';
import { sagaRow, summarizeTurn, type SagaRow } from './lib/sagaTurns.mts';

const USAGE = `Usage: node scripts/debug/so-b1-saga.mts play --lines <lines.json> --turns <n> --out <turns.jsonl> [--mode group|narrator|probe] [--narrator <name>] [--start <i>] [--stop-replies <n>]

B1 saga driver (39 B1-EMPTY, B1-NARR, B1-HIST): plays real turns on the open group chat and appends one JSON row per turn to --out.
  group     the player line is sent and the group answers as ST and the director decide (B1-EMPTY, B1-HIST)
  narrator  the player line is posted compact, then /trigger <narrator> answers it (B1-NARR: one Narrator reply per turn)
  probe     the line is sent, the reply recorded, then both messages are deleted (B1-HIST recall probes)
<lines.json> is a JSON array of player lines; it lives outside the repo (campaign text, private).
Each row: turn, line index, rows added (id, name, visible/reasoning chars, swipes), the product's empty-reply records,
boundaries committed during the turn, and summarizeTurn's counts. The harness never swipes here (SO_SWIPE_EMPTY_REPLY ignored).
--stop-replies ends the run once that many replies were counted (a denominator stop, 39a S6).`;

const arg = (args: string[], name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function readState(page: any, from: number, since: number) {
  return evaluateInST(page, ({ from, since }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const chat = ctx.chat ?? [];
    const log = (rt as any)?.engine?.stateLog ?? [];
    const spikes = (globalThis as any).storyOrchestratorSpikes?.emptyReply;
    return {
      chatId: ctx.chatId ?? null,
      length: chat.length,
      rows: chat.slice(from).map((row: any, index: number) => ({ row: { name: row?.name, is_user: row?.is_user, is_system: row?.is_system, mes: row?.mes, swipes: Array.isArray(row?.swipes) ? row.swipes.map(() => 0) : undefined, swipe_id: row?.swipe_id, extra: { reasoning: row?.extra?.reasoning ?? '' } }, id: from + index })),
      boundaries: log.filter((entry: any) => (entry?.at ?? 0) >= since).map((entry: any) => ({ boundary: entry.boundary, lastMessageId: entry.lastMessageId, at: entry.at })),
      recoveries: (spikes?.records?.() ?? []).filter((record: any) => record.at >= since),
      pending: Boolean(spikes?.pending?.()),
      recoverySeam: Boolean(spikes),
      now: Date.now(),
    };
  }, { from, since });
}

async function settle(page: any, timeout: number) {
  await waitForIdle(page, timeout, { settleMs: 3000 });
  for (let i = 0; i < 200; i += 1) {
    const pending = await evaluateInST(page, () => Boolean((globalThis as any).storyOrchestratorSpikes?.emptyReply?.pending?.()));
    if (!pending) break;
    await page.waitForTimeout(1000);
  }
  await waitForIdle(page, timeout, { settleMs: 3000 });
}

async function play(page: any, args: string[]) {
  const linesFile = arg(args, '--lines');
  const out = arg(args, '--out');
  const turns = Number(arg(args, '--turns'));
  const mode = arg(args, '--mode') ?? 'group';
  const narrator = arg(args, '--narrator') ?? 'Adolion Narrator';
  const start = Number(arg(args, '--start') ?? 0);
  const stopReplies = Number(arg(args, '--stop-replies') ?? 0);
  if (!linesFile || !out || !Number.isInteger(turns) || turns < 1) throw new Error('needs --lines, --out and --turns');
  if (!['group', 'narrator', 'probe'].includes(mode)) throw new Error(`unknown --mode ${mode}`);
  const lines: string[] = JSON.parse(await readFile(linesFile, 'utf-8'));
  const timeout = sendTimeoutMs(300000);
  delete process.env.SO_SWIPE_EMPTY_REPLY;
  let replies = 0;
  const chatAtStart = await evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().chatId ?? null);
  for (let turn = 0; turn < turns; turn += 1) {
    const index = (start + turn) % lines.length;
    const line = lines[index];
    await settle(page, timeout);
    const before = await readState(page, Number.MAX_SAFE_INTEGER, Date.now());
    if (before.chatId !== chatAtStart) throw new Error(`the open chat changed (${chatAtStart} -> ${before.chatId}); stopped`);
    const since = before.now;
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    if (mode === 'narrator') {
      await sendCompactMessage(page, line);
      await evaluateInST(page, async (name) => { await (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions(`/trigger await=true ${name}`); return true; }, narrator);
    } else {
      await sendUserMessage(page, line, { idleTimeoutMs: timeout, expectReply: false });
    }
    await settle(page, timeout);
    const after = await readState(page, before.length, since);
    const rows: SagaRow[] = after.rows.map((entry: any) => sagaRow(entry.row, entry.id));
    const summary = summarizeTurn(rows, after.boundaries, after.recoveries);
    replies += summary.replies;
    const record: Record<string, unknown> = { turn: turn + 1, index, mode, startedAt, ms: Date.now() - t0, chatId: after.chatId, lengthBefore: before.length, lengthAfter: after.length, rows, boundaries: after.boundaries, recoveries: after.recoveries, recoverySeam: after.recoverySeam, ...summary };
    if (mode === 'probe' || mode === 'narrator') record.replyText = after.rows.filter((entry: any) => !entry.row.is_user).map((entry: any) => ({ id: entry.id, name: entry.row.name, mes: entry.row.mes }));
    await appendFile(out, `${JSON.stringify(record)}\n`);
    console.log(`turn ${turn + 1}/${turns} line ${index} replies ${summary.replies} emptyLeft ${summary.emptyLeft} recoveries ${summary.recoveries} boundariesOnEmpty ${summary.boundariesOnEmpty} ${Math.round((Date.now() - t0) / 1000)}s`);
    if (mode === 'probe') {
      await evaluateInST(page, async (from) => { const ctx = (globalThis as any).SillyTavern.getContext(); const n = ctx.chat.length - from; if (n > 0) await ctx.executeSlashCommandsWithOptions(`/del ${n}`); return true; }, before.length);
      await settle(page, timeout);
    }
    if (stopReplies && replies >= stopReplies) { console.log(`stop: ${replies} replies >= ${stopReplies}`); break; }
  }
  return { ok: true, replies };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length || hasHelpFlag() || args[0] !== 'play') {
    console.log(USAGE);
    process.exit(args.length && hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => play(page, args.slice(1)), { pageCapture: 'so-b1-saga' });
}
