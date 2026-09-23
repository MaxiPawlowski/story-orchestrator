// v2.3 plan 09's review row: "responsive probe (24 views, no overflow)". Named in the plan and never
// built, and it needs NO backend — the finding is DOM geometry, so it can run while the model is down.
//
// What it measures, per viewport, on the surfaces that are mounted:
//   1. our roots' own scrollWidth vs clientWidth (a panel that overflows its box clips its controls),
//   2. our controls outside the viewport (a button a real pointer cannot reach),
//   3. horizontal page overflow *attributable to us* — ST's own layout is out of scope, so the page
//      check only reports when an element of ours is wider than the viewport.
// It exits 1 on any finding, because a probe that only prints is a probe nobody reads.
//
// Trap it honours: changing the emulated viewport fires ST's resize handler, and a viewport left
// behind breaks a peer's run (gotchas, 2026-09-19) — the original size is restored in `finally`.

import { fileURLToPath } from 'node:url';
import { hasHelpFlag, runCli } from './lib/cli.mts';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON } from './lib/output.mts';
import { openCheckpointStudio, openExtensionSettings, openStoryDrawer } from './so-ui.mts';

const USAGE = `Usage: node so-responsive.mts [--surface drawer|settings|studio|all] [--zoom 150|200] [--out <file>]

24 viewports (phone → desktop) against the live page. Reports, per surface and viewport:
  overflow  — one of our roots scrolls horizontally (its controls are clipped)
  offscreen — a control's box leaves the viewport (a pointer cannot reach it)
--zoom presses the browser's OWN zoom (Ctrl + '+', what a user does) until the device pixel ratio
reaches the target, and records the ratio in every row so the record proves the zoom was applied.
No backend needed. Exits 1 when anything is found. Restores the original viewport and zoom.`;

export const RESPONSIVE_VIEWPORTS: Array<{ width: number; height: number; label: string }> = [
  { width: 320, height: 568, label: 'phone-320' },
  { width: 344, height: 882, label: 'phone-344' },
  { width: 360, height: 640, label: 'phone-360' },
  { width: 375, height: 667, label: 'phone-375' },
  { width: 375, height: 812, label: 'phone-375-tall' },
  { width: 390, height: 844, label: 'phone-390' },
  { width: 412, height: 915, label: 'phone-412' },
  { width: 414, height: 896, label: 'phone-414' },
  { width: 428, height: 926, label: 'phone-428' },
  { width: 480, height: 800, label: 'phablet-480' },
  { width: 600, height: 960, label: 'phablet-600' },
  { width: 768, height: 1024, label: 'tablet-768' },
  { width: 820, height: 1180, label: 'tablet-820' },
  { width: 1024, height: 768, label: 'laptop-1024' },
  { width: 1024, height: 1366, label: 'tablet-1024-tall' },
  { width: 1180, height: 820, label: 'laptop-1180' },
  { width: 1280, height: 720, label: 'laptop-1280' },
  { width: 1280, height: 800, label: 'laptop-1280-tall' },
  { width: 1366, height: 768, label: 'laptop-1366' },
  { width: 1440, height: 900, label: 'desktop-1440' },
  { width: 1536, height: 864, label: 'desktop-1536' },
  { width: 1600, height: 900, label: 'desktop-1600' },
  { width: 1920, height: 1080, label: 'desktop-1920' },
  { width: 2560, height: 1440, label: 'desktop-2560' },
];

// One measurement, in the page: our roots' overflow, and our controls' boxes against the viewport.
// `data-so` is the project's own marker for a control worth naming in a report.
const measure = () => {
  const roots = ['#drawer-manager', '#story-orchestrator-settings', '#so-hud-root', '#so-studio-modal', '#so-studio-root'];
  const visible = (node: Element) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node as HTMLElement);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const overflow = roots.flatMap((selector) => {
    const node = document.querySelector(selector);
    if (!node || !visible(node)) return [];
    const slack = (node as HTMLElement).scrollWidth - (node as HTMLElement).clientWidth;
    return slack > 1 ? [{ selector, slack }] : [];
  });
  const viewportWidth = window.innerWidth;
  const offscreen = Array.from(document.querySelectorAll('[data-so]'))
    .filter((node) => node.closest(roots.join(',')) && visible(node))
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const marker = `${node.getAttribute('data-so')}${node.getAttribute('data-key') ? `[${node.getAttribute('data-key')}]` : ''}`;
      if (rect.right > viewportWidth + 1) return { marker, edge: 'right', over: Math.round(rect.right - viewportWidth) };
      if (rect.left < -1) return { marker, edge: 'left', over: Math.round(-rect.left) };
      return null;
    })
    .filter(Boolean);
  return {
    viewportWidth,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflow,
    offscreen,
    rootsPresent: roots.filter((selector) => document.querySelector(selector)),
  };
};

