import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { DEBUG_DIR } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';

const USAGE = `Usage: node so-tour-check.mts <player|author|setup|help|quick-start|all> [--label <name>]

Plumbing checks for the coach-mark tours. No model call. A tour only opens pages; nothing is written to the chat or
settings by the check (the author flow opens the Studio on the story in this chat and leaves it unsaved).
  player|author|setup  run /story tour <view>, walk every stop with real clicks on Next, record each stop's state
                       (found, hidden or missing), where the card sits, and a screenshot; Escape at the first
                       workspace stop after the first must close the tour and leave the workspace open.
  help                 Settings → Help → Take the tour opens the chooser; "Setting up" starts the setup tour;
                       Setup path opens the setup path guide page.
  quick-start          /story guide quick-start: the checklist ticks from real state; a Show me starts its tour stop.
  all                  everything in order.
Viewport: prefix ST_DEBUG_VIEWPORT=<W>x<H>. Writes record.json and screenshots to <debug dir>/tour/<stamp>-<label>/.`;

type Check = { name: string; ok: boolean; detail: Record<string, unknown>; screenshots: string[] };

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 15000): Promise<T> {
  const started = Date.now();
  let last = await read();
  while (!accept(last) && Date.now() - started < timeoutMs) { await sleep(150); last = await read(); }
  return last;
}

