# Plan 17 — Self-contained images: work with whatever the user has

**Status (2026-10-04): v2.7 plan 17 (was v2.8 05, before that v2.7 plan 26; moved to v2.7 with the image track,
2026-10-04). Implemented candidate; `npm run gates` green and the Belle pilot exercised the route, discovery, owned
jobs and Test render. Live acceptance is PARTIAL, owned by `24-image-and-local-completion.md`.
See that plan's latest Gate record and `21-belle-image-pilot.md`.**
Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance LI (local ComfyUI through the broker) + CL
(a cloud director profile). Nothing here needs RunPod.

Build position: before v2.7 18 (sprite generation), which uses the interfaces named in §F; v2.7 19 and 20 come after 18.

**Storage correction (user, 2026-10-03):** image models stay on C: for autoload. The earlier off-C model migration
and gate precondition below are superseded on this installation (overview rule 5 exception). No weight copying.

The user's words: we have ComfyUI functionality, but it feels like it calls outside things that someone who installs
the plugin would not have. Review what is needed to make it self-contained.

## Audit (2026-10-03, line refs re-checked on master `c7967323`)

### How it works today

- **Prompt.** An image director (an LLM via a Connection Manager profile) writes the prompt
  (`stHost/image.ts:68`, `imageModel`).
  - With no director profile every render fails ("Select an image director connection profile.",
    `image/runtime.ts:160`).
- **Render.** The extension builds its **own ComfyUI graph** (`image/graph.ts`) and posts it through ST's
  `/api/sd/comfy/generate` proxy (`image.ts:88`).
  - From ST's Image Generation extension it borrows only `comfy_url` (fallback `127.0.0.1:8188`, `image.ts:185-188`)
    and the character appearance prompts.
  - ST's other sources and `/imagine` are unused.
- **Save.** Through ST's `/api/images/upload` (`image.ts:110`) and background events.
- **Automatic cues.** `ImageRuntime.cue(kind, at, name)` (`image/runtime.ts:64`) with kinds `checkpoint | scene`, fed by
  boundary and scene-break subscriptions (`:100-106`); the `everyN` cadence is `ImageRuntime.onReply` (`:114`).
- **Sprites** are display-only: `/api/sprites/get` (`stHost/sprites.ts:95`), behind a capability probe, off by default.
  Generating them is v2.7 18.

### What a stranger does not have

| Dependency | Where | Normal user has it? | Graceful when absent? |
|---|---|---|---|
| ComfyUI running at `comfy_url` | `image.ts:88,188` | only if they run it | **no**: an error per render, no probe, no Repair row |
| `waiIllustriousSDXL_v170.safetensors` (default for every purpose) | `image/catalog.ts:53`, `settings.ts:53` | no | **no**: ComfyUI rejects the graph |
| `JANKUTrainedChenkinNoobai_v777.safetensors` (portraits) | `catalog.ts:54`, `settings.ts:70` | no | no |
| `flux1-dev-fp8.safetensors` (backgrounds) | `catalog.ts:55`, `settings.ts:72` | no | no |
| embeddings `lazypos/lazyneg/lazyhand/lazynsfw` | `catalog.ts:66-67` | no | silently ignored, or an error |
| upscalers `RealESRGAN_x4plus(_anime_6B)` | `catalog.ts:48-51` | no | hires only |
| a director profile | `runtime.ts:160` | must configure one | **no**: a thrown error |
| **GPU broker plugin**: assumes **one GPU shared with Unsloth Studio on :8888 serving `TheDrummer/Artemis-31B-v1.1-GGUF`**; listens on :18888; text profiles must be pointed at it by hand | `server-plugin/story-orchestrator-gpu/gate.mjs`, `index.mjs`, `gpuBroker.ts` (line refs not re-checked) | no | **no, and worse:** shipped as a required package file (`scripts/release/artifact-allowlist.json:12-15`) and installed by `plugin:install`. Installed without Artemis, every lease answers 409, so **every image is refused** |
| ComfyUI core nodes, samplers, schedulers | `graph.ts`, `catalog.ts` | yes | n/a |

