import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTHOR_VIEW_STEP, laneOf, membersToEnable, notRunnableLine, requiredGroup, requiresOf, requiresProblems, validateRequires, withAuthorView } from './lib/scenarioRequires.mts';
import { evalSyntaxProblems, validateFixture, validateSteps } from './lib/scenarioSchema.mts';
import { judgeEnabledIn, stripModelSecrets, withJudgeEnabled } from './lib/laneModel.mts';
import { TOY_GROUP_NAME } from '../lib/toyGroup.mjs';

const toy = { groupId: '1000000000001', groupName: TOY_GROUP_NAME, members: [{ name: 'Luke', avatar: 'Luke.png', disabled: true }, { name: 'Arin', avatar: 'Arin.png', disabled: false }] };

test('requires is part of the closed vocabulary: unknown keys, bad values and empty objects are refused', () => {
  assert.deepEqual(validateRequires(undefined), []);
  assert.deepEqual(validateRequires({ lane: 'no-model', group: TOY_GROUP_NAME, members: ['Luke'], authorView: true, judge: 'off', why: 'x' }), []);
  assert.match(validateRequires({}).join(), /empty requires/);
  assert.match(validateRequires({ lanes: 'model' }).join(), /unknown key "lanes"/);
  assert.match(validateRequires({ lane: 'nomodel' }).join(), /expected "no-model" or "model"/);
  assert.match(validateRequires({ judge: 'on' }).join(), /only "off"/);
  assert.match(validateRequires({ authorView: false }).join(), /only true/);
  assert.match(validateRequires({ members: ['Luke'] }).join(), /name the group/);
  assert.match(validateRequires({ group: '' }).join(), /non-empty string/);
  assert.match(validateRequires({ roleProfiles: 'chat' }).join(), /text-completion/);
  assert.match(validateFixture({ requires: { lane: 'sometimes' }, steps: [{ wait: { idle: true } }] }, 'f').join(), /f\.requires\.lane/);
  assert.deepEqual(validateFixture({ requires: { lane: 'model' }, steps: [{ wait: { idle: true } }] }, 'f'), []);
});

test("the scenario's own group wins over the batch --group, and says so", () => {
  assert.deepEqual(requiredGroup({ group: "Adolion - The Adventurer's Road" }, TOY_GROUP_NAME), { group: "Adolion - The Adventurer's Road", overridden: true });
  assert.deepEqual(requiredGroup({ group: TOY_GROUP_NAME }, TOY_GROUP_NAME), { group: TOY_GROUP_NAME, overridden: false });
  assert.deepEqual(requiredGroup({}, TOY_GROUP_NAME), { group: TOY_GROUP_NAME, overridden: false });
  assert.deepEqual(requiredGroup({}, null), { group: null, overridden: false });
  assert.deepEqual(requiresOf({ requires: { lane: 'model' } }), { lane: 'model' });
  assert.deepEqual(requiresOf([]), {});
});

test('a disabled required member is re-enabled; an absent one is a problem the runner cannot fix', () => {
  assert.deepEqual(membersToEnable({ group: TOY_GROUP_NAME, members: ['luke'] }, toy), ['Luke.png']);
  assert.deepEqual(membersToEnable({ group: TOY_GROUP_NAME, members: ['Arin'] }, toy), []);
  assert.match(requiresProblems({ group: TOY_GROUP_NAME, members: ['Tobias'] }, toy).join(), /needs Tobias in the group/);
  assert.match(requiresProblems({ group: TOY_GROUP_NAME, members: ['Luke'] }, toy).join(), /still disabled/);
  assert.deepEqual(requiresProblems({ group: TOY_GROUP_NAME, members: ['Luke'] }, { ...toy, members: [{ ...toy.members[0], disabled: false }] }), []);
});

test('group is matched by id or by exact name, and a wrong group is named', () => {
  assert.deepEqual(requiresProblems({ group: 'group: arin, dm narrator' }, toy), []);
  assert.match(requiresProblems({ group: "Adolion - The Adventurer's Road" }, toy).join(), /the open group is "Group: Arin, DM Narrator"/);
  assert.match(requiresProblems({ group: 'x' }, {}).join(), /the open group is none/);
});

