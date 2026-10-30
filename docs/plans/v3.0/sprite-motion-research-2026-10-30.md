# Sprite motion and stage effects — research (2026-10-30)

Owner 2026-10-30: "could we have dedicated animations or custom stuff for our sprite engine? maybe for transitions or other
stuff. Right now we only animate the emotions, when someone talks it gets brightened up and, pretty much it right? Could we
grab ideas maybe from visual novel engines, or whatever else is relevant." And: "can we reuse that sprite script?"

Research only. No src change, no lane, no ST, no GPU. Sources: `src/sprites/**` on master `a7fa71fc`, v2.8 plans 33/36/74/81,
v3.0 05/11b/20, v2.4 extension research (Prome VN, Doom's), clones under `C:\dev\st-extensions-research` (read only),
Ren'Py transitions docs, Naninovel special-effects docs, WebGAL animation docs. Licences: mesh-avatar-studio MIT (already
ported with notice); Prome VN and Doom's Enhancement Suite are AGPL-3.0, UIE has no licence: **ideas only, no code**.

## 1. What the engine already does (inventory)

The owner's picture ("emotions, brighten the speaker, that's it") misses most of it. Everything below is on master.

### Stage layout and framing (`VnStage.tsx`, `direction.ts`, `styles.css`, `stage.ts`)

- Two placements: `vn` (fixed full-height layer `#so-vn-root` over ST's VN mode `body.waifuMode`) and `strip` (a band above
  the chat, used on narrow screens or `sprites.stage: "always"`). Setting `sprites.stage` `vn | always | off`.
- Automatic horizontal layout: N actors spread across the stage, width `min(34%, 92/N)`.
- Framing `full | thigh | close`: crops the sprite to a share of its measured alpha outline (`figureBox` on a 48 px probe,
  `frameSlice`). In `close` with several actors, non-focus actors drop to `thigh`. Visible-share correction keeps the face
  visible when `#chat` covers part of the stage.
- Bottom fade mask on every sprite (`mask-image` gradient).
- Authored per checkpoint: `effects.stage` = `{framing, spotlight, cast: {<member>: {pose, framing, set, face, hidden}}}`
  (`engine/poseSchema.ts` `StoryStage`, read by `readStageDirection`). Who stands on stage follows `standsOnStage`:
  hidden members leave, a directed cast shows only named members (plus the speaker), muted members only when named.
  A story that declares `effects.stage` turns sprites on for that story (`activation.ts`, activation `story`).

### Speaker emphasis (CSS, `sprites.focus`, default on)

- Speaking: `scale(1.04)` from the feet, z-index 3, no filter. Talking (stream owner): unfiltered. Others:
  `brightness(0.55) saturate(0.8)`. 400 ms `filter`/`transform` transition. Only when 2+ actors.
- Spotlight (authored `effects.stage.spotlight`): z-index 2 plus a warm `drop-shadow` glow (`--so-sprite-glow`).

### Emotion (`classify.ts`, `stage.ts`, `animation.ts`)

- Each streamed reply is cut into segments (`sprites.segmentChars`, default 400); each segment is classified (judge or LLM,
  per speaker and per named member in narration) into an expression label; the label picks the sprite file for that
  member's set. Reads are stored on the message (`storedReads.ts`), so reload/rollback replays the same faces and a click on
  a passage (`passageClick.ts`) replays that passage's face.
- Playback after the stream paces faces along the text (1.2–6 s per segment).
- Face change = **crossfade** between two stacked `<img>` (`sprites.crossfadeMs`, default 250, 0–2000).
- Per-checkpoint authored face (`effects.stage.cast.<m>.face`) and set (`set`).
- Missing expressions can be built on demand (`sprites.onDemand`, ComfyUI, GPU).

### Idle life on plain sprites (plan v2.7 19 "B + P")

