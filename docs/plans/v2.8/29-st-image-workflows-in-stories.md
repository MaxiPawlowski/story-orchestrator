# Plan 29 — ST image workflows in stories

**Status: SEEDED 2026-10-07 from the user's idea list ("Integrate ST workflows into stories", `00-overview.md` tail);
needs user approval; not built.** The phrase is ambiguous (decision 1). Primary reading below: ComfyUI workflows as
SillyTavern's Image Generation extension stores them. Implementation D; acceptance LI (+ CL for the director).

## Problem / idea

v2.7 17 route A renders through ST's own Image Generation (`src/services/stHost/stImage.ts:23-31`,
`/imagine quiet=true …`). On the `comfy` source, *what* gets drawn is decided by one install-wide workflow,
`extension_settings.sd.comfy_workflow` (ST `stable-diffusion/index.js:340`, default `Default_Comfy_Workflow.json`). A
story cannot say "portraits use my face-detailer workflow, backgrounds use the wide landscape one, the finale uses the
painted-style one". Route B (our graph builder, `src/image/graph.ts:18`) can route per purpose, but only through our
own graphs and catalog, not the workflows the user already tuned in ST.

Idea: a story names (or carries) ST ComfyUI workflows per picture purpose and per checkpoint, and the image runtime
uses them for those renders only.

## Player / author outcome

- Author: in the Studio Story tab, map each purpose (`scene`, `character`, `portrait`, `background`, `user`, `free`,
  `src/image/catalog.ts:6`) to a workflow from the list ST already shows, optionally overridden per checkpoint
  (a finale look). Export carries the mapping, and optionally the workflow JSON.
- Player: pictures look the way the author tuned them, without touching ST's Image Generation settings. Their own
  selected workflow comes back after every story render. Without ComfyUI, or with a workflow missing, the story still
  plays and renders through their default workflow, and Repair names what is missing.

## Existing code to reuse

| What | Where |
|---|---|
| Workflow store, per ST user | `directories.comfyWorkflows = 'user/workflows'` (ST `src/constants.js:42`, `src/users.js:101`) |
| List / read / save / rename / delete | ST `src/endpoints/stable-diffusion.js:485` `/workflows`, `:495` `/workflow`, `:509` `/save-workflow`, `:521`, `:534` |
| Workflow selection | `changeComfyWorkflow` (ST `stable-diffusion/index.js:1335-1342`, `saveSettingsDebounced`), `/imagine-comfy-workflow` alias `/icw` (`:5788`) |
| Placeholder substitution | ST `stable-diffusion/index.js:4221-4270`: `%prompt%`, `%negative_prompt%`, `%seed%`, `%denoise%`, `%clip_skip%`, settings placeholders, custom `comfy_placeholders`, `%user_avatar%`, `%char_avatar%` |
| Route A render + readiness | `src/services/stHost/stImage.ts:7-31` |
| Route B graph + ComfyUI jobs | `src/image/graph.ts`, `server-plugin/story-orchestrator-media/jobs.mjs` |
| Per-request overlay, never an install write | v2.4 plan 06 sampler overlay (`runtime/samplerOverlay.ts`) and the effect ledger (`runtime/effectLedger.ts`, compare-and-set restore) |
| Create-only provisioning of assets a story needs | v2.1 plan 06 wizard (`src/wizard/provisioning.ts`) |
| Story image fields | `StoryIllustrations` / `IllustrationLook` (`src/engine/schema.ts:347-355`, chapter `:246`, story `:414`) |

**Trap found while writing:** ST's `/workflow` answers a missing file name with `Default_Comfy_Workflow.json`
(`stable-diffusion.js:497-499`), the same shape as `loadWorldInfo`'s dummy. Existence is the `/workflows` list,
never a read.

## Design

### A. Schema (format-2, additive)

```json
"illustrations": {
  "workflows": { "portrait": "SO-Belle-Portrait.json", "background": "Wide-Landscape.json" },
  "bundle": { "SO-Belle-Portrait.json": { "graph": { }, "sha256": "…" } }
}
```

- `illustrations.workflows`: purpose → workflow file name. Checkpoint override: `effects.illustrations.workflows`
  (same shape; replay rule like `effects.background`: last on the path wins).
- `illustrations.bundle` (optional): workflow JSON carried by the story, for export to another install.
- Validator: names end in `.json`, pass ST's filename rules, purpose keys from `Purpose`.

### B. Rendering on route A (ST source `comfy`)

