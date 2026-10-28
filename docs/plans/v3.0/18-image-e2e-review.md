# 18 — Image feature end-to-end review: consistency and quality (2026-10-26)

What the owner wants:

- the same character looks like the same person across pictures;
- pictures match the on-screen sprites and the background;
- good quality;
- sane timing: no duplicate or needless pictures.

This record covers one baseline journey and a small consistency probe. Static review: `research/image-astra-2026-10-26.md`
(its separate scoring dimensions are used here). No product code changed. Raw images stay outside this repo.

## Setup

- 3090, local controller (patched llama.cpp + MTP, text profile `fast`), ComfyUI 8188, landmarks 8096 (started for the run).
  The owner was not playing.
- Lane 33 (p41 lane), the SO-P41 showcase cast (Ash, Bram, Cleo). No campaign content was used or viewed.
- Before the run, lane 33 was a no-model copy whose loopback URLs pointed at the closed port 18079. Changes made:
  - `st-lanes.mts restore-model 33`, which also switched the judge on;
  - its 37 loopback URLs reset to the owner's values (profiles → 18888, ComfyUI → 8188), with a backup in the session
    scratchpad;
  - `image.enabled: true`;
  - `image.directorProfileId` set to the lane's `Image Director` profile (`68422a21…`), mirroring the owner's fix.
- Harness deviation that matters for scoring: the p41 harness gives each card the showcase avatar (`CARD_ART_DEVIATION`),
  which contradicts the card text.
  - Ash: the text says copper hair, grey eyes and a mustard rain jacket; the sprite has red hair, green eyes and a green
    tunic.
  - Bram: the text says a grey-bearded keeper in a blue sweater; the sprite is a young knight in plate and a blue cape.
  - Cleo: the text says a black bob, glasses and a green cardigan; the sprite is a silver-haired girl in a purple
    witch hat and coat.
  - The sprite pipeline (Qwen edits from card art) follows the art. The automatic SDXL path only reads text. Arm B below
    controls for this.

## Commands and records

- Baseline journey on master `2403c70f`:
  - command: `node scripts/debug/st-lanes.mts run 33 -- scripts/debug/so-p41-journey.mts run 1 --candidate --keep --label e2e26`;
  - record: `C:\dev\so-lanes\33\debug\p41\2026-10-26T17-24-20-483Z-e2e26-real-run1\record.json`.
- Probe on `f96dabda` (= `5d65515d` image fixes + refactor), staged by the lead and served after
  `st-session.mts reload` (served manifest commit verified).
- Probe script: the session scratchpad `image-e2e-probe.mts` (not committed). It wraps `storyOrchestratorImage.plan/direct`
  in page and samples the controller's `/status` every 2 s.
  - Arm A, SDXL with card text as shipped: `… image-e2e-probe.mts --label armA --phases setup,sdxl,refs --turns 10 --every 2`.
  - Arm B, SDXL with `illustrations.appearances` authored to match the sprites: `… --label armB --phases setup,sdxl --turns 10 --every 2 --appearances`.
  - Qwen prepared cast, driven through the Play page UI: `… --label qwen --phases qwen,refs --members ash,bram --per 4`.
