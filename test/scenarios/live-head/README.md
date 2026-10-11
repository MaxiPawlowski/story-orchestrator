# Live-head browser fixture

Three synthetic members use the owned geometric Storybook bust. `rig.json` is the
rig recipe: the runner clones its template for each member and both looks, routes
the nine PNG layers locally, and creates marked `SOLH` cards, sprite packs and a group.
`story.json` is an ordinary format-2 story, not a scenario-runner document.

```bash
ST_DEBUG_VIEWPORT=1440x844 node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-live-head-check.mts --row all --label run1 --candidate
ST_DEBUG_VIEWPORT=1440x844 node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-live-head-check.mts --row all --label run2 --candidate
```

Start an offline, no-model lane 30 first. `--candidate` serves this worktree's
production `dist/` through browser routes, without staging into the owner's install.
Omit it to check the staged bundle. Individual rows accept `--row LI1|LI3|LI4|LI6`;
LI6 alone uses the explicitly supplied `ST_DEBUG_VIEWPORT`.

LI1 captures every foreground drawing timestamp for 60 seconds; no intervals are
discarded. LI3 captures screenshots and tests static visibility at the next frame,
including the outgoing static image during a look crossfade. Its decode barrier
holds all nine layer loads, releases them after switching, and counts publications
of the superseded canvas. LI4 uses a scripted visible-reply stream adapter: it
updates a temporary host transcript row and emits ST stream-token events through
the actual sprite driver. It verifies streaming activity and compares uploaded
mesh-parameter vectors plus mouth uniforms for ten seconds per arm. No model call.

LI6 exercises keyboard import, overflow, context allocation and disposal. The
hidden-tab arm disconnects Playwright before raw CDP activates another tab:
Playwright's own focus emulation otherwise keeps `document.hidden` false even
when switching or minimizing tabs. It observes the browser's real visibility
state and draw counter, then reconnects for teardown.

Evidence goes to `<lane>/debug/runs/live-head-<label>/`; archive with
`so-evidence.mts archive`. Cleanup restores lane settings and removes only assets
created since the trusted marker baseline. A failed floor returns exit 1 and is
retained in `record.json`.
