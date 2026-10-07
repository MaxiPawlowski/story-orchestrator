import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPageCapture, captureFileFor, captureWanted, pageErrorLines, pathOnly, writeSummaryNextTo } from './pageCapture.mts';

function fakePage() {
  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  return {
    on(event: string, fn: (...args: any[]) => void) { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    off(event: string, fn: (...args: any[]) => void) { handlers.set(event, (handlers.get(event) ?? []).filter((item) => item !== fn)); },
    emit(event: string, value: unknown) { for (const fn of handlers.get(event) ?? []) fn(value); },
    count: (event: string) => (handlers.get(event) ?? []).length,
  };
}

const consoleMessage = (type: string, text: string) => ({ type: () => type, text: () => text, location: () => ({ url: 'http://127.0.0.1:8101/script.js?v=1', lineNumber: 7 }) });
const request = (method: string, url: string, errorText: string) => ({ method: () => method, url: () => url, failure: () => ({ errorText }) });
const response = (status: number, url: string, method = 'POST') => ({ status: () => status, url: () => url, request: () => ({ method: () => method }) });

test('console errors and warnings, page errors, failed requests and /api 4xx-5xx are captured; logs and other urls are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-page-'));
  try {
    const page = fakePage();
    const file = join(dir, 'page.jsonl');
    let clock = Date.parse('2026-10-07T10:00:00.000Z');
    const capture = attachPageCapture(page, { file, now: () => new Date(clock += 1000), label: 'scenario' });
    page.emit('console', consoleMessage('log', 'ordinary log'));
    page.emit('console', consoleMessage('error', 'TypeError: x is undefined'));
    page.emit('console', consoleMessage('warning', 'deprecated'));
    page.emit('pageerror', Object.assign(new Error('boom in handler'), { stack: 'Error: boom\n at f' }));
    page.emit('requestfailed', request('GET', 'http://127.0.0.1:8101/api/chats/get?id=secret', 'net::ERR_CONNECTION_REFUSED'));
    page.emit('requestfailed', request('GET', 'http://127.0.0.1:8101/thumb.png', 'net::ERR_ABORTED'));
    page.emit('response', response(500, 'http://127.0.0.1:8101/api/backends/text-completions/generate?x=1'));
    page.emit('response', response(404, 'http://127.0.0.1:8101/img/missing.png', 'GET'));
    page.emit('response', response(200, 'http://127.0.0.1:8101/api/settings/save'));
    const summary = capture.summary();
    assert.equal(summary.rows, 7, 'info row + 6 captured');
    assert.equal(summary.consoleErrors, 1);
    assert.equal(summary.consoleWarnings, 1);
    assert.equal(summary.pageErrorCount, 1);
    assert.equal(summary.pageErrors[0].text, 'boom in handler');
    assert.equal(summary.failedRequestCount, 3);
    assert.equal(summary.httpErrorCount, 1);
    assert.equal(summary.abortedCount, 1);
    assert.ok(summary.failedRequests.every((row) => !row.url.includes('?')), 'query strings never reach the record');
    assert.deepEqual(summary.failedRequests.find((row) => row.status === 500), { at: summary.failedRequests.find((row) => row.status === 500)!.at, method: 'POST', url: 'http://127.0.0.1:8101/api/backends/text-completions/generate', status: 500 });
    const lines = readFileSync(file, 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 7);
    assert.equal(lines[0].type, 'info');
    const out = pageErrorLines(summary);
    assert.match(out[0], /^page-capture: .*"pageErrors":1/);
    assert.ok(out.some((line) => line.startsWith('PAGE-ERROR ') && line.includes('boom in handler')));
    assert.ok(out.some((line) => line.startsWith('REQUEST-FAILED ') && line.includes('500')));
    assert.ok(!out.some((line) => line.includes('thumb.png')), 'an aborted request is counted, not shouted');
    capture.stop();
    assert.equal(page.count('console') + page.count('pageerror') + page.count('requestfailed') + page.count('response'), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a mark slices the capture so a scenario inside a longer run reports only its own rows', () => {
  const page = fakePage();
  const capture = attachPageCapture(page);
  page.emit('pageerror', new Error('before'));
  const mark = capture.mark();
  page.emit('pageerror', new Error('during'));
  assert.equal(capture.summary().pageErrorCount, 2);
  assert.deepEqual(capture.summary(mark).pageErrors.map((row) => row.text), ['during']);
});

test('capture is opt-in for ordinary scripts and always on inside a batch row; off wins', () => {
  assert.equal(captureWanted({}, undefined), null);
  assert.equal(captureWanted({}, 'scenario'), 'scenario');
  assert.equal(captureWanted({ SO_ROW_DIR: 'C:/x' }, undefined), 'row');
  assert.equal(captureWanted({ SO_ROW_DIR: 'C:/x', SO_PAGE_CAPTURE: 'off' }, 'scenario'), null);
  assert.equal(captureWanted({ SO_ROW_DIR: 'C:/x' }, false), null);
  assert.equal(captureFileFor({ SO_ROW_DIR: 'C:/rows/r1' }, 'C:/debug', 'scenario').replace(/\\/g, '/'), 'C:/rows/r1/page.jsonl');
  assert.match(captureFileFor({}, 'C:/debug', 'so scenario', 'STAMP').replace(/\\/g, '/'), /^C:\/debug\/page-so_scenario-STAMP\.jsonl$/);
});

test('the summary lands in the row dir so the batch can read it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-page-row-'));
  try {
    const capture = attachPageCapture(fakePage(), { file: join(dir, 'page.jsonl') });
    assert.equal(writeSummaryNextTo(capture, {}), null);
    const path = writeSummaryNextTo(capture, { SO_ROW_DIR: dir });
    assert.equal(JSON.parse(readFileSync(path!, 'utf-8')).rows, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pathOnly drops queries and data urls', () => {
  assert.equal(pathOnly('http://h:1/api/x?token=1'), 'http://h:1/api/x');
  assert.equal(pathOnly('data:image/png;base64,AAAA'), 'data:…');
});
