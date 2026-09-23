// V20e: the harness's one way to persist extension settings, with evidence.
//
// Every call site used to write `if (typeof ctx.saveSettings === 'function') await ctx.saveSettings();
// else ctx.saveSettingsDebounced()`. ST's context has no `saveSettings` (st-context.js exposes only
// `saveSettingsDebounced`), so the awaited branch never ran: a config restore slept a blind 1.5 s,
// and the extraction restore, the story removal and so-library returned before anything was written.
// And script.js's own `saveSettings` catches its failure, so awaiting it would not be evidence either.
// What is: the answer ST's server gives to the POST, observed from outside the page.

import { evaluateInST } from './evaluate.mts';

export const isSettingsSave = (url: string, method: string) => method === 'POST' && new URL(url, 'http://host').pathname === '/api/settings/save';

export async function saveSettingsNow(page, timeoutMs = 15000): Promise<{ status: number }> {
  const answered = page.waitForResponse((response) => isSettingsSave(response.url(), response.request().method()), { timeout: timeoutMs });
  await evaluateInST(page, async () => {
    const { saveSettings } = await import(/* webpackIgnore: true */ '/script.js' as string) as { saveSettings: () => Promise<void> };
    await saveSettings();
    return true;
  });
  const response = await answered.catch(() => null);
  if (!response) throw new Error(`no /api/settings/save answer within ${timeoutMs} ms, so the settings write is unproven`);
  if (!response.ok()) throw new Error(`/api/settings/save answered ${response.status()}; the settings were not written`);
  return { status: response.status() };
}
