import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';
import { DEBUG_DIR, PROJECT_ROOT } from './lib/connection.mts';
import { argValue, CAST_MANIFEST } from './lib/imageHarness.mts';
import { requireIsolatedLane } from './lib/imageHarnessConfig.mts';
import { artPlan, boxFile, CAST_FILE, cardBody, castStory, DEFAULT_ART_DIR, missingArt, parseCast, parseCastBox, type Cast } from './lib/imageCast.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';

const USAGE = `Usage: node scripts/debug/so-image-cast.mts <seed|status|remove|story> [options]

The marker-scoped multi-character test cast for the image, sprite and living-card rows (plan 32 decision 9,
plan 39 C6). Run it on an isolated lane: st-lanes.mts run <n> -- scripts/debug/so-image-cast.mts seed.

  seed     create the cast's cards (card art as the avatar), their original expressions and the group
           [--art <dir>]   art root: <dir>/<short>/card.png and <dir>/<short>/<label>.png, plus an optional
                           <dir>/<short>/box.json {x, y, width, height}: the face box the sprite builder edits
                           (default ${DEFAULT_ART_DIR}, private so-sessions evidence)
           [--no-art]      create the cards with ST's default avatar and no expressions: enough for the
                           no-model rollback and reply rows, not for any base, reference or frame row
           [--allow-main]  seed lane 0 (the real install) instead of refusing
  status   is the cast seeded, and with art?
  remove   delete everything the marker names (so-assets.mts remove --marker <marker>, with the seed baseline)
  story    print the cast story; --write refreshes test/fixtures/image-test-cast/cast.story.json

  --cast <file>   another cast fixture (default ${CAST_FILE})

Writes <debug dir>/image-cast.json (manifest) and image-cast-baseline.json (asset baseline taken before seeding).`;

const args = stripCommonArgs(process.argv.slice(2));
const command = args[0] ?? '';
const castPath = resolve(PROJECT_ROOT, argValue(args, '--cast', CAST_FILE));
const manifestPath = CAST_MANIFEST;
const baselinePath = resolve(DEBUG_DIR, 'image-cast-baseline.json');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function loadCast(): Promise<Cast> {
  return parseCast(JSON.parse((await readFile(castPath, 'utf8')).replace(/^﻿/, '')));
}

async function readCastState(page, cast: Cast) {
  return page.evaluate(async (cast) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const group = (ctx.groups ?? []).find((entry) => entry.name === cast.group) ?? null;
    const members = [];
    for (const member of cast.members) {
      const card = (ctx.characters ?? []).find((entry) => entry.name === member.name) ?? null;
      const listed = card ? await fetch(`/api/sprites/get?name=${encodeURIComponent(member.name)}`, { headers: ctx.getRequestHeaders() }) : null;
      const files = listed?.ok ? await listed.json() : [];
      members.push({ name: member.name, avatar: card?.avatar ?? null, inGroup: Boolean(card && group?.members?.includes(card.avatar)),
        expressions: (Array.isArray(files) ? files : []).map((file) => String(file.label)) });
    }
    return { group: group ? { id: String(group.id), name: group.name, members: group.members ?? [] } : null, members };
  }, cast);
}

