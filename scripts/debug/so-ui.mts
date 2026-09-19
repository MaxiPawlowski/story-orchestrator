import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { closeUnpinnedDrawers } from './st-navigation.mts';

// ST nests our panel two drawers deep: #extensions-settings-button (nav drawer) then our own
// .inline-drawer. Both can be attached-but-hidden, so open by visibility, never by presence.
export async function openExtensionSettings(page) {
  const root = page.locator('#story-orchestrator-settings');
  if (!(await root.count())) {
    throw new Error(
      'Story Orchestrator settings panel (#story-orchestrator-settings) not found. ' +
      'Extension may not be loaded.',
    );
  }

  const navToggle = page.locator('#extensions-settings-button .drawer-toggle');
  const navContent = page.locator('#rm_extensions_block');
  const navWasOpen = await navContent.isVisible().catch(() => false);
  if (!navWasOpen && (await navToggle.count())) {
    await navToggle.click();
    await navContent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  }

  const content = root.locator('.inline-drawer-content');
  const alreadyOpen = await content.isVisible().catch(() => false);
  if (!alreadyOpen) {
    const toggle = root.locator('.inline-drawer-toggle');
    if (!(await toggle.count())) throw new Error('Settings panel toggle (.inline-drawer-toggle) not found.');
    await toggle.click();
    await content.waitFor({ state: 'visible', timeout: 5000 });
  }
  await root.scrollIntoViewIfNeeded().catch(() => undefined);
  return { alreadyOpen, navWasOpen };
}

export async function getSettingsPanelState(page) {
  const root = page.locator('#story-orchestrator-settings');
  if (!(await root.count())) {
    return { found: false, reason: 'Settings panel not mounted' };
  }

  const expanded = (await root.locator('.inline-drawer-content').count()) > 0;

  const controls = await evaluateInST(page, () => {
    const storySelect = document.getElementById('story-library-select');
    const freqInput = document.getElementById('story-arbiter-frequency');
    const promptArea = document.getElementById('story-arbiter-prompt');

    let selectedStory = null;
    if (storySelect) {
      const sel = storySelect as HTMLSelectElement;
      const opt = sel.options[sel.selectedIndex];
      selectedStory = {
        value: sel.value,
        label: opt?.textContent?.trim() ?? '',
      };
    }

    const freq = freqInput ? (freqInput as HTMLInputElement).value : null;
    const promptText = promptArea ? (promptArea as HTMLTextAreaElement).value : null;
    const arbiterPromptPreview = promptText
      ? promptText.slice(0, 100) + (promptText.length > 100 ? '...' : '')
      : null;

    return { selectedStory, arbiterFrequency: freq, arbiterPromptPreview };
  });

  return {
    found: true,
    expanded,
    selectedStory: controls?.selectedStory ?? null,
    arbiterFrequency: controls?.arbiterFrequency ?? null,
    arbiterPromptPreview: controls?.arbiterPromptPreview ?? null,
  };
}

// Configure the memory LLM the way an end user does: through the settings panel controls.
// Journey/scenario files never carry a profile id. A name (step label, else ST_DEBUG_PROFILE) picks
// by prefix and fails when nothing matches; without one the profile the user already chose stays,
// because the setting is install-wide, and only an install with none selected falls back to the
// first profile. "Already chose" is read from the stored setting, not the dropdown: a write that
// skipped the runtime leaves the panel showing a stale choice. The profile is set before extraction is enabled: enabling while a dead profile is
// still selected fails the first read, and the scheduler then pauses extraction install-wide.
export async function selectMemoryProfile(page, wanted = process.env.ST_DEBUG_PROFILE ?? '') {
  const { navWasOpen } = await openExtensionSettings(page);
  const enable = page.locator('#so-extraction-enabled');
  if (!(await enable.count())) throw new Error('Extraction toggle (#so-extraction-enabled) not found in the settings panel.');
  const select = page.locator('#so-extraction-profile');
  if (!(await select.count())) throw new Error('Memory profile select (#so-extraction-profile) not found.');
  const labels = (await select.locator('option').allTextContents()).map((label) => label.trim()).filter((label) => label && label !== 'No profile selected');
  if (!labels.length) throw new Error('No connection profiles offered by the settings panel.');
  const search = String(wanted).trim().toLowerCase();
  const current = await evaluateInST(page, () => {
    const stored = SillyTavern.getContext().extensionSettings?.['story-orchestrator']?.settings?.extraction?.profileId ?? '';
    const option = Array.from(document.querySelectorAll('#so-extraction-profile option')).find((entry) => stored && (entry as HTMLOptionElement).value === stored);
    return (option?.textContent ?? '').trim();
  });
  const kept = !search && labels.includes(current);
  const label = search ? labels.find((option) => option.toLowerCase().startsWith(search)) : kept ? current : labels[0];
  if (!label) throw new Error(`No memory profile named "${wanted}" in the settings panel (offered: ${labels.join(', ')}).`);
  if (label !== current) await select.selectOption({ label });
  if (!(await enable.isChecked())) await enable.check();
  const result = { profile: label, kept, previous: current || null, available: labels, enabled: await enable.isChecked() };
  // Leave the nav as we found it: an open Extensions drawer hides #options_button and #send_but,
  // so anything that plays the chat afterwards would time out.
  if (!navWasOpen) await closeUnpinnedDrawers(page).catch(() => undefined);
  return result;
}

