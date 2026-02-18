# Storybook Component Debugging & Testing with Playwright

## Overview

This skill documents systematic techniques for debugging Storybook components using Playwright MCP, including CSS issues, styling mismatches, and component state verification. Useful for catching visual regressions, theme application failures, and DOM-level problems without manual UI inspection.

## Core Concepts

**Storybook Iframe Architecture:**
- Stories render in isolated iframes (`/iframe.html?id=component-name&viewMode=story`)
- Each iframe has its own DOM, styles, and browser context
- Styles from `preview-head.html` and `st-theme.css` apply globally to all iframes
- Component-specific decorators can wrap stories with context/providers

**Playwright in Storybook Context:**
- Direct navigation to iframe URLs bypasses Storybook shell UI
- Enables inspector access to rendered component DOM
- Allows computed style verification (getComputedStyle)
- Can intercept CSS variable values at runtime
- Useful for debugging CSS scoping issues (nested selectors, CSS-in-JS)

## Workflow: Systematic Storybook Debugging

### Phase 1: Identify the Problem

**Symptom: Component looks wrong in Storybook but right in production**

Ask:
1. Is it a styling issue? (colors, borders, fonts, spacing)
2. Is it a scoping issue? (CSS nested inside parent selector not applied)
3. Is it a missing decorator? (component needs provider/wrapper context)
4. Is it missing assets? (fonts, images, CSS files loading?)

**Initial Investigation:**
```bash
# Check browser console for CSS 404s, CORS errors
http://localhost:6006/?path=/story/your-component

# Look at preview-head.html for missing asset links
# Check preview.ts for missing decorator imports
```

### Phase 2: Access Component DOM via Direct iframe URL

Instead of clicking through Storybook UI, navigate directly to the iframe:

```
http://localhost:6006/iframe.html?id=drawer-drawerwrapper--default&viewMode=story
```

**Why:**
- Faster than clicking through sidebar
- Cleaner page with just the component
- No Storybook shell UI overlays
- Easier to inspect computed styles

### Phase 3: Inspect Computed Styles

Use Playwright's `browser_evaluate` to check what CSS is actually applied:

```javascript
// Check button border color
() => {
  const button = document.querySelector('button[aria-label="Minimize"]');
  const s = getComputedStyle(button);
  return {
    borderColor: s.borderColor,
    borderWidth: s.borderWidth,
    color: s.color,
    backgroundColor: s.backgroundColor,
  };
}

// Expected (from ST theme):
// {
//   borderColor: "rgb(220, 220, 210)",  // --SmartThemeBodyColor (ivory)
//   borderWidth: "0.666667px",
//   color: "rgb(220, 220, 210)",        // Inherited text color
//   backgroundColor: "rgba(0, 0, 0, 0)" // Transparent
// }
```

**Common Issues Found This Way:**
- Border color `rgba(0, 0, 0, 0)` instead of expected color → CSS selector not matching
- `borderWidth: "0px"` → Class not applied or CSS rule missing
- `color: rgb(0, 0, 0)` → Text color not inheriting from body → Need `color: inherit` rule
- Font family wrong → Font file not loading or CSS variable not applied

### Phase 4: Trace CSS Scoping Issues

**Problem:** Component uses class `.status-indicator` but styles don't apply

**Diagnosis Steps:**

1. Check if class is applied to DOM:
```javascript
() => {
  const el = document.querySelector('.status-indicator');
  return {
    found: !!el,
    className: el?.className,
    outerHTML: el?.outerHTML.substring(0, 150),
  };
}
```

2. Check if parent selector is in place:
```javascript
() => {
  const el = document.querySelector('.status-indicator');
  const parent = el?.closest('#drawer-manager');
  return {
    hasRequiredParent: !!parent,
    parentId: parent?.id,
  };
}
```

3. If parent missing, the CSS rule (nested like `#drawer-manager .status-indicator`) won't match.

**Solution:** Add decorator wrapper in story file:

```typescript
// src/components/common/RequirementIndicator/index.stories.tsx
const meta: Meta<typeof RequirementIndicator> = {
  component: RequirementIndicator,
  decorators: [
    (Story) => (
      <div id="drawer-manager" className="pinnedOpen">
        <Story />
      </div>
    ),
  ],
};
```

### Phase 5: Check CSS Variable Application

**Problem:** Colors not matching theme

