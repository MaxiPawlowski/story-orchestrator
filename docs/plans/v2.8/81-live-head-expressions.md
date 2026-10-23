# 81 — Live head expressions: one texture per expression

Owner 2026-10-23: "about the images, the expressions dont look good. Live head looks amazing, but expressions dont."
Part of v2.8. Branch `v2.8-81-live-head-expressions` (not merged until the owner says so). GPU paused by the owner:
no ComfyUI, no local model, no image render in this plan; everything below runs on saved images.

## What and why

The live head always draws the neutral art. `drivers.ts` `expressionHead(label)` only nudges mesh parameters on that
neutral texture (joy: eye smile 0.7, mouth form −0.4, blush 0.2; anger: brow Y −0.6, brow angle 0.7, mouth form −0.5).
On anime art the brows sit under the bangs and the mouth is a thin line, so joy reads neutral, and the brow warp's
gaussian reaches the upper lids, so anger reads sleepy (lids pushed down). `liveHeadStage.ts` `actorHeadFrames` reads
only the neutral blink/talk frames and the rig is cut from the neutral art.

The pipeline already renders good expression sprites (`EXPRESSIONS` neutral/happy/angry/worried, face edits that
"change only facial expression"), pixel-aligned with the neutral one. The live head should draw them.

## Measured baseline (2026-10-23, run a15 raw images, private showcase folder `a15-raw`)

- Each expression sprite (832×1248) differs from its neutral only inside the face (pixels with a channel moving
  more than 24 levels): Ash happy 5,228 px in (317,84)–(515,306), angry 1,697 in (317,125)–(514,298), worried 1,669
  in (317,108)–(513,301); Bram 2,010 / 1,257 / 2,982 px; Cleo 5,349 / 2,388 / 2,159 px, all within the face.
- The base sets carry only neutral blink/talk frames; per-expression frames exist only on posed sets
  (`anim-lp_*/happy.blink.png`, `happy.talk.png`).
- The bust (rig source) is the same file across runs a3–a15 for Ash (sha `9d056196…`), so a15's expression sprites
  align with the showcase rig `q80-ash`.
- Live-head captures of the current neutral-warp head per expression are recorded first (stage 0), before any code
  changes.

## Stages

0. **Baseline captures.** The showcase live player built from master: Ash, Bram, Cleo at neutral, joy, anger,
   sadness, idle motion off; blind rater sheets.
1. **T — texture per expression.** An expression label with a rendered sprite in the actor's pack (exact label, else
   the family: joy/amusement/love/… → happy, anger/annoyance/disgust/… → angry, sadness/fear/worry/… → worried) draws
   that sprite as its texture on the same rig. The sprite is cropped like the frames (head box → bust) and checked at
   load: the same size as the rig art and every pixel that differs from the neutral art inside the head oval; refused
   otherwise (neutral texture plus parameters). Layers are cut from it with the rig's own cutter (`cutHeadLayers`),
   so geometry, head motion, breath, hair springs and gaze stay shared. A label change crossfades the textures in the
   shader (two samplers, one mix); reduced motion cuts. Loaded on first use, cached per (art hash, expression, source).
2. **E — eyes and mouth per expression.** The eye plate tone, iris span and gaze limits are read from each
   expression's own ball layer. An eye whose opening changed (share of opening pixels moved by more than 24 levels
   over a limit) or whose ball shows through at any of 81 gazes has its gaze offset switched off for that expression.
   Blink and talk frames are re-cut against the expression art: the expression's own frames when the pack has them,
   else the neutral frames, which the existing drift guard refuses where the expression changed the frame's border.
3. **P — parameters as accents.** A textured expression adds no parametric face warp (no double expression); the
   parametric warp stays only for labels without a texture. The brow warp never moves the upper lids: its weight
   fades to zero above the highest lid point (all labels, textured or not).
4. **S — stage and showcase.** The stage passes the actor's pack (sprites and frames per label, head box) to the live
   head; on by default, no new setting (the existing live head and drawn-frame switches cover it). Storybook story
   with a synthetic expression texture. Showcase live player rebuilt from the branch with an expression texture switch.

## Floors (predeclared 2026-10-23, before any measurement after stage 0)

Informational, as always: a miss is recorded, never retuned.

- Rater (Sol `gpt-6.1-sol` via `codex exec`, blind sheets: panel 1 the member's neutral live head, then that member's
  captures in a seeded shuffle with no label): captures of the three textured expressions read as the intended
  expression (joy → happy, anger → angry, sadness → worried) ≥ 90 % over the three members; same character ≥ 90 %.
  The stage 0 baseline is rated with the same prompt for comparison (no floor).
- Alignment: every a14/a15 expression sprite of the three members accepted at load; synthetic shifted or resized
  sprites refused (unit tests).
- See-through: zero pixels with alpha < 0.9 inside the eye opening at 81 gazes (−1..1 in 0.25 steps) for every
  expression eye whose gaze stays on (the plan 80 W check on the expression's ball layer).
- Seam: plan 80 seam score ≤ 1.3 between the neutral and each expression live-head capture.
- Frame time: per-frame draw time and rAF interval p95 with expression textures loaded no worse than the master
  build on the same page and rig (A/B, same browser, 30 s each), within 10 %.
- Main bundle ≤ 1,300,000 B; the new code rides the live head's lazy chunk.

## Gates

`npm run gates:quick` per change; `npm run gates` once without `--resume` before the gate record. No live ST gate:
the change is inside the live head's lazy chunk and the stage view; checks run on the showcase player (WebGL, saved
images) because the GPU is paused for lanes with models.

## Not in scope

