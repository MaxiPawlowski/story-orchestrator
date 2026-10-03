import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';

export async function readBriefingSetting(page): Promise<boolean | null> {
  return evaluateInST(page, () => {
    const value = globalThis.storyOrchestratorRuntime?.getGlobalSettings?.()?.display?.briefing;
    return typeof value === 'boolean' ? value : null;
  });
}

async function writeBriefingSetting(page, on: boolean) {
  await evaluateInST(page, (value) => { globalThis.storyOrchestratorRuntime?.setUiSettings?.({ briefing: value }); return true; }, on);
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const verified = await readBriefingSetting(page);
  return { saved, verified, ok: verified === on && !('error' in saved) };
}

export async function suppressBriefing(page) {
  const before = await readBriefingSetting(page);
  if (before !== true) return { changed: false, before };
  return { changed: true, before, ...(await writeBriefingSetting(page, false)) };
}

export async function restoreBriefing(page, before: boolean | null) {
  if (before === null) return { restored: false, reason: 'no pre-run capture' };
  const now = await readBriefingSetting(page);
  if (now === before) return { restored: false, unchanged: true, value: before };
  const written = await writeBriefingSetting(page, before);
  return { restored: true, from: now, to: before, ...written, ...(written.ok ? {} : { error: 'the briefing setting did not read back as restored' }) };
}

export interface BriefingModalState {
  open: boolean;
  title: string | null;
  sections: string[];
  blocks: string[];
  onboarding: boolean;
  optOut: boolean;
  startLabel: string | null;
  pending: boolean | null;
}

export async function readBriefingModal(page): Promise<BriefingModalState> {
  return evaluateInST(page, () => {
    const dialog = document.querySelector('dialog#so-briefing') as HTMLDialogElement | null;
    const text = (selector: string) => Array.from(dialog?.querySelectorAll(selector) ?? []).map((node) => (node.textContent ?? '').trim());
    return {
      open: Boolean(dialog?.open),
      title: dialog?.querySelector('#so-briefing-title')?.textContent?.trim() ?? null,
      sections: text('[data-so="briefing-section"] .so-briefing-heading'),
      blocks: text('[data-so="briefing-before-you-start"] li'),
      onboarding: Boolean(dialog?.querySelector('[data-so="briefing-onboarding"]')),
      optOut: Boolean(dialog?.querySelector('#so-briefing-optout')),
      startLabel: dialog?.querySelector('#so-briefing-start')?.textContent?.trim() ?? null,
      pending: globalThis.storyOrchestratorRuntime?.getSnapshot?.()?.briefing?.pending ?? null,
    };
  });
}

export async function dismissBriefing(page, { dontShow = false, timeoutMs = 5000 } = {}) {
  const before = await readBriefingModal(page);
  if (!before.open) throw new Error('no briefing is open (dialog#so-briefing)');
  if (dontShow) {
    if (!before.optOut) throw new Error('this briefing offers no "Don\'t show briefings" box');
    await page.locator('#so-briefing-optout').check();
  }
  await page.locator('#so-briefing-start').click();
  await page.waitForFunction(() => !(document.querySelector('dialog#so-briefing') as HTMLDialogElement | null)?.open, null, { timeout: timeoutMs });
  return { before, after: await readBriefingModal(page) };
}
