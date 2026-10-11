import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { runCli } from './lib/cli.mts';
import { PROJECT_ROOT, DEBUG_DIR } from './lib/connection.mts';
import { openGroup, startNewChat, closeUnpinnedDrawers } from './st-navigation.mts';
import { snapshotAssets, listMarkedAssets, removeMarkedAssets, leakCount } from './so-assets.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { ensureSTReady } from './lib/st-ready.mts';
import { poseHead, type Keypoints } from './lib/poseS0.mts';

const MARKER = 'SO-Show';
const ART = process.env.SO_SHOWCASE_ART ?? 'C:/dev/so-showcase-art';
const SOURCE = process.env.SO_SHOWCASE_SOURCE ?? 'C:/dev/so-s0-repilot/bases';
const STORY = resolve(PROJECT_ROOT, 'test/showcase/lantern-inn.story.json');
const TEMPLATE = resolve(PROJECT_ROOT, '.claude/skills/st-character-authoring/templates/create-body.json');
const MODELS = { diffusion: 'qwen_image_2.1_int8_convrot.safetensors', encoder: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors' };
const CAST: Record<string, { source: string; description: string }> = {
  'SO-Show Wren': { source: 'm1', description: 'Wren is a young adventurer with short red hair and green eyes, in a green tunic with a brown belt and leather boots. Cheerful, quick to speak, braver than she is careful.' },
  'SO-Show Garrick': { source: 'm2', description: 'Garrick is a tall knight with short black hair in silver plate armour and a blue cape. Weary and loyal; speaks in short sentences and guards his friends.' },
  'SO-Show Pim': { source: 'm3', description: 'Pim is a small young mage with long silver hair and violet eyes, in a purple robe with gold trim and a pointed hat. Nervous, curious, knows more than she says.' },
};
const FACES: Record<string, string> = { neutral: 'calm, relaxed face', happy: 'smiling, warm, pleased', angry: 'frowning, tense, fighting mood', worried: 'anxious, brows raised, uneasy' };
const AVATAR_PY = [
  'import sys, json',
  'from PIL import Image',
  'src, out, head = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])',
  'im = Image.open(src).convert("RGBA")',
  'w = head["width"] * 2.4; h = w * 1.5',
  'cx = head["x"] + head["width"] / 2; cy = head["y"] + head["height"] * 0.52',
  'left = max(0, min(im.width - w, cx - w / 2)); top = max(0, min(im.height - h, cy - h / 2))',
  'im.crop((int(left), int(top), int(left + w), int(top + h))).resize((400, 600), Image.LANCZOS).save(out)',
].join('\n');
const argument = (key: string, fallback = '') => {
  const at = process.argv.indexOf(key);
  return at < 0 ? fallback : process.argv[at + 1] || fallback;
};
const slug = (name: string) => name.replace(/^SO-Show /, '').toLowerCase();

async function art() {
  await mkdir(ART, { recursive: true });
  const index: Record<string, unknown> = {};
  for (const [name, member] of Object.entries(CAST)) {
    const info = JSON.parse(await readFile(resolve(SOURCE, `${member.source}.dwpose.json`), 'utf8')) as { keypoints: Keypoints; box: { canvas: [number, number]; x: number; y: number; width: number; height: number } };
    const head = poseHead(info.keypoints);
    assert.ok(head, `${name}: the base has no head joints`);
    await copyFile(resolve(SOURCE, `${member.source}.png`), resolve(ART, `${slug(name)}.png`));
    execFileSync(process.env.SO_SHOWCASE_PY ?? 'python', ['-c', AVATAR_PY, resolve(ART, `${slug(name)}.png`), resolve(ART, `${slug(name)}-avatar.png`), JSON.stringify(head)]);
    index[name] = { file: `${slug(name)}.png`, avatar: `${slug(name)}-avatar.png`, canvas: info.box.canvas, alpha: { x: info.box.x, y: info.box.y, width: info.box.width, height: info.box.height }, head };
  }
  await writeFile(resolve(ART, 'art.json'), JSON.stringify(index, null, 2));
  console.log(`showcase art: ${Object.keys(index).length} members in ${ART}`);
}

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const ctx = (globalThis as any).SillyTavern?.getContext();
    return ctx?.extensionSettings?.['story-orchestrator'] && ctx.characters?.length && (globalThis as any).storyOrchestratorRuntime;
  });
}

async function openShowcase(page: Page) {
  await ready(page);
  const open = await page.evaluate(() => (globalThis as any).SillyTavern.getContext().groupId);
  if (!open) {
    await page.waitForFunction(() => (globalThis as any).SillyTavern.getContext().groups?.some((group: any) => group.name === 'SO-Show Lantern Inn'), undefined, { timeout: 30000 });
    await openGroup(page, 'SO-Show Lantern Inn');
    await closeUnpinnedDrawers(page);
  }
  await page.waitForFunction(() => (globalThis as any).storyOrchestratorSprites);
}

