# Plan 19 — Talking sprites: blink and mouth frames, and why not Talkinghead

**Status (2026-10-04): v2.7 plan 19 (was v2.8 07; before that v2.7 plan 28, "Talkinghead review"; moved to v2.7 with
the image track, 2026-10-04). Implemented candidate: blink/talk/talk2 frames, the streamed-mouth animator and the
Mouth movement setting are built; the Belle pilot produced the frames and a real streamed reply moved the mouth.
Full spike S28 is open, owned by `24-image-and-local-completion.md`. Its Belle original-expression frame matrices
pass pixel QA ×2; the labeled regular/two/three-frame review awaits the user. Multi-character, from-neutral and
live performance floors are still unmeasured. See plan 24's latest Gate record.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D + LI (spike S28 renders frames on the local ComfyUI);
acceptance LI + a streamed reply on a named backend (RP: `Artemis RunPod RP`; or CL: a DeepSeek Chat Completion
profile with streaming on).

Depends on **v2.7 18 sprite generation** (the in-plugin builder and its edit recipe) for the in-plugin frame build, and
on v2.7 17's route B interfaces through it. The campaign-side build (`render_sprites.py --anim`, v2.8 02) and the
runtime animator do not wait for 06. Rig option D is **deferred, v2.9 05**.

Storage correction (user, 2026-10-03): existing image models stay on C: for autoload. Off-C model preconditions below
are superseded for this installation (overview rule 5 exception); record the existing paths, do not copy weights.

The user's words: "what about using https://docs.sillytavern.app/extensions/talkinghead/ to complement our sprite
engine?" Follow-up: "maybe it's old and expensive, we could consider something similar for us? more cheap and modern?"

So this doc does two things. It keeps the Talkinghead review short (§1). The main body (§3–§6) surveys 2025–2026
ways to give our VN sprites idle life, blinking, a talking mouth and emotion changes, and proposes one.

Web content below was fetched on 2026-10-03 and is treated as data. "Not determined" means not checked or not
measurable from here.

## 1. Talkinghead: what it is, and its status (verified)

