# Playwright: Headless & Small Windows

## Headless Mode

Run Playwright without GUI (CI/automation):

```javascript
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
// ... tests
await browser.close();
```

## Small Window Testing

Isolate components in small viewport:

```javascript
const page = await browser.newPage({
  viewport: { width: 400, height: 600 },
});
```

Common viewports:
- Mobile: 375×667
- Tablet: 768×1024
- Component preview: 800×600

## Verify Styles (No Visuals)

```javascript
// Headless: can't see UI, must check DOM
const color = await page.evaluate(() => {
  return getComputedStyle(document.querySelector('button')).color;
});

if (color !== 'rgb(220, 220, 210)') {
  throw new Error(`Wrong color: ${color}`);
}
```

## Common Pattern: Test Multiple Stories

```javascript
const browser = await chromium.launch({ headless: true });
const stories = ['button--primary', 'button--disabled'];

for (const storyId of stories) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(`http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`);

  // Assert styles
  const visible = await page.isVisible('button');
  if (!visible) throw new Error(`${storyId} not visible`);

  await page.close();
}

await browser.close();
```

## CI Integration (GitHub Actions)

```yaml
- name: Wait for Storybook
  run: npx wait-on http://localhost:6006

- name: Run tests
  run: npx playwright test --headed=false
```

## Tips

- Close pages immediately: `await page.close()` (free memory)
- Wait for network: `await page.goto(url, { waitUntil: 'networkidle' })`
- Reuse page for multiple stories (shared cache)
- Parallel execution: launch multiple browsers for different stories
- Enable debug: `process.env.DEBUG = 'pw:api'`