- **Breathing**: CSS `scaleY(1.008)` 4 s loop, phase offset per actor (`sprites.breathing`).
- **Blink**: prepared `blink` frame overlay, seeded gap 2.5–6 s per character (`blinkGap`, `sprites.blink`).
- **Talking mouth**: `talk`/`talk2` frame overlays while that member streams; `simple` flap or `smooth`, and a text
  viseme engine (`lipsync/textMouth.ts`, English letter-to-mouth, lazy chunk) drives open/form (`sprites.mouth`).

### Live close-shot head (plans v2.8 36, 74 step 1, 81; lazy WebGL chunk)

When a rig exists and the actor is in `close` framing (`sprites.liveHead`):

- Mesh deformation of a layered bust: breath, head turn/tilt (angleX/Y/Z), body roll/sway, seeded blinks, gaze with iris
  rendering, brow, eye smile, blush, streamed viseme mouth (drawn mouth sprites when present), hair strands with spring
  physics, optional hand layer with finger tap.
- **Presence** model: `talking` (talk nod coupled to mouth, extra head noise), `listening` (slight forward bias, occasional
  nods), `idle` (seeded slot scheduler picks an idle motion).
- **Keyframed motions** (Hermite-sampled tracks, `motionTracks.ts`): reactions `nod, tilt, think, giggle, surprise, shy,
  no, greet`; idles `glance, sway, sigh, doze, stretch, lean, hum, tap, waiting`. An expression *change* fires the mapped
  reaction (joy→nod, amusement→giggle, surprise/fear→surprise, sad→sigh, anger→no, embarrassment→shy, curiosity→tilt,
  thinking→think) when the member is not talking.
- Expression **textures**: one rendered sprite per expression family (happy/angry/worried) drawn on the same rig, shader
  crossfade between textures (plan 81).

### Look and pose changes (plans v2.8 33, v3.0 20)

- **Looks**: card fields bound to qualities (`cardFields`, `visual: true`) change the actor's set when story state changes
  (outfit, injury), through `lookApply`/`lookRebuild`; identity packs (`packs/stageLooks.ts`) supply the files.
- **Poses**: a pose library (shipped + custom, `poses/library.ts`); per segment a pose is picked (judge/LLM `pick.ts`, or
  keyword) and the body set swaps; authored `effects.stage.cast.<m>.pose` and story defaults. Full-body rigged posing
  (74 step 2) was a NO-GO and is dormant.

### Accessibility

- ST's own reduced motion (`power_user.reduced_motion`, `spriteReducedMotion()`), the OS `prefers-reduced-motion`, and the
  story's `display.motion: false` each stop breath, blink, mouth and live-head motion and set crossfades to 0.
  `body.reduced-motion` already zeroes `--so-dur` for our panels.

### What does NOT exist

- No **enter/exit** animation: a member who joins or leaves pops in/out (React mount/unmount).
- No **move** animation: when the cast count changes, everyone jumps to new `left` positions (no transition on `left`).
- No **scene/background transition**: `effects.background` calls ST `/bg`, which swaps `#bg1`'s `background-image` with a
  hard cut. Checkpoint transitions and chapter seals have no visual beat on the stage.
- No reactions on plain sprites (shake, hop, emote icons); keyframed reactions exist only inside the live head.
- No camera (zoom/pan), no depth of field, no ambient particles/weather, no lighting/tint tied to `story_time`, no
  tension-driven screen treatment, no letterbox.

## 2. Ideas (from VN engines and neighbours)

Reference points, briefly:

