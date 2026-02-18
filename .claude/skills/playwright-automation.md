# Playwright Automation: Headless Testing & Small Windows

## Overview

Techniques for running Playwright-based component tests in headless mode (for CI/automation) and small windows (for focused testing), with practical examples for Storybook component verification.

## Core Concepts

**Headless Mode:**
- Runs browser without GUI (no visible window)
- Ideal for CI/CD pipelines, automated testing, server environments
- Faster execution, lower resource usage
- No access to visual UI (must rely on DOM inspection)

**Small Window Testing:**
- Isolates component rendering in minimal viewport
- Catches responsive design issues early
- Reduces visual noise for focused debugging
- Useful for mobile/tablet viewport testing

## Setup: Playwright Configuration

### Headless Mode Configuration

```javascript
// playwright.config.js (if using Playwright test runner)
export default {
  use: {
    headless: true,  // Run all tests headless
    // Optional: configure timeout for headless environments
    timeout: 30000,
  },
  workers: 4,  // Parallel test execution
};

// Or in code with Playwright API
const browser = await chromium.launch({
  headless: true,
  // Optional: pass headless-specific args
  args: [
    '--disable-gpu',           // Disable GPU acceleration
    '--disable-dev-shm-usage', // Use disk instead of shared memory
  ],
});
```

### Small Window Configuration

```javascript
// Set viewport size when creating page
const page = await browser.newPage({
  viewport: {
    width: 400,
    height: 600,
  },
});

// Or resize existing page
await page.setViewportSize({ width: 400, height: 600 });

// Common component preview sizes
const viewports = {
  mobile: { width: 375, height: 667 },      // iPhone
  tablet: { width: 768, height: 1024 },     // iPad
  desktop: { width: 1920, height: 1080 },   // Full screen
  storybook: { width: 800, height: 600 },   // Typical story canvas
};
```

## Workflow: Headless Component Testing

### 1. Launch Browser in Headless Mode

```javascript
import { chromium } from 'playwright';

async function testStoryComponent() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
    });

    // Your tests here...
  } finally {
    await browser.close();
  }
}
```

### 2. Navigate to Storybook Story

```javascript
// Direct iframe URL for faster loading
const storyId = 'drawer-drawerwrapper--default';
await page.goto(
  `http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`,
  { waitUntil: 'networkidle' }  // Wait for all assets
);
```

### 3. Wait for Component Rendering

```javascript
// Wait for specific element to be present
await page.waitForSelector('button[aria-label="Minimize"]', { timeout: 5000 });

// Or wait for custom condition
await page.waitForFunction(() => {
  const el = document.querySelector('.status-indicator');
  return el && getComputedStyle(el).color !== 'rgb(0, 0, 0)';
}, { timeout: 5000 });
```

### 4. Evaluate Component State

```javascript
// Get computed styles without visual inspection
const styles = await page.evaluate(() => {
  const button = document.querySelector('button');
  const s = getComputedStyle(button);

  return {
    visible: s.display !== 'none',
    color: s.color,
    borderColor: s.borderColor,
    fontSize: s.fontSize,
  };
});

console.log('Button styles:', styles);
```

### 5. Assert Styles Match Expected

```javascript
// Verify styling in headless environment
const assertButtonStyle = async (page, expected) => {
  const computed = await page.evaluate(() => {
    const btn = document.querySelector('button');
    const s = getComputedStyle(btn);
    return {
      color: s.color,
      borderColor: s.borderColor,
      backgroundColor: s.backgroundColor,
    };
  });

  for (const [key, value] of Object.entries(expected)) {
    if (computed[key] !== value) {
      throw new Error(
        `${key}: expected "${value}", got "${computed[key]}"`
      );
    }
  }

  console.log('✓ Button styles verified');
};

await assertButtonStyle(page, {
  color: 'rgb(220, 220, 210)',           // Ivory
  borderColor: 'rgb(220, 220, 210)',     // Light border
  backgroundColor: 'rgba(0, 0, 0, 0)',   // Transparent
});
```

## Practical Examples

### Example 1: Verify Component Renders Without Errors

```javascript
async function testComponentLoads() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate to story
    const response = await page.goto(
      'http://localhost:6006/iframe.html?id=button--default&viewMode=story'
    );

    // Check HTTP status
    if (!response.ok()) {
      throw new Error(`Failed to load story: ${response.status()}`);
    }

    // Check for console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForLoadState('networkidle');

    if (errors.length > 0) {
      throw new Error(`Console errors: ${errors.join('\n')}`);
    }

    console.log('✓ Component loaded successfully');
  } finally {
    await browser.close();
  }
}
```

### Example 2: Test Multiple Stories in Sequence

