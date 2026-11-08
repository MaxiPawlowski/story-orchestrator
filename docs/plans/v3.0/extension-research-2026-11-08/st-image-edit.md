# st-image-edit — 2026-11-08 harvest

meta: https://github.com/i5031337/st-image-edit · HEAD `b21ee66` (2026-10-30), new repo · MIT (vendored heic-to: LGPL-3, not
relevant) · read: README, `index.js`, `editor.js`, `workflow.js`, `comfy.js`, `image.js`, the two workflow JSONs by name; skipped:
`vendor/heic-to/heic-to.js` (3.2 MB minified wasm), tests, demo PNGs · no prior review · SECURITY.md verdict CLEAR.

## What it is

One slash command, `/image-edit`, that runs any API-format ComfyUI workflow over 1..n reference images (composer attachments,
`message=` images, same-origin/data URLs) and posts the result as a system row. Flux.2 Klein 9B edit workflows shipped as examples.
~500 lines total, small and careful. SO already does more (Qwen 2.1 cast scenes, sprite builder, plate references); value here is a
few hardening patterns and one host fact.

## How it works

- `editor.js:384-494` `createEditor(deps)`: deps injected (fetch, headers, save, seed), one promise queue per instance (`tail`,
  `:385,491-493`); job inputs and host defaults snapshotted before queuing (`:401-408`).
- Workflow membership checked against `/api/sd/comfy/workflows` before reading, because ST's `/workflow` silently substitutes the
  default for a missing file (`editor.js:434-439`).
- `workflow.js:1-50` `populateWorkflow`: refuses non-API graphs (every node needs `class_type` + object `inputs`, `:10-15`);
  replaces placeholders only in `inputs`, never `_meta`/titles (`:37-40`); fails on any leftover `%name%` it does not know
  (`:26-28`) and on a missing `%prompt%` or a missing `%reference_image_N%` per supplied image (`:41-49`). Validated once with empty
  values before any image is fetched (`editor.js:454-456`).
- Posts the graph straight to `/api/sd/comfy/generate` (`editor.js:477-479`): no change to ST's active workflow setting.
- The generate fetch is deliberately not aborted (`editor.js:476`): see host facts.
- References: same-origin or `data:image/...` only, `redirect: 'error'` (`editor.js:351-356`); PNG `tEXt/zTXt/iTXt` chunks stripped
  without re-encoding (`image.js:24-48`) so an old embedded workflow does not ride into the new output.
- Chat-change guard before posting the result (`index.js:130-136`).

## Patterns for SO

