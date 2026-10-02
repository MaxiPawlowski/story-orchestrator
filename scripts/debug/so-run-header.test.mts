// `node --test scripts/debug/` — the debug harness's own unit tests.
//
// The run-header diff is a gate: if it is wrong, every v2.3 live recipe either passes vacuously or
// fails for the wrong reason. jest's roots are src/* only (jest.config.cjs), so the harness gets
// node:test, the runner `npm run test:plugin` already established.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffHeaders, foreignChatGrowth, parseAllow, readBuild, readCampaign, bundleWarning, profileInventory, promptSetup, samplerState, thirdPartyState } from './so-run-header.mts';

test('prompt setup: the header states whether the page runs the thinking setup, from the page values alone', () => {
  const opener = '<|channel>thought' + String.fromCharCode(10);
  const live = (bias: string, parse: boolean) => ({
    instruct: { preset: 'Gemma 4 Thinking', last_output_sequence: '', sequences_as_stop_strings: false },
    textgen: { preset: 'Artemis v1.1 RP', samplers: ['min_p'] }, context: { preset: 'Gemma 4', names_as_stop_strings: false },
    settings: { 'power_user.user_prompt_bias': bias, 'power_user.reasoning.prefix': opener, 'power_user.reasoning.auto_parse': parse, 'power_user.reasoning.name': 'Gemma 4', amount_gen: 1400 },
    profile: { name: 'Artemis RunPod RP' },
  });
  const on = promptSetup(live(opener, true))!;
  assert.deepEqual({ thinking: on.thinking, instruct: on.instruct, names: on.namesAsStopStrings, tokens: on.responseTokens, profile: on.profile?.name }, { thinking: true, instruct: 'Gemma 4 Thinking', names: false, tokens: 1400, profile: 'Artemis RunPod RP' });
  assert.equal(promptSetup(live('', true))!.thinking, false);
  assert.equal(promptSetup(live(opener, false))!.thinking, false);
  assert.equal(promptSetup(null), null);
});

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

test('A28: a group chat that came back after its cleanup is blocking', () => {
  const before = header({ inventory: { v2Stories: [], wizardSessions: [], lorebooksSelected: [], groupChats: ['17897/Adolion - 2026-09-20'] } });
  const after = header({ inventory: { v2Stories: [], wizardSessions: [], lorebooksSelected: [], groupChats: ['17897/Adolion - 2026-09-20', '17897/sandbox-resurrected'] } });
  const [difference] = diffHeaders(before, after);
  assert.equal(difference.path, 'inventory.groupChats');
  assert.deepEqual(difference.added, ['17897/sandbox-resurrected']);
  assert.equal(difference.allowed, false);
  assert.deepEqual(parseAllow(['groupChats:+17897/sandbox-resurrected']).allow[0].path, 'inventory.groupChats');
});

test('A28 control: the same chat list on both sides is no difference', () => {
  const chats = { v2Stories: [], wizardSessions: [], lorebooksSelected: [], groupChats: ['17897/Adolion - 2026-09-20'] };
  assert.deepEqual(diffHeaders(header({ inventory: chats }), header({ inventory: { ...chats } })), []);
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
  const differences = diffHeaders(header(), after, [], { ownedChats: ['chat-a'] });
  assert.ok(differences.length >= 1);
  assert.ok(differences.every((difference) => difference.allowed && difference.progress), 'a played session must not fail its own header diff');
  const strict = diffHeaders(header(), after, [], { strictProgress: true, ownedChats: ['chat-a'] });
  assert.ok(strict.every((difference) => !difference.allowed), '--strict-progress pins a replay');
});

