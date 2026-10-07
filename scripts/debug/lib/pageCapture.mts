import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const PAGE_CAPTURE_FILE = 'page.jsonl';
export const PAGE_SUMMARY_FILE = 'page-summary.json';
export const ROW_DIR_ENV = 'SO_ROW_DIR';
export const PAGE_CAPTURE_ENV = 'SO_PAGE_CAPTURE';
export const KEEP_ITEMS = 50;

type Handler = (...args: any[]) => void;
export interface CapturablePage {
  on(event: string, handler: Handler): unknown;
  off?(event: string, handler: Handler): unknown;
  url?(): string;
}

export interface PageCaptureRow {
  at: string;
  type: 'info' | 'console' | 'pageerror' | 'requestfailed' | 'http-error';
  level?: string;
  text?: string;
  stack?: string | null;
  location?: string | null;
  method?: string;
  url?: string;
  status?: number;
  failure?: string;
  aborted?: boolean;
}

export interface PageCaptureSummary {
  file: string | null;
  rows: number;
  consoleErrors: number;
  consoleWarnings: number;
  pageErrors: Array<{ at: string; text: string }>;
  pageErrorCount: number;
  failedRequests: Array<{ at: string; method: string; url: string; status?: number; failure?: string; aborted?: boolean }>;
  failedRequestCount: number;
  httpErrorCount: number;
  abortedCount: number;
  consoleErrorSamples: Array<{ at: string; text: string }>;
}

export function pathOnly(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === 'data:' || url.protocol === 'blob:' ? `${url.protocol}…` : `${url.origin}${url.pathname}`;
  } catch {
    return raw.split('?')[0].slice(0, 300);
  }
}

export const isApiPath = (raw: string) => {
  try {
    return new URL(raw).pathname.startsWith('/api/');
  } catch {
    return raw.startsWith('/api/');
  }
};

export const isAborted = (failure: string | undefined) => /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure ?? '');

export function summarise(rows: PageCaptureRow[], file: string | null = null): PageCaptureSummary {
  const pageErrors = rows.filter((row) => row.type === 'pageerror');
  const failed = rows.filter((row) => row.type === 'requestfailed' || row.type === 'http-error');
  const consoleErrors = rows.filter((row) => row.type === 'console' && row.level === 'error');
  return {
    file,
    rows: rows.length,
    consoleErrors: consoleErrors.length,
    consoleWarnings: rows.filter((row) => row.type === 'console' && row.level === 'warning').length,
    pageErrors: pageErrors.slice(0, KEEP_ITEMS).map((row) => ({ at: row.at, text: String(row.text ?? '').slice(0, 500) })),
    pageErrorCount: pageErrors.length,
    failedRequests: failed.slice(0, KEEP_ITEMS).map((row) => ({ at: row.at, method: String(row.method ?? ''), url: String(row.url ?? ''), ...(row.status !== undefined ? { status: row.status } : {}), ...(row.failure ? { failure: row.failure } : {}), ...(row.aborted ? { aborted: true } : {}) })),
    failedRequestCount: failed.length,
    httpErrorCount: rows.filter((row) => row.type === 'http-error').length,
    abortedCount: failed.filter((row) => row.aborted).length,
    consoleErrorSamples: consoleErrors.slice(0, 10).map((row) => ({ at: row.at, text: String(row.text ?? '').slice(0, 300) })),
  };
}

export interface PageCapture {
  file: string | null;
  mark(): number;
  rows(from?: number): PageCaptureRow[];
  summary(from?: number): PageCaptureSummary;
  stop(): void;
}

