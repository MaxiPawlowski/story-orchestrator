import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

export const MEMORY_QUEUE_ACTIONS = ['keep', 'lock', 'reread', 'dismiss', 'reconfirm', 'discard'];

const argValue = (args: string[], name: string): string | null => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : null;
};
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

  // A Studio left open by an earlier run is a top-layer dialog, so it intercepts the click on the
  // Extensions drawer and this step fails with a timeout that says nothing about its cause
  // (2026-09-21: it made the next run look like a regression in the thing under test).
  if (await page.locator('#so-studio-modal[open]').count()) await closeCheckpointStudio(page);

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
// `title`/`removeQuality` edit the draft first, so a fixture can build the R7 case (a hostile title
// **and** an invalidating change: a title-only edit is compatible and never opens the popup).
export async function saveStudioDraft(page, choice = null, options: { title?: string; removeQuality?: string } = {}) {
  const modal = page.locator('#so-studio-modal');
  if (!(await modal.count())) throw new Error('Studio modal is not open.');
  if (options.title !== undefined || options.removeQuality !== undefined) {
    await evaluateInST(page, (edit: { title?: string; removeQuality?: string }) => {
      const store = globalThis.storyOrchestratorStudioDraft;
      if (!store) throw new Error('studio draft store is not exposed');
      store.getState().mutate((draft) => ({
        ...draft,
        ...(edit.title !== undefined ? { title: edit.title } : {}),
        ...(edit.removeQuality !== undefined ? { qualities: draft.qualities.filter((q) => q.key !== edit.removeQuality) } : {}),
      }));
      const after = store.getState().draft;
      if (edit.title !== undefined && after.title !== edit.title) throw new Error(`title edit did not land: ${after.title}`);
      if (edit.removeQuality !== undefined && after.qualities.some((q) => q.key === edit.removeQuality)) throw new Error(`quality ${edit.removeQuality} is still in the draft`);
      return { title: after.title, qualities: after.qualities.map((q) => q.key) };
    }, { title: options.title, removeQuality: options.removeQuality });
  }
  // What the save produces is recorded asynchronously by applyStoryUpdate, so the old fixed 500ms
  // sleep read the PREVIOUS update on a slower box: J2.7 saw the compatible quality-added result
  // from two steps earlier and reported "expected invalidating, got compatible" while the product
  // had classified it correctly (2026-09-20).
  const lastUpdateAt = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime?.getLastStoryUpdate?.()?.at ?? null).catch(() => null);
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
  // Wait for the update itself rather than for a duration. A save that produces no update at all
  // (identical draft, or one this chat does not take) never changes it, so this is a bounded wait
  // and not an assertion.
  await page.waitForFunction(
    (before) => {
      const at = (globalThis as { storyOrchestratorRuntime?: { getLastStoryUpdate?: () => { at?: string } | null } })
        .storyOrchestratorRuntime?.getLastStoryUpdate?.()?.at ?? null;
      return at !== before;
    },
    lastUpdateAt,
    { timeout: 15000 },
  ).catch(() => undefined);
  await page.waitForTimeout(250);
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
// S9: a fresh draft is titled "Untitled story", so its wizard session keys as `untitled-story`, which no
// marker matches — a test run's session then outlives cleanup. `title` names the draft before the
// wizard runs, so the session key is the slugged title and a marker scopes it.
export async function openWizard(page, { newStory = false, title = null as string | null } = {}) {
  if (newStory) {
    await openExtensionSettings(page);
    const button = page.locator('#so-new-story-wizard');
    if (!(await button.count())) throw new Error('"New story (wizard)" button (#so-new-story-wizard) not found.');
    await button.click();
    await answerStudioPopup(page, '.popup-button-ok');
    await page.locator('#so-studio-modal').waitFor({ state: 'visible', timeout: 10000 });
    if (title) {
      const field = page.locator('#so-studio-modal input[aria-label="Story title"]');
      await field.fill(title);
      const now = await field.inputValue();
      if (now !== title) throw new Error(`the draft title did not take: asked "${title}", the field reads "${now}"`);
    }
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
      applied: ['Created', 'Confirmed'].includes((card.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null)?.textContent?.trim() ?? ''),
      blocked: Boolean((card.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null)?.disabled),
      error: card.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      status: card.querySelector('[role="status"]')?.textContent?.trim() ?? null,
    }));
    // The technical stage chips are the only thing that reports the stage (plan 09 put them behind a
    // details disclosure and added step buttons above them, which are a different question).
    const stage = Array.from(root.querySelectorAll('[data-so="wizard-stage"][aria-pressed="true"]')).map((button) => button.textContent?.trim())[0] ?? null;
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
  // A stage name asks to drive a stage directly, so open the disclosure that holds the chips rather
  // than making the caller name the step that owns it.
  if (stage) {
    await page.evaluate(() => { document.querySelectorAll<HTMLDetailsElement>('#so-wizard details').forEach((node) => { node.open = true; }); });
    await page.locator('#so-wizard button', { hasText: stage }).first().click();
  }
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
  const cardsBefore = await cards.count();
  const labelBefore = (await getWizardState(page)).provisioning?.[index]?.label ?? null;
  await button.click();
  // One wait, for a settled outcome: a status line, a Created/Confirmed label, or the card
  // disappearing (a derived R8 card is offered only while the decision is outstanding, so taking it
  // removes the card and its status with it). No wait on the busy state: a grant is a local write
  // with nothing to await, so its busy window is microseconds and unobservable — requiring it made
  // a completed step look like a dead button (2026-09-21).
  await page.waitForFunction(({ target, before, label }) => {
    const cards = Array.from(document.querySelectorAll('#so-wizard [data-so="provisioning-card"]'));
    if (cards.length < before) return true;
    // The clicked card is identified by its label: a derived card is replaced by the opposite
    // decision's card, so a position that still exists is not necessarily the same card.
    if (label && !cards.some((entry) => entry.getAttribute('aria-label') === label)) return true;
    const card = cards[target];
    if (!card) return true;
    const apply = card.querySelector('[data-so="provisioning-apply"]') as HTMLButtonElement | null;
    const buttonLabel = apply?.textContent?.trim() ?? '';
    return buttonLabel === 'Created' || buttonLabel === 'Confirmed' || Boolean(card.querySelector('[role="status"]'));
  }, { target: index, before: cardsBefore, label: labelBefore }, { timeout: timeoutMs }).catch(() => undefined);
  const state = await getWizardState(page);
  // Followed by LABEL, not by position: confirming a derived card (an R8 grant) removes it and the
  // card that takes its slot is the opposite decision — revoking the permission just given. Counting
  // cards therefore can't tell "this step worked" from "this step failed", and reading index 0 after
  // a grant reported the brand-new revoke card as an unapplied grant (2026-09-21).
  const card = (state.provisioning ?? []).find((entry) => entry.label === labelBefore);
  // A provisioning step that came back with an error is a failed step, not a completed one: the verb
  // says so rather than leaving the caller to notice the wording on a button. A card that is gone
  // took its decision with it, and the caller's next assertion is the state it produced.
  if (card && !card.applied) throw new Error(`Provisioning step ${index} did not apply: ${card.status ?? card.error ?? 'no result reported'}`);
  return { ...state, applied: card?.applied ?? true, vanished: !card };
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

