import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSagaCorpus, VARIANTS, type SagaNeedles, type SagaStory } from './lib/sagaCorpus.mts';
import {
  armSettings, assertFrozen, checkBaseline, evaluateFloors, findArm, freezeManifest, loadArmRun, pageHost, RECIPE_PATH, runAsk, runReplay, scoreAnswer, scoreArm,
  type ArmRun, type AskRecord, type ChapterSettingsView, type SagaHost, type SagaManifest, type SagaRecipe,
} from './lib/sagaRecall.mts';

const disk = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const recipe = JSON.parse(disk(RECIPE_PATH)) as SagaRecipe;
const story = JSON.parse(disk(VARIANTS.chaptered.story)) as SagaStory;
const { transcript, needles } = buildSagaCorpus('chaptered');

const memoryFs = (overrides: Record<string, string> = {}) => {
  const files = new Map<string, string>();
  return {
    files,
    read: (file: string) => {
      if (files.has(file)) return files.get(file)!;
      if (file in overrides) return overrides[file];
      return disk(file);
    },
  };
};

const BUILT_KEYS = ['seal', 'storySoFar', 'fold', 'chronicleTokens', 'chapterTokens', 'threadTokens', 'recap', 'dossierWindow'];

function fakeHost({ greeting = 1, groupId = 'g1', chatId = 'chat-1', answers = (prompt: string) => `I do not remember. ${prompt.length}`, builtKeys = BUILT_KEYS, ignoreLeg = false } = {}) {
  const chat: Array<{ isUser: boolean; text: string }> = Array.from({ length: greeting }, () => ({ isUser: false, text: 'greeting' }));
  let settings: ChapterSettingsView = { seal: false, storySoFar: false, fold: false, chronicleTokens: 700, recap: true };
  let active = 'c1';
  let boundary = 0;
  let pendingLeg: number | null = null;
  const log: string[] = [];
  const host: SagaHost = {
    chat: async () => ({ groupId, chatId, length: chat.length }),
    importStory: async () => ({ ok: true, storyId: 'saga-mini' }),
    writeChapterSettings: async (patch) => { settings = { ...settings, ...Object.fromEntries(Object.entries(patch).filter(([key]) => builtKeys.includes(key))) }; },
    readChapterSettings: async () => ({ ...settings }),
    setLeg: async (value) => { log.push(`leg ${value}`); pendingLeg = value; },
    post: async (message) => {
      chat.push({ isUser: message.isUser, text: message.text });
      if (message.isUser) return;
      boundary += 1;
      if (pendingLeg !== null && !ignoreLeg) { active = `c${pendingLeg + 1}`; pendingLeg = null; }
    },
    state: async () => ({ activeCheckpointId: active, boundary, chapterRecords: settings.seal ? Math.max(0, Number(active.slice(1)) - 8) : 0 }),
    settle: async () => { log.push('settle'); },
    ask: async (prompt) => {
      chat.push({ isUser: true, text: prompt });
      const answer = answers(prompt);
      chat.push({ isUser: false, text: answer });
      return { answer, speaker: 'DM Narrator' };
    },
    undoAsk: async () => { chat.splice(chat.length - 2, 2); log.push('undo'); },
  };
  return { host, log, chat, settings: () => settings };
}

const freeze = (armId: string, baseline = armId === 'A0' || armId === 'E0', read = memoryFs().read) => freezeManifest({ arm: findArm(recipe, armId), chronicleTokens: armId === 'A0' ? null : 700, baseline, read, now: () => '2026-10-01T00:00:00.000Z' });

const answerFor = (correctIds: Set<string>) => (prompt: string) => {
  const needle = needles.needles.find((entry) => prompt.endsWith(entry.question))!;
  return correctIds.has(needle.id) ? `It was ${needle.answer}.` : 'I do not remember.';
};

async function playArm(armId: string, correct: Set<string>, extra: Partial<Parameters<typeof fakeHost>[0]> = {}): Promise<ArmRun> {
  const manifest = freeze(armId);
  const fake = fakeHost({ answers: answerFor(correct), ...extra });
  const replay = await runReplay(fake.host, { manifest, story, transcript, narrator: 'DM Narrator' });
  const ask = await runAsk(fake.host, { manifest, replay, needles, recipe, narrator: 'DM Narrator' });
  return { manifest, ask, score: scoreArm(manifest, ask, needles, recipe) };
}

