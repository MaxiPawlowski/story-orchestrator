import type { Page } from 'playwright';

export interface ServedBundle {
  runtime: boolean;
  built: boolean;
  http: number;
}

const BUILD = 'npm run build && npm run stage, then node scripts/debug/st-session.mts reload (a lane: node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload)';

export async function readServedBundle(page: Pick<Page, 'evaluate'>): Promise<ServedBundle> {
  return page.evaluate(async () => {
    const runtime = typeof (globalThis as any).storyOrchestratorRuntime === 'object' && (globalThis as any).storyOrchestratorRuntime !== null;
    try {
      const response = await fetch('/scripts/extensions/third-party/story-orchestrator/dist/manifest.json');
      if (!response.ok) return { runtime, built: false, http: response.status };
      const manifest = await response.json();
      return { runtime, built: manifest?.kind === 'build-manifest', http: response.status };
    } catch {
      return { runtime, built: false, http: 0 };
    }
  }) as Promise<ServedBundle>;
}

export function runtimeIssue(read: ServedBundle): string | null {
  if (read.runtime) return null;
  if (read.built) return 'dist/ holds a build but the page has no storyOrchestratorRuntime: it is running a cached or older bundle, or the extension failed to start; run node scripts/debug/st-session.mts reload and read the console';
  return `the page has no storyOrchestratorRuntime and the served dist/manifest.json is unreadable (HTTP ${read.http}): the extension is not built or not staged here; ${BUILD}`;
}

export async function assertRuntimeOnPage(page: Pick<Page, 'evaluate'>): Promise<ServedBundle> {
  const read = await readServedBundle(page);
  const issue = runtimeIssue(read);
  if (issue) throw new Error(`live harness refused: ${issue}`);
  return read;
}

export function diskBuildIssue(manifest: { kind?: unknown; [key: string]: unknown } | null): string | null {
  if (manifest?.kind === 'build-manifest') return null;
  return `no dist/manifest.json: ST serves nothing to run; ${BUILD}`;
}
