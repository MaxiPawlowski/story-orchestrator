import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHOR_VIEW_STEP, laneOf, membersToEnable, notRunnableLine, requiredGroup, requiresOf, requiresProblems, validateRequires, withAuthorView } from './lib/scenarioRequires.mts';
import { evalSyntaxProblems, validateFixture, validateSteps } from './lib/scenarioSchema.mts';
import { judgeEnabledIn, stripModelSecrets, withJudgeEnabled } from './lib/laneModel.mts';

const toy = { groupId: '1759606632088', groupName: 'Group: Arin, DM Narrator', members: [{ name: 'Luke', avatar: 'Luke.png', disabled: true }, { name: 'Arin', avatar: 'Arin.png', disabled: false }] };

test('requires is part of the closed vocabulary: unknown keys, bad values and empty objects are refused', () => {
  assert.deepEqual(validateRequires(undefined), []);
  assert.deepEqual(validateRequires({ lane: 'no-model', group: '1759606632088', members: ['Luke'], authorView: true, judge: 'off', why: 'x' }), []);
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
  assert.deepEqual(requiredGroup({ group: "Adolion - The Adventurer's Road" }, '1759606632088'), { group: "Adolion - The Adventurer's Road", overridden: true });
  assert.deepEqual(requiredGroup({ group: '1759606632088' }, '1759606632088'), { group: '1759606632088', overridden: false });
  assert.deepEqual(requiredGroup({}, '1759606632088'), { group: '1759606632088', overridden: false });
  assert.deepEqual(requiredGroup({}, null), { group: null, overridden: false });
  assert.deepEqual(requiresOf({ requires: { lane: 'model' } }), { lane: 'model' });
  assert.deepEqual(requiresOf([]), {});
});

test('a disabled required member is re-enabled; an absent one is a problem the runner cannot fix', () => {
  assert.deepEqual(membersToEnable({ group: '1759606632088', members: ['luke'] }, toy), ['Luke.png']);
  assert.deepEqual(membersToEnable({ group: '1759606632088', members: ['Arin'] }, toy), []);
  assert.match(requiresProblems({ group: '1759606632088', members: ['Tobias'] }, toy).join(), /needs Tobias in the group/);
  assert.match(requiresProblems({ group: '1759606632088', members: ['Luke'] }, toy).join(), /still disabled/);
  assert.deepEqual(requiresProblems({ group: '1759606632088', members: ['Luke'] }, { ...toy, members: [{ ...toy.members[0], disabled: false }] }), []);
});

test('group is matched by id or by exact name, and a wrong group is named', () => {
  assert.deepEqual(requiresProblems({ group: 'group: arin, dm narrator' }, toy), []);
  assert.match(requiresProblems({ group: "Adolion - The Adventurer's Road" }, toy).join(), /the open group is "Group: Arin, DM Narrator"/);
  assert.match(requiresProblems({ group: 'x' }, {}).join(), /the open group is none/);
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
  assert.equal(judgeEnabledIn({}), null);
  assert.throws(() => withJudgeEnabled(null, true), /not an object/);
});
