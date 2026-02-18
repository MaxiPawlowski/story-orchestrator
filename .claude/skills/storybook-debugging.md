# Storybook Debugging with Playwright

## Quick Reference

**Direct iframe access** (faster than clicking through Storybook):
```
http://localhost:6006/iframe.html?id=component-name&viewMode=story
```

## Common Issues & Fixes

### CSS Not Applying
- Check if parent selector exists: `.status-indicator` scoped as `#drawer-manager .status-indicator`?
- Add decorator if missing: `<div id="drawer-manager"><Story /></div>`

### Invisible Buttons/Text
```javascript
// Check computed styles
const s = getComputedStyle(document.querySelector('button'));
console.log(s.color, s.borderColor);

// Likely fix: buttons need color inheritance
button { color: inherit; border-color: var(--ThemeColor); }
```

### Colors Don't Match Theme
```javascript
// Verify CSS variables exist
const root = getComputedStyle(document.documentElement);
root.getPropertyValue('--SmartThemeBodyColor');
```

Check `preview.ts` imports `st-theme.css` with `:root` definitions.

### Fonts Not Loading
Check `preview-head.html` for CORS errors on font links. Use staticDirs to serve from same origin.

## Workflow

1. Navigate to direct iframe URL
2. Open DevTools → Evaluate computed styles
3. Check parent elements for CSS scoping
4. Verify CSS variables in `:root`
5. Add missing decorators to story files

## Debugging Helpers

```javascript
// Check CSS variable
getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBodyColor')

// Find elements with class
document.querySelectorAll('.status-indicator')

// Verify inheritance chain
const el = document.querySelector('button');
const s = getComputedStyle(el);
const bodyS = getComputedStyle(document.body);
console.log({ buttonColor: s.color, bodyColor: bodyS.color });
```