// v2.3 plan 05 (C3): the reconciliation queue, driven the way the author drives it. Author-only and
// in the Memory tab, so this turns author view on first — the panel is part of what plan 05 built and
// a journey that asserted on the store instead would not exercise the decision the author makes.
async function showMemoryQueue(page) {
  await evaluateInST(page, () => {
    globalThis.storyOrchestratorRuntime?.setUiSettings?.({ authorView: true });
    return true;
  });
  await openStoryDrawer(page);
  try {
    await switchDrawerTab(page, 'Memory');
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// What the author sees in the queue: each pair with both sides' rendered origin (`source · pass ·
// message · confidence`), which actions that side offers, and the quarantined rows below. The
// snapshot's own queue rides along, so a panel that renders nothing while the store holds a conflict
// is visible as exactly that.
export async function getMemoryQueueState(page, { timeoutMs = 15000 } = {}) {
  const tabError = await showMemoryQueue(page);
  const deadline = Date.now() + timeoutMs;
  let state = null;
  do {
    state = await evaluateInST(page, () => {
      const root = document.querySelector('[data-so="reconciliation"]');
      const snapshot = globalThis.storyOrchestratorRuntime?.getSnapshot?.() ?? null;
      const pairs = Array.from(root?.querySelectorAll('[data-so="conflict-pair"]') ?? []).map((pair) => ({
        key: pair.getAttribute('data-key'),
        sides: Array.from(pair.querySelectorAll('[data-so="conflict-origin"]')).map((origin) => origin.textContent?.trim() ?? ''),
        labels: Array.from(pair.querySelectorAll('.flex-1 > div:first-child')).map((label) => label.textContent?.trim() ?? ''),
        canLock: pair.querySelectorAll('[data-so="conflict-lock"]').length,
        actions: ['conflict-keep', 'conflict-reread', 'conflict-dismiss'].filter((attribute) => pair.querySelector(`[data-so="${attribute}"]`)),
      }));
      const quarantined = Array.from(root?.querySelectorAll('[data-so="quarantined"]') ?? []).map((row, index) => ({
        index,
        text: row.textContent?.trim().slice(0, 120) ?? '',
        canReconfirm: Boolean(row.querySelector('[data-so="reconfirm"]')),
        canDiscard: Boolean(row.querySelector('[data-so="discard-quarantined"]')),
      }));
      return {
        panelPresent: Boolean(root),
        header: root?.querySelector('.opacity-100')?.textContent?.trim() ?? null,
        pairs,
        quarantined,
        storeConflicts: (snapshot?.memory?.conflicts ?? []).length,
        storeQuarantined: (snapshot?.memory?.entries ?? []).filter((entry: any) => entry.provenance && entry.provenance.validity !== 'live').length,
      };
    });
    const wanted = (state as any)?.pairs?.length || (state as any)?.quarantined?.length;
    if (wanted || Date.now() > deadline) break;
    await page.waitForTimeout(250);
  } while (true);
  return tabError ? { ...(state as object), tabError } : state;
}

// Pure, so the half of this verb that can be checked without a browser is checked (so-ui.test.mts):
// an action that silently addressed the wrong control would look like a working verb until someone
// read the panel by hand during a live gate.
export function memoryQueueSelector({ action, key = null, side = 0, index = 0 }: { action: string; key?: string | null; side?: number; index?: number }): string {
  // The action is validated first: "nuke" is a typo and should be told it is one, not told it needs a
  // key (which is what a key-first order did).
  if (!MEMORY_QUEUE_ACTIONS.includes(action)) throw new Error(`unknown memory-queue action "${action}" — one of ${MEMORY_QUEUE_ACTIONS.join('|')}`);
  // `nth=` is Playwright's engine, and it is the only one of the two that works here: CSS
  // `:nth-of-type` counts among SIBLINGS OF THE SAME TAG, and the panel's quarantined rows are divs
  // alongside the header and the conflict rows — so `:nth-of-type(1)` selected the panel's own first
  // div, matched nothing inside it, and failed exactly like an empty queue (found 2026-09-22, the
  // first time the click path was driven against the live DOM; the unit test pinned the string, and
  // a string is not a DOM).
  if (action === 'reconfirm') return `[data-so="quarantined"] >> nth=${index} >> [data-so="reconfirm"]`;
  if (action === 'discard') return `[data-so="quarantined"] >> nth=${index} >> [data-so="discard-quarantined"]`;
  if (!key) throw new Error(`memory-queue ${action} needs a conflict key (see the state output's pairs[].key)`);
  const scoped = `[data-so="conflict-pair"][data-key="${key}"]`;
  if (action === 'reread') return `${scoped} [data-so="conflict-reread"]`;
  if (action === 'dismiss') return `${scoped} [data-so="conflict-dismiss"]`;
  return `${scoped} [data-so="conflict-${action}"] >> nth=${side}`;
}

// Actions mirror the panel's own controls. `side` is the 0-based side row inside the pair (a memory
// fact and a scene row can disagree), defaulting to the first.
export async function memoryQueueAction(page, { action = null, key = null, side = 0, index = 0 } = {}) {
  if (!action) throw new Error('memory-queue needs an action: keep|lock|reread|dismiss|reconfirm|discard');
  const tabError = await showMemoryQueue(page);
  const selector = memoryQueueSelector({ action, key, side, index });
  const target = page.locator(selector).first();
  const count = await page.locator(selector).count();
  if (!count) throw new Error(`nothing matched ${selector} — read the state first (memory-queue) and use one of its keys`);
  await target.click();
  await page.waitForTimeout(150);
  const after = await getMemoryQueueState(page);
  return tabError ? { ...(after as object), tabError } : { action, selector, before: count, after };
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

// The rendered diagnostic rows, not the store's copy: the plan's S1 proof is that an author is
// *told* about a placeholder latching enum, so the assertion reads what the panel shows.
export async function getStudioDiagnostics(page) {
  const modal = page.locator('#so-studio-modal');
  if (!(await modal.count())) throw new Error('Studio modal is not open.');
  await switchStudioTab(page, 'Diagnostics');
  return await evaluateInST(page, () => {
    const rows = Array.from(document.querySelectorAll('#so-studio-modal [data-so="diagnostic"]')).map((row) => ({
      severity: row.getAttribute('data-severity'),
      code: row.querySelector('.st-pill')?.textContent?.trim() ?? null,
      message: row.querySelector('span + span')?.textContent?.trim() ?? null,
      path: row.querySelector('.st-muted')?.textContent?.trim() ?? null,
    }));
    const clean = document.querySelector('#so-studio-modal .st-alert-success')?.textContent?.trim() ?? null;
    return { rows, clean, codes: rows.map((row) => row.code) };
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

// ST's Character Management panel opens over our drawer's tabs (J6.9, 2026-09-24: `#rm_group_chat_name`
// intercepted the Overview click for 30 s). Closed the way closeUnpinnedDrawers closes the top bar, and
// only when the author has not pinned it open.
export async function closeCharacterPanel(page) {
  return evaluateInST(page, () => {
    const panel = document.getElementById('right-nav-panel');
    const pinned = (document.getElementById('rm_button_panel_pin') as HTMLInputElement | null)?.checked === true;
    if (!panel?.classList.contains('openDrawer') || pinned) return { closed: false, pinned };
    panel.classList.replace('openDrawer', 'closedDrawer');
    document.getElementById('rightNavDrawerIcon')?.classList.replace('openIcon', 'closedIcon');
    return { closed: true, pinned };
  });
}

export async function switchDrawerTab(page, label) {
  const drawer = page.locator('#drawer-manager');
  if (!(await drawer.count())) throw new Error('Drawer (#drawer-manager) is not mounted.');
  const tab = drawer.locator('[role="tablist"] button', { hasText: label });
  if (!(await tab.count())) throw new Error(`Drawer tab "${label}" not found.`);
  await closeCharacterPanel(page);
  try {
    await tab.first().click({ timeout: 15000 });
  } catch (error) {
    const layout = await evaluateInST(page, (text: string) => {
      const button = [...document.querySelectorAll('#drawer-manager [role="tablist"] button')].find((candidate) => candidate.textContent?.includes(text));
      const box = (element: Element | null) => { const r = element?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; };
      const rect = button?.getBoundingClientRect();
      const top = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
      const panel = document.getElementById('right-nav-panel');
      return { tab: box(button ?? null), drawer: box(document.getElementById('drawer-manager')), drawerClass: document.getElementById('drawer-manager')?.className ?? null, panel: box(panel), panelClass: panel?.className ?? null, topmost: top ? `${top.tagName.toLowerCase()}#${top.id}.${String(top.className).split(' ').join('.')}` : null, viewport: [innerWidth, innerHeight] };
    }, label).catch(() => null);
    const shot = await writeScreenshot(page, 'so-ui-drawer-tab-blocked').catch(() => null);
    throw new Error(`${error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error)} | layout ${JSON.stringify(layout)}${shot ? ` | screenshot ${shot}` : ''}`);
  }
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
  '[data-so="agency-recovery"]', '[data-so="agency-take-alternate"]', '[data-so="agency-generate-road"]', '[data-so="agency-policy"]',
  '[data-so="memory-not-stored"]', '[data-so="memory-store-anyway"]', '[data-so="scene-read"]', '[data-so="scene-heading"]', '[data-so="lore-forced"]', '[data-so="judged-reads"]',
  '#so-judge-use-expansion-critic', '#so-judge-use-expansion-lookahead', '#so-judge-expansion-variants', '#so-judge-expansion-pick', '[data-so="expansion-judge"]', '#so-warden-enabled', '#so-warden-accept-mode',
  // v2.3 plan 09: the next-turn preview is author-grade by construction — it names the injection keys
  // and the members ST will draft for.
  '[data-so="next-turn-row"]', '[data-so="next-turn-clear"]', '[data-so="next-turn-reread-scene"]',
  // v2.4 plan 02 §5: the E1 branch cut at the history floor is author view only until a player session.
  '#so-history-floor', '#so-branch-from-oldest',
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

const USAGE = `Usage: node so-ui.mts <all|settings|drawer|open-drawer|open-settings|open-studio|studio|studio-tab|studio-save|drawer-tab|pipeline|assert-player-clean|wizard|open-wizard|new-story-wizard|wizard-run|wizard-answer|wizard-apply|stagecraft|curator-accept|curator-reject|memory-queue|hit-test|branch-continue|screenshot> [label]

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
memory-queue [action] [--key <conflictKey>] [--side <n>] [--index <n>]: the reconciliation queue (v2.3 plan 05, author view, Memory tab).
  No action reads it: each pair, both sides' rendered origin, which actions that side offers, and the quarantined rows below.
  Actions: keep|lock (--key, --side), reread|dismiss (--key), reconfirm|discard (--index into the quarantined list).
  It clicks the panel's own control, then re-reads, so the result shows what the author would see after the click.
hit-test <selector>: ask which element is topmost at the target's own centre. Exits 1 when a real pointer would not land on it.
branch-continue: open the drawer Overview, hit-test #so-branch-continue, click it with a real pointer and wait for #so-branch-notice to go (v2.4 plan 02).
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
      const value = (name) => {
        const index = process.argv.indexOf(name);
        return index >= 0 ? process.argv[index + 1] ?? undefined : undefined;
      };
      const result = await saveStudioDraft(page, process.argv[3] ?? null, { title: value('--title'), removeQuality: value('--remove-quality') });
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-ui-studio-save');
    }

    if (subcommand === 'studio-diagnostics') {
      const diagnostics = await getStudioDiagnostics(page);
      console.log(JSON.stringify(diagnostics, null, 2));
      await writeJSON(diagnostics, 'so-ui-studio-diagnostics');
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

    if (subcommand === 'memory-queue') {
      const action = process.argv[3] ?? null;
      const result = action
        ? await memoryQueueAction(page, {
          action,
          key: argValue(process.argv, '--key'),
          side: Number(argValue(process.argv, '--side') ?? 0),
          index: Number(argValue(process.argv, '--index') ?? 0),
        })
        : await getMemoryQueueState(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-ui-memory-queue');
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

    if (subcommand === 'hit-test') {
      const selector = process.argv[3];
      if (!selector) throw new Error('hit-test needs a selector');
      const result = await hitTest(page, selector);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-ui-hit-test');
      if (!result.clickable) process.exitCode = 1;
    }

    if (subcommand === 'branch-continue') {
      const result = await branchContinue(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'so-ui-branch-continue');
    }

    if (subcommand === 'screenshot') {
      const result = await takeAnnotatedScreenshot(page, 'so-ui-state');
      console.log(`Screenshot: ${result.path} (drawer visible: ${result.drawerVisible})`);
    }
  });
}

// v2.3 plan 01 §H. The review reported the wizard button being intercepted by the chat overlay on
// an isolated host; v2.2's J1 did not reproduce it. Both can be true, because J1 clicks through
// `element.click()`, which fires whatever is on top of it or not — a scripted click succeeds even
// when a real pointer would land on something else. This asks the browser the question a user's
// finger asks: at this element's own centre, which element is actually on top?
// V20c (J1.10): a hit-test says a pointer WOULD land on the control; this lands one. The click is real
// pointer input at the control's own centre (CDP mouse events, not `element.click()`), so an overlay or a
// handler bound to a covered element fails here, and `expectVisible` names what the click must open.
export async function pointerClick(page, selector: string, { expectVisible = null as string | null, answerPopup = false, timeoutMs = 10000 } = {}) {
  const hit = await hitTest(page, selector);
  if (!hit.clickable || !hit.at) throw new Error(`${selector} is not clickable by a pointer: ${hit.reason ?? hit.blocked}`);
  await page.mouse.click(hit.at.x, hit.at.y);
  if (answerPopup) await answerStudioPopup(page, '.popup-button-ok');
  if (expectVisible) {
    const opened = await page.locator(expectVisible).first().waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true, () => false);
    if (!opened) throw new Error(`a pointer click on ${selector} did not open ${expectVisible} within ${timeoutMs} ms`);
  }
  return { ...hit, clicked: true, opened: expectVisible };
}

export const BRANCH_CONTINUE = '#so-branch-continue';
export const BRANCH_NOTICE = '#so-branch-notice';

const openOverview = async (page) => {
  await openStoryDrawer(page);
  await switchDrawerTab(page, 'Overview');
};

// v2.4 plan 02 §10: "Continue from here" on a branch, pressed the way a player presses it — a pointer at
// the control's own centre after a hit-test — and proven by the notice going away, not by the click.
export async function branchContinue(page, { prepare = openOverview, timeoutMs = 10000, pollMs = 250 } = {}) {
  const prepared = await Promise.resolve(prepare(page)).then(() => null, (error) => (error instanceof Error ? error.message : String(error)));
  const hit = await hitTest(page, BRANCH_CONTINUE);
  if (!hit.clickable || !hit.at) {
    const why = hit.blocked === 'missing' ? ' — no branch notice is showing (not a branch, already continued, or a build without the plan 02 §5 notice)' : '';
    throw new Error(`${BRANCH_CONTINUE} is not clickable by a pointer (${hit.blocked}): ${hit.reason}${why}${prepared ? `; opening the drawer Overview failed first: ${prepared}` : ''}`);
  }
  await page.mouse.click(hit.at.x, hit.at.y);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const showing = await evaluateInST(page, (selector: string) => Boolean(document.querySelector(selector)), BRANCH_NOTICE);
    if (!showing) return { ...hit, clicked: true, noticeGone: true };
    if (Date.now() >= deadline) throw new Error(`clicked ${BRANCH_CONTINUE}, and ${BRANCH_NOTICE} was still showing after ${timeoutMs} ms, so the branch was not continued`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function hitTest(page, selector: string) {
  return evaluateInST(page, (selector: string) => {
    const describe = (node: HTMLElement | null) => (node ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}` : 'nothing');
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) return { selector, found: false, clickable: false, blocked: 'missing', reason: 'no element matches this selector' };

    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return { selector, found: true, clickable: false, blocked: 'no-box', reason: `element has no box (${rect.width}x${rect.height})` };

    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      return { selector, found: true, clickable: false, blocked: 'offscreen', reason: `centre (${Math.round(x)},${Math.round(y)}) is outside the viewport`, at: { x: Math.round(x), y: Math.round(y) } };
    }

    // A DISABLED control is `pointer-events: none`, so elementFromPoint returns whatever is behind
    // it — usually its own flex ancestor. That is correct behaviour, not an overlay covering it,
    // and conflating the two would fail a journey for a control the product meant to disable.
    // Measured on `#so-self-test` (disabled, opacity 0.5) on 2026-09-20.
    const style = getComputedStyle(target);
    const disabled = (target as HTMLButtonElement).disabled === true
      || target.getAttribute('aria-disabled') === 'true'
      || style.pointerEvents === 'none';
    if (disabled) {
      return { selector, found: true, clickable: false, blocked: 'disabled', reason: 'the control is disabled, so a pointer passes through it', target: describe(target) };
    }

    const top = document.elementFromPoint(x, y) as HTMLElement | null;
    // The element itself, or something inside it (an icon, a span), both mean the user hits it.
    const clickable = Boolean(top && (top === target || target.contains(top)));
    // An ANCESTOR on top means the point is inside the parent's box but not over the child, which
    // is a layout problem; an unrelated element on top is something covering it. Both are failures,
    // and naming which one is the difference between a five-minute fix and an afternoon.
    const covering = top && top.contains(target) ? 'ancestor' : 'overlay';
    return {
      selector,
      found: true,
      clickable,
      at: { x: Math.round(x), y: Math.round(y) },
      topmost: describe(top),
      target: describe(target),
      ...(clickable ? {} : { blocked: covering, reason: `a pointer at this element's centre would hit ${describe(top)} instead (${covering})` }),
    };
  }, selector);
}
