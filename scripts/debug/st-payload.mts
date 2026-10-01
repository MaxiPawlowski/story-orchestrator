import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { DEBUG_DIR } from './lib/connection.mts';

const USAGE = `Usage: node scripts/debug/st-payload.mts <arm|last|watch> [n] [options]

Commands:
  arm             Install page-side fetch/XHR payload capture
  arm --persist   Arm, then append every capture of the session to JSONL until Ctrl-C
                  [--out <file.jsonl>] [--interval-ms 1000]. Survives reloads by re-arming;
                  reports any capture the in-page ring dropped. (v2.3 plan 01 §A0)
  last [n]        Print the last n captured generation payloads (default 1)
                  [--member <name>] only captures taken while that member was drafted (v2.3 plan 05:
                  the private block is per drafted member, so a member's payload is its own capture)
  watch [n]       Print captures until n are seen or timeout (default 60s) [--timeout-ms ms]`;

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export async function armPayloadCapture(page) {
  return evaluateInST(page, () => {
    const key = '__soDebugPayloads';
    const state = globalThis[key] ||= { armed: false, entries: [], responses: [], currentDraftMember: null, nextIndex: 0, nextResponseIndex: 0, epoch: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    state.responses ||= [];
    state.nextResponseIndex ||= 0;
    if (state.armed) return { armed: true, alreadyArmed: true, count: state.entries.length, epoch: state.epoch, nextIndex: state.nextIndex };
    const ctx = SillyTavern.getContext();
    const push = (entry) => {
      // `index` must be monotonic across the whole session, not the position in the ring: the ring
      // keeps the last 100, so deriving the index from `entries.length` made every capture past the
      // 100th collide on index 100 — `watch` then stopped printing and a persisted record would
      // silently lose every later turn. Verified on 2026-09-20 (v2.3 plan 01 §A0).
      const index = state.nextIndex++;
      const where = (() => {
        try {
          const now = SillyTavern.getContext();
          const boundary = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.()?.boundary;
          return { chatId: now.chatId ?? null, lastMessageId: Array.isArray(now.chat) ? now.chat.length - 1 : null, boundary: Number.isFinite(boundary) ? boundary : null };
        } catch {
          return { chatId: null, lastMessageId: null, boundary: null };
        }
      })();
      state.entries.push({
        ...entry,
        index,
        epoch: state.epoch,
        draftMember: state.currentDraftMember,
        draftMemberName: state.currentDraftMemberName ?? null,
        ...where,
        capturedAt: new Date().toISOString(),
      });
      state.entries = state.entries.slice(-100);
      return index;
    };
    const RESPONSE_CHARS = 200000;
    const pushResponse = (requestIndex, response) => {
      const contentType = response?.headers?.get?.('content-type') ?? null;
      const row = { requestIndex, responseIndex: state.nextResponseIndex++, epoch: state.epoch, status: response?.status ?? null, contentType, streamed: /event-stream/i.test(String(contentType ?? '')), text: null, truncated: false, capturedAt: null };
      const clone = typeof response?.clone === 'function' ? response.clone() : null;
      const done = (text) => {
        const body = typeof text === 'string' ? text : null;
        state.responses.push({ ...row, text: body === null ? null : body.slice(0, RESPONSE_CHARS), truncated: Boolean(body && body.length > RESPONSE_CHARS), capturedAt: new Date().toISOString() });
        state.responses = state.responses.slice(-100);
      };
      if (!clone || typeof clone.text !== 'function') { done(null); return; }
      clone.text().then(done, () => done(null));
    };
    const shouldCapture = (url) => String(url).includes('/api/backends/') || String(url).includes('/api/chat/') || String(url).includes('/api/textgeneration/');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async function soDebugFetch(input: any, init: any = {}) {
      const url = typeof input === 'string' ? input : input?.url;
      if (!shouldCapture(url)) return originalFetch.apply(this, arguments as any);
      const requestIndex = push({ transport: 'fetch', url: String(url), method: init?.method || 'GET', body: init?.body ?? null });
      const pending = originalFetch.apply(this, arguments as any);
      Promise.resolve(pending).then((response) => pushResponse(requestIndex, response), () => undefined);
      return pending;
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
      try {
        state.currentDraftMemberName = SillyTavern.getContext().characters?.[member]?.name ?? null;
      } catch {
        state.currentDraftMemberName = null;
      }
    });
    ctx.eventSource.on(ctx.eventTypes.GENERATION_ENDED, () => {
      state.currentDraftMember = null;
      state.currentDraftMemberName = null;
    });
    state.armed = true;
    return { armed: true, alreadyArmed: false, count: state.entries.length, epoch: state.epoch, nextIndex: state.nextIndex };
  });
}

