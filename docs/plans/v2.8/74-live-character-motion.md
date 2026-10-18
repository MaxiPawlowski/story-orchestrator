# 74 — Live character motion

Owner decision 2026-10-18, after reviewing how characters are shown: characters on stage feel mostly still.
Step 1 brings the rest of mesh-avatar-studio into the live head (plan 36). Step 2 is a trial for full-body
pose sprites, written down here and **not built**. Branch `v2.8-live-head-motion`.

## Context: what plan 36 took and skipped

Studied clone `C:/dev/st-extensions-research/mesh-avatar-studio` at `6f6d362` (MIT, copyright 2026 Yuki Shindo).
Plan 36 ported the typed rig validator, the nine-layer WebGL renderer (base plus four layers per eye), the grid and
deformation, seeded breath/blink/gaze/tilt, expression parameters, the shader mouth and later the drawn eye/mouth
sprites, the viseme mouth and the gaze iris fix. The rig format already carries upstream's optional `strands`,
`accessories` and `hand` groups and the body fields `body.pivotX/Y`, `body.maxRoll`, `body.rollBand`, but plan 36
refused rigs with a hand or accessories and never read strands or body roll.

Skipped, and wanted now:

- hair strands with spring physics (upstream `reference/engine/physics.js`, rig `strands`);
- body roll and sway (`bodyAngleX`, `bodyAngleZ`, `body.maxRoll`, `body.rollBand`);
- arm/hand rotation where the rig declares a hand (`armAngle`, `handAngle`, `fingerTap`, rig `hand`);
- keyframed motions (`reference/engine/motions.js`: nod, tilt, think, giggle, surprise, shy, no, greet and the
  idle set lookAround, glance, sway, sigh, stretch, lean, hum, spaceOut).

Still skipped: hanging accessories (tassels), mouse follow, the TTS loudness mouth (we have the text viseme mouth),
the editor and the Python builder's hand-on-chin jaw reconstruction.

## Step 1 scope (build now)

Runtime (lazy, inside the live-head chunk; nothing new in main):

- Parameters gain `bodyAngleX`, `bodyAngleZ`, `armAngle`, `handAngle`, `fingerTap`, default 0. At 0 the
  deformation is byte-identical to today's.
- Body: sideways shift and roll about `body.pivot`, fading out over `body.rollBand` so the bottom edge stays put.
  Every layer (base, eyes, drawn sprites, hand) takes it, so eyes stay on the face.
- Hair: one spring chain per rig strand, sub-stepped at 240 Hz, preallocated typed arrays, soft limit at
  `strand.max`, a shared breeze with per-strand flutter, fringe smoothing. Only the base layer moves with strands;
  the weight is cut near the eyes (eye layers do not follow hair) and near the root. A rig without strands has no
  hair motion.
- Hand: an optional `hand` layer cut at synthesis; forearm and wrist bones per upstream, contact pinned to the head
  only where the contact lies in the head's weight band. A rig with `hand` but no hand layer ignores the hand.
  Hanging accessories are ignored, never refused.
- Motions: upstream's keyframed tracks (cubic Hermite), played additively for head/body/gaze and mixed for face
  tracks, with upstream's 0.15 s ease in and 0.25 s ease out. Eye opening from a motion never goes below 0.5
  (mesh-only closed eyes are the weakest part of our rigs); a motion never opens the mouth (the stream owns it).
- Drivers, from what the stage already knows (no new model call at play time):
  - talking (`StreamActivity.view()` is this member): small nods following the viseme openness, no idle gestures;
  - listening (another member streams): an attentive head bias and an occasional seeded small nod;
  - idle: a seeded idle-gesture schedule, slots of 9 s, `fnv1a(seed, slot)` decides whether and which idle motion
    plays and when (never `Math.random`, same hash family as the seeded blink), plus slow body sway;
  - expression change (the stage's expression label): one reaction motion per change (joy → nod, amusement →
    giggle, surprise/fear → surprise, sad → sigh, anger/disgust → no, embarrassment → shy, curiosity/confusion →
    tilt, thinking → think), not while talking.
- Reduced motion (OS, ST, story `display.motion:false`) stops idle breath/blink/gaze/tilt, sway, hair and gestures;
  expressions still show as a fixed vector. Hidden tab suspends drawing; physics clamps the first step after a pause.
- No new switch: all of this is part of `sprites.liveHead`.

Rig authoring:

- Landmarks (Sol answer) gain optional `hair` (up to 10 root-to-tip polylines of 2–6 points on hair), optional
  `chest` (centre of the visible upper torso) and optional `hand` (outline polygon, wrist, knuckle, elbow; elbow
  may lie outside the bust). Missing or invalid optional groups are dropped with a note, never a refusal of the
  rest.
