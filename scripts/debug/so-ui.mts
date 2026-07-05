import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

export async function openExtensionSettings(page) {
  const root = page.locator('#stepthink_settings');
  if (!(await root.count())) {
    throw new Error(
      'Story Orchestrator settings panel (#stepthink_settings) not found. ' +
      'Extension may not be loaded.',
    );
  }

  const content = root.locator('.inline-drawer-content');
  if (await content.count()) {
    return { alreadyOpen: true };
  }

  const toggle = root.locator('.inline-drawer-toggle');
  if (!(await toggle.count())) {
    throw new Error('Settings panel toggle (.inline-drawer-toggle) not found.');
  }

  await toggle.click();
  await content.waitFor({ state: 'attached', timeout: 5000 });
  return { alreadyOpen: false };
}

export async function getSettingsPanelState(page) {
  const root = page.locator('#stepthink_settings');
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

export async function openCheckpointStudio(page) {
  const root = page.locator('#stepthink_settings');
  if (!(await root.count())) {
    throw new Error('Settings panel not found. Cannot open Studio.');
  }

  const modal = page.locator('#checkpoint-editor-modal-root');
  if (await modal.count()) {
    return { alreadyOpen: true };
  }

  const content = root.locator('.inline-drawer-content');
  if (!(await content.count())) {
    await openExtensionSettings(page);
  }

  const studioBtn = root.locator('button', { hasText: 'Open Studio' });
  if (!(await studioBtn.count())) {
    throw new Error(
      '"Open Studio" button not found. The settings panel may need a story selected first.',
    );
  }

  await studioBtn.click();
  await modal.waitFor({ state: 'attached', timeout: 10000 });
  return { alreadyOpen: false };
}

export async function getDrawerState(page) {
  const drawer = page.locator('#drawer-manager');
  if (!(await drawer.count())) {
    return { found: false, reason: 'Drawer (#drawer-manager) not mounted' };
  }

  const visible = await evaluateInST(page, () => {
    const el = document.getElementById('drawer-manager');
    return el?.classList.contains('pinnedOpen') ?? false;
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
      document.getElementById('drawer-manager')?.classList.contains('pinnedOpen') ?? false
    );

  const path = await writeScreenshot(page, label);
  return { path, drawerVisible };
}

const USAGE = `Usage: node so-ui.mjs <all|settings|drawer|open-settings|open-studio|screenshot> [label]

all: print settings + drawer state.
settings: print settings panel state.
drawer: print drawer state.
open-settings: expand the settings panel.
open-studio: open Checkpoint Studio modal.
screenshot [label]: take an annotated screenshot.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  runCli(async (page) => {
    await page.waitForFunction(
      () => document.querySelector('#stepthink_settings') || document.querySelector('#drawer-manager'),
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

    if (subcommand === 'open-settings') {
      const result = await openExtensionSettings(page);
      console.log('Settings panel opened:', JSON.stringify(result));
    }

    if (subcommand === 'open-studio') {
      const result = await openCheckpointStudio(page);
      console.log('Checkpoint Studio opened:', JSON.stringify(result));
    }

    if (subcommand === 'screenshot') {
      const result = await takeAnnotatedScreenshot(page, 'so-ui-state');
      console.log(`Screenshot: ${result.path} (drawer visible: ${result.drawerVisible})`);
    }
  });
}
