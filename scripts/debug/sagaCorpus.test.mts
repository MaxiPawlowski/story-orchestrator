import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { acceptRegex, buildSagaCorpus, chapterlessStory, checkSagaCorpus, corpusJson, VARIANTS, type SagaStory, type SagaVariant } from './lib/sagaCorpus.mts';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');
const story = JSON.parse(read(VARIANTS.chaptered.story)) as SagaStory;
const storyFor = (variant: SagaVariant) => (variant === 'chaptered' ? story : chapterlessStory(story));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

for (const variant of ['chaptered', 'chapterless'] as SagaVariant[]) {
  test(`${variant}: the committed corpus is exactly the generator's output`, () => {
    const built = buildSagaCorpus(variant);
    assert.equal(read(VARIANTS[variant].transcript), corpusJson(built.transcript));
    assert.equal(read(VARIANTS[variant].needles), corpusJson(built.needles));
    if (variant === 'chapterless') assert.equal(read(VARIANTS[variant].story), corpusJson(chapterlessStory(story)));
  });

  test(`${variant}: every check passes (accept matches its statement, key form once, no filler leak, ids and chapters consistent)`, () => {
    const built = buildSagaCorpus(variant);
    assert.deepEqual(checkSagaCorpus(storyFor(variant), built.transcript, built.needles, variant), []);
    assert.equal(built.transcript.messages.length, variant === 'chaptered' ? 360 : 600);
    assert.equal(built.needles.needles.length, 40);
    assert.equal(built.needles.needles.filter((needle) => needle.asked).length, 30);
  });
}

test('the generator is deterministic', () => {
  assert.deepEqual(buildSagaCorpus('chaptered'), buildSagaCorpus('chaptered'));
});

test('the chaptered needles sit where the story puts their checkpoint', () => {
  const byCheckpoint = new Map(story.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.chapter]));
  for (const needle of buildSagaCorpus('chaptered').needles.needles) assert.equal(needle.chapter, byCheckpoint.get(needle.checkpoint), needle.id);
});

test('negative control: a filler line carrying a needle answer is caught', () => {
  const built = buildSagaCorpus('chaptered');
  const filler = built.transcript.messages.find((message) => !message.needle && !message.isUser)!;
  filler.text = `${filler.text} The camel Brindlemoot snorts.`;
  const problems = checkSagaCorpus(story, built.transcript, built.needles, 'chaptered');
  assert.ok(problems.some((problem) => /N02: filler message matches its accept/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /N02: key form "Brindlemoot" appears 2 times/.test(problem)));
});

test('negative control: an accept that misses its statement, a question that gives the answer away, a wrong chapter', () => {
  const built = buildSagaCorpus('chaptered');
  const needles = clone(built.needles);
  needles.needles[0].accept = '\\bvenom\\b';
  needles.needles[1].question = 'Was the lead camel called Brindlemoot?';
  needles.needles[2].chapter = 'ch2';
  const problems = checkSagaCorpus(story, built.transcript, needles, 'chaptered');
  assert.ok(problems.some((problem) => /N01: accept \\bvenom\\b does not match its statement/.test(problem)));
  assert.ok(problems.some((problem) => /N02: the question gives its own answer away/.test(problem)));
  assert.ok(problems.some((problem) => /N03: chapter ch2 differs/.test(problem)));
});

test('negative control: a message on the wrong checkpoint or chapter, an unsafe character, a moved needle', () => {
  const built = buildSagaCorpus('chaptered');
  const transcript = clone(built.transcript);
  transcript.messages[40].checkpoint = 'c3';
  transcript.messages[42].chapter = 'ch2';
  transcript.messages[44].text = 'He says "hello" | twice';
  const needles = clone(built.needles);
  needles.needles[3].messageId += 2;
  const problems = checkSagaCorpus(story, transcript, needles, 'chaptered');
  assert.ok(problems.some((problem) => /message 40 is on c3, expected c2/.test(problem)));
  assert.ok(problems.some((problem) => /message 42 says chapter ch2, the story puts c2 in ch1/.test(problem)));
  assert.ok(problems.some((problem) => /message 44 carries a character the slash replay cannot post/.test(problem)));
  assert.ok(problems.some((problem) => /N04: message \d+ does not carry its statement/.test(problem)));
});

test('the chapterless story declares no chapters and keeps every checkpoint', () => {
  const derived = chapterlessStory(story);
  assert.equal(derived.chapters, undefined);
  assert.deepEqual(derived.checkpoints.map((entry) => entry.id), story.checkpoints.map((entry) => entry.id));
  assert.ok(derived.checkpoints.every((entry) => entry.chapter === undefined));
  assert.ok(checkSagaCorpus(story, buildSagaCorpus('chapterless').transcript, buildSagaCorpus('chapterless').needles, 'chapterless').some((problem) => /still declares chapters/.test(problem)));
});

test('every accept regex compiles and the 10-per-chapter asked split holds', () => {
  const needles = buildSagaCorpus('chaptered').needles.needles;
  for (const needle of needles) assert.doesNotThrow(() => acceptRegex(needle));
  for (const chapter of ['ch1', 'ch2', 'ch3']) assert.equal(needles.filter((needle) => needle.chapter === chapter && needle.asked).length, 10);
});