```javascript
async function testMultipleStories() {
  const browser = await chromium.launch({ headless: true });
  const stories = ['button--primary', 'button--secondary', 'button--disabled'];

  try {
    for (const storyId of stories) {
      const page = await browser.newPage({ viewport: { width: 400, height: 300 } });

      await page.goto(
        `http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`
      );

      // Verify button is visible
      const isVisible = await page.isVisible('button');
      console.log(`✓ ${storyId}: visible=${isVisible}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
}
```

### Example 3: Test Responsive Layout in Multiple Viewports

```javascript
async function testResponsiveComponent() {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 },
  ];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });

      await page.goto(
        'http://localhost:6006/iframe.html?id=drawer--default&viewMode=story'
      );

      // Check if component fits in viewport
      const bounds = await page.evaluate(() => {
        const el = document.querySelector('[id="drawer-manager"]');
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          fitsInViewport: rect.width <= window.innerWidth,
        };
      });

      console.log(`✓ ${viewport.name}: ${JSON.stringify(bounds)}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
```

### Example 4: CSS Variables Verification

```javascript
async function verifyCSSVariables() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:6006/iframe.html?id=any-story&viewMode=story');

    // Check all theme variables are set
    const vars = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);

      return {
        bodyColor: root.getPropertyValue('--SmartThemeBodyColor'),
        borderColor: root.getPropertyValue('--SmartThemeBorderColor'),
        bgColor: root.getPropertyValue('--SmartThemeBlurTintColor'),
        emColor: root.getPropertyValue('--SmartThemeEmColor'),
      };
    });

    // Verify none are empty
    for (const [name, value] of Object.entries(vars)) {
      if (!value || value.trim() === '') {
        throw new Error(`CSS variable ${name} not set`);
      }
    }

    console.log('✓ All CSS variables verified:', vars);
  } finally {
    await browser.close();
  }
}
```

### Example 5: Screenshot Testing (Headless)

```javascript
async function captureStoryScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  const stories = ['button--primary', 'button--disabled', 'button--loading'];

  try {
    for (const storyId of stories) {
      await page.goto(
        `http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`,
        { waitUntil: 'networkidle' }
      );

      // Take screenshot for visual regression testing
      await page.screenshot({
        path: `./snapshots/${storyId}.png`,
        fullPage: false,
      });

      console.log(`✓ Saved snapshot: ${storyId}.png`);
    }
  } finally {
    await browser.close();
  }
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/storybook-test.yml
name: Storybook Component Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Install Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Start Storybook in background
        run: npm run storybook &
        # Wait for Storybook to start
      - name: Wait for Storybook
        run: npx wait-on http://localhost:6006

      - name: Run component tests
        run: npx playwright test storybook-tests.js
        env:
          DEBUG: 'pw:api'  # Enable debug logging

      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: snapshots
          path: ./snapshots/
```

### Test File Example

```javascript
// storybook-tests.js
import { chromium } from 'playwright';

async function runAllTests() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu'],
  });

  const results = {
    passed: [],
    failed: [],
  };

  try {
    const tests = [
      {
        name: 'Button renders',
        test: testButtonRenders,
      },
      {
        name: 'CSS variables applied',
        test: testCSSVariables,
      },
      {
        name: 'Fonts loaded',
        test: testFontsLoaded,
      },
    ];

    for (const { name, test } of tests) {
      try {
        await test(browser);
        results.passed.push(name);
        console.log(`✓ ${name}`);
      } catch (error) {
        results.failed.push({ name, error: error.message });
        console.error(`✗ ${name}: ${error.message}`);
      }
    }

    // Print summary
    console.log(`\nResults: ${results.passed.length} passed, ${results.failed.length} failed`);

    if (results.failed.length > 0) {
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

runAllTests();
```

## Performance Tips

### Optimize Headless Execution

```javascript
// Use multiple workers for parallel execution
const browsers = await Promise.all([
  chromium.launch({ headless: true }),
  chromium.launch({ headless: true }),
  chromium.launch({ headless: true }),
]);

// Distribute tests across browsers
const testChunks = chunkArray(stories, 3);
await Promise.all(
  testChunks.map((chunk, i) => testChunk(chunk, browsers[i]))
);

await Promise.all(browsers.map(b => b.close()));
```

### Reduce Memory Usage

```javascript
// Close pages immediately after testing
for (const storyId of stories) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:6006/iframe.html?id=${storyId}`);
  // Test...
  await page.close();  // Important: free memory
}
```

### Cache Resources

```javascript
// Reuse page for multiple stories in same session
const page = await browser.newPage();

for (const storyId of stories) {
  // Navigate without closing page
  await page.goto(`http://localhost:6006/iframe.html?id=${storyId}`);
  // Tests share network cache
}

await page.close();
```

## Debugging Headless Tests

### Enable Debug Logging

```javascript
// Set environment variable
process.env.DEBUG = 'pw:api,pw:browser';

// Or in browser launch
const browser = await chromium.launch({
  headless: true,
  slowMo: 100,  // Slow down for debugging
});
```

### Capture Console Logs

```javascript
const logs = [];

page.on('console', msg => {
  logs.push({
    type: msg.type(),
    text: msg.text(),
  });
});

// Later: inspect logs for errors
const errors = logs.filter(l => l.type === 'error');
if (errors.length > 0) {
  console.error('Browser errors:', errors);
}
```

### Generate Test Reports

```javascript
// Use Playwright's built-in reporting
import { test, expect } from '@playwright/test';

test('button styles', async ({ page }) => {
  await page.goto('http://localhost:6006/iframe.html?id=button--primary');

  const color = await page.evaluate(() => {
    return getComputedStyle(document.querySelector('button')).color;
  });

  expect(color).toBe('rgb(220, 220, 210)');
});
```

## Best Practices

1. **Always close browsers** — Use try/finally to prevent resource leaks
2. **Wait for network idle** — Ensure all assets load before testing
3. **Use small viewports** — Reduces memory, faster execution
4. **Parallelize tests** — Multiple browsers for CI environments
5. **Capture console logs** — Headless environments hide browser errors
6. **Verify DOM, not visuals** — Use getComputedStyle() instead of screenshots
7. **Test multiple viewports** — Catch responsive issues early
8. **Implement retry logic** — Handle flaky network in CI

## References

- Playwright API: https://playwright.dev/docs/api/class-browser
- Headless mode: https://playwright.dev/docs/api/class-browserlaunchcontext
- Viewport sizing: https://playwright.dev/docs/emulation
- CI/CD integration: https://playwright.dev/docs/ci