### P1. Render a story workflow by posting the populated graph, not by swapping ST's `comfy_workflow` — pattern · image · partial · value 3 · M
What: fill placeholders client-side and POST `/api/sd/comfy/generate` directly. Their evidence: `editor.js:440-479`, `comfy.js:2-17`
(mirrors ST's `%model%/%vae%/%sampler%/%steps%/%scale%/%denoise%/%clip_skip%` + custom placeholders). Our state:
`src/image/workflowRender.ts:11-22` → `src/services/stHost/comfyWorkflows.ts:72-84` sets `extension_settings.sd.comfy_workflow` in
memory for the render, with a localStorage ledger and `reconcileComfyWorkflowSwap` (`:96-106`). During the swap window a player `/sd`
uses the story workflow, and any `saveSettingsDebounced` from anywhere persists the swapped value (the ledger repairs it only at the
next start). Fit: new `stHost` writer (`WriteResult`), needs ST's placeholder set kept in step (one table, tested); loses ST's
own `/sd` post-processing (prompt prefix, styles) unless reproduced. Sketch: `stHost/comfyGraph.ts` `renderComfyGraph(name, values)`
→ list check → read → populate (P2) → generate → `saveBase64AsFile`; keep the swap path as fallback behind a capability check.

### P2. Strict API-graph placeholder check — pattern · image · partial · value 3 · S
What: refuse non-API exports, look for `%prompt%` only in node `inputs`, refuse unknown leftover `%x%`. Our state:
`src/image/workflows.ts:47` `decideWorkflow` accepts any text containing `"%prompt%"`; `:76` `hasPrompt` stringifies the whole graph
including `_meta`. A UI-format export or a `%prompt%` only in a node title passes and the picture silently ignores the scene. Sketch:
`checkWorkflowGraph` gains `apiFormat` and `promptInInputs`, `unknownPlaceholders` (ST's known set); `decideWorkflow` falls back with
a named reason; also used by the bundle installer (`planBundleInstall`). See Suspected SO defects.

### P3. Strip PNG text chunks from references and from saved outputs — pattern · image/privacy · absent · value 2 · S
What: chunk-level strip, no re-encode (`image.js:24-48`). For SO the useful half is the output side: ComfyUI's `SaveImage` embeds
`prompt` + `workflow` (full instruction text, names, place) in every PNG SO stores under `/user/images` or sprite folders; a shared
picture carries the prompt. Our state: no `tEXt` handling (`grep tEXt src server-plugin` empty). Fit: media plugin or `stHost` save
path; byte-preserving, pure helper testable in jest. Low urgency (one user), but cheap and makes shared sprites/backgrounds clean.

### P4. Validate with empty values before fetching images — pattern · image · partial · value 2 · S
`editor.js:450-456`: run the populate step once with empty reference strings so a bad workflow fails before avatars and references
are downloaded/encoded. Our cast-scene path builds graphs in code (`src/image/castScene.ts:103-119`), so this only matters for
author-bundled workflows (`illustrations.bundle`), where `storyWorkflowHealth` already checks nodes. Fold into P2.

## Host facts

- **Closing the `/api/sd/comfy/generate` request makes ST POST ComfyUI `/interrupt`** (global, not per prompt):
  `C:/dev/SillyTavern-MainBranch/src/endpoints/stable-diffusion.js:568-574` (socket `close` → `fetch(<comfy>/interrupt)` →
  `controller.abort()`). An aborted ST image request kills whatever ComfyUI is executing at that moment, which can be a job SO's media
  plugin queued (sprite builder, cast scene) on the same server. SO renders through `/sd` (`src/services/stHost/stImage.ts`) and its
  own plugin; check that no SO cancel path aborts an ST `/sd` request while the broker lets a plugin job run, and that the GPU broker
  (`server-plugin/story-orchestrator-gpu`) treats an ST interrupt as possible. Same file `:319-321` (A1111) and `:685-686` (per-job
  cancel, other provider).
- ST's `/api/sd/comfy/workflow` returns the default workflow for a missing file name (their `editor.js:434`); SO already lists first
  (`stHost/comfyWorkflows.ts:31-33`).
- ST's ComfyUI placeholders replace whole JSON string values in the whole text, metadata included (their README §Custom workflows,
  `editor.js:461` comment).

## Suspected SO defects

- `src/image/workflows.ts:47` and `:76`: `%prompt%` presence is a substring test over the whole workflow text (titles/`_meta`
  included) with no API-format check; contrast `st-image-edit/workflow.js:10-15,37-49`. Effect: a story workflow that would ignore the
  scene is used instead of falling back with a reason. Low severity.

## Not worth taking

- HEIC decode (3.2 MB vendored wasm): SO inputs are its own PNGs.
- `characterAvatarUrl` random group member (`comfy.js:20-24`): SO picks references by roster, never at random.
- Flux.2 Klein workflows: model choice is SO's catalog/recipe decision (20 visual bridge), not a pattern.
- Slash-command source ordering (`order=`): SO has no free-form reference picking.

## Security notes

- Same-origin only: `/api/sd/comfy/workflows|workflow|generate` with ST headers; ComfyUI URL is ST's own `sd.comfy_url`, proxied by
  ST. References restricted to same-origin or `data:` (`editor.js:351-354`). Saves only under `/user/images/image-edit/`.
- Vendored `vendor/heic-to/heic-to.js` (LGPL-3, unverified offline; SECURITY.md gives the sha256 to check before install). Not needed
  by any idea above.
- No agent-addressed text found. Licence MIT: code may be adapted, but every idea above is small enough to write fresh.
