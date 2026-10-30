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

export async function dismissBriefing(page, { dontShow = false, timeoutMs = 5000, openWithinMs = 0 } = {}) {
  const deadline = Date.now() + openWithinMs;
  let before = await readBriefingModal(page);
  while (!before.open && Date.now() < deadline) {
    await page.waitForTimeout(250);
    before = await readBriefingModal(page);
  }
  if (!before.open) {
    const why = openWithinMs ? await page.evaluate(() => {
      const snap = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.();
      return JSON.stringify({ boundary: snap?.boundary ?? null, briefing: snap?.briefing ? { enabled: snap.briefing.enabled ?? null, view: Boolean(snap.briefing.view), pending: snap.briefing.pending ?? null, draft: snap.briefing.draft?.status ?? null } : null, playerSetup: snap?.playerSetup ? { pending: snap.playerSetup.pending ?? null, needsPane: snap.playerSetup.needsPane ?? null, choice: snap.playerSetup.record?.choice ?? null, locked: snap.playerSetup.record?.locked ?? null } : null, chatLength: (globalThis as any).SillyTavern?.getContext?.().chat?.length ?? null, onEnterPosts: (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.().onEnterPosts?.length ?? null });
    }).catch(() => 'state unreadable') : '';
    throw new Error(`no briefing is open (dialog#so-briefing)${openWithinMs ? ` after ${openWithinMs} ms; state ${why}` : ''}`);
  }
  if (dontShow) {
    if (!before.optOut) throw new Error('this briefing offers no "Don\'t show briefings" box');
    await page.locator('#so-briefing-optout').check();
  }
  await page.locator('#so-briefing-start').click();
  await page.waitForFunction(() => !(document.querySelector('dialog#so-briefing') as HTMLDialogElement | null)?.open, null, { timeout: timeoutMs });
  return { before, after: await readBriefingModal(page) };
}

export async function closeStartDialog(page, when: string, { settleMs = 3000, timeoutMs = 5000 } = {}) {
  const deadline = Date.now() + settleMs;
  let state = await readBriefingModal(page);
  while (!state.open && Date.now() < deadline) {
    await page.waitForTimeout(250);
    state = await readBriefingModal(page);
  }
  if (!state.open) return { open: false, when };
  await page.locator('#so-briefing-start').click();
  await page.waitForFunction(() => !(document.querySelector('dialog#so-briefing') as HTMLDialogElement | null)?.open, null, { timeout: timeoutMs });
  console.log(`setup closed the story-start dialog ${when} (${state.identity ? 'identity step' : state.blocks.length ? 'before you start' : 'briefing'}: ${state.title ?? ''})`);
  return { open: true, when, closed: true, identity: Boolean(state.identity), blocks: state.blocks.length, title: state.title };
}

export interface PlayerSetupPaneState {
  open: boolean;
  dialogOpen: boolean;
  role: string | null;
  current: string | null;
  done: string | null;
  canCreate: boolean;
  choices: string[];
  pending: boolean | null;
  needsPane: boolean | null;
  enabled: boolean | null;
  storyId: string | null;
  choice: string | null;
  locked: boolean | null;
  chatLock: string | null;
}

export async function readPlayerSetup(page): Promise<PlayerSetupPaneState> {
  return evaluateInST(page, () => {
    const dialog = document.querySelector('dialog#so-briefing') as HTMLDialogElement | null;
    const pane = dialog?.open ? dialog.querySelector('#so-player-setup') : null;
    const text = (selector: string) => pane?.querySelector(selector)?.textContent?.trim() ?? null;
    const modes = (root: Element | null) => {
      const radios = Array.from(root?.querySelectorAll('[data-so="player-setup-mode"] [role="radio"]') ?? []).map((node) => `player-setup-${node.getAttribute('data-value')}`);
      if (radios.length) return radios;
      return ['keep', 'pick-row', 'create-form'].filter((id) => root?.querySelector(`[data-so="player-setup-${id}"]`)).map((id) => `player-setup-${id.split('-')[0]}`);
    };
    const host = globalThis as unknown as { SillyTavern?: { getContext?: () => { chatMetadata?: Record<string, unknown> } } };
    const lock = host.SillyTavern?.getContext?.()?.chatMetadata?.persona;
    const runtime = globalThis.storyOrchestratorRuntime;
    const setup = runtime?.getSnapshot?.()?.playerSetup ?? null;
    const enabled = runtime?.getGlobalSettings?.()?.display?.playerSetup;
    return {
      open: Boolean(pane),
      dialogOpen: Boolean(dialog?.open),
      role: text('[data-so="player-setup-role"]'),
      current: typeof setup?.current?.name === 'string' ? setup.current.name : null,
      done: text('[data-so="player-setup-done"]'),
      canCreate: Boolean(pane?.querySelector('[data-so="player-setup-mode"] [data-value="create"], [data-so="player-setup-create-form"]')),
      choices: modes(pane),
      pending: typeof setup?.pending === 'boolean' ? setup.pending : null,
      needsPane: typeof setup?.needsPane === 'boolean' ? setup.needsPane : null,
      enabled: typeof enabled === 'boolean' ? enabled : null,
      storyId: typeof setup?.storyId === 'string' ? setup.storyId : null,
      choice: typeof setup?.record?.choice === 'string' ? setup.record.choice : null,
      locked: typeof setup?.record?.locked === 'boolean' ? setup.record.locked : null,
      chatLock: typeof lock === 'string' && lock ? lock : null,
    };
  });
}

const SETUP_OFF = 'display.playerSetup is off on this install (session lanes: test/sessions/baseline-settings.json), so a story start settles the identity step without asking; turn on Settings > Display "Ask who you are when a story starts" (#so-player-setup-enabled) and start a new chat';

export const setupPaneMissing = (state: PlayerSetupPaneState): string => {
  if (state.storyId === null && state.pending === null) return 'no story has a start setup in this chat';
  if (state.pending === false) return `the identity step is already settled (choice ${state.choice ?? 'none'}, ${state.locked === false ? 'unlocked' : 'locked'})${state.enabled === false ? `; ${SETUP_OFF}` : ''}`;
  if (state.enabled === false) return SETUP_OFF;
  if (state.needsPane === false) return 'this story has no player profile or fixed name, so the start pane asks nothing';
  if (!state.dialogOpen) return 'the start dialog (dialog#so-briefing) is not open';
  return 'the start dialog is open without the identity step';
};

export const PLAYER_SETUP_CHOICES = ['keep', 'pick', 'create', 'skip'] as const;
export type PlayerSetupChoiceArg = (typeof PLAYER_SETUP_CHOICES)[number];

export async function waitForPlayerSetup(page, openWithinMs: number): Promise<PlayerSetupPaneState> {
  const deadline = Date.now() + openWithinMs;
  let state = await readPlayerSetup(page);
  while (!state.open && state.pending !== false && Date.now() < deadline) {
    await page.waitForTimeout(250);
    state = await readPlayerSetup(page);
  }
  return state;
}

export async function choosePlayerSetup(page, choice: PlayerSetupChoiceArg, name = '', { timeoutMs = 10000, openWithinMs = 8000 } = {}) {
  const before = await waitForPlayerSetup(page, openWithinMs);
  if (!before.open) throw new Error(`no start-setup pane is open (#so-player-setup): ${setupPaneMissing(before)}`);
  if (choice === 'pick' && !name) throw new Error('player-setup-choose pick needs a persona name');
  const scope = 'dialog#so-briefing[open]';
  const mode = async (value: string) => {
    const radio = page.locator(`${scope} [data-so="player-setup-mode"] [data-value="${value}"]`);
    if (await radio.count()) await radio.click();
  };
  if (choice === 'skip') await page.locator(`${scope} [data-so="briefing-close"]`).click();
  if (choice === 'keep') await mode('keep');
  if (choice === 'pick') {
    await mode('pick');
    await page.locator(`${scope} #so-player-setup-pick`).selectOption({ label: name });
  }
  if (choice === 'create') {
    await mode('create');
    if (name) await page.locator(`${scope} #so-player-setup-name`).fill(name);
  }
  if (choice !== 'skip') await page.locator(`${scope} #so-briefing-start`).click();
  await page.waitForFunction(() => globalThis.storyOrchestratorRuntime?.getSnapshot?.()?.playerSetup?.pending === false, null, { timeout: timeoutMs });
  const after = await readPlayerSetup(page);
  return { before, after, locked: Boolean(after.chatLock) };
}
