import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { decodePng, encodePng, type RgbaImage } from './lib/pngNode.mts';
import { cleanEdges, edgeReport } from '../../src/sprites/builder/edges.ts';
import { seamScore } from '../../src/sprites/builder/seam.ts';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { raterPrompt, readRating, summarize, type SheetRating } from './lib/sheetRater.mts';

const USAGE = `Usage: node scripts/debug/so-image-bench.mts edges <raw dir> --out <dir>
       node scripts/debug/so-image-bench.mts seams <raw dir>
       node scripts/debug/so-image-bench.mts sheets <raw dir> --out <dir>
       node scripts/debug/so-image-bench.mts rate <sheets dir>... [--model gpt-6.1-sol]

Plan 80 bench, CPU only. Walks <raw dir>/<character>/<set>/*.png for full-body sprites (base sets and lp_/look_ sets,
not anim- frames or busts), runs the edge clean-up, and writes edges.json (fringe and bright-fringe counts before and
after, per image) plus before/after composites over a dark and a light background. seams prints the border
score of every saved face frame (anim-<set>/<label>.<kind>.png) against its base sprite. sheets writes two contact
sheets per character for the rater: <name>.faces.png (base neutral, expressions, then each frame over its base)
and <name>.bodies.png (base neutral, then every posed body and changed look), over mid grey, with sheets.json
listing the panels in order. rate sends each sheet once to the rater through codex exec (read-only sandbox) and
writes ratings.json with the identity share and the sheets flagged for an edge, eye or rectangle defect.`;

const over = (image: RgbaImage, [r, g, b]: [number, number, number]): RgbaImage => {
  const data = new Uint8ClampedArray(image.data.length);
  for (let at = 0; at < data.length; at += 4) {
    const a = image.data[at + 3] / 255;
    data[at] = image.data[at] * a + r * (1 - a); data[at + 1] = image.data[at + 1] * a + g * (1 - a); data[at + 2] = image.data[at + 2] * a + b * (1 - a); data[at + 3] = 255;
  }
  return { ...image, data };
};

const side = (left: RgbaImage, right: RgbaImage): RgbaImage => {
  const width = left.width + right.width, height = Math.max(left.height, right.height), data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (y < left.height) data.set(left.data.subarray(y * left.width * 4, (y + 1) * left.width * 4), y * width * 4);
    if (y < right.height) data.set(right.data.subarray(y * right.width * 4, (y + 1) * right.width * 4), (y * width + left.width) * 4);
  }
  return { width, height, data };
};

async function fullBodies(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const character of await readdir(root, { withFileTypes: true })) {
    if (!character.isDirectory()) continue;
    for (const set of await readdir(join(root, character.name), { withFileTypes: true })) {
      if (!set.isDirectory() || set.name.startsWith('anim-') || set.name.startsWith('visual_')) continue;
      for (const file of await readdir(join(root, character.name, set.name))) if (file.endsWith('.png')) out.push(join(root, character.name, set.name, file));
    }
  }
  return out.sort();
}

async function edges(root: string, outDir: string) {
  await mkdir(outDir, { recursive: true });
  const rows = [];
  for (const path of await fullBodies(root)) {
    const image = decodePng(await readFile(path));
    const { image: cleaned, report } = cleanEdges(image);
    const after = edgeReport(cleaned);
    const name = path.slice(root.length + 1).replace(/[\\/]/g, '__').replace(/\.png$/, '');
    await writeFile(join(outDir, `${name}.dark.png`), encodePng(side(over(image, [30, 30, 30]), over(cleaned, [30, 30, 30]))));
    await writeFile(join(outDir, `${name}.light.png`), encodePng(side(over(image, [236, 236, 236]), over(cleaned, [236, 236, 236]))));
    rows.push({ image: name, size: [image.width, image.height], before: { fringe: report.fringe, bright: report.bright, drift: report.drift }, after, recoloured: report.recoloured, dropped: report.dropped });
    console.log(`${basename(path)} ${name}: bright ${report.bright} -> ${after.bright}, fringe ${report.fringe} -> ${after.fringe}`);
  }
  await writeFile(join(outDir, 'edges.json'), JSON.stringify(rows, null, 1));
}

async function seams(root: string) {
  for (const character of await readdir(root, { withFileTypes: true })) {
    if (!character.isDirectory()) continue;
    for (const set of await readdir(join(root, character.name), { withFileTypes: true })) {
      if (!set.isDirectory() || !set.name.startsWith('anim-')) continue;
      const baseDir = join(root, character.name, set.name.slice(5));
      for (const file of await readdir(join(root, character.name, set.name))) {
        const match = /^(.+)\.([a-z_0-9]+)\.png$/.exec(file);
        if (!match || !existsSync(join(baseDir, `${match[1]}.png`))) continue;
        const base = decodePng(await readFile(join(baseDir, `${match[1]}.png`))), frame = decodePng(await readFile(join(root, character.name, set.name, file)));
        console.log(`${character.name} ${set.name}/${file}: seam ${seamScore(base, frame) ?? 'n/a'}`);
      }
    }
  }
}

