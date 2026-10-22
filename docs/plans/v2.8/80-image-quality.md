# 80 — Image quality: resolution, edges, eye whites, frame QA

Owner 2026-10-21: the image path works end to end (plan 41/79) but the quality is not good enough: rough edges,
see-through eyes, frames that pass QA while wrong. Part of v2.8. Branch `v2.8-image-acceptance-followup` (not merged
until the owner says so).

## Measured baseline (2026-10-21, showcase run `showcase1021b`, raw images in the private showcase folder)

- A base render comes out about 832×1248 (Qwen-Image 2.1 int8, resolution 1024) and `composeEdit` resizes it to the
  reference box, the full card: SillyTavern stores card art at 400×600. Every later step inherits 400×600.
- Busts are 286–317 px wide; an eye is 17×16 px (Ash), 18×9 px (Bram), 21×21 px (Cleo).
- Edges: 1,765–2,384 semi-transparent pixels per sprite, of which 279–928 are bright (> 200 mean): background
  colour left in the matte. All four expressions reuse the base's alpha mask exactly.
- Frames: Cleo's blink closes one eye and passed QA; Bram's blink shows a darker rectangle where the edit box was.
  The deterministic 4–5 px shift refusals of 2026-10-18 reappear whenever the head box falls back to the fraction.
- Live head: the eye-white tone is sampled from pale, low-chroma pixels (`scleraTone`); on shaded or tinted
  eye whites it returns nothing and a gaze slide has no plate behind the iris.

## Stages

1. **B — bench (CPU, first).** `scripts/debug/so-image-bench.mts` over a folder of raw journey outputs: per image
   size, eye size in the bust, halo score, holes, seam score, per-eye openness, eye-white coverage; contact sheets
   for the second-model rater. Before/after numbers for every stage below come from it.
2. **R — resolution.** A base keeps its rendered size instead of the card's: the base output box is the render's
   aspect fitted to the reference, scaled to the rendered pixels (long edge 1248 at resolution 1024). Expressions,
   frames, busts, rigs, poses and looks follow from the base. The card stays 400×600; display scales down. Saved
   head boxes, visual sources and rigs are size-checked, so mixed old/new sizes are refused, never stretched.
3. **E — edges.** Matte at full size; decontaminate semi-transparent pixels (remove the estimated background colour);
   tighten the alpha by about one pixel; render bases on a flat neutral background. Halo score in QA.
4. **W — eye whites.** At rig time, an opaque eye-white plate inside each eye outline (sampled sclera, near-white
   fallback). A gaze slide never reveals transparency.
5. **Q — frame QA.** Blink: both eyes' openness from the rig's eye landmarks must drop. Seam/tone check along the edit
   border. Feathered blend with colour matching. A shift refusal aligns first, then one automatic re-render with a
   new seed.
