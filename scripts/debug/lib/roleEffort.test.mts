import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effortArmLabel, latencyPercentiles, nextProfiles, nextRoutes, parseEffortArm, pinRoleEffort, pinRoleProfile, restoreRoleEfforts, restoreRoleProfiles } from './roleEffort.mts';

test('parseEffortArm takes the five levels and refuses anything else by name', () => {
  assert.equal(parseEffortArm(''), null);
  assert.equal(parseEffortArm(undefined), null);
  assert.equal(parseEffortArm('medium'), 'medium');
  assert.throws(() => parseEffortArm('max'), /--effort must be one of default, off, low, medium, high; got "max"/);
});

test('nextRoutes sets one role, keeps the others and clears the role on default', () => {
  const before = { read: { route: { options: { effort: 'off' } } } };
  assert.deepEqual(nextRoutes(before, 'director', 'high'), { ...before, director: { route: { options: { effort: 'high' } } } });
  assert.deepEqual(nextRoutes(before, 'read', 'default'), {});
  assert.equal(effortArmLabel('shared', 'low'), 'shared-effort-low');
  assert.equal(effortArmLabel('shared', null), 'shared');
});

test('pin then restore round-trips the role map through the runtime', async () => {
  let routes: Record<string, unknown> = { read: { route: { options: { effort: 'off' } } } };
  const saves: string[] = [];
  Reflect.set(globalThis, 'storyOrchestratorRuntime', {
    getGlobalSettings: () => ({ extraction: { routes } }),
    setExtractionSettings: (patch: { routes: Record<string, unknown> }) => { routes = patch.routes; },
  });
  const page = {
    evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    waitForResponse: async () => { saves.push('save'); return { ok: () => true, status: () => 200 }; },
  };
  try {
    const pinned = await pinRoleEffort(page as never, 'director', 'high');
    assert.deepEqual(pinned.after, { read: { route: { options: { effort: 'off' } } }, director: { route: { options: { effort: 'high' } } } });
    await assert.rejects(restoreRoleEfforts(page as never, pinned.before));
    assert.deepEqual(routes, { read: { route: { options: { effort: 'off' } } } });
  } finally {
    Reflect.deleteProperty(globalThis, 'storyOrchestratorRuntime');
  }
});

test('latencyPercentiles is nearest-rank over finite samples, and says so when there are none', () => {
  assert.deepEqual(latencyPercentiles([400, 100, 300, 200, Number.NaN]), { p50: 200, p95: 400, n: 4 });
  assert.deepEqual(latencyPercentiles([]), { p50: null, p95: null, n: 0 });
});

test('nextProfiles routes one role and keeps the others', () => {
  assert.deepEqual(nextProfiles({ director: 'a' }, 'read', 'b'), { director: 'a', read: 'b' });
});

test('pinRoleProfile routes the read role by name, refuses an unknown profile, and restore puts the map back', async () => {
  let profiles: Record<string, string> = { director: 'p-dir' };
  Reflect.set(globalThis, 'storyOrchestratorRuntime', {
    getGlobalSettings: () => ({ extraction: { profiles } }),
    setExtractionSettings: (patch: { profiles: Record<string, string> }) => { profiles = patch.profiles; },
  });
  Reflect.set(globalThis, 'SillyTavern', { getContext: () => ({ extensionSettings: { connectionManager: { profiles: [{ id: 'p-cc', name: 'Artemis RunPod CC' }] } } }) });
  const page = {
    evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    waitForResponse: async () => ({ ok: () => true, status: () => 200 }),
  };
  try {
    await assert.rejects(pinRoleProfile(page as never, 'read', 'nope'), /no Connection Manager profile named or id'd "nope"/);
    const pinned = await pinRoleProfile(page as never, 'read', 'Artemis RunPod CC');
    assert.deepEqual(pinned.profile, { id: 'p-cc', name: 'Artemis RunPod CC' });
    assert.deepEqual(profiles, { director: 'p-dir', read: 'p-cc' });
    await restoreRoleProfiles(page as never, pinned.before).catch(() => null);
    assert.deepEqual(profiles, { director: 'p-dir' });
  } finally {
    Reflect.deleteProperty(globalThis, 'storyOrchestratorRuntime');
    Reflect.deleteProperty(globalThis, 'SillyTavern');
  }
});
