import { fileURLToPath } from 'node:url';
import { connectToST } from './lib/connection.mjs';
import { ensureSTReady } from './lib/st-ready.mjs';
import { evaluateInST } from './lib/evaluate.mjs';
import { writeJSON } from './lib/output.mjs';

const USAGE = `Usage: node scripts/debug/st-payload.mjs <arm|last|watch> [n] [--timeout-ms ms]

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
    globalThis.fetch = async function soDebugFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url;
      if (shouldCapture(url)) {
        push({ transport: 'fetch', url: String(url), method: init?.method || 'GET', body: init?.body ?? null });
      }
      return originalFetch.apply(this, arguments);
    };
    const OriginalXHR = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = function SoDebugXHR() {
      const xhr = new OriginalXHR();
      let method = 'GET';
      let url = '';
      let body = null;
      const open = xhr.open;
      const send = xhr.send;
      xhr.open = function patchedOpen(nextMethod, nextUrl) {
        method = nextMethod;
        url = String(nextUrl);
        return open.apply(xhr, arguments);
      };
      xhr.send = function patchedSend(nextBody) {
        body = nextBody ?? null;
        if (shouldCapture(url)) push({ transport: 'xhr', url, method, body });
        return send.apply(xhr, arguments);
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
  (async () => {
    const command = process.argv[2];
    if (!command || command === '--help' || command === '-h') {
      console.log(USAGE);
      return;
    }
    let browser;
    try {
      const conn = await connectToST();
      browser = conn.browser;
      const { page } = conn;
      await ensureSTReady(page);
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
        process.exitCode = 1;
      }
    } catch (err) {
      console.error('Error:', err.message || String(err));
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.exit(process.exitCode || 0);
    }
  })();
}
