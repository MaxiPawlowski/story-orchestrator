import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidenceRefProblems, findRow, parseEvidence, scoreRow } from './sessionRubric.mts';
import { rubricProblems, rubricTemplate, USER_REVIEW } from './sessionCharters.mts';
import { findCard, loadCards, parseScoreArgs, scoreCommand } from '../so-session.mts';

async function sessionDir() {
  const dir = await mkdtemp(join(tmpdir(), 'so-rubric-'));
  await writeFile(join(dir, 'turns.jsonl'), '{"seq":1}\n{"seq":2}\n', 'utf-8');
  await mkdir(join(dir, 'shots'));
  await writeFile(join(dir, 'shots', '001-hud.png'), 'png', 'utf-8');
  return dir;
}

test('rubric: a score needs a note and evidence that really exists in the session dir', async () => {
  const dir = await sessionDir();
  const rubric = rubricTemplate(findCard(await loadCards(), 'T1-2'));
  const scored = scoreRow(rubric, dir, { row: 'agency', score: 'works', note: 'refusal answered once', evidence: ['turns.jsonl:2', 'shots/001-hud.png'], at: 'T' });
  assert.deepEqual({ score: scored.row.score, scoredBy: scored.row.scoredBy, evidence: scored.row.evidence }, { score: 'works', scoredBy: 'claude', evidence: ['turns.jsonl:2', 'shots/001-hud.png'] });
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'works', note: 'x', evidence: ['turns.jsonl:9'] }), /line 9 is outside the file/);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'works', note: 'x', evidence: ['journal.jsonl:1'] }), /no such file/);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'works', note: 'x', evidence: ['turns.jsonl'] }), /cite a line/);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'works', note: 'x', evidence: ['../outside.json:1'] }), /inside the session dir/);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'works', note: '', evidence: ['turns.jsonl:1'] }), /needs a note/);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'works', note: 'x', evidence: [] }), /at least one --evidence/);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: 'great', note: 'x', evidence: ['turns.jsonl:1'] }), /score must be one of/);
});

