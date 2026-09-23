// `node --test scripts/debug/` — the debug harness's own unit tests.
//
// The run-header diff is a gate: if it is wrong, every v2.3 live recipe either passes vacuously or
// fails for the wrong reason. jest's roots are src/* only (jest.config.cjs), so the harness gets
// node:test, the runner `npm run test:plugin` already established.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffHeaders, parseAllow, readBuild, bundleWarning } from './so-run-header.mts';

const header = (overrides: Record<string, any> = {}) => ({
  label: 'a',
  capturedAt: '2026-09-20T00:00:00.000Z',
  build: { head: 'abc123', dirty: false, manifest: null },
  host: { stVersion: '1.13.0', mainApi: 'textgenerationwebui', onlineStatus: 'Connected' },
  extraction: { enabled: true, cadence: 3, stabilityLag: 0, profileId: 'artemis' },
  stagecraft: { curatorEnabled: false, acceptMode: 'review', wardenEnabled: false },
  chat: { groupId: '17897', chatId: 'chat-a', chatLength: 4, authorView: false },
  story: { id: 'adolion-adventurer', playedVersion: 9, contentHash: 'h1', boundary: 2, activeCheckpointId: 'guild-hall' },
  group: { disabledMembers: ['tobias'] },
  inventory: { v2Stories: ['adolion-adventurer@9'], wizardSessions: [], lorebooksSelected: ['Adolion World'] },
  ...overrides,
});

test('an unchanged install produces no differences', () => {
  assert.deepEqual(diffHeaders(header(), header()), []);
});

test('the label and timestamp are never differences', () => {
  const after = header({ label: 'b', capturedAt: '2026-09-20T01:00:00.000Z' });
  assert.deepEqual(diffHeaders(header(), after), []);
});

test('a changed cadence is blocking and names its path (S11)', () => {
  const after = header();
  after.extraction.cadence = 50;
  const differences = diffHeaders(header(), after);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].path, 'extraction.cadence');
  assert.equal(differences[0].before, 3);
  assert.equal(differences[0].after, 50);
  assert.equal(differences[0].allowed, false);
});

test('an --allow path clears its own difference and nothing else', () => {
  const after = header();
  after.chat.chatId = 'chat-b';
  after.extraction.cadence = 50;
  const differences = diffHeaders(header(), after, ['chatId']);
  const blocking = differences.filter((difference) => !difference.allowed);
  assert.equal(differences.length, 2);
  assert.deepEqual(blocking.map((difference) => difference.path), ['extraction.cadence']);
});

test('an --allow prefix covers every field under it', () => {
  const after = header();
  after.stagecraft.curatorEnabled = true;
  after.stagecraft.acceptMode = 'auto';
  const differences = diffHeaders(header(), after, ['stagecraft']);
  assert.equal(differences.length, 2);
  assert.ok(differences.every((difference) => difference.allowed));
});

test('list differences report added and removed items', () => {
  const after = header();
  after.inventory.v2Stories = ['adolion-adventurer@9', 'SO-J12@1'];
  const [difference] = diffHeaders(header(), after);
  assert.equal(difference.path, 'inventory.v2Stories');
  assert.deepEqual(difference.added, ['SO-J12@1']);
  assert.deepEqual(difference.removed, []);
  assert.equal(difference.allowed, false);
});

test('an item allowance clears exactly that addition, version-independently', () => {
  const after = header();
  after.inventory.v2Stories = ['adolion-adventurer@9', 'SO-J12@1'];
  const [difference] = diffHeaders(header(), after, ['inventory.v2Stories:+SO-J12']);
  assert.equal(difference.allowed, true);
  assert.equal(difference.allowedBy, 'inventory.v2Stories:+SO-J12');
});

test('an item allowance does NOT cover a second, undeclared change (the S12 case)', () => {
  // A journey that adds its own story and also eats the user's library must fail, even though the
  // recipe declared the addition. This is the defect the v2.2 config restore actually had.
  const after = header();
  after.inventory.v2Stories = ['SO-J12@1'];
  const [difference] = diffHeaders(header(), after, ['inventory.v2Stories:+SO-J12']);
  assert.deepEqual(difference.added, ['SO-J12@1']);
  assert.deepEqual(difference.removed, ['adolion-adventurer@9']);
  assert.equal(difference.allowed, false, 'a declared addition must not excuse an undeclared removal');
});

test('declaring both the addition and the removal clears it', () => {
  const after = header();
  after.inventory.v2Stories = ['SO-J12@1'];
  const [difference] = diffHeaders(header(), after, ['inventory.v2Stories:+SO-J12', 'inventory.v2Stories:-adolion-adventurer']);
  assert.equal(difference.allowed, true);
});

test('a removed lorebook selection is blocking (S12 companion)', () => {
  const after = header();
  after.inventory.lorebooksSelected = [];
  const [difference] = diffHeaders(header(), after);
  assert.deepEqual(difference.removed, ['Adolion World']);
  assert.equal(difference.allowed, false);
});

test('a cast change left behind is blocking (S2)', () => {
  const after = header();
  after.group.disabledMembers = ['tobias', 'belle'];
  const [difference] = diffHeaders(header(), after);
  assert.equal(difference.path, 'group.disabledMembers');
  assert.deepEqual(difference.added, ['belle']);
  assert.equal(difference.allowed, false);
});