```javascript
() => {
  const drawer = document.getElementById('drawer-manager');
  const s = getComputedStyle(drawer);

  return {
    '--SmartThemeBodyColor': s.getPropertyValue('--SmartThemeBodyColor'),
    '--SmartThemeBorderColor': s.getPropertyValue('--SmartThemeBorderColor'),
    '--SmartThemeBlurTintColor': s.getPropertyValue('--SmartThemeBlurTintColor'),
    actualTextColor: s.color,
  };
}

// Should show:
// --SmartThemeBodyColor: " rgb(220, 220, 210)"
// --SmartThemeBorderColor: " rgba(0, 0, 0, 0.5)"
// --SmartThemeBlurTintColor: " rgba(23, 23, 23, 1)"
```

If variables are empty or missing:
- Check `preview-head.html` for font loading (CORS errors block CSS?)
- Check `st-theme.css` is imported in `preview.ts`
- Check `:root { ... }` block has variable definitions

### Phase 6: Verify Style Inheritance Chain

**Problem:** Button doesn't inherit body color

```javascript
() => {
  const button = document.querySelector('button');
  const body = document.body;
  const buttonStyle = getComputedStyle(button);
  const bodyStyle = getComputedStyle(body);

  return {
    bodyColor: bodyStyle.color,
    buttonColor: buttonStyle.color,
    buttonColorInherits: buttonStyle.color === bodyStyle.color,
  };
}

// If buttonColor is "rgb(0, 0, 0)" but bodyColor is "rgb(220, 220, 210)":
// → Need CSS rule: button { color: inherit; }
```

## Advanced Techniques

### Running Headless for CI/Automation

For automated testing without opening browser windows:

```bash
# Using Playwright CLI
npx playwright test --headed=false

# Or in Node.js with Playwright API
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:6006/iframe.html?id=component&viewMode=story');

  const borderColor = await page.evaluate(() => {
    return getComputedStyle(document.querySelector('button')).borderColor;
  });

  console.log('Border color:', borderColor);
  await browser.close();
})();
```

### Running Small Browser Windows

For focused testing without full-screen windows:

```bash
# Launch Playwright with specific window size
# In playwright config or test
const page = await browser.newPage({
  viewport: { width: 400, height: 600 }  // Component preview size
});

# Or resize after opening
await page.setViewportSize({ width: 400, height: 600 });
```

### Using Snapshots for Visual Regression

Take screenshot of specific component states and compare:

```javascript
// Snapshot story states
const states = ['Ready', 'Loading', 'Error'];

for (const state of states) {
  await page.goto(`http://localhost:6006/iframe.html?id=component--${state}&viewMode=story`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `snapshots/${state}.png` });
}
```

### Automating Style Verification Tests

Create reusable style checkers:

```javascript
async function verifyComponentStyle(page, selector, expectedStyles) {
  const computed = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const s = getComputedStyle(el);
    return {
      color: s.color,
      borderColor: s.borderColor,
      backgroundColor: s.backgroundColor,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
    };
  }, selector);

  for (const [key, expected] of Object.entries(expectedStyles)) {
    if (computed[key] !== expected) {
      throw new Error(`${key}: expected ${expected}, got ${computed[key]}`);
    }
  }
}

// Usage
await verifyComponentStyle(page, 'button', {
  color: 'rgb(220, 220, 210)',           // Ivory
  borderColor: 'rgba(0, 0, 0, 0.5)',      // Dark semi-transparent
  backgroundColor: 'rgba(0, 0, 0, 0)',    // Transparent
});
```

## Common Debugging Patterns

### Pattern 1: CSS Not Applying

**Symptoms:** Class exists in HTML but computed styles show defaults

**Checklist:**
- [ ] CSS file loads (no 404 in console)
- [ ] Selector specificity high enough (no being overridden)
- [ ] Parent selector present (for nested CSS)
- [ ] CSS variable defined in `:root`

**Debug:**
```javascript
// Check if rule exists in stylesheets
() => {
  const rules = Array.from(document.styleSheets)
    .flatMap(sheet => {
      try { return Array.from(sheet.cssRules); }
      catch { return []; }
    })
    .filter(r => r.selectorText?.includes('status-indicator'));

  return rules.map(r => r.selectorText);
}
```

### Pattern 2: Font Not Loading

**Symptoms:** Text in wrong font, or no text visible

**Debug:**
```javascript
// Check loaded fonts
() => {
  return document.fonts.check('15px "Noto Sans"')
    ? 'Font loaded'
    : 'Font not loaded';
}