export async function openCheckpointStudio(page) {
  const root = page.locator('#story-orchestrator-settings');
  if (!(await root.count())) {
    throw new Error('Settings panel not found. Cannot open Studio.');
  }

  const modal = page.locator('#so-studio-modal');
  if (await modal.isVisible().catch(() => false)) {
    return { alreadyOpen: true };
  }

  // The button can be attached but hidden behind two collapsed drawers — open by visibility.
  await openExtensionSettings(page);
  const studioBtn = root.locator('#so-open-studio');
  if (!(await studioBtn.count())) {
    throw new Error('"Open Studio" button (#so-open-studio) not found.');
  }
  await studioBtn.scrollIntoViewIfNeeded().catch(() => undefined);
  await studioBtn.waitFor({ state: 'visible', timeout: 10000 });
  await studioBtn.click();
  // An unsaved draft for this story asks whether to resume it: keep it, so a draft prepared by the
  // caller survives the open.
  const resumed = await answerStudioPopup(page, '.popup-button-ok');
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  return { alreadyOpen: false, ...(resumed.answered ? { resumedDraft: true } : {}) };
}

// The Studio guards a dirty draft with an ST confirm popup; an unanswered popup then blocks every
// other control on the page (live finding, plan 05 J2 run).
async function answerStudioPopup(page, button = '.popup-button-ok') {
  const popup = page.locator('dialog.popup[open]');
  if (!(await popup.count())) return { answered: false };
  const control = popup.last().locator(button);
  if (!(await control.count())) return { answered: false };
  await control.first().click().catch(() => undefined);
  await popup.last().waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  return { answered: true };
}

export async function closeCheckpointStudio(page) {
  const result = await evaluateInST(page, () => {
    const modal = document.getElementById('so-studio-modal') as HTMLDialogElement | null;
    if (!modal) return { closed: false, reason: 'studio not open' };
    const close = modal.querySelector('[aria-label="Close studio"], [aria-label="Close"], [title="Close"]') as HTMLElement | null;
    if (close) close.click();
    else modal.close();
    return { closed: true };
  });
  // A dirty draft asks "Discard unsaved Studio changes?" first — answer it, then wait for the node
  // to go so a following open-studio actually opens instead of finding a stale element.
  const discarded = await answerStudioPopup(page, '.popup-button-ok');
  await page.locator('#so-studio-modal').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  return { ...result, ...(discarded.answered ? { discardedDraft: true } : {}) };
}

// Save the Studio draft the way an author does — the button, not the store. A save from the chat
// that is playing this story may pop the plan-05 invalidation choice; `choice` answers it.
export async function saveStudioDraft(page, choice = null) {
  const modal = page.locator('#so-studio-modal');
  if (!(await modal.count())) throw new Error('Studio modal is not open.');
  const save = modal.locator('button', { hasText: /^Save$/ });
  if (!(await save.count())) throw new Error('Studio Save button not found.');
  await save.first().click();
  if (choice) {
    const popup = page.locator('dialog[open]:not(#so-studio-modal)');
    await popup.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    const button = choice === 'keep' ? popup.locator('.popup-button-ok')
      : choice === 'cancel' ? popup.locator('.popup-button-cancel')
        : popup.locator('.popup-button-custom');
    await button.first().click().catch(() => undefined);
    // Restart asks for its own confirmation on top of the update choice.
    if (choice === 'restart') {
      const confirm = page.locator('dialog[open]:not(#so-studio-modal) .popup-button-ok');
      await confirm.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      await confirm.first().click().catch(() => undefined);
    }
  }
  await page.waitForTimeout(500);
  return evaluateInST(page, () => {
    const container = document.getElementById('so-studio-modal');
    const feedback = container?.querySelector('.st-alert-success, .st-alert-error')?.textContent?.trim() ?? null;
    const snapshot = globalThis.storyOrchestratorRuntime?.getSnapshot?.() ?? null;
    return {
      feedback,
      draftId: globalThis.storyOrchestratorStudioDraft?.getState?.().draft?.id ?? null,
      storyIdentity: snapshot?.storyIdentity ?? null,
      lastStoryUpdate: globalThis.storyOrchestratorRuntime?.getLastStoryUpdate?.() ?? null,
    };
  });
}

