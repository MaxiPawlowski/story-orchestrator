# 74 — Live character motion

Owner decision 2026-10-18, after reviewing how characters are shown: characters on stage feel mostly still.
Step 1 brings the rest of mesh-avatar-studio into the live head (plan 36). Step 2 is a trial for full-body
pose sprites, run 2026-10-18 as a trial (branch `v2.8-live-body-trial`): **NO-GO**, code dormant. Step 1 branch `v2.8-live-head-motion`.

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

## Step 2 trial: protocol (written 2026-10-18 before any code or Sol call; branch `v2.8-live-body-trial`)

Owner decision 2026-10-18: run step 2 as a trial. Existing pose sprites only (no image generation, ComfyUI or GPU),
Sol through the opencode harness path (cap 60 calls, counted), not wired into the stage unless the go/no-go passes.

Trial set (synthetic, never campaign art), 3 characters x 3 poses = 9 rigs:

- Wren: standing (`SO-Show Wren/neutral.png`), wave (`looks/wren-wave.neutral.png`), sitting (the same design from the
  plan 41 journey, lane 33 `SO-P41 Ash/lp_a188e2b7/neutral.png`);
- Garrick: standing, arms crossed (`looks/garrick-arms-crossed.neutral.png`), sitting (`SO-P41 Bram/lp_f1220898`);
- Pim: standing, attention (`looks/pim-attention.neutral.png`), sitting on the floor (`SO-P41 Cleo/lp_b262aeb0`).

Design (trial):

- A body rig is its own manifest kind (`kind: "body"`, identity member, look, pose, art sha256, source), never a head
  `Rig`; bust rigs, their validator and goldens are untouched.
- Landmarks by Sol, one answer per pose: head oval, optional eye centres, neck, shoulders, chest, waist, hips,
  pose, up to two arms (shoulder, elbow, wrist, outline, state `free` | `resting` | `holding`) and up to 10 hair locks.
  Required core invalid = rig refused; an invalid optional group (an arm, a lock, eye centres) is dropped with a note.
- Base layer: torso sways (shift and roll about the hip centre, fading out between waist and hips so legs, seat and
  feet stay put), breathes (shoulders and chest), head tilts/nods about the neck, hair springs (step 1 physics).
  `free` arms are cut into their own layer (two bones: shoulder, elbow) with the hole filled where the body
  continues behind the arm; `resting` arms stay in the base, shoulder end follows the torso, hand end stays put;
  `holding` arms move with the torso. Arms keep hanging (counter-rotate against torso roll, spring lag) and take
  `armAngle` (upper arm) and `handAngle` (forearm). One canvas and context per actor (N contexts).

Definitions, fixed now:

- **Valid rig from the first answer**: the first Sol landmark answer for that pose parses, its required core
  validates, and synthesis, layer cut and manifest load succeed. Dropped optional groups are recorded, not counted as
  failures.
- **Review extremes** (fixed parameters): rest beside the source image, breath 1, sway +-10 (`bodyAngleX` and
  `bodyAngleZ`), upper arms +-10, forearms +-10, hair held at +-x and +-y, head tilt +-30, and the two combined
  extremes (sway, arms, forearms and hair all at -10/-x, then +10/+x).
- **Sol review** per rig on JPEG sheets, floors: arms attached (hands never detached from forearms, arms never from
  shoulders), no tearing at arm, sway or hair extremes, no inpaint smear visible at rest, strands on hair, bottom edge
  planted. Pass = every floor passes. At most 3 rounds; between rounds Sol may correct the landmarks it placed.
- **Accepted rig** = passed Sol review by round 3.
- **Tears** on an accepted rig: any tear Sol reports at an extreme, plus any inverted triangle in any layer mesh at any
  review extreme (deterministic count).
- **CPU frame cost**: `frame-bench.mjs --body <N>`, no-op GL, N renderers each on its own canvas with its trial rig
  (Wren standing, Garrick standing, Pim standing, repeated), head driver + motion driver per actor, 3,000 warm then
  20,000 frames; mean ms per frame for all N actors together. N = 1, 3, 5.
- **Frame interval**: informational only (coordinator 2026-10-18: the 3090 is busy); any sample is recorded with the
  WebGL renderer string and GPU condition and is not scored.

Measures and rule, as predeclared above (not retuned): rig success >= 80 % (>= 8 of 9); Sol review pass by round 3
>= 80 % (>= 8 of 9); CPU <= 2 ms per frame at N = 3; 0 tears on accepted rigs. Go only when all four pass.

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

### Idle-GPU LI1/LM1 run 2026-10-18 (12:15–12:44Z)

