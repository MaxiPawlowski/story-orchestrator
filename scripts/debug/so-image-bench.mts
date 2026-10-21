import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { decodePng, encodePng, type RgbaImage } from './lib/pngNode.mts';
import { cleanEdges, edgeReport } from '../../src/sprites/builder/edges.ts';
import { seamScore } from '../../src/sprites/builder/seam.ts';

const USAGE = `Usage: node scripts/debug/so-image-bench.mts edges <raw dir> --out <dir>
       node scripts/debug/so-image-bench.mts seams <raw dir>

Plan 80 bench, CPU only. Walks <raw dir>/<character>/<set>/*.png for full-body sprites (base sets and lp_/look_ sets,
not anim- frames or busts), runs the edge clean-up, and writes edges.json (fringe and bright-fringe counts before and
after, per image) plus before/after composites over a dark and a light background. seams prints the border
score of every saved face frame (anim-<set>/<label>.<kind>.png) against its base sprite.`;

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

const [command, dir] = process.argv.slice(2);
const outAt = process.argv.indexOf('--out');
if (command === 'seams' && dir && existsSync(dir)) await seams(resolve(dir));
else if (command !== 'edges' || !dir || outAt < 0 || !existsSync(dir)) { console.log(USAGE); process.exit(command ? 1 : 0); }
else await edges(resolve(dir), resolve(process.argv[outAt + 1]));