// The wizard, driven the way an author drives it: the Studio's Wizard tab, the question cards and
// the per-op "Create it" buttons. Never the store — the review step is the feature.
export async function openWizard(page, { newStory = false } = {}) {
  if (newStory) {
    await openExtensionSettings(page);
    const button = page.locator('#so-new-story-wizard');
    if (!(await button.count())) throw new Error('"New story (wizard)" button (#so-new-story-wizard) not found.');
    await button.click();
    await answerStudioPopup(page, '.popup-button-ok');
    await page.locator('#so-studio-modal').waitFor({ state: 'visible', timeout: 10000 });
  } else {
    await openCheckpointStudio(page);
    await switchStudioTab(page, 'Wizard');
  }
  await page.locator('#so-wizard').waitFor({ state: 'visible', timeout: 10000 });
  return getWizardState(page);
}

export async function getWizardState(page) {
  return evaluateInST(page, () => {
    const root = document.getElementById('so-wizard');
    if (!root) return { open: false };
    const questions = Array.from(root.querySelectorAll('#so-wizard-questions label[for^="so-wizard-answer-"]')).map((label) => (label as HTMLElement).innerText.trim());
    const provisioning = Array.from(root.querySelectorAll('[data-so="provisioning-card"]')).map((card) => ({
      label: card.getAttribute('aria-label') ?? '',
      applied: (card.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null)?.textContent?.trim() === 'Created',
      blocked: Boolean((card.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null)?.disabled),
      error: card.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      status: card.querySelector('[role="status"]')?.textContent?.trim() ?? null,
    }));
    const stage = Array.from(root.querySelectorAll('[aria-pressed="true"]')).map((button) => button.textContent?.trim())[0] ?? null;
    return {
      open: true,
      stage,
      questions,
      provisioning,
      created: document.getElementById('so-wizard-created')?.textContent?.trim() ?? null,
      turns: root.querySelectorAll('[aria-label="Copilot conversation"] li').length,
      error: root.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
    };
  });
}

// React commits "Working…" a tick after the click, so waiting only for it to *clear* can return
// before the model has even been called. Wait for it to appear first (tolerating a call that
// resolves instantly), then for it to go.
async function waitForWizardIdle(page, timeoutMs) {
  await page.waitForFunction(() => document.getElementById('so-wizard-run')?.textContent?.trim() === 'Working…', null, { timeout: 5000 }).catch(() => undefined);
  await page.waitForFunction(() => document.getElementById('so-wizard-run')?.textContent?.trim() !== 'Working…', null, { timeout: timeoutMs });
}

export async function runWizardStage(page, { stage = null, message = '', timeoutMs = 120000 } = {}) {
  if (stage) await page.locator('#so-wizard button', { hasText: stage }).first().click();
  if (message) await page.locator('#so-wizard-message').fill(message);
  await page.locator('#so-wizard-run').click();
  await waitForWizardIdle(page, timeoutMs);
  return getWizardState(page);
}

// `answers` maps question index -> text; an empty value is "you decide". Passing none clicks the
// explicit "You decide" button, which is the path that must always proceed.
export async function answerWizardQuestions(page, answers = null, { timeoutMs = 120000 } = {}) {
  const block = page.locator('#so-wizard-questions');
  if (!(await block.count())) throw new Error('The wizard is not asking anything (#so-wizard-questions absent).');
  if (answers) {
    const inputs = block.locator('input[id^="so-wizard-answer-"]');
    const count = await inputs.count();
    for (let index = 0; index < count; index += 1) {
      const text = answers[index] ?? answers[String(index)];
      if (text) await inputs.nth(index).fill(String(text));
    }
    await page.locator('#so-wizard-answer').click();
  } else {
    await page.locator('#so-wizard-you-decide').click();
  }
  await waitForWizardIdle(page, timeoutMs);
  return getWizardState(page);
}

