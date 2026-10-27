import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBlindPack, directorFile, FROZEN_DIRECTOR, frozenDirector, imageFileName, lookFor, parsePilotCases, pilotJobs, PILOT_ARMS, type PilotRow } from './imagePilot.mts';

const cases = parsePilotCases(JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../test/fixtures/image-pilot/cases.json'), 'utf8')));

test('the frozen pilot is 12 cases: 8 single, 4 pairs, a changed outfit and every member ending its own case', () => {
  assert.equal(cases.cases.length, 12);
  assert.equal(cases.cases.filter((row) => row.members.length === 2).length, 4);
  assert.ok(cases.cases.some((row) => row.set?.ash_outfit));
  assert.throws(() => parsePilotCases({ ...cases, cases: cases.cases.slice(1) }), /expected 12 frozen cases/);
  const bad = structuredClone(cases);
  bad.cases[0].lines = [['player', 'only the player speaks']];
  assert.throws(() => parsePilotCases(bad), /last line must be a reply by a member/);
});

test('12 cases x 2 seeds x 2 arms schedules 48 renders; there is no composite arm yet', () => {
  assert.deepEqual([...PILOT_ARMS], ['sdxl-directed', 'qwen-refs']);
  const { jobs } = pilotJobs(cases.cases, [101, 202], [...PILOT_ARMS]);
  assert.equal(jobs.length, 48);
  assert.deepEqual([...new Set(jobs.map((job) => job.arm))].sort(), ['qwen-refs', 'sdxl-directed']);
  assert.equal(pilotJobs(cases.cases, [1], ['sdxl-directed']).jobs.length, 12);
  assert.equal(imageFileName(jobs[0]), 'c01-ash-stove-close-s101-sdxl-directed.png');
  assert.equal(lookFor(cases.cases.find((row) => row.id.startsWith('c04'))!, 'ash', cases.looks), 'coat');
  assert.equal(lookFor(cases.cases[0], 'ash', cases.looks), 'default');
});

test('one director answer per case is frozen and shared; a case without one is refused, not drawn on a live director', () => {
  const reply = { caption: 'x', prompt: '1girl, solo, kettle on the stove', visible: ['Ash'], instruction: 'Ash lifts the kettle.' };
  const frozen = frozenDirector('c01', { reply, promptSource: 'directed', directorIssue: null, routeReason: 'references-ready' }, 'now');
  assert.deepEqual(frozen, { case: 'c01', at: 'now', reply, promptSource: 'directed', directorIssue: null, routeReason: 'references-ready' });
  assert.equal(directorFile('c01'), 'director/c01.json');
  assert.throws(() => frozenDirector('c02', { reply: null, promptSource: 'degraded', directorIssue: 'busy' }, 'now'), /c02: the image director gave no answer to freeze \(prompt source degraded, busy\)/);
  assert.throws(() => frozenDirector('c03', null, 'now'), /c03: .*both arms need one shared answer/);
});

test('the blind pack hides the arm, shuffles deterministically, adds hidden duplicates and keeps the key outside', () => {
  const { jobs } = pilotJobs(cases.cases, [101, 202], ['sdxl-directed', 'qwen-refs']);
  const rows: PilotRow[] = jobs.map((job, index) => {
    const row = cases.cases.find((entry) => entry.id === job.case)!;
    return { ...job, file: index === 5 ? null : `C:/out/images/${imageFileName(job)}`, error: index === 5 ? 'No picture was drawn' : null, ms: 1, members: row.members,
      moment: row.moment, record: { route: { name: job.arm === 'qwen-refs' ? 'qwen' : 'sdxl', reason: 'x' } }, director: directorFile(job.case),
      looks: Object.fromEntries(row.members.map((member) => [member, lookFor(row, member, cases.looks)])) };
  });
  const refs = [{ member: 'ash', look: 'default', file: 'a.png' }, { member: 'ash', look: 'coat', file: 'a2.png' }, { member: 'bram', look: 'default', file: 'b.png' },
    { member: 'cleo', look: 'default', file: 'c.png' }];
  const input = { rows, refs, seed: 'pilot', frozen: cases.frozen, names: { ash: 'SO-P41 Ash', bram: 'SO-P41 Bram', cleo: 'SO-P41 Cleo' } };
  const pack = buildBlindPack(input);
  assert.equal(pack.missing.length, 1);
  assert.equal(pack.items.filter((item) => item.duplicateOf).length, 5);
  assert.equal(pack.items.length, 52);
  assert.deepEqual(pack.items.map((item) => item.label), buildBlindPack(input).items.map((item) => item.label));
  assert.notDeepEqual(pack.items.map((item) => item.row.case), rows.filter((row) => row.file).map((row) => row.case));
  const shown = `${pack.itemsTxt}\n${pack.brief}`;
  assert.doesNotMatch(shown, /sdxl|qwen|composite|s101|s202|c0\d-/i);
  assert.match(pack.itemsTxt, /ref-B \(changed look\)/);
  assert.match(pack.brief, /ref-B\.png` = SO-P41 Ash in a changed look \(coat\)/);
  assert.equal(pack.key.items.length, 52);
  assert.equal(pack.key.director, FROZEN_DIRECTOR);
  assert.ok(pack.key.items.every((item) => item.arm && item.case && item.director === `director/${String(item.case)}.json`));
  assert.doesNotMatch(shown, /director\//);
});