**What it is.** An ST extension built on THA3 (Talking Head(?) Anime from a Single Image 3, by Pramook Khungurn). It
animates one 512×512 RGBA image live: random idle motion, blinking, breathing, emotion poses mapped to the classify
labels, lip sync to TTS, and a post-processor (bloom, scanlines and so on). It ran inside **SillyTavern-Extras**, a
separate Python server started with the `classify` and `talkinghead` modules (`--talkinghead-gpu` for GPU). It served
frames at `http://localhost:5100/api/talkinghead/result_feed`. Measured speed on its docs page: about 1 FPS on CPU and
9–10 FPS on an RTX 3060. Input rules: one upright, forward-facing figure, head inside a 128×128 box in the top centre,
background alpha 0. Model licence: CC BY 4.0. Sources: [ST docs: talkinghead](https://docs.sillytavern.app/extensions/talkinghead/),
[THA3 demo](https://github.com/pkhungurn/talking-head-anime-3-demo), [SillyTavern-Extras](https://github.com/SillyTavern/SillyTavern-Extras).

**Status: dead in current ST.**
- The ST docs page itself says the extension is deprecated and that support was discontinued in 1.12.13.
- The Extras README says the project "is discontinued and won't receive any new updates or modules". The fetched page
  dates the archive to 2024-04-24.
- Our ST checkout (`C:\dev\SillyTavern-MainBranch`, 1.19.0, `7c3994196`, 2026-09-14):
  - commit `73393a5d5` "yoink talkinghead - goodbye extras dependency" (2025-01-30) removed it. The first tag that
    contains it is 1.12.13. Earlier, `bea63a2ef` (2024-04-12) removed it from the expressions choices.
  - `grep -ri talkinghead public src` finds nothing.
  - Extras survives in the expressions extension only as a *classifier* source:
    - `EXPRESSION_API.extras: 1` at `public/scripts/extensions/expressions/index.js:85`;
    - the classify call at `index.js:1169-1183`;
    - the option labelled "Extras (deprecated)" at `expressions/settings.html:27`.

**Verdict.** Talkinghead cannot be integrated through ST. Current ST does not call it, behind any setting. Reviving it
means running an archived Python server with a live GPU stream. That breaks v2.7 17's "self-contained" direction and
the user's 2026-09-29 decision for a self-contained VN sprite system with no dependency on another extension. Its
*ideas* (blink, breath, mouth flap, emotion morphs) are still worth having, so the rest of this doc is about those.

## 2. Our sprite engine today (what an animation layer would sit on)

**Runtime (`src/sprites/`, lazy chunk).** It is loaded by a dynamic import in `src/runtime/index.ts:167`.
- `stage.ts`:
  - per actor: the sets (`<folder>` for default, `<folder>/<set>` otherwise, `stage.ts:205`), the label and the path;
  - which actor is speaking;
  - it already listens to `STREAM_TOKEN_RECEIVED` (`stage.ts:165`, `streamToken` at `:361`) to classify the reply
    segment by segment while it streams.
- `VnStage.tsx`:
  - one `<img>` stack per actor, cross-faded on a label change (`VnStage.tsx:85-115`);
  - focus and dim of non-speakers, with speaking scale 1.04 (`styles.css:36-44`);
  - a CSS breathing loop (`so-breathe` 4 s, scaleY 1.008, `styles.css:54,94`), desynced per actor
    (`--so-breath-delay`, `VnStage.tsx:101`);
  - framing (full/thigh/close) measured from the alpha (`direction.ts` `figureBox`/`frameSlice`);
  - it honours `prefers-reduced-motion` and ST's `reduced_motion` (`styles.css:99`, `stHost/sprites.ts:126`).
- Settings (`settings.ts`): `breathing`, `crossfadeMs`, `focus`. There is nothing for blink or mouth.
- Assets are read through ST's `/api/sprites/get` (`stHost/sprites.ts:95`), one subfolder level only
  (`SillyTavern-MainBranch/src/endpoints/sprites.js:18-29`).
- (Line refs in this section are from the original draft; not re-checked 2026-10-03.)

**Build side (`adolion-campaign/scripts/render_sprites.py`, 809 lines).**
- 14 campaign labels (`campaign/expressions/vocabulary.json`), plus per-character extras.
- **Inventory** (dated, from v2.7 17 §F: `C:\dev\adolion-campaign` at `8012a61`, 2026-10-03, tracked files): 146
  characters (folders with `sets.json`), 201 sets (`sprites/<set>/` folders), **2,889 expression PNGs** (files in
  `sprites/<set>/`, about 14.4 per set), 0 animation frames. The old figure here (about 3,464) was an estimate from
  146 × a guessed labels-per-set; it is replaced. Other PNGs under `campaign/sprites/` (bases, candidates, contact
  sheets, inputs, poses; 4,544 in all) are not frame sources.
- Each expression is made by cropping the head box from the set's base, editing it with Qwen image edit
  (`qwen21-edit.api.json`), and pasting it back through a feathered ellipse, so the body stays bit-identical
  (`render_sprites.py:25`, `:528-580`, `paste_mask` `:348`).
- Each edit is QA'd automatically: `ring_drift < 14 and changed > 4` (`:571-573`).
- The head box is recorded per set in `manifest.json` (`:547`).

**The key fact for this plan:** the pipeline already does "same head, change only the face" edits with a drift check.
An eyes-closed frame or a mouth-open frame is the same operation with a different prompt.

## 3. What "the same feel" needs

| Effect | Talkinghead | Our engine today |
|---|---|---|
| Idle life (breath, sway) | yes, live | breath only (CSS scaleY) |
| Blink | yes | no |
| Talking mouth | lip sync to TTS audio | no (speaker scale + focus only) |
| Emotion change | pose morph from one image | cross-fade between 14+ authored PNGs per set |
| Framing full/thigh/close, several actors | bust only, one character | yes |

What we lack is blink, mouth, and a little more idle motion. Emotions are already better served by authored PNGs
than by morphs, so they are out of scope.

## 4. Survey: cheaper, modern options (2025–2026)

The criteria come from the follow-up: browser or build time (no always-on server), GPU/CPU cost, input (our PNG sets
or one image), anime quality, multi-actor stage, licence.

| # | Option | Where it runs | Cost | Input | Anime quality | Multi-actor | Licence | Notes |
|---|---|---|---|---|---|---|---|---|
| P | **Procedural CSS idle** (breath exists; add a slight sway or bob on the speaker, a settle on a label change) | browser, compositor-only transforms | ~0 | today's PNGs | fine; no faces move | yes | ours | Ships with anything below; cannot blink or talk. |
| B | **Build-time variant frames through the existing ComfyUI edit pipeline** (eyes-closed, mouth-open, optionally mouth-half, per label) + a tiny runtime animator in `VnStage` | build: local ComfyUI or pod; runtime: `<img>` toggles | build: 2 or 3 extra head edits per label per set (time per edit not determined; measure); runtime: ~0 GPU | our PNG sets (same base, same head box) | same model and QA as today's expressions; the risk is a visible seam or pop at the toggle (spike) | yes; each actor has its own timer, only the speaker flaps | ours + whatever the edit model is (Qwen image edit; licence not re-checked here) | Zero new runtime dependency. A missing frame degrades to today's static sprite. |
| C | **Offline portrait animators pre-rendering short loops** (LivePortrait; THA4) | build only | GPU; THA4 needs an RTX 2080-class card, and its distilled per-character student takes about 30 h on an A6000 per character | one image (THA4: 512×512 RGBA, head in a fixed box; LivePortrait: a portrait crop plus a driving video) | THA4 is made for anime; LivePortrait for humans and animals, anime not determined | as files, yes | THA4 code MIT, **models CC BY-NC 4.0**; LivePortrait code and weights MIT, but its InsightFace detector is **non-commercial** | NC terms rule both out for a public plugin's default path. Our full/thigh framing does not fit THA4's 512 bust box. |
| D | **Layered 2D rig**: See-through (one anime image → up to 23 inpainted layers as PSD) → auto-rig (Stretchy Studio → Spine 4.0 JSON; Iki → own `.iki` JSON + WebGL2 runtime) → mesh runtime in the page | build: See-through 12–16 GB VRAM (≈8 GB with NF4), 2–3 min per image; runtime: WebGL | heavy build; runtime WebGL per actor | one image per *set* (every set is a new rig) | real Live2D-like motion when it works; how robust auto-rigging is on our art is not determined | yes, but N WebGL contexts or one shared canvas | See-through Apache-2.0 (V3 models 2026-04-14); Stretchy Studio MIT; Iki MIT (v0.x, 9 stars, schema "still settling"); **Spine runtimes need every end user to own a Spine Editor licence**, so Stretchy's Spine export is unusable for a public plugin; Inochi2D BSD-2 (web via WASM from 0.9) | **Deferred, v2.9 05.** The closest to the "Live2D feel"; also the route the user dropped on 2026-09-29. flat2rig (MIT, CPU, part-based, 0 stars): too immature. |
| E | **Video-loop sprites** (Wan 2.2 image-to-video, first/last-frame loop workflows in ComfyUI) | build only | Wan 2.2 TI2V-5B: 24 GB VRAM, under 9 min per 5 s 720p clip (README) | one image per label | good motion; identity drift and alpha not determined (video has no alpha, so each frame needs a cutout) | yes, as files | Apache-2.0 | One clip per expression PNG (2,889 in the Adolion inventory) makes it the most expensive option by far. Heavy files; looping per label fights cross-fades. |
| A | **Talkinghead via Extras** | live Python server + GPU | always-on GPU | one 512 bust image | THA3 | one character | CC BY 4.0 | Removed from ST (§1). |
| F | **Do nothing** | — | 0 | — | — | — | — | Today's breath and cross-fade stay. |

Sources:
- THA4: [demo repo](https://github.com/pkhungurn/talking-head-anime-4-demo), [licence](https://github.com/pkhungurn/talking-head-anime-4-demo/blob/main/LICENSE).
- LivePortrait: [repo](https://github.com/KwaiVGI/LivePortrait), [licence notes via sd-webui-live-portrait](https://github.com/dimitribarbot/sd-webui-live-portrait).
- See-through: [repo](https://github.com/shitagaki-lab/see-through), [paper](https://arxiv.org/abs/2602.03749), [ComfyUI node](https://github.com/jtydhr88/ComfyUI-See-through).
- Rigging tools and runtimes: [Stretchy Studio](https://github.com/MangoLion/stretchystudio), [Iki](https://github.com/zeikar/iki), [flat2rig](https://github.com/Patrickstar023/flat2rig), [Inochi2D](https://github.com/Inochi2D/inochi2d), [NLnet Inochi2D](https://nlnet.nl/project/Inochi2D/).
- Spine: [runtime licence](https://github.com/EsotericSoftware/spine-runtimes/blob/4.1/LICENSE), [Spine runtimes](http://esotericsoftware.com/spine-runtimes).
- PixiJS (MIT; whether v8 has mesh deformation was not determined from the README): [repo](https://github.com/pixijs/pixijs).
- Wan 2.2: [repo](https://github.com/Wan-Video/Wan2.2), [loop workflow](https://www.nextdiffusion.ai/tutorials/wan-2-2-looping-animations-in-comfyui).

Prior art in our research: Prome VN (`docs/plans/v2.4/extension-research/prome-visual-novel-extension.md`).
- It is pure DOM/CSS over ST's VN mode: speaker focus/defocus, and a "shake" only while streaming
  (`listeners.js:66-72` in their repo).
- It has no blink or mouth frames.
- Two things transfer:
  - treat a stream as done only when `isFinished && !isStopped`, with a hard timeout;
  - avoid MutationObserver re-runs on `#chat`.

## 5. Proposal (decided): B + P; D deferred to v2.9 05

**Build-time variant frames + a runtime animator (option B), plus procedural idle (P).**

### Build side (campaign first, then v2.7 18)

1. `render_sprites.py --anim` (v2.8 02 row) adds head edits per label from that label's own sprite (or from the
   neutral base, if S28 says so). Edited from the label's own sprite, the brows and eyes of `afraid` stay `afraid`.
   - `blink`: "eyes fully closed, everything else identical".
   - `talk`: "mouth slightly open as if speaking, everything else identical".
   - `talk2` (half open): rendered only for sets that ship the 3-frame mouth. S28 renders it for every sample sprite
     so both arms can be compared.
   - The paste, the feather and the `ring_drift` QA are the ones `render_labels` already uses (`:540-580`).
   - Add a tighter QA for these frames: the change must stay inside the eye band or the mouth band of the head box.
     Measure where the pixels changed.
   - Paths come from settings/env, never `C:\dev\ComfyUI` or a Python path in the script (v2.8 02); ComfyUI is the tray
     entry, and its model path is off `C:` (v2.7 rule 8, precondition recorded in v2.7 17).
2. **File layout. This is a trap to avoid.** ST derives a label from the file name by cutting at the first `-` or `.`
   (`SillyTavern-MainBranch/src/endpoints/sprites.js:136-138`), and our `spriteIndex` keeps the first file per label
   (`profile.ts:45-49`).
   - Problem: `happy.blink.png` sorts before `happy.png`, would become `happy`'s sprite, and ST's own expressions
     would show it as an alternate.
   - Fix: frames go in a separate one-level subfolder per set, `<folder>/anim-<set>` (`anim-default` for the root
     set).
   - A hyphen can never be a set id (`direction.ts` `ID = /^[a-z0-9_]+$/`), so no set rule can pick that folder up.
   - Inside the folder, names are `<label>.blink.png`, `<label>.talk.png` and optionally `<label>.talk2.png`; our own
     lister reads the suffix from the path.
3. **Per-set frame counts.** The lister derives, per set and label, which frames exist:
   - mouth frames = 1 (base only) | 2 (base + `talk`) | 3 (base + `talk2` + `talk`);
   - blink = present or absent.
   A set may ship 2 or 3 mouth frames; labels inside one set may differ (a missing `talk2` on one label makes that
   label 2-frame).
4. **Frame size: decide in the spike.**
   - Full-canvas overlays are simplest: the same box as the base, stacked, with transparent outside the head. But each
     decodes at full canvas size.
   - Cropped head patches plus the box, which is already in `manifest.json` `head_box`, decode at a fraction of that
     size. They need a sidecar or a box encoded in the file name.
   - The decoded-memory floor in §6 decides.
5. **Cost** (denominator: the 2,889 expression PNGs of the dated inventory). 2-frame mouth: `blink` + `talk` =
   2 × 2,889 = **5,778 head edits**. 3-frame mouth: + `talk2` = 3 × 2,889 = **8,667**. Seconds per edit on the 3090 or
   a pod: not determined (S28 step 1).

### Runtime side (`src/sprites/`, about 100 lines, no dependency)

**Settings** (install-wide, `sprites` settings, sanitized like `breathing`):

| Key | Values | Default |
|---|---|---|
| `blink` | `true \| false` | `true` (decision 4) |
| `mouth` | `"off" \| "simple" \| "smooth"` ("Mouth movement") | set by S28's blind rating: `smooth` if the 3-frame arm wins, else `simple` |

- Reduced motion (`prefers-reduced-motion` or ST's `reduced_motion`) overrides both: no blink, no flap, whatever the
  settings say. The setting is not rewritten; it is ignored while reduced motion is on.
- An old stored boolean `talk` is not migrated (never released, no legacy compat).

**Frames used per actor** = f(setting, the label's frame count):

| `mouth` | label has 1 frame | 2 frames | 3 frames |
|---|---|---|---|
| `off` | none | none | none |
| `simple` | none | base ↔ `talk` | base ↔ `talk` (ignores `talk2`) |
| `smooth` | none | **falls back to simple**: base ↔ `talk` | base → `talk2` → `talk` → `talk2` → base |

**Algorithm.**
- `stage.ts` loads the `anim-<set>` pack next to each set (one more `spriteList`), builds the per-label frame table
  above, and exposes `talking` (the speaking actor while tokens arrived in the last ~250 ms) on the view.
  - It already receives `STREAM_TOKEN_RECEIVED`.
  - Stream end follows Prome's `isFinished && !isStopped` rule plus a timeout.
  - The view gets a second, high-rate channel so per-token updates do not re-render the whole stage. That channel is
    a small per-actor store, or CSS classes toggled through a ref.
- `VnStage.tsx`: per actor, one overlay `<img>` above the current sprite (inside `.so-sprite-breath`, so framing,
  breath and cross-fade transform it too).
  - **Blink:** random 2.5–6 s gap, 120–160 ms closed, and an occasional double blink. Each actor has its own timer,
    seeded from the avatar, so actors are not in lockstep. No `blink` frame for the label: no blink.
  - **Mouth:** while `talking`, step through the sequence chosen above at ~8–10 Hz with jitter (`smooth` steps at the
    same rate, so a cycle is longer). Only the speaker moves its mouth. Not streaming: no flap (the reply arrives
    whole). Blink and mouth overlays are separate layers, so they can coincide.
  - **Missing frames.** A frame that fails to load or decode is dropped from the table: a 3-frame label that loses
    `talk2` becomes 2-frame, one that loses `talk` becomes 1-frame (no flap), and the blink layer goes away if
    `blink` fails. Today's static sprite is always the floor. One debug log per set, no user-facing error.
  - Overlays are preloaded and decoded (`img.decode()`) before first use.
  - During a label cross-fade, overlays pause until the fade ends.
- P (procedural): a 1–2 px speaker bob synced to the flap, and an optional very slow sway. Transforms only, desynced
  like breath. It ships even for sprite sets without frames, and stops under reduced motion.

**Self-containment (v2.7 17).**
- The frames are ordinary PNGs in ST's sprite folders, read through the API we already use. No server, no extension,
  no runtime GPU.
- A stranger's own sprite pack without frames still works (P only).
- In v2.7 18's in-plugin sprite builder, "blink + mouth frames" are more rows of the same edit recipe, with a 2- or
  3-frame choice per set.

**Why not D now.** See-through + an auto-rig is the only route to real head turns and parallax. It is also the
Live2D route the user dropped on 2026-09-29, it needs a WebGL runtime per actor, and every set is a separate rig.
Spine's per-user licence rules out Stretchy's export; Iki is v0.x. Deferred, v2.9 05 (decision 5).

**Why not C or E.**
- C: non-commercial model terms (THA4 models, LivePortrait's InsightFace).
- E: the cost (24 GB VRAM, minutes per clip, times every expression), plus alpha.
- Neither adds much over B for a reading-paced VN.

## 6. Spike S28 (predeclared floors)

Sample: 3 characters × default set × 4 labels (`neutral`, `happy`, `angry`, `worried`) = 12 sprites. The characters
are picked by another model for variety (glasses, long hair over the eyes, a non-human face). The user plays Adolion
fresh, so no campaign content goes into the report. Builds run on the local ComfyUI (tray entry, models off `C:`)
under the existing ComfyUI lock / GPU broker.

1. **Build (LI).** Render `blink` + `talk` + `talk2` for the 12 sprites, twice: frames edited from each label's sprite,
   and from the neutral base. Record seconds per edit.
   - Floor: ≥ 90 % of frames pass QA on the first seed. The QA is drift < 14 outside the eye/mouth band, and the
     change sits inside the band.
2. **Visual, blind.** Short screen captures of the stage for each arm: static (today), P only, B+P **2-frame mouth**,
   B+P **3-frame mouth**, and the from-label vs from-neutral recipe. The raters are the user, or the delegated rater as
   in the v2.6 blind packs.
   - Floor: B+P (either mouth arm) preferred over today in ≥ 70 % of pairs.
   - Floor: seam or pop visible in ≤ 5 % of rated clips.
   - 2 vs 3 frames: the arm preferred in > 50 % of its pairs sets the `mouth` default (`smooth` for 3, `simple` for 2);
     a tie keeps `simple` (cheaper: 5,778 vs 8,667 edits). Both stay selectable.
   - Whatever wins "from label vs from neutral" becomes the recipe.
3. **Runtime, 3 actors on stage**, VN mode, streaming a real reply (RP `Artemis RunPod RP`, or CL DeepSeek CC
   profile; both with streaming on), at 1920×1080 and in the strip at 390×844, with `mouth: smooth`.
   - Floors:
     - no long task (> 50 ms) attributable to the animator;
     - animator script ≤ 1 ms per frame on average (Performance panel);
     - layout and paint only on the overlay layers;
     - decoded image memory for the stage ≤ 64 MB with full-canvas overlays (3 mouth frames + blink). Otherwise switch
       to cropped patches and re-measure.
4. **Contention.** No GPU use at runtime beyond compositing. Check that GPU utilisation does not change with the
   animator on or off while a local text model runs.
5. **Bundle.** The `sprites` lazy chunk grows by ≤ 4 KB minified. The main entry does not grow.
6. Report: the floors with numbers, the chosen frame format and mouth default. Then go or no-go for the full Adolion
   render (cost = step 1 seconds × 5,778 or 8,667, quoted before any run).

## 7. Decisions for the user

1. Talkinghead itself: drop it (removed from ST in 1.12.13, Extras archived)? **Recommended: yes.** yes
2. Primary path B (build-time blink + talk frames + animator) with P (procedural idle)? **Recommended: yes.** yes
3. Mouth: two frames (closed/open), or three (with half-open)? **Recommended: two, three only if the blind rating asks
   for it.** lets have some sort of comparative or maybe even config

   **Review:** both.
   - **The spike's blind comparison** includes a 2-frame and a 3-frame mouth arm, so the rating decides the default.
   - **The animator reads the frame count per set,** so a set may ship 2 or 3 mouth frames.
   - **An install-wide setting** "Mouth movement: off / simple / smooth" picks how many frames are used when a set has
     them (`smooth` falls back to `simple` when a set has only two).
4. Blink and talk on by default whenever a set has frames? **Recommended: yes, both off under reduced motion.**  Lets do as you recommend
5. D (See-through + rig, real head motion) as a later spike, only if the playtest asks for it? **Recommended: yes,
   parked.** parked for next version
6. Does the Adolion render of about 6,900 frames go to the local 3090 night runs or a pod? Not determined until the
   spike measures seconds per edit. 
   - Recount (2026-10-03): 5,778 edits (2-frame mouth) or 8,667 (3-frame), from the dated inventory in §2.

## 8. Gates

- **D (deterministic).**
  - Pure helpers: blink schedule, flap sequence per (`mouth`, frame count) for all nine cells of the table in §5, the
    `smooth` → `simple` fallback, frame lister and its suffix parse (`talk`, `talk2`, `blink`), missing-frame
    degradation (3 → 2 → 1, blink dropped), settings sanitize (unknown `mouth` value → default). The lister test
    includes the `happy.blink.png` versus `happy.png` ordering case.
  - Reduced motion: with `prefers-reduced-motion` and with ST's `reduced_motion`, no blink and no flap under every
    `mouth` value; P stops too.
  - `VnStage` Storybook stories: 2-frame set, 3-frame set (`smooth` and `simple`), a set with frames missing, no frames,
    reduced motion. Interaction + a11y.
  - Registered in the v2.7 01 feature registry + Help (registry test); the "Mouth movement" setting has a Help line.
  - `npm run gates`.
- **LI (spike S28 build)**: §6 steps 1–2 on the local ComfyUI; preconditions as in v2.7 17 (tray entry ready, model path
  not on `C:`).
- **Acceptance (LI frames + a streamed reply on a named backend)**, live through the `debug` skill:
  - An adolion-fresh lane. **adolion-fresh switches sprites off when it seeds**, so the gate switches them on
    explicitly: through `so-session start <card> --media on --allow-comfy` (the card asks for sprites), or a settings
    write of `sprites.enabled: true` read back before play; `image.enabled` stays off. Frames are pre-rendered files,
    so the lane log must show **no** ComfyUI call; one is a failure.
  - The lane holds two sample characters with frames: one 3-frame set and one 2-frame set, plus one actor without
    frames.
  - Stream a real reply in a 3-actor group on `Artemis RunPod RP` (RP) or a DeepSeek CC profile (CL), named in the run
    header. With `mouth: smooth`: the 3-frame actor steps through `talk2`, the 2-frame actor falls back to base ↔ `talk`,
    the frameless actor does not flap; overlays stop after the stream ends. Repeat with `mouth: simple` and `off`.
  - Delete one frame file mid-session (or point one at a missing name): that label degrades, nothing errors.
  - Reduced motion on (ST setting): no blink, no flap.
  - The frame-budget floors of §6.3.
- **Campaign side**: `check_stage.py`-style validation that every `anim-<set>` frame has its base label and that
  `talk2` never appears without `talk`.
- The spike report records every floor of §6 before the full render.
- Player-visible surface (v2.7 rule 10): the mouth setting is the user's explicit decision of 2026-10-03; the frames
  themselves are judged by the S28 blind rating.

## 9. Links

- **v2.8 04 story presence panels**: player UI. The VN stage is part of what a player sees.
- **v2.8 20 character life** (§L2): scene mood "could drive expression sprites". Mood picks the *label*; this plan
  animates within a label. They are independent.
- **v2.7 17 self-contained images** (§F): frames must need nothing beyond ST's sprite folders; the dated inventory.
- **v2.7 18 sprite generation**: the in-plugin builder gains the blink/talk/talk2 recipe.
- **v2.7 20 living cards**: look sprites are new sets; a look set without frames animates with P only until frames are
  built for it.
- **v2.8 02 Adolion campaign**: the `render_sprites.py --anim` change and its paths moved to settings/env off `C:`.
- **v2.9 05**: rig option D (deferred).
- Memory: `adolion-sprites` (Live2D/Inochi2D dropped 2026-09-29; self-contained, SFW, build-time rendered).
- v2.4 research: Prome VN (`docs/plans/v2.4/extension-research/prome-visual-novel-extension.md`).

## Unresolved questions

- Seconds per head edit on the 3090 or a pod (sets the full-render cost).
- The sprite canvas resolution (it sets decoded memory and the full-canvas vs patch choice). Not read: the PNGs are
  git-LFS pointers in the campaign checkout.
- Whether ST serves a non-image sidecar from `/characters/<folder>/` (only needed for cropped patches).
- Whether Qwen image edit closes eyes cleanly behind glasses or hair over the eyes.

## Review of the answers (2026-10-03)

1, 2 and 4 taken as recommended. 3 is answered above (compare in the spike, plus a setting); §5 now specifies the
setting, per-set frame counts and the fallback. 5 is parked for the next version: deferred, v2.9 05. 6 is decided by the
spike's seconds-per-edit measurement: under about 2 s per edit it goes to the local 3090 night runs, otherwise to a pod.
The cost is quoted before any run.

## Review 2026-10-03

Applied from `v2.7/review-2026-10-03.md`:
- **F01**: title, status line and gate tiers.
- **F32**: settings schema (`blink`, `mouth: off/simple/smooth`), per-set frame counts, the frame table with the
  `smooth` → `simple` fallback, missing-frame degradation, reduced-motion override; 2- vs 3-frame mouth as S28 arms;
  gates for both frame counts, the fallback, missing frames and reduced motion.
- **D15**: counts restated from the dated inventory in v2.7 17 §F with denominators (2,889 expression PNGs; 5,778 or
  8,667 edits), replacing the ~3,464 / ~6,900 estimate.
- **"Runtime streaming needs a named backend"**: RP `Artemis RunPod RP` or a CL DeepSeek CC profile, streaming on,
  named in the run header.
- **"adolion-fresh turns sprites off"**: the acceptance gate switches sprites on explicitly (`--media on
  --allow-comfy` or a read-back settings write) and requires zero ComfyUI calls.
- **F31**: depends on v2.7 18, not "26b".
- **Rig option D**: deferred, v2.9 05.
- **Rule 5**: ComfyUI via its tray entry, model path off `C:`, campaign paths from settings/env.
- **B10**: registry + Help gate row.

Not re-checked: the `src/sprites` and `render_sprites.py` line refs in §2 and §5 (not named by the ledger).