- New expression renders or per-expression blink/talk frames for the base set (GPU paused; plan 80 frames step).
- Mesh geometry per expression (the rig's eye outlines stay neutral; see unresolved questions).

## Unresolved questions

- Should the frames step render blink/talk frames for every expression of the base set (6 more renders per member)?
  Without them an expression whose eye or mouth border changed blinks and talks with the mesh only.
- An expression that narrows the eyes keeps the neutral eye outline for its blink; worth a per-expression outline?

## Gate record 2026-10-23

Commits: `0dae2a6f` (plan, floors), `d8054b6f` (build), `9c044fc9` (bench rater). Branch not merged, not pushed.

- As built: `liveHead/expressions.ts` (label to texture: exact pack label, else family; alignment against the head box,
  head oval ×1.6 without a box, 8 stray pixels; `cutHeadLayers` fitted to the rig's layer rects; gaze off for an eye whose
  visible sclera drops below 70 % of neutral or whose ball has holes; drawn frames re-cut by `cutDrawn`; cache of 24 per
  art hash, expression, bytes, box, frames; `HeadLooks` loads on demand and preloads up to four pack expressions 1.2 s
  apart after the head shows). Renderer: one `Look` per expression (textures, tone, gaze limits, drawn sprites),
  `showLook` crossfade 220 ms through `uTex2`/`uMix`, reduced motion cuts. `HeadDriver` drives no face warp on a
  textured label. `browWeight` fades the brow warp to zero above the highest lid point (all labels). Stage:
  `actorHeadLooks` hands every non-neutral sprite of the actor's set with its own frames, else the neutral frames.
  No new setting (on with the live head; frames follow `liveHeadFrames`). Guide and settings copy updated
  (`npm run docs:guide`, `npm run docs:settings`).
- Deviation: the eye check is a sclera-area squint test plus a hole count, not the per-pixel change share first tried
  (a15 eyes change 25–79 % of opening pixels from redrawn highlights while the sclera area stays within ±25 %); the 81-gaze
  see-through render costs 180–630 ms per expression, so it runs in the bench only.
- Deviation: `test/goldens/liveHead/frame-loop.json` regenerated (`SO_WRITE_LIVE_HEAD_GOLDEN=1`): new uniforms in every
  frame and the lid guard on anger/sad/surprise arms.

Measurements (offline fixtures: run a15/a14 raw images in the private showcase folder; captures on the showcase live
player, same page and rig, master build `player.base81` vs branch build; Chromium headless, SwiftShader for captures):

- Stage 0 baseline and after: `C:\dev\so-poc-showcase\expressions-2026-10-23\{before,after}` (face crops per label),
  blind sheets `sheets-{before,after}` (`node scripts/debug/so-image-bench.mts expression-sheets <dir> --out <dir>`).
- Rater (`node scripts/debug/so-image-bench.mts rate-expressions <sheets>`, `codex exec -m gpt-6.1-sol`, 6 calls):
  after 9/9 textured captures read as intended (joy→happy, anger→angry, sadness→worried), identity 12/12, defects 0;
  before 0/9 (all neutral), identity 12/12. Surprise (no sprite) reads neutral in both. Floors (≥ 90 %): met.
- Alignment: 18/18 a14+a15 expression sprites accepted; shifted, resized and identical synthetic sprites refused (tests).
  Met.
- See-through: 0 pixels below alpha 0.9 at 81 gazes on every expression eye (a15, 3 members × 3 expressions × 2 eyes).
  Met. Squint test: gaze stays on for all a15 eyes; on the showcase rig of Bram one eye of worried is held still.
- Seam: median luma shift in a 12 px band inside the head box 0.0 on all nine sprites. Met.
- Frame time (hardware ANGLE RTX 3090 D3D11, headless, 30 s per arm, q80-ash, `joy` held and a 1 s label switch, four
  runs): rAF interval p95 16.7–16.8 ms both builds, every run (met). Draw time p95 vs master: joy +14 %, +17 %, −17 %,
  +42 %; switch −5 %, −4 %, −10 %, +44 % (same-build run-to-run spread is as large); floor within 10 %: MISS on 4 of 8
  comparisons, recorded. Before preloading, a first use of an expression stalled 100–133 ms (3 drops per 30 s); with the
  preload one 50–83 ms frame lands once per head while it prepares. Records `perf-hw*.json` beside the captures.
- Main bundle 1,298,020 B (≤ 1,300,000); the renderer and loader ride the live head chunk.
- Not measured live in ST (GPU paused, no lane run); LI1 on lane 30 not run.

Gates:

- `npm run gates:quick`: green (416.7 s) before the census rows; `npx jest` on ownership/errorCopy/codeHealth guards
  and `src/sprites` green after them (census rows `expressions.ts#HeadLooks.load`, `#prepareLook`, `#cutLook`;
  `HeadRenderer.draw` split to stay inside the S4 branch budget).
- `npm run gates` on `9c044fc9` (no `--resume`): every step green except `test-storybook:ci`: port 6006 held by another
  session's Storybook (`EADDRINUSE`). Rerun by hand: the gate's own `.sb-static` served on 6116 and the test runner from a
  copy outside `.claude/` (in this worktree path the runner's `src/**` glob skips the dot directory and finds no
  stories): 165 suites, 996 tests passed. So Storybook is green, but not through one `npm run gates` command; a merge
  needs a clean run from a worktree outside `.claude/` with 6006 free.
- `node --test scripts/debug/lib/sheetRater.test.mts` 5/5.

Showcase: `C:\dev\so-poc-showcase\anim\live\player.js` rebuilt from the branch (backups `player.pre-81.{js,css,html}`,
`players.pre-81.json`, `tools/live-entry.pre-81.tsx`, `index.pre-81.html`); players get an "expression textures (plan 81)"
switch and `?label=`/`?size=` parameters; `expressions-2026-10-23.html` (before/after, live player) linked from
`index.html`.
