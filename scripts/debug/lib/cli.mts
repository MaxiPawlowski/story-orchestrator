import type { Page } from 'playwright';
import { connectToST, DEBUG_DIR, type ConnectOptions, type ConnectResult } from './connection.mts';
import { ensureSTReady } from './st-ready.mts';
import { attachPageCapture, captureFileFor, captureWanted, pageErrorLines, setCurrentPageCapture, writeSummaryNextTo, type PageCapture } from './pageCapture.mts';

export function hasHelpFlag(args: string[] = process.argv.slice(2)): boolean {
  return args.includes('--help') || args.includes('-h');
}

export function stripCommonArgs(args: string[] = process.argv.slice(2)): string[] {
  return args.filter((arg, index) => {
    if (arg === '--headed') return false;
    if (args[index - 1] === '--st-url') return false;
    if (arg === '--st-url') return false;
    return true;
  });
}

export function commonConnectOptions(args: string[] = process.argv.slice(2)): ConnectOptions {
  const stUrlIndex = args.indexOf('--st-url');
  return {
    headless: !args.includes('--headed'),
    stUrl: stUrlIndex >= 0 && args[stUrlIndex + 1] ? args[stUrlIndex + 1] : undefined,
  };
}

export async function withST<T>(fn: (page: Page, conn: ConnectResult) => Promise<T>, options: ConnectOptions = {}): Promise<T> {
  let browser;
  try {
    const conn = await connectToST({ ...commonConnectOptions(), ...options });
    browser = conn.browser;
    await ensureSTReady(conn.page);
    return await fn(conn.page, conn);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export interface CliResult {
  ok?: boolean;
}

// Shared entrypoint for every debug script's `if (process.argv[1] === ...)` main block:
// connect, wait for ST readiness, run the script body, then clean up and set process.exitCode.
// Each script keeps its own --help/usage and argument validation before calling this.
export async function runCli(
  main: (page: Page, conn: ConnectResult) => Promise<CliResult | void>,
  { keepOpen = false, pageCapture }: { keepOpen?: boolean; pageCapture?: string | false } = {},
): Promise<void> {
  let browser;
  let capture: PageCapture | null = null;
  try {
    const conn = await connectToST(commonConnectOptions());
    browser = conn.browser;
    const label = keepOpen && typeof pageCapture !== 'string' ? null : captureWanted(process.env, pageCapture);
    if (label) {
      capture = attachPageCapture(conn.page, { file: captureFileFor(process.env, DEBUG_DIR, label), label });
      setCurrentPageCapture(capture);
    }
    await ensureSTReady(conn.page);
    const result = await main(conn.page, conn);
    if (result && result.ok === false) process.exitCode = 1;
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    if (capture && !keepOpen) {
      for (const line of pageErrorLines(capture.summary())) console.log(line);
      try { writeSummaryNextTo(capture); } catch {}
      capture.stop();
      setCurrentPageCapture(null);
    }
    if (browser && !keepOpen) await browser.close().catch(() => {});
    if (!keepOpen) process.exit(process.exitCode || 0);
  }
}
