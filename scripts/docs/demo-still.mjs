import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUIDE = path.join(root, 'docs/guide');
const OUT = path.join(GUIDE, 'assets/showcase/stills');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const USAGE = `Usage: node scripts/docs/demo-still.mjs
Serves docs/guide on 127.0.0.1, opens showcase/animated-character, waits for the live head and saves a still of each
character to docs/guide/assets/showcase/stills/<id>-live.webp with its sidecar.`;
if (process.argv.includes('--help')) { console.log(USAGE); process.exit(0); }

const server = createServer(async (request, response) => {
    const file = path.join(GUIDE, decodeURIComponent(new URL(request.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!file.startsWith(GUIDE)) { response.writeHead(403); response.end(); return; }
    try { response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); response.end(await readFile(file)); }
    catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const build = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: 'light' });
    await page.goto(`http://127.0.0.1:${server.address().port}/showcase/animated-character/`);
    const data = JSON.parse(await readFile(path.join(GUIDE, 'showcase/animated-character/demo.json'), 'utf8'));
    await mkdir(OUT, { recursive: true });
    for (const character of data.characters) {
        await page.getByRole('button', { name: character.name.replace(/^SO-Demo /, ''), exact: true }).click();
        await page.waitForFunction(() => document.querySelector('canvas.so-live-head')?.dataset.liveHeadReady === 'true' || document.querySelector('canvas.so-live-head')?.dataset.liveHeadError, undefined, { timeout: 30000 });
        await page.waitForTimeout(1500);
        const png = path.join(OUT, `${character.id}-live.png`);
        await page.locator('.demo-stage').screenshot({ path: png });
        const webp = png.replace(/\.png$/, '.webp');
        execFileSync('python', ['-I', '-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im.thumbnail((640,640));im.save(sys.argv[2],"WEBP",quality=82,method=6)', png, webp]);
        await writeFile(`${webp}.json`, `${JSON.stringify({ build, licence: 'Screenshot of this repository\'s live-head demo page; art as listed in LICENSES.md (Qwen-Image-2512, Apache-2.0).', source: 'scripts/docs/demo-still.mjs (headless Chromium, SwiftShader WebGL)', member: character.name }, null, 2)}\n`);
        await (await import('node:fs/promises')).rm(png);
        console.log(path.relative(root, webp));
    }
} finally {
    await browser.close();
    server.close();
}
