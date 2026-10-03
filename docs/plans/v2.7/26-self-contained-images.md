# Plan 26 — Self-contained images: work with whatever the user has

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.
Numbered 26 because it arrived after the build-order renumbering. **Build position: tier 1, after plan 05.** Nothing in
it needs RunPod: the live gate uses the local ComfyUI and a cloud director profile.

The user's words: we have ComfyUI functionality, but it feels like it calls outside things that someone who installs
the plugin would not have. Review what is needed to make it self-contained.

## Audit (2026-10-03)

### How it works today

- **Prompt.** An image director (an LLM via a Connection Manager profile) writes the prompt
  (`stHost/image.ts:68`).
  - With no director profile every render fails ("Select an image director connection profile",
    `image/runtime.ts:157`).
- **Render.** The extension builds its **own ComfyUI graph** (`image/graph.ts:17-66`) and posts it through ST's
  `/api/sd/comfy/generate` proxy (`image.ts:88`).
  - From ST's Image Generation extension it borrows only `comfy_url` (fallback `127.0.0.1:8188`, `image.ts:185-188`)
    and the character appearance prompts.
  - ST's other 23 sources and `/imagine` are unused.
- **Save.** Through ST's `/api/images/upload` and background events.
- **Sprites** are display-only: `/api/sprites/get`, behind a capability probe, off by default. Generating them is out of
  the extension (only a scraped community guide exists).

### What a stranger does not have

| Dependency | Where | Normal user has it? | Graceful when absent? |
|---|---|---|---|
| ComfyUI running at `comfy_url` | `image.ts:88,188` | only if they run it | **no**: an error per render, no probe, no Repair row |
| `waiIllustriousSDXL_v170.safetensors` (default for every purpose) | `image/catalog.ts:53`, `settings.ts:52` | no | **no**: ComfyUI rejects the graph |
| `JANKUTrainedChenkinNoobai_v777.safetensors` (portraits) | `catalog.ts:54`, `settings.ts:70` | no | no |
| `flux1-dev-fp8.safetensors` (backgrounds) | `catalog.ts:55`, `settings.ts:72` | no | no |
| embeddings `lazypos/lazyneg/lazyhand/lazynsfw` | `catalog.ts:66-67` | no | silently ignored, or an error |
| upscalers `RealESRGAN_x4plus(_anime_6B)` | `catalog.ts:48-51` | no | hires only |
| a director profile | `runtime.ts:157` | must configure one | **no**: a thrown error |
| **GPU broker plugin**: assumes **one GPU shared with Unsloth Studio on :8888 serving `TheDrummer/Artemis-31B-v1.1-GGUF`**; listens on :18888; text profiles must be pointed at it by hand | `server-plugin/story-orchestrator-gpu/gate.mjs:4-5,84-99`, `index.mjs:33`, `gpuBroker.ts` | no | **no, and worse:** shipped as a required package file and installed by `plugin:install` (which the README asks for, for the judge). Installed without Artemis, every lease answers 409, so **every image is refused** (`gpuBroker.ts:19-21`) |
| ComfyUI core nodes, samplers, schedulers | `graph.ts`, `catalog.ts` | yes | n/a |

Also:

- **Images default `enabled: true` with automation every 5 replies** (`image/settings.ts:58,65`). On an install with no
  ComfyUI or profile, every 5th reply attempts a render and fails silently.
- **The README** (`:103-115`) names only where the settings are. Nothing about installing ComfyUI, which models to get,
  or the broker's assumptions.

## Goal

**Images work for anyone who has any image backend configured in SillyTavern, and stay quietly off for anyone who has
none.** The ComfyUI-specific power (per-purpose models, LoRA chains, FLUX, hires) stays available as an advanced mode,
discovered from the user's own ComfyUI, never assumed. Machine-specific pieces (the GPU broker) leave the default
install.

## Design

### A. Two render routes

1. **ST Image Generation route (new default).**
   - Render through ST's own Image Generation extension (`/imagine quiet=true` or its `generatePicture`, via a new
     `stHost` module).
   - Whatever source the user configured there works: ComfyUI, Automatic1111/Forge, sd.cpp, Horde, NovelAI, OpenAI,
     Stability, fal, OpenRouter, Google and the rest (24 sources, `stable-diffusion/index.js:73-98`).
   - The director still writes prompt, negative and size per purpose. Model choice is the user's ST setting.
   - The trade-off: no per-purpose checkpoint routing and no LoRA chains on this route.
2. **ComfyUI advanced route (opt-in).** Today's graph builder, with **nothing hardcoded**:
   - **Models are discovered** from ComfyUI `/object_info` (checkpoints, upscalers, LoRAs) and `/embeddings`.
     Settings offer only what exists.
   - **The catalog becomes recipes, not file names.** "SDXL / Illustrious-style", "FLUX", "Pony"; each says which
     nodes and parameters it uses, and the user maps their own checkpoint to it.
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
- The spoiler rules from plan 02 C6/C7 apply to both: `player_name`, and only looks the player has seen.