async function prepare(page: Page) {
  await ensureSTReady(page);
  await ready(page);
  const index = JSON.parse(await readFile(resolve(ART, 'art.json'), 'utf8')) as Record<string, { file: string; avatar: string; head: { x: number; y: number; width: number; height: number } }>;
  const story = JSON.parse(await readFile(STORY, 'utf8'));
  const template = JSON.parse(await readFile(TEMPLATE, 'utf8'));
  const baseline = await snapshotAssets(page);
  assert.equal(baseline.trusted, true, baseline.untrusted.join('; '));
  assert.equal(leakCount(await listMarkedAssets(page, MARKER, { baseline })), 0, `${MARKER} assets already exist; run cleanup first`);
  const images: Record<string, { sprite: string; avatar: string }> = {};
  for (const [name, entry] of Object.entries(index)) images[name] = { sprite: (await readFile(resolve(ART, entry.file))).toString('base64'), avatar: (await readFile(resolve(ART, entry.avatar))).toString('base64') };
  const rigs: Record<string, string> = {};
  for (const name of Object.keys(index)) {
    const rigFile = resolve(ART, `${slug(name)}.rig.json`);
    if (await access(rigFile).then(() => true, () => false)) rigs[name] = await readFile(rigFile, 'utf8');
  }
  const created = await page.evaluate(async ({ story, template, cast, faces, images, rigs }) => {
    const ctx = (globalThis as any).SillyTavern.getContext(), headers = { ...ctx.getRequestHeaders() };
    delete headers['Content-Type'];
    const members: Array<{ name: string; avatar: string }> = [];
    const liveHeadRigs: Record<string, unknown> = {};
    for (const [name, member] of Object.entries(cast) as Array<[string, { description: string }]>) {
      const form = new FormData();
      const labels = Object.fromEntries(Object.entries(faces).map(([id, what]) => [id, { what }]));
      const body = { ...template, ch_name: name, description: member.description, first_mes: '', mes_example: '', tags: 'so-showcase', creator_notes: 'Story Orchestrator showcase character. Remove with: node scripts/debug/so-assets.mts remove --marker SO-Show',
        extensions: JSON.stringify({ so_sprites: { default: 'neutral', labels } }) };
      for (const [key, value] of Object.entries(body)) if (!Array.isArray(value)) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
      form.append('avatar', new File([Uint8Array.from(atob(images[name].avatar), (c) => c.charCodeAt(0))], 'avatar.png', { type: 'image/png' }));
      const response = await fetch('/api/characters/create', { method: 'POST', headers, body: form });
      if (!response.ok) throw new Error(`Create ${name} failed: ${response.status}`);
      const avatar = (await response.text()).trim();
      const upload = new FormData();
      upload.append('name', name); upload.append('label', 'neutral'); upload.append('spriteName', 'neutral');
      upload.append('avatar', new File([Uint8Array.from(atob(images[name].sprite), (c) => c.charCodeAt(0))], 'neutral.png', { type: 'image/png' }));
      const answer = await fetch('/api/sprites/upload', { method: 'POST', headers, body: upload });
      if (!answer.ok) throw new Error(`Sprite upload for ${name} failed: ${answer.status}`);
      if (rigs[name]) {
        const bytes = Uint8Array.from(atob(images[name].sprite), (c) => c.charCodeAt(0));
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const files = await (await fetch(`/api/sprites/get?name=${encodeURIComponent(name)}`, { headers: ctx.getRequestHeaders() })).json();
        const path = files.find((file: any) => file.label === 'neutral').path;
        const manifest = { ...JSON.parse(rigs[name]), source: path };
        if (manifest.artHash !== hash) throw new Error(`The rig for ${name} was built for different artwork.`);
        const ref = { member: manifest.member, look: manifest.look, artHash: hash, source: path, manifest: `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}` };
        liveHeadRigs[JSON.stringify([ref.member, ref.look, ref.artHash])] = ref;
      }
      members.push({ name, avatar });
    }
    await ctx.getCharacters();
    const response = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: 'SO-Show Lantern Inn', members: members.map((m) => m.avatar),
      activation_strategy: 2, generation_mode: 0, disabled_members: [], allow_self_responses: false, fav: false }) });
    const group = await response.json();
    if (!response.ok || !group.id) throw new Error('Showcase group creation failed');
    await ctx.getCharacters();
    return { group: String(group.id), members, liveHeadRigs };
  }, { story, template, cast: CAST, faces: FACES, images, rigs });
  await openGroup(page, created.group);
  await startNewChat(page);
  await closeUnpinnedDrawers(page);
  const builders = Object.fromEntries(Object.entries(index).map(([name, entry]) => [name, { baseSet: '', box: entry.head, models: MODELS, steps: 25, resolution: 1024 }]));
  const onDemand = !process.argv.includes('--no-render');
  await page.evaluate(async ({ story, builders, onDemand, liveHeadRigs }) => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    home.settings ??= {};
    home.settings.sprites = { ...home.settings.sprites, enabled: true, explicit: true, stage: 'always', poses: true, liveHead: true, liveHeadRigs, onDemand, builders };
    home.settings.display = { ...home.settings.display, briefing: false, briefingDraft: false, playerSetup: false };
    await rt.importStory(JSON.stringify(story)); rt.notify();
    rt.setUiSettings({ briefingSeen: true });
  }, { story, builders, onDemand, liveHeadRigs: created.liveHeadRigs });
  await saveSettingsNow(page);
  console.log(JSON.stringify({ group: created.group, members: created.members.map((m) => m.name), story: story.id, builders: Object.keys(builders), rigs: Object.keys(created.liveHeadRigs).length }));
}