Also:

- **Images default `enabled: true` with automation every 5 replies** (`image/settings.ts:58,65`). On an install with no
  ComfyUI or profile, every 5th reply attempts a render and fails silently.
- **The README** names only where the settings are. Nothing about installing ComfyUI, which models to get, or the
  broker's assumptions. The broker README now says it is advanced and machine-specific.
- **This machine** (checked 2026-10-03): ComfyUI at `C:\dev\ComfyUI` with `extra_model_paths.yaml` → `assetgen.base_path:
  C:/dev/models`. Both ComfyUI and the broker already have tray entries (`C:\dev\tray\items\story-orchestrator.json`,
  "ComfyUI" with `/system_stats` status, and "GPU broker" under SillyTavern). **The model path is on `C:`**: by the
  user's 2026-10-04 decision this stays (autoload), so the earlier "move off `C:`" precondition is superseded
  (v2.7 rule 8 image-track exception, v2.7 rule 8 exception).

## Goal

**Images work for anyone who has any image backend configured in SillyTavern, and stay quietly off for anyone who has
none.** The ComfyUI-specific power (per-purpose models, LoRA chains, FLUX, hires) stays available as an advanced mode,
discovered from the user's own ComfyUI, never assumed. Machine-specific pieces (the GPU broker) leave the default
install.

## Design

### A. Two render routes

1. **ST Image Generation route (route A, new default).**
   - Render through ST's own Image Generation extension (`/imagine quiet=true` or its `generatePicture`, via a new
     `stHost` module).
   - Whatever source the user configured there works: ComfyUI, Automatic1111/Forge, sd.cpp, Horde, NovelAI, OpenAI,
     Stability, fal, OpenRouter, Google and the rest (24 sources, `stable-diffusion/index.js:73-98`, not re-checked).
   - The director still writes prompt, negative and size per purpose. Model choice is the user's ST setting.
   - The trade-off: no per-purpose checkpoint routing, no LoRA chains and no reference edits on this route.
2. **ComfyUI advanced route (route B, opt-in).** Today's graph builder, with **nothing hardcoded**:
   - **Models are discovered** from ComfyUI `/object_info` (checkpoints, diffusion models, upscalers, LoRAs) and
     `/embeddings`. Settings offer only what exists.
   - **The catalog becomes recipes, not file names.** "SDXL / Illustrious-style", "FLUX", "Pony"; each says which
     nodes and parameters it uses, and the user maps their own model to it. A recipe has a `kind`: `generate`
     (today's graphs) or `edit` (reference image in, image out; v2.7 18 adds the first `edit` recipes).
     - The current three checkpoints become *suggestions* in the setup doc, not defaults.
     - Embeddings are used only when found.
   - **Validation before render:** a route whose model is not on the server is refused with a plain reason and a Repair
     row, never sent.
3. **None:** no backend found means images are off and the panel says why, with "Show me" opening ST's Image
   Generation settings.

### B. Director fallback

- With no director profile, a **template prompt** built without an LLM:
  - the checkpoint's player-safe scene name and the scene place/time;
  - the present cast's appearance prompts (ST's own, or `appearances` from the story);
  - the story's image style.
- The quality is lower but it works, so a director profile becomes an upgrade, not a requirement.
- The spoiler rules from v2.7 02 C6/C7 apply to both: `player_name`, and only looks the player has seen.

### C. GPU broker: optional, fail-open, documented as advanced (decision 4)

The user's answer: "Your machine still needs it. Lets do as you recommend." So it stays in the public repo and stays on
this machine, but leaves the default install.

- **Packaging.** Move `story-orchestrator-gpu` from the required list to `optional` in
  `scripts/release/artifact-allowlist.json` (like the harness). `plugin:install` installs the judge only, unless given
  `--with gpu`. This machine installs it with `--with gpu`.