const ids = (chapter: string, count: number) => new Set(needles.needles.filter((needle) => needle.asked && needle.chapter === chapter).slice(0, count).map((needle) => needle.id));
const union = (...sets: Set<string>[]) => new Set(sets.flatMap((set) => [...set]));

test('prepare freezes the four inputs; a changed needles or transcript file makes ask and score refuse', () => {
  const manifest = freeze('A1');
  assert.deepEqual(Object.keys(manifest.files).sort(), ['needles', 'recipe', 'story', 'transcript']);
  assert.doesNotThrow(() => assertFrozen(manifest, memoryFs().read, 'ask'));
  const tamperedNeedles = memoryFs({ [VARIANTS.chaptered.needles]: `${disk(VARIANTS.chaptered.needles)} ` });
  assert.throws(() => assertFrozen(manifest, tamperedNeedles.read, 'ask'), /refusing ask: the frozen inputs changed — needles: test\/measurements\/v2\.6-07\/needles\.json changed since prepare/);
  const tamperedTranscript = memoryFs({ [VARIANTS.chaptered.transcript]: disk(VARIANTS.chaptered.transcript).replace('Brindlemoot', 'Brindlemore') });
  assert.throws(() => assertFrozen(manifest, tamperedTranscript.read, 'score'), /transcript: .* changed since prepare/);
  const run = memoryFs({ [VARIANTS.chaptered.needles]: disk(VARIANTS.chaptered.needles).replace('\\\\bodalys\\\\b', '.') });
  run.files.set('runs/A1/manifest.json', JSON.stringify(manifest));
  run.files.set('runs/A1/answers.json', JSON.stringify({ corpusDigest: manifest.corpusDigest, arm: 'A1', chatId: 'c', checkpoint: 'c11', settings: {}, answers: [] }));
  assert.throws(() => loadArmRun('runs/A1', run.read), /refusing to score runs\/A1: the frozen inputs changed/);
  assert.equal(assertFrozen(manifest, (file) => disk(file).replace(/\r?\n/g, '\r\n'), 'ask'), undefined, 'a CRLF checkout of the same bytes is not a change');
});

test('A0 is prepared only as a baseline, every switch off; a treatment arm cannot pose as the baseline', () => {
  assert.throws(() => freeze('A0', false), /A0 is a baseline arm: prepare it with the baseline command/);
  assert.throws(() => freeze('A1', true), /the baseline of the chaptered corpus is A0, not A1/);
  assert.equal(freeze('A0').baseline, true);
  assert.equal(freeze('E0').variant, 'chapterless');
  assert.notEqual(freeze('E0').corpusDigest, freeze('A0').corpusDigest);
  assert.throws(() => freezeManifest({ arm: { ...findArm(recipe, 'A0'), seal: true }, baseline: true, read: memoryFs().read }), /baseline A0 must have every switch off/);
});