- **Ren'Py**: `show x with <transition>`; built-ins `dissolve, fade, pixellate, move, moveinleft/right, moveout*, ease*,
  zoomin/out, vpunch/hpunch, wipe*, slide*, push*, irisin/out, blinds, squares`; classes `ImageDissolve` (mask-driven
  dissolve), `AlphaDissolve`, `Swing`, `MoveTransition`; ATL (keyframed transform language: linear/ease, xalign, zoom,
  rotate, alpha, repeat, parallel); layered images (attribute-composed sprites); 3D stage camera (`camera` with z depth).
- **Naninovel**: actor poses (named bundles of position/tint/scale/appearance), per-actor tint, `@shake` (actor or camera),
  `@glitch`, `@rain`, `@snow`, `@sun` shafts, `@bokeh` depth of field, `@blur`; camera zoom/offset; spawn effects fade in/out.
- **WebGAL** (PixiJS): named figure/bg animations (enter, exit, shake, …), `setTransform`, `setTempAnimation`, parallel and
  persistent (`-keep`) animations, figure positions left/center/right.
- **TyranoScript / Builder**: `chara_show/hide` with fade time, `chara_move`, `quake` (screen shake), `camera` zoom/pan,
  `mask` transitions, `filter` (blur/grayscale/sepia), focus by dimming others (`chara_config ptext/talk_focus`).
- **Monogatari**: animate.css classes on show/hide (`fadeIn`, `slideInLeft`, `bounce`, `shakeX`, …), particles.js scenes.
- **Inkle / Ink games**: presentation lives in the host; tags drive cues; restraint (short fades, text-first).
- **Live2D Cubism Web**: proprietary SDK + Cubism Editor authoring, unfit for a public plugin; **Inochi2D** (BSD-2) web
  runtime immature. Our mesh head already covers the close shot (plan 36); 05.1 layered rig stays parked.
- **Pixi filters** (as vocabulary): adjustment, kawase blur, zoom blur, shockwave, godray, glitch, CRT, old film, tilt-shift.
  We do not need Pixi: CSS filters cover most, and we already own a WebGL renderer for the head.
- **VTube-style idle**: breathing, micro head noise (fbm), gaze saccades, blink variance, physics hair. Ours already has
  all of these inside the live head; plain sprites have only breathing and blink.
- **ST neighbours**: Prome VN (AGPL): speaker shake while streaming, defocus, CSS tint presets on `#bg1` and sprites
  (time-of-day look), letterbox bars, show-only-last-message. Doom's (AGPL): weather on one canvas + one rAF loop that fully
  stops on hidden tab / reduced motion / perf mode, device-scaled particle counts, sun/moon position from a parsed time.

Each idea below: signal that drives it deterministically, authored vs automatic, technique and cost, GPU, risk, size.
"CSS" = CSS transitions/keyframes or WAAPI on the existing DOM; zero GPU beyond compositing, nothing on the 3090 that the
text model or ComfyUI would notice. All new code goes in the sprites lazy chunk or a new lazy chunk (main budget 1,300,000 B).

### A. Stage transitions (scene change, checkpoint, chapter)

- **A1 Background crossfade.** Signal: `effects.background` applied at a boundary (or hydrate). Automatic. Technique: before
  calling `/bg`, clone `#bg1`'s current `background-image` into a temporary layer of ours above `#bg1`, then fade it out
  (our layer, not a write to ST's element; a new `stHost` read of the current url). Default 600 ms dissolve. CSS, S. Risk:
  ST's locked/custom chat background and animated (webp/mp4) backgrounds; must not fire on hydrate (only on a boundary
  that changed it).
