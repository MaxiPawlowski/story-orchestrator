---
name: debug-ui
description: Debug Storybook and SillyTavern UI with Playwright workflows
compatibility: opencode
metadata:
  audience: maintainers
  workflow: ui-debugging
  tools: playwright
---

## What I do

- Open SillyTavern Extensions + Project Story UI in one step via tool
- Navigate directly to Storybook iframe stories and SillyTavern pages
- Inspect computed styles and CSS variables with browser-side evaluation
- Validate rendering state before assertions using waits and snapshots
- Capture screenshots for visual verification and regressions
- Provide a fast, repeatable UI debugging flow with Playwright tools

## When to use me

Use this when UI styling or behavior looks wrong and you need quick, reproducible debugging.

## Quick Start

If you are validating Story Orchestrator settings in SillyTavern, run this first:

```
openProjectStorySettings
```

Use these tools in order:

```
playwright_browser_navigate
playwright_browser_wait_for
playwright_browser_snapshot
playwright_browser_evaluate
playwright_browser_take_screenshot
```

## Added Tool

`openProjectStorySettings`

- Opens SillyTavern URL (default `http://127.0.0.1:8000/`)
- Ensures the cubes settings panel is open
- Expands `Extensions` and then `Project Story`
- Waits for `#story-library-select` so the section is ready for style assertions

## Common Targets

Storybook iframe:

```
http://localhost:6006/iframe.html?id=component-name&viewMode=story
```

SillyTavern:

```
http://127.0.0.1:8000/
```

## Common Checks

Computed styles:

```javascript
() => {
  const button = document.querySelector('button');
  if (!button) return { found: false };
  const s = getComputedStyle(button);
  return {
    found: true,
    color: s.color,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth,
  };
}
```

Theme variables:

```javascript
() => {
  const root = getComputedStyle(document.documentElement);
  return {
    bodyColor: root.getPropertyValue('--SmartThemeBodyColor'),
    borderColor: root.getPropertyValue('--SmartThemeBorderColor'),
  };
}
```

Missing element detection:

```javascript
() => {
  const el = document.querySelector('.status-indicator');
  return el ? { found: true, className: el.className } : { found: false };
}
```

## Workflow

1. Navigate to direct iframe or target page.
2. Wait for key text or a short fixed delay.
3. Snapshot page structure.
4. Evaluate styles/state on target elements.
5. Capture screenshot if visual evidence is needed.