const coachState = (page: Page) => evaluateInST(page, () => {
  const coach = document.getElementById('so-coach');
  const card = coach?.querySelector('.so-coach-card') as HTMLElement | null;
  const ring = coach?.querySelector('[data-so="coach-ring"]') as HTMLElement | null;
  const box = (element: Element | null | undefined) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) };
  };
  const workspace = document.getElementById('so-workspace-modal') as HTMLDialogElement | null;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const cardBox = box(card);
  return {
    open: Boolean(coach), flow: coach?.getAttribute('data-flow') ?? null, stop: coach?.getAttribute('data-stop') ?? null,
    state: coach?.getAttribute('data-state') ?? null, mode: coach?.getAttribute('data-mode') ?? null, edge: coach?.getAttribute('data-edge') ?? null,
    popoverOpen: Boolean(coach?.matches(':popover-open')), host: coach?.parentElement?.id || coach?.parentElement?.tagName || null,
    title: (coach?.querySelector('#so-coach-title') as HTMLElement | null)?.innerText ?? null,
    count: (coach?.querySelector('[data-so="coach-count"]') as HTMLElement | null)?.innerText ?? null,
    note: (coach?.querySelector('[data-so="coach-note"]') as HTMLElement | null)?.innerText ?? null,
    card: cardBox, ring: box(ring), viewport,
    cardInView: Boolean(cardBox && cardBox.top >= 0 && cardBox.left >= 0 && cardBox.top + cardBox.height <= viewport.height + 1 && cardBox.left + cardBox.width <= viewport.width + 1),
    focused: (document.activeElement as HTMLElement | null)?.getAttribute('data-so') ?? document.activeElement?.id ?? null,
    workspaceOpen: Boolean(workspace?.open), workspacePage: (workspace?.querySelector('.so-workspace-nav [aria-current="page"]') as HTMLElement | null)?.innerText ?? null,
    studioOpen: Boolean((document.getElementById('so-studio-modal') as HTMLDialogElement | null)?.open),
    guideOpen: Boolean(document.getElementById('so-guide')), guidePage: (document.querySelector('#so-guide [data-so="guide-page"]') as HTMLElement | null)?.getAttribute('data-doc') ?? null,
    horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

type CoachState = Awaited<ReturnType<typeof coachState>>;

const slash = (page: Page, command: string) => evaluateInST(page, async (text) => {
  const result = await (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions(text, { handleParserErrors: false });
  return { isError: Boolean(result?.isError) };
}, command);

const settlePopups = (page: Page) => evaluateInST(page, () => {
  const popups = Array.from(document.querySelectorAll('dialog.popup[open]')) as HTMLDialogElement[];
  for (const popup of popups) (popup.querySelector('.popup-button-cancel, .popup-button-ok') as HTMLElement | null)?.click();
  return popups.length;
});

const closeAll = async (page: Page) => {
  await evaluateInST(page, () => {
    (document.querySelector('#so-coach [data-so="coach-skip"]') as HTMLButtonElement | null)?.click();
    (document.querySelector('#so-workspace-modal header button') as HTMLButtonElement | null)?.click();
  });
  await sleep(400);
};

const label = (viewport: { width: number; height: number }) => `${viewport.width}x${viewport.height}`;

async function shot(page: Page, dir: string, name: string): Promise<string> {
  const path = resolve(dir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

const STOP_COUNTS: Record<string, number> = { player: 7, author: 6, setup: 6 };

const atStop = (page: Page, view: string, index: number) =>
  waitFor(() => coachState(page), (value) => value.open && value.state !== 'looking' && value.count === `Step ${index + 1} of ${STOP_COUNTS[view]}`, 20000);

async function checkFlow(page: Page, dir: string, view: string): Promise<Check> {
  await closeAll(page);
  const screenshots: string[] = [];
  const slashResult = await slash(page, `/story tour ${view}`);
  const stops: Array<CoachState & { index: number }> = [];
  let escape: Record<string, unknown> | null = null;
  for (let index = 0; index < STOP_COUNTS[view]; index += 1) {
    await settlePopups(page);
    await atStop(page, view, index);
    await sleep(500);
    const settled = await coachState(page);
    stops.push({ ...settled, index });
    screenshots.push(await shot(page, dir, `${view}-${String(index + 1).padStart(2, '0')}-${settled.stop}-${label(settled.viewport)}`));
    if (!escape && settled.workspaceOpen && settled.state === 'found' && index > 0) {
      await page.keyboard.press('Escape');
      const after = await waitFor(() => coachState(page), (value) => !value.open, 3000);
      escape = { coachClosed: !after.open, workspaceStillOpen: after.workspaceOpen, atStop: settled.stop };
      await slash(page, `/story tour ${view}`);
      for (let again = 0; again < index; again += 1) {
        await atStop(page, view, again);
        await settlePopups(page);
        await page.locator('#so-coach [data-so="coach-next"]').click();
      }
      await atStop(page, view, index);
    }
    await page.locator('#so-coach [data-so="coach-next"]').click();
  }
  const closed = await waitFor(() => coachState(page), (value) => !value.open, 3000);
  const ok = !slashResult.isError && stops.length === STOP_COUNTS[view] && !closed.open
    && stops.every((stop) => stop.flow === view && stop.popoverOpen && stop.cardInView && !stop.horizontalScroll && stop.focused === 'coach-next')
    && stops.every((stop) => stop.state !== 'found' || Boolean(stop.ring))
    && (escape === null || (escape.coachClosed === true && escape.workspaceStillOpen === true));
  return { name: view, ok, detail: { slash: slashResult, stops, escape, closedAtEnd: !closed.open }, screenshots };
}

async function openHelpPage(page: Page) {
  await evaluateInST(page, () => (document.querySelector('#so-open-workspace') as HTMLButtonElement | null)?.click());
  await waitFor(() => coachState(page), (state) => state.workspaceOpen);
  await page.locator('#so-workspace-page-help').click();
}

async function checkHelp(page: Page, dir: string): Promise<Check> {
  await closeAll(page);
  const screenshots: string[] = [];
  await openHelpPage(page);
  const entries = await waitFor(() => evaluateInST(page, () => Object.fromEntries(['so-help-quick-start', 'so-help-tour', 'so-help-tour-setup']
    .map((id) => [id, Boolean(document.querySelector(`#so-workspace-modal #${id}`))]))), (value) => Object.values(value).every(Boolean), 8000);
  const panelEntries = await evaluateInST(page, () => Object.fromEntries(['so-help-open-panel', 'so-help-open-guide']
    .map((id) => [id, Boolean(document.querySelector(`#so-workspace-modal #${id}`))])));
  screenshots.push(await shot(page, dir, `help-page-${label((await coachState(page)).viewport)}`));
  await page.locator('#so-help-tour').click();
  const chooser = await waitFor(() => coachState(page), (state) => state.open && state.flow === 'choose');
  screenshots.push(await shot(page, dir, `help-chooser-${label(chooser.viewport)}`));
  await page.locator('#so-coach [data-so="coach-pick-setup"]').click();
  const setup = await waitFor(() => coachState(page), (state) => state.flow === 'setup' && state.state !== 'looking');
  await page.locator('#so-coach [data-so="coach-skip"]').click();
  await closeAll(page);
  await openHelpPage(page);
  await page.locator('#so-help-tour-setup').click();
  const guide = await waitFor(() => coachState(page), (state) => state.guideOpen && state.guidePage === 'setup/setup-path.md');
  screenshots.push(await shot(page, dir, `help-setup-path-${label(guide.viewport)}`));
  await evaluateInST(page, () => (document.querySelector('#so-panel-guide [aria-label^="Close"], #so-panel-guide .so-panel-close') as HTMLButtonElement | null)?.click());
  const ok = Object.values(entries).every(Boolean) && chooser.flow === 'choose' && setup.stop === 'memory' && setup.state === 'found' && !guide.workspaceOpen && guide.guidePage === 'setup/setup-path.md';
  return { name: 'help', ok, detail: { entries, panelEntries, chooser, setup, guide }, screenshots };
}

async function checkQuickStart(page: Page, dir: string): Promise<Check> {
  await closeAll(page);
  const screenshots: string[] = [];
  await slash(page, '/story guide quick-start');
  const opened = await waitFor(() => coachState(page), (state) => state.guidePage === 'quick-start.md');
  const checks = await evaluateInST(page, () => Array.from(document.querySelectorAll('#so-guide [data-so="guide-check"]'))
    .map((node) => ({ check: node.getAttribute('data-check'), done: node.getAttribute('data-done') })));
  const truth = await evaluateInST(page, () => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snapshot = rt.getSnapshot();
    const settings = rt.getGlobalSettings();
    return { memory: Boolean(settings.extraction.enabled && settings.extraction.profileId), ready: snapshot.ready, boundary: snapshot.boundary,
      groupId: (globalThis as any).SillyTavern.getContext().groupId ?? null };
  });
  screenshots.push(await shot(page, dir, `quick-start-${label(opened.viewport)}`));
  await page.locator('#so-guide [data-so="guide-show"][data-show="setup:memory"]').click();
  const started = await waitFor(() => coachState(page), (state) => state.open && state.flow === 'setup' && state.state !== 'looking');
  screenshots.push(await shot(page, dir, `quick-start-show-me-${label(started.viewport)}`));
  await page.locator('#so-coach [data-so="coach-skip"]').click();
  const expected = { memory: truth.memory, group: Boolean(truth.groupId), story: Boolean(truth.groupId) && truth.ready, reply: Boolean(truth.groupId) && truth.ready && truth.boundary > 0 };
  const matches = checks.length === 4 && checks.every((entry) => String(expected[entry.check as keyof typeof expected]) === entry.done);
  const ok = opened.guidePage === 'quick-start.md' && matches && started.stop === 'memory' && !started.guideOpen;
  return { name: 'quick-start', ok, detail: { checks, truth, expected, started }, screenshots };
}

async function servedBundle(page: Page) {
  return evaluateInST(page, async () => {
    const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js', { cache: 'no-store' });
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('') };
  });
}

async function main(page: Page) {
  const args = process.argv.slice(2);
  if (hasHelpFlag(args) || !args[0]) { console.log(USAGE); return; }
  const verb = args[0];
  const runLabel = args.includes('--label') ? args[args.indexOf('--label') + 1] : verb;
  const dir = resolve(DEBUG_DIR, 'tour', `${new Date().toISOString().replace(/[:.]/g, '-')}-${runLabel}`);
  await mkdir(dir, { recursive: true });
  const bundle = await servedBundle(page);
  const runs: Record<string, (page: Page, dir: string) => Promise<Check>> = {
    player: (p, d) => checkFlow(p, d, 'player'), author: (p, d) => checkFlow(p, d, 'author'), setup: (p, d) => checkFlow(p, d, 'setup'),
    help: checkHelp, 'quick-start': checkQuickStart,
  };
  const names = verb === 'all' ? Object.keys(runs) : [verb];
  if (names.some((name) => !runs[name])) { console.log(USAGE); return { ok: false }; }
  const checks: Check[] = [];
  for (const name of names) {
    try { checks.push(await runs[name](page, dir)); }
    catch (error) {
      const screenshot = await shot(page, dir, `${name}-error`).catch(() => '');
      checks.push({ name, ok: false, detail: { error: error instanceof Error ? error.message : String(error) }, screenshots: screenshot ? [screenshot] : [] });
    }
  }
  await closeAll(page);
  const record = { label: runLabel, at: new Date().toISOString(), servedBundle: bundle, ok: checks.every((check) => check.ok), checks };
  await writeFile(resolve(dir, 'record.json'), JSON.stringify(record, null, 2), 'utf-8');
  console.log(JSON.stringify({ ok: record.ok, dir, servedBundle: bundle, checks: checks.map((check) => ({ name: check.name, ok: check.ok, states: (check.detail.stops as CoachState[] | undefined)?.map((stop) => `${stop.stop}:${stop.state}`) })) }, null, 2));
  return { ok: record.ok };
}

runCli(main);
