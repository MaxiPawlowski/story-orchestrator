import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { journeyStoryRefs, splitJourneyLorebooks, storyListedBooks } from './journeyLore.mts';

const JOURNEYS = resolve(REPO_ROOT, 'test', 'journeys');
const journey = (name: string) => JSON.parse(readFileSync(resolve(JOURNEYS, `${name}.journey.json`), 'utf-8'));
const fileStories = (refs: { files: string[] }) => refs.files.map((file) => JSON.parse(readFileSync(resolve(JOURNEYS, file), 'utf-8')));

test('story-scoped lore: every sun-ruins journey asks only for the book its story lists, so setup selects nothing globally', () => {
  for (const name of ['j1-first-contact', 'j3-player-session', 'j6-mutation-storm', 'j7-long-haul']) {
    const doc = journey(name);
    const refs = journeyStoryRefs(doc);
    assert.ok(refs.files.some((file) => file.endsWith('quest-for-the-sun-ruins.json')), name);
    const split = splitJourneyLorebooks(doc.setup.activateLorebooks, storyListedBooks([...fileStories(refs), ...refs.inline]));
    assert.deepEqual(split, { global: [], storyScoped: ['Xentar Checkpoints'] }, name);
  }
});

test('story-scoped lore: J12 selects a library story, whose requirements cover all three Adolion books', () => {
  const doc = journey('j12-unaided-schedule');
  const refs = journeyStoryRefs(doc);
  assert.deepEqual(refs.selected, ['adolion-adventurer']);
  const library = { id: 'adolion-adventurer', requirements: { lorebooks: ['Adolion World', 'Adolion Adventurer Checkpoints', 'Adolion Chronicle'] } };
  assert.deepEqual(splitJourneyLorebooks(doc.setup.activateLorebooks, storyListedBooks([library])).global, []);
  assert.deepEqual(splitJourneyLorebooks(doc.setup.activateLorebooks, storyListedBooks([])).global, doc.setup.activateLorebooks, 'a story missing from the library leaves the books to the old global path');
});

test('story-scoped lore: a book no story lists is still activated globally; names match the way the product keys books', () => {
  const listed = storyListedBooks([{ requirements: { lorebooks: ['Xentar Checkpoints', ' xentar checkpoints ', 7] } }, { requirements: {} }, null]);
  assert.deepEqual(listed, ['Xentar Checkpoints']);
  assert.deepEqual(splitJourneyLorebooks(['xentar checkpoints', 'Shared Atlas', '', 3], listed), { global: ['Shared Atlas'], storyScoped: ['xentar checkpoints'] });
  assert.deepEqual(splitJourneyLorebooks(undefined, listed), { global: [], storyScoped: [] });
  const inline = journeyStoryRefs({ checks: [{ steps: [{ import_story: { title: 'x', requirements: { lorebooks: ['Inline Book'] }, checkpoints: [] } }, { select_story: { id: 'lib' } }, { import_story: 'a.json' }] }] });
  assert.deepEqual({ files: inline.files, selected: inline.selected, listed: storyListedBooks(inline.inline) }, { files: ['a.json'], selected: ['lib'], listed: ['Inline Book'] });
});
