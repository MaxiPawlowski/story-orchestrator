import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import {
  artifactInventory, artifactProblems, artifactWaivers, comfyCalls, featureProblems, HARVEST_HEADER, HARVEST_WAIVED, overlayDisablesThinking, newChats, requiredArtifacts, requiredFeatures, runtimeProblems, storyFeatures, trackChat, type ChatRef,
} from './sessionArtifacts.mts';
import { findCard, loadCards, loadIndex } from '../so-session.mts';

test('AS-11 preflight: the harvest header the digest looks for is the one the product sends', () => {
  const source = readFileSync(resolve(REPO_ROOT, 'src', 'memory', 'innerRender.ts'), 'utf-8');
  assert.ok(source.includes(`export const HARVEST_HEADER = ${JSON.stringify(HARVEST_HEADER)};`));
});

test('AS-11 preflight: story features are counted from the story JSON', () => {
  const raw = {
    chapters: [{ id: 'c1' }, { id: 'c2' }],
    checkpoints: [{ id: 'a', chapter: 'c1', motives: { Kela: 'x', Ced: 'y' }, guidance: { members: { Kela: 'g' } } }, { id: 'b', guidance: 'plain' }],
    roster: [{ id: 'kela', drive: 'revenge' }, { id: 'ced', view: 'omniscient' }],
  };
  assert.deepEqual(storyFeatures(raw), { chapters: 2, chapterAssignments: 1, drives: 1, motives: 2, memberGuidance: 1, omniscient: 1 });
  assert.deepEqual(storyFeatures({}), { chapters: 0, chapterAssignments: 0, drives: 0, motives: 0, memberGuidance: 0, omniscient: 0 });
});

test('AS-11 preflight: a chapter card is refused on a story without chapters, whatever the asset counts say', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  const card = findCard(doc, 'T2-1');
  assert.ok(requiredFeatures(doc, card).includes('chapters'));
  assert.ok(requiredFeatures(doc, findCard(doc, 'T2-3')).includes('chapters'), 'a continuation inherits the chapter settings of its root');
  const zero = { ...index, stories: { ...index.stories, [card.story.id!]: { ...index.stories[card.story.id!], features: storyFeatures({}) } } };
  assert.ok(featureProblems(doc, card, zero).some((line) => line.includes('has no chapters')));
  const bare = { ...index, stories: { ...index.stories, [card.story.id!]: { ...index.stories[card.story.id!], features: undefined } } };
  assert.match(featureProblems(doc, card, bare)[0], /no feature data/);
  const full = { ...index, stories: { ...index.stories, [card.story.id!]: { ...index.stories[card.story.id!], features: { chapters: 4, chapterAssignments: 20, drives: 3, motives: 9, memberGuidance: 2, omniscient: 1 } } } };
  assert.deepEqual(featureProblems(doc, card, full), []);
  assert.deepEqual(featureProblems(doc, findCard(doc, 'T0-1'), zero), [], 'a card that exercises no feature data needs none');
});

test('AS-22/23 artifacts: required counts come from the card and its effective settings', async () => {
  const doc = await loadCards();
  assert.deepEqual(requiredArtifacts(doc, findCard(doc, 'T0-1')), { turns: 1, chats: 1 });
  const t21 = requiredArtifacts(doc, findCard(doc, 'T2-1'));
  assert.equal(t21.chapterRecords, 1);
  assert.equal(t21.ratingCandidates, 1);
  assert.equal(requiredArtifacts(doc, findCard(doc, 'T5-1')).wizardDrafts, 1);
});

test('AS-22/23 artifacts: the inventory counts what was observed, and a shortfall is named', () => {
  const blob = { selectedStoryId: 's', stories: { s: { extras: { memory: { chapters: [{}, {}] } } } } };
  const inventory = artifactInventory({
    turns: [{ kind: 'turn', ok: true, observe: { folded: 3 } }, { kind: 'turn', ok: false }, { kind: 'flag', landed: true }, { kind: 'turn', ok: true, arm: 'beat' }],
    payloads: [{ body: JSON.stringify({ messages: [{ content: `${HARVEST_HEADER}\nKela: wants out` }] }) }, { body: '{"prompt":"x"}' }],
    runtimes: { c1: blob }, shots: 2, wizardDrafts: 0,
  });
  assert.deepEqual(inventory, { turns: 2, flags: 1, shots: 2, chats: 1, chapterRecords: 2, foldedTurns: 1, harvestedReasoning: 1, ratingCandidates: 1, wizardDrafts: 0 });
  assert.deepEqual(artifactProblems({ turns: 2, chats: 2, wizardDrafts: 1 }, inventory), [
    'required artifact chats: 1 captured, the card needs at least 2',
    'required artifact wizardDrafts: 0 captured, the card needs at least 1',
  ]);
});