// Everything captured since `sinceIndex`, plus the arming epoch so a caller can tell a fresh page
// (reload → new epoch, index restarts at 0) from more captures in the same one.
export async function drainPayloads(page, sinceIndex = 0) {
  return evaluateInST(page, (since) => {
    const state = globalThis.__soDebugPayloads;
    if (!state?.armed) return { armed: false, epoch: null, entries: [], nextIndex: 0, dropped: 0 };
    const entries = (state.entries ?? []).filter((entry) => entry.index >= since);
    const oldest = state.entries?.length ? state.entries[0].index : since;
    return {
      armed: true,
      epoch: state.epoch,
      nextIndex: state.nextIndex,
      // The ring keeps 100. If the caller fell further behind than that, say how many are gone
      // rather than writing a record with a silent hole in it.
      dropped: Math.max(0, oldest - since),
      entries: entries.map((entry) => {
        let parsedBody = null;
        if (typeof entry.body === 'string') {
          try { parsedBody = JSON.parse(entry.body); } catch {}
        }
        return { ...entry, parsedBody };
      }),
    };
  }, sinceIndex);
}

export async function drainResponses(page, sinceIndex = 0) {
  return evaluateInST(page, (since) => {
    const state = globalThis.__soDebugPayloads;
    if (!state?.armed) return { armed: false, epoch: null, entries: [], nextIndex: 0, dropped: 0 };
    const rows = state.responses ?? [];
    const oldest = rows.length ? rows[0].responseIndex : since;
    return {
      armed: true,
      epoch: state.epoch,
      nextIndex: state.nextResponseIndex ?? 0,
      dropped: Math.max(0, oldest - since),
      entries: rows.filter((row) => row.responseIndex >= since).map((row) => ({ kind: 'response', ...row })),
    };
  }, sinceIndex);
}

export async function getPayloads(page, count = 1, member = null) {
  return evaluateInST(page, ({ count: wanted, member: who }: { count: number; member: string | null }) => {
    const state = globalThis.__soDebugPayloads;
    const all = state?.entries ?? [];
    // v2.3 plan 05: the private block is swapped per drafted member, so "the member's payload" is the
    // capture taken while that member was drafted. Filter BEFORE slicing, or the newest capture (for
    // whoever spoke last) pushes the member's own out of the window.
    const matching = who
      ? all.filter((entry) => String(entry.draftMember ?? '').toLowerCase() === who.toLowerCase())
      : all;
    return {
      member: who,
      matched: matching.length,
      total: all.length,
      entries: matching.slice(-wanted).map((entry) => {
        let parsedBody = null;
        if (typeof entry.body === 'string') {
          try { parsedBody = JSON.parse(entry.body); } catch {}
        }
        return { ...entry, parsedBody };
      }),
    };
  }, { count, member });
}

// v2.3 plan 01 §A0: keep every generation request of a played session on disk. The in-page ring
// holds the last 100 and a reload wipes it, so the P0 record needs a drain loop, not a ring read.
export async function persistPayloads(page, { out, intervalMs = 1000, onEntry = null, shouldStop = null, onReady = null } = {} as any) {
  let announced = false;
  let epoch: string | null = null;
  let since = 0;
  let responseSince = 0;
  let responses = 0;
  let written = 0;
  let dropped = 0;
  let rearmed = 0;
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  if (out) await mkdir(dirname(out), { recursive: true });
  // Same rule as the journal tail: the file is the record, the console is a convenience. A closed
  // stdout must never truncate a session capture (EPIPE cut a live journal run on 2026-09-20).
  process.stdout.on('error', () => {});

  // A reload (or a re-arm by someone else) takes the page's capture state with it. Anything it
  // captured after our last drain is gone AND uncountable — the counter that would have said how
  // many died with the page. So a restart is recorded as an UNKNOWN gap, never as zero: "we did
  // not see a loss" and "there was no loss" are different claims, and only the second is a clean
  // record (Astra review, 2026-09-20).
  let unknownGaps = 0;
  let writeErrors = 0;

  const poll = async () => {
    let frame = await drainPayloads(page, since);
    if (!frame.armed || (epoch && frame.epoch !== epoch)) {
      if (epoch) {
        rearmed += 1;
        unknownGaps += 1;
      }
      await armPayloadCapture(page);
      frame = await drainPayloads(page, 0);
      since = 0;
      responseSince = 0;
    }
    epoch = frame.epoch;
    dropped += frame.dropped ?? 0;
    for (const entry of frame.entries) {
      if (out) {
        // Acknowledge per row: a failed append must not advance the cursor past a capture that
        // never reached disk, and it must not silently look like a complete record either.
        try {
          await appendFile(out, `${JSON.stringify(entry)}\n`, 'utf-8');
        } catch (err) {
          writeErrors += 1;
          throw err;
        }
      }
      written += 1;
      if (onEntry) onEntry(entry);
      else {
        try {
          console.log(`${entry.capturedAt} #${entry.index} ${entry.method} ${entry.url}${entry.draftMember ? ` (${entry.draftMember})` : ''}`);
        } catch {}
      }
      since = entry.index + 1;
    }
    since = Math.max(since, frame.nextIndex ?? since);
    const answered = await drainResponses(page, responseSince);
    if (answered.armed && answered.epoch === epoch) {
      dropped += answered.dropped ?? 0;
      for (const entry of answered.entries) {
        if (out) {
          try {
            await appendFile(out, `${JSON.stringify(entry)}\n`, 'utf-8');
          } catch (err) {
            writeErrors += 1;
            throw err;
          }
        }
        responses += 1;
        responseSince = entry.responseIndex + 1;
      }
      responseSince = Math.max(responseSince, answered.nextIndex ?? responseSince);
    }
  };

  while (!stopped) {
    try {
      await poll();
      if (!announced && onReady && epoch) {
        announced = true;
        await onReady({ epoch, nextIndex: since });
      }
    } catch (err) {
      // A reload mid-read destroys the execution context and is ordinary; a disk failure is not.
      if (writeErrors) break;
    }
    if (shouldStop?.()) break;
    await new Promise((done) => setTimeout(done, intervalMs));
  }

  // One last drain, so a Ctrl-C does not throw away whatever arrived since the final poll.
  try {
    await poll();
  } catch {}

  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
  const ok = writeErrors === 0 && dropped === 0 && unknownGaps === 0;
  return { written, responses, dropped, rearmed, unknownGaps, writeErrors, epoch, ok };
}

