import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRuntimeOnPage, diskBuildIssue, readServedBundle, runtimeIssue } from './servedBundle.mts';

const pageWith = (globals: Record<string, unknown>, manifest: unknown, status = 200) => ({
  evaluate: async (fn: () => unknown) => {
    const saved = Object.fromEntries(Object.keys(globals).map((key) => [key, (globalThis as any)[key]]));
    const previousFetch = globalThis.fetch;
    Object.assign(globalThis, globals);
    globalThis.fetch = (async (url: string) => {
      assert.equal(url, '/scripts/extensions/third-party/story-orchestrator/dist/manifest.json');
      return { ok: status === 200, status, json: async () => manifest };
    }) as unknown as typeof fetch;
    try { return await fn(); } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete (globalThis as any)[key];
        else (globalThis as any)[key] = value;
      }
      globalThis.fetch = previousFetch;
    }
  },
}) as any;

test('the one build with its runtime handle passes', async () => {
  const read = await readServedBundle(pageWith({ storyOrchestratorRuntime: {} }, { kind: 'build-manifest' }));
  assert.deepEqual(read, { runtime: true, built: true, http: 200 });
  assert.equal(runtimeIssue(read), null);
  await assert.doesNotReject(() => assertRuntimeOnPage(pageWith({ storyOrchestratorRuntime: {} }, { kind: 'build-manifest' })));
});

test('a build on disk that the page does not run reads as a stale page', async () => {
  const page = pageWith({}, { kind: 'build-manifest' });
  assert.match(String(runtimeIssue(await readServedBundle(page))), /cached or older bundle/);
  await assert.rejects(() => assertRuntimeOnPage(page), /cached or older bundle/);
});

test('no served manifest reads as no build, with the http status and the build command', () => {
  const issue = String(runtimeIssue({ runtime: false, built: false, http: 404 }));
  assert.match(issue, /HTTP 404/);
  assert.match(issue, /npm run build && npm run stage/);
  assert.doesNotMatch(issue, /build:dev|serve:dev/);
});

test('control: a runtime handle on an unreadable manifest still passes, the handle is what the harness needs', () => {
  assert.equal(runtimeIssue({ runtime: true, built: false, http: 404 }), null);
});

test('the lane batch preflight reads the disk manifest; any build passes', () => {
  assert.equal(diskBuildIssue({ kind: 'build-manifest' }), null);
  assert.equal(diskBuildIssue({ kind: 'build-manifest', flavor: 'prod' }), null);
  assert.match(String(diskBuildIssue({ kind: 'other' })), /no dist\/manifest\.json/);
  assert.match(String(diskBuildIssue(null)), /no dist\/manifest\.json/);
});
