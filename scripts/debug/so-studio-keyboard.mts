// V19: the Studio's keyboard-only pass with REAL key presses. Opens the Studio, focuses the title, presses
// Tab until focus has come back to it (bounded), and fails when Save, Export JSON or Close was never
// reached or focus left the dialog. Closes the Studio with Escape afterwards; the draft is not edited.
import { fileURLToPath } from 'node:url';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { writeJSON } from './lib/output.mts';
import { focusWalkVerdict, type FocusStop } from './lib/focusWalk.mts';

const USAGE = `Usage: node scripts/debug/so-studio-keyboard.mts [--steps 60]

Walks the Checkpoint Studio with real Tab presses from the title field and reports every stop.
Exit 1 when Save, Export JSON or Close studio is unreachable, focus leaves the dialog, or the walk
never wraps back to the title within --steps presses.`;

const REQUIRED = ['Save', 'Export JSON', 'Close studio'];

async function main(page) {
  const steps = Number(process.argv[process.argv.indexOf('--steps') + 1]) || 60;
  const opened = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('#so-open-studio');
    button?.click();
    return Boolean(button);
  });
  if (!opened) throw new Error('#so-open-studio not found: open the extension settings panel first (so-ui.mts open-settings).');
  await page.waitForSelector('#so-studio-modal[open] [aria-label="Story title"]', { timeout: 10000 });
  await page.focus('#so-studio-modal [aria-label="Story title"]');
  const current = (): Promise<FocusStop> => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const label = el ? (el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName.toLowerCase()) : 'none';
    return { label, insideDialog: Boolean(el?.closest('#so-studio-modal')) };
  });
  const walk: FocusStop[] = [await current()];
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab');
    const stop = await current();
    walk.push(stop);
    if (stop.label === walk[0].label) break;
  }
  await page.keyboard.press('Escape');
  const verdict = focusWalkVerdict(walk, REQUIRED);
  const result = { ...verdict, required: REQUIRED, walk };
  console.log(JSON.stringify(result, null, 2));
  await writeJSON(result, 'so-studio-keyboard');
  return { ok: verdict.ok };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) console.log(USAGE);
  else await runCli(main);
}