const SCENARIOS = join(import.meta.dirname, '..', '..', 'test', 'scenarios');
const LANE_PENDING = new Set(['v27-card-art-base.json', 'v27-card-rollback.json', 'v27-existing-expression-reference.json', 'v27-local-card-reply.json']);

test('every scenario in the corpus states the install it needs: a lane, and a group by name', () => {
  const files = readdirSync(SCENARIOS).filter((name) => name.endsWith('.json') && !name.endsWith('.story.json'));
  const docs = files.map((name) => ({ name, doc: JSON.parse(readFileSync(join(SCENARIOS, name), 'utf-8').replace(/^﻿/, '')) })).filter((file) => Array.isArray(file.doc?.steps));
  assert.ok(docs.length > 150, `expected the whole corpus, found ${docs.length} scenarios`);
  const problems = docs.flatMap(({ name, doc }) => {
    const requires = requiresOf(doc);
    const found: string[] = [];
    if (!requires.group) found.push(`${name}: no requires.group`);
    else if (/^\d+$/.test(requires.group)) found.push(`${name}: requires.group ${requires.group} is an id; ids differ per install, pin the group by name`);
    if (!requires.lane && !LANE_PENDING.has(name)) found.push(`${name}: no requires.lane`);
    if (/\b1759606632088\b/.test(JSON.stringify(doc))) found.push(`${name}: names the toy group by its id`);
    return found;
  });
  assert.deepEqual(problems, []);
  assert.deepEqual([...LANE_PENDING].filter((name) => !files.includes(name)), [], 'a lane-pending file left the corpus: drop it from LANE_PENDING');
  const counts = docs.reduce((tally, { doc }) => ({ ...tally, [requiresOf(doc).lane ?? 'pending']: (tally[requiresOf(doc).lane ?? 'pending'] ?? 0) + 1 }), {} as Record<string, number>);
  assert.ok(counts['no-model'] > 50 && counts.model > 50, JSON.stringify(counts));
});

const JOURNEYS = join(import.meta.dirname, '..', '..', 'test', 'journeys');
const journeyGroupProblems = (name: string, doc: { setup?: { group?: unknown } }): string[] => {
  const group = doc?.setup?.group;
  const found: string[] = [];
  if (typeof group === 'string' && /^\d+$/.test(group)) found.push(`${name}: setup.group ${group} is an id; ids differ per install, pin the group by name`);
  if (/\b1759606632088\b/.test(JSON.stringify(doc))) found.push(`${name}: names the toy group by its id`);
  return found;
};

test('every journey pins its group by name, never by an install-minted id', () => {
  const files = readdirSync(JOURNEYS).filter((name) => name.endsWith('.journey.json'));
  assert.ok(files.length >= 14, `expected the journey catalog, found ${files.length}`);
  const docs = files.map((name) => ({ name, doc: JSON.parse(readFileSync(join(JOURNEYS, name), 'utf-8').replace(/^﻿/, '')) }));
  assert.deepEqual(docs.flatMap(({ name, doc }) => journeyGroupProblems(name, doc)), []);
  assert.ok(docs.filter(({ doc }) => doc?.setup?.group === TOY_GROUP_NAME).length >= 13);
});

test('control: a journey pinned by the toy id, or by any numeric id, is caught', () => {
  assert.deepEqual(journeyGroupProblems('planted', { setup: { group: '1759606632088' } }), [
    'planted: setup.group 1759606632088 is an id; ids differ per install, pin the group by name',
    'planted: names the toy group by its id',
  ]);
  assert.deepEqual(journeyGroupProblems('planted', { setup: { group: '1000000000001' } }), ['planted: setup.group 1000000000001 is an id; ids differ per install, pin the group by name']);
  assert.deepEqual(journeyGroupProblems('planted', { setup: { group: TOY_GROUP_NAME } }), []);
});

