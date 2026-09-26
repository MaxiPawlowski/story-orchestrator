import type { Page } from 'playwright';

export interface ServedBundle {
  runtime: boolean;
  flavor: string | null;
  http: number;
}

const SWITCH = 'npm run build:dev && npm run serve:dev, then node scripts/debug/st-session.mts reload (a lane: node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload)';

export async function readServedBundle(page: Pick<Page, 'evaluate'>): Promise<ServedBundle> {
  return page.evaluate(async () => {
    const runtime = typeof (globalThis as any).storyOrchestratorRuntime === 'object' && (globalThis as any).storyOrchestratorRuntime !== null;
    try {
      const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/manifest.json');
      if (!response.ok) return { runtime, flavor: null, http: response.status };
      const manifest = await response.json();
      return { runtime, flavor: typeof manifest?.flavor === 'string' ? manifest.flavor : null, http: response.status };
    } catch {
      return { runtime, flavor: null, http: 0 };
    }
  }) as Promise<ServedBundle>;
}

export function devBundleIssue(read: ServedBundle): string | null {
  if (read.runtime) return null;
  if (read.flavor === 'prod') return `the page runs the PROD bundle (served dist/manifest.json flavor "prod"), which carries no storyOrchestrator* debug handles; the live harness needs the dev build: ${SWITCH}`;
  if (read.flavor === 'dev') return 'dist/ holds the dev build but the page has no storyOrchestratorRuntime: it is running a cached or older bundle, or the extension failed to start; run node scripts/debug/st-session.mts reload and read the console';
  return `the page has no storyOrchestratorRuntime and the served dist/manifest.json is unreadable (HTTP ${read.http}): the extension is not built or not installed here; ${SWITCH}`;
}

export async function assertDevBundle(page: Pick<Page, 'evaluate'>): Promise<ServedBundle> {
  const read = await readServedBundle(page);
  const issue = devBundleIssue(read);
  if (issue) throw new Error(`live harness refused: ${issue}`);
  return read;
}

export function diskFlavourIssue(manifest: { flavor?: unknown; [key: string]: unknown } | null): string | null {
  if (!manifest) return `no dist/manifest.json: ST serves nothing to run; ${SWITCH}`;
  if (manifest.flavor === 'dev') return null;
  return `dist/manifest.json has flavor ${manifest.flavor === undefined ? 'undefined' : JSON.stringify(manifest.flavor)}, and every lane serves this dist/: the live harness needs the dev build; ${SWITCH}`;
}