- `synthesizeRig` writes `strands` (resampled to four nodes, sigma and max scaled to the bust), the chest ellipse
  and `hand`; `cutHeadLayers` cuts a `hand` layer and fills its hole in the base when a hand is declared.
- The manifest accepts an optional tenth layer `hand`; `accessories` and a `hand` without its layer load and are
  ignored. Existing nine-layer manifests load unchanged.

Showcase: re-rig the POC busts (synthetic POC characters m1/m2/m3 and the plan 41 showcase cast Wren, Garrick, Pim;
never campaign art) with Sol through the existing opencode harness path, cap 40 Sol calls, counted. Review frames at
fixed parameters, judged by Sol contact sheets (at most 3 rounds), never the owner. Showcase page updated.

## Predeclared floors (written 2026-10-18 before building; informational, defaults stay on)

- **LM1 frame interval.** Lane, desktop (i9-9900, RTX 3090 through ANGLE, DPR 1; the named mid laptop does not
  exist), close shot on a showcase rig with strands, all motion on (hair, sway, gestures, idle), 60 s steady drawing:
  no frame interval > 33.34 ms. Two runs; each run reported, a pass does not erase a miss.
- **LM2 CPU frame cost.** `scripts/live-head/frame-bench.mjs` (no-op GL, 20,000 frames after 3,000 warm), motion arm
  with strands, sway and a gesture: mean per-frame CPU ≤ 1.0 ms (plan 36 record: 0.36–0.43 ms without the new
  motion), and garbage no worse than 1.5x the plan 36 motion arm's scavenges per 10k frames; the new driver and
  physics allocate nothing per frame (unit test).
- **LM3 reduced motion.** With OS, ST or story motion off, every idle parameter including `bodyAngleX/Z`,
  `armAngle`, `handAngle`, `fingerTap` and every strand offset is unchanged across 10 s (unit test over the driver
  and physics; lane: one uploaded mesh vector, as LI4).
- **LM4 existing rigs unchanged.** Every existing manifest (synthetic, the nine showcase rigs) loads; with motion
  parameters at 0 the frame-loop golden (`test/goldens/liveHead/frame-loop.json`) and the gaze golden stay
  byte-identical; a rig without strands or hand draws no hair or hand motion and raises no error.
- **LM5 bundle.** Main ≤ 1,300,000 B; physics, motions and drivers absent from initial chunks.
- **LM6 runtime rules.** At most one live context; hidden tab draws nothing; LI3 static fallback within one frame
  on every failure, 0 stale publications (existing `so-live-head-check.mts` rows LI3/LI4/LI6 on the new build).
- **LM7 determinism.** Same seed, clock and event sequence give the same parameter trace; no `Math.random` in the
  motion code (guard test).
- **LM8 Sol review** per re-rigged bust, at most 3 rounds, Sol contact sheets at fixed parameters (rest, hair at
  both spring extremes, sway ±, each gesture key pose): strands lie on hair (no root or tip on skin or eyes); no
  tearing at hair or sway extremes or at any gesture key pose; plan 36 LI5 floors still hold (mouth not past the
  chin, no tears at ±30 degrees, closed eyes judged as before). Floor: every re-rigged bust passes by round 3.

## Step 2 (trial, NOT built now): full-body pose sprites

- **What.** Rig the full-body pose sprites (plan 33 pose library: standing, sitting and the other poses) so the
  body breathes, sways and gestures: torso, both arms, hair. One rig per pose per look, cached like the head rig
  (member, look, pose, art sha256). The close-shot head stays as it is.
- **Trial.** 2–3 showcase characters (synthetic only), 3 poses each. Landmarks by Sol (shoulders, elbows, wrists,
  hips, hair strands, chest), CPU layer cut with arm layers and inpainted holes, same renderer with a body mesh.
- **Measures, predeclared.**
  - rig success rate: valid rigs from the first Sol answer / rigs attempted; floor ≥ 80 %;
  - Sol review pass rate by round 3 (no tearing at arm/sway/hair extremes, hands not detached, no inpaint smear
    visible at rest); floor ≥ 80 % of rigs;
  - frame cost with N actors (N = 1, 3, 5 on one canvas or N contexts, whichever the design uses): no interval
    > 33.34 ms at N = 3 on the desktop, CPU bench ≤ 2 ms per frame at N = 3;
  - tearing: 0 tears at the review extremes on accepted rigs.
- **Go/no-go.** Go only when all four floors pass on the trial set; a miss on any is no-go, recorded, not retuned.
  A no-go keeps the static pose sprites with plan 19 B+P and parks full-body rigs with v2.9 §05.1.

## Parked (v2.9)

