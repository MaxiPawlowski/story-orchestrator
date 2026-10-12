import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runCli } from './lib/cli.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { beginSandboxSession, deleteSandboxChats, openGroup } from './st-navigation.mts';
import { assertPlayerClean, closeCheckpointStudio, openCheckpointStudio, openStoryDrawer, saveStudioDraft, switchStudioTab } from './so-ui.mts';
import { removeStory } from './so-library.mts';
import { deleteLorebooksInPage } from './lib/lorebookDelete.mts';

runCli(async (page) => {
  const fixture = JSON.parse(await readFile('test/scenarios/live-ui-rework.json', 'utf8')).steps[0].import_story;
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const report: Record<string, unknown> = { at: new Date().toISOString(), viewport, checks: [] };
  if (await page.locator('#so-briefing-start').isVisible()) await page.locator('#so-briefing-start').click();
  await openGroup(page, '1759606632088');
  const sandbox = await beginSandboxSession(page);
  try {
    const imported = await evaluateInST(page, async (story) => {
      const rt = globalThis.storyOrchestratorRuntime;
      for (const key of Object.keys(globalThis).filter((key) => key.startsWith('storyOrchestratorDebug'))) delete globalThis[key];
      const result = await rt.importStory(JSON.stringify(story));
      rt.setUiSettings({ authorView: false });
      return result;
    }, fixture);
    assert.notEqual(imported?.ok, false, 'fixture import');
    await page.locator('#so-briefing-start').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#so-briefing-start').click();
    await page.locator('#so-briefing').waitFor({ state: 'detached' });
    await openStoryDrawer(page);
    const modal = page.locator('#so-workspace-modal');
    await modal.locator('#so-workspace-page-features').click();
    await modal.locator('button[data-feature="pacing"]').click();
    assert.match(await modal.innerText(), /Turned off by this story/);
    await modal.locator('label[for="so-feature-pacing-enabled"]').click();
    await page.waitForFunction(() => globalThis.storyOrchestratorRuntime.getSnapshot().features.pacing.reenabled);
    assert.match(await modal.innerText(), /This chat re-enables/);
    assert.equal(await evaluateInST(page, () => globalThis.storyOrchestratorRuntime.getStory().features.pacing), 'off');
    await modal.getByRole('button', { name: 'Reset Enabled to story/default' }).click();
    await page.waitForFunction(() => !globalThis.storyOrchestratorRuntime.getSnapshot().features.pacing.enabled);
    await page.evaluate(() => history.back());
    await modal.locator('#so-feature-search').waitFor();
    (report.checks as string[]).push('story decline, chat re-enable warning, authored isolation, reset, browser Back');
    await modal.getByRole('button', { name: 'Orchestrator', exact: true }).click();
    await modal.locator('#so-workspace-page-defaults').click();
    await modal.locator('button[data-feature="inner"]').click();
    const original = await modal.locator('#so-feature-inner-fanOut').inputValue();
    await modal.locator('#so-feature-inner-fanOut').selectOption(original === 'next' ? 'top2' : 'next');
    await modal.getByRole('button', { name: 'This story', exact: true }).click();
    await modal.locator('#so-workspace-page-features').click();
    await modal.locator('button[data-feature="inner"]').click();
    assert.equal(await modal.locator('#so-feature-inner-fanOut').inputValue(), original === 'next' ? 'top2' : 'next');
    assert.equal(await modal.locator('#so-feature-inner-fanOut').locator('..').locator('..').locator('.so-source-chip').innerText(), 'Default');
    await modal.locator('#so-feature-inner-fanOut').selectOption(original);
    assert.equal(await modal.locator('#so-feature-inner-fanOut').locator('..').locator('..').locator('.so-source-chip').innerText(), 'This chat');
    await modal.getByRole('button', { name: 'Reset Prepare for to story/default' }).click();
    await modal.getByRole('button', { name: 'Orchestrator', exact: true }).click();
    await modal.locator('#so-workspace-page-defaults').click();
    await modal.locator('button[data-feature="inner"]').click();
    await modal.locator('#so-feature-inner-fanOut').selectOption(original);
    (report.checks as string[]).push('install default propagation, source chips, field reset; inner voice remains enabled');
    const privacy = await assertPlayerClean(page);
    assert.equal(privacy.ok, true, JSON.stringify(privacy.findings));
    report.playerClean = { ok: privacy.ok, pages: privacy.tabs.length, selectorsChecked: privacy.selectorsChecked };
    await writeScreenshot(page, 'ui-workspace-controls');
    await modal.getByRole('button', { name: 'Close Story Orchestrator' }).click();
    await modal.waitFor({ state: 'detached' });
    await page.waitForTimeout(250);
    if (await page.locator('#so-briefing-start').isVisible()) await page.locator('#so-briefing-start').click();
    if (viewport.width < 700) {
      await evaluateInST(page, () => globalThis.storyOrchestratorRuntime.setUiSettings({ authorView: true }));
      await openCheckpointStudio(page);
      await evaluateInST(page, (story) => {
        globalThis.storyOrchestratorStudioDraft.getState().loadDraft(story);
      }, fixture);
      await switchStudioTab(page, 'Graph');
      const studio = page.locator('#so-studio-modal');
      await studio.getByRole('button', { name: '+ Checkpoint', exact: true }).click();
      await studio.getByRole('region', { name: 'checkpoint editor' }).waitFor();
      await studio.getByRole('region', { name: 'checkpoint editor' }).locator('textarea').first().fill('Finish the workspace editing check.');
      await studio.getByRole('region', { name: 'checkpoint editor' }).locator('select').first().selectOption('anchor');
      await studio.getByRole('button', { name: 'Back to graph' }).click();
      await studio.locator('[data-so="graph-canvas"]').scrollIntoViewIfNeeded();
      const actionPoint = await page.evaluate(() => {
        const container = document.querySelector('#so-studio-modal [data-so="graph-canvas"]') as HTMLElement & { _cyreg: { cy: any } };
        const box = container.getBoundingClientRect(), position = container._cyreg.cy.nodes().first().renderedPosition();
        return { x: box.left + position.x, y: box.top + position.y };
      });
      await page.mouse.click(actionPoint.x, actionPoint.y, { button: 'right' });
      await studio.getByRole('region', { name: 'Checkpoint actions' }).waitFor();
      await studio.getByRole('region', { name: 'Checkpoint actions' }).getByRole('button', { name: 'Back to graph' }).click();
      await studio.getByRole('button', { name: '+ Transition', exact: true }).click();
      const points = await page.evaluate(() => {
        const container = document.querySelector('#so-studio-modal [data-so="graph-canvas"]') as HTMLElement & { _cyreg?: { cy?: any } };
        const cy = container?._cyreg?.cy;
        if (!cy) throw new Error('graph instance missing');
        const box = container.getBoundingClientRect();
        return cy.nodes().filter((node: any) => node.data('type') !== 'chapter').map((node: any) => {
          const position = node.renderedPosition();
          return { id: node.id(), x: box.left + position.x, y: box.top + position.y };
        });
      });
      assert.equal(points.length, 2, 'added checkpoint appears on graph');
      for (const point of points) {
        await studio.locator('[data-so="graph-canvas"]').scrollIntoViewIfNeeded();
        const at = await page.evaluate((id) => {
          const container = document.querySelector('#so-studio-modal [data-so="graph-canvas"]') as HTMLElement & { _cyreg: { cy: any } };
          const box = container.getBoundingClientRect(), position = container._cyreg.cy.getElementById(id).renderedPosition();
          return { x: box.left + position.x, y: box.top + position.y };
        }, point.id);
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(250);
      }
      await studio.getByRole('region', { name: 'transition editor' }).waitFor();
      await studio.getByRole('button', { name: 'Back to graph' }).click();
      const validation = await evaluateInST(page, () => globalThis.storyOrchestratorStudioDraft.getState().errors);
      assert.deepEqual(validation, [], 'mobile draft validates before saving');
      report.save = await saveStudioDraft(page, 'keep');
      const counts = await evaluateInST(page, () => ({ nodes: globalThis.storyOrchestratorRuntime.getStory().checkpoints.length,
        edges: globalThis.storyOrchestratorRuntime.getStory().transitions.length }));
      assert.deepEqual(counts, { nodes: 2, edges: 1 }, 'saved graph reaches current chat');
      await writeScreenshot(page, 'ui-mobile-graph-saved');
      await studio.getByRole('button', { name: 'Close studio' }).click();
      (report.checks as string[]).push('mobile checkpoint sheet, pointer-selected transition endpoints, save and chat apply');
    }
    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    await writeScreenshot(page, 'ui-workspace-failure');
    report.graph = await page.evaluate(() => {
      const container = document.querySelector('#so-studio-modal [data-so="graph-canvas"]') as (HTMLElement & { _cyreg?: { cy?: any } }) | null;
      const cy = container?._cyreg?.cy;
      return { studio: Boolean(document.getElementById('so-studio-modal')), text: document.getElementById('so-studio-modal')?.innerText,
        box: container?.getBoundingClientRect().toJSON(), nodes: cy?.nodes().map((node: any) => ({ id: node.id(), position: node.renderedPosition() })) };
    });
    throw error;
  } finally {
    await closeCheckpointStudio(page);
    await page.evaluate(() => { document.querySelector<HTMLButtonElement>('#so-workspace-modal button[aria-label="Close Story Orchestrator"]')?.click(); });
    await page.waitForTimeout(250);
    const mirror = await evaluateInST(page, () => globalThis.storyOrchestratorRuntime.getSnapshot().memory.wiBook);
    if (mirror && mirror.endsWith(sandbox.guard.sandboxChatId)) await deleteLorebooksInPage(page, [mirror]);
    await removeStory(page, fixture.id);
    report.cleanup = await deleteSandboxChats(page, sandbox.guard);
    await writeJSON(report, 'ui-workspace-check');
  }
  console.log(JSON.stringify(report, null, 2));
  return { ok: report.ok === true };
});
