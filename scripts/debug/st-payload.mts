import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

const USAGE = `Usage: node scripts/debug/st-payload.mts <arm|last|watch> [n] [--timeout-ms ms]

Commands:
  arm        Install page-side fetch/XHR payload capture
  last [n]   Print the last n captured generation payloads (default 1)
  watch [n]  Print captures until n are seen or timeout (default 60s)`;

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export async function armPayloadCapture(page) {
  return evaluateInST(page, () => {
    const key = '__soDebugPayloads';
    const state = globalThis[key] ||= { armed: false, entries: [], currentDraftMember: null };
    if (state.armed) return { armed: true, alreadyArmed: true, count: state.entries.length };
    const ctx = SillyTavern.getContext();
    const push = (entry) => {
      state.entries.push({
        ...entry,
        index: state.entries.length,
        draftMember: state.currentDraftMember,
        capturedAt: new Date().toISOString(),
      });
      state.entries = state.entries.slice(-100);
    };
    const shouldCapture = (url) => String(url).includes('/api/backends/') || String(url).includes('/api/chat/') || String(url).includes('/api/textgeneration/');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async function soDebugFetch(input: any, init: any = {}) {
      const url = typeof input === 'string' ? input : input?.url;
      if (shouldCapture(url)) {
        push({ transport: 'fetch', url: String(url), method: init?.method || 'GET', body: init?.body ?? null });
      }
      return originalFetch.apply(this, arguments as any);
    };
    const OriginalXHR = globalThis.XMLHttpRequest;
    (globalThis as any).XMLHttpRequest = function SoDebugXHR() {
      const xhr = new OriginalXHR();
      let method = 'GET';
      let url = '';
      let body = null;
      const open = xhr.open;
      const send = xhr.send;
      xhr.open = function patchedOpen(nextMethod: any, nextUrl: any) {
        method = nextMethod;
        url = String(nextUrl);
        return (open as any).apply(xhr, arguments);
      };
      xhr.send = function patchedSend(nextBody: any) {
        body = nextBody ?? null;
        if (shouldCapture(url)) push({ transport: 'xhr', url, method, body });
        return (send as any).apply(xhr, arguments);
      };
      return xhr;
    };
    ctx.eventSource.on(ctx.eventTypes.GROUP_MEMBER_DRAFTED, (member) => {
      state.currentDraftMember = member;
    });
    ctx.eventSource.on(ctx.eventTypes.GENERATION_ENDED, () => {
      state.currentDraftMember = null;
    });
    state.armed = true;
    return { armed: true, alreadyArmed: false, count: state.entries.length };
  });
}

export async function getPayloads(page, count = 1) {
  return evaluateInST(page, (count) => {
    const state = globalThis.__soDebugPayloads;
    const entries = state?.entries ?? [];
    return entries.slice(-count).map((entry) => {
      let parsedBody = null;
      if (typeof entry.body === 'string') {
        try { parsedBody = JSON.parse(entry.body); } catch {}
      }
      return { ...entry, parsedBody };
    });
  }, count);
}

async function watchPayloads(page, limit, timeoutMs = 60000) {
  await armPayloadCapture(page);
  let printed = 0;
  const deadline = Date.now() + timeoutMs;
  while ((!limit || printed < limit) && Date.now() < deadline) {
    const payloads = await getPayloads(page, 100);
    const next = payloads.filter((entry) => entry.index >= printed);
    for (const entry of next) {
      console.log(JSON.stringify(entry));
      printed = entry.index + 1;
      if (limit && printed >= limit) return;
    }
    await page.waitForTimeout(500);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!command || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    if (command === 'arm') {
      const result = await armPayloadCapture(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-payload-arm');
    } else if (command === 'last') {
      const result = await getPayloads(page, Number(process.argv[3] || 1));
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-payload-last');
    } else if (command === 'watch') {
      await watchPayloads(page, process.argv[3] && !process.argv[3].startsWith('--') ? Number(process.argv[3]) : null, Number(argValue('--timeout-ms', 60000)));
    } else {
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      return { ok: false };
    }
  });
}