- Layered rig / option D: v2.9 `05-deferred-items.md` §05.1, owner re-parked 2026-10-18.
- Pre-rendered image-to-video loops from pose sprites: v2.9 §05.7, parked 2026-10-18, revisit after step 2.

## Unresolved questions

- Hair masks: upstream limits strand motion to hair pixels with a hair mask; we cut the weight near eyes and roots
  only. If Sol review shows skin dragging with fringe tips, a CPU hair mask is the next step.
- Hand-on-chin jaw reconstruction behind the hand is not ported; a hand rig over the face may show the base's hole
  fill when the hand moves.

## Gate record (step 1, 2026-10-18, branch `v2.8-live-head-motion`, LIST)

- Floors above were committed (`62f892f3`) before any code. None retuned. No GPU, ComfyUI, image generation, local model, owner ST (port 8000), lane 0, download or staging into the owner's ST.
- Built (lazy, live-head chunk): body sway/roll in every layer (`geometry.ts`, zero parameters byte-identical); hair spring chains with fringe binding, eye/root cut and a 50 ms first-step clamp (`hair.ts`); hand bones and an optional `hand` layer (`hand.ts`, manifest accepts a tenth layer only with `rig.hand`; `accessories` and a layerless `hand` load and are ignored); 8 reactions and 12 idle motions ported from upstream `motions.js` (wink and every mouth-open track dropped, eye opening floored at 0.5) with a seeded idle schedule, listening nods, talking nods and expression reactions (`motionDriver.ts`, `motionTracks.ts`); `LiveHead` drives it from `StreamActivity` (talking/listening/idle) and the expression label, plus a `gesture` prop. Author notes: import notice and rig preview say what moves (`motionSummary.ts`); rig preview gains "Preview gesture". No new switch.
- Rig authoring: landmarks gain optional `hair`, `chest`, `hand` (bad groups dropped with notes, face never refused); `synthesizeRig` writes 4-node strands, chest and hand; `cutHeadLayers` cuts a hand layer and fills its hole (nearest-edge fill, alpha kept); Sol prompt asks for hair locks, chest and an upward hand.
- Tests: `motionDriver.test.ts` (11), `hair.test.ts` (10, hair + hand + manifest + renderer), `synthesis/motionRig.test.ts` (4), `geometryEquivalence.test.ts` extended to body sway. Stories `Sprites/LiveHeadMotion` (`GesturesAndHair`, `SwayPoses`), `Sprites/LiveHeadAuthor` `ImportWithHairLocks`. Lane harness: `so-live-head-check.mts` row `LM`, `--rig-template`, simulated hidden tab on a headless lane. Tools: `scripts/live-head/motion-rig.mjs` (Sol landmarks/review/correct through the harness transport, synth, sheets, overlay), `motion-page.mjs`, `frame-bench.mjs --motion`.