- Conditions: 3090 idle (Artemis loaded but idle on the controller, no ComfyUI job, owner not playing, step 2 agent told no GPU). Lane 30 (`C:\dev\so-live-lanes`, port 8130, no-model), private ST copy `C:\dev\st-live`, **headed** browser, viewport 1440x844, Wren motion rig, 60 s of steady drawing with all motion on. WebGL renderer on every run: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 (0x00002204) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
- Candidate = master `d6539d20` (served `dist/index.js` sha `326a524e81a1`), frozen for both runs. Baseline = pre-motion master `ae510246` (sha `001b39c5d987`), same lane, rig and viewport.
- Interval histogram buckets (ms): ≤17 / 17–25 / 25–33.34 / 33.34–50 / 50–100 / >100.
- Candidate run 1 (`live-head-cand1-t2`; t1 aborted on a popup over `#so-briefing-start`, a harness flake, no sample): 3,550 frames, **max 866.8 ms**, 2 drops, p50 16.7, p95 16.8, 2 long tasks; histogram 3542/3/2/0/1/1; spikes 25.2 @0.2 s, 54.2 @6.0 s, 866.8 @34.6 s (all `no-tick`), 25.1 @51.1 s (`skipped-ticks`).
- Candidate run 2 (`live-head-cand2-t1`): 3,617 frames, **max 41.7 ms**, 2 drops, p95 18.1, 0 long tasks; histogram 3171/443/0/2/0/0; spikes 37.4 @0.2 s, 41.7 @6.6 s (`no-tick`).
- Baseline run 1 (`live-head-base1-t1`): 3,627 frames, **max 120.8 ms**, 2 drops, p95 18.7, 1 long task; histogram 2556/1066/2/1/0/1; spikes 41.2, 120.8, 26.6, 25.4 (all `no-tick`).
- Baseline run 2 (`live-head-base2-t2`; t1 aborted on the same click flake): 3,647 frames, **max 41.7 ms**, 2 drops, p95 19.4, 0 long tasks; histogram 1902/1739/3/2/0/0; spikes 37.4, 29.2, 41.7, 29.2, 25.9 (all `no-tick`).
- **Verdict, floor applied as predeclared (no interval over 33.34 ms), not retuned: LM1 FAIL, 2 of 2 candidate runs.** The pre-motion baseline fails the same floor 2 of 2 with the same `no-tick` signature: the browser delivered no frame and ran no script. Run 2 of each has an identical 41.7 ms max. Steady state on the candidate is tighter than the baseline: p95 16.8–18.1 vs 18.7–19.4, and 17–25 ms intervals 3/443 vs 1066/1739. So the misses track the host compositor on this desktop, not the motion code. That is an observation, not a pass. The single 866.8 ms stall (candidate run 1, with a long task) is unexplained.
- LI6 real hidden tab (`live-head-hidden-t1`, headed, raw CDP path, no simulated `visibilitychange`): **PASS**. `document.hidden` was true, draws held at 239 before and after the hidden window. LI6 keyboard, 1440 width (1 context) and teardown (0 contexts, 0 resources) passed too.
- Logs: `scratchpad/livehead/idle-*.log` (session scratch). Records: `C:\dev\so-live-lanes\debuguns\live-head-{cand1-t2,cand2-t1,base1-t1,base2-t2,hidden-t1}ecord.json`. Lane 30 was stopped afterwards and `st-live` restaged with the candidate.

Owed: LM1 stays failed on this desktop (candidate and baseline alike); the laptop run; a real streamed reply through the talking driver; step 2 trial.

## Gate record (step 2 trial, 2026-10-18, branch `v2.8-live-body-trial`, LIST)

Verdict: **NO-GO** under the predeclared rule (one floor missed: Sol review pass rate). Full-body rigs are parked with
v2.9 §05.1; the stage keeps the static pose sprites with plan 19 B+P. The body rig code stays in the repo **dormant,
trial-only**: nothing imports it from the product (no stage, settings or author UI wiring), so it is in no bundle chunk.

- Protocol committed (`6782e4f3`) before any code or Sol call. No floor retuned. No GPU, ComfyUI, image generation,
  local model, controller, owner ST (port 8000), lane 0 or download. Reviews rendered on SwiftShader (CPU).
- Trial set: Wren, Garrick, Pim (synthetic showcase cast), 3 poses each = 9 rigs: standing, one gesture pose (wave,
  arms crossed, attention) from `C:\dev\so-poc-showcase`, and sitting from the same three designs made in the plan 41
  journey (lane 33 `SO-P41 Ash/Bram/Cleo`; the lane copies were cleaned up by then, the files came from the journey's
  snapshot, byte-identical by md5). 768 x 1152 (standing, gestures) and 400 x 600 (sitting).
