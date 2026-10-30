import type { Page } from 'playwright';
import { evaluateInST } from './evaluate.mts';

export interface ShowMeRow { feature: string; target: string }
export interface ShowMeOutcome extends ShowMeRow { reached: boolean; blocked: string | null; topmost: string | null }
export interface ShowMeAudit {
  authorView: boolean | null;
  storyReady: boolean | null;
  viewport: { width: number; height: number };
  offered: number;
  reached: number;
  misses: ShowMeOutcome[];
  rows: ShowMeOutcome[];
}

const HELP_PANEL = '#so-panels-root [data-so="help-panel"]';

const closeWorkspace = async (page: Page) => {
  const workspace = page.locator('#so-workspace-modal[open]');
  if (!(await workspace.count())) return;
  await workspace.getByRole('button', { name: 'Close Story Orchestrator' }).click();
  await page.waitForFunction(() => !(document.querySelector('#so-workspace-modal') as HTMLDialogElement | null)?.open, null, { timeout: 10000 });
};

export async function openHelpPanel(page: Page) {
  if (await page.locator(HELP_PANEL).count()) return;
  await closeWorkspace(page);
  await page.locator('#so-drawer .drawer-toggle').click();
  const workspace = page.locator('#so-workspace-modal[open]');
  await workspace.waitFor({ state: 'visible', timeout: 10000 });
  await workspace.locator('#so-workspace-context-orchestrator').click();
  await workspace.locator('#so-workspace-page-help').click();
  await workspace.locator('#so-help-open-panel').click();
  await closeWorkspace(page);
  await page.locator(HELP_PANEL).waitFor({ state: 'attached', timeout: 10000 });
}

export const offeredShowMe = (page: Page) => evaluateInST(page, (panel: string) => Array.from(document.querySelectorAll(`${panel} [data-so="help-show-me"]`))
  .map((button) => ({ feature: button.closest('[data-so="help-feature"]')?.getAttribute('data-feature') ?? '', target: button.getAttribute('data-target') ?? '' })), HELP_PANEL) as Promise<ShowMeRow[]>;

const landed = (page: Page, target: string, timeoutMs: number) => evaluateInST(page, async ({ id, limit }: { id: string; limit: number }) => {
  const describe = (node: Element | null) => (node ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}` : 'nothing');
  const check = () => {
    const element = document.getElementById(id);
    if (!element) return { reached: false, blocked: 'missing', topmost: null };
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return { reached: false, blocked: 'no-box', topmost: null };
    const left = Math.max(rect.left, 0), right = Math.min(rect.right, window.innerWidth);
    const top = Math.max(rect.top, 0), bottom = Math.min(rect.bottom, window.innerHeight);
    if (right <= left || bottom <= top) return { reached: false, blocked: 'offscreen', topmost: null };
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const style = getComputedStyle(element);
    if ((element as HTMLButtonElement).disabled === true || style.pointerEvents === 'none') return { reached: true, blocked: 'disabled', topmost: null };
    const topmost = document.elementFromPoint(x, y);
    const hit = Boolean(topmost && (topmost === element || element.contains(topmost) || topmost.contains(element) && topmost.tagName === 'LABEL'));
    return { reached: hit, blocked: hit ? null : 'overlay', topmost: describe(topmost) };
  };
  const started = Date.now();
  let result = check();
  while (!result.reached && Date.now() - started < limit) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    result = check();
  }
  return result;
}, { id: target, limit: timeoutMs }) as Promise<Omit<ShowMeOutcome, keyof ShowMeRow>>;

export async function helpShowMeAudit(page: Page, { settleMs = 2500, reachMs = 5000 } = {}): Promise<ShowMeAudit> {
  await openHelpPanel(page);
  await page.waitForTimeout(settleMs);
  const context = await evaluateInST(page, () => {
    const snapshot = globalThis.storyOrchestratorRuntime?.getSnapshot?.();
    return { authorView: snapshot?.ui?.authorView ?? null, storyReady: snapshot?.ready ?? null, viewport: { width: window.innerWidth, height: window.innerHeight } };
  });
  const offered = await offeredShowMe(page);
  const rows: ShowMeOutcome[] = [];
  for (const row of offered) {
    await closeWorkspace(page);
    const clicked = await evaluateInST(page, ({ panel, feature }: { panel: string; feature: string }) => {
      const button = document.querySelector(`${panel} [data-so="help-feature"][data-feature="${feature}"] [data-so="help-show-me"]`) as HTMLButtonElement | null;
      button?.click();
      return Boolean(button);
    }, { panel: HELP_PANEL, feature: row.feature });
    rows.push({ ...row, ...(clicked ? await landed(page, row.target, reachMs) : { reached: false, blocked: 'no-button', topmost: null }) });
  }
  await closeWorkspace(page);
  const reached = rows.filter((row) => row.reached).length;
  return { ...context, offered: rows.length, reached, misses: rows.filter((row) => !row.reached), rows };
}