test('rubric: rows recorded for the user\'s review take a note and evidence but never a score from Claude', async () => {
  const dir = await sessionDir();
  const card = findCard(await loadCards(), 'T2-1');
  const rubric = rubricTemplate(card);
  const userRow = rubric.rows.findIndex((row: any) => row.reviewer === 'user');
  assert.ok(userRow >= 0);
  assert.equal(rubric.rows[userRow].status, USER_REVIEW);
  assert.throws(() => scoreRow(rubric, dir, { row: String(userRow), score: 'works', note: 'x', evidence: ['turns.jsonl:1'] }), /recorded for the user's review/);
  const recorded = scoreRow(rubric, dir, { row: String(userRow), score: null, note: 'chapter texts kept', evidence: ['turns.jsonl:1'], record: true });
  assert.equal(recorded.row.score, null);
  assert.equal(recorded.row.recordedBy, 'claude');
  assert.equal(rubricProblems(recorded.rubric).some((problem) => problem.startsWith(`row ${userRow}`)), false);
  assert.throws(() => scoreRow(rubric, dir, { row: '0', score: null, note: 'x', evidence: ['turns.jsonl:1'], record: true }), /scored by Claude/);
});

test('rubric: rows are found by number, exact or unique partial feature name', async () => {
  const rubric = rubricTemplate(findCard(await loadCards(), 'T1-2'));
  assert.equal(findRow(rubric, '2'), 2);
  assert.equal(findRow(rubric, 'HUD'), 4);
  assert.throws(() => findRow(rubric, 'zzz'), /no rubric row matches/);
  assert.throws(() => findRow(rubric, '99'), /no row 99/);
  assert.deepEqual(parseEvidence('C:/x.png'), { raw: 'C:/x.png', path: 'C:/x.png', line: null });
  assert.deepEqual(evidenceRefProblems('/nowhere', parseEvidence('/abs.json:1')), ['/abs.json:1: evidence must be a path inside the session dir']);
});

test('score command: writes the scored row into rubric.json', async () => {
  const dir = await sessionDir();
  await writeFile(join(dir, 'rubric.json'), JSON.stringify(rubricTemplate(findCard(await loadCards(), 'T1-2'))), 'utf-8');
  const result = await scoreCommand(dir, ['HUD', 'annoying', 'the checkpoint changed a turn late', '--evidence', 'turns.jsonl:1'], 'T');
  assert.equal(result.feature, 'HUD');
  const written = JSON.parse(await readFile(join(dir, 'rubric.json'), 'utf-8'));
  assert.deepEqual({ score: written.rows[4].score, note: written.rows[4].note, evidence: written.rows[4].evidence, scoredAt: written.rows[4].scoredAt }, { score: 'annoying', note: 'the checkpoint changed a turn late', evidence: ['turns.jsonl:1'], scoredAt: 'T' });
  assert.equal(result.open.length, 4);
});

test('T1 score: every evidence path is kept, after one --evidence, a repeated --evidence or a comma list', async () => {
  assert.deepEqual(parseScoreArgs(['HUD', 'works', 'note', '--evidence', 'turns.jsonl:1', 'shots/001-hud.png']).evidence, ['turns.jsonl:1', 'shots/001-hud.png']);
  assert.deepEqual(parseScoreArgs(['HUD', 'works', 'note', '--evidence', 'turns.jsonl:1', '--evidence', 'turns.jsonl:2']).evidence, ['turns.jsonl:1', 'turns.jsonl:2']);
  assert.deepEqual(parseScoreArgs(['HUD', 'works', 'note', '--evidence', 'turns.jsonl:1,shots/001-hud.png']).evidence, ['turns.jsonl:1', 'shots/001-hud.png']);
  assert.deepEqual(parseScoreArgs(['HUD', '--record', 'seen twice', '--evidence', 'turns.jsonl:2']), { row: 'HUD', score: null, note: 'seen twice', evidence: ['turns.jsonl:2'], record: true, provisional: false, extra: [] });
  assert.deepEqual(parseScoreArgs(['HUD', 'works', 'a note with spaces', 'stray']).extra, ['stray']);
  const dir = await sessionDir();
  await writeFile(join(dir, 'rubric.json'), JSON.stringify(rubricTemplate(findCard(await loadCards(), 'T1-2'))), 'utf-8');
  await scoreCommand(dir, ['HUD', 'works', 'chips readable', '--evidence', 'turns.jsonl:1', 'shots/001-hud.png', '--evidence', 'turns.jsonl:2'], 'T');
  const written = JSON.parse(await readFile(join(dir, 'rubric.json'), 'utf-8'));
  assert.deepEqual(written.rows[4].evidence, ['turns.jsonl:1', 'shots/001-hud.png', 'turns.jsonl:2']);
  await assert.rejects(scoreCommand(dir, ['HUD', 'works', 'chips', 'readable', '--evidence', 'turns.jsonl:1'], 'T'), /unexpected argument\(s\) "readable"/);
});

test('T4-3 score: a JSON evidence file can be cited whole; a .jsonl or text file still needs its line', async () => {
  const dir = await sessionDir();
  await mkdir(join(dir, 'evidence'));
  await writeFile(join(dir, 'evidence', '2026-10-02T05-59-59-216Z_st-eval.json'), '{"kept":true}', 'utf-8');
  const rubric = rubricTemplate(findCard(await loadCards(), 'T4-3'));
  const scored = scoreRow(rubric, dir, { row: 'keep', score: 'works', note: 'the book stayed', evidence: ['evidence/2026-10-02T05-59-59-216Z_st-eval.json'], at: 'T' });
  assert.deepEqual(scored.row.evidence, ['evidence/2026-10-02T05-59-59-216Z_st-eval.json']);
  assert.deepEqual(parseScoreArgs(['1', 'works', 'kept', '--evidence', 'evidence/2026-10-02T05-59-59-216Z_st-eval.json']).evidence, ['evidence/2026-10-02T05-59-59-216Z_st-eval.json']);
  assert.throws(() => scoreRow(rubric, dir, { row: 'keep', score: 'works', note: 'x', evidence: ['turns.jsonl'] }), /cite a line/);
  assert.throws(() => scoreRow(rubric, dir, { row: 'keep', score: 'works', note: 'x', evidence: ['evidence/missing.json'] }), /no such file/);
});
