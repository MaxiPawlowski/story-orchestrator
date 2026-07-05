import { connectToST } from './connection.mjs';
import { ensureSTReady } from './st-ready.mjs';

export function hasHelpFlag(args = process.argv.slice(2)) {
  return args.includes('--help') || args.includes('-h');
}

export function stripCommonArgs(args = process.argv.slice(2)) {
  return args.filter((arg, index) => {
    if (arg === '--headed') return false;
    if (args[index - 1] === '--st-url') return false;
    if (arg === '--st-url') return false;
    return true;
  });
}

export function commonConnectOptions(args = process.argv.slice(2)) {
  const stUrlIndex = args.indexOf('--st-url');
  return {
    headless: !args.includes('--headed'),
    stUrl: stUrlIndex >= 0 && args[stUrlIndex + 1] ? args[stUrlIndex + 1] : undefined,
  };
}

export async function withST(fn, options = {}) {
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