test('lane kinds: a no-model scenario refuses a lane whose model answers, and a model scenario refuses a dead one', () => {
  assert.match(requiresProblems({ lane: 'no-model' }, { modelReachable: true, modelProbe: 'answered' }).join(), /needs a no-model lane.*answered/);
  assert.match(requiresProblems({ lane: 'no-model' }, { modelReachable: null }).join(), /could not be probed/);
  assert.deepEqual(requiresProblems({ lane: 'no-model' }, { modelReachable: false }), []);
  assert.match(requiresProblems({ lane: 'model' }, { modelReachable: false, modelProbe: 'API request failed' }).join(), /did not answer \(API request failed\)/);
  assert.deepEqual(requiresProblems({ lane: 'model' }, { modelReachable: true }), []);
  assert.equal(laneOf({}), 'model');
  assert.equal(laneOf({}, 'no-model'), 'no-model');
  assert.equal(laneOf({ lane: 'model' }, 'no-model'), 'model');
});

const discovered = { diffusionModels: ['d.safetensors'], textEncoders: ['e.safetensors'], vaes: ['v.safetensors'], checkpoints: [], alpha: ['alpha'] };
const harness = (config) => ({ path: 'lane/image-harness.json', gaps: [], config });

test('comfy and imageHarness are check-only and validated: ComfyUI only on a model lane, discovery needs comfy', () => {
  assert.deepEqual(validateRequires({ lane: 'model', comfy: true, imageHarness: ['editModels', 'backgroundRemoval', 'rater'] }), []);
  assert.deepEqual(validateRequires({ imageHarness: ['rater'] }), []);
  assert.match(validateRequires({ comfy: true }).join(), /declares lane "model"/);
  assert.match(validateRequires({ lane: 'no-model', comfy: true }).join(), /no-model batch never reaches ComfyUI/);
  assert.match(validateRequires({ lane: 'model', comfy: false }).join(), /only true/);
  assert.match(validateRequires({ imageHarness: ['editModels'] }).join(), /add requires\.comfy/);
  assert.match(validateRequires({ imageHarness: ['models'] }).join(), /non-empty list of editModels/);
  assert.match(validateRequires({ imageHarness: [] }).join(), /non-empty list/);
});

test('comfy: an uncleared lane, a missing plugin and a dead ComfyUI are each named; a cleared, answering one passes', () => {
  assert.match(requiresProblems({ comfy: true }, {}).join(), /needs a lane cleared for ComfyUI/);
  assert.match(requiresProblems({ comfy: true }, { comfy: { cleared: false, plugin: null, discovered: null, probe: null } }).join(), /SO_ALLOW_COMFY=1/);
  assert.match(requiresProblems({ comfy: true }, { comfy: { cleared: true, plugin: 'absent', discovered: null, probe: null } }).join(), /media server plugin.*404/);
  assert.match(requiresProblems({ comfy: true }, { comfy: { cleared: true, plugin: 'present', discovered: null, probe: 'ECONNREFUSED' } }).join(), /discovery did not answer \(ECONNREFUSED\)/);
  assert.match(requiresProblems({ comfy: true }, { comfy: { cleared: true, plugin: null, discovered: null, probe: 'not probed: the lane has no live model' } }).join(), /status could not be read/);
  assert.deepEqual(requiresProblems({ comfy: true }, { comfy: { cleared: true, plugin: 'present', discovered, probe: null } }), []);
});

test('imageHarness: a missing config, an undiscovered model, an unoffered alpha recipe and an absent rater are named', () => {
  const comfy = { cleared: true, plugin: 'present' as const, discovered, probe: null };
  assert.match(requiresProblems({ imageHarness: ['rater'] }, {}).join(), /was not read/);
  assert.match(requiresProblems({ imageHarness: ['rater'] }, { harness: { path: 'h', gaps: ['needs raterProfile in h'], config: null } }).join(), /needs raterProfile in h/);
  const config = { editModels: { diffusion: 'd.safetensors', encoder: 'e.safetensors', vae: 'other.safetensors' }, backgroundRemoval: 'birefnet', raterProfile: 'Rater' };
  const problems = requiresProblems({ lane: 'model', comfy: true, imageHarness: ['editModels', 'backgroundRemoval', 'rater'] },
    { modelReachable: true, comfy, harness: harness(config), profileNames: ['Main'] }).join('; ');
  assert.match(problems, /vae model "other\.safetensors"/);
  assert.doesNotMatch(problems, /diffusion model/);
  assert.match(problems, /background-removal recipe "birefnet"/);
  assert.match(problems, /rater profile "Rater"/);
  assert.deepEqual(requiresProblems({ lane: 'model', comfy: true, imageHarness: ['editModels', 'backgroundRemoval', 'rater'] },
    { modelReachable: true, comfy, harness: harness({ ...config, editModels: { ...config.editModels, vae: 'v.safetensors' }, backgroundRemoval: 'alpha' }), profileNames: ['Rater'] }), []);
  assert.match(requiresProblems({ imageHarness: ['localProfiles'] }, { harness: harness({ localProfiles: { main: 'M', memory: 'R' } }), profileNames: ['M'] }).join(), /local profile "R"/);
});