// Check CSS link elements
() => {
  return Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
    .map(l => ({ href: l.href, status: l.sheet ? 'loaded' : 'pending' }));
}
```

### Pattern 3: Colors Don't Match Theme

**Symptoms:** Colors are hardcoded or default instead of theme colors

**Debug:**
```javascript
// Verify all theme colors are set
() => {
  const vars = [
    '--SmartThemeBodyColor',
    '--SmartThemeBorderColor',
    '--SmartThemeBlurTintColor',
    '--SmartThemeEmColor',
  ];

  const root = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    vars.map(v => [v, root.getPropertyValue(v)])
  );
}
```

## Tips & Tricks

**Faster Debugging Loop:**
1. Modify CSS in `.storybook/st-theme.css`
2. Storybook hot-reloads automatically
3. Refresh iframe (F5) to pick up changes
4. Re-run Playwright evaluation to verify

**Finding Hidden Elements:**
```javascript
// Check if element is hidden by display: none or visibility: hidden
() => {
  const el = document.querySelector('.my-element');
  const s = getComputedStyle(el);
  return {
    display: s.display,
    visibility: s.visibility,
    opacity: s.opacity,
    pointerEvents: s.pointerEvents,
  };
}
```

**Diagnosing Scope Issues:**
```javascript
// Find all elements with a class
() => {
  const els = Array.from(document.querySelectorAll('.status-indicator'));
  return els.map(el => ({
    hasRequiredParent: !!el.closest('#drawer-manager'),
    parentChain: el.parentElement?.id + ' > ' + el.parentElement?.parentElement?.id,
  }));
}
```

**CSS Inheritance Debugging:**
```javascript
// Trace where a style is inherited from
() => {
  const el = document.querySelector('button');
  const chain = [];
  let current = el;

  while (current) {
    const s = getComputedStyle(current);
    chain.push({
      tag: current.tagName,
      color: s.color,
    });
    current = current.parentElement;
  }

  return chain;
}
```

## Best Practices

1. **Always check computed styles, not just CSS files** — CSS specificity and cascading can hide the real issue
2. **Navigate to iframe URLs directly** — Faster than clicking through Storybook
3. **Use getComputedStyle() for verification** — Only way to see what's actually applied after all CSS rules
4. **Check CSS variables at runtime** — Ensure `:root` variables are defined and propagating
5. **Verify parent selectors exist** — CSS nesting issues are the most common scoping problem
6. **Test in small windows** — Catches responsive design issues early
7. **Create reusable style checks** — Prevents regressions as codebase grows
8. **Use headless mode for CI** — Automate visual regression detection

## Real-World Example: Solving the Button Border Issue

**Problem:** Buttons in Storybook had invisible borders (dark on dark)

**Diagnosis:**
```javascript
// Step 1: Check computed border color
const button = document.querySelector('button');
const s = getComputedStyle(button);
console.log(s.borderColor); // rgba(0, 0, 0, 0.5) — too dark!
```

**Root Cause:** Button borders inherited `--SmartThemeBorderColor` (dark semi-transparent) which was invisible on dark backgrounds

**Solution:** Change CSS rule to use text color instead:
```css
button {
  color: inherit;
  border-color: var(--SmartThemeBodyColor);  /* Ivory instead of dark grey */
}
```

**Verification:**
```javascript
// Confirm fix applied
const s = getComputedStyle(document.querySelector('button'));
console.log(s.borderColor); // rgb(220, 220, 210) — visible!
```

## Related Techniques

- **CSS Scoping:** Use decorators to wrap components in required parent elements
- **Font Loading:** Verify stylesheets load with correct CORS headers
- **Theme Variables:** Check `:root` CSS variables are defined in preview setup
- **Responsive Testing:** Use small viewports to catch layout issues early
- **Accessibility:** Use `getComputedStyle()` to verify contrast ratios and visible focus states

## References

- Playwright Evaluation API: `page.evaluate()`
- Storybook iframe structure: `/iframe.html?id=component-name&viewMode=story`
- CSS Computed Styles: `window.getComputedStyle(element)`
- Storybook Decorators: `meta.decorators` in story files