- Built (`src/sprites/liveHead/body/`, all trial-only): `kind: "body"` manifest + validator (identity member, look,
  pose, art sha256, source; base + up to two arm layers; an arm layer needs a `free` arm; a free arm without its
  layer loads and moves with the torso); deformation (torso sway/roll about the hip centre fading out over the waist
  band, breath, head tilt/nod/turn about the neck, resting arms pinned at the hand, two-bone free arms that keep hanging
  against torso roll with a spring, `armAngle`/`handAngle`), hair springs reusing step 1 physics through a new
  `HairHost` seam in `hair.ts` (bust path unchanged: frame-loop and gaze goldens green), `BodyRenderer` on the existing
  shaders (one canvas/context per actor), Sol landmark prompt and parser (bad optional groups dropped with notes), rig
  synthesis, CPU layer cut with hole fill behind free arms. Tools: `scripts/live-head/body-rig.mjs`
  (landmarks/synth/sheets/overlay/review/correct), `body-page.mjs`, `frame-bench.mjs --body <N> --manifests ...`.
  Tests `body/body.test.ts` (14).
- Engine changes made during the trial, recorded (none touches a floor or the rule): before round 1 sheets went to
  Sol, the deterministic fold check found inverted triangles (wave forearm, sitting head tilt), fixed by an angular
  elbow weight and a wider head band/side falloff; after round 1, the hole fill changed from a row rule to a 16-ray
  2D rule (round 1 named horizontal streaks and stepped gaps); before round 3, the arm cut dilation scaled with the
  sprite (2 to 5 px), the fill colour favours the nearest edge, and the arm outline cap went from 64 to 128 points
  because Sol's round 3 corrections used 58 to 86 points (otherwise the arms would have been dropped, a degraded rig
  that would have passed review without moving its arms). The fill/dilation/cap changes affect only rigs with free
  arms; the four rigs accepted in round 1 render byte-identically under the final code (sheet PNG compare).

Measures (predeclared, applied as written):

- **Rig success: 9/9 = 100 % (floor >= 80 %) PASS.** Every first Sol landmark answer parsed, validated and
  synthesized; no optional group dropped. Arms as Sol classified them: 5 rigs with two `free` arms (all standing and
  gesture poses except arms crossed), 3 sitting rigs `resting`, Garrick arms crossed `holding`. Hair locks: Wren 7/4,
  Pim 8/8/7, Garrick 0.
- **Sol review by round 3: 5/9 = 56 % (floor >= 80 %) FAIL.** Round 1: 4/9 pass (Wren sitting, Garrick crossed,
  Garrick sitting, Pim sitting: exactly the rigs without free arms). Round 2 (Sol corrected landmarks from overlay +
  findings): 0/5. Round 3: 1/5 (Pim attention). Final fails, all on `no_tear_arms` (round 3 reasons): Wren standing
  (skirt fabric dragged with the wrists, a gray gap at the waist), Wren wave (skirt patch dragged with the lowered
  hand), Garrick standing (smears and ghost edges on the cape), Pim standing (sleeve remnants beside the torso).
  `arms_attached`, sway, hair, rest-smear and head floors passed on every rig by round 3. So the body (breath, sway,
  hair, head, resting/holding arms) worked on every pose; free arms failed 4 of 5.
- **CPU frame cost: N=3 0.36 ms per frame (floor <= 2 ms) PASS.** `frame-bench.mjs --body N`, no-op GL, Wren/Garrick/Pim
  standing (final rigs), head + motion driver per actor, 3,000 warm then 20,000 frames, two runs each: N=1 0.116/0.115 ms,
  N=3 0.360/0.361 ms, N=5 0.590/0.596 ms (reduced motion 0.002/0.004/0.007 ms, 0 uploads). Garbage: 25/48/73 scavenges
  per 10k frames at N=1/3/5 (an earlier build boxed doubles per vertex: 1,378 at N=1, fixed before the scored runs).
- **Tears on accepted rigs: 0 PASS.** Sol reported no tear on the 5 accepted rigs; inverted triangles 0 in every layer
  at every review extreme on all 9 final rigs.
- **Frame interval: not sampled** (informational only; the owner was playing on the 3090 and the coordinator barred
  GPU use). Owed only if the trial is ever re-opened.

Sol: opencode `openai/gpt-6.1-sol` through the harness transport (worktree plugin copy in the step 1 scratch
`livehead/harness`). **38 calls of the 60 cap, 38 ok**: 9 landmarks, 19 reviews (JPEG sheets, no WebSocket overflow),
10 corrections; about 1,212 s of model time; token usage not captured (subscription).

