import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { settleDialogs } from './lib/connection.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';

const PROBE_ID = 'so-k3-stale-tab-probe';
const USAGE = `Usage: node scripts/debug/so-stale-tab.mts run

v2.8 69 K3 step 1: one install in two pages. Page B loads first, page A saves a story to the library,
then page B saves its settings. Reports whether A's story is still in the server's settings file.
Removes the probe story afterwards.`;

const serverHas = (page, id: string) => evaluateInST(page, async (needle) => {
  const ctx = (globalThis as any).SillyTavern.getContext();
  const response = await fetch('/api/settings/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}', cache: 'no-cache' });
  const data = await response.json();
  const root = JSON.parse(data.settings)?.extension_settings?.['story-orchestrator'];
  return Array.isArray(root?.v2Stories) && root.v2Stories.some((record) => record?.id === needle);
}, id);

const pageHas = (page, id: string) => evaluateInST(page, (needle) => {
  const root = (globalThis as any).SillyTavern.getContext().extensionSettings?.['story-orchestrator'];
  return Array.isArray(root?.v2Stories) && root.v2Stories.some((record) => record?.id === needle);
}, id);

const freshLost = async (page) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureSTReady(page);
  await page.waitForFunction(() => Boolean((globalThis as any).storyOrchestratorRuntime), null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  return evaluateInST(page, () => (globalThis as any).storyOrchestratorRuntime.getSnapshot().libraryLost ?? null);
};

const importProbe = (page) => evaluateInST(page, async (text) => {
  const result = await (globalThis as any).storyOrchestratorRuntime.importStory(text);
  return result === undefined ? null : JSON.parse(JSON.stringify(result));
}, probeStory());

export function probeStory(): string {
  const story = JSON.parse(readFileSync(new URL('../../test/fixtures/extractor16.story.json', import.meta.url), 'utf8'));
  return JSON.stringify({ ...story, id: PROBE_ID, title: 'SO-K3 stale tab probe' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag() || process.argv[2] !== 'run') {
    console.log(USAGE);
    process.exit(process.argv[2] ? 1 : 0);
  }
  runCli(async (pageA) => {
    const pageB = await pageA.context().newPage();
    settleDialogs(pageB);
    try {
      await pageB.goto(pageA.url(), { waitUntil: 'domcontentloaded' });
      await ensureSTReady(pageB);
      await pageB.waitForFunction(() => Boolean((globalThis as any).storyOrchestratorRuntime), null, { timeout: 60000 });
      const before = { server: await serverHas(pageA, PROBE_ID), pageB: await pageHas(pageB, PROBE_ID) };
      const imported = await importProbe(pageA);
      await pageA.waitForTimeout(2500);
      const forcedA = (await serverHas(pageA, PROBE_ID)) ? null : await saveSettingsNow(pageA);
      const afterA = { server: await serverHas(pageA, PROBE_ID), pageA: await pageHas(pageA, PROBE_ID), pageB: await pageHas(pageB, PROBE_ID) };
      const savedB = await saveSettingsNow(pageB);
      const afterB = { server: await serverHas(pageA, PROBE_ID), pageA: await pageHas(pageA, PROBE_ID) };
      const verdict = !afterA.server ? 'not-measured: page A never saved the story' : afterB.server ? 'survives' : 'lost';
      await pageB.close().catch(() => undefined);
      const lostAfterReload = await freshLost(pageA);
      await importProbe(pageA);
      const removed = await evaluateInST(pageA, (id) => (globalThis as any).storyOrchestratorRuntime.removeStory(id), PROBE_ID);
      const savedCleanup = await saveSettingsNow(pageA);
      await pageA.waitForTimeout(2000);
      const lostAfterTombstone = await freshLost(pageA);
      const record = { at: new Date().toISOString(), probe: PROBE_ID, before, imported, forcedA, afterA, savedB, afterB, verdict,
        indexReport: { lostAfterReload, probeReported: Boolean(lostAfterReload?.stories?.includes(PROBE_ID)), removed, savedCleanup, lostAfterTombstone,
          tombstoneQuiet: !lostAfterTombstone?.stories?.includes(PROBE_ID) },
        serverAfterCleanup: await serverHas(pageA, PROBE_ID) };
      await writeJSON(record, 'so-stale-tab');
      console.log(JSON.stringify(record, null, 2));
      return { ok: verdict === 'survives' || (verdict === 'lost' && record.indexReport.probeReported && record.indexReport.tombstoneQuiet) };
    } finally {
      await pageB.close().catch(() => undefined);
    }
  });
}