test('replay posts every message, moves the leg at each checkpoint, ends on c11 and records the settings read-back', async () => {
  const manifest = freeze('A1');
  const fake = fakeHost();
  const record = await runReplay(fake.host, { manifest, story, transcript, narrator: 'DM Narrator' });
  assert.equal(record.ok, true, record.drift.join('; '));
  assert.equal(record.posted, 361);
  assert.equal(record.finalCheckpoint, 'c11');
  assert.deepEqual(fake.log.filter((line) => line.startsWith('leg')), ['leg 1', 'leg 2', 'leg 3', 'leg 4', 'leg 5', 'leg 6', 'leg 7', 'leg 8', 'leg 9', 'leg 10']);
  assert.deepEqual(record.transitions.map((row) => row.expected), ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']);
  assert.equal(record.settings?.seal, true);
  assert.equal(record.settings?.storySoFar, true);
  assert.equal(record.settings?.chronicleTokens, 700);
});

test('replay refuses a chat that is not fresh, no open group, and an arm whose switch does not read back', async () => {
  await assert.rejects(runReplay(fakeHost({ greeting: 5 }).host, { manifest: freeze('A1'), story, transcript, narrator: 'N' }), /already holds 5 messages/);
  await assert.rejects(runReplay(fakeHost({ groupId: '' }).host, { manifest: freeze('A1'), story, transcript, narrator: 'N' }), /no group chat is open/);
  await assert.rejects(runReplay(fakeHost().host, { manifest: freeze('A2R'), story, transcript, narrator: 'N' }), /did not read back — recall: wanted true, read back undefined/);
});

test('replay records drift when the engine does not follow, and ask then refuses', async () => {
  const manifest = freeze('A1');
  const fake = fakeHost({ ignoreLeg: true });
  const record = await runReplay(fake.host, { manifest, story, transcript, narrator: 'N' });
  assert.equal(record.ok, false);
  assert.match(record.drift[0], /expected c2, the engine is on c1/);
  await assert.rejects(runAsk(fake.host, { manifest, replay: record, needles, recipe, narrator: 'N' }), /refusing ask: the replay did not end cleanly/);
});

test('ask asks the 30 held questions in a fixed chat, removing each before the next', async () => {
  const run = await playArm('A1', new Set());
  assert.equal(run.ask.answers.length, 30);
  assert.equal(run.ask.checkpoint, 'c11');
  assert.ok(run.ask.answers.every((row) => row.prompt.startsWith('(Out of character')));
  assert.deepEqual(run.ask.answers.map((row) => row.id), needles.needles.filter((needle) => needle.asked).map((needle) => needle.id));
});

test('ask refuses answers recorded against another frozen manifest or another chat', async () => {
  const manifest = freeze('A1');
  const fake = fakeHost();
  const replay = await runReplay(fake.host, { manifest, story, transcript, narrator: 'N' });
  await assert.rejects(runAsk(fake.host, { manifest: { ...manifest, corpusDigest: 'other' }, replay, needles, recipe, narrator: 'N' }), /different frozen manifest/);
  await assert.rejects(runAsk(fakeHost({ chatId: 'chat-2' }).host, { manifest, replay, needles, recipe, narrator: 'N' }), /is not the replayed chat/);
});

test('scoring: a correct answer counts, a planted wrong answer scores 0, another needle\'s answer does not count, a list of answers is shotgun', () => {
  const [n01, n02, n03] = needles.needles;
  assert.equal(scoreAnswer(n01, 'Her name was Odalys Venn.', needles.needles, recipe).verdict, 'correct');
  assert.equal(scoreAnswer(n01, 'Her name was Marta.', needles.needles, recipe).verdict, 'wrong');
  const cross = scoreAnswer(n01, 'The lead camel was Brindlemoot.', needles.needles, recipe);
  assert.deepEqual([cross.verdict, cross.others], ['cross', ['N02']]);
  assert.equal(scoreAnswer(n01, 'Odalys, with Brindlemoot at the head.', needles.needles, recipe).verdict, 'correct', 'one incidental mention is tolerated (shotgunLimit 1)');
  assert.equal(scoreAnswer(n01, 'Odalys, Brindlemoot, marrowfen, eleven.', needles.needles, recipe).verdict, 'shotgun');
  assert.equal(scoreAnswer(n02, "I don't remember.", needles.needles, recipe).verdict, 'abstain');
  assert.equal(scoreAnswer(n03, 'It cost 11 coins.', needles.needles, recipe).verdict, 'correct');
  const ask: AskRecord = { corpusDigest: 'd', arm: 'A1', chatId: 'c', checkpoint: 'c11', settings: {}, answers: [{ id: 'N01', chapter: 'ch1', question: '', prompt: '', answer: 'Marta', speaker: null }] };
  const score = scoreArm({ ...freeze('A1'), corpusDigest: 'd' }, ask, needles, recipe);
  assert.equal(score.rows.find((row) => row.id === 'N01')?.verdict, 'wrong');
  assert.equal(score.recall, 0);
  assert.equal(score.missing.length, 29);
  assert.throws(() => scoreArm(freeze('A1'), ask, needles, recipe), /recorded under a different frozen manifest/);
});

test('the baseline: an A0 run with seal on, from another manifest, or prepared as a treatment is refused', async () => {
  const a0 = await playArm('A0', new Set());
  const a1 = await playArm('A1', ids('ch1', 10));
  assert.deepEqual(checkBaseline(a1, a0), []);
  const sealed: ArmRun = { ...a0, ask: { ...a0.ask, settings: { ...a0.ask.settings, seal: true } } };
  assert.match(checkBaseline(a1, sealed).join(' '), /the baseline ran with seal on/);
  const otherCorpus: ArmRun = { ...a0, manifest: { ...a0.manifest, corpusDigest: 'elsewhere' } };
  assert.match(checkBaseline(a1, otherCorpus).join(' '), /produced from a different frozen manifest/);
  const notBaseline: ArmRun = { ...a0, manifest: { ...a0.manifest, baseline: false } };
  assert.match(checkBaseline(a1, notBaseline).join(' '), /not prepared by the baseline command/);
  const noReadBack: ArmRun = { ...a0, ask: { ...a0.ask, settings: null } };
  assert.match(checkBaseline(a1, noReadBack).join(' '), /no settings read-back/);
});

test('floors are read from the recipe and evaluated on both sides', async () => {
  const a0 = await playArm('A0', ids('ch1', 5));
  const a1Pass = await playArm('A1', union(ids('ch1', 8), ids('ch3', 10)));
  const a1Low = await playArm('A1', union(ids('ch1', 7), ids('ch3', 10)));
  const a2Keeps = await playArm('A2', union(ids('ch1', 8), ids('ch3', 10)));
  const floor = (runs: Record<string, ArmRun>, id: string) => evaluateFloors(recipe, runs).find((row) => row.id === id)!;
  assert.deepEqual([floor({ A0: a0, A1: a1Pass }, 'Q-M1').pass, floor({ A0: a0, A1: a1Pass }, 'Q-M1').values], [true, { A1: 0.8, A0: 0.5, delta: 0.3 }]);
  assert.equal(floor({ A0: a0, A1: a1Low }, 'Q-M1').pass, false);
  assert.match(floor({ A0: a0, A1: a1Low }, 'Q-M1').detail, /A1 0\.7 < 0\.8/);
  const a0High = await playArm('A0', ids('ch1', 6));
  assert.match(floor({ A0: a0High, A1: a1Pass }, 'Q-M1').detail, /A1 - A0 = 0\.2 < 0\.25/);
  assert.equal(floor({ A1: a1Pass, A2: a2Keeps }, 'Q-M4').pass, true);
  const a2Worse = await playArm('A2', union(ids('ch1', 8), ids('ch3', 9)));
  assert.equal(a2Worse.score.byChapter.ch3.recall, 0.9);
  assert.equal(floor({ A1: a1Pass, A2: a2Worse }, 'Q-M4').pass, false, '0.9 is below 1.0 - 0.05');
  assert.equal(floor({ A0: a0 }, 'Q-M1').evaluated, false);
  assert.match(floor({ A0: a0 }, 'Q-M1').detail, /needs arm\(s\) A1/);
  assert.equal(floor({ A0: a0, A1: a1Pass }, 'Q-M2').evaluated, false);
  const foreign: ArmRun = { ...a1Pass, manifest: { ...a1Pass.manifest, corpusDigest: 'x' } };
  assert.match(floor({ A0: a0, A1: foreign }, 'Q-M1').detail, /different frozen manifests/);
});

test('Q-M5 needs +0.10 recall AND no rise in wrong answers; Q-M8 compares the chapterless arms', () => {
  const run = (arm: string, recall: number, wrongRate: number, variant: 'chaptered' | 'chapterless' = 'chaptered'): ArmRun => ({
    manifest: { arm: { id: arm }, corpusDigest: variant, variant } as unknown as SagaManifest,
    ask: {} as AskRecord,
    score: { arm, corpusDigest: variant, asked: 30, answered: 30, recall, wrongRate, byChapter: {}, rows: [], missing: [] },
  });
  const qm5 = (on: ArmRun, off: ArmRun) => evaluateFloors(recipe, { A2R: on, A2: off }).find((row) => row.id === 'Q-M5')!;
  assert.equal(qm5(run('A2R', 0.7, 0.1), run('A2', 0.6, 0.1)).pass, true);
  assert.equal(qm5(run('A2R', 0.7, 0.2), run('A2', 0.6, 0.1)).pass, false);
  assert.equal(qm5(run('A2R', 0.65, 0.1), run('A2', 0.6, 0.1)).pass, false);
  const qm8 = (on: number, off: number) => evaluateFloors(recipe, { E1: run('E1', on, 0, 'chapterless'), E0: run('E0', off, 0, 'chapterless') }).find((row) => row.id === 'Q-M8')!;
  assert.equal(qm8(0.65, 0.5).pass, true);
  assert.equal(qm8(0.6, 0.5).pass, false);
});

test('the arm settings map the recipe switches onto the chapter settings keys', () => {
  assert.deepEqual(armSettings(findArm(recipe, 'A0'), null), { seal: false, storySoFar: false, fold: false });
  assert.deepEqual(armSettings(findArm(recipe, 'A2'), 400), { seal: true, storySoFar: true, fold: true, chronicleTokens: 400 });
  assert.deepEqual(armSettings(findArm(recipe, 'E1'), null), { seal: true, storySoFar: true, fold: false, eraSeals: true });
});

test('pageHost drives ST through slash commands on the page it is given', async () => {
  const commands: string[] = [];
  const chat: Array<{ is_user: boolean; mes: string; name: string }> = [];
  let boundary = 0;
  let settings: Record<string, unknown> = { seal: false };
  (globalThis as any).SillyTavern = {
    getContext: () => ({
      groupId: 'g', chatId: 'c', chat,
      executeSlashCommandsWithOptions: async (cmd: string) => {
        commands.push(cmd);
        if (cmd.startsWith('/send ')) chat.push({ is_user: true, mes: cmd.slice(6), name: 'You' });
        if (cmd.startsWith('/sendas ')) { chat.push({ is_user: false, mes: cmd, name: 'DM Narrator' }); boundary += 1; }
        if (cmd.startsWith('/trigger')) { chat.push({ is_user: false, mes: 'It was Odalys.', name: 'DM Narrator' }); boundary += 1; }
        if (cmd === '/del 2') chat.splice(chat.length - 2, 2);
        return { pipe: '' };
      },
    }),
  };
  (globalThis as any).storyOrchestratorRuntime = {
    importStory: async () => true,
    setMemorySettings: (next: { chapters: Record<string, unknown> }) => { settings = next.chapters; },
    getSnapshot: () => ({ storyId: 'saga-mini', activeCheckpointId: 'c11', boundary, chapters: { records: [1, 2] }, memory: { settings: { chapters: settings } }, extraction: { scheduler: { inFlight: false, queueDepth: 0 } } }),
  };
  try {
    const host = pageHost({ evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => undefined }, { settleQuietMs: 0 });
    await host.setLeg(3);
    await host.post({ isUser: false, text: 'The sun drops.' }, 'DM Narrator');
    await host.post({ isUser: true, text: 'I nod.' }, 'DM Narrator');
    await host.writeChapterSettings({ seal: true, storySoFar: true });
    assert.deepEqual(await host.readChapterSettings(), { seal: true, storySoFar: true });
    const reply = await host.ask('(Out of character) What name?', 'DM Narrator');
    assert.deepEqual(reply, { answer: 'It was Odalys.', speaker: 'DM Narrator' });
    await host.undoAsk();
    await host.settle();
    assert.deepEqual(await host.state(), { activeCheckpointId: 'c11', boundary: 2, chapterRecords: 2 });
    assert.deepEqual(commands, ['/cp set leg 3', '/sendas name="DM Narrator" The sun drops.', '/send I nod.', '/send (Out of character) What name?', '/trigger await=true "DM Narrator"', '/del 2']);
    assert.equal(chat.length, 2);
  } finally {
    delete (globalThis as any).SillyTavern;
    delete (globalThis as any).storyOrchestratorRuntime;
  }
});

test('the recipe names the built corpus and pins the driver commands', () => {
  const corpus = recipe.corpus as Record<string, any>;
  for (const file of [corpus.transcript, corpus.needles, corpus.chapterless.story, corpus.chapterless.transcript, corpus.chapterless.needles]) assert.ok(fs.existsSync(path.join(process.cwd(), file)), file);
  assert.equal((JSON.parse(disk(corpus.needles)) as SagaNeedles).needles.length, 40);
  assert.ok(Object.values(recipe.commands as Record<string, string>).every((command) => command.includes('so-saga-recall.mts')));
  assert.deepEqual(recipe.floors.filter((floor) => floor.check).map((floor) => floor.id), ['Q-M1', 'Q-M4', 'Q-M5', 'Q-M8']);
});