- **A2 Authored transition kind.** `effects.transition: {kind: "dissolve"|"fade"|"wipe"|"iris"|"cut", ms?, color?}` per
  checkpoint (or on a `transition` entry, picked when that transition fires). Signal: the fired transition in the
  `BoundaryLogEntry`. Authored, default `dissolve`. `fade` = to color and back (Ren'Py `Fade`), `wipe` = CSS `clip-path`
  or mask-position animation, `iris` = `clip-path: circle()`. CSS, M (schema + validate + guide topic + Studio field).
  Risk: schema surface; keep the vocabulary tiny (5 kinds).
- **A3 Mask dissolve (Ren'Py `ImageDissolve`).** A grayscale mask image drives the reveal order. CSS `mask-image` with an
  animated threshold is awkward; canvas or the existing WebGL path is clean. Authored (`kind: "mask", mask: "<file>"`). M.
  Later; A2 first.
- **A4 Chapter card.** Signal: chapter seal (`runtime/chapterSeal.ts`). Automatic: a short title card (chapter name,
  fade to dark, 1.5–2 s, click to skip) over the stage, never over the input. CSS, S–M. Risk: must not reveal anything a
  player page would not (use the sealed chapter's public `short`/title only).
- **A5 Letterbox on cinematic beats.** Bars slide in (Prome). Authored per checkpoint (`effects.stage.letterbox: true`).
  CSS, S. Low value unless paired with A4.

### B. Character enter / exit / move

- **B1 Enter/exit.** Signal: actor set diff in `compose()` (cast changes, `hidden`, `standsOnStage`, speaker joining).
  Automatic: enter = fade + 3% rise from below (or slide from the nearer edge); exit = fade + sink. Keep exiting actors
  mounted for the exit duration (a `leaving` list in the view). CSS, S–M. Risk: an actor flickering in/out when the
  directed-cast rule changes mid-stream; debounce by boundary.
- **B2 Move on re-layout.** Animate `left`/`width` (or transform translateX) when the count changes (Ren'Py `move`/`ease`).
  Automatic. CSS one-liner plus keyed ordering; S. Risk: animating `left` triggers layout; use `transform`.
- **B3 Authored entrance style.** `effects.stage.cast.<m>.enter: "fade"|"left"|"right"|"bottom"|"none"` (Ren'Py
  `moveinleft`, Tyrano `chara_show`). Authored. S on top of B1.
- **B4 Authored position.** `effects.stage.cast.<m>.at: "left"|"center"|"right"|<0-100>` instead of auto spread (WebGAL
  positions, Ren'Py `at left`). Authored. S–M. Useful for confrontations (two sides) and with B2 makes a "walk over".

### C. Focus and speaker emphasis (beyond brighten)

- **C1 Settle on speaker change.** A small hop (translateY −6 px, 180 ms ease-out) when a member *starts* speaking
  (Tyrano/Monogatari). Signal: `speaking` change. Automatic, setting. CSS, S. Risk: noisy in fast group turns; at most once
  per boundary per member.
- **C2 Depth of field.** Non-speakers get `blur(1.5px)` on top of the dim (Naninovel `@bokeh`); the background optionally
  blurs while someone speaks in close framing. Automatic, setting `focusStyle: "dim"|"dim+blur"`. CSS filter, S. GPU: blur
  filters on large layers cost compositor time on weak iGPUs; cap to sprites only by default.
- **C3 Listener lean.** Plain sprites of listeners turn slightly toward the speaker (`skewY`/`rotate` ±1°, or a mirrored
  sprite flip only if authored). Automatic. CSS, S. Risk: mirroring breaks asymmetric art; do rotate only.
- **C4 Speaking shake (Prome).** Tiny tremble while streaming. Low value; skip unless tied to tension (E2).

### D. Emotion-change transitions

- **D1 Reaction motions on plain sprites.** Reuse the live head's label→reaction map (`reactionFor`) with CSS keyframes
  for whole-sprite versions: `nod` = 2 dips, `surprise` = hop + scale 1.03, `no` = small horizontal shake, `sigh` = sink
  2% and rise, `giggle` = 3 quick bobs, `shy` = shrink 2% + lean. Signal: expression label change (already stored reads, so
  replay-deterministic). Automatic. CSS/WAAPI, S–M. Highest value per byte: it gives non-rigged sprites (the common case)
  the gestures only the live head has today.
- **D2 Emote bubbles.** Small icon above the head on strong labels (sweat drop for nervousness, anger vein, "!" for
  surprise, "…" for thinking, heart for love). Signal: label + a strength threshold (classifier confidence if present).
  Automatic, setting, and authored per member off-switch. SVG/CSS, S–M. Risk: tone (comic) clashes with grim stories;
  default off, story opt-in `display.emotes`.
- **D3 Crossfade by kind.** Big swings (neutral→anger) use a quick 120 ms cut + D1 shake; small ones the existing crossfade.
  S. Polish.

### E. Tension and mood

- **E1 Tension vignette.** Signal: tension level from pacing (`buildTensionSnapshot`, the HUD's value). Automatic: a radial
  vignette over the stage whose opacity follows tension (0 at calm, ~0.35 at critical), eased over 2 s; slight desaturation
  of the background at critical. Pure CSS overlay, S. Author off-switch `display.stage_mood: false`. Risk: must read the
  player-safe tension, never author-only steering.
- **E2 Critical beat punch.** Screen shake (Ren'Py `vpunch`, Naninovel `@shake Camera`) once when tension *crosses* into
  critical or when an authored checkpoint says `effects.stage.punch: true`. CSS, S. Reduced motion: replace with a flash of
  the vignette.
- **E3 Authored tint/look.** `effects.stage.look: "night"|"dusk"|"storm"|"memory"|{brightness,saturate,hue,sepia}` applied to
  background and sprites (Prome tint, Naninovel tint, Tyrano filter). Authored per checkpoint. CSS filter vars on our layer
  plus a ledgered inline filter on `#bg1` (v2.4 idea 3: through a new `stHost` seam and `EffectsApplier.withLedger`,
  restore on leave). M. `memory` = sepia + soft blur for flashbacks.

### F. Time of day and weather

- **F1 Lighting from `story_time`.** Signal: derived `time_part` / `is_night` (`engine/life/clock.ts`, authored
  `clock.times`, `clock.night`). Automatic when the story has a clock: map parts to looks (dawn warm, day neutral, dusk
  orange, night blue-dark) with an authored override `clock.looks: {<part>: <look>}`. Reuses E3's look renderer. S once E3
  exists. Risk: a background painted at night gets darkened twice; authored `effects.background` can carry `lit: true` to
  opt out.
- **F2 Ambient particles.** Rain, snow, dust, embers, fireflies, mist (Naninovel `@rain/@snow`, Doom's canvas). Signal:
  authored `effects.stage.weather: {kind, intensity}` per checkpoint, or a story quality bound to it
  (`stage.weather_from: "<enum quality>"`), never a model guess at render time. One canvas, one rAF loop, stops on hidden tab,
  reduced motion, `display.motion: false`, zero intensity; device-scaled counts (Doom's pattern, our code). Canvas 2D,
  lazy chunk ~8–15 KB, M. GPU: canvas 2D with ≤150 particles is negligible; never WebGL for this. Risk: the battery/CPU of
  an always-on loop; cap at 30 fps.
- **F3 Lightning/flash.** Part of `storm`: seeded flashes (hash of chat, boundary) so replays match. S on top of F2.

### G. Camera

- **G1 Push-in on spotlight.** Signal: authored `effects.stage.spotlight` or `framing` change. Automatic: animate the
  framing change (scale/translate of the whole stage over 500 ms) instead of the current cut between `full/thigh/close`.
  CSS transform on `#so-vn-stage`, S–M. Risk: `frameSlice` is per-image height/top; animate the container instead.
- **G2 Two-shot.** When exactly two members trade lines, frame both at `thigh` and center them. Automatic, M. Overlaps B4.
- **G3 Slow drift (Ken Burns) on the background.** 1–2% scale over 30 s, authored per background or global setting. CSS,
  S. Risk: motion sickness; obey reduced motion.

### H. Idle life on plain sprites (VTube-style without a rig)

- **H1 Sway.** Add a very slow seeded `rotate(±0.4deg)` from the feet, desynchronised from breathing. CSS, S.
- **H2 Blink variance.** Occasional double blink (seeded, 1 in 6). In `faceFrames.startBlink`. S.
- **H3 Idle beats.** The live head's idle scheduler (seeded slots, `scheduledMotion`) mapped onto D1's CSS whole-sprite
  motions (glance = tiny lean, sigh = sink). Automatic. S after D1.
- **H4 Eye follow.** Needs eye layers; only the live head has them (gaze exists). Mouse follow was declined in plan 74. Skip.

### I. Accessibility and control

- **I1 One motion budget.** Every new effect reads the same three switches (ST reduced motion, OS media query, story
  `display.motion`) through one `stageMotion()` helper; screen shake, particles, camera and Ken Burns are off under
  reduced motion, transitions become ≤150 ms opacity-only. Plus one player setting `sprites.effects: "full"|"calm"|"off"`.
  S, and a prerequisite for the rest.
- **I2 Flash safety.** Lightning and punch never exceed 3 flashes per second (WCAG 2.3.1). S.

## 3. Fit to SO

- **Deterministic first.** Every effect above is driven by state that rollback and replay already reproduce: the boundary
  log (fired transition, `effects.*` of the active checkpoint), stored expression reads on the message, `story_time` keys,
  tension history, chapter records. No effect asks a model at render time. Seeded randomness only (hash of chat, story,
  boundary or actor), never `Math.random` for anything a replay should match (particle positions are exempt: cosmetic).
- **Where it lives.** Presentation only, inside `src/sprites/` (lazy chunk, mounted under `#so-vn-root` / `#so-stage-strip`).
  Effects never write the blackboard or memory. The only host writes are the background crossfade layer (ours, no write to
  ST) and E3's `#bg1` filter (new `stHost` module, ledgered, compare-and-set restore on leave, capability probe).
- **Authored vs automatic.** Automatic: A1, A4, B1, B2, C1, C2, D1, E1, F1 (when a clock exists), H1–H3. Authored:
  A2/A3, A5, B3, B4, E2 (punch), E3, F2/F3, G3. New story fields cluster under the existing `effects.stage`
  (`look`, `weather`, `punch`, `letterbox`, `cast.<m>.enter`, `cast.<m>.at`) plus `effects.transition` and `clock.looks`;
  each needs validate, a guide topic (`guideCoverage.test.ts`), a Studio field and storyDiff identity.
- **Stagecraft.** Curators stay propose-only: a curator could later *propose* `effects.stage.look/weather` for the author's
  review like any other op, never apply live. Not in the first plan.
- **Player/author split.** Everything here is player-visible presentation; no author data reaches it. E1 must read the
  player-safe tension number only. A4 shows only the public chapter title.
- **Cost.** CSS/WAAPI for all but F2 (canvas 2D) and A3 (WebGL or canvas). Zero model calls, zero ComfyUI, no VRAM. Bundle:
  roughly 10–25 KB in the sprites chunk for the first plan; main bundle untouched.
- **Risk register.** (1) Group turns are fast: rate-limit hops/reactions per member per boundary. (2) `#bg1` is ST's:
  read it, overlay ours, write only through a ledger. (3) Stage z-order: particles and vignette go between `#bg1` and the
  sprites, never above `#chat` or the input. (4) Test surface: Storybook stories per effect (`test-storybook:ci`) plus pure
  unit tests for the signal→effect decisions; a live check is needed only for the background crossfade (host element).

## 4. Recommended first plan (ordered)

Theme: "the stage reacts" — every beat the engine already knows gets a visible, cheap, deterministic beat. All CSS except
item 8.

1. **I1 Motion budget** helper + `sprites.effects` `full|calm|off` (S). Prerequisite.
2. **B1 + B2 Enter/exit/move** (S–M): no more pop-in or jumping actors.
3. **A1 Background crossfade** on `effects.background` (S): the biggest "feels like a VN" gain per line.
4. **D1 Reaction motions on plain sprites** from expression changes, reusing `reactionFor` (S–M).
5. **C1 + C2 Speaker hop and optional depth of field** (S).
6. **E1 Tension vignette** (S) + **E2 punch on crossing critical** (S).
7. **A4 Chapter card** on seal (S–M).
8. **A2 Authored transition kind** (`dissolve|fade|wipe|iris|cut`) on checkpoint entry (M) — the first new story field;
   guide topic, Studio field, Adolion decision per AGENTS.md.
9. **H1–H3 Idle sway, blink variance, idle beats** on plain sprites (S).

Next plan (authored atmosphere): E3 look/tint (with its `stHost` seam) → F1 lighting from `story_time` → F2 weather canvas
→ B3/B4 authored entrance and positions → G1 camera push-in. Parked: A3 mask dissolve, D2 emotes (tone opt-in), G2 two-shot,
G3 Ken Burns, layered rig (05.1).

Gates per plan: `npm run gates` (Storybook included); Storybook story per effect; live check of A1 on a lane (background
crossfade touches a host element); reduced-motion check under ST's setting and the media query.

## 5. The script `scripts/debug/so-cast-presentation.mts`

What it is (102 lines, untracked): on a lane ≥ 1, for an existing group's members, imports a temporary workshop story,
then drives Studio > Sprites through `lib/pocSteps.mts` (base candidate, prepare, three expressions, blink/talk frames per
expression, rig), with a `--front` mode that retries up to 4 seeds until the rig accepts a front-facing base. Record in
`<debug dir>/cast-presentation/<stamp>/record.json`.

Overlap: `so-image-pilot`, `so-p41-journey` and `so-pose-latency` use the same `pocSteps` on the marked p41 test cast;
`so-sprite-builder.mts setup --story` imports a story and drives single builds. None prepares *existing* members end to end,
so the script fills a real gap (it is the only route that gives an owner's characters a live-head rig and frames without
clicking through Studio per member). It is not a `so-ui` verb and should not become one (a long GPU job, not a UI probe).

Safety as written: good guards — `SO_LANE >= 1`, `preflightCommon` (`laneProblem`, served-bundle check, trusted asset
baseline, leftover `SO-CAST` assets refused, ComfyUI clearance via `allowComfy`/`SO_ALLOW_COMFY`), workshop story removed
from the library in `finally`. Gaps found:

- **Binds the workshop story to the group's real chat.** It opens the group (its latest chat) and calls `importStory`
  there; `removeStory` only removes the library record (`so-library.mts:35-48`), so that chat keeps the workshop pin in
  `chat_metadata.story_orchestrator`, plus `authorView: true`. Fix: `new-chat` in the pinned group, run there, then
  `/delchat` + `settleReapPrompts` (as `so-scenario --sandbox` does).
- **Leaks install-wide sprite settings**: writes `enabled/explicit/stage: "always"/poses/liveHead/onDemand: false` and never
  restores. Fix: capture `getGlobalSettings().sprites` first, restore in `finally`, report as `cleanup.spriteSettings`.
- Outputs (sets `so_presentation_v1*`) are deliberately unmarked keepers in the **lane's** character folders; nothing moves
  them to the owner's install. That needs an explicit, owner-approved copy step (lane → owner ST) or a run on the owner's
  install, which the rules forbid while he plays. Owner question 5.
- `--front` is undocumented in `USAGE`; `--cast` asks for a JSON inventory when the group's member names are readable from
  the group itself (keep `--members` as a name filter instead of `m1,m2` ids).
- No run-header capture/diff around the run; no `node:test` for argument parsing; no README entry.

Recommendation: **keep it and commit it** as a harness tool after the two leak fixes (sandbox chat, settings restore), the
USAGE/README entry, reading members from the group, a header diff, and a small `node:test` over arg parsing and the cleanup
plan. Do not fold it into `so-image-pilot` (different purpose: renderer comparison) or `so-ui`. Do not delete: it is the
practical way to bring rigs and frames to the owner's real cast, which is what makes the motion features above visible on
his characters (D1 and the live head both need prepared frames/rigs).

## 6. Owner questions

1. First plan as ordered in §4 (all automatic, CSS, plus one authored field `effects.transition`)? Or lead with authored
   atmosphere (tint, time-of-day lighting, weather)?
2. Tone: are comic touches (emote bubbles, hops) wanted by default, or only subtle ones (fades, vignette, reactions) with
   emotes as a per-story opt-in?
3. Should effects default to `full` (every built feature on, per the house rule) with `calm` available, or start at `calm`?
4. Adolion: adopt `effects.transition` / later `look` / `weather` in the campaign (another model reviews content), or keep
   the campaign on automatic effects only for now?
5. The cast-presentation script prepares rigs on a lane copy. Do you want a lane → your-install copy step for the prepared
   sets (you approve each run), or will you run it yourself on your install when you are not playing?