- For one story render: read the current `comfy_workflow`, set the mapped name **in memory only**, render, restore
  compare-and-set (a value another caller changed meanwhile is left alone and journaled), never `saveSettings`.
  Serialized with every other route-A render (one queue already exists in `src/image/queue.ts`).
- Refuse (fall back to the user's workflow, reason in the journal) when: the source is not `comfy`; the name is not
  in `/workflows`; the workflow lacks `"%prompt%"` (it would ignore the director).
- The ledger row means a reload mid-render restores the user's selection on hydrate.
- Alternative if the in-memory switch races ST's own UI: render via route B with the workflow JSON plus our own
  placeholder pass mirroring ST's list. Decision 3.

### C. Installing a bundled workflow

- Create-only, one card per workflow (wizard provisioning precedent): written through ST's `/save-workflow` under a
  name that does not exist yet; an existing name with different bytes is never overwritten (offer a suffixed name).
- Before the card: `/object_info` check that every `class_type` exists on the user's ComfyUI; missing node classes and
  missing model files are listed (model files feed v2.8 30 downloads). Never install custom nodes.
- Requirements panel: `requirements.workflows` (derived from the mapping) goes green from the `/workflows` list.

### D. Studio and Repair

- Story tab: a workflow picker per purpose fed by `/workflows`, plus "Export with workflows".
- Check registry (v2.7 04): `story-workflow-missing` (`degrades`, player copy "Some pictures will use your own image
  settings"), `story-workflow-nodes-missing` (`degrades`, author detail lists node classes).

## Alternative reading: STscript / Quick Reply "workflows"

"ST workflows" could mean automation: a story carrying Quick Reply sets or STscript that run at checkpoints
(`.claude/skills/st-scripting`). That would be a `effects.quick_replies` / `effects.run` effect plus create-only QR
provisioning. It is a much larger security surface: a story becomes code that runs slash commands as the player
(`/sendas`, `/gen`, `/profile`, `/delchat`). If that is the intent, it needs its own plan with a command allowlist,
a per-story consent prompt and the sandbox thinking of v2.8 23 (story widgets). Not designed here.

## Security & privacy

- A workflow is a graph executed by the user's ComfyUI. A bundled graph from a stranger's story can use any node the
  user has installed, including custom nodes that run code or read files. Mitigations: show the node class list on the
  install card; refuse classes on a denylist of known code/file nodes (proposed list, user decision 4; the media plugin
  already runs only an allowlist of node classes, `story-orchestrator-media/index.mjs:21-23`, so route B keeps that rule
  and a bundle needing more is route A only); never
  auto-install a bundle; never install custom nodes or models from a story.
- `%user_avatar%`/`%char_avatar%` send avatar images to ComfyUI; that is ST's own behaviour, unchanged.
- No install-wide settings write; the user's selection survives every story render (ledger + compare-and-set).

## Gates

- **D:** schema validation + replay rule; the switch-and-restore unit (in-memory only, compare-and-set, no
  `saveSettings` call, ledger reconcile on hydrate); refusal matrix (non-comfy source, name not listed, missing
  `%prompt%`); `/workflow` default-answer trap pinned by a test that never reads to check existence; provisioning
  never overwrites (planted existing name); node-class check against a fake `/object_info`. Storybook for the picker.
  `npm run gates`.
- **LI (acceptance):** a test story mapping two purposes to two marked `SO-` workflows renders each with its own
  workflow (ComfyUI history shows the right graph), the user's selection is unchanged after, ×2 consecutive; cleanup
  deletes only `SO-` marked workflows. Proposed floor: 100% of story renders on the mapped workflow, 0 changes to
  `sd.comfy_workflow` on disk.
- **Registry:** feature entry + Help.

## Dependencies

v2.7 17 (route A/B, director), v2.7 04 (check registry), v2.7 18 (route B recipes), v2.8 30 (missing models in a
bundled workflow), v2.8 23 (if the STscript reading is chosen).

## Decisions for the user

1. **Which did you mean: ComfyUI image workflows (this plan) or STscript / Quick Reply automation?** Recommended:
   image workflows first.
2. Mapping by name only, or also carry the JSON in the story? **Recommended: both; the bundle is optional.**
3. Route A in-memory switch vs route B with the workflow JSON? **Recommended: route A switch, B as fallback if live
   races show up.**
4. Denylist known code-executing node classes in bundled workflows? **Recommended: yes, shown, author can't override.**
5. Per-checkpoint overrides in the first cut? **Recommended: yes (it is the "finale look" case).**

## Links

ST `public/scripts/extensions/stable-diffusion/index.js` (`:340`, `:1335`, `:4221`, `:5788`), ST
`src/endpoints/stable-diffusion.js:485-560`; `src/services/stHost/stImage.ts`; `src/image/{catalog,graph,queue}.ts`;
`docs/plans/v2.7/17-self-contained-images.md`; `.claude/skills/st-image-generation`, `.claude/skills/st-scripting`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. Decision 1: **image workflows** (ST ComfyUI workflows), not STscript/QR.

## Owner decisions to confirm (2026-10-10, build)

Owner approval 2026-10-10 (queue A10); each open decision took the plan's recommendation, recorded for the owner to
confirm: (1) the primary reading, ComfyUI image workflows as ST stores them (not STscript/QR); (2) mapping by name and
an optional bundle; (3) the route A in-memory switch (route B fallback not built; no race seen yet, unmeasured live);
(4) a denylist of code/file nodes, shown, not overridable (`src/image/workflows.ts` `WORKFLOW_DENIED_NODES` + a name
pattern; core nodes pass); (5) per-checkpoint overrides in the first cut. Also decided while building, to confirm:
the swap ledger lives in the browser's localStorage (a settings or chat write would itself risk persisting the
swapped value); bundled entries are shape-checked at parse and hash/node-checked only at install; one Setup check
(`story-workflow-missing`, degrades) covers missing workflows and missing bundle nodes, because the main bundle had no
room for two (1,249,994 of 1,250,000 bytes after this plan).

## Gate record (2026-10-10, branch `v2.8-media-stack`)

As built:
- Schema: `illustrations.workflows` (picture type → ST workflow file), `illustrations.bundle` (`{graph, sha256}`,
  sha256 of the compact JSON graph), checkpoint `effects.illustrations.workflows`; `ILLUSTRATION_PURPOSES` in the
  schema (the catalog's six types). Validator names a bad name/type by path.
- `src/image/workflows.ts` (pure): replay (story map, then each visited checkpoint, last wins), refusal matrix
  (`decideWorkflow`: non-comfy source, not listed, unreadable, no `"%prompt%"`), graph check (node classes, missing,
  denied, models), create-only install plan (suffixed name, never overwrite).
- `stHost/comfyWorkflows.ts`: list/read/save through ST's `/api/sd/comfy/*`; existence is the `/workflows` list,
  never a `/workflow` read (it answers a missing name with the default file); `withComfyWorkflow` switches
  `extension_settings.sd.comfy_workflow` in memory only, restores compare-and-set in `finally`, never saves; a
  write-ahead localStorage row restores the player's selection on start if a reload caught a swap that reached disk.
- Image runtime (route A only): the plan carries the story's workflow for its purpose; renders go through the lazy
  `workflowRender.ts`; a fallback reason is kept as `status().workflowNote`; health carries `storyWorkflows`.
- Studio: Story tab Illustrations gets a per-type workflow picker (`WorkflowMapEditor`, fed by ST's list), Export
  with workflows and install cards (`BundledWorkflowsPanel`: node classes, models, missing/denied nodes, create-only
  install); EffectsEditor gets **Picture workflows** per checkpoint.
- Setup check `story-workflow-missing` (degrades, player copy "Some pictures use your own image settings.").
- Docs: user guide `setup/images.md` "Story workflows", author guide `presentation` topic (doc + compact twin),
  registry feature `story-workflows`, README table regenerated.

Gates: `npm run gates -- --no-storybook --jobs 2` all green (typecheck, typecheck:test, debug:typecheck, test, build,
lint, test:release, test:debug, test:plugin, test:replay); Storybook skipped. Stories to run: `Studio/WorkflowMapEditor`
(4), `Studio/BundledWorkflowsPanel` (3), `Settings/ImageGroup`. New tests: `src/image/workflows.test.ts`,
`src/services/stHost/comfyWorkflows.test.ts`, `src/studio/workflowBundle.test.ts`, a case in `src/image/cleanHost.test.ts`.

Not run (3090 busy): LI — a test story mapping two purposes to two `SO-` workflows, each render on its own workflow
(ComfyUI history), the player's selection unchanged on disk, ×2; cleanup deletes only `SO-` workflows. Open.

Adolion: not recommended for now. The campaign renders through the default route; a per-type workflow only pays once
the owner has tuned workflows in ST's ComfyUI, and every Adolion player without them falls back to their own (Setup
row). Revisit after the LI check and once a portrait/background workflow exists on the owner's install.