### C. GPU broker: out of the default install

- **Packaging.** Move `story-orchestrator-gpu` to `optional` in `scripts/release/artifact-allowlist.json` (like the
  harness). `plugin-install` installs the judge only, unless given `--with gpu`.
- **Fail open.** When installed but not configured (no text backend it recognises, nothing seen yet), it **passes the
  image through** with a warning instead of refusing. Refusing is only right when it knows it is guarding a live text
  model.
- **Adapters, not one stack.** `unsloth` (today), `llama-server` (the RunPod/local llama.cpp setup), `none`. The text
  model name comes from settings, never a constant.
- **Document it as "advanced: one GPU for text and images"**, with what it does and when you need it (only when both
  run on the same card).
- **Decision for the user:** keep it in the public repo at all, or move it to a private/dev tool.

### D. Probes, Repair, test render

- Add an `image` capability to `stHost/capabilities.ts`:
  - route A: ST's Image Generation extension present, a source selected;
  - route B: ComfyUI reachable and the routed models present;
  - the director profile set or the template fallback in use;
  - the broker state when installed.
- **Repair rows**, worst first:
  - "Images are on but no image service is set up" (Show me → ST's Image Generation);
  - "The model for portraits is not on your ComfyUI";
  - "The GPU broker is installed but has no text model to guard".
- **A "Test render" button** in the image settings: one small render, showing the image or the plain reason.

### E. Defaults

- `image.enabled` stays on, but **nothing renders until the probe passes**. The first passing probe shows a one-line
  "Images are ready" in the panel.
- Automation defaults to **story-authored only** (`illustrations` on checkpoints and scenes). "Every 5 replies" becomes
  an opt-in.
- With no backend, no background attempts are made and nothing fails silently.

### F. Sprites

- They stay display-only, already probed. Add an empty-state and guide page: what a sprite folder is and how to get
  one (ST's Character Expressions docs, the generation options).
- Sprite *generation* is a separate seed and out of scope here.

### G. Docs (plan 01 registry)

- `docs/guide/setup/images.md`:
  - the two routes, and what each needs;
  - a recommended ComfyUI setup, with today's three checkpoints and the upscalers as suggestions, where to put them;
  - the director profile and the template fallback;
  - the broker as an advanced page;
  - privacy: which backends send prompts to a third party.
- Registry entries for image, illustrations, sprites and the broker, with `needs`.

### H. Adolion campaign

- Its `appearances` and `illustrations` must work on route A.
- Its recommended model setup moves into the campaign's README as a recommendation.
- `adolion-fresh` keeps media off by default (unchanged).

## Gates (no RunPod)

- **Pure:**
  - recipe/route validation against a fake `/object_info`;
  - template prompt (spoiler property: no `name`, no unseen looks);
  - broker pass-through when unconfigured (`gate.test.mjs`);
  - allowlist test (broker optional; `plugin-install` default installs the judge only).
- **Live, local:**
  - route A through ST's `comfy` source on the local ComfyUI;
  - route B with discovered models;
  - an install with no backend: no attempts, the Repair row shown;
  - Test render.
  - A cloud ST source (e.g. Pollinations) only if the user approves sending test prompts to it.
- **Clean-host:** `scripts/release/clean-host.sh` with the package: images off and quiet, no broker installed.
- `npm run gates`, Storybook for the settings and Repair rows.

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
     - Adolion-specific heuristics (skin/eye scoring for base picks).
   - **What "in the plugin" would mean.** A Studio **Sprites** tab that builds a pack for one cast member:
     - pick the card art or a reference;
     - choose expressions (ST's standard set);
     - render through plan 26's ComfyUI advanced route, with the edit model discovered from `/object_info`, or say
       plainly that one is needed;
     - preview, then save to ST's sprite folder via `/api/sprites/upload`.
     - The Python heuristics (base pick, alpha checks) move to TypeScript or become manual "pick the best of 4" steps.
       The night-run queue is out of scope: one character at a time, in the page.
   - **What it implies.**
     - It depends on plan 26's route B (model discovery, probes). It cannot work on route A, because ST's Image
       Generation backends do image *generation*, not reference-based *edits*, for most sources.
     - It adds an image-edit recipe (needs an edit-capable model: Qwen image edit, FLUX Kontext, or similar).
     - A new Studio tab plus a stHost upload module.
     - About an M-L build, measured on the Adolion cast against the existing packs, which become the golden.
   - **Recommendation:** plan it as **26b, after 26 ships**. Until then the campaign script stays the Adolion tool, with
     its paths moved to settings/env so it runs on another machine (a small campaign-side change, plan 05).


## Links

01 docs and registry (setup page, `needs`), 02 carry-in C6–C9 (image prompt spoiler fixes, F4 per-checkpoint
illustrate), 03 briefing (optional image), 05 Adolion campaign (model recommendations).