6. **C — cost cuts (owner 2026-10-21).** Measured on `showcase1021b`: 59 ComfyUI renders, about 27 s each (about 27 min
   of image GPU time) in an 85-minute run; preparing three characters took 14.5 min.
   - **C1, fewer base candidates.** Today 4 are rendered and the first QA-passing one is kept: 9 of 12 base renders
     are thrown away. Render one; render the next only when QA refuses it (author's "more candidates" stays available).
   - **C2, prepare poses before play.** Poses the story's checkpoints name (and the stand-in look) are rendered in the
     preparation pass, not when the stage first asks during a turn. A pose still missing at play time renders only
     when no loud generation is running or queued.
   - **C3, reuse face frames across poses.** A posed body with the base's face reuses the base's blink/talk frames,
     warped through the head boxes, instead of two new renders. It renders new frames only when the reused frames fail
     the drawn-frame guard.
7. **A — acceptance (3090).** The plan 41 §5 journey twice on one frozen build with the floors below.

## Floors (predeclared 2026-10-21, before any run)

Informational, as always: a miss is recorded, never retuned.

- R: bust eye width ≥ 40 px for every member; base sprite long edge ≥ 1,200 px.
- E: bright semi-transparent pixels ≤ 25 % of the 2026-10-21 baseline per member (≤ 70 / 232 / 69 for Ash/Bram/Cleo
  at baseline size, scaled by edge length at the new size).
- W: zero pixels with alpha < 0.9 inside either eye outline at gaze (−1..1, −1..1) in 0.25 steps, all members.
- Q: every accepted blink frame closes both eyes (each eye's open height ≤ 35 % of neutral); seam score ≤ the bench's
  threshold set in stage B before stage Q is built; no accepted frame with a visible edit rectangle in the rater sheet.
- Rater (Sol, contact sheets, ≤ 60 calls): identity same-character ≥ 90 %; edge/eye defects flagged on ≤ 1 of 12
  sheets.
- C1: base renders per member ≤ 1.5 on average across both runs (baseline 4).
- C2: zero image renders started while a loud generation is running; every pose the story names is ready before the
  first play turn.
- C3: frames on posed bodies with the base face: zero new renders; every reused frame passes the drawn-frame guard.
- Cost: ComfyUI renders per run ≤ 35 (baseline 59) at the same step coverage; character preparation ≤ 9 min for three
  members (baseline 14.5).
- Journey: every §5 step passes, both runs, GPU idle measured with no browser of ours drawing.

## Not in scope

- A larger model: Qwen-Image is 20B; bf16 does not fit in 24 GB and fp8 is unsupported on the 3090.
- The live-head renderer rewrite; only the eye plate changes.

## Unresolved questions

- Should the card art itself be replaced by the full-size base (cards are 400×600 in SillyTavern)? Proposed: no.
- Long edge 1248 or a 2× upscale step (more VRAM per edit)? Proposed: render size first, measure, then decide.

## Gate record — stage R, 2026-10-21

- Change `6f350a0b`: a base keeps its rendered pixel count in the card's shape (`renderedBox`); never shrunk below the
  reference. Test fails without it. Builder suite 65/65; typecheck:test clean.
- Focused run on lane 33 (`so-p41-journey.mts run 1 --candidate --keep --label res1 --only preflight,wizard,story,card-art,base,prepare,expressions,frames,rig`):
  every requested step passed (partial record, never a gate). Step times close to the full runs (base 116–135 s,
  expressions 97–102 s, frames 63–66 s per member): edits still render at 1024.
- Floors: base long edge 1,248 px, met (≥ 1,200). Eye layer width Ash 38/38, Bram 32/33, Cleo 42/43: met for Cleo
  only; missed for Ash and Bram (≥ 40). Busts 581–634 px (were 286–317). Floors unchanged.
- Live players for the res1 characters run the product live head with all drawn frames accepted; before/after page
  `resolution-2026-10-21.html` in the private showcase folder. Lane cleaned, leaked 0.

## Gate record — CPU stages B, E, W, Q, 2026-10-21

- B (`e121c545`, `53adb5b9`): `node scripts/debug/so-image-bench.mts edges <raw dir> --out <dir>`, PNG codec on node's
  zlib (`scripts/debug/lib/pngNode.mts`, round-trip test).
- E (`e121c545`): base and pose outputs pass `cleanEdges`: fringe pixels take the colour of the solid pixels inside
  them, alpha tightened (floor 0.12). Bench on the res1 bases: bright fringe Ash 2,535 → 356, Bram 2,055 → 0,
  Cleo 4,054 → 1,646; colour drift of fringe pixels 103–207 before. Visual 4× crops: Bram's light hair outline and Ash's
  grey strand halo gone; one stray cutout wisp on Cleo remains (matte error, not colour). Note: the predeclared
  bright-pixel floor also counts light skin and silver hair, so Cleo's count stays high with correct colours. Floor
  unchanged; judged at stage A.
- W (`3bbbd5ae`): cause of the see-through eyes: when `scleraTone` found fewer than 12 pale pixels (the 400×600 Bram
  rig: 10), the shader warped the eyeball by displaced sampling (7 px travel on a 13 px eye) and sampled the layer's
  transparent padding. A near-white fallback tone keeps the slide path, whose alpha is the layer's own (opaque inside
  the outline on all six rigs measured). CPU test: zero see-through pixels at gaze −1..1 in 0.25 steps with the
  fallback; the old warp shows through. Renderer test: readable but shaded pixels get the fallback tone.
- Q (`2f972df8`):
  - Deviation: the plan said the rig's eye landmarks; the rig does not exist when frames are built, so the blink check
    uses the face detector's eye points (11–16, 17–22).
  - A left/right-half comparison was tried first and rejected: Cleo's one-eyed blink scored 0.98, the same as real
    blinks, because the edit redraws the whole band.
  - Per-eye eye-white share on real frames: proper blinks 0.00/0.00; Cleo 0.46/0.17 (journey) and 0.42/0.29 (res1):
    refused at the 35% limit.
  - Tone match: edits subtract their median offset against unchanged base pixels before pasting. Bram's blink skin shift
    −2.0/−4.5/−4.2 → +0.8/+1.2/+0.5 (journey) and −4.7/−5.4/−4.7 → −1.9/−1.6/−0.9 (res1), simulated on the saved frames.
  - Not built yet: align-then-retry with a new seed on a shift refusal.
- Gates: `npm run gates:quick` green after each stage; `npm run debug:typecheck` green. No GPU run since stage R.

## Gate record — GPU check of B, E, W, Q and C1, 2026-10-21 (runs q1–q4, lane 33, 3090 beside a game)

- q1: all 12 base candidates refused, `Insufficient GPU headroom` (free 20,501 MiB, need 18,990 + reserve 2,048) with
  a game holding VRAM. Owner asked for it to run anyway: local controller `reserves.gpuMiB` 2048 → 1024 (knob minimum),
  saved as mode `custom` through `modes.mjs` (backup `C:/dev/backups/story-orchestrator/local-config-1792619562920/`).
  Back with `node scripts/local/cli.mjs mode balanced`. Not a code change.
- Retry (`f7958688`): a refusal matching `Render it again` or `eye open (` re-renders once with seed + 7919; anything
  else throws. Closes Q's "not built yet" line.
- q2 (`f7958688`): every step passes except Cleo's blink, refused twice at 48%/44% eye white. Her raw renders show
  both eyes closed: silver hair over the eye box counts as eye white. Correction to the CPU record: Cleo's journey and
  res1 blinks (0.46/0.17, 0.42/0.29) were the same hair, not one-eyed blinks; a 3× crop of the journey frame shows
  both eyes closed.
- First fix (`8d2da306`, detector point confidence ≥ 0.6) was wrong: it was read off the 400×600 saved sprites, where
  closed-eye points collapse to ≤ 0.44. On render-size images closed eyes score 0.85–0.88. q3 refused Cleo again.
- Fix (`130d4b83`): lid openness = point height / width per eye. Closed 0.05–0.25, open 0.43–0.82 (Bram's narrow
  eyes are the 0.43), unchanged at 0.5/0.33/0.22 scale. A blink is refused only when eye white stays above 35% and the
  lid reads open (above 0.3 and above 0.6 × the base's openness); no detector reading keeps the white-only rule.
  Known gap: a half-open lid under both limits passes.
- E follow-up (`01747ecf`): expression and frame pastes took the edit's colour on edge pixels, bringing the rendered
  background back. Edge pixels (base alpha < 250) keep the base colour. Bench, bright fringe on the four expression
  sprites: q2 Ash 358/594/807/608, Bram 0/131/198/234, Cleo 1,647/1,812/1,839/1,879 → q4 every expression equals its
  neutral (Ash 352, Bram 0, Cleo 1,647; Cleo's count is her silver hair).
- C1: q2, q3 and q4 each built one base candidate per member (floor ≤ 1.5).
- q4 (`130d4b83`, run `2026-10-21T22-36-18-736Z-q4-real-run1`): preflight, wizard, story, card-art, base, prepare,
  expressions, frames, rig all pass for all three members, no refusals. Verdict NOT GREEN only because the run is
  partial (`--only`) and `--keep` leaves its assets (header DIFF rows are those assets). Raw images: private showcase
  folder `q2-raw`, `q3-raw`, `q4-raw`.
- Gates: `npm run gates:quick` green after each commit. Full `npm run gates` not run since `b88b3f3e`; stage A owes it.

## Gate record — CPU: seam check, C2, C3, 2026-10-22

- Q seam (`dadc37a7`): `seamScore` = absolute median signed luma shift between a frame and its base over the outer
  feather (overlay alpha share 0.02–0.5, opaque base, at least 40 samples). A first version averaged absolute
  differences and did not separate (rectangle frames 3.0, clean frames up to 5.4, redrawn hair strands count); the
  signed median does. `node scripts/debug/so-image-bench.mts seams <raw dir>`: frames with the edit rectangle
  (journey Bram blink, res1 Bram blink, both before the tone match) 1.5 and 1.9; every clean frame of res1/q4 0.0–1.1.
  Limit 1.3 (margin 0.2 under the cleanest bad frame, 0.2 over the worst clean one). Refusal ends with "Render it
  again", so the one automatic re-render applies. Frames only; a full composite has no feather and is not scored.
- C2 (`5cfb7b29`, `bf81553c`):
  - Play-time renders wait while SillyTavern generates: `waitForTextPriority` takes `loud`, set to
    `isHostGenerating` (`is_send_press || is_group_generating`, script.js:604, so a group round still drafting
    counts as queued) in the pose body, on-demand look and cast-scene hosts. It holds even when the broker is fair or
    silent. The probe module loads only when a render waits (`hostGenerating`), since importing it at module load
    pulls in SillyTavern's `script.js` and broke the PosesList/SpriteBuilder stories. Studio-only renders (batch, pose import, reference views) keep the broker rule.
  - Preparation: `posesToPrepare` (`sprites/poses/prepareList.ts`) lists each member's default pose and every pose a
    checkpoint's `effects.stage` directs at them, resolved through `replayPose` with the story's starting values,
    skipping a directed `set`, a hidden member and the plain standing pose with no changed look (the stage skips
    those too). Studio → Sprites → Poses **Prepare story poses before play** (`#so-prepare-poses`) renders them with
    their blink/talk frames through `PoseBodies.render`; the stage finds them by stamp at first use.
  - Journey: new step `poses` after `rig` (`stepPoses`), and `pose` records `waitedMs`. The C2 floor reads from these:
    `poses` ready = total, and `pose` showing the posed bodies without a new render.
- C3 not built (deviation). Measured on the showcase journey raw images: the only posed sets with face frames are
  `happy` (Ash `anim-lp_af920321` happy.blink/happy.talk); neutral posed sets (`lp_*` neutral.png) are the step
  before the expression edit and never get frames. A posed frame is always on a new expression edit, whose face is
  not the base's, so reusing the base's frames would apply to zero frames in that run and has no real case to check a
  warp against. Floor C3 is recorded as not applicable.
- Gates: `npm run gates:quick` green after each commit; `npm run debug:typecheck` green; `node --test
  scripts/debug/lib/pocDrivers.test.mts` 12/12.
- Full gates on `bf81553c` (`ae124a2e` fixed the census rows that the `buildOnce` split and the new pose preparation
  added, and moved the frame checks out of `buildOnce` to keep it within the 40-branch budget): every step green on
  this exact tree, but only through `npm run gates -- --resume` after environment failures. The first run found the
  census and Storybook problems (fixed above). Later runs failed on port 6006 held by another session's Storybook
  (`so-v29-02-voice`, left alone), on `a driver whose wrapper shell is killed…` under load (green alone and on the
  rerun) and on the OpenCode boot-timing test in `test:plugin` (340/340 alone, green on the third resume). No merge
  is cited on these runs; the owner has not asked for a merge.

## Gate record — stage A, 2026-10-22 (lane 33, 3090, plan 41 §5 journey)

Local controller during these runs: mode `custom`, `reserves.gpuMiB` 1024 (owner's request, beside a game) and
`reserves.ramMiB` 2048 (lowered 2026-10-22 02:2x when renders were refused for RAM with other sessions running; backups
under `C:/dev/backups/story-orchestrator/local-config-*`). Back with `node scripts/local/cli.mjs mode balanced`.

Runs (records `<so-lanes>/33/debug/p41/<stamp>-<label>-real-run<n>/`, raw images in the private showcase folder
`<label>-raw`, contact sheets `sheets-<label>`):

- a1 (`f7aa1a59`): GREEN. Pose step waited 932 s: prepared poses were not on the stage (cast loaded before the Studio
  preparation) and play wanted `happy` on top. Fixed in `c3564bef` (stage reloads its cast on saved sprite files).
- Pair 1 on `c3564bef` (full gates green, no resume):
  - a3: GREEN. Pose step 12 ms.
  - a4: NOT GREEN. `look-rebuild` (close shot showed a posed body of an older outfit while the new look's body
    rendered, so no rig: a race, open finding), `illustration` (refused once, transient), `gpu-idle` (text model had
    reloaded itself, 17.6 GB > baseline). Rater: three changed-look bases of Ash had no head.
- Fixes after pair 1: `38973d2c` (a lease granted after a reply started is handed back), `2e028561` (a new look with no
  face is refused and rendered again; detector on a4's looks: headless 0 faces, normal 1 face at 1.0). `cd0a18e5`
  (standing pose served by the look path) regressed: with poses on it dropped the published look and showed the
  default body (a5); undone in `cf6f000d`. a5 and a first a6 on `2e028561`: an environment abort (stale CSRF on the
  lane page mid-play) and the regression; not counted.
- Final pair on `cf6f000d` (full gates green, no resume):
  - a7: NOT GREEN, one miss: Ash's changed-look rig not prepared, `opencode answered with an error:
    provider.transport: WebSocket inbound queue overflow` (environment). Every other step passed, `look-rebuild`
    included.
  - a8 (run 2): GREEN. (A first a8 start stopped at preflight on a ComfyUI reference left by a7's last background
    render while cleanup ran; the next cleanup found nothing. Cleanup now waits 90 s after a run.)

Floors (informational, not retuned):

| Floor | a3 | a4 | a7 | a8 | Verdict |
|---|---|---|---|---|---|
| R base long edge ≥ 1,200 | 1,248 | 1,248 | 1,248 | 1,248 | met |
| R bust eye width ≥ 40 px | rig ROI Ash 37/38, Bram 31/34, Cleo 45/43 (all runs) | | | | miss (Ash, Bram) |
| E bright fringe ≤ 25 % baseline (scaled ~146/483/144) | Ash 352, Bram 0, Cleo 1,647 (every run; expressions equal neutral) | | | | met Bram; miss Ash, Cleo (light hair counted) |
| W no see-through in the eye at 81 gazes | 0 | 0 | 0 | 0 | met (Bram's opening is 0–20 px, near vacuous) |
| Q seam ≤ 1.3 | max 0.9 | 0.9 | 1.3 | 1.0 | met |
| Q blinks close both eyes | lid check + white share; no wrong refusal after `130d4b83` | | | | met |
| Rater identity ≥ 90 % | pair 1: 57/60 (95 %) | | final: 59/59 (100 %) | | met |
| Rater edge/eye/rectangle defects ≤ 1 of 12 | pair 1: 0 (3 headless panels as "other") | | final: 0, nothing at all | | met |
| C1 base renders ≤ 1.5 per member | 1 | 1 | 1 | 1 | met |
| C2 poses ready before play | pose step 12 ms | 3 s | 2 s | 2 s | met |
| C2 no render started in a reply | 1 render inside | 4 inside | 0 submitted inside | 2 ending inside, started 1 s and 0 s before/at the send | met on the final pair within a 1 s send race |
| C3 | not built (no applicable frame) | | | | n/a |
| Cost renders ≤ 35 | 33 | 40 | 35 | 36 | miss on 2 of 4 (baseline 59) |
| Cost preparation ≤ 9 min (base..rig) | 13.7 | 12.4 | 13.1 | 11.1 | miss (baseline 14.5); pose preparation adds 5–10 min |
| Journey every step passes, both runs | yes | no | no (environment) | yes | miss |

Open findings: the a4 close-shot race (an older posed body shown while the new look's body renders); preparation
time; renders per run at the floor; bust eye width for Ash and Bram (needs a larger bust or upscale, unresolved
question 2); the GPU-idle step reads a self-reloaded text model as busy; the lane page's CSRF token can go stale
during a 90-minute run.

Gates: `npm run gates` green on `c3564bef` and `cf6f000d` without `--resume`; harness-only commits after the freeze
(`ee0c283a`, `053b311a`, `8aeb3844`) do not change the served bundle. Rater: `so-image-bench.mts rate`, opencode
`gpt-6.1-sol` through `codex exec`, 37 calls (≤ 60).

## Gate record — stage A2, 2026-10-22 afternoon (lane 33, 3090)

Same controller config as stage A (custom, GPU reserve 1024 MiB, RAM 2048 MiB). Owner: extra time and renders are fine
when quality holds.

Fixes, each with a test that fails without it:

- `44868d33`: the media plugin's idle prune also removes ledgered references a deferred cleanup left and active ones
  older than 30 min (a page reloaded mid-render never released them); journey cleanup retries a deferred prune until
  ComfyUI is idle. Server plugin: unit-tested only, the lanes run the installed plugin copy (branch not installed).
- `8a28cd62`: every sprite render submit waits out a reply, also under a lease the batch already holds (a9: 7 submits
  inside turns).
- `0fcc8345`: a pending chained voice (`TalkControl.chainPending`, the precedent in `emptyReplyHost`) counts as a reply
  for render submits (a11: 2 submits between voices).
- `696733ed`: the prepared-cast illustration waits up to 4 min for a look still being prepared (a12 refused because the
  extractor had just changed the outfit).
- `5476a947` + `19ad1461`: with no exact published look, the stage stands in with the closest published look by
  wording (≥ 0.5 word overlap per field, filler ignored) instead of the card art (a13: "navy wool coat over a mustard
  jacket" vs the published "a long navy wool coat over the jacket" showed the original outfit, close shot on the
  default rig).

Runs (records `<so-lanes>/33/debug/p41/<stamp>-<label>-real-run<n>/`, raw images `<label>-raw` in the private showcase):

- a9 (`44868d33`, full gates green): GREEN. Prep 10.4 min, 37 renders, 1 base per member; seam max 0.9; 0
  see-through over 81 gazes; rater 29/29 same, no defects. 7 render submits inside turns (found the batch-lease gap).
- a10 (`44868d33`): stopped in play, environment (broker overcommit, below).
- a11 (`8a28cd62`, full gates green): GREEN. Prep 11.1 min, 33 renders; seam max 1.1; rater 25/25, no defects. 6 submits
  inside turns: 4 within 1 s of the send, 2 between chained voices.
- a12 (`8a28cd62`): NOT GREEN, `illustration` only (look pending, fixed in `696733ed`). Prep 11.2 min, 35 renders; one
  bench seam 1.5 (see the measurement note); 8 submits inside turns.
- a13 (`696733ed`, full gates green): NOT GREEN, `look-rebuild` only (card art shown for a reworded outfit, fixed in
  `5476a947`). Prep 11.1 min, 33 renders; 4 submits inside turns.
- Pair on `19ad1461` (full gates green; one `--resume` after the known test 194 flake):
  - a14: GREEN. Prep 10.5 min, 36 renders; seam max 1.0; 7 submits inside turns (3 send races, 2 SDXL chat
    illustrations, 1 DWPose import, 1 sprite base at the window edge; illustration and DWPose paths fixed in `6e50be1f`).
  - a15: GREEN. Prep 11.2 min, 36 renders; seam max 1.1; rater 30/30, no defects; 8 submits inside turns.
  - Pair rule (two greens on one build) met.

a10 (on `44868d33`) was stopped in play: the text model ran at 1.4 tok/s with the GPU at 24.1 GB, spilled to shared
memory. Cause found: an SDXL chat illustration (ComfyUI history 12:20:47, `CheckpointLoaderSimple`) was admitted as
`stream-image` beside the resident text with 2.5 GB free, because `streams()` checked `minFreeGpuMiB` (2400) against a
zero GPU reserve. Fixed in `161779cc` (owner 2026-10-22: a stream keeps the GPU reserve; below it text swaps or sheds),
test fails without it; controller doc `75b1c025`. Live from latency run 2 on (controller restarted).

Later fixes after the pair, each with a test: `6e50be1f` (chat illustrations and DWPose imports wait out replies and
chained voices; a lease granted as a reply starts is handed back); `so-pose-latency` prepares story poses before the
arms (plan 80 C2 flow).

Plan 79 paired play latency (`so-pose-latency.mts`, plan 33 floor: poses-on median ≤ 1.10 × no-sprites median, per run):

- run 1 first attempt (`6e50be1f`, old harness): latency 82.9 / 90.3 s = 0.918 (met), pose renders FAIL (11 of 12
  directed poses without a body: deferred requests for checkpoints already left were dropped).
- run 1 (`6e50be1f`, poses prepared before the arms, 26 min): pose renders pass; latency 98.0 / 80.7 s = 1.214, MISS.
  Each on-demand sprite render in the gap swaps text out ("need 18940"); the harness sends the next turn at once, so
  that reply waits for the render and a text reload (first token up to 131 s). Turn times 16–162 s in both arms.
- run 2 (`6e50be1f` + broker fix live, controller restarted): first start stopped at preflight on a stale page group
  list (no leak on disk); second start's pose preparation hit the 30 min harness cap while renders were still steady
  (stopped, `e762d8d1` raises it to 60); third start GREEN: poses 33 min, pose renders pass, latency 97.3 / 122.8 s =
  0.792.
- Pair: run 1 miss (1.214), run 2 green (0.792). Turn times 40–176 s per arm, 8 turns each: the spread is larger than
  the effect; recorded, not retuned.

Controller note: killing the controller's process tree left its llama-server running (18 GB, unknown to the new
controller); killed by hand before run 2.

Floors, stage A2 (informational, not retuned):

- R base edge ≥ 1,200: 1,248, met. R bust eye width ≥ 40 px: unchanged miss (Ash, Bram).
- Q seam ≤ 1.3: met on every bench except a12's one blink (1.5, measurement note). W see-through: 0, met.
- Rater identity: 29/29, 25/25, 30/30; defects 0 of 18 sheets; 55 calls (≤ 60). Met.
- C1 ≤ 1.5 base renders per member: 1, met.
- C2 poses ready before play: met (pose step 6–7.6 min in the journey). C2 no render started during a reply: MISS, 4–8
  submits inside turn windows per run; after the fixes the rest are send races (≤ 1.2 s after the player's send) and
  the paths fixed in `6e50be1f` (not yet measured in a journey).
- Cost renders ≤ 35: 33–37, at the floor (miss on 4 of 7 runs). Preparation ≤ 9 min: 10.4–11.2, miss.
- Journey both runs green: met on `19ad1461` (a14, a15).

Gates: `npm run gates` green without `--resume` on `44868d33`, `8a28cd62`, `696733ed`, `6e50be1f`; `19ad1461` green with
one `--resume` after the test 194 flake. Final: `npm run gates` green without `--resume` on `e762d8d1` (317.1 s, Storybook included); the run before it was
red only on test 194.

Measurement note: the bench seam score reads the saved PNG; the builder scores the image before the canvas encode
(premultiplied alpha shifts faint feather pixels). a12 had one blink at 1.5 on the bench, accepted by the builder.
