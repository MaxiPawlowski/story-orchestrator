import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateByConfig, buildModelPack, contextExcerpt, judgePrompt, keySha256, LETTERS, modelPackLeaks, parseGemmaTurns, parseJudgeReply, ratingSheet, renderPackMarkdown, shuffleLetters,
  type ReplyRow,
} from './modelBlindPack.mts';
import { readme, unsealedMarkdown } from '../so-model-blind.mts';

const CONFIGS = ['BL0-v11-prod-asis', 'BL1-v11-tc-minpfirst', 'BL2-v12-tc-minpfirst', 'BL3-cydonia-q5-mistral-minpfirst'];

const prompt = (speaker: string, lastUser: string) => [
  '<|turn>system\nImpersonate X. Do not write what Max Nightriver does. Do not write what Max Nightriver says.\nObjective: Take a posting.\nDirection for Tobias only: he suspects the worst.<turn|>',
  '<|turn>user\nMax Nightriver: Example question?<turn|>',
  '<|turn>model\nTobias: Example answer.<turn|>',
  '<|turn>system\nCurrent state:\nlong state block<turn|>',
  '<|turn>model\nAdolion Narrator: The hall is loud.\nWhat do you do?<turn|>',
  '<|turn>system\n[Scene: hall. Present: Tobias.]<turn|>',
  `<|turn>user\n${lastUser}<turn|>`,
  `<|turn>model\n<|channel>thought\n<channel|>${speaker}:`,
].join('\n');

const reply = (arm: string, body: string, text: string, stop = 'eos'): ReplyRow => ({ arm, body, text, stop_type: stop });

const replies = (bodies: string[]) => bodies.flatMap((body) => CONFIGS.map((arm, at) => reply(arm, body, ` answer ${Number(body.slice(1))}-${at}, plain prose.`, at === 0 && body === 'b02' ? 'limit' : 'eos')));

test('parse: Gemma turns, examples skipped, the open model turn names the speaker (thought channel stripped)', () => {
  const turns = parseGemmaTurns(prompt('Tobias', 'What pays?'));
  assert.deepEqual(turns.map((turn) => turn.role), ['system', 'user', 'model', 'system', 'model', 'system', 'user', 'model']);
  const excerpt = contextExcerpt(prompt('Tobias', 'What pays?'));
  assert.equal(excerpt.speaker, 'Tobias');
  assert.deepEqual(excerpt.context, [{ who: 'Adolion Narrator', text: 'The hall is loud.\nWhat do you do?' }, { who: 'Player', text: 'What pays?' }]);
  assert.deepEqual(excerpt.situation, ['Objective: Take a posting.', 'Direction for Tobias only: he suspects the worst.', '[Scene: hall. Present: Tobias.]']);
  assert.throws(() => contextExcerpt('<|turn>system\nx<turn|>\n<|turn>user\nhi<turn|>'), /open model turn/);
});

test('parse: a long turn keeps its head and tail with the cut stated', () => {
  const long = `start ${'The air is still.\n'.repeat(400)}end`;
  const excerpt = contextExcerpt(prompt('Kanna', long), { maxChars: 600 });
  const text = excerpt.context[excerpt.context.length - 1].text;
  assert.ok(text.startsWith('start'));
  assert.ok(text.endsWith('end'));
  assert.match(text, /characters left out/);
});

test('shuffle: deterministic per seed and turn, independent across turns, every config once', () => {
  const a = shuffleLetters(CONFIGS, 's1', 'T01');
  assert.deepEqual(a, shuffleLetters([...CONFIGS].reverse(), 's1', 'T01'));
  assert.deepEqual(Object.values(a).sort(), [...CONFIGS].sort());
  const orders = new Set(Array.from({ length: 20 }, (_, at) => JSON.stringify(shuffleLetters(CONFIGS, 's1', `T${at}`))));
  assert.ok(orders.size > 5, `only ${orders.size} distinct orders`);
  assert.notDeepEqual(shuffleLetters(CONFIGS, 's1', 'T01'), shuffleLetters(CONFIGS, 's2', 'T01'));
  assert.throws(() => shuffleLetters(CONFIGS.slice(1), 's', 'T'), /exactly 4/);
});

