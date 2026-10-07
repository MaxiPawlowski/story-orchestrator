import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { withST } from './lib/cli.mts';
import { buildSpriteFromUI } from './so-sprite-builder.mts';
import { openCheckpointStudio, closeCheckpointStudio } from './so-ui.mts';
import { closeUnpinnedDrawers } from './st-navigation.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';
import { snapshotSpriteAssets, scopedSpriteReferences, removeSpriteReferences } from './lib/spriteAssets.mts';
import { evidencePath, requireHarness, builderBox } from './lib/imageHarness.mts';
import { parseBox, setSlug, slugName } from './lib/imageHarnessConfig.mts';
import { COMPARISON_LABELS, comparisonPack, labeledComparison, scoreLabeled, scoreComparison, scoreLooks, type ComparisonSample } from './lib/spriteComparison.mts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => args[args.indexOf(name) + 1] && args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const character = flag('--character', '');
const folder = flag('--folder', character);
const out = resolve(flag('--out', evidencePath('s28', `${slugName(character) || 'pack'}-user-pack`)));
const json = async (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2));
const require = createRequire(import.meta.url);

async function originals(page, folder: string) {
  return page.evaluate(async (folder) => {
    const response = await fetch(`/api/sprites/get?name=${encodeURIComponent(folder)}`);
    if (!response.ok) throw new Error(`${folder} expressions are unavailable.`);
    const files = await response.json();
    return Promise.all(files.map(async (file) => {
      const response = await fetch(file.path);
      if (!response.ok) throw new Error(`Cannot read ${file.label}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
        reader.readAsDataURL(new Blob([bytes], { type: 'image/png' }));
      });
      return { label: file.label, hash, data };
    }));
  }, folder);
}

function requireCharacter() {
  if (!character) throw new Error('--character <card name> is required (the harness names no default character).');
  return character;
}

const CAST_FILE = 'test/fixtures/image-test-cast/cast.json';

function lookChanges(): string[] {
  const given = flag('--changes', '');
  const changes = given ? given.split('|').map((entry) => entry.trim()).filter(Boolean)
    : (JSON.parse(readFileSync(resolve(CAST_FILE), 'utf8')).members ?? []).find((member) => member.name === character)?.looks ?? [];
  if (changes.length !== 5) throw new Error(`looks needs exactly five visible changes (S32-2: 5 looks x 4 expressions = 20): pass --changes "a|b|c|d|e" or use a ${CAST_FILE} member; got ${changes.length}.`);
  return changes;
}

async function build() {
  const looks = args[0] === 'looks';
  const resolution = Number(flag('--resolution', '1024'));
  const steps = Number(flag('--steps', '25'));
  const onlyMouth = args.includes('--mouth-only');
  const kinds = args.includes('--smooth') ? ['blink', 'talk', 'talk2'] : onlyMouth ? ['talk'] : ['blink', 'talk'];
  await mkdir(out, { recursive: true });
  requireCharacter();
  const models = requireHarness(['editModels']).editModels;
  const set = `so_s28_${setSlug(character)}`;
  const changes = looks ? lookChanges() : [];
  await withST(async (page) => {
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify((globalThis as any).storyOrchestratorRuntime.getGlobalSettings().sprites)));
    const baseline = await snapshotSpriteAssets(page);
    if (!baseline.trusted) throw new Error('A trusted sprite baseline is required.');
    const before = await originals(page, folder);
    const marker = `SO-S28-${slugName(character)}`;
    const box = await builderBox(page, folder, parseBox(flag('--box', '')));
    const region = args.includes('--recompose') ? parseBox(flag('--region', '')) : null;
    if (args.includes('--recompose') && !region) throw new Error('--recompose needs --region x,y,width,height (the mouth region on this character).');
    const rows: any[] = [];
    const seed = Number(flag('--seed', String(Math.floor(Date.now() / 1000) >>> 0)));
    const previousFile = flag('--previous', '');
    const previous = previousFile ? JSON.parse(await readFile(resolve(previousFile), 'utf8')) : [];
    const samples: ComparisonSample[] = COMPARISON_LABELS.map((label) => {
      const base = before.find((file) => file.label === label);
      if (!base) throw new Error(`Missing original ${label} expression.`);
      const prior = previous.find((sample) => sample.label === label);
      if (prior && prior.base !== base.data) throw new Error('The previous frame pack uses different original artwork.');
      return { label, base: base.data, blink: onlyMouth ? prior?.blink ?? '' : '', talk: '', talk2: prior?.talk2 ?? '', ...(prior ? { previous: prior } : {}) };
    });
    const jobs = looks ? changes.flatMap((change, look) => samples.map((sample) => ({ sample, kind: 'look', change, look })))
      : samples.flatMap((sample) => kinds.map((kind) => ({ sample, kind, change: null, look: null })));
    const lookImages: any[] = [];
    const header = await page.evaluate(async (group) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const open = (ctx.groups ?? []).find((entry) => String(entry.id) === String(ctx.groupId));
      if (!open || !ctx.chatId) throw new Error('Open the test-cast group chat first (st-navigation.mts open-group <name>).');
      if (group && String(open.id) !== group && open.name !== group) throw new Error(`The open group is "${open.name}", not "${group}".`);
      const controller = await fetch('/api/plugins/story-orchestrator-gpu/status', { headers: ctx.getRequestHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      return { groupId: ctx.groupId, groupName: open.name, chatId: ctx.chatId, controllerBuild: controller?.controllerBuild ?? null,
        manifest: await fetch('/scripts/extensions/third-party/story-orchestrator/dist/manifest.json').then((r) => r.json()) };
    }, flag('--group', ''));
    const report = { character, folder, set, box, models, seed, resolution, steps, kinds, previousFile, header, reference: 'original-expression', rows, recomposites: [] as any[],
      jobsSubmitted: 0, complete: false, cleanup: false, originals: before.map(({ label, hash }) => ({ label, hash })) };
    const countJob = (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/plugins/story-orchestrator-media/jobs')) report.jobsSubmitted += 1; };
    page.on('request', countJob);
    const raw: any[] = [];
    await json(resolve(out, 'build.json'), report);
    try {
      await openCheckpointStudio(page);
      for (const { sample, kind, change, look } of jobs) {
        const started = Date.now();
        try {
          const result = await buildSpriteFromUI(page, { character, set, label: sample.label, kind, models,
            reference: sample.label, box, seed: (seed + rows.length) >>> 0, steps, resolution, value: change ?? undefined });
          const src = await page.locator('#so-sprite-builder img[alt$="preview"]').getAttribute('src');
          if (!src?.startsWith('data:image/png;base64,')) throw new Error('Preview PNG missing.');
          if (looks) lookImages.push({ id: rows.length, look, label: sample.label, change, base: sample.base, output: src });
          else sample[kind] = src;
          rows.push({ label: sample.label, kind, change, look, seed: (seed + rows.length) >>> 0, seconds: (Date.now() - started) / 1000,
            ok: true, sha256: createHash('sha256').update(Buffer.from(src.split(',')[1], 'base64')).digest('hex'), timings: result.timings, evidence: result.evidence });
          raw.push({ label: sample.label, kind, image: result.raw, reference: result.referenceCrop, composite: src });
          if (kind === 'talk' && args.includes('--recompose')) {
            const before = report.jobsSubmitted;
            const revised = await buildSpriteFromUI(page, { character, set, label: sample.label, kind, models,
              reference: sample.label, box, seed: (seed + rows.length - 1) >>> 0, steps, resolution,
              region: { x: region[0], y: region[1], width: region[2], height: region[3], feather: Number(flag('--feather', '3')) } });
            if (!revised.timings?.cacheHit || revised.timings.renderMs !== 0 || revised.timings.leaseMs !== 0 || report.jobsSubmitted !== before) throw new Error('Mask adjustment started a new GPU job.');
            report.recomposites.push({ label: sample.label, timings: revised.timings });
          }
        } catch (error) {
          rows.push({ label: sample.label, kind, change, look, seconds: (Date.now() - started) / 1000, ok: false, error: String(error) });
        }
        await json(resolve(out, 'build.json'), report);
        await json(resolve(out, 'samples.json'), looks ? lookImages : samples);
        await json(resolve(out, 'raw.json'), raw);
        console.log(`${sample.label}/${kind}: ${rows.at(-1)?.ok ? 'pass' : 'fail'} (${rows.at(-1)?.seconds.toFixed(1)} s)`);
      }
      report.complete = rows.length === jobs.length && rows.every((row) => row.ok)
        && (!args.includes('--recompose') || report.recomposites.length === samples.length);
    } finally {
      page.off('request', countJob);
      await closeCheckpointStudio(page); await closeUnpinnedDrawers(page);
      await page.evaluate((sprites) => {
        const ctx = (globalThis as any).SillyTavern.getContext();
        ctx.extensionSettings['story-orchestrator'].settings.sprites = sprites;
        (globalThis as any).storyOrchestratorRuntime.touch();
      }, saved);
      await saveSettingsNow(page);
      const after = await snapshotSpriteAssets(page);
      const refs = await removeSpriteReferences(page, scopedSpriteReferences(after, marker, baseline));
      const end = await originals(page, folder);
      if (refs.errors.length || JSON.stringify(before.map(({ label, hash }) => ({ label, hash }))) !== JSON.stringify(end.map(({ label, hash }) => ({ label, hash })))) {
        throw new Error('Original expression inventory changed or reference cleanup failed.');
      }
      report.cleanup = true;
      await json(resolve(out, 'build.json'), report);
    }
    if (!report.complete) throw new Error('First-seed matrix incomplete; failures retained in build.json.');
  });
}

async function pack() {
  const report = JSON.parse(await readFile(resolve(out, 'build.json'), 'utf8'));
  if (!report.complete || !report.cleanup) throw new Error('Only a complete, clean matrix can make a rating pack.');
  const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
  const result = comparisonPack(samples, String(report.seed));
  await json(resolve(out, 'answer-key.json'), result.key);
  const webpack = require('webpack');
  const config = require('../../webpack.config.js')({}, { mode: 'production' });
  await new Promise<void>((done, reject) => {
    const compiler = webpack({ mode: 'production', target: 'web', entry: resolve('scripts/debug/lib/spriteComparisonPlayer.jsx'),
      output: { path: out, filename: 'player.js' }, resolve: config.resolve, module: config.module,
      optimization: { minimize: true }, performance: { hints: false } });
    compiler.run((error, stats) => compiler.close(() => error || stats?.hasErrors() ? reject(error ?? new Error(stats.toString())) : done()));
  });
  const labeled = labeledComparison(samples, String(report.seed), report.character);
  const data = JSON.stringify({ ...labeled, resolution: report.resolution, steps: report.steps }).replace(/</g, '\\u003c');
  const script = (await readFile(resolve(out, 'player.js'), 'utf8')).replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${report.character.replace(/[<>&"]/g, '')} sprite comparison</title>
    <style>body{margin:0;background:#18212c;color:#eef2f6;font:16px system-ui}main{max-width:1200px;margin:auto;padding:24px}button,select,textarea{font:inherit;padding:8px;border-radius:6px}button{margin:6px;cursor:pointer}.controls{display:flex;gap:16px;margin-bottom:16px}.controls label{flex:1;min-width:0}.panels{display:grid;grid-template-columns:repeat(3,minmax(260px,1fr));gap:16px;overflow-x:auto}.panels section{min-width:0;text-align:center;background:#263545;border-radius:12px}.panels section p{min-height:40px;padding:0 8px}.portrait{position:relative;width:100%;height:440px;overflow:hidden;animation:breathe 4s ease-in-out infinite;transform-origin:bottom center}.zoom{position:absolute;inset:0;transform-origin:50% 12%}.portrait img{position:absolute;width:100%;height:100%;inset:0;object-fit:contain}.speech{min-height:48px}.ratings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ratings>label{grid-column:1/-1}fieldset{min-width:0;border:1px solid #748699;border-radius:8px}fieldset label{margin:12px 0}label{display:flex;flex-direction:column;gap:6px}.loop{display:inline-flex;flex-direction:row;margin:8px}textarea{min-height:60px}@keyframes breathe{50%{transform:scaleY(1.008)}}@media(max-width:600px){main{padding:12px}.controls,.ratings{display:flex;flex-direction:column}}@media(prefers-reduced-motion:reduce){.portrait{animation:none}}</style>
    <div id="root"></div><script id="pack-data" type="application/json">${data}</script><script>${script}</script></html>`;
  await writeFile(resolve(out, 'index.html'), html);
  await json(resolve(out, 'status.json'), { status: 'pending-user-ratings', presentation: 'labeled-simultaneous', expressions: samples.length, modes: 3,
    packId: labeled.id, scope: `${report.character} original-expression arm only; full S28 pending`, renderer: 'shipped AnimatedFace + StreamActivity, scripted identical token timing', htmlSha256: createHash('sha256').update(html).digest('hex') });
  console.log(`Rating pack: ${resolve(out, 'index.html')}`);
}

async function main() {
  if (args[0] === 'build' || args[0] === 'looks') await build();
  else if (args[0] === 'pack') await pack();
  else if (args[0] === 'rate-looks') {
    const report = JSON.parse(await readFile(resolve(out, 'build.json'), 'utf8'));
    if (!report.complete || !report.cleanup) throw new Error('An incomplete or unclean look run cannot be rated as acceptance.');
    const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
    const rater = requireHarness(['rater']).raterProfile;
    const ratings = await withST((page) => page.evaluate(async ({ samples, rater }) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const profile = ctx.extensionSettings.connectionManager.profiles.find((profile) => profile.name === rater);
      if (!profile) throw new Error('The independent image rater is unavailable.');
      const reduce = async (src) => {
        const image = new Image(); image.src = src; await image.decode();
        const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      };
      const ratings = [];
      for (const sample of samples) {
        const content = [{ type: 'text', text: `The first image is the original ${sample.label} character sprite. The second is an edit requested to show: ${sample.change}. Independently assess whether it is the same character, whether the requested change is clearly visible, and whether the original expression is preserved. Do not assume the edit succeeded. Return only JSON {"sameCharacter":true,"changeVisible":true,"expressionPreserved":true}.` },
          ...await Promise.all([sample.base, sample.output].map(async (src) => ({ type: 'image_url', image_url: { url: await reduce(src) } })))];
        const answer = await ctx.ConnectionManagerRequestService.sendRequest(profile.id, [{ role: 'user', content }], 256,
          { extractData: true, includePreset: false, includeInstruct: false, stream: false }, {});
        const text = typeof answer === 'string' ? answer : answer?.content ?? answer?.text ?? '';
        ratings.push({ id: sample.id, ...JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) });
      }
      return ratings;
    }, { samples, rater }));
    const score = scoreLooks(ratings);
    await json(resolve(out, 'ratings.json'), { rater, ratings, score });
    console.log(score);
    if (!score.passes) process.exitCode = 1;
  }
  else if (args[0] === 'score') {
    const ratings = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
    const report = JSON.parse(await readFile(resolve(out, 'build.json'), 'utf8'));
    if (ratings.kind === 'labeled-sprite-review') {
      const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
      const expected = labeledComparison(samples, String(report.seed), report.character).id;
      if (ratings.rater !== 'user' || ratings.pack !== expected) throw new Error('Ratings must come from the user and this labeled pack.');
      const result = scoreLabeled(ratings.votes);
      await json(resolve(out, 'rating-result.json'), result); console.log(result); return;
    }
    if (ratings.rater !== 'user' || ratings.pack !== `${slugName(report.character)}-${report.seed}`) throw new Error('Ratings must come from the user and this pack.');
    const key = JSON.parse(await readFile(resolve(out, 'answer-key.json'), 'utf8'));
    const result = scoreComparison(key, ratings.votes);
    await json(resolve(out, 'rating-result.json'), result); console.log(result);
  } else if (args[0] === 'check') {
    const built = JSON.parse(await readFile(resolve(out, 'build.json'), 'utf8'));
    const browser = await chromium.launch({ headless: true });
    const checks: any[] = [];
    try {
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(pathToFileURL(resolve(out, 'index.html')).href);
        await page.getByRole('heading', { name: `${built.character} sprite comparison` }).waitFor();
        const matrix = [];
        for (let at = 0; at < 4; at += 1) {
          await page.getByLabel('Expression', { exact: true }).selectOption(String(at));
          for (const label of ['Regular', 'Two-frame', 'Three-frame']) await page.getByRole('heading', { name: label, exact: true }).waitFor();
          await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.portrait img')].length >= 3
            && [...document.querySelectorAll<HTMLImageElement>('.portrait img')].every((image) => image.complete && image.naturalWidth > 0));
          await page.waitForTimeout(800);
          const view = await page.evaluate(() => ({
            images: [...document.querySelectorAll<HTMLImageElement>('.portrait img')].map((image) => ({ width: image.naturalWidth, height: image.naturalHeight })),
            overflow: document.documentElement.scrollWidth > innerWidth,
            overlays: document.querySelectorAll('.so-face-overlay').length,
          }));
          if (view.overflow || view.images.length < 3 || view.images.some((image) => !image.width)) throw new Error('The comparison has overflow or missing images.');
          matrix.push(view);
        }
        if (errors.length) throw new Error(errors.join('\n'));
        await page.screenshot({ path: resolve(out, `check-${viewport.width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await page.waitForTimeout(500);
        const paused = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.so-face-overlay')].every((image) => image.style.opacity === '0'));
        if (!paused) throw new Error('Pause left a face animation visible.');
        await page.getByLabel('Loop playback', { exact: true }).uncheck();
        await page.getByRole('button', { name: 'Replay all three', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Playback finished' }).waitFor({ timeout: 10000 });
        await page.getByLabel('Which option do you prefer?', { exact: true }).selectOption('smooth');
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download ratings', exact: true }).click();
        const download = await downloadPromise;
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (exported.kind !== 'labeled-sprite-review' || exported.votes.length !== 4
          || exported.votes.find((vote) => vote.label === 'worried')?.preferred !== 'smooth') throw new Error('Labeled rating export did not preserve the selection.');
        checks.push({ viewport, expressions: matrix.length, modes: 3, decoded: true, overflow: false, errors, exportVerified: true, pauseReplayLoopVerified: true });
        await page.close();
      }
      await json(resolve(out, 'player-check.json'), { ok: true, checks, scope: 'rating player plumbing, not S28 performance acceptance' });
    } finally { await browser.close(); }
  } else if (args[0] === 'review') {
    const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
    const box = JSON.parse(await readFile(resolve(out, 'build.json'), 'utf8')).box;
    const raw = args.includes('--quality') ? JSON.parse(await readFile(resolve(out, 'raw.json'), 'utf8')) : [];
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(resolve(out, 'index.html')).href);
      const sheet = await page.evaluate(async ({ samples, raw, quality, box }) => {
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = samples.length * 360;
        const context = canvas.getContext('2d');
        context.fillStyle = '#263545'; context.fillRect(0, 0, canvas.width, canvas.height);
        for (const [row, sample] of samples.entries()) {
          const image = async (src) => { const image = new Image(); image.src = src; await image.decode(); return image; };
          const base = await image(sample.base);
          for (const [column, kind] of (quality ? ['base', 'previous', 'talk', 'raw'] : ['base', 'blink', 'talk2', 'talk']).entries()) {
            const composed = document.createElement('canvas'); composed.width = base.naturalWidth; composed.height = base.naturalHeight;
            const drawing = composed.getContext('2d'); drawing.drawImage(base, 0, 0);
            if (kind === 'previous') drawing.drawImage(await image(sample.previous.talk), 0, 0);
            else if (kind !== 'base' && kind !== 'raw') drawing.drawImage(await image(sample[kind]), 0, 0);
            context.fillStyle = 'white'; context.font = '20px system-ui';
            context.fillText(`${sample.label} — ${kind}`, column * 320 + 8, row * 360 + 28);
            if (kind === 'raw') context.drawImage(await image(raw.find((entry) => entry.label === sample.label && entry.kind === 'talk').image),
              column * 320, row * 360 + 40, 320, 320);
            else context.drawImage(composed, box[0], box[1], box[2], box[3], column * 320, row * 360 + 40, 320, 320);
          }
        }
        return canvas.toDataURL('image/png');
      }, { samples, raw, quality: args.includes('--quality'), box });
      await writeFile(resolve(out, args.includes('--quality') ? 'agent-quality-sheet.png' : 'agent-contact-sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
      const playback = [];
      for (let at = 0; at < 4; at += 1) {
        await page.getByLabel('Expression', { exact: true }).selectOption(String(at));
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Replay all three', exact: true }).click();
        const states = await page.evaluate(async () => {
          const samples = JSON.parse(document.getElementById('pack-data').textContent).samples;
          const position = Number((document.querySelector('select') as HTMLSelectElement).value);
          const sets = [new Set<string>(), new Set<string>(), new Set<string>()];
          for (let sample = 0; sample < 45; sample += 1) {
            [...document.querySelectorAll('.portrait')].forEach((portrait, side) => {
              const mouth = portrait.querySelectorAll<HTMLImageElement>('.so-face-overlay')[1];
              const state = mouth?.style.opacity === '1' ? mouth.src : 'closed';
              sets[side].add(state);
            });
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
          return { label: samples[position].label, modes: ['regular', 'simple', 'smooth'], states: sets.map((set) => set.size) };
        });
        playback.push(states);
        if (states.states.some((count, side) => count !== side + 1)) throw new Error('A mouth mode did not display all its expected states.');
      }
      await json(resolve(out, 'agent-playback-review.json'), { ok: true, playback, scope: 'mouth state switching only; visual contact sheet needs direct review' });
    } finally { await browser.close(); }
  } else if (args[0] === 'archive-base') {
    await mkdir(evidencePath('image-completion', 'base'), { recursive: true });
    for (const [at, file] of args.slice(1).entries()) await copyFile(resolve(file), evidencePath('image-completion', 'base', `round-${at + 1}.json`));
  } else if (args[0] === 'archive-gates') {
    const destination = resolve(flag('--destination', evidencePath('image-completion', 'gates.log')));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(args[1]), destination);
  } else throw new Error('Use build|looks --character <card name> [--group <name>] [--box x,y,w,h], rate-looks --out <dir>, pack, check, score <ratings.json>, or archive-base <run1> <run2>.');
}

await main().catch((error) => { console.error(error); process.exitCode = 1; });