Showcase: `C:\dev\so-poc-showcase` section "Body motion trial" (`index.html#body`, `anim/live/body.html`): all nine
bodies live (accepted green, failed red, with the reason), presence/expression/gesture/motion controls, Sol review sheets
`anim/live/body/<id>/`, rigs `anim/live/rigs/body/`; bundle `anim/live/body-player.js` from `tools/body-entry.mjs`
built against this branch. Previous page kept as `index.pre-body.html`. Checked headless at 1280 and 390 px: 9 canvases
drawn, no page errors, no horizontal overflow.

Evidence (scratchpad `livebody/`): `src/` (sprites), `r1/`, `r2/`, `r3/` (landmarks, Sol answers, reviews, sheets,
overlays), `final/` (rigs + sheets), `sol-ledger.jsonl`, `bench-final.txt`, `showcase-body*.png`.

Live check (no-model lane 85, `C:\dev\so-live-lanes` over `C:\dev\st-live`, plumbing only; images and sprites off on the
lane, no story imported): staged this branch, reloaded, opened the most recent group; `storyOrchestratorRuntime`
present, `sprites.liveHead` true, served `dist/index.js` 1,286,600 B sha `326a524e81a1` = local build; the page
fetched no extension asset beyond the main bundle and manifest (body code is in no chunk); 0 page errors, 0 console
errors, 0 failed requests. Lane stopped afterwards. Nothing body-related is live in the product (NO-GO).

Gates:

- `npm run gates -- --jobs=1 --no-storybook` run 1: RED at `test` (`legacyFree.guard` hit on a `version !== 1`
  literal, `codeHealth.guard` T1 one cast through unknown, both in `body/`); fixed `d2767167`. Run 2: **all green in
  489.1 s** (jest 9,757 passed, 1 skipped; replay ok; every step ok). After merging master `c94d9a6a`: run 3 **all green
  in 400.0 s** (jest 9,765 passed, 1 skipped). After merging master `183b391a`: run 4 **all green in 352.9 s** (jest 9,769 passed, 1 skipped). Main bundle 1,286,600 B (budget 1,300,000), unchanged by this branch;
  no `body/` code in any chunk.
- Storybook (static build from `git archive HEAD`, own port 6392, `--maxWorkers 1`; no component or story touched):
  full runs 1–3 153/154 suites, 931/932 tests, the one failure always `Studio/CharacterTutorial`
  `ReviewBlocksATakenName` (axe `color-contrast`, untouched component); that story passed 2/2 alone, 2/2 in
  `src/studio/components`, and in `src/sprites` + `src/studio`; full run 4 on the same build **154 suites / 932 tests
  passed**. Master's build passed its full run 1/1. Recorded as an order/load flake, not caused by this branch.

Owed: nothing for the verdict. If step 2 is ever re-opened: a free-arm cut that does not depend on the precision of a
vision outline (a segmentation mask, or a layered sprite with the arms drawn apart, v2.9 §05.1), and a frame-interval
sample on an idle GPU.

## Gate record: idle desktop follow-up (2026-10-19, plan 79)

- Candidate `862f627c`, copied lane 30, hardware ANGLE RTX 3090 D3D11, DPR 1, 1440x900; existing showcase motion
  rig with ten strands. `so-live-head-check.mts --candidate --rig-template <private-motion-template>`, first `--row all`,
  then `--row LI1`: **LM1 PASS twice**, 60 s each, max 25.0 / 20.9 ms, p95 16.8 ms both, zero intervals above the
  unchanged 33.34 ms floor, 32,418 uploads each. No simultaneous text/image GPU work. Earlier misses remain recorded.
- First run all 27 checks pass, including LI3/LI4/LI6, zero stale publications, one context, zero teardown resources;
  hidden tab is simulated on the headless lane. Zero model requests, zero page errors and zero leaked owned assets.
  Offline-lane missing-plugin/backend availability probes and deliberate fault-injection requests fail as expected.
- CPU repeat: base 0.198 ms/frame, motion 0.250 (CPU floor met); GC 136 vs 259 scavenges/10k frames, **1.904x,
  MISS** against unchanged 1.5x floor. Reduced arms zero uploads/scavenges. No allocation/GC sign-off from this sample.
- Commands, full measurements and private archive labels: plan 79, "Idle-GPU head checks". The real streamed motion
  row remains owed; scripted tokens prove plumbing only. Laptop remains unavailable. Body trial remains NO-GO.
