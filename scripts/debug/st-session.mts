import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { clearSession, DEBUG_DIR, DEFAULT_CDP_PORT, DEFAULT_ST_URL, DEFAULT_TIMEOUT_MS, getSessionStatus, SESSION_PATH, writeSession } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';

const USAGE = `Usage: node scripts/debug/st-session.mts <start|stop|status> [--headed]

Commands:
  start      Launch shared Chromium with a CDP endpoint
  stop       Stop the shared Chromium process and remove .debug/session.json
  status     Print session status`;

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function execFilePromise(file, args, options = {}): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    execFile(file, args, { timeout: DEFAULT_TIMEOUT_MS, ...options }, (error, stdout, stderr) => {
      if (error) {
        rejectP(new Error(stderr?.trim() || error.message));
        return;
      }
      resolveP(stdout.trim());
    });
  });
}

const SESSION_ERROR_PATH = resolve(DEBUG_DIR, 'session-error.json');

async function writeSessionError(error) {
  await mkdir(DEBUG_DIR, { recursive: true });
  await writeFile(SESSION_ERROR_PATH, JSON.stringify({
    error: error.message || String(error),
    at: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

async function readSessionError() {
  try {
    return JSON.parse(await readFile(SESSION_ERROR_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function findWindowsChromePid(port, userDataDir) {
  const command = [
    '$port =', psQuote(`--remote-debugging-port=${port}`), ';',
    '$profile =', psQuote(userDataDir), ';',
    '$p = Get-CimInstance Win32_Process |',
    'Where-Object { $_.CommandLine -like ("*" + $port + "*") -and $_.CommandLine -like ("*" + $profile + "*") } |',
    'Sort-Object CreationDate -Descending | Select-Object -First 1;',
    'if ($p) { $p.ProcessId }',
  ].join(' ');
  const output = await execFilePromise('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
  const pid = Number(output.split(/\s+/).find(Boolean));
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function waitForCdp(cdpEndpoint, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cdpEndpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err.message || String(err);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for CDP endpoint ${cdpEndpoint}: ${lastError || 'no response'}`);
}

async function preparePage(cdpEndpoint, stUrl) {
  const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: DEFAULT_TIMEOUT_MS });
  try {
    const context = browser.contexts()[0] || await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(stUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    await ensureSTReady(page, { timeout: DEFAULT_TIMEOUT_MS });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runStarter() {
  await mkdir(DEBUG_DIR, { recursive: true });
  const headed = process.argv.includes('--headed');
  const stUrl = argValue('--st-url', DEFAULT_ST_URL);
  const port = Number(argValue('--port', DEFAULT_CDP_PORT));
  const cdpEndpoint = `http://127.0.0.1:${port}`;
  const userDataDir = resolve(DEBUG_DIR, 'chromium-profile');
  await mkdir(userDataDir, { recursive: true });

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
  ];
  if (!headed) chromeArgs.push('--headless=new');
  chromeArgs.push('about:blank');

  const child = spawn(chromium.executablePath(), chromeArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: !headed,
  });
  child.unref();

  try {
    const version = await waitForCdp(cdpEndpoint);
    await preparePage(cdpEndpoint, stUrl);
    const pid = child.pid ?? await findWindowsChromePid(port, userDataDir);
    await writeSession({
      cdpEndpoint,
      stUrl,
      pid,
      headed,
      startedAt: new Date().toISOString(),
      launcher: 'chromium',
    });
    return { running: true, session: (await getSessionStatus()).session, version };
  } catch (err) {
    if (child.pid) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolveKill) => execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], () => resolveKill()));
      } else {
        try { process.kill(child.pid, 'SIGTERM'); } catch {}
      }
    }
    throw err;
  }
}

async function launchStarter() {
  const script = fileURLToPath(import.meta.url);
  const starterArgs = [script, '__starter'];
  if (process.argv.includes('--headed')) starterArgs.push('--headed');
  starterArgs.push('--st-url', argValue('--st-url', DEFAULT_ST_URL));
  starterArgs.push('--port', String(argValue('--port', DEFAULT_CDP_PORT)));

  if (process.platform === 'win32') {
    const psArgs = '@(' + starterArgs.map(psQuote).join(',') + ')';
    const command = `Start-Process -FilePath ${psQuote(process.execPath)} -ArgumentList ${psArgs} -WindowStyle Hidden`;
    await execFilePromise('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
    return;
  }

  const child = spawn(process.execPath, starterArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function waitForSessionFile(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await getSessionStatus();
    if (last.running) return last;
    const error = await readSessionError();
    if (error) throw new Error(error.error);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for session file/CDP readiness: ${last?.error || 'not ready'}`);
}

async function startSession() {
  const existing = await getSessionStatus();
  if (existing.running) return existing;
  if (existing.session) await clearSession();
  await rm(SESSION_ERROR_PATH, { force: true });
  await launchStarter();
  return waitForSessionFile();
}

async function stopSession() {
  const status = await getSessionStatus();
  const pid = status.session?.pid;
  if (pid) {
    await new Promise<void>((resolveKill) => {
      if (process.platform === 'win32') {
        execFile('taskkill.exe', ['/pid', String(pid), '/t', '/f'], () => resolveKill());
      } else {
        try { process.kill(pid, 'SIGTERM'); } catch {}
        resolveKill();
      }
    });
  }
  await clearSession();
  return { stopped: Boolean(status.session), sessionPath: SESSION_PATH };
}

if (process.argv[2] === '__starter') {
  runStarter()
    .then(() => process.exit(0))
    .catch(async (err) => {
      await writeSessionError(err);
      process.exit(1);
    });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const command = process.argv[2];
    if (!command || command === '--help' || command === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    try {
      if (command === 'start') {
        console.log(JSON.stringify(await startSession(), null, 2));
      } else if (command === 'stop') {
        console.log(JSON.stringify(await stopSession(), null, 2));
      } else if (command === 'status') {
        console.log(JSON.stringify(await getSessionStatus(), null, 2));
      } else {
        console.error(`Unknown command: ${command}`);
        console.log(USAGE);
        process.exit(1);
      }
    } catch (err) {
      console.error('Error:', err.message || String(err));
      process.exit(1);
    }
    process.exit(0);
  })();
}
