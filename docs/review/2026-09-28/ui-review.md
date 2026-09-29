# UI review — 2026-09-28 (post-rework)

Rendered on the real install: SillyTavern 1.19.0, prod build (`dist/manifest.json` bundle
`dc4a08a133cf`, 1,217,837 B), Chromium 1400×900 and 390×844, the `Adolion: The Adventurer's Road`
group chat. Evidence PNGs in this folder. These are agent observations from the rendered DOM and
screenshots, not a human playthrough.

## What was reviewed

| View | File | Verdict |
|---|---|---|
| Player drawer, desktop | `so-drawer-desktop-1400.png` | Clean two-column layout: story summary left; chat preferences and illustrations right |
| Player drawer, mobile | `so-drawer-mobile-390.png` | Stacks to one column, no horizontal overflow, all controls reachable |
| ST settings landing, desktop | `so-settings-desktop-1400.png` | Four task cards over four collapsed sections |
| General setup → Image service | (captured live) | Install vs chat scope is legible; help icons sit inside their labels |
| Studio → Story (public copy) | `so-studio-story.png` | Library description, Player introduction, requirements |
| Studio → Story (illustrations) | `so-studio-story-art.png` | Visual direction and per-member appearance, each with a help icon |
| Story drawer over ST | `so-context-desktop.png` | HUD reads “Current scene”; drawer occupies the right side |

## Findings

1. **Navigation is now task-first.** The settings panel opens on Start / Continue / Repair / Author
   cards, then This chat, General setup, Author services, Diagnostics. `Repair` stays one derived
   step; `Author` reads “Open author view in the story drawer” while a player is mid-story instead of
   offering a premature Studio, and only shows `Open Studio` when no story is playing or author view
   is on.
2. **Raw objectives no longer reach the player by default.** The recap’s “Where you are” falls back to
   “Current scene” and “About this story” uses the story’s public introduction (or, for older stories,
   its library description). The Adolion screenshot shows the spoiler-safe description, not a
   checkpoint objective.
3. **Illustration scope is explicit.** Install (Image service), story (Studio visual direction and
   cues), and chat (pause, model/quality override, manual draw, queue status) are three separate
   places; the chat panel explains why automatic images are off and keeps manual drawing available.
4. **Help is keyboard/touch friendly.** HelpTooltip is now a focusable button opening an inline note
   (Escape closes it), optionally with a reference link, rather than a hover-only `title`.

## Residual / follow-up

- **Mobile layering is an ST condition, not a defect here.** At 390 px the group-controls panel
  (`#left-nav-panel`, z-index 3000) paints over our `#drawer-manager` (`z-index: auto`) while both are
  open; the drawer is only reachable once ST’s own panels are closed. This is how ST stacks every
  top-settings-holder drawer, and forcing a z-index would fight the host. Worth confirming with the
  user whether the drawer should auto-close ST’s nav panels on open.
- **The desktop drawer was captured as an element shot** because the ST background blur covers the
  viewport; the layering is worth an eyeball on a real theme.
- **Not exercised live in this pass:** the image review grid keyboard selection, and a real render
  through the reworked panels (ComfyUI was up, but no image was drawn). Both have unit/Storybook
  coverage only.
- The Adolion story has no `player_intro` or per-checkpoint `player_name`, so it falls back to the
  description / “Current scene” exactly as designed; an authored story should be spot-checked.

## Gates at this build

`typecheck`, `typecheck:test`, `lint`, `test` (339 suites / 4,550), `test:debug` (416),
`test-storybook:ci` (269 pass, axe clean), `build:dev` + `build` + `test:release` (77 pass, 2 skip).