const shrink = (image: RgbaImage, height: number): RgbaImage => {
  const scale = image.height / height, width = Math.max(1, Math.round(image.width / scale)), data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sum = [0, 0, 0, 0];
    let count = 0;
    for (let sy = Math.floor(y * scale); sy < Math.min(image.height, Math.floor((y + 1) * scale)); sy++)
      for (let sx = Math.floor(x * scale); sx < Math.min(image.width, Math.floor((x + 1) * scale)); sx++) {
        const at = (sy * image.width + sx) * 4;
        for (let c = 0; c < 4; c++) sum[c] += image.data[at + c];
        count++;
      }
    for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = count ? sum[c] / count : 0;
  }
  return { width, height, data };
};

const overlay = (base: RgbaImage, frame: RgbaImage): RgbaImage => {
  const data = new Uint8ClampedArray(base.data);
  for (let at = 0; at < data.length; at += 4) {
    const a = frame.data[at + 3] / 255;
    for (let c = 0; c < 3; c++) data[at + c] = frame.data[at + c] * a + base.data[at + c] * (1 - a);
  }
  return { ...base, data };
};

async function sheets(root: string, outDir: string) {
  await mkdir(outDir, { recursive: true });
  const index: Record<string, string[]> = {};
  const grey: [number, number, number] = [128, 128, 128];
  for (const character of await readdir(root, { withFileTypes: true })) {
    if (!character.isDirectory()) continue;
    const dir = join(root, character.name), sets = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const baseSet = sets.find((set) => !/^(anim-|lp_|look_|visual_)/.test(set));
    if (!baseSet) continue;
    const read = async (path: string) => decodePng(await readFile(path));
    const base = await read(join(dir, baseSet, 'neutral.png'));
    const faces: Array<[string, RgbaImage]> = [['base neutral', base]];
    for (const label of ['happy', 'angry', 'worried']) if (existsSync(join(dir, baseSet, `${label}.png`))) faces.push([`expression ${label}`, await read(join(dir, baseSet, `${label}.png`))]);
    const bodies: Array<[string, RgbaImage]> = [['base neutral', base]];
    for (const set of sets.filter((name) => /^(lp_|look_)/.test(name)).sort()) {
      for (const file of (await readdir(join(dir, set))).filter((name) => name.endsWith('.png')).sort()) bodies.push([`${set.startsWith('lp_') ? 'posed' : 'changed look'} ${file.replace('.png', '')}`, await read(join(dir, set, file))]);
    }
    for (const set of sets.filter((name) => name.startsWith('anim-')).sort()) {
      for (const file of (await readdir(join(dir, set))).filter((name) => name.endsWith('.png')).sort()) {
        const label = file.split('.')[0], owner = join(dir, set.slice(5), `${label}.png`);
        if (existsSync(owner)) faces.push([`frame ${set.slice(5)} ${file.replace('.png', '')}`, overlay(await read(owner), await read(join(dir, set, file)))]);
      }
    }
    for (const [kind, panels] of [['faces', faces], ['bodies', bodies]] as const) {
      const shown = panels.map(([, image]) => shrink(over(image, grey), 520));
      const sheet = shown.reduce((left, right) => side(left, right));
      const name = `${character.name}.${kind}`;
      await writeFile(join(outDir, `${name}.png`), encodePng(sheet));
      index[name] = panels.map(([label]) => label);
      console.log(`${name}: ${panels.length} panels`);
    }
  }
  await writeFile(join(outDir, 'sheets.json'), JSON.stringify(index, null, 1));
}

async function rate(dirs: string[], model: string) {
  const ratings: SheetRating[] = [];
  for (const dir of dirs) {
    const index = JSON.parse(await readFile(join(dir, 'sheets.json'), 'utf8')) as Record<string, string[]>;
    for (const [name, panels] of Object.entries(index)) {
      const answer = join(tmpdir(), `so-rate-${process.pid}.txt`);
      execFileSync('codex', ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-m', model, '-i', JSON.stringify(join(dir, `${name}.png`)),
        '-o', JSON.stringify(answer), '-'], { input: raterPrompt(panels), stdio: ['pipe', 'ignore', 'inherit'], timeout: 600_000, shell: true });
      const rating = readRating(`${basename(dir)}/${name}`, panels, await readFile(answer, 'utf8'));
      ratings.push(rating);
      console.log(`${rating.sheet}: same ${rating.same.filter((row) => row.same).length}/${rating.same.length}, defects ${rating.defects.map((row) => `${row.panel}:${row.kind}`).join(' ') || 'none'}`);
    }
  }
  const summary = summarize(ratings);
  await writeFile(join(dirs[0], 'ratings.json'), JSON.stringify({ model, summary, ratings }, null, 1));
  console.log(JSON.stringify(summary));
}

const [command, dir] = process.argv.slice(2);
const outAt = process.argv.indexOf('--out');
if (command === 'seams' && dir && existsSync(dir)) await seams(resolve(dir));
else if (command === 'rate' && dir) await rate(process.argv.slice(3).filter((arg, at, all) => !arg.startsWith('--') && all[at - 1] !== '--model').map((arg) => resolve(arg)),
  process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'gpt-6.1-sol');
else if (command === 'sheets' && dir && existsSync(dir) && outAt > 0) await sheets(resolve(dir), resolve(process.argv[outAt + 1]));
else if (command !== 'edges' || !dir || outAt < 0 || !existsSync(dir)) { console.log(USAGE); process.exit(command ? 1 : 0); }
else await edges(resolve(dir), resolve(process.argv[outAt + 1]));