test('H-a: a chat the run does not own that grew between the two captures is blocking, not progress', () => {
  const after = header();
  after.chat.chatLength = 5;
  const [difference] = diffHeaders(header(), after);
  assert.equal(difference.path, 'chat.chatLength');
  assert.equal(difference.allowed, false, 'a reply that landed in a chat the run left behind is residue');
  assert.equal(difference.foreignChat, 'chat-a');
  assert.equal(difference.progress, undefined);
  const shrunk = header();
  shrunk.chat.chatLength = 2;
  assert.equal(diffHeaders(header(), shrunk)[0].allowed, false, 'a foreign chat that lost messages is damage');
  assert.equal(diffHeaders(header(), after, [], { ownedChats: ['chat-b'] })[0].allowed, false, 'owning another chat does not cover this one');
});

test('H-a control: growth on the run\'s own chat is progress, and a chat switch is not read as growth', () => {
  const after = header();
  after.chat.chatLength = 9;
  const [owned] = diffHeaders(header(), after, [], { ownedChats: ['chat-a'] });
  assert.deepEqual([owned.allowed, owned.progress, owned.foreignChat], [true, true, undefined]);
  const switched = header();
  switched.chat.chatId = 'chat-b';
  switched.chat.chatLength = 9;
  const lengths = diffHeaders(header(), switched, ['chatId']).find((difference) => difference.path === 'chat.chatLength');
  assert.equal(lengths?.allowed, true, 'two different chats have no growth to compare');
  assert.equal(foreignChatGrowth(header(), switched), null);
  assert.equal(foreignChatGrowth(header({ chat: { chatId: null, chatLength: 1 } }), header({ chat: { chatId: null, chatLength: 3 } })), null);
  const declared = diffHeaders(header(), after, ['chat.chatLength'])[0];
  assert.equal(declared.allowed, true, 'an explicit --allow still covers it, as for every other path');
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
  assert.ok(['prod', 'dev'].includes(String(build.manifest?.flavor)), 'the flavour the lanes serve is recorded');
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

test('a profile repointed and never put back is a difference the header can see (V22b)', () => {
  const before = profileInventory([{ name: 'Artemis RunPod RP', api: 'textgenerationwebui', url: 'http://127.0.0.1:18080' }, { name: 'Memory', api: 'textgenerationwebui', url: null }]);
  const after = profileInventory([{ name: 'Artemis RunPod RP', api: 'textgenerationwebui', url: 'https://pod-8080.proxy.runpod.net' }, { name: 'Memory', api: 'textgenerationwebui', url: null }]);
  assert.deepEqual(before, ['Artemis RunPod RP [textgenerationwebui] -> http://127.0.0.1:18080', 'Memory [textgenerationwebui] -> (no api-url)']);
  const result = diffHeaders({ profiles: { urls: before } } as any, { profiles: { urls: after } } as any);
  assert.deepEqual(result.filter((entry) => !entry.allowed).map((entry) => entry.path), ['profiles.urls']);
  assert.deepEqual(result[0].removed, ['Artemis RunPod RP [textgenerationwebui] -> http://127.0.0.1:18080']);
});

test('a sampler left on a probe preset is a difference the header can see (V22b, found by V24)', () => {
  const raw = (preset: string, temp: number) => ({ mainApi: 'textgenerationwebui', textgen: { preset, temp, top_p: temp }, oai: { preset: 'Default', temp: 1, top_p: 1 } });
  const before = samplerState(raw('Artemis v1.1 RP', 1));
  const after = samplerState(raw('Story: SO Preset Probe', 0.42));
  assert.deepEqual(before, { api: 'textgenerationwebui', preset: 'Artemis v1.1 RP', temp: 1, top_p: 1 });
  assert.deepEqual(diffHeaders({ sampler: before } as any, { sampler: after } as any).filter((entry) => !entry.allowed).map((entry) => entry.path).sort(), ['sampler.preset', 'sampler.temp', 'sampler.top_p']);
  assert.equal(samplerState({ mainApi: 'openai', textgen: { preset: 'x' }, oai: { preset: 'Chat', temp: 0.9, top_p: 1 } }).preset, 'Chat');
  assert.equal(samplerState({ mainApi: 'kobold', textgen: { preset: 'x' }, oai: { preset: 'y' } }).preset, null);
});

test('thirdParty: a watched extension setting is read, and a flip of it is a diff', () => {
  const before = thirdPartyState({ disabled: ['b', 'a'], installed: ['third-party/x'], settings: { 'st-stepped-thinking': { is_enabled: false, mode: 'embedded', is_shutdown: false, other: 1 } } });
  assert.deepEqual(before, { disabledExtensions: ['a', 'b'], installed: ['third-party/x'], watched: { 'st-stepped-thinking': { is_enabled: false, mode: 'embedded', is_shutdown: false } } });
  const after = thirdPartyState({ disabled: ['a', 'b'], installed: ['third-party/x'], settings: { 'st-stepped-thinking': { is_enabled: true, mode: 'embedded', is_shutdown: false } } });
  assert.notDeepEqual(after.watched, before.watched);
});

test('control: an extension that is not installed reads null, not an empty object that would diff as equal', () => {
  const state = thirdPartyState({ disabled: [], installed: null, settings: {} });
  assert.equal(state.watched['st-stepped-thinking'], null);
  assert.equal(state.installed, null);
});

test('campaign: the pin commit and the installed inventory of the lane are recorded, and a re-import at another commit is a blocking diff (CR-P19)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-campaign-'));
  const pin = join(dir, 'pin.json');
  const work = join(dir, 'adolion-fresh');
  mkdirSync(work);
  writeFileSync(pin, JSON.stringify({ repo: 'C:/dev/adolion-campaign', branch: 'v26', commit: 'aaa111' }));
  writeFileSync(join(work, 'inventory-latest.json'), JSON.stringify({ commit: 'aaa111', books: [{ name: 'Adolion World' }] }));
  const before = readCampaign(pin, work);
  assert.deepEqual(before.warnings, []);
  assert.equal(before.campaign.pinCommit, 'aaa111');
  assert.equal(before.campaign.pinBranch, 'v26');
  assert.equal((before.campaign.installed as { commit: string }).commit, 'aaa111');
  writeFileSync(pin, JSON.stringify({ repo: 'C:/dev/adolion-campaign', branch: 'v26', commit: 'bbb222' }));
  writeFileSync(join(work, 'inventory-latest.json'), JSON.stringify({ commit: 'bbb222', books: [{ name: 'Adolion World' }, { name: 'Adolion Chronicle' }] }));
  const after = readCampaign(pin, work);
  const blocking = diffHeaders({ campaign: before.campaign } as any, { campaign: after.campaign } as any).filter((entry) => !entry.allowed).map((entry) => entry.path).sort();
  assert.deepEqual(blocking, ['campaign.installed.commit', 'campaign.installed.sha256', 'campaign.pinCommit']);
  assert.deepEqual(diffHeaders({ campaign: after.campaign } as any, { campaign: readCampaign(pin, work).campaign } as any), []);
});

test('campaign: off an adolion-fresh lane the inventory reads null without a warning; a missing or broken pin, or a broken inventory, warns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'so-campaign-'));
  const pin = join(dir, 'pin.json');
  writeFileSync(pin, JSON.stringify({ commit: 'aaa111' }));
  const plain = readCampaign(pin, join(dir, 'no-lane'));
  assert.equal(plain.campaign.installed, null);
  assert.deepEqual(plain.warnings, []);
  assert.equal(readCampaign(join(dir, 'absent.json'), join(dir, 'no-lane')).warnings.length, 1);
  writeFileSync(pin, '{not json');
  assert.match(readCampaign(pin, join(dir, 'no-lane')).warnings[0], /unreadable/);
  const work = join(dir, 'adolion-fresh');
  mkdirSync(work);
  writeFileSync(join(work, 'inventory-latest.json'), '{broken');
  const broken = readCampaign(join(dir, 'absent.json'), work);
  assert.deepEqual(broken.campaign.installed, { error: 'unreadable' });
  assert.equal(broken.warnings.length, 2);
});