// `index: "all"` walks every still-pending card in order — the honest way to prove all three host
// seams really wrote to SillyTavern, while a single index proves the per-op rule.
export async function applyWizardProvisioning(page, index: number | 'all' = 0, { timeoutMs = 60000 } = {}) {
  if (index === 'all') {
    const total = await page.locator('#so-wizard [data-so="provisioning-card"]').count();
    if (!total) throw new Error('No provisioning cards on screen.');
    let state = await getWizardState(page);
    for (let position = 0; position < total; position += 1) {
      if (state.provisioning?.[position]?.applied) continue;
      state = await applyWizardProvisioning(page, position, { timeoutMs });
    }
    return state;
  }
  const cards = page.locator('#so-wizard [data-so="provisioning-card"]');
  if (!(await cards.count())) throw new Error('No provisioning cards on screen.');
  const button = cards.nth(index).locator('[data-so="provisioning-apply"]');
  if (await button.isDisabled()) {
    const state = await getWizardState(page);
    throw new Error(`Provisioning step ${index} is blocked: ${state.provisioning?.[index]?.error ?? 'unknown reason'}`);
  }
  await button.click();
  await page.waitForFunction((target) => {
    const card = document.querySelectorAll('#so-wizard [data-so="provisioning-card"]')[target];
    const apply = card?.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null;
    return apply?.textContent?.trim() === 'Creating…';
  }, index, { timeout: 5000 }).catch(() => undefined);
  await page.waitForFunction((target) => {
    const card = document.querySelectorAll('#so-wizard [data-so="provisioning-card"]')[target];
    const apply = card?.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null;
    return apply?.textContent?.trim() !== 'Creating…';
  }, index, { timeout: timeoutMs });
  const state = await getWizardState(page);
  const card = state.provisioning?.[index];
  // A provisioning step that came back with an error is a failed step, not a completed one: the
  // verb says so rather than leaving the caller to notice the wording on a button.
  if (card && !card.applied) throw new Error(`Provisioning step ${index} did not apply: ${card.status ?? card.error ?? 'no result reported'}`);
  return state;
}

