import { fileURLToPath } from 'node:url';
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
It never forces, never asks the judge, and never writes a lorebook.`;

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (!command || hasHelpFlag() || !['arm', 'dump', 'disarm'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  runCli((page) => (command === 'arm' ? arm(page) : command === 'dump' ? dump(page, argValue('--label', 'case')) : disarm(page)));
}
