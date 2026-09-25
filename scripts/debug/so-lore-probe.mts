import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { armSummary, diffArms, overSteerColumns } from './lib/judgeHarness.mts';
import { OVER_STEER_FAMILIES } from './lib/overSteer.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/so-lore-probe.mts arm | dump [--label <case>] | disarm

v2.2 plan 04 Phase 0: confirms the lore-select seam table before the flag is used. "arm" installs
listeners on GENERATION_STARTED, GROUP_WRAPPER_STARTED, MESSAGE_SENT, WORLDINFO_ENTRIES_LOADED and
WORLD_INFO_ACTIVATED. Each record carries the event, chat.length at that moment and, at
GENERATION_STARTED, the extension's willAddUserMessage answer and whether the box holds text. Drive one
case with the ordinary scripts (st-actions send / send-empty / swipe / continue, a group pass, a
vetoed member), then "dump --label <case>" writes .debug/so-lore-probe-<case>.json and clears the log.
It never forces, never asks the judge, and never writes a lorebook.

       node scripts/debug/so-lore-probe.mts diff <off-record.json> <on-record.json> [--rescore <so-judge-rescore.json>] [--family continuity|guidance]

v2.4 plan 07: the judge-off control column. Compares a journey record run with --judge-uses off against
one run with the uses under test (same journey, same scripted turns): meter calls/tokens, fallbacks,
warden flags and applied notes, replies captured, the rescore defect rate when given, and plan 01's over-steer
probe on reply N+1 after each applied note against the control arm's reply to the same turn. Offline: no
browser, no judge call.`;

async function arm(page: any) {
  const result = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const probe = ((globalThis as any).__soLoreProbe ??= { log: [], handlers: {} });
    const names = ['GENERATION_STARTED', 'GROUP_WRAPPER_STARTED', 'MESSAGE_SENT', 'WORLDINFO_ENTRIES_LOADED', 'WORLD_INFO_ACTIVATED'];
    for (const name of names) {
      const event = ctx.eventTypes[name];
      if (!event || probe.handlers[name]) continue;
      probe.handlers[name] = (...args: unknown[]) => {
        const chat = (globalThis as any).SillyTavern.getContext().chat ?? [];
        const lore = (globalThis as any).storyOrchestratorLore;
        const record: Record<string, unknown> = { at: Date.now(), event: name, chatLength: chat.length };
        if (name === 'GENERATION_STARTED') {
          const box = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
          record.type = args[0];
          record.dryRun = args[2] === true;
          record.quiet = Boolean((args[1] as any)?.quiet_prompt);
          record.automatic = Boolean((args[1] as any)?.automatic_trigger);
          record.boxHasText = Boolean(box?.value);
          record.willAddUserMessage = lore ? lore.willAddUserMessage(args[0] as string, args[1] as Record<string, unknown>, args[2] as boolean) : 'extension not loaded';
        }
        if (name === 'WORLD_INFO_ACTIVATED') record.activated = Array.isArray(args[0]) ? (args[0] as any[]).map((entry) => `${entry.world}.${entry.uid}`) : null;
        probe.log.push(record);
      };
      ctx.eventSource.on(event, probe.handlers[name]);
    }
    return { armed: Object.keys(probe.handlers) };
  });
  console.log(JSON.stringify(result, null, 2));
  return { ok: true };
}

async function dump(page: any, label: string) {
  const log = await evaluateInST(page, () => {
    const probe = (globalThis as any).__soLoreProbe;
    const out = probe ? [...probe.log] : [];
    if (probe) probe.log = [];
    return out;
  });
  const start = log[0]?.at ?? 0;
  for (const record of log) console.log(`${String(record.at - start).padStart(6)} ms  ${record.event.padEnd(26)} chat=${record.chatLength}${record.type !== undefined ? `  type=${record.type} dry=${record.dryRun} quiet=${record.quiet} auto=${record.automatic} box=${record.boxHasText} willAdd=${record.willAddUserMessage}` : ''}${record.activated ? `  activated=${record.activated.length}` : ''}`);
  await writeJSON({ label, log }, `so-lore-probe-${label}`);
  return { ok: log.length > 0 };
}

async function disarm(page: any) {
  const result = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const probe = (globalThis as any).__soLoreProbe;
    if (!probe) return { disarmed: [] };
    const names = Object.keys(probe.handlers);
    for (const name of names) ctx.eventSource.removeListener(ctx.eventTypes[name], probe.handlers[name]);
    delete (globalThis as any).__soLoreProbe;
    return { disarmed: names };
  });
  console.log(JSON.stringify(result, null, 2));
  return { ok: true };
}

const argValue = (flag: string, fallback: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

// v2.4 plan 07 (R8, X12): the judge-off control column. Two journey records of the same journey — one
// run with `--judge-uses off`, one with the uses under test — tabulated side by side: the meter (what
// was spent, never cut by rollback), the warden's flags and applied notes, and, with --rescore, the
// next-reply defect rate so-judge rescore measured over both arms' replies with one question.
export async function diffRecords(offFile: string, onFile: string, rescoreFile: string | null, familyName = 'continuity') {
  const read = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));
  const off = armSummary(await read(offFile), offFile);
  const on = armSummary(await read(onFile), onFile);
  if (off.label !== 'off' || on.label !== 'on') throw new Error(`expected a judge-off record then a judge-on record, got "${off.label}" then "${on.label}" (run each with --judge-uses)`);
  const rates = rescoreFile ? (await read(rescoreFile)).summary?.rates ?? [] : [];
  const family = OVER_STEER_FAMILIES[familyName];
  if (!family) throw new Error(`unknown over-steer family "${familyName}" (known: ${Object.keys(OVER_STEER_FAMILIES).join(', ')})`);
  return { off, on, rows: diffArms(off, on, rates), overSteer: overSteerColumns(on, off, family) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'diff') {
    if (!first || !second) {
      console.log(USAGE);
      process.exit(1);
    }
    const table = await diffRecords(first, second, process.argv.includes('--rescore') ? argValue('--rescore', '') || null : null, argValue('--family', 'continuity')).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
    for (const row of table.rows) console.log(`${row.metric.padEnd(36)} off ${String(row.off ?? '—').padStart(8)}  on ${String(row.on ?? '—').padStart(8)}  Δ ${String(row.delta ?? '—')}`);
    for (const column of table.overSteer) console.log(`over-steer (${column.family}) after message ${column.replyMessageId}: ${column.reply ? `${column.reply.id} span ${column.restate?.span} meta ${JSON.stringify(column.restate?.metaHits)} ${column.restate?.ok ? 'ok' : 'RESTATES'}; control ${column.control?.id ?? '—'} span ${column.controlRestate?.span ?? '—'}; swing ${JSON.stringify(column.swing)}` : column.missing}`);
    await writeJSON(table, `so-lore-probe-diff-${table.on.journey ?? 'journey'}`);
    process.exit(0);
  }
  if (!command || hasHelpFlag() || !['arm', 'dump', 'disarm'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => (command === 'arm' ? arm(page) : command === 'dump' ? dump(page, argValue('--label', 'case')) : disarm(page)));
}