async function showStagecraftRing(page) {
  await openStoryDrawer(page);
  try {
    await switchDrawerTab(page, 'Scheduler');
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function readStagecraftCounts(page) {
  return evaluateInST(page, () => ({
    drawerOpen: document.getElementById('drawer-manager')?.classList.contains('openDrawer') ?? false,
    activeTab: document.querySelector('#drawer-manager [role="tablist"] button[aria-selected="true"]')?.textContent?.trim() ?? null,
    ring: Boolean(document.getElementById('so-stagecraft')),
    cards: document.querySelectorAll('#so-stagecraft [data-so="curator-op"]').length,
    runtimeOps: (globalThis.storyOrchestratorRuntime?.getStagecraftState?.().proposals ?? []).reduce((sum, record) => sum + (record.ops?.length ?? 0), 0),
  }));
}

// A card renders a beat after the proposal lands, and anything that re-lays the page out (another
// tool attaching, a resize) can close the drawer or drop the tab under us: re-open and re-select
// until the cards are there, then say exactly what was on screen if they never came.
async function waitForCuratorCards(page, minOps, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let tabError = null;
  let counts = null;
  while (true) {
    tabError = await showStagecraftRing(page);
    counts = await readStagecraftCounts(page);
    if (counts.cards >= minOps) return;
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(500);
  }
  throw new Error(`expected >= ${minOps} curator review card(s) on screen within ${timeoutMs} ms: ${JSON.stringify({ ...counts, tabError })}`);
}

// The curator review ring, driven through the drawer the way an author reviews it (author view
// only — the panel is author-side by the spoiler checklist). `minOps` waits for that many op cards.
export async function getStagecraftState(page, { minOps = 0, timeoutMs = 15000 } = {}) {
  if (minOps > 0) await waitForCuratorCards(page, minOps, timeoutMs);
  const tabError = await showStagecraftRing(page);
  const state = await evaluateInST(page, () => {
    const root = document.getElementById('so-stagecraft');
    if (!root) return { visible: false, reason: 'author view is off, or the Scheduler tab is not open' };
    return {
      visible: true,
      header: root.querySelector('.opacity-70')?.textContent?.trim() ?? null,
      proposals: Array.from(root.querySelectorAll('[data-so="curator-proposal"]')).map((card) => ({
        summary: card.querySelector('.opacity-100')?.textContent?.trim() ?? '',
        ops: Array.from(card.querySelectorAll('[data-so="curator-op"]')).map((op) => (op as HTMLElement).innerText.split('\n')[0]),
        pending: card.querySelectorAll('[data-so="curator-accept"]').length,
      })),
      snapshot: globalThis.storyOrchestratorRuntime?.getStagecraftState?.() ?? null,
      scope: globalThis.storyOrchestratorRuntime?.getSnapshot?.().stagecraftScope ?? [],
    };
  });
  return tabError ? { ...state, tabError } : state;
}

// The card an author would reach for first on the newest proposal still waiting for review: its
// first pending change that carries editable text, else its first pending change of any kind.
// Index is ring-wide.
async function pickPendingCuratorCard(page) {
  return evaluateInST(page, () => {
    const ring = document.getElementById('so-stagecraft');
    const all = Array.from(ring?.querySelectorAll('[data-so="curator-op"]') ?? []);
    const waiting = (card: Element) => Boolean(card.querySelector('[data-so="curator-accept"]'));
    const newest = Array.from(ring?.querySelectorAll('[data-so="curator-proposal"]') ?? []).find((proposal) => all.some((card) => proposal.contains(card) && waiting(card)));
    const pending = all.filter((card) => newest?.contains(card) && waiting(card));
    const chosen = pending.find((card) => card.querySelector('[data-so="curator-text"]')) ?? pending[0];
    return chosen ? all.indexOf(chosen) : -1;
  });
}

// index: which op card in the ring (newest proposal first). Editing the text first is the author's
// real path, so `text` fills the textarea before accepting. pick 'text-first' lets the model decide
// the op kind: the first pending text change gets `text`, and a proposal with only on/off switches
// has its first switch decided as proposed.
export async function decideCuratorOp(page, decision: 'accept' | 'reject', { index = 0, text = null, pick = null, timeoutMs = 15000 } = {}) {
  await getStagecraftState(page, { minOps: 1, timeoutMs });
  const cards = page.locator('#so-stagecraft [data-so="curator-op"]');
  const target = pick === 'text-first' ? await pickPendingCuratorCard(page) : index;
  if (target < 0) throw new Error('The newest curator proposal has no change waiting for review.');
  if (target >= (await cards.count())) throw new Error(`No curator change ${target} on screen to review.`);
  const card = cards.nth(target);
  const field = card.locator('[data-so="curator-text"]');
  const editable = (await field.count()) > 0;
  if (text !== null && !editable && pick !== 'text-first') throw new Error(`Curator change ${target} has no editable text.`);
  if (text !== null && editable) await field.fill(String(text));
  const label = ((await card.innerText()) ?? '').split('\n')[0].trim();
  await card.locator(decision === 'accept' ? '[data-so="curator-accept"]' : '[data-so="curator-reject"]').click();
  await page.waitForFunction((at) => {
    const node = document.querySelectorAll('#so-stagecraft [data-so="curator-op"]')[at];
    return Boolean(node) && !node.querySelector('[data-so="curator-accept"]');
  }, target, { timeout: 5000 });
  return { decided: { index: target, decision, label, edited: text !== null && editable }, ...(await getStagecraftState(page)) };
}

export async function getStudioState(page) {
  const modal = page.locator('#so-studio-modal');
  if (!(await modal.count())) {
    return { open: false };
  }
  return await evaluateInST(page, () => {
    const container = document.getElementById('so-studio-modal');
    if (!container) return { open: false };
    const title = (container.querySelector('input[aria-label="Story title"]') as HTMLInputElement | null)?.value ?? '';
    const activeTab = container.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '';
    const footer = container.querySelector('.st-panel-header:last-child')?.textContent ?? '';
    const errorsBadge = Array.from(container.querySelectorAll('span')).find((s) => /\d+ errors/.test(s.textContent ?? ''))?.textContent?.trim() ?? null;
    const issuesBadge = Array.from(container.querySelectorAll('span')).find((s) => /\d+ issues/.test(s.textContent ?? ''))?.textContent?.trim() ?? null;
    return { open: true, title, activeTab, footer: footer.trim().slice(0, 120), errorsBadge, issuesBadge };
  });
}

export async function switchStudioTab(page, label) {
  const modal = page.locator('#so-studio-modal');
  if (!(await modal.count())) throw new Error('Studio modal is not open.');
  const tab = modal.locator('[role="tab"]', { hasText: label });
  if (!(await tab.count())) throw new Error(`Studio tab "${label}" not found.`);
  await tab.first().click();
  return { tab: label };
}

export async function switchDrawerTab(page, label) {
  const drawer = page.locator('#drawer-manager');
  if (!(await drawer.count())) throw new Error('Drawer (#drawer-manager) is not mounted.');
  const tab = drawer.locator('[role="tablist"] button', { hasText: label });
  if (!(await tab.count())) throw new Error(`Drawer tab "${label}" not found.`);
  await tab.first().click();
  const selected = await tab.first().getAttribute('aria-selected');
  return { tab: label, selected: selected === 'true' };
}

export async function getDrawerState(page) {
  const drawer = page.locator('#drawer-manager');
  if (!(await drawer.count())) {
    return { found: false, reason: 'Drawer (#drawer-manager) not mounted' };
  }

  const visible = await evaluateInST(page, () => {
    const el = document.getElementById('drawer-manager');
    return el?.classList.contains('openDrawer') ?? false;
  });

  const minimized = (await drawer.locator('[aria-label="Restore"]').count()) > 0;

  const username = await evaluateInST(page, () => {
    const container = document.getElementById('drawer-manager');
    if (!container) return null;
    for (const span of container.querySelectorAll('span')) {
      const txt = span.textContent?.trim() ?? '';
      if (txt.startsWith('Hi ')) return txt.replace(/^Hi\s+/, '');
    }
    return null;
  });

  const requirements = await evaluateInST(page, () => {
    const container = document.getElementById('drawer-manager');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.status-indicator')).map((dot) => {
      const classes = Array.from(dot.classList);
      const status = classes.find((c) => c.startsWith('status-') && c !== 'status-indicator');
      const row = dot.closest('.flex.items-center.gap-2');
      const textEl = row
        ? Array.from(row.children).find(
            (n) => !n.classList.contains('status-indicator') && !n.classList.contains('requirements-reload'),
          )
        : null;
      const text = textEl?.textContent?.trim() ?? '';
      const detailEl = dot.closest('.flex.flex-col.gap-1')?.querySelector('.text-xs.opacity-80');
      const detail = detailEl?.textContent?.trim() ?? null;
      return { status: status?.replace('status-', '') ?? 'unknown', text, detail };
    });
  });

  const checkpoints = await evaluateInST(page, () => {
    const container = document.getElementById('drawer-manager');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.st-checkpoint-row')).map((row) => {
      const classes = Array.from(row.classList);
      let status = 'pending';
      if (classes.includes('status-current')) status = 'current';
      else if (classes.includes('status-complete')) status = 'complete';
      else if (classes.includes('status-failed')) status = 'failed';
      const nameEl = row.querySelector('.font-semibold') ?? row.querySelector('.font-medium');
      const objEl = row.querySelector('.text-sm.opacity-80');
      return {
        name: nameEl?.textContent?.trim() ?? '',
        objective: objEl?.textContent?.trim() ?? '',
        status,
      };
    });
  });

  const evaluationSummary = await evaluateInST(page, () => {
    const container = document.getElementById('drawer-manager');
    if (!container) return null;
    const wrapper = container.querySelector('.checkpoints-wrapper');
    if (!wrapper) return null;
    const allText = wrapper.textContent ?? '';
    const idx = allText.indexOf('Last check queued:');
    if (idx === -1) return null;
    return allText.slice(idx, idx + 200).trim();
  });

  const isExpanding = await evaluateInST(page, () => {
    const container = document.getElementById('drawer-manager');
    if (!container) return false;
    return Array.from(container.querySelectorAll('.st-panel'))
      .some((panel) => (panel.textContent ?? '').includes('Generating next beat'));
  });

  return { found: true, visible, minimized, username, requirements, checkpoints, evaluationSummary, isExpanding };
}