test('AS-23 runtime export: engine history, the effect ledger and the chapter store must be in the persisted runtime', () => {
  const full = { selectedStoryId: 's', stories: { s: { engineState: {}, engineHistory: {}, pinnedStory: {}, extras: { effects: { ledger: [] }, memory: { chapters: [] } } } } };
  assert.deepEqual(runtimeProblems('c1', full, { story: true, chapters: true }), []);
  const thin = { selectedStoryId: 's', stories: { s: { engineState: {}, pinnedStory: {}, extras: { memory: {} } } } };
  const problems = runtimeProblems('c1', thin, { story: true, chapters: true });
  assert.equal(problems.length, 3);
  assert.match(runtimeProblems('c1', null, { story: true, chapters: false })[0], /absent/);
  assert.deepEqual(runtimeProblems('c1', null, { story: false, chapters: false }), []);
});

test('AS-23 chat tracking: visited and created chats join the session, known ones keep their role', () => {
  let chats: ChatRef[] = [{ chatId: 'a', group: 'G', primary: true }];
  chats = trackChat(chats, { chatId: 'a', storyId: 's' }, 'turn');
  assert.deepEqual(chats, [{ chatId: 'a', group: 'G', groupId: null, storyId: 's', primary: true }]);
  chats = trackChat(chats, { chatId: 'b', group: 'G', groupId: 'g1' }, 'switch-chat-mid-gen');
  assert.deepEqual(chats[1], { chatId: 'b', group: 'G', groupId: 'g1', storyId: null, primary: false, how: 'switch-chat-mid-gen' });
  assert.deepEqual(newChats([{ chatId: 'a' }], [{ chatId: 'a' }, { chatId: 'w', group: 'Wizard group' }]), [{ chatId: 'w', group: 'Wizard group' }]);
});

test('AS-27 media guard: any ComfyUI line in the lane log is caught', () => {
  assert.deepEqual(comfyCalls('ok\nPOST http://127.0.0.1:8188/prompt\n/api/sd/comfy/generate 200\nfine'), ['POST http://127.0.0.1:8188/prompt', '/api/sd/comfy/generate 200']);
});

const overlay = (sequence: string, applied = true) => ({
  applied,
  edits: [{ kind: 'instruct', preset: 'Gemma 4', key: 'last_output_sequence', after: sequence, mirrored: true }],
  live: { instruct: { preset: 'Gemma 4', last_output_sequence: sequence } },
});

test('T3-1 waiver: an overlay that prefills an empty thought channel turns the harvest requirement into a recorded warning', async () => {
  const doc = await loadCards();
  const required = requiredArtifacts(doc, findCard(doc, 'T3-1'));
  assert.equal(required.harvestedReasoning, 1);
  const waived = artifactWaivers(required, { presetOverlay: overlay('<|turn>model\n<|channel>thought\n<channel|>') });
  assert.equal(waived.required.harvestedReasoning, undefined);
  assert.equal(waived.required.turns, required.turns);
  assert.deepEqual(waived.warnings, [HARVEST_WAIVED]);
  assert.match(HARVEST_WAIVED, /not applicable: the preset overlay disables thinking/);
  assert.deepEqual(artifactProblems(waived.required, { turns: 5, chats: 1, ratingCandidates: 3, harvestedReasoning: 0 }), []);
});

test('T3-1 waiver: without the overlay, or with thinking left on, the harvest requirement still fails closed', async () => {
  const doc = await loadCards();
  const required = requiredArtifacts(doc, findCard(doc, 'T3-1'));
  const inventory = { turns: 5, chats: 1, ratingCandidates: 3, harvestedReasoning: 0 };
  for (const session of [{}, { presetOverlay: null }, { presetOverlay: overlay('<|turn>model\n<|channel>thought\n<channel|>', false) }, { presetOverlay: overlay('<|turn>model\n') }, { presetOverlay: overlay('<|turn>model\n<|channel>thought\nI think<channel|>') }]) {
    const waived = artifactWaivers(required, session);
    assert.equal(waived.required.harvestedReasoning, 1, JSON.stringify(session));
    assert.deepEqual(waived.warnings, []);
    assert.ok(artifactProblems(waived.required, inventory).some((line) => line.startsWith('required artifact harvestedReasoning: 0 captured')));
  }
  assert.equal(overlayDisablesThinking({ applied: true, edits: [], live: { instruct: { last_output_sequence: '<|channel>thought\r\n<channel|>' } } }), true);
});

test('T3-1 waiver: a card that never asked for harvest is untouched by the overlay', async () => {
  const doc = await loadCards();
  const required = requiredArtifacts(doc, findCard(doc, 'T0-1'));
  assert.deepEqual(artifactWaivers(required, { presetOverlay: overlay('<|turn>model\n<|channel>thought\n<channel|>') }), { required, warnings: [] });
});