- Records: `C:\dev\so-lanes\33\debug\image-e2e\{armA,armB,qwen}\`. Each holds `setup.json`, `sdxl-turns.jsonl` (per turn:
  plan, direct, job, rendered times), `controller.jsonl`, `qwen.jsonl` and `refs.json`.
- Images (private): `C:\dev\so-poc-showcase\e2e-2026-10-26\{refs,journey,sdxl-A,sdxl-B,qwen}\`, with contact sheets
  `sheet-qwen-ash.png` and `sheet-qwen-bram.png`.
- Blind pack for the second rater: `C:\dev\so-lanes\33\debug\image-e2e\blind\` (21 shuffled images, refs A–D, `brief.md`,
  `items.txt`). The key is one level up (`key.json`).
- Image settings in both arms:
  - every-N = 2 player turns (the owner uses every-N with the default N = 5, and the judge is on);
  - seed policy random;
  - scene checkpoint `waiIllustriousSDXL_v170`, base quality, route shot `cowboy`;
  - one candidate per picture.

## Baseline journey (e2e26, `2403c70f`): NOT GREEN, 4 misses, 0 product regressions found

Steps that passed:

- preflight, wizard, story and card-art;
- base, prepare, expressions and frames for all 3 members;
- rig for Ash and Bram;
- poses, play (8 turns, 0 silent), pose, look and illustration (Qwen two-person cast scene);
- swipe, delete, reload, chat-switch and stale.

Misses:

- **rig, Cleo**: the vision model failed with opencode `provider.transport: WebSocket inbound queue overflow`. This is
  environment, the same miss as stage A a7. The lead says the live-head image re-encode fix lands later.
- **look-rebuild**: rig not prepared because opencode reported its usage limit and calls were held. Environment (quota).
- **background**: refused, "API request failed". Root cause found:
  - the director's text request got `409 Conflict`, `{"type":"local_residency","message":"Not enough free GPU/physical RAM for this profile while preserving desktop headroom."}`
    (lane server log, right after the `PURPOSE: background` prompt);
  - Qwen was still resident from the cast scene rendered 8 s earlier (ComfyUI history 18:09:50), so the text model
    could not reload for the director call;
  - SillyTavern's Connection Manager wraps that as "API request failed", and the image fails;
  - product gaps: no picture falls back to the template on a director transport failure; the player-facing message
    hides a resource refusal; and nothing yields Qwen (or retries after the release) before the director call.
- **gpu-idle**: 14–15 % utilisation over 10 % for 3 min at the end, with no job queued. This is the known lane-browser
  draw (79 Gate record 2026-10-21).

Cost and timing:

- 45 ComfyUI prompts in the run window (plan 80 floor ≤ 35, miss). Base..rig took 19.4 min; Ash's base was a cold 177 s.
- Pose preparation took 12.3 min (stage A2: 6–7.6 min).
- Turn TTFT 6–29 s, one turn at 71 s.

Automatic SDXL in the journey (card-text appearances): 2 pictures, both directed.

- One three-person greeting picture, tagged `3girls, 1boy` for 1 woman + 1 man + 1 woman. It shows an extra fourth
  person, Ash wearing Cleo's glasses, and Ash and Cleo in the same sweater.
- One Bram portrait that matches his card text and has no resemblance to his sprite.
- The second picture was placed on the message the delete step removed.

## Probe results (`f96dabda`)

### Automatic SDXL path

Prompt source: 10 of 10 pictures came from directed director JSON. 0 template fallbacks and 0 failures.

Shots:

- The director chose `cowboy` 9 times and `full` once. The `full` was honoured (the prompt ends `full body`), so the
  `5d65515d` "director shot wins" fix holds.
- Every `cowboy` picture still carries `cowboy shot, cowboy shot`: the director writes the tag into its prompt and the
  assembler appends it again.
- The director often adds `from_below` or `from_above` (5 of 10). Contradictions persist, such as
  `upper body, from_below, … cowboy shot`.
- The director mostly echoes the route default. The shot is not a real choice.

Subjects:

- `visible` was always one person except one map picture with three; the subject list held 2–3.
- Arm B's prompts contain the full card name (`SO-P41 Ash`) despite the "no names" rule.
- Captions name the player persona ("Max"). The persona is never drawn, so captions and pictures disagree.

Timing (every-N counts player turns as intended): one picture every 2nd player turn, aimed at the first reply of that
turn.

- Director planning: 20–67 s (median 43 s). The director call queues behind the turn's remaining group replies.
- Plan to placed (`direct()`): arm A 124/75/57/49/125 s, arm B 50/100/52/111/155 s, median about 88 s.
- The controller puts text to sleep for each image: phases text → reserving → image → text, with 3 wakes per arm at
  about 25 s each (last 41 s).
- Next turn's first token right after a picture: arm A 43.5/32.1/40.7/31.7 s (mean 37.0), arm B 27.6/82.3/30.4/49.5 s
  (mean 47.4).
- Turns not right after a picture: arm A mean 12.6 s, arm B mean 11.7 s. Each automatic picture adds roughly 25–35 s
  to the next reply.
- No duplicate pictures of the same moment, and none during a reply.
- Semantic repetition: 4 of 5 arm B pictures put a lighthouse tower outside a window (the story title leaks into every
  background). Two pairs show the same beat: the map, and the crate.

Identity scores, my own, against the sprite (1–5, overall match):

- Arm A, Ash ×5: 1, 1, 1, 1, 1 (mean 1.0).
  - Orange-copper hair, lilac or grey eyes, and a different outfit each time: yellow hoodie, teal hoodie with
    glasses, mustard coat, white shirt, black top.
  - Cross-picture consistency 3/5: hair and freckles are stable; eyes and outfit drift.
- Arm B, Ash ×5: 3, 4, 3, 3, 3 (mean 3.2).
  - Red hair, green tunic, brown belt and armband now land. Grey eyes appear once.
  - The hair turns long and wavy in one picture, and a choker appears 3 times.
  - The mustard rain jacket comes back from the chat text 4 times (the director copies the transcript over the
    authored look).
  - Rendering is glossier than the flat cel sprite. Cross-picture consistency 3.5/5.
- Journey (arm A conditions): Ash 1, Bram 1 (twice), Cleo 1.

Quality and defects (SDXL):

- Japanese text and a fake name badge (A1).
- Attribute bleed: Cleo's glasses on Ash and on Bram, Cleo missing from a 3-person prompt (A2).
- An extra person in the journey greeting.
- A low-angle, feet-forward composition from `from_below` (A5).
- Action misses: the crate is not carried in A4 or B4, and the jacket is not draped in B5.
- Backgrounds are plausible lighthouse interiors, but none resembles the stage background. Nothing conditions on it,
  and location was `null` in every plan (no scene fact; the beat label "At the door" stood in).
- Per-picture worth-interrupting, my scores: arm A 2, 2, 3, 3, 2; arm B 3, 4, 3, 2, 3.

### Prepared-cast Qwen path (manual "Illustrate prepared cast", sprite base as reference, fixed seed 1234)

- 8 of 8 placed, 0 refusals.
- Wall time from click to placed: 22.2–37.9 s (Qwen warm after the first). The journey's two-person scene took 110 s,
  including waits.
- Identity vs sprite:
  - Ash: 5, 4 (back view, face hidden), 5, 5, mean 4.75.
  - Bram: 5, 5, 5, 5, mean 5.0.
  - Journey two-person (Ash in the changed navy-coat look + Bram): 5 and 5, with the outfit change correct.
  - Cross-picture consistency 5/5 for both. Style matches the sprites, since it is the same model family as the sprite
    pipeline.
- Action fidelity is high: stove, window, staircase with lantern, and map at the table all match the direction.
- Defects:
  - Bram's staircase leg pose is awkward;
  - the journey scene copies the reference's side-by-side standing pose and puts it in a generic mansion, not the
    lighthouse;
  - backgrounds are invented: no transcript, location or stage background reaches the prompt;
  - all 8 pictures stack on the chat's last message.
- Worth interrupting, my scores: 4, 3, 4, 4 (Ash); 4, 4, 3, 4 (Bram).

### Sprite references (captured)

- `refs\{Ash,Bram,Cleo}-sprite-neutral.png` (base of the default look, 832×1248).
- `refs\Ash-sprite-navycoat.png` (the changed look).
- `refs\*-card.png` (card art).
- Visual-source paths are in `image-e2e\armA\refs.json`.

### Blind ratings (two raters, unblinded)

The pack: 21 shuffled images, refs A–D, `brief.md`, `items.txt`. The key was kept outside the folder.

Raters:

- Opus: same model family as the author of this record, so blind but less independent.
  `blind\ratings-opus.json` and `.md`.
- Sol (`gpt-6.1-sol` via codex, on ≤ 1024 px JPEG copies): the independent rater.
  `C:\dev\so-lanes\reviews\image-2026-10-26\sol-ratings.md`.
- `overall` is each rater's own holistic score; the brief did not ask for one.

Per-route means, written as Opus / Sol, 1–5. Character dimensions are averaged over every expected character
instance; "same person" counts instances judged the same person as the sprite.

- **Qwen prepared cast (n = 8: Ash ×4, Bram ×4)**
  - face 4.75 / 5.00, hair 5.00 / 5.00, body 5.00 / 5.00, outfit 5.00 / 4.88, same person 8/8 and 8/8;
  - action 4.75 / 4.88, cast count 5.00 / 5.00, setting 4.12 / 4.62;
  - style 5.00 / 4.62, anatomy 4.25 / 5.00;
  - worth interrupting 4.25 / 4.75, overall 4.38 / 5.00.
- **Qwen journey two-person (n = 1, Ash in the changed look + Bram)**
  - identity 5 / 5 for both, outfit 5 / 5, action 3 / 5, setting 2 / 4, overall 4 / 5.
  - Opus: stiff side-by-side sprite poses in a mansion, not the lamp room.
- **SDXL automatic, card text (arm A, n = 5)**
  - face 1.40 / 1.80, hair 3.00 / 3.00, body 2.80 / 2.80, outfit 1.00 / 1.00, same person 0/5 and 0/5;
  - action 2.80 / 3.20, cast count 4.00 / 4.00, setting 4.00 / 4.40;
  - style 2.40 / 2.00, anatomy 3.40 / 4.60;
  - worth 2.00 / 2.20, overall 1.40 / 2.00.
- **SDXL automatic, card text, journey (n = 2)**
  - face 1.00 / 1.25, outfit 1.00 / 1.00, same person 0/4 and 0/4, cast count 1.50 / 1.50;
  - worth 1.50 / 1.50, overall 1.00 / 1.00.
- **SDXL automatic, authored appearance (arm B, n = 5)**
  - face 2.80 / 2.80, hair 2.80 / 3.40, body 3.00 / 2.40, outfit 2.20 / 2.40, same person 0/5 and 0/5;
  - action 2.20 / 2.60, cast count 4.40 / 4.40, setting 2.80 / 4.00;
  - style 2.80 / 2.00, anatomy 3.40 / 5.00;
  - worth 2.60 / 2.80, overall 2.40 / 2.40.

Agreement and patterns:

- On overall and worth (42 pairs): exact 23, within 1 point 40, mean absolute difference 0.5. Sol is more lenient on
  anatomy and setting. Neither rater put any SDXL picture as the same person as its sprite.
- Cross-picture consistency, unprompted, from both raters:
  - Ash 2/5 overall. Both found an on-model family scored 5: img-08, 09, 10, 14 and 17, which are exactly the Qwen
    pictures.
  - Opus split the rest into a red-haired glossy variant (all of arm B, 2/5) and an orange-haired freckled girl (arm A
    and the journey, 3/5). Sol split it into four smaller families.
  - Bram 3/5: an on-model knight family (all Qwen, 5/5) plus the grey-bearded replacement (the journey SDXL pictures).
  - Cleo could not be assessed (absent from her only picture).
- Best and worst, both raters:
  - best: Qwen img-09 (Ash at the rain window) and img-18 (Bram at the window);
  - worst: journey img-06 (none of the three recognisable, an extra person, a sunny setting), img-04 (Bram replaced)
    and arm A img-19 (bare foot thrust at the viewer).
- Most-cited defects:
  - Qwen: storm context weak, with daylight windows in 3 of 8 (`setting`); a pose close to the sprite stance.
  - SDXL: wrong eyes and outfit, missing second person or crate action, stray text, setting opened to the outdoors.

My scores above agree in direction and rank order with both raters. Mine are lower for arm A (1.0) than the raters'
overall (1.4 / 2.0).

Confounds to keep in mind:

- **Showcase art vs card text.** The SDXL card-text arm cannot match by construction (see Setup). Arm B removes that
  and still gets 0 of 10 "same person" verdicts.
- **Fixture outfit asks.** In `items.txt`, three arm B "intended moments" are the director's own captions, and they ask
  for the mustard jacket that the outfit line (ref-A) does not have. Opus flagged it. This cuts outfit and action
  scores for arm B; it is also the transcript-over-look defect itself (finding 2).
- **Same-family rater.** Opus shares the author's model family; Sol is the independent read. Their verdicts agree.
- **Small n** (18 probe + 3 journey pictures), one seed each, Cleo barely covered, and a fixed seed for the Qwen route.

### Cleo rig rerun on `59074a95` (includes `d12deead`, harness JPEG re-encode over about 1 MB)

- Lane page reloaded; served manifest commit `59074a95` verified.
- The journey's rig step (`stepRig`, Studio → Sprites → "Rebuild bust and rig") was rerun on the kept Cleo assets
  through a session-scratchpad driver. Record: `C:\dev\so-lanes\33\debug\image-e2e\rig-cleo\record.json`.
- PASS: the vision call answered 200 in 50 s with no WebSocket overflow, the review offered "Accept rebuilt bust and
  rig", and a `cleo/default` live-head rig is now saved, sourced from her bust.
  - The driver's accept click timed out after the save landed. That is a harness wait, not a product refusal.
- The request went out as **PNG, not JPEG**: one image, 498 KB of request body, under the re-encode threshold, so
  `d12deead` did not apply.
  - The journey's overflow on the same bust did not recur, so the overflow was transient load on opencode's socket
    (the journey also hit the opencode usage limit minutes later), not size alone.
  - The fix is unexercised by this rerun.

## Findings, ranked

1. **The automatic path has no visual identity input.** It cannot match sprites, by construction.
   - With card text (arm A) the match is 1.0/5. Authored appearances that restate the sprite (arm B) reach 3.2/5 but
     drift on outfit details and style.
   - The Qwen reference path reaches 4.75–5.0/5 with consistent identity, at a comparable or lower wall time
     (22–38 s vs 49–155 s).
   - Blind raters, overall (Opus / Sol): Qwen 4.4 / 5.0 with 8/8 same person; SDXL card text 1.4 / 2.0; SDXL authored
     2.4 / 2.4 with 0/10 same person.
   - This confirms Astra finding 1 with measured numbers.
2. **The transcript overrides the authored look.** The director copies outfit words from the chat (mustard jacket) over
   the authored appearance, because `CURRENT CAST` and `STORY` carry equal weight. A visible current look should be
   authoritative, with the transcript used only for action and expression.
3. **Each automatic picture costs the next reply about 25–35 s**, from the text sleep and wake. At the owner's N = 5 that
   is one slow turn in five, and the picture itself lands about 90 s after its reply.
4. **A director call can be refused for residency right after a Qwen job.** The image then fails with "API request
   failed" (the journey `background` miss). No fallback, no retry, and the copy is opaque.
5. **Prompt hygiene.**
   - The shot tag is duplicated (`cowboy shot, cowboy shot`), and `from_below`/`from_above` contradict the shot.
   - The full card name reaches the tags.
   - Wrong `Ngirls/Nboy` counts in multi-person pictures, with attribute bleed and extra people.
   - Location is null, so backgrounds default to "lighthouse in the window".
6. **The prepared-cast path lacks scene grounding.** It is direction text only; no location, background or transcript
   reaches it. Reference poses get copied in two-person scenes, and every picture lands on the last message.
7. **No product regression from today's fixes.** Directed prompts are used (no template-fallback pictures), the director
   shot wins, every-N counts player turns, and there are no duplicate placements.

## Recommendations

1. Make the automatic scene picture use the prepared-cast Qwen route whenever every visible subject (one or two) has a
   current published look. Keep SDXL for scenes with more people, missing looks, or backgrounds.
   - Reuse `castSceneHost`'s lineage checks.
   - Feed it the director's caption as the direction, plus location and background words.
   - Measure it against the Astra floors before adoption.
2. When SDXL stays, resolve one appearance per subject before prompting: authored appearance or published look first,
   then card text. Tell the director the current look overrides any clothing in the transcript. Strip names from tags.
3. Fix tag assembly:
   - drop the route shot when the director's prompt already carries a framing tag;
   - forbid `from_below`/`from_above` unless asked;
   - validate `Ngirls/Nboy` against `visible`.
4. On a director failure (transport or 409 residency), wait for the GPU broker to release, retry once, then fall back to
   the template prompt. Say "the text model could not load while another image held the GPU" instead of "API request
   failed".
5. Budget the wake cost: render automatic pictures only in an idle window (no send within about 20 s), or keep text
   resident for SDXL-size jobs if VRAM allows. Record image → next-reply TTFT as a standing metric.
6. Prepared cast:
   - pass location and stage background words into the instruction;
   - add a "do not copy the reference pose" clause, or a pose hint;
   - place each picture on the message it illustrates.
7. Harness: give the p41 cast card text that matches the showcase art, so future SDXL arms are not confounded.
8. Rerun the journey once the opencode re-encode fix lands and quota is back; the two rig misses are environment.

## Not run

- `codex exec -i` from this session: Sol usage limit after one test image. The lead ran Sol and Opus on the blind pack
  instead (above).
- A paired journey (only one run was asked for).
- An Astra-scale pilot (72 images). This probe has 18 pictures + 3 from the journey.
- Cleo in the probe: she rarely speaks in these lines.