// The player-surface signal (plan 04): what the pipeline says it is doing, in the snapshot and on
// screen. Use it to tell a stalled story from a slow one without reading the scheduler.
export async function getPipelineState(page) {
  return evaluateInST(page, () => {
    const text = (id: string) => document.getElementById(id)?.textContent?.trim() ?? null;
    return {
      snapshot: globalThis.storyOrchestratorRuntime?.getSnapshot?.().pipeline ?? null,
      statusLine: text('so-pipeline-status'),
      stallSignal: text('so-stall-signal'),
      hudChip: text('so-hud-pipeline'),
      setupButton: Boolean(document.getElementById('so-open-story-settings')),
    };
  });
}

// The spoiler checklist as an assertion (test-plan.md §Spoiler checklist). Player mode only: it
// walks every tab the player can reach and fails on anything the checklist forbids.
const PLAYER_FORBIDDEN = [
  'Epistemic map', 'State ledger', 'hiding from', 'blackboard', 'Blackboard',
  'Steering:', 'Convergence', 'Unmet gates', 'Driver', 'Advance to', 'Nudge',
  'boundary ', 'Boundary ', 'Audits recorded', 'superseded', 'Last audit',
  'World Info curator',
];

// D1 as a selector sweep, not a reading of the copy (plan 08 success criteria): no steering control
// and no author-only panel may be *reachable* on a player-visible surface. Text needles catch a
// label; these catch the control itself, including one rendered with its label changed.
const PLAYER_FORBIDDEN_SELECTORS = [
  '#so-edit-story', '#so-update-story', '#so-fix-with-wizard', '#so-stagecraft',
  '[data-so="curator-proposal"]', '[data-so="curator-op"]', '[data-so="curator-accept"]', '[data-so="curator-reject"]',
  '[aria-label="In-play driver"]', '[aria-label="Advance target"]', '[aria-label="Nudge text"]',
  '[aria-label="Driver suggestions"]', '[aria-label="Driver report"]', '[aria-label="Active nudge"]',
  '[aria-label="Driver unavailable"]', '[aria-label="Talk decisions"]',
  '[data-so="memory-not-stored"]', '[data-so="memory-store-anyway"]',
];

// Surfaces a player can reach without turning anything on: the drawer (every tab it offers), the HUD
// strip above the composer, and the settings panel — which is `both`, so it may carry display
// toggles and Restart, but never a steering control.
const PLAYER_SURFACES = ['#drawer-manager', '#so-hud', '#story-orchestrator-settings'];

