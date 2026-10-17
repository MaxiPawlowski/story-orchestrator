import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { DEBUG_DIR } from './lib/connection.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { hasHelpFlag, runCli } from './lib/cli.mts';

const USAGE = `Usage: node so-tour-check.mts <help|setup|read-more|all> [--label <name>]

Plumbing checks for the in-plugin tour. No model call, nothing written to the chat or settings.
  help       open Orchestrator → Help and press "Take the tour"; the tour dialog opens.
  setup      run /story tour setup, pick "The memory model", press "Open this setting"; the tour closes and the
             workspace opens on Connections with the memory model select focused.
  read-more  open the tour and press a step's Read more; the in-app guide reader opens at that page.
  all        the three in order.
Writes record.json and one screenshot per check to <debug dir>/tour/<stamp>-<label>/.`;

type Check = { name: string; ok: boolean; detail: Record<string, unknown>; screenshot?: string };

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitFor<T>(page: Page, read: () => T | Promise<T>, accept: (value: T) => boolean, timeoutMs = 15000): Promise<T> {
  const started = Date.now();
  let last = await read();
  while (!accept(last) && Date.now() - started < timeoutMs) { await sleep(200); last = await read(); }
  return last;
}

const tourState = (page: Page) => evaluateInST(page, () => {
  const tour = document.querySelector('#so-tour-modal') as HTMLDialogElement | null;
  const reader = document.querySelector('#so-tour-guide-reader') as HTMLDialogElement | null;
  const workspace = document.querySelector('#so-workspace-modal') as HTMLDialogElement | null;
  return {
    tourOpen: Boolean(tour?.open), view: tour?.getAttribute('data-view') ?? null,
    step: (tour?.querySelector('#so-tour-step-title') as HTMLElement | null)?.innerText ?? null,
    readerOpen: Boolean(reader?.open), readerHeading: (reader?.querySelector('h2[data-so="guide-heading"]') as HTMLElement | null)?.innerText ?? null,
    workspaceOpen: Boolean(workspace?.open), workspaceContext: workspace?.getAttribute('data-context') ?? null,
    workspacePage: (workspace?.querySelector('.so-workspace-nav [aria-current="page"]') as HTMLElement | null)?.innerText ?? null,
    focused: document.activeElement?.id ?? null,
  };
});

const closeAll = (page: Page) => evaluateInST(page, () => {
  for (const id of ['so-tour-guide-reader', 'so-tour-finder', 'so-tour-modal']) {
    const button = document.querySelector(id === 'so-tour-modal' ? '[data-so="tour-close"]' : id === 'so-tour-guide-reader' ? '[data-so="tour-guide-close"]' : '#so-tour-finder button') as HTMLButtonElement | null;
    if ((document.getElementById(id) as HTMLDialogElement | null)?.open) button?.click();
  }
  (document.querySelector('#so-workspace-modal header button') as HTMLButtonElement | null)?.click();
});