async function status(page: Page) {
  await openShowcase(page);
  const out = await page.evaluate(() => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, ctx = root.SillyTavern.getContext();
    const snap = rt.getSnapshot();
    return { groupId: ctx.groupId, chatId: ctx.chatId, checkpoint: snap?.activeCheckpointId ?? null, story: snap?.selectedStoryId ?? null, sprites: Boolean(root.storyOrchestratorSprites),
      settings: rt.getGlobalSettings()?.sprites ? { enabled: rt.getGlobalSettings().sprites.enabled, poses: rt.getGlobalSettings().sprites.poses, liveHead: rt.getGlobalSettings().sprites.liveHead,
        builders: Object.keys(rt.getGlobalSettings().sprites.builders ?? {}) } : null };
  });
  console.log(JSON.stringify(out, null, 2));
}

async function shot(page: Page) {
  await openShowcase(page);
  const name = (process.argv[3] ?? 'stage').replace(/[^a-z0-9_-]/gi, '');
  await page.waitForTimeout(Number(argument('--wait', '2500')));
  const dir = resolve(DEBUG_DIR, 'showcase');
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `${name}.png`);
  await page.screenshot({ path: file });
  const stage = await page.evaluate(() => {
    const root = globalThis as any;
    const actors = [...document.querySelectorAll('#so-vn-stage .so-sprite')].map((el) => ({ src: (el.querySelector('img') as HTMLImageElement | null)?.src?.split('/').slice(-3).join('/') ?? null, head: Boolean(el.querySelector('canvas.so-live-head')) }));
    return { stage: Boolean(document.querySelector('#so-vn-stage')), actors, checkpoint: root.storyOrchestratorRuntime?.getSnapshot()?.activeCheckpointId ?? null };
  });
  console.log(JSON.stringify({ file, ...stage }));
}

async function render(page: Page) {
  await openShowcase(page);
  const on = (process.argv[3] ?? 'on') !== 'off';
  await page.evaluate((on) => (globalThis as any).storyOrchestratorSprites.updateSettings({ onDemand: on }), on);
  await saveSettingsNow(page);
  console.log(JSON.stringify({ onDemand: on }));
}

async function cleanup(page: Page) {
  await ready(page);
  const baseline = await snapshotAssets(page);
  const removed = await removeMarkedAssets(page, MARKER, { baseline });
  await page.evaluate(() => {
    const root = globalThis as any, rt = root.storyOrchestratorRuntime, home = root.SillyTavern.getContext().extensionSettings['story-orchestrator'];
    const sprites = { ...(home.settings?.sprites ?? {}) };
    for (const key of Object.keys(sprites.builders ?? {})) if (key.startsWith('SO-Show')) delete sprites.builders[key];
    home.settings = { ...(home.settings ?? {}), sprites };
    rt.notify();
  });
  await saveSettingsNow(page);
  console.log(JSON.stringify({ clean: removed.clean, leaked: leakCount(removed.leaked) }));
}

async function serveCandidate(page: Page) {
  await page.route('**/third-party/story-orchestrator/dist/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    assert.match(file, /^[a-zA-Z0-9_.-]+$/);
    await route.fulfill({ contentType: file.endsWith('.json') ? 'application/json' : 'application/javascript', body: await readFile(resolve(PROJECT_ROOT, 'dist', file)) });
  });
  const cache = await page.context().newCDPSession(page);
  await cache.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload();
  await ensureSTReady(page);
  await cache.detach();
}

async function main(page: Page) {
  const command = process.argv[2] ?? 'help';
  if (process.argv.includes('--candidate')) await serveCandidate(page);
  if (command === 'prepare') await prepare(page);
  else if (command === 'status') await status(page);
  else if (command === 'shot') await shot(page);
  else if (command === 'render') await render(page);
  else if (command === 'cleanup') await cleanup(page);
  else console.log('commands: art (no lane) | prepare [--no-render] | render on|off | shot <name> | status | cleanup');
  return { ok: true };
}

if (process.argv.includes('--help')) console.log('node scripts/debug/so-showcase.mts art | node scripts/debug/st-lanes.mts run <lane> -- scripts/debug/so-showcase.mts prepare|render|status|cleanup [--candidate]');
else if (process.argv[2] === 'art') await art();
else await runCli(main);