export async function watchPayloads(page, limit, timeoutMs = 60000) {
  const armed = await armPayloadCapture(page);
  // Watch only what happens from now on, and count ROWS PRINTED — never the capture index. The
  // index is a monotonic session counter, so `printed = entry.index + 1` made `watch 2` return
  // after a single row on any page that had already generated twice (2026-09-20).
  let cursor = armed.nextIndex ?? 0;
  let shown = 0;
  const deadline = Date.now() + timeoutMs;
  while ((!limit || shown < limit) && Date.now() < deadline) {
    const frame = await drainPayloads(page, cursor);
    if (frame.dropped) console.error(`WARNING: ${frame.dropped} captures were evicted before this watch drained them.`);
    for (const entry of frame.entries) {
      console.log(JSON.stringify(entry));
      shown += 1;
      if (limit && shown >= limit) return;
    }
    cursor = frame.nextIndex ?? cursor;
    await page.waitForTimeout(500);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!command || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  if (command === 'arm' && process.argv.includes('--persist')) {
    const out = resolve(process.cwd(), argValue('--out', resolve(DEBUG_DIR, 'st-payload-session.jsonl')));
    const intervalMs = Number(argValue('--interval-ms', 1000));
    const ack = process.argv.includes('--ack') ? await import('./lib/sessionTails.mts') : null;
    if (ack) await ack.clearAcks(out);
    runCli(async (page) => {
      await armPayloadCapture(page);
      console.log(`Persisting every capture → ${out} every ${intervalMs} ms. Ctrl-C to stop.`);
      const result = await persistPayloads(page, {
        out, intervalMs,
        onReady: ack ? (where) => ack.writeAck(ack.ackPaths(out).ready, { tail: 'payloads', ...where }) : null,
        shouldStop: ack ? ack.drainGate(ack.drainRequested(out)) : null,
      });
      if (ack) await ack.writeAck(ack.ackPaths(out).drained, { tail: 'payloads', ...result, ok: result.writeErrors === 0 && result.dropped === 0 });
      console.log(`\n${JSON.stringify(result)}`);
      if (result.dropped) console.error(`WARNING: ${result.dropped} captures were evicted from the page ring before they were drained — lower --interval-ms.`);
      if (result.unknownGaps) console.error(`WARNING: the page restarted ${result.unknownGaps} time(s); captures between the last drain and each restart are UNKNOWN, not zero.`);
      if (result.writeErrors) console.error(`ERROR: ${result.writeErrors} rows could not be written; this record is incomplete.`);
      return { ok: result.ok };
    }, { keepOpen: true });
  } else runCli(async (page) => {
    if (command === 'arm') {
      const result = await armPayloadCapture(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-payload-arm');
    } else if (command === 'last') {
      const count = process.argv[3] && !process.argv[3].startsWith('--') ? Number(process.argv[3]) : 1;
      const result = await getPayloads(page, count, argValue('--member', null));
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