export async function assertPlayerClean(page) {
  await openStoryDrawer(page);
  const authorView = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime?.getSnapshot?.().ui?.authorView ?? null);
  if (authorView !== false) throw new Error(`assert-player-clean requires player mode (authorView=${authorView}). Turn Author view off first.`);
  const tabs = await evaluateInST(page, () => Array.from(document.querySelectorAll('#drawer-manager [role="tablist"] button')).map((button) => button.textContent?.trim() ?? ''));
  const findings = [];
  for (const tab of tabs) {
    await switchDrawerTab(page, tab);
    const text = await evaluateInST(page, () => (document.getElementById('drawer-manager') as HTMLElement | null)?.innerText ?? '');
    for (const needle of PLAYER_FORBIDDEN) {
      if ((text ?? '').includes(needle)) findings.push({ tab, needle });
    }
  }
  const authorOnlyTabs = tabs.filter((tab) => ['Blackboard', 'Scheduler', 'Payload'].includes(tab));
  if (authorOnlyTabs.length) findings.push({ tab: authorOnlyTabs.join(', '), needle: 'author-only tab offered in player mode' });
  const sweep = [];
  for (const tab of tabs) {
    await switchDrawerTab(page, tab);
    const hits = await evaluateInST(page, ({ surfaces, selectors }) => {
      const found = [];
      for (const surface of surfaces) {
        const root = document.querySelector(surface);
        if (!root) continue;
        for (const selector of selectors) {
          for (const node of Array.from(root.querySelectorAll(selector))) {
            const element = node as HTMLElement;
            found.push({ surface, selector, visible: element.offsetParent !== null, text: (element.innerText ?? '').slice(0, 60) });
          }
        }
      }
      return found;
    }, { surfaces: PLAYER_SURFACES, selectors: PLAYER_FORBIDDEN_SELECTORS });
    for (const hit of hits ?? []) {
      findings.push({ tab, needle: `${hit.selector} reachable in ${hit.surface}` });
      sweep.push({ tab, ...hit });
    }
  }
  // Leave the drawer where a player would: on the narrative view, not on the last tab we walked.
  if (tabs.includes('Overview')) await switchDrawerTab(page, 'Overview');
  return { ok: findings.length === 0, tabs, surfaces: PLAYER_SURFACES, selectorsChecked: PLAYER_FORBIDDEN_SELECTORS.length, findings, sweep };
}

export async function takeAnnotatedScreenshot(page, label = 'ui-state') {
  const drawerVisible = (await page.locator('#drawer-manager').count()) > 0 &&
    await evaluateInST(page, () =>
      document.getElementById('drawer-manager')?.classList.contains('openDrawer') ?? false
    );

  const path = await writeScreenshot(page, label);
  return { path, drawerVisible };
}

export async function openStoryDrawer(page) {
  const toggle = page.locator('#so-drawer .drawer-toggle');
  if (!(await toggle.count())) throw new Error('Story drawer toggle (#so-drawer .drawer-toggle) not found.');
  const alreadyOpen = await evaluateInST(page, () =>
    document.getElementById('drawer-manager')?.classList.contains('openDrawer') ?? false
  );
  if (alreadyOpen) return { alreadyOpen: true };
  await toggle.click();
  await page.waitForFunction(
    () => document.getElementById('drawer-manager')?.classList.contains('openDrawer'),
    null,
    { timeout: 5000 },
  );
  return { alreadyOpen: false };
}

