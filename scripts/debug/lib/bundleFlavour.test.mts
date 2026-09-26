import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDevBundle, devBundleIssue, diskFlavourIssue, readServedBundle } from './bundleFlavour.mts';

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

test('a dev bundle with its runtime handle passes', async () => {
  const read = await readServedBundle(pageWith({ storyOrchestratorRuntime: {} }, { flavor: 'dev' }));
  assert.deepEqual(read, { runtime: true, flavor: 'dev', http: 200 });
  assert.equal(devBundleIssue(read), null);
  await assert.doesNotReject(() => assertDevBundle(pageWith({ storyOrchestratorRuntime: {} }, { flavor: 'dev' })));
});

test('a prod bundle is refused and the error names the switch', async () => {
  const page = pageWith({}, { flavor: 'prod' });
  const read = await readServedBundle(page);
  assert.deepEqual(read, { runtime: false, flavor: 'prod', http: 200 });
  const issue = devBundleIssue(read);
  assert.match(String(issue), /PROD bundle/);
  assert.match(String(issue), /npm run build:dev && npm run serve:dev/);
  assert.match(String(issue), /st-session\.mts reload/);
  await assert.rejects(() => assertDevBundle(page), /PROD bundle/);
});

test('a dev build on disk that the page does not run reads as a stale page, not as prod', () => {
  assert.match(String(devBundleIssue({ runtime: false, flavor: 'dev', http: 200 })), /cached or older bundle/);
});

test('no served manifest reads as no build, with the http status', () => {
  assert.match(String(devBundleIssue({ runtime: false, flavor: null, http: 404 })), /HTTP 404/);
});

test('control: a runtime handle on an unreadable manifest still passes, the handle is what the harness needs', () => {
  assert.equal(devBundleIssue({ runtime: true, flavor: null, http: 404 }), null);
});

test('the lane batch preflight reads the disk manifest', () => {
  assert.equal(diskFlavourIssue({ kind: 'build-manifest', flavor: 'dev' }), null);
  assert.match(String(diskFlavourIssue({ kind: 'build-manifest', flavor: 'prod' })), /flavor "prod"/);
  assert.match(String(diskFlavourIssue({ kind: 'build-manifest' })), /flavor undefined/);
  assert.match(String(diskFlavourIssue(null)), /no dist\/manifest\.json/);
});
