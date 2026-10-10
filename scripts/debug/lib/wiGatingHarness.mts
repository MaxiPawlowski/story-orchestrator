import { evaluateInST } from './evaluate.mts';

// v2.5 plan 01 G3/G4: run a journey or scenario under a lorebook gating mode. Switching to scan goes through
// the product's own confirm (popup.js:255 `.popup-button-ok`, template index.html:6481), exactly as an author
// does; it normalises the install's story lorebooks, so it runs on LANES ONLY (overview rule 10).

export type WiGatingMode = 'file' | 'scan';

export const WI_GATING_CONFIRM_TEXT = 'Switch lorebook gating to per chat';

export interface WiGatingCapture {
  mode: WiGatingMode;
  active: boolean;
  ledgerEntries: number;
  capability: string | null;
}

export function parseWiGating(value: string | undefined | null): WiGatingMode | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'scan' || value === 'file') return value;
  throw new Error(`--wi-gating takes scan or file, not "${value}"`);
}

export async function readWiGating(page): Promise<WiGatingCapture | null> {
  return evaluateInST(page, () => {
    const status = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.()?.wiGating;
    const settings = (globalThis as any).storyOrchestratorRuntime?.getGlobalSettings?.()?.worldInfo;
    if (!settings) return null;
    const entries: number = Object.values(settings.normalized ?? {}).reduce((sum: number, comments: any) => sum + (Array.isArray(comments) ? comments.length : 0), 0) as number;
    return { mode: settings.gatingMode === 'file' ? 'file' : 'scan', active: status?.active === true, ledgerEntries: entries, capability: status?.capability?.state ?? null };
  }, null);
}

/** Drives the author's path: the mode control's request, the confirm popup, then waits for the gating to settle. */
export async function applyWiGating(page, mode: WiGatingMode, timeoutMs = 120000) {
  const before = await readWiGating(page);
  if (!before) throw new Error('the lorebook gating settings could not be read, so the run could not be restored; refusing to switch');
  const after = await evaluateInST(page, async ({ mode: wanted, confirmText, timeout }) => {
    const gating = (globalThis as any).storyOrchestratorScanGating;
    if (!gating) throw new Error('storyOrchestratorScanGating is not installed (the runtime did not start the lorebook gating)');
    const started = Date.now();
    if (wanted === 'file') {
      await gating.requestFile();
    } else {
      const request = gating.requestScan();
      let clicked = false;
      while (!clicked && Date.now() - started < timeout) {
        const dialog = [...document.querySelectorAll('dialog[open]')].find((node) => (node.querySelector('.popup-content')?.textContent ?? '').includes(confirmText));
        const ok = dialog?.querySelector('.popup-button-ok') as HTMLElement | null;
        if (ok) {
          ok.click();
          clicked = true;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (!clicked) throw new Error('the lorebook gating confirm never appeared');
      const activated = await request;
      if (!activated) throw new Error(`per-chat gating did not activate: ${JSON.stringify(gating.capability())}`);
    }
    return { active: gating.active(), capability: gating.capability() };
  }, { mode, confirmText: WI_GATING_CONFIRM_TEXT, timeout: timeoutMs });
  const read = await readWiGating(page);
  if (!read || read.mode !== mode || (mode === 'scan' && !read.active)) throw new Error(`lorebook gating did not read back as ${mode}: ${JSON.stringify({ read, after })}`);
  return { mode, before, applied: read };
}

/** Puts the mode back. Normalised books stay normalised: the lane is a copy, and file mode enables from rest-off (S6). */
export async function restoreWiGating(page, before: WiGatingCapture | null) {
  if (!before) return { restored: false, reason: 'no pre-run capture' };
  const current = await readWiGating(page);
  if (current?.mode === before.mode) return { restored: false, unchanged: true };
  const applied = await applyWiGating(page, before.mode).catch((error) => ({ error: error.message }));
  return { restored: true, ...('error' in applied ? { error: applied.error } : { mode: applied.mode }) };
}
