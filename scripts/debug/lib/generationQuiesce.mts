import { evaluateInST } from './evaluate.mts';

type Page = Parameters<typeof evaluateInST>[0];

export interface GenerationReading {
  generating: boolean;
  saving: boolean;
  chatId: string | null;
  signals: string[];
}

export interface GenerationProbe {
  read(): Promise<GenerationReading>;
  stop(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface QuiesceOptions {
  timeoutMs?: number;
  quietMs?: number;
  pollMs?: number;
  restopMs?: number;
}

export interface QuiesceReport {
  idle: boolean;
  wasGenerating: boolean;
  stops: number;
  waitedMs: number;
  lastSeen: GenerationReading | null;
  error?: string;
}

export async function quiesceGeneration(probe: GenerationProbe, { timeoutMs = 60000, quietMs = 1500, pollMs = 200, restopMs = 750 }: QuiesceOptions = {}): Promise<QuiesceReport> {
  const started = probe.now();
  let wasGenerating = false;
  let stops = 0;
  let lastStop = -Infinity;
  let quietSince: number | null = null;
  let lastSeen: GenerationReading | null = null;
  while (probe.now() - started <= timeoutMs) {
    lastSeen = await probe.read();
    const now = probe.now();
    if (lastSeen.generating) {
      wasGenerating = true;
      quietSince = null;
      if (now - lastStop >= restopMs) {
        await probe.stop();
        stops += 1;
        lastStop = probe.now();
      }
    } else if (lastSeen.saving) {
      quietSince = null;
    } else {
      quietSince = quietSince ?? now;
      if (now - quietSince >= quietMs) return { idle: true, wasGenerating, stops, waitedMs: now - started, lastSeen };
    }
    await probe.sleep(pollMs);
  }
  const waitedMs = probe.now() - started;
  return { idle: false, wasGenerating, stops, waitedMs, lastSeen, error: `generation did not stop within ${timeoutMs} ms (last seen: ${JSON.stringify(lastSeen)}); no chat was switched` };
}

export const QUIESCE_READ = 'so-quiesce-read';
export const QUIESCE_STOP = 'so-quiesce-stop';

export function pageGenerationProbe(page: Page): GenerationProbe {
  return {
    read: () => evaluateInST(page, async () => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const signals: string[] = [];
      if (document.body?.dataset?.generating === 'true') signals.push('body-generating');
      const stop = document.getElementById('mes_stop');
      if (stop && stop.offsetParent !== null) signals.push('stop-visible');
      let saving = false;
      try {
        const script = await import(/* webpackIgnore: true */ '/script.js' as string) as { isChatSaving?: boolean; is_send_press?: boolean };
        saving = Boolean(script.isChatSaving);
        if (script.is_send_press) signals.push('send-press');
      } catch {}
      try {
        const groups = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { is_group_generating?: boolean };
        if (groups.is_group_generating) signals.push('group-generating');
      } catch {}
      return { generating: signals.length > 0, saving, chatId: ctx.chatId ?? null, signals };
    }, { op: QUIESCE_READ }),
    stop: () => evaluateInST(page, () => Boolean((globalThis as any).SillyTavern.getContext().stopGeneration?.()), { op: QUIESCE_STOP }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

export async function quiesceBeforeSwitch(page: Page, options: QuiesceOptions = {}, probe: GenerationProbe = pageGenerationProbe(page)): Promise<QuiesceReport> {
  return quiesceGeneration(probe, options).catch((error: unknown) => ({ idle: false, wasGenerating: false, stops: 0, waitedMs: 0, lastSeen: null, error: error instanceof Error ? error.message : String(error) }));
}