- **Fail open.** Installed but not configured (no adapter, or the adapter's text backend not seen yet): it **passes the
  image through** with a warning instead of refusing. Refusing is only right when it knows it is guarding a live text
  model.
- **Adapters, not one stack.** `unsloth` (today's setup), `llama-server` (local llama.cpp on the 3090), `none`. The text
  model name, the text port and the ComfyUI URL come from the plugin's settings file, never constants. The RunPod reply
  model is never behind the broker: it is not on this GPU.
- **Tray** (v2.7 rule 8). The existing "GPU broker" tray entry keeps its `/status` readiness (`127.0.0.1:18888`); it
  gains "Open settings" and shows the adapter in its tip. The gate reads `C:\dev\tray\status.txt` OK for the file.
- **Docs.** `docs/guide/setup/gpu-broker.md`: "advanced: one GPU for text and images", what it does, when you need it
  (only when both run on the same card), how to install it.

### D. Probes, Repair, test render

- Add an `image` capability to `stHost/capabilities.ts`:
  - route A: ST's Image Generation extension present, a source selected;
  - route B: ComfyUI reachable and the routed models present (one `/object_info` read, cached per page load like the
    other probes; an `error` is not cached);
  - the director profile set or the template fallback in use;
  - the broker state when installed (adapter, phase).
- **Health-center checks** (v2.7 04 registry, `src/runtime/checks.ts`), worst first:
  - "Images are on but no image service is set up" (Show me → ST's Image Generation);
  - "The model for portraits is not on your ComfyUI";
  - "The GPU broker is installed but has no text model to guard" (info: it passes images through).
- **A "Test render" button** in the image settings: one small render, showing the image or the plain reason.

### E. Defaults

- `image.enabled` stays on, but **nothing renders until the probe passes**. The first passing probe shows a one-line
  "Images are ready" in the panel.
- Automation defaults to **story-authored only** (`illustrations` on checkpoints and scenes). "Every 5 replies" becomes
  an opt-in.
- With no backend, no background attempts are made and nothing fails silently.

### F. Sprites and what v2.7 18 uses from this plan

Sprite display stays as it is (display-only, probed, off by default) and gains an empty-state and a guide page: what a
sprite folder is and how to get one. **Sprite generation is v2.7 18** (decision 6, review F31). This plan does not
build any of it; it only provides these interfaces, which v2.7 18 consumes and which its gate depends on:

| Interface | Shape | Used by v2.7 18 for |
|---|---|---|
| Model discovery | `comfyModels(url)` → `{checkpoints, diffusionModels, loras, upscalers, embeddings, nodes}` from `/object_info` + `/embeddings` | finding an edit-capable model, or saying one is needed |
| Recipe registry | `{id, kind: "generate" \| "edit", nodes[], params}`, user-mapped model, validated before send | the reference-edit recipes (expressions, blink/talk frames, looks) |
| Render | `imageRender(url, graph, signal)` (`stHost/image.ts:80`) through ST's ComfyUI proxy; cancellable via `signal` | every sprite edit |
| Probe | `image` capability, route B leg | refusing the Sprites tab with a reason when route B is not ready |
| Broker lease | optional `/lease` `/renew` `/release` around a batch; fail-open when unconfigured | long sprite batches on the shared local GPU |

Route A cannot serve sprite edits: most ST Image Generation sources generate, they do not edit from a reference.

**Asset counts and their denominators** (review D15). Dated inventory: `C:\dev\adolion-campaign` at `8012a61`
(2026-10-03), `campaign/sprites/`, counted as tracked files (the PNGs are git-LFS pointers in that checkout):

| Count | Denominator |
|---|---|
| 146 characters | folders with a `sets.json` |
| 201 sets | `sprites/<set>/` folders, excluding `_bases`, `_candidates` |
| 2,889 expression PNGs | files in `sprites/<set>/` (about 14.4 labels per set) |
| 4,544 PNGs in all | everything under `campaign/sprites/`, including 362 bases, 701 candidates, 375 contact sheets, 134 inputs, 32 poses |
| 0 animation frames | `anim-*` folders (v2.7 19 not built) |

v2.7 19 and v2.7 20 quote from this table; v2.8 02 quotes its own campaign inventory with its own denominator.
`render_sprites.py` is 809 lines (as measured for the old plan; not re-counted).

### G. Docs (v2.7 01 registry)

- `docs/guide/setup/images.md`:
  - the two routes, and what each needs;
  - a recommended ComfyUI setup, with today's three checkpoints and the upscalers as suggestions, where to put them
    (a model folder off the system drive, named in `extra_model_paths.yaml`);
  - the director profile and the template fallback;
  - the broker as an advanced page;
  - privacy: which backends send prompts to a third party.
- Registry entries for image, illustrations, sprites and the broker, with `needs`.

### H. Adolion campaign

- Its `appearances` and `illustrations` must work on route A.
- Its recommended model setup moves into the campaign's README as a recommendation.
- `adolion-fresh` keeps media off by default (unchanged); a card that needs images uses `--media on --allow-comfy`.

### I. The cue seam (for v2.8 13 N2)

v2.8 13 N2 (judge illustration cue) needs a place to land. This plan names it and builds only the seam, with no judge:

- **Cue sources** become a union: `checkpoint | scene` today, `judge` reserved. `ImageRuntime.cue(kind, at, name)`
  (`image/runtime.ts:64`) takes the source; the dedupe key, `messageAlreadyDrawn` and the pending-target guard stay
  shared, so one reply never gets two automatic images.
- **Cadence filter.** `ImageRuntime.onReply` (`:114`) asks an optional `cadenceFilter(messageId) → "draw" | "skip"`
  before a cadence render. The default always answers `draw`, so behaviour is unchanged until N2 installs one.
- N2's judge call ships dev-only, then off by default (v2.8 rule 9); this plan registers nothing for it.

## Gates

- **D (deterministic).**
  - Recipe/route validation against a fake `/object_info` (missing model refused, embeddings only when found, `edit`
    recipe shape).
  - Template prompt (spoiler property: no `name`, no unseen looks).
  - Cue seam: the default `cadenceFilter` changes nothing (existing image runtime tests unchanged); a `skip` filter
    suppresses a cadence render; a `judge` cue and a `checkpoint` cue on the same reply render once.
  - Broker pass-through when unconfigured, and adapter selection from the settings file (`gate.test.mjs`).
  - Allowlist test: broker optional; `plugin:install` default installs the judge only; `--with gpu` installs both.
  - Health-center checks pass the v2.7 04 registry tests.
  - Storybook for the settings, the empty states and Test render.
  - Registered in the v2.7 01 feature registry + Help (registry test).
  - **Clean-host:** `scripts/release/clean-host.sh` with the package: images off and quiet, no broker installed.
  - `npm run gates`.
- **LI + CL (acceptance, live on a lane with `--media on --allow-comfy`).**
  - Preconditions: image models stay on `C:` by the 2026-10-04 decision (autoload); the gate records the existing
    `extra_model_paths.yaml` path instead of enforcing off-`C:`; `C:\dev\tray\status.txt` reports the tray file OK;
    the ComfyUI and GPU broker entries show ready.
  - Route A through ST's `comfy` source on the local ComfyUI (LI), director = a cloud profile (CL, DeepSeek).
  - Route B with discovered models (LI).
  - The template fallback with no director profile (LI only).
  - The broker on this machine with the `llama-server` adapter: an image waits for the local text model's lease, then
    renders; with the adapter unset it passes through.
  - An install with no backend: no attempts, the health-center row shown.
  - Test render.
  - A cloud ST source (e.g. Pollinations) only if the user approves sending test prompts to it.
- **Player-visible surface** (v2.7 rule 10): the empty states and "Images are ready" line are covered by the user's
  2026-10-03 decisions; nothing else player-visible is added.

## Decisions for the user

1. Route A (ST Image Generation) as the default, ComfyUI graph as an opt-in advanced route? **Recommended: yes.** yes
2. Discover models from the user's ComfyUI and turn today's hardcoded checkpoints into setup-doc suggestions?
   **Recommended: yes.** yes
3. A template-prompt fallback when no director profile is set? **Recommended: yes.** yes
4. GPU broker: optional package plus fail-open plus adapters, or remove it from the public package entirely?
   **Recommended: optional, fail-open, documented as advanced.** Your machine still needs it.  Lets do as you recommend
5. Default automation: story-authored illustrations only, with "every N replies" opt-in? **Recommended: yes.** yes
6. Sprite generation: out of scope for v2.7? Lets review what this implies, i think we have most of the work already done

   **Review (2026-10-03): most of the work exists, but in the campaign repo and bound to your machine.**
   - **What exists.**
     - `adolion-campaign/scripts/render_sprites.py` (809 lines) builds expression packs per sprite set through ComfyUI:
       - crop the card art, edit with a Qwen image-edit graph (`qwen21-edit.api.json`), cut out with alpha
         (`SplitImageWithAlpha`), auto-pick the base, upscale the reference;
       - `sets.json` per character, skip-if-exists, a queue, locks;
       - night runs on the 3090 and on pods.
     - On the plugin side, `src/sprites/` already does everything at runtime: stage, direction, framing and the
       expression classifier.
   - **What ties it to your machine.**
     - Hardcoded `C:\dev\ComfyUI` and your Python path; it starts ComfyUI itself (`render_sprites.py:102-125`).
     - A specific edit model and graph (Qwen image edit), plus a background remover.
     - Build-time Python with numpy and PIL, outside the extension.
     - Campaign-specific heuristics (skin/eye scoring for base picks).
   - **Outcome (decided):** sprite generation is its own plan, **v2.7 18**, built on this plan's route B interfaces
     (§F), with the campaign script as the base. Until 06 ships, the campaign script stays the Adolion tool, with its
     paths moved to settings/env off `C:` (v2.8 02).

## Links

v2.7 01 docs and registry (setup page, `needs`), v2.7 02 C6–C9 (image prompt spoiler fixes, per-checkpoint illustrate),
v2.7 04 health center (check registry), v2.7 05 briefing (optional image), v2.8 02 Adolion campaign (model
recommendations, `render_sprites` paths), v2.7 18 sprite generation (consumer of §F), v2.7 19 talking sprites and v2.7 20
living cards (after 18), v2.8 13 N2 (consumer of §I).

## Review 2026-10-03

Applied from `v2.7/review-2026-10-03.md`:
- **F01**: status line and gate tiers.
- **F15**: gates split into D and LI + CL; the live gate uses local ComfyUI (LI) and a cloud director (CL).
- **F31**: sprite generation is v2.7 18; §F lists only the interfaces 18 uses; every "26b" reference removed.
- **B5**: §I names the cue seam (cue source union + `cadenceFilter`) that v2.8 13 N2 lands on.
- **D15**: §C rewritten from decision 4 (optional, fail-open, adapters, tray); §F rewritten from decision 6 (v2.7 18);
  dated sprite inventory with a denominator per number.
- **"26 `:160` ref"**: the director error is at `image/runtime.ts:160` (was `:157`); other refs touched re-checked
  (`settings.ts:53`, `image.ts:110`, cue/onReply lines, allowlist lines).
- **Rule 5**: tray entries named; the model path on `C:` recorded as a precondition of the LI gate.
- **B10**: registry + Help gate row.

Not re-checked: broker `gate.mjs`/`index.mjs` line refs (dropped from the table rather than guessed), ST
`stable-diffusion/index.js:73-98`, `render_sprites.py` line numbers.