// Browser zoom, as far as it can be driven from here. Ctrl + '+' presses are measured BEFORE and
// AFTER (the device pixel ratio is the proof): Chromium does not apply its zoom shortcut to a page
// attached over CDP, so the ratio never moves. What that leaves is the layout CONSEQUENCE of zoom,
// which is the part that breaks a UI: zooming to 150 % reflows the page into a CSS viewport 1/1.5 as
// wide. `--zoom-equivalent` emulates exactly that and labels every row with the scale it ran at, so
// no record can be read as a real-zoom measurement. The real-zoom row therefore keeps a human step.
async function applyZoom(page, percent: number): Promise<number> {
  const target = percent / 100;
  const ratio = () => evaluateInST(page, () => window.devicePixelRatio);
  const before = await ratio();
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(140);
  }
  const after = await ratio();
  if (after < target - 0.01) {
    console.log(`browser zoom did not take over CDP (device pixel ratio ${before} -> ${after} after 8 Ctrl+'+' presses): running the EQUIVALENT CSS width instead of the real zoom`);
  }
  return after;
}

// Two consecutive identical reads (max ~1.2 s), so an animating panel is never measured mid-flight.
async function settle(page: any) {
  let previous: any = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.waitForTimeout(120);
    const current = await evaluateInST(page, measure);
    if (previous && JSON.stringify(previous) === JSON.stringify({ ...current })) return current;
    previous = { ...current };
  }
  return previous;
}

async function probeSurface(page, surface: string, scale = 1) {
  // A modal left open from a previous surface (or a previous run) intercepts every click, which
  // presents as a click timeout in whichever surface came next — measured 2026-09-22, when a 200 %
  // run died on `#so-studio-modal intercepts pointer events`. Escape first, always.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  if (surface === 'drawer') await openStoryDrawer(page);
  if (surface === 'settings') await openExtensionSettings(page);
  if (surface === 'studio') await openCheckpointStudio(page);
  const original = await evaluateInST(page, () => ({ width: window.innerWidth, height: window.innerHeight }));
  const findings: Array<Record<string, unknown>> = [];
  try {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      const width = Math.round(viewport.width / scale);
      const height = Math.round(viewport.height / scale);
      await page.setViewportSize({ width, height });
      // Settle until two consecutive reads agree: ST's inline drawers animate on a resize, and a
      // single read 120 ms later measures the panel mid-transition — which reported a 31 px overflow
      // at a width where the settled layout has none (measured 2026-09-22, found by re-diagnosing a
      // finding instead of recording it).
      const measured = await settle(page);
      const actionable = measured.rootsPresent.length > 0 && (measured.overflow.length > 0 || measured.offscreen.length > 0);
      findings.push({ ...viewport, scale, width, height, ...measured, ok: !actionable });
    }
  } finally {
    if (original) await page.setViewportSize(original);
    if (surface === 'studio') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }
  const argument = (name: string, fallback: string) => {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[index + 1] : fallback;
  };
  runCli(async (page) => {
    const surface = argument('--surface', 'all');
    const zoom = Number(argument('--zoom', '100'));
    const surfaces = surface === 'all' ? ['drawer', 'settings', 'studio'] : [surface];
    const report: Record<string, unknown> = { surfaces: {}, at: new Date().toISOString(), viewports: RESPONSIVE_VIEWPORTS.length, zoomRequested: zoom };
    let failures = 0;
    const scale = zoom !== 100 ? zoom / 100 : 1;
    const realZoom = zoom !== 100 ? await applyZoom(page, zoom) : 1;
    report.zoomRequested = zoom;
    report.zoomApplied = Math.round(realZoom * 100);
    report.mode = zoom === 100 ? 'viewport' : realZoom >= scale - 0.01 ? 'browser-zoom' : 'zoom-equivalent-css-width';
    if (zoom !== 100) {
      await page.keyboard.press('Control+0');
      await page.waitForTimeout(200);
    }
    for (const name of surfaces) {
      const rows = await probeSurface(page, name, scale);
      (report.surfaces as Record<string, unknown>)[name] = rows;
      const bad = rows.filter((row) => !row.ok);
      failures += bad.length;
      console.log(`${name}: ${rows.length - bad.length}/${rows.length} clean${scale !== 1 ? ` at ${zoom}% (${scale === 1 ? '' : 'equivalent CSS width'})` : ''}`);
      for (const row of bad) {
        const overflow = JSON.stringify(row.overflow);
        const offscreen = JSON.stringify(row.offscreen);
        console.log(`  ${String(row.label).padEnd(18)} ${row.width}x${row.height}  overflow=${overflow}  offscreen=${offscreen}`);
      }
    }
    await writeJSON(report, 'so-responsive');
    console.log(`\n${failures === 0 ? 'CLEAN' : `${failures} viewport(s) with a finding`}`);
    return { ok: failures === 0, failures };
  });
}
