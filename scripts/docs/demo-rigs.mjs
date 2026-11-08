import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(root, '.build/demo-art/raw/busts');
const OUT = path.join(root, 'docs/guide/assets/showcase');
const RIGS = path.join(root, 'docs/guide/showcase/animated-character/rigs');
const USAGE = `Usage: node scripts/docs/demo-rigs.mjs [name...]
Builds a live-head rig for each published bust (docs/guide/assets/showcase/characters/<name>.png) from the face
detector's landmarks (.build/demo-art/raw/busts/<name>.detect.json), running the product's rig synthesis in a headless
browser (run node scripts/docs/demo-bundle.mjs rig first). Writes docs/guide/showcase/animated-character/rigs/<name>.rig.json (the page dir, copied whole by the site).`;

if (process.argv.includes('--help')) { console.log(USAGE); process.exit(0); }
const bundle = await readFile(path.join(root, '.build/demo-art/rig-build.js'), 'utf8');
const server = createServer((request, response) => {
    if (request.url === '/rig-build.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bundle); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><script src="/rig-build.js"></script>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
let failed = 0;
try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
    const names = wanted.length ? wanted : (await readdir(RAW)).filter((file) => file.endsWith('.detect.json')).map((file) => file.replace('.detect.json', ''));
    await mkdir(RIGS, { recursive: true });
    for (const name of names) {
        const detect = JSON.parse(await readFile(path.join(RAW, `${name}.detect.json`), 'utf8'));
        const png = (await readFile(path.join(OUT, 'characters', `${name}.png`))).toString('base64');
        const [member, look] = name.includes('-') ? name.split('-') : [name, 'base'];
        const detector = { width: detect.width, height: detect.height, faces: [detect.face] };
        try {
            const result = await page.evaluate((input) => globalThis.soBuildDemoRig(input), { member, look, png, face: detect.face, detector });
            const file = path.join(RIGS, `${name}.rig.json`);
            await writeFile(file, `${JSON.stringify(result.manifest)}\n`);
            console.log(`${name}: ${result.check?.status ?? 'no check'} ${JSON.stringify(result.check?.warnings ?? [])} -> ${path.relative(root, file)}`);
        } catch (error) {
            failed++;
            console.error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
} finally {
    await browser.close();
    server.close();
}
process.exit(failed ? 1 : 0);