test('check-only conditions: main API, role profiles, macro engine, vectors World Info, prior step', () => {
  assert.match(requiresProblems({ mainApi: 'openai' }, { mainApi: 'textgenerationwebui' }).join(), /needs main API openai/);
  assert.match(requiresProblems({ roleProfiles: 'text-completion' }, { roleModes: { read: 'cc', director: 'tc' } }).join(), /read=cc/);
  assert.match(requiresProblems({ roleProfiles: 'text-completion' }, { roleModes: {} }).join(), /could not be read/);
  assert.deepEqual(requiresProblems({ roleProfiles: 'text-completion' }, { roleModes: { read: 'tc', director: 'tc' } }), []);
  assert.match(requiresProblems({ macroEngine: false }, { macroEngine: true }).join(), /experimental_macro_engine off/);
  assert.match(requiresProblems({ vectorsWorldInfo: false }, { vectorsWorldInfo: true }).join(), /Vectors > World Info off/);
  assert.match(requiresProblems({ prior: 'so-timeout-arm scale' }, {}).join(), /needs a prior step outside this file: so-timeout-arm scale/);
  assert.equal(notRunnableLine(['a', 'b']), 'not-runnable: a; b');
});

test('requires.authorView is re-applied after every step that loads a story, because a fresh story blob starts in player mode', () => {
  const steps = [{ import_story: { file: './x.story.json' } }, { ui: { action: 'open-studio' } }, { reload: true }, { wait: { idle: true } }];
  const out = withAuthorView(steps, { authorView: true });
  assert.deepEqual(out, [steps[0], AUTHOR_VIEW_STEP, steps[1], steps[2], AUTHOR_VIEW_STEP, steps[3]]);
  assert.deepEqual(withAuthorView(steps, {}), steps);
  assert.deepEqual(validateSteps([AUTHOR_VIEW_STEP]), []);
  assert.deepEqual(evalSyntaxProblems(AUTHOR_VIEW_STEP.eval, 'author-view'), []);
});

test('no-model lane: only model keys leave secrets.json, and the judge flag is written without touching the rest', () => {
  const { next, removed } = stripModelSecrets({ api_key_deepseek: 'k', typesafe_api_key: 't', api_url_custom: 'u', other: 1 });
  assert.deepEqual(removed.sort(), ['api_key_deepseek', 'typesafe_api_key']);
  assert.deepEqual(next, { api_url_custom: 'u', other: 1 });
  assert.deepEqual(stripModelSecrets(null), { next: {}, removed: [] });
  const settings = { power_user: { a: 1 }, extension_settings: { 'story-orchestrator': { settings: { judge: { enabled: true, uses: { director: true } }, extraction: { cadence: 2 } }, v2Stories: [1] } } };
  const off = withJudgeEnabled(settings, false);
  assert.equal(judgeEnabledIn(off), false);
  assert.deepEqual((off.extension_settings as any)['story-orchestrator'].settings.judge.uses, { director: true });
  assert.deepEqual((off.extension_settings as any)['story-orchestrator'].v2Stories, [1]);
  assert.deepEqual((off.extension_settings as any)['story-orchestrator'].settings.extraction, { cadence: 2 });
  assert.equal(judgeEnabledIn(withJudgeEnabled({}, true)), true);
  assert.equal(judgeEnabledIn({}), true, 'an unset judge.enabled reads as its default (on)');
  assert.throws(() => withJudgeEnabled(null, true), /not an object/);
});
