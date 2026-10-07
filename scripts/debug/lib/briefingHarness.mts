import { evaluateInST } from './evaluate.mts';
import { saveSettingsNow } from './settingsSave.mts';

export type StartDisplayKey = 'briefing' | 'playerSetup' | 'announceTransitions';

export async function readDisplaySetting(page, key: StartDisplayKey): Promise<boolean | null> {
  return evaluateInST(page, (name) => {
    const value = globalThis.storyOrchestratorRuntime?.getGlobalSettings?.()?.display?.[name];
    return typeof value === 'boolean' ? value : null;
  }, key);
}

export const readBriefingSetting = (page): Promise<boolean | null> => readDisplaySetting(page, 'briefing');

async function writeDisplaySetting(page, key: StartDisplayKey, on: boolean) {
  await evaluateInST(page, ({ name, value }) => { globalThis.storyOrchestratorRuntime?.setUiSettings?.({ [name]: value }); return true; }, { name: key, value: on });
  const saved = await saveSettingsNow(page).catch((error) => ({ error: error.message }));
  const verified = await readDisplaySetting(page, key);
  return { saved, verified, ok: verified === on && !('error' in saved) };
}

export async function suppressDisplay(page, key: StartDisplayKey) {
  const before = await readDisplaySetting(page, key);
  if (before !== true) return { changed: false, before };
  return { changed: true, before, ...(await writeDisplaySetting(page, key, false)) };
}

export async function restoreDisplay(page, key: StartDisplayKey, before: boolean | null) {
  if (before === null) return { restored: false, reason: 'no pre-run capture' };
  const now = await readDisplaySetting(page, key);
  if (now === before) return { restored: false, unchanged: true, value: before };
  const written = await writeDisplaySetting(page, key, before);
  return { restored: true, from: now, to: before, ...written, ...(written.ok ? {} : { error: `the ${key} setting did not read back as restored` }) };
}

export const suppressBriefing = (page) => suppressDisplay(page, 'briefing');
export const restoreBriefing = (page, before: boolean | null) => restoreDisplay(page, 'briefing', before);
export const suppressPlayerSetup = (page) => suppressDisplay(page, 'playerSetup');
export const restorePlayerSetup = (page, before: boolean | null) => restoreDisplay(page, 'playerSetup', before);
export const fixtureDrivesTransitionNote = (fixtureText: string): boolean => /announceTransitions/.test(fixtureText);
export const suppressTransitionNote = (page) => suppressDisplay(page, 'announceTransitions');
export const restoreTransitionNote = (page, before: boolean | null) => restoreDisplay(page, 'announceTransitions', before);

export interface BriefingModalState {
  open: boolean;
  title: string | null;
  sections: string[];
  blocks: string[];
  onboarding: boolean;
  optOut: boolean;
  startLabel: string | null;
  pending: boolean | null;
  identity?: boolean;
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
      identity: Boolean(dialog?.querySelector('#so-player-setup')),
    };
  });
}

export const isBlocksOnlyPane = (state: BriefingModalState): boolean =>
  state.open && state.blocks.length > 0 && !state.sections.length && !state.onboarding && !state.identity;

export const fixtureDrivesBriefing = (fixtureText: string): boolean => /"action": ?"(briefing|player-setup)|so-briefing|so-player-setup|playerSetup/.test(fixtureText);

export const isBriefingIntercept = (message: string): boolean => /dialog#so-briefing|id="so-briefing"/.test(message);

export async function dismissBlocksPane(page): Promise<BriefingModalState | null> {
  const state = await readBriefingModal(page);
  if (!isBlocksOnlyPane(state)) return null;
  await dismissBriefing(page);
  return state;
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

export interface PlayerSetupPaneState {
  open: boolean;
  role: string | null;
  current: string | null;
  done: string | null;
  canCreate: boolean;
  choices: string[];
  pending: boolean | null;
  chatLock: string | null;
}

export async function readPlayerSetup(page): Promise<PlayerSetupPaneState> {
  return evaluateInST(page, () => {
    const pane = document.querySelector('#so-player-setup');
    const text = (selector: string) => pane?.querySelector(selector)?.textContent?.trim() ?? null;
    const host = globalThis as unknown as { SillyTavern?: { getContext?: () => { chatMetadata?: Record<string, unknown> } } };
    const lock = host.SillyTavern?.getContext?.()?.chatMetadata?.persona;
    return {
      open: Boolean(pane),
      role: text('[data-so="player-setup-role"]'),
      current: text('[data-so="player-setup-current"]'),
      done: text('[data-so="player-setup-done"]'),
      canCreate: Boolean(pane?.querySelector('[data-so="player-setup-create"]')),
      choices: Array.from(pane?.querySelectorAll('[data-so^="player-setup-"]') ?? []).map((node) => node.getAttribute('data-so') ?? '').filter((id) => /-(keep|pick|create)$/.test(id)),
      pending: globalThis.storyOrchestratorRuntime?.getSnapshot?.()?.playerSetup?.pending ?? null,
      chatLock: typeof lock === 'string' && lock ? lock : null,
    };
  });
}

export const PLAYER_SETUP_CHOICES = ['keep', 'pick', 'create', 'skip'] as const;
export type PlayerSetupChoiceArg = (typeof PLAYER_SETUP_CHOICES)[number];

export async function choosePlayerSetup(page, choice: PlayerSetupChoiceArg, name = '', { timeoutMs = 10000 } = {}) {
  const before = await readPlayerSetup(page);
  if (!before.open) throw new Error('no start-setup pane is open (#so-player-setup)');
  if (choice === 'skip') await page.locator('#so-briefing-start').click();
  if (choice === 'keep') await page.locator('[data-so="player-setup-keep"]').click();
  if (choice === 'pick') {
    if (!name) throw new Error('player-setup-choose pick needs a persona name');
    await page.locator('#so-player-setup-pick').selectOption({ label: name });
    await page.locator('[data-so="player-setup-pick"]').click();
  }
  if (choice === 'create') {
    await page.locator('[data-so="player-setup-create-form"] summary').click();
    if (name) await page.locator('#so-player-setup-name').fill(name);
    await page.locator('[data-so="player-setup-create"]').click();
  }
  await page.waitForFunction(() => globalThis.storyOrchestratorRuntime?.getSnapshot?.()?.playerSetup?.pending === false, null, { timeout: timeoutMs });
  const after = await readPlayerSetup(page);
  return { before, after, locked: Boolean(after.chatLock) };
}