Floors (machine DESKTOP-NP0HG32, i9-9900, RTX 3090 via ANGLE D3D11 shared with the owner's playtest, headless Chromium 145, DPR 1):

- LM1 frame interval: **informational, not scored** (coordinator 2026-10-18): every sample was taken 10:38–11:00Z while the 3090 was shared with the owner's playtest and, from about 10:58Z, the plan 41 image journey (ComfyUI + Artemis); Chromium drew on hardware GL on that GPU (`ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 (0x00002204) Direct3D11 vs_5_0 ps_5_0, D3D11)`). Samples, all over 33.34 ms: Lane 30 (`C:\dev\so-live-lanes`, staged `dist` sha `0c7e11136b0b`), Wren motion rig (10 locks), 60 s, all motion on: max 220.1 ms (3 drops), 116.9 (2), 40.7 (1), 33.4 (1; p95 16.8). All spikes `no-tick` (page delivered no frame, no script). Master build, same lane and rig: 58.3 ms (2 drops), 22.2 ms (0). No code or floor changed because of them; LI1/LM1 re-run on an idle GPU is owed (coordinator). The named mid laptop does not exist.
- LM2 CPU: **PASS** 0.31–0.70 ms/frame with strands, sway and gestures (base arm 0.34–0.50). Garbage: full 272/321/272 scavenges per 10k frames vs base arm 124/222/185 in the same session; median 272 within 1.5 x the base median (277), one run over: **borderline**, recorded as a partial pass. The new driver and physics allocate no parameter objects (unit test); the frame is still not allocation-free (as in plan 36).
- LM3 reduced motion: **PASS** (unit: every idle parameter and strand offset constant over 10 s; lane `LM/reduced` 1 vector, no gesture; LI4 6/6 in runs 2 and 4).
- LM4 existing rigs: **PASS**. `frame-loop.json`, `gaze-iris.json`, `synthetic-rig.json` goldens untouched and green; all 9 existing showcase rigs (plan36 + sol) load; strand-free rig draws with zero extra uploads.
- LM5 bundle: **PASS**. Main 1,286,117 B and byte-identical to master `ae510246` (sha `001b39c5d987…`) when both are built from same-length scratch paths; worktree build 1,286,053 B. New lazy chunk 70,167 B; seven lazy chunks grow by 65–4,173 B.
- LM6 runtime rules: **PASS** in runs 2 and 4: LI3 9/9 (static within one frame, 0 stale publications), LI6 390/768/1440 one context, keyboard import, teardown 0/0. Hidden tab: headless lane (document.hidden never flips there), so the check is a **simulated** `visibilitychange`: draws 9595→9595 over 1.5 s, resumed 9627. A real hidden tab needs a headed browser; not run during the owner's playtest. Run 3 stopped on a harness timeout after 8/9 LI3 rows; two earlier attempts stopped on ST popups (harness).
- LM7 determinism: **PASS** (unit; no `Math.random` guard).
- LM8 Sol review: **PASS, 6/6 busts by round 2.** Round 1: every motion floor (strands on hair, no tear at hair/sway extremes or any gesture key pose) and mouth/turn passed on all six; closed eyes failed on m2 and Wren (mesh only). Round 2: m2 eye contours corrected by Sol from a 2x overlay, PASS; Wren rendered with its 2026-10-14 neutral drawn frames, PASS. Garrick: Sol listed no free locks, so his hair stays still.
- Lane LM row (runs 2 and 4, plumbing, scripted tokens, no model): idle motion uploads > 0; joy → `nod`, surprise → `surprise`; talking with a label change plays no reaction; reduced motion freezes. Real-LLM stream owed.

Sol: opencode `openai/gpt-6.1-sol` through the harness plugin's transport (worktree plugin code, `@opencode/client` from the st-live plugin folder). **20 calls of the 40 cap**: 7 landmark answers (m2's first answer put the neck above the chin and failed the existing validator, so rig success from the first answer 5/6), 8 reviews, 1 eye correction, 3 reviews lost to `provider.transport: WebSocket inbound queue overflow` (three PNG sheets about 5 MB; retried as JPEG), 1 refused before the model (staged plugin listed no Sol). About 405 s of model time; token usage not captured by this driver (subscription).

Showcase: `C:\dev\so-poc-showcase` section "Live character motion" (`index.html#motion`, `anim/live/player.html?kind=motion`): six live heads with presence, speaker, expression, gesture and motion controls; rigs `anim/live/rigs/*.motion.json`; Sol review sheets `anim/live/motion/<id>/`; player rebuilt from `git archive` of this branch; previous files kept as `*.pre-motion.*`.

Evidence (scratchpad `livehead/`): `r1/`, `r2/` (landmarks, Sol answers, reviews, sheets, overlays), `final/` (rigs), `sol-ledger.jsonl`, `showcase/` (page screenshots), `lane30/` (records, LI/LM screenshots, frame samples for runs motion2–4, motion-li1-6, master-li1-1/2), `lane-*.log`.

Gates:

- `npm run gates:quick` (first, before fixes): RED on lint (two long lines, an unused variable) and a fresh-worktree replay `--listTests` failure; lint fixed.
- `npm run gates -- --jobs=1 --no-storybook` run 1: RED at `test` (`codeHealth.guard` S4 `HeadRenderer.draw`, S5 `settingsCopy.ts`); fixed `5876e727`. Run 2: RED at `test:debug` (`childTree.test.mts` timing under load; 2/2 alone). Run 3: **all green in 517.2 s**: jest 839 suites / 9,740 tests (1 skipped), replay 32/32 killed, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release. Storybook skipped there and run separately below.
- `npm run gates -- --jobs=1 --no-storybook` run 4, after merging master `5475068d`: **all green in 470.9 s**: jest 9,741 passed (1 skipped), replay 32/32, every other step ok. Main bundle in the worktree 1,286,169 B (budget 1,300,000).
- Storybook (static build from `git archive HEAD` at `5876e727`, own port 6389, `--maxWorkers 1`): **158 suites / 959 tests passed**, including `Sprites/LiveHeadMotion` and `Sprites/LiveHeadAuthor`.

- Final, after merging local master `27ababfc` (tour redesign): `npm run gates -- --jobs=1 --no-storybook` **all green in 349.7 s** (jest 9,743 passed, 1 skipped; replay 32/32; every step ok); Storybook static build from `git archive HEAD` on port 6389, `--maxWorkers 1`: **154 suites / 932 tests passed**. Worktree main bundle 1,286,600 B (budget 1,300,000).

Owed: LI1/LM1 re-run on an idle GPU (coordinator) and the laptop; a real hidden tab (headed); a real streamed reply through the talking driver; step 2 trial.