const USAGE = `Usage: node so-ui.mts <all|settings|drawer|open-drawer|open-settings|open-studio|studio|studio-tab|studio-save|drawer-tab|pipeline|assert-player-clean|wizard|open-wizard|new-story-wizard|wizard-run|wizard-answer|wizard-apply|stagecraft|curator-accept|curator-reject|screenshot> [label]

all: print settings + drawer state.
settings: print settings panel state.
drawer: print drawer state.
open-drawer: open the Story Orchestrator top-bar drawer.
open-settings: expand the settings panel.
open-studio: open Checkpoint Studio modal (v2).
studio: print Checkpoint Studio modal state (title, active tab, error/issue badges).
studio-tab <Graph|Story|Qualities|Checkpoints|Transitions|Roster|Diagnostics>: switch the studio tab.
studio-save [keep|restart|cancel]: click Save and answer the invalidation popup if one appears.
drawer-tab <Overview|Memory|Blackboard|Scheduler|Payload>: switch the drawer tab.
pipeline: print the pipeline state (snapshot + status line + HUD chip).
assert-player-clean: walk the player-mode drawer and fail on anything the spoiler checklist forbids.
wizard: print the wizard state (stage, pending questions, provisioning cards, created assets).
open-wizard: open the Studio on the Wizard tab for the story this chat plays.
new-story-wizard: click "New story (wizard)" in the settings panel (fresh draft).
wizard-run [stage] [message]: run a wizard stage through the UI and wait for the model.
wizard-answer [a1|a2|a3]: answer the pending questions ('|' separated); no argument clicks "You decide".
wizard-apply [index]: click "Create it" on one provisioning card (default 0).
stagecraft: print the World Info curator review ring from the drawer (author view, Scheduler tab).
curator-accept [index|text-first] [text]: accept one proposed change, optionally replacing its text first. text-first picks the
  newest proposal's first pending text change (text applied) or, with none, its first pending switch.
curator-reject [index|text-first]: decline one proposed change.
screenshot [label]: take an annotated screenshot.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    await page.waitForFunction(
      () => document.querySelector('#story-orchestrator-settings') || document.querySelector('#drawer-manager'),
      null,
      { timeout: 5000 },
    ).catch(() => undefined);

    const subcommand = process.argv[2] || 'all';

    if (subcommand === 'settings' || subcommand === 'all') {
      console.log('--- Settings Panel State ---');
      const state = await getSettingsPanelState(page);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-settings');
    }

    if (subcommand === 'drawer' || subcommand === 'all') {
      console.log('--- Drawer State ---');
      const state = await getDrawerState(page);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-drawer');
    }

    if (subcommand === 'open-drawer') {
      const result = await openStoryDrawer(page);
      console.log('Story drawer opened:', JSON.stringify(result));
    }

    if (subcommand === 'open-settings') {
      const result = await openExtensionSettings(page);
      console.log('Settings panel opened:', JSON.stringify(result));
    }

    if (subcommand === 'open-studio') {
      const result = await openCheckpointStudio(page);
      console.log('Checkpoint Studio opened:', JSON.stringify(result));
    }

    if (subcommand === 'studio') {
      const state = await getStudioState(page);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-studio');
    }

    if (subcommand === 'studio-tab') {
      const label = process.argv[3];
      if (!label) throw new Error('studio-tab requires a tab label');
      const result = await switchStudioTab(page, label);
      console.log('Switched studio tab:', JSON.stringify(result));
    }

    if (subcommand === 'studio-save') {
      const result = await saveStudioDraft(page, process.argv[3] ?? null);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-ui-studio-save');
    }

    if (subcommand === 'drawer-tab') {
      const label = process.argv[3];
      if (!label) throw new Error('drawer-tab requires a tab label (Overview|Blackboard|Memory|Scheduler|Payload)');
      const result = await switchDrawerTab(page, label);
      console.log('Switched drawer tab:', JSON.stringify(result));
    }

    if (subcommand === 'pipeline') {
      const state = await getPipelineState(page);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-pipeline');
    }

    if (subcommand === 'assert-player-clean') {
      const result = await assertPlayerClean(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-ui-player-clean');
      if (!result.ok) throw new Error(`player surface leaks: ${result.findings.map((finding) => `${finding.tab}:${finding.needle}`).join(', ')}`);
    }

    if (subcommand === 'wizard') {
      const state = await getWizardState(page);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-wizard');
    }

    if (subcommand === 'open-wizard' || subcommand === 'new-story-wizard') {
      const state = await openWizard(page, { newStory: subcommand === 'new-story-wizard' });
      console.log(JSON.stringify(state, null, 2));
    }

    if (subcommand === 'wizard-run') {
      const state = await runWizardStage(page, { stage: process.argv[3] ?? null, message: process.argv[4] ?? '' });
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-wizard-run');
    }

    if (subcommand === 'wizard-answer') {
      const raw = process.argv[3];
      const state = await answerWizardQuestions(page, raw ? raw.split('|') : null);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-wizard-answer');
    }

    if (subcommand === 'wizard-apply') {
      const state = await applyWizardProvisioning(page, Number(process.argv[3] ?? 0));
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-wizard-apply');
    }

    if (subcommand === 'stagecraft') {
      const state = await getStagecraftState(page);
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, 'so-ui-stagecraft');
    }

    if (subcommand === 'curator-accept' || subcommand === 'curator-reject') {
      const which = process.argv[3] ?? '0';
      const state = await decideCuratorOp(page, subcommand === 'curator-accept' ? 'accept' : 'reject', {
        index: which === 'text-first' ? 0 : Number(which),
        pick: which === 'text-first' ? 'text-first' : null,
        text: process.argv[4] ?? null,
      });
      console.log(JSON.stringify(state, null, 2));
      await writeJSON(state, `so-ui-${subcommand}`);
    }

    if (subcommand === 'screenshot') {
      const result = await takeAnnotatedScreenshot(page, 'so-ui-state');
      console.log(`Screenshot: ${result.path} (drawer visible: ${result.drawerVisible})`);
    }
  });
}