export function attachPageCapture(page: CapturablePage, { file = null as string | null, now = () => new Date(), label = 'capture' } = {}): PageCapture {
  const rows: PageCaptureRow[] = [];
  if (file) mkdirSync(dirname(file), { recursive: true });
  const write = (row: Omit<PageCaptureRow, 'at'>) => {
    const full = { at: now().toISOString(), ...row } as PageCaptureRow;
    rows.push(full);
    if (file) {
      try { appendFileSync(file, `${JSON.stringify(full)}\n`, 'utf-8'); } catch {}
    }
  };
  const handlers: Array<[string, Handler]> = [
    ['console', (message: any) => {
      const level = String(message?.type?.() ?? '');
      if (level !== 'error' && level !== 'warning') return;
      const location = message?.location?.();
      write({ type: 'console', level, text: String(message?.text?.() ?? '').slice(0, 2000), location: location?.url ? `${pathOnly(location.url)}:${location.lineNumber ?? ''}` : null });
    }],
    ['pageerror', (error: any) => write({ type: 'pageerror', text: String(error?.message ?? error).slice(0, 2000), stack: error?.stack ? String(error.stack).slice(0, 4000) : null })],
    ['requestfailed', (request: any) => {
      const failure = String(request?.failure?.()?.errorText ?? 'failed');
      write({ type: 'requestfailed', method: String(request?.method?.() ?? ''), url: pathOnly(String(request?.url?.() ?? '')), failure, aborted: isAborted(failure) });
    }],
    ['response', (response: any) => {
      const status = Number(response?.status?.() ?? 0);
      const url = String(response?.url?.() ?? '');
      if (status < 400 || !isApiPath(url)) return;
      write({ type: 'http-error', method: String(response?.request?.()?.method?.() ?? ''), url: pathOnly(url), status });
    }],
  ];
  for (const [event, handler] of handlers) page.on(event, handler);
  write({ type: 'info', text: `page capture attached (${label})` });
  return {
    file,
    mark: () => rows.length,
    rows: (from = 0) => rows.slice(from),
    summary: (from = 0) => summarise(rows.slice(from), file),
    stop: () => { for (const [event, handler] of handlers) page.off?.(event, handler); },
  };
}

let current: PageCapture | null = null;
export const currentPageCapture = () => current;
export const setCurrentPageCapture = (capture: PageCapture | null) => { current = capture; };

export function captureFileFor(env: NodeJS.ProcessEnv, debugDir: string, label: string, stamp = new Date().toISOString().replace(/[:.]/g, '-')): string {
  const rowDir = String(env[ROW_DIR_ENV] ?? '').trim();
  if (rowDir) return resolve(rowDir, PAGE_CAPTURE_FILE);
  return resolve(debugDir, `page-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}-${stamp}.jsonl`);
}

export function captureWanted(env: NodeJS.ProcessEnv, optIn: string | false | undefined): string | null {
  if (String(env[PAGE_CAPTURE_ENV] ?? '').toLowerCase() === 'off' || optIn === false) return null;
  if (typeof optIn === 'string' && optIn) return optIn;
  return String(env[ROW_DIR_ENV] ?? '').trim() ? 'row' : null;
}

export function pageErrorLines(summary: PageCaptureSummary): string[] {
  return [
    `page-capture: ${JSON.stringify({ file: summary.file, pageErrors: summary.pageErrorCount, consoleErrors: summary.consoleErrors, failedRequests: summary.failedRequestCount, httpErrors: summary.httpErrorCount })}`,
    ...summary.pageErrors.map((error) => `PAGE-ERROR ${error.at} ${error.text.split('\n')[0]}`),
    ...summary.failedRequests.filter((request) => !request.aborted).map((request) => `REQUEST-FAILED ${request.at} ${request.method} ${request.url} ${request.status ?? request.failure ?? ''}`.trim()),
  ];
}

export function writeSummaryNextTo(capture: PageCapture, env: NodeJS.ProcessEnv = process.env) {
  const rowDir = String(env[ROW_DIR_ENV] ?? '').trim();
  if (!rowDir) return null;
  const path = resolve(rowDir, PAGE_SUMMARY_FILE);
  writeFileSync(path, JSON.stringify(capture.summary(), null, 2), 'utf-8');
  return path;
}