test('build: the pack holds context and lettered replies only; the key maps every letter back; nothing leaks', () => {
  const bodies = ['b02', 'b01'].map((body) => ({ body, prompt: prompt('Tobias', `question ${Number(body.slice(1))}`) }));
  const { pack, key } = buildModelPack({ seed: 'abc', bodies, replies: replies(['b01', 'b02']) });
  assert.deepEqual(pack.turns.map((turn) => turn.id), ['T01', 'T02']);
  assert.deepEqual(key.turns.T01.source, 'b01');
  assert.equal(key.seed, 'abc');
  assert.ok(!('seed' in pack));
  for (const turn of pack.turns) {
    const letters = key.turns[turn.id].letters;
    for (const letter of LETTERS) assert.equal(turn.replies[letter].text, `answer ${Number(key.turns[turn.id].source.slice(1))}-${CONFIGS.indexOf(letters[letter])}, plain prose.`);
  }
  const cut = LETTERS.find((letter) => key.turns.T02.letters[letter] === CONFIGS[0])!;
  assert.equal(pack.turns[1].replies[cut].cutOff, true);
  assert.deepEqual(modelPackLeaks(pack, key), []);
  const sheet = ratingSheet(pack).trim().split('\n');
  assert.equal(sheet.length, 1 + 2 * 4);
  assert.equal(sheet[0], 'turn,reply,coherence_1to5,prose_1to5,scene_1to5,agency_1to5,overall_1to5,rank_1to4,note');
  const md = renderPackMarkdown(pack);
  assert.match(md, /## T02 — reply as \*\*Tobias\*\*/);
  assert.match(md, /cut off at the length limit/);
  for (const config of CONFIGS) assert.ok(!md.includes(config));
});

test('build: reasoning rides folded under its reply, is never sent to the judge, and is leak-checked', () => {
  const bodies = [{ body: 'b01', prompt: prompt('Tobias', 'question 1') }];
  const rows = replies(['b01']).map((row, at) => (at === 1 ? { ...row, reasoning: ' He wants the fee first. ' } : row));
  const { pack, key } = buildModelPack({ seed: 'r', bodies, replies: rows });
  const letter = LETTERS.find((candidate) => key.turns.T01.letters[candidate] === CONFIGS[1])!;
  assert.equal(pack.turns[0].replies[letter].reasoning, 'He wants the fee first.');
  for (const other of LETTERS.filter((candidate) => candidate !== letter)) assert.ok(!('reasoning' in pack.turns[0].replies[other]));
  assert.deepEqual(modelPackLeaks(pack, key), []);
  assert.match(renderPackMarkdown(pack), /<details><summary>Reasoning written before this reply \(not rated\)<\/summary>[\s\S]*He wants the fee first\./);
  assert.ok(!judgePrompt(pack.turns[0]).includes('He wants the fee first'));
  const leaky = structuredClone(pack);
  leaky.turns[0].replies[letter].reasoning = 'Plan: <think> close it';
  assert.match(modelPackLeaks(leaky, key).join(' | '), /reasoning carries a config or template marker/);
  assert.match(readme(pack, 'x'.repeat(64), 4, 'the thinking A/B'), /from the thinking A\/B[\s\S]*Some setups think before they answer/);
  assert.doesNotMatch(readme(buildModelPack({ seed: 'r', bodies, replies: replies(['b01']) }).pack, 'x'.repeat(64), 4), /Some setups think/);
});

test('build refuses a turn without exactly one reply per config', () => {
  const rows = replies(['b01']).slice(1);
  assert.throws(() => buildModelPack({ seed: 's', bodies: [{ body: 'b01', prompt: prompt('Tobias', 'q') }, { body: 'b02', prompt: prompt('Tobias', 'q') }], replies: [...rows, ...replies(['b02'])] }), /b01: needs exactly one reply per config/);
});

test('leaks: a config name, a source id, a template marker or an extra field is named', () => {
  const { pack, key } = buildModelPack({ seed: 's', bodies: [{ body: 'b01', prompt: prompt('Tobias', 'q') }], replies: replies(['b01']) });
  const tampered = JSON.parse(JSON.stringify(pack));
  tampered.turns[0].replies.A.text = 'Artemis says <channel|> hi';
  tampered.turns[0].replies.B.config = 'x';
  tampered.turns[0].context.push({ who: 'Player', text: 'see b01-gemma.json' });
  const leaks = modelPackLeaks(tampered, key);
  assert.ok(leaks.some((leak) => /T01 A: the reply text carries/.test(leak)));
  assert.ok(leaks.some((leak) => /T01 B: a reply carries more/.test(leak)));
  assert.ok(leaks.some((leak) => /names its source turn b01/.test(leak)));
  tampered.turns[0].replies.C.text = CONFIGS[2];
  assert.ok(modelPackLeaks(tampered, key).some((leak) => leak.includes(`names config ${CONFIGS[2]}`)));
});

test('judge reply parse: strict 1-5 integers on every criterion and a full rank', () => {
  const row = { coherence: 5, prose: 4, scene: 4, agency: 5, overall: 4 };
  const good = `noise {"scores":{"A":${JSON.stringify(row)},"B":${JSON.stringify(row)},"C":${JSON.stringify(row)},"D":${JSON.stringify(row)}},"rank":["C","A","D","B"],"why":"x"} trailing`;
  const parsed = parseJudgeReply(good);
  assert.ok(!('problem' in parsed));
  if (!('problem' in parsed)) assert.deepEqual(parsed.rank, ['C', 'A', 'D', 'B']);
  assert.match((parseJudgeReply(good.replace('"rank":["C","A","D","B"]', '"rank":["C","A","A","B"]')) as any).problem, /rank/);
  assert.match((parseJudgeReply(good.replace('"coherence":5', '"coherence":6')) as any).problem, /A.coherence/);
  assert.match((parseJudgeReply('no json') as any).problem, /no JSON/);
});

test('aggregate: per-config means, mean rank and first places through the key', () => {
  const { pack, key } = buildModelPack({ seed: 's', bodies: ['b01', 'b02'].map((body) => ({ body, prompt: prompt('Tobias', 'q') })), replies: replies(['b01', 'b02']) });
  const judged: Record<string, any> = {};
  for (const turn of pack.turns) {
    const letters = key.turns[turn.id].letters;
    const best = LETTERS.find((letter) => letters[letter] === CONFIGS[2])!;
    const rest = LETTERS.filter((letter) => letter !== best);
    judged[turn.id] = {
      rank: [best, ...rest],
      scores: Object.fromEntries(LETTERS.map((letter) => [letter, { coherence: letter === best ? 5 : 3, prose: 3, scene: 3, agency: 3, overall: letter === best ? 5 : 2 }])),
    };
  }
  const rows = aggregateByConfig(judged, key);
  assert.equal(rows[0].config, CONFIGS[2]);
  assert.deepEqual({ turns: rows[0].turns, meanRank: rows[0].meanRank, first: rows[0].firstPlaces, overall: rows[0].mean.overall }, { turns: 2, meanRank: 1, first: 2, overall: 5 });
  assert.throws(() => aggregateByConfig({ T99: judged.T01 }, key), /T99 is not in the key/);
  assert.match(unsealedMarkdown('m', rows, 2), new RegExp(`Preferred \\(lowest mean rank\\): \\*\\*${CONFIGS[2]}\\*\\*`));
});

test('the judge prompt is blind; the README states the key sha and how to rate', () => {
  const { pack, key } = buildModelPack({ seed: 's', bodies: [{ body: 'b01', prompt: prompt('Tobias', 'q') }], replies: replies(['b01']) });
  const text = judgePrompt(pack.turns[0]);
  for (const config of CONFIGS) assert.ok(!text.includes(config));
  assert.match(text, /=== REPLY D ===/);
  const keyText = JSON.stringify(key);
  const doc = readme(pack, keySha256(keyText), 4);
  assert.ok(doc.includes(keySha256(keyText)));
  assert.match(doc, /rank_1to4/);
  assert.match(doc, /only after rating/);
  assert.equal(keySha256('a\r\nb'), keySha256('a\nb'));
});