async function seed(page) {
  if (!args.includes('--allow-main')) requireIsolatedLane(process.env, 'so-image-cast seed');
  const cast = await loadCast();
  const noArt = args.includes('--no-art');
  const artDir = resolve(PROJECT_ROOT, argValue(args, '--art', DEFAULT_ART_DIR));
  const plan = noArt ? [] : artPlan(cast, artDir);
  const absent = missingArt(plan, existsSync);
  if (absent.length) throw new Error(`Art missing under ${artDir}: ${absent.map((file) => file.path).join(', ')}. Pass --art <dir>, or --no-art for the reply/rollback rows only.`);
  const boxes = new Map<string, unknown>();
  for (const member of noArt ? [] : cast.members) {
    const path = boxFile(artDir, member);
    if (existsSync(path)) {
      const box = parseCastBox(JSON.parse(await readFile(path, 'utf8')));
      if (!box) throw new Error(`${path}: expected {x, y, width, height} non-negative integers`);
      boxes.set(member.name, box);
    }
  }
  const state = await readCastState(page, cast);
  const present = state.members.filter((member) => member.avatar);
  if (state.group && present.length === cast.members.length && state.members.every((member) => member.inGroup)) {
    console.log(JSON.stringify({ seeded: 'already', group: state.group, members: state.members }, null, 2));
    return;
  }
  if (state.group || present.length) throw new Error(`A partial ${cast.marker} cast exists (${JSON.stringify({ group: state.group?.name ?? null, cards: present.map((member) => member.name) })}); run "so-image-cast.mts remove" first.`);
  const baseline = await snapshotAssets(page);
  if (!baseline.trusted) throw new Error(`The asset baseline is untrusted: ${baseline.untrusted.join('; ')}`);
  if (leakCount(await listMarkedAssets(page, cast.marker, { baseline }))) throw new Error(`Assets named ${cast.marker} already exist; run "so-image-cast.mts remove" first.`);
  await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
  const template = JSON.parse(await readFile(resolve(PROJECT_ROOT, '.claude/skills/st-character-authoring/templates/create-body.json'), 'utf8'));
  const files = await Promise.all(plan.map(async (file) => {
    const bytes = await readFile(file.path);
    return { ...file, sha256: sha256(bytes), data: bytes.toString('base64') };
  }));
  const members = cast.members.map((member) => ({ name: member.name, body: cardBody(member, template, cast.marker),
    card: files.find((file) => file.member === member.name && file.kind === 'card') ?? null,
    expressions: files.filter((file) => file.member === member.name && file.kind === 'expression') }));
  const created = await page.evaluate(async ({ members, group }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const headers = { ...ctx.getRequestHeaders() };
    delete headers['Content-Type'];
    const png = (data: string, name: string) => new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], name, { type: 'image/png' });
    const out = [];
    for (const member of members) {
      const form = new FormData();
      for (const [key, value] of Object.entries(member.body)) form.append(key, value as string);
      if (member.card) form.append('avatar', png(member.card.data, 'card.png'));
      const response = await fetch('/api/characters/create', { method: 'POST', headers, body: form });
      if (!response.ok) throw new Error(`Creating ${member.name} failed: ${response.status}`);
      const avatar = (await response.text()).trim();
      const expressions = [];
      for (const expression of member.expressions) {
        const upload = new FormData();
        upload.append('name', member.name);
        upload.append('label', expression.label);
        upload.append('spriteName', expression.label);
        upload.append('avatar', png(expression.data, `${expression.label}.png`));
        const answer = await fetch('/api/sprites/upload', { method: 'POST', headers, body: upload });
        if (!answer.ok) throw new Error(`Uploading ${member.name}/${expression.label} failed: ${answer.status}`);
        expressions.push(expression.label);
      }
      out.push({ name: member.name, avatar, card: member.card?.sha256 ?? null, expressions: member.expressions.map((entry) => ({ label: entry.label, sha256: entry.sha256 })) });
    }
    await ctx.getCharacters();
    const response = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: group, members: out.map((member) => member.avatar),
      activation_strategy: 0, generation_mode: 0, allow_self_responses: false, disabled_members: [], fav: false }) });
    const made = await response.json();
    if (!response.ok || !made?.id) throw new Error('The test-cast group could not be created.');
    await ctx.getCharacters();
    return { group: { id: String(made.id), name: made.name }, members: out };
  }, { members, group: cast.group });
  await saveSettingsNow(page).catch(() => null);
  created.members = created.members.map((member) => ({ ...member, box: boxes.get(member.name) ?? null }));
  const manifest = { kind: 'so-image-cast', marker: cast.marker, cast: castPath, art: noArt ? null : artDir, seededAt: new Date().toISOString(),
    lane: process.env.SO_LANE ?? null, baseline: baselinePath, ...created };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

async function status(page) {
  const cast = await loadCast();
  const state = await readCastState(page, cast);
  const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
  const ready = Boolean(state.group) && state.members.every((member) => member.avatar && member.inGroup);
  const withArt = ready && state.members.every((member) => cast.expressions.every((label) => member.expressions.includes(label)));
  console.log(JSON.stringify({ ready, withArt, group: state.group, members: state.members, manifest: manifest ? { seededAt: manifest.seededAt, art: manifest.art } : null }, null, 2));
}

async function remove(page) {
  const cast = await loadCast();
  const baseline = existsSync(baselinePath) ? JSON.parse(await readFile(baselinePath, 'utf8')) : null;
  const result = await removeMarkedAssets(page, cast.marker, { baseline });
  console.log(JSON.stringify({ marker: cast.marker, removed: result.removed, leaked: result.leaked, clean: result.clean }, null, 2));
  if (!result.clean) throw new Error(`The ${cast.marker} cast was not removed cleanly.`);
  await rm(manifestPath, { force: true });
  await rm(baselinePath, { force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (hasHelpFlag() || !['seed', 'status', 'remove', 'story'].includes(command)) {
    console.log(USAGE);
    process.exit(hasHelpFlag() ? 0 : 1);
  }
  if (command === 'story') {
    const story = `${JSON.stringify(castStory(await loadCast()), null, 2)}\n`;
    if (args.includes('--write')) await writeFile(resolve(PROJECT_ROOT, 'test/fixtures/image-test-cast/cast.story.json'), story);
    else process.stdout.write(story);
  } else runCli(command === 'seed' ? seed : command === 'status' ? status : remove);
}
