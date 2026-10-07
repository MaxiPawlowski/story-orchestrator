import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('test/measurements/v2.7/saga-main-cast');
const browser = await chromium.launch({ headless: true });
const report: any = { at: new Date().toISOString(), ok: false };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(resolve(out, 'index.html')).href);
  await page.getByRole('heading', { name: 'The Saga — protagonistas' }).waitFor();
  report.images = await page.evaluate(async () => {
    const bundle = JSON.parse(document.getElementById('pack-data')!.textContent!);
    const failures = [];
    let images = 0;
    for (const sample of bundle.samples) {
      let size;
      for (const kind of ['base', 'blink', 'talk']) {
        const bitmap = await createImageBitmap(await (await fetch(sample[kind])).blob());
        if (size && (bitmap.width !== size[0] || bitmap.height !== size[1])) failures.push(`${sample.id}/${kind}`);
        size = [bitmap.width, bitmap.height]; bitmap.close(); images++;
      }
    }
    return { pack: bundle.id, characters: new Set(bundle.samples.map((s) => s.name)).size, expressions: bundle.samples.length, images, failures };
  });
  if (report.images.characters !== 8 || report.images.expressions !== 119 || report.images.images !== 357 || report.images.failures.length) throw new Error('Complete pack decode failed.');
  const samples = JSON.parse(await readFile(resolve(out, 'samples.json'), 'utf8'));
  report.controls = [];
  for (const name of [...new Set(samples.map((row) => row.name))] as string[]) {
    await page.getByLabel('Personaje', { exact: true }).selectOption(name);
    const expected = samples.filter((row) => row.name === name).length;
    const offered = await page.getByLabel('Expresión', { exact: true }).locator('option').count();
    if (offered !== expected) throw new Error(`Expression selector lacks ${name} frames.`);
    await page.getByLabel('Expresión', { exact: true }).selectOption({ label: 'neutral' });
    await page.locator('.portrait img').first().evaluate(async (image: HTMLImageElement) => await image.decode());
    report.controls.push({ name, expressions: offered });
  }
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Reproducir', exact: true }).waitFor();
  report.pause = true;
  await page.getByLabel('Encuadre', { exact: true }).selectOption('1');
  await page.setViewportSize({ width: 390, height: 844 });
  report.mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (report.mobile.scrollWidth > report.mobile.width) throw new Error('Mobile overflow.');
  await page.screenshot({ path: resolve(out, 'review-mobile.png'), fullPage: true });
  report.ok = true;
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(resolve(out, 'pack-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
