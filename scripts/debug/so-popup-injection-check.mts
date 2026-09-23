import { connectToST } from './lib/connection.mts';

const OUT = 'test/findings/mutations/V1-live-delete-popup.png';

const { browser, page } = await connectToST();
try {
  const before = await page.evaluate(() => ({ xss: (window as any).__soXss, chat: (window as any).SillyTavern.getContext().chatId, storyId: (window as any).storyOrchestratorRuntime.getSnapshot().storyId }));
  await page.click('#so-delete-story');
  await page.waitForSelector('dialog.popup[open] .popup-content', { timeout: 10000 });
  await page.waitForTimeout(800);
  const probe = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('dialog.popup[open]')].pop() as HTMLElement;
    const content = dialog.querySelector('.popup-content') as HTMLElement;
    return { text: content.textContent, imgsInContent: content.querySelectorAll('img').length, xss: (window as any).__soXss, markup: content.innerHTML.slice(0, 400) };
  });
  await page.screenshot({ path: OUT, timeout: 5000 }).catch(() => console.log('screenshot skipped'));
  await page.click('dialog.popup[open] .popup-button-cancel');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ xss: (window as any).__soXss, stillInLibrary: (window as any).storyOrchestratorRuntime.getSnapshot().library.some((s: { id: string }) => s.id === 'so-v1-hostile') }));
  const verdict = probe.imgsInContent === 0 && probe.xss === 0 && after.xss === 0 && probe.text.includes('<img src=x onerror=');
  console.log(JSON.stringify({ before, probe, after, verdict: verdict ? 'PASS' : 'FAIL' }, null, 2));
  process.exitCode = verdict ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
}
