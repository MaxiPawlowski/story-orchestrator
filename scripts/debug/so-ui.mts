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
// Journey/scenario files never carry a profile id — ST_DEBUG_PROFILE (name) selects one when
// several exist, otherwise the first configured profile wins.
export async function selectMemoryProfile(page, wanted = process.env.ST_DEBUG_PROFILE ?? '') {
  const { navWasOpen } = await openExtensionSettings(page);
  const enable = page.locator('#so-extraction-enabled');
  if (!(await enable.count())) throw new Error('Extraction toggle (#so-extraction-enabled) not found in the settings panel.');
  if (!(await enable.isChecked())) await enable.check();
  const select = page.locator('#so-extraction-profile');
  if (!(await select.count())) throw new Error('Memory profile select (#so-extraction-profile) not found.');
  const labels = (await select.locator('option').allTextContents()).map((label) => label.trim()).filter((label) => label && label !== 'No profile selected');
  if (!labels.length) throw new Error('No connection profiles offered by the settings panel.');
  const search = String(wanted).trim().toLowerCase();
  const label = (search && labels.find((option) => option.toLowerCase().startsWith(search))) || labels[0];
  await select.selectOption({ label });
  const result = { profile: label, available: labels, enabled: await enable.isChecked() };
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
  if (await modal.count()) {
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
  await modal.waitFor({ state: 'attached', timeout: 10000 });
  return { alreadyOpen: false };
}

export async function closeCheckpointStudio(page) {
  return evaluateInST(page, () => {
    const modal = document.getElementById('so-studio-modal') as HTMLDialogElement | null;
    if (!modal) return { closed: false, reason: 'studio not open' };
    const close = modal.querySelector('[aria-label="Close"], [title="Close"]') as HTMLElement | null;
    if (close) close.click();
    else modal.close();
    return { closed: true };
  });
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

const USAGE = `Usage: node so-ui.mts <all|settings|drawer|open-drawer|open-settings|open-studio|studio|studio-tab|drawer-tab|screenshot> [label]

all: print settings + drawer state.
settings: print settings panel state.
drawer: print drawer state.
open-drawer: open the Story Orchestrator top-bar drawer.
open-settings: expand the settings panel.
open-studio: open Checkpoint Studio modal (v2).
studio: print Checkpoint Studio modal state (title, active tab, error/issue badges).
studio-tab <Graph|Qualities|Checkpoints|Transitions|Diagnostics>: switch the studio tab.
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

    if (subcommand === 'drawer-tab') {
      const label = process.argv[3];
      if (!label) throw new Error('drawer-tab requires a tab label (Overview|Blackboard|Memory|Scheduler|Payload)');
      const result = await switchDrawerTab(page, label);
      console.log('Switched drawer tab:', JSON.stringify(result));
    }

    if (subcommand === 'screenshot') {
      const result = await takeAnnotatedScreenshot(page, 'so-ui-state');
      console.log(`Screenshot: ${result.path} (drawer visible: ${result.drawerVisible})`);
    }
  });
}