async function shot(page: Page, dir: string, name: string): Promise<string> {
  const path = resolve(dir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

async function servedBundle(page: Page) {
  return evaluateInST(page, async () => {
    const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/index.js', { cache: 'no-store' });
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const manifest = await (await fetch('/scripts/extensions/third-party/story-orchestrator/dist/manifest.json', { cache: 'no-store' })).json().catch(() => null);
    return { bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      manifestSource: manifest?.source?.sha256 ?? manifest?.sourceHash ?? null, builtAt: manifest?.builtAt ?? null };
  });
}

async function checkHelp(page: Page, dir: string): Promise<Check> {
  await closeAll(page);
  await evaluateInST(page, () => (document.querySelector('#so-open-workspace') as HTMLButtonElement | null)?.click());
  await waitFor(page, () => tourState(page), (state) => state.workspaceOpen);
  await page.locator('#so-workspace-page-help').click();
  await page.locator('#so-help-tour').click();
  const state = await waitFor(page, () => tourState(page), (value) => value.tourOpen);
  const screenshot = await shot(page, dir, 'help-take-the-tour');
  return { name: 'help', ok: state.tourOpen && state.workspaceOpen && Boolean(state.step), detail: state, screenshot };
}

async function checkSetup(page: Page, dir: string): Promise<Check> {
  await closeAll(page);
  await waitFor(page, () => tourState(page), (state) => !state.tourOpen && !state.workspaceOpen, 5000);
  const slash = await evaluateInST(page, async () => {
    const result = await (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions('/story tour setup', { handleParserErrors: false });
    return { isError: Boolean(result?.isError) };
  });
  const opened = await waitFor(page, () => tourState(page), (state) => state.tourOpen && state.view === 'setup');
  await page.locator('#so-tour-modal [data-so="tour-nav-step"][data-step="memory-model"]').click();
  const atStep = await waitFor(page, () => tourState(page), (state) => state.step === 'The memory model');
  const before = await shot(page, dir, 'setup-path-step');
  await page.locator('#so-tour-modal [data-so="tour-show"]').click();
  const landed = await waitFor(page, () => tourState(page), (state) => !state.tourOpen && state.workspaceOpen && state.focused === 'so-extraction-profile');
  const screenshot = await shot(page, dir, 'setup-deep-link');
  const ok = !slash.isError && opened.view === 'setup' && atStep.step === 'The memory model' && !landed.tourOpen
    && landed.workspaceContext === 'orchestrator' && landed.workspacePage === 'Connections' && landed.focused === 'so-extraction-profile';
  return { name: 'setup', ok, detail: { slash, opened, atStep, landed, stepScreenshot: before }, screenshot };
}

async function checkReadMore(page: Page, dir: string): Promise<Check> {
  await closeAll(page);
  await evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions('/story tour player', { handleParserErrors: false }));
  await waitFor(page, () => tourState(page), (state) => state.tourOpen && state.view === 'player');
  await page.locator('#so-tour-modal [data-so="tour-nav-step"][data-step="stuck"]').click();
  const doc = await page.locator('#so-tour-modal [data-so="tour-read-more"]').getAttribute('data-doc');
  await page.locator('#so-tour-modal [data-so="tour-read-more"]').click();
  const state = await waitFor(page, () => tourState(page), (value) => value.readerOpen && Boolean(value.readerHeading));
  const readAnchor = () => evaluateInST(page, (anchor) => {
    const reader = document.querySelector('#so-tour-guide-reader') as HTMLElement | null;
    const heading = reader?.querySelector(`#so-guide-h-${anchor}`) as HTMLElement | null;
    const box = reader?.getBoundingClientRect();
    const top = heading?.getBoundingClientRect().top ?? -1;
    return { heading: heading?.innerText ?? null, inView: Boolean(box && heading && top >= box.top && top < box.bottom) };
  }, (doc ?? '').split('#')[1] ?? '');
  const anchorShown = await waitFor(page, readAnchor, (value) => value.inView, 8000);
  const github = await evaluateInST(page, () => Array.from(document.querySelectorAll('#so-tour-modal a[href*="github.com"]')).filter((node) => !(node as HTMLElement).closest('#so-tour-guide-reader')).length);
  const screenshot = await shot(page, dir, 'read-more-guide-reader');
  const ok = state.readerOpen && state.readerHeading === 'Starting, continuing and restarting' && anchorShown.heading !== null && anchorShown.inView && github === 0;
  return { name: 'read-more', ok, detail: { doc, ...state, anchorShown, githubLinksOutsideReader: github }, screenshot };
}

async function main(page: Page) {
  const args = process.argv.slice(2);
  if (hasHelpFlag(args) || !args[0]) { console.log(USAGE); return; }
  const verb = args[0];
  const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : verb;
  const dir = resolve(DEBUG_DIR, 'tour', `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`);
  await mkdir(dir, { recursive: true });
  const bundle = await servedBundle(page);
  const runs: Record<string, (page: Page, dir: string) => Promise<Check>> = { help: checkHelp, setup: checkSetup, 'read-more': checkReadMore };
  const names = verb === 'all' ? Object.keys(runs) : [verb];
  if (names.some((name) => !runs[name])) { console.log(USAGE); return { ok: false }; }
  const checks: Check[] = [];
  for (const name of names) {
    try { checks.push(await runs[name](page, dir)); }
    catch (error) { checks.push({ name, ok: false, detail: { error: error instanceof Error ? error.message : String(error) } }); }
  }
  await closeAll(page);
  const record = { label, at: new Date().toISOString(), servedBundle: bundle, ok: checks.every((check) => check.ok), checks };
  await writeFile(resolve(dir, 'record.json'), JSON.stringify(record, null, 2), 'utf-8');
  console.log(JSON.stringify({ ok: record.ok, dir, servedBundle: bundle, checks: checks.map((check) => ({ name: check.name, ok: check.ok })) }, null, 2));
  return { ok: record.ok };
}

runCli(main);