test('a field appearing or disappearing is a difference, not a crash', () => {
  const before = header();
  const after = header();
  (after.build as any).manifest = { version: '2.3.0', commit: 'abc', sourceSha256: 's', bundleSha256: 'b', fileSha256: 'f' };
  const differences = diffHeaders(before, after);
  assert.ok(differences.length >= 1);
  assert.ok(differences.some((difference) => difference.path.startsWith('build.manifest')));
});

test('a judge usage flipped on is blocking unless declared', () => {
  const before = header({ judge: { enabled: false, uses: { director: false, loreSelect: false } } });
  const after = header({ judge: { enabled: true, uses: { director: false, loreSelect: true } } });
  const blocking = diffHeaders(before, after).filter((difference) => !difference.allowed);
  assert.deepEqual(blocking.map((difference) => difference.path).sort(), ['judge.enabled', 'judge.uses.loreSelect']);
  const declared = diffHeaders(before, after, ['judge.enabled', 'judge.uses.loreSelect']).filter((difference) => !difference.allowed);
  assert.deepEqual(declared, []);
});

// --- Astra review 2026-09-20: counterexamples that survived the first round of tests. ---

test('a tree that went dirty mid-run is blocking (build.dirty is not volatile)', () => {
  const [difference] = diffHeaders(header({ build: { head: 'abc', dirty: false, manifest: null } }), header({ build: { head: 'abc', dirty: true, manifest: null } }));
  assert.equal(difference.path, 'build.dirty');
  assert.equal(difference.allowed, false, 'the code under test changed mid-run');
});

test('normal play progress does not fail a start/end diff, but is reported', () => {
  const after = header();
  after.story.activeCheckpointId = 'road-to-wendhope';
  after.story.boundary = 19;
  after.chat.chatLength = 40;
  const differences = diffHeaders(header(), after);
  assert.ok(differences.length >= 1);
  assert.ok(differences.every((difference) => difference.allowed && difference.progress), 'a played session must not fail its own header diff');
  const strict = diffHeaders(header(), after, [], { strictProgress: true });
  assert.ok(strict.every((difference) => !difference.allowed), '--strict-progress pins a replay');
});

test('the playbook shorthands resolve to real paths', () => {
  const after = header();
  after.chat.chatId = 'chat-b';
  after.story.id = 'adolion-academy';
  assert.deepEqual(diffHeaders(header(), after, ['chatId', 'storyId']).filter((difference) => !difference.allowed), []);
});

test('last-segment matching no longer over-permits', () => {
  // `--allow enabled` used to clear judge.enabled AND extraction.enabled at once.
  const before = header({ judge: { enabled: false }, extraction: { enabled: true, cadence: 3 } });
  const after = header({ judge: { enabled: true }, extraction: { enabled: false, cadence: 3 } });
  const blocking = diffHeaders(before, after, ['enabled']).filter((difference) => !difference.allowed);
  assert.equal(blocking.length, 2, 'a bare leaf name must not act as a wildcard');
});

test('a malformed item allowance is rejected, not treated as a removal', () => {
  const { allow, errors } = parseAllow(['inventory.v2Stories:+new', 'inventory.v2Stories:xold']);
  assert.equal(allow.length, 1);
  assert.equal(errors.length, 1);
  const after = header();
  after.inventory.v2Stories = ['new@1'];
  const [difference] = diffHeaders(header(), after, allow);
  assert.equal(difference.allowed, false, 'replacing the library must not be excused by a typo');
});

test('an empty item after the colon is an error, not a whole-field pass', () => {
  const { allow, errors } = parseAllow(['extraction.cadence:']);
  assert.deepEqual(allow, []);
  assert.equal(errors.length, 1);
  const after = header();
  after.extraction.cadence = 50;
  assert.equal(diffHeaders(header(), after, allow)[0].allowed, false);
});

test('an empty section appearing or vanishing is a difference', () => {
  assert.equal(diffHeaders({}, { inventory: {} }).length, 1, 'flattening used to drop empty objects entirely');
  assert.equal(diffHeaders({ inventory: {} }, {}).length, 1);
});

test('an unknown lorebook selection is not an empty one', () => {
  const before = header();
  const after = header();
  after.inventory.lorebooksSelected = null;
  const [difference] = diffHeaders(before, after);
  assert.equal(difference.path, 'inventory.lorebooksSelected');
  assert.equal(difference.allowed, false);
});

// --- The build half named the wrong bundle for a day: plan 08 nests the manifest, the reader read
// flat fields, so every hold-out was null and a diff could not tell one bundle from another. ---

test('the build half reads plan 08s nested manifest, not flat fields', () => {
  const build = readBuild();
  assert.equal(typeof build.manifest?.version, 'string', 'extension.version is read');
  assert.match(String(build.manifest?.bundleSha256), /^[0-9a-f]{64}$/, 'bundle.sha256 is read');
  assert.equal(typeof build.manifest?.sourceFiles, 'number');
  assert.equal(build.manifest?.sourceSha256, (build.manifest as any)?.sourceSha256, 'one source hash, not two shapes');
});

test('a served bundle that differs from the built one is named', () => {
  const warned = bundleWarning('a'.repeat(64), 'b'.repeat(64));
  assert.match(String(warned), /not the built one/);
  assert.match(String(warned), /served a{16} vs dist b{16}/, 'the warning names both hashes, so the run log proves it');
  assert.equal(bundleWarning('c'.repeat(64), 'c'.repeat(64)), null, 'the shipped shape is silent');
  assert.match(String(bundleWarning(null, 'c'.repeat(64))), /unknown/, 'unreadable is unknown, never a pass');
  assert.match(String(bundleWarning('c'.repeat(64), null)), /cannot be compared/);
});
