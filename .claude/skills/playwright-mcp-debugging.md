# Playwright MCP: Browser Debugging & Testing

## Quick Start

Use the Playwright MCP tools to inspect and test components without opening browser windows:

```
mcp__plugin_playwright_playwright__browser_navigate
mcp__plugin_playwright_playwright__browser_evaluate
mcp__plugin_playwright_playwright__browser_take_screenshot
mcp__plugin_playwright_playwright__browser_wait_for
mcp__plugin_playwright_playwright__browser_network_requests
mcp__plugin_playwright_playwright__browser_console_messages
```

## Common Patterns

### Navigate to Storybook Story
```
Navigate directly to iframe URL (bypasses Storybook shell):
http://localhost:6006/iframe.html?id=component-name&viewMode=story
```

### Inspect Computed Styles
```javascript
// Evaluate JavaScript in browser context
() => {
  const button = document.querySelector('button');
  const s = getComputedStyle(button);
  return {
    color: s.color,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth,
  };
}
```

### Check CSS Variables
```javascript
() => {
  const root = getComputedStyle(document.documentElement);
  return {
    bodyColor: root.getPropertyValue('--SmartThemeBodyColor'),
    borderColor: root.getPropertyValue('--SmartThemeBorderColor'),
  };
}
```

### Wait for Element
Before evaluating, wait for component to render:
```
browser_wait_for(text: "Persona defined")
```

### Take Screenshots
Capture specific element or full page:
```
browser_take_screenshot(fullPage: true)
```

## Debugging Workflow

1. **Navigate** to story iframe
2. **Wait** for element to render
3. **Evaluate** to check computed styles
4. **Screenshot** if visual verification needed
5. **Compare** with expected values

## Example: Debug Button Styles

```javascript
// 1. Navigate
browser_navigate("http://localhost:6006/iframe.html?id=drawer--default&viewMode=story")

// 2. Wait for element
browser_wait_for(time: 2)

// 3. Check styles
browser_evaluate(() => {
  const btn = document.querySelector('button[aria-label="Minimize"]');
  const s = getComputedStyle(btn);
  return {
    color: s.color,        // Should be rgb(220, 220, 210)
    borderColor: s.borderColor, // Should match color
    borderWidth: s.borderWidth, // Should be > 0px
  };
})

// 4. Screenshot if needed
browser_take_screenshot(type: "png")
```

## Troubleshooting Patterns

### Element not found?
```javascript
() => {
  const el = document.querySelector('.status-indicator');
  return el ? { found: true, className: el.className } : { found: false };
}
```

### CSS scoping issue?
```javascript
() => {
  const el = document.querySelector('.status-indicator');
  return {
    element: !!el,
    hasParent: !!el?.closest('#drawer-manager'),
  };
}
```

### Style not applying?
```javascript
() => {
  const el = document.querySelector('button');
  const s = getComputedStyle(el);
  return {
    display: s.display,        // Check if display: none
    visibility: s.visibility,  // Check if visibility: hidden
    opacity: s.opacity,
  };
}
```

## Tips

- Direct iframe URLs are faster than clicking through Storybook UI
- Use `browser_wait_for()` before evaluating (wait for render)
- `getComputedStyle()` shows actual applied styles (not just CSS rules)
- Check parent elements for CSS scoping issues
- Take screenshots of failing tests for visual comparison
