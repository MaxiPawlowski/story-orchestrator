import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { artPlan, CAST_FILE, cardBody, castStory, firstSeedRate, frameJobs, missingArt, parseCast, parseCastBox, validateCast } from './imageCast.mts';
import { requiresOf, validateRequires } from './scenarioRequires.mts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const shipped = JSON.parse(readFileSync(join(ROOT, CAST_FILE), 'utf8'));
const cast = parseCast(shipped);
const scenario = (name: string) => JSON.parse(readFileSync(join(ROOT, 'test/scenarios', name), 'utf8'));

test('the shipped test cast is at least three characters on three variety axes, marker-named', () => {
  assert.deepEqual(validateCast(shipped), []);
  assert.ok(cast.members.length >= 3);
  assert.deepEqual(cast.members.map((member) => member.variety), ['glasses', 'hair over the eyes', 'non-human face']);
  assert.ok(cast.members.every((member) => member.name.startsWith(`${cast.marker} `)));
  assert.ok(cast.group.startsWith(cast.marker));
});

test('controls: a separator in the marker, two characters, a repeated axis and two greeters are refused', () => {
  assert.match(validateCast({ ...shipped, marker: 'SO-IMG' }).join(), /one word/);
  assert.match(validateCast({ ...shipped, members: shipped.members.slice(0, 2) }).join(), /at least 3/);
  assert.match(validateCast({ ...shipped, members: shipped.members.map((member) => ({ ...member, variety: 'glasses' })) }).join(), /variety axes/);
  assert.match(validateCast({ ...shipped, members: shipped.members.map((member) => ({ ...member, first_mes: 'Hi.' })) }).join(), /at most one member greets/);
  assert.match(validateCast({ ...shipped, members: [{ ...shipped.members[0], looks: ['a'] }, ...shipped.members.slice(1)] }).join(), /five visible changes/);
});

test('cast.story.json is generated from the cast (so-image-cast.mts story --write)', () => {
  const stored = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/image-test-cast/cast.story.json'), 'utf8'));
  assert.deepEqual(stored, castStory(cast));
  assert.deepEqual(stored.requirements.members, cast.members.map((member) => member.name));
});

test('card bodies are the multipart strings ST coerces, and point cleanup at the marker', () => {
  const body = cardBody(cast.members[0], { fav: 'false', talkativeness: '0.5', extensions: '{}', tags: [] }, cast.marker);
  assert.ok(Object.values(body).every((value) => typeof value === 'string'));
  assert.equal(body.ch_name, 'SOIMG Wren');
  assert.equal(body.tags, JSON.stringify(['so-test', 'so-image-cast']));
  assert.match(body.creator_notes, /so-assets\.mts remove --marker SOIMG/);
});

test('art plan: one card and one file per expression per member; missing files are named', () => {
  const plan = artPlan(cast, 'art');
  assert.equal(plan.length, cast.members.length * (1 + cast.expressions.length));
  assert.equal(plan.filter((file) => file.kind === 'card').length, cast.members.length);
  const missing = missingArt(plan, (path) => !path.includes('quill'));
  assert.equal(missing.length, 1 + cast.expressions.length);
  assert.ok(missing.every((file) => file.member === 'SOIMG Quill'));
  assert.deepEqual(parseCastBox({ x: 1, y: 2, width: 3, height: 4 }), { x: 1, y: 2, width: 3, height: 4 });
  assert.equal(parseCastBox({ x: 1, y: 2, width: 0, height: 4 }), null);
  assert.equal(parseCastBox({ x: -1, y: 2, width: 3, height: 4 }), null);
});

test('frame jobs: frames per label and kind, S32-2 looks over every label (5 x 4 = 20 per character)', () => {
  assert.equal(frameJobs(cast.expressions, ['blink', 'talk'], []).length, 8);
  const looks = frameJobs(cast.expressions, [], cast.members[0].looks);
  assert.equal(looks.length, 20);
  assert.ok(looks.every((job) => job.kind === 'look' && job.value));
  assert.equal(firstSeedRate([]), 0);
  assert.equal(firstSeedRate([{ ok: true }, { ok: true }, { ok: false }, { ok: true }]), 0.75);
});

test('image scenarios run on the test cast, never on a pinned Belle group, and declare the lane they need', () => {
  const files = readdirSync(join(ROOT, 'test/scenarios')).filter((name) => /^v27-(card|local|existing|c6)/.test(name));
  assert.deepEqual(files.sort(), ['v27-c6-test-cast.json', 'v27-card-art-base.json', 'v27-card-rollback.json', 'v27-existing-expression-reference.json', 'v27-local-card-reply.json']);
  const names = new Set(cast.members.map((member) => member.name));
  for (const name of files) {
    const doc = scenario(name);
    const requires = requiresOf(doc);
    assert.deepEqual(validateRequires(requires), [], name);
    assert.equal(requires.group, cast.group, name);
    assert.ok(requires.lane, `${name}: names its lane`);
    assert.ok((requires.members ?? []).every((member) => names.has(member)), name);
    assert.doesNotMatch(JSON.stringify(doc), /Belle|1791068844825|v2\.8/, name);
    if (JSON.stringify(doc).match(/sprite-(base|reference|frames)/)) assert.equal(requires.comfy, true, `${name}: a sprite action needs requires.comfy`);
  }
  const c6 = requiresOf(scenario('v27-c6-test-cast.json'));
  assert.deepEqual(c6.members, cast.members.map((member) => member.name));
  assert.equal(c6.lane, 'model');
  assert.equal(requiresOf(scenario('v27-card-rollback.json')).lane, 'no-model');
});

test('the rollback row restores the two install-wide image switches it turns off', () => {
  const doc = scenario('v27-card-rollback.json');
  const cleanup = JSON.stringify(doc.cleanup?.steps ?? []);
  assert.match(cleanup, /storyOrchestratorImage\.updateSettings\(\{enabled:p\.image\}\)/);
  assert.match(cleanup, /storyOrchestratorSprites\.updateSettings\(\{onDemand:p\.onDemand\}\)/);
  assert.match(JSON.stringify(doc.steps[0]), /__soV27RollbackPrior=\{image:s\.image\.enabled, onDemand:s\.sprites\.onDemand\}/);
});
