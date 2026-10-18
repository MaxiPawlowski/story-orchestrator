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
