# Showcase: the Lantern Inn scene

A short playable scene that shows the sprite features on a lane: a live close-shot head that follows the speaker, directed full-body poses, a look change (outfit and a decal), expressions, and a background. Three original, synthetic characters; no campaign material.

Files:
- Story: `test/showcase/lantern-inn.story.json` (validated by `src/sprites/showcaseStory.test.ts`).
- Tool: `scripts/debug/so-showcase.mts`, run through a lane.
- Art and rigs live outside the repo, in `C:\dev\so-showcase-art` (override with `SO_SHOWCASE_ART`): three base PNGs and avatars, `art.json`, and one `<name>.rig.json` live-head rig each. The art is not published.

## Open it

1. Build the candidate: `npm run build`.
2. Start a lane, headed if you want to watch: `node scripts/debug/st-lanes.mts start 40 --headed`. The page is `http://127.0.0.1:8140/`.
3. Prepare it: `node scripts/debug/st-lanes.mts run 40 -- scripts/debug/so-showcase.mts prepare --candidate`.
   - Creates the three `SO-Show` cards, the group "SO-Show Lantern Inn", imports the story, mounts the three live-head rigs and opens a new chat on the first checkpoint.
   - Add `--restore-cache` to copy the saved pre-rendered sprite sets in first (after `cache save`).
   - Add `--no-render` to stop the stage asking ComfyUI for missing bodies.

## Walk it

1. Opening scene ("Arriving", close framing): the three stand in their own art. The speaking character steps forward with a live head: blinks, breathing, gaze and a moving mouth while a reply streams. Hand the turn to another speaker and the live head moves with it; only one is live at a time.
2. Advance with `/cp activate council`, then `ambush` and `rest` (Author view on). Each checkpoint directs poses and faces: seated at the council, fighting in the ambush, kneeling and sitting at rest. The first time a pose is shown it is rendered through ComfyUI and cached; replays are instant. Rendering needs the GPU and the local ComfyUI (`node scripts/local/cli.mjs start-comfy`).
3. The outfit change (first member) and the scar decal (second member) are set by `effects.card` on later checkpoints and re-render only the layer that changed.
4. Reload the page and reopen the chat: the stage, poses and live head come back from the cache.

## Two entry states

- Cold, nothing cached: `cleanup --purge-sprites` (removes the story's generated sprites through the product's own `remove-story`), then `prepare`. Every body and expression is rendered on first use.
- Pre-rendered: after a warm run, `so-showcase.mts cache save` copies the generated set folders to `<art>/cache`; after a purge, `prepare --restore-cache` puts them back. Only set folders move: a rig is bound to the base art's file URL, so the base `neutral.png` is never overwritten.

## Reset

`node scripts/debug/st-lanes.mts run 40 -- scripts/debug/so-showcase.mts cleanup [--purge-sprites]` removes the marked cards, chats, group and builder settings, and reports `{"clean":true,"leaked":0}`.

## Limits

- Desktop only for frame-rate claims: the live head's 30 fps floor was measured on a desktop (and misses by 0.06 ms once); no laptop was measured.
- Streamed replies need a model route; the scene's opening line is scripted so it needs none.

# Demo story: The Beacon on the Hill (guide site, plan 46 W4)

A second original scene, made for the public guide site: three synthetic characters, four scenes, publishable art.
It shows talk pacing (a profile per scene, a lead), a stuck-player lead ladder, minimum turns, in-chat elements
(offers as chat-end chips, codex discovery cards), a background per scene and a look change.

Files (all public):
- Story and cards: `test/showcase/demo/beacon.story.json`, `tobin|june|wren.card.json` (validated by `src/sprites/demoStory.test.ts`).
- Art: `docs/guide/assets/showcase/characters|expressions|poses/` (each file with a `.json` sidecar); scene backgrounds are
  the shared plan 45 set in `docs/guide/assets/showcase/backdrops/`. Licences: `docs/guide/assets/showcase/LICENSES.md`.
- Animated-character page: `docs/guide/showcase/animated-character/` (rigs, `demo.json`, bundle).

## Rebuild the art (local ComfyUI, owner's GPU)

Only when ComfyUI's queue is empty and nobody is playing. Each job waits its turn in the queue.

1. `node scripts/local/cli.mjs start-comfy` and `node scripts/local/landmarks.mjs start` (CPU face detector).
2. `python -I scripts/docs/demo-art.py all` (renders to `.build/demo-art/raw`), then `python -I scripts/docs/demo-art.py publish`.
3. `node scripts/docs/demo-bundle.mjs rig && node scripts/docs/demo-rigs.mjs` (rigs from the published busts).
4. `node scripts/docs/demo-bundle.mjs demo` (the page bundle; separate from the extension's webpack build).

## Record the clips (after the playtest, on a lane with a model)

Real generation: the model writes every reply. Never against the owner's ST (the script refuses without `SO_LANE`).

1. `npm run build && npm run stage`; start a lane whose model profile answers (the 3090 controller when the owner says
   so, or a rented GPU): `node scripts/debug/st-lanes.mts start 41 --headed`.
2. `node scripts/debug/st-lanes.mts run 41 -- scripts/debug/so-demo-record.mts prepare` (cards, group, story, the four
   backgrounds uploaded as `so-demo-<id>.jpg`; images and sprites stay off so the lane never reaches ComfyUI).
3. `node scripts/debug/st-lanes.mts run 41 -- scripts/debug/so-demo-record.mts record` records, in order,
   `talk-pacing`, `stuck-lead`, `swipe-rollback`, `scene-change`, `story-sheet` into `docs/guide/assets/showcase/clips/`
   (VP9 WebM at 12 fps, 960 px, a `.json` sidecar each with the build, model and what happened). Pass clip names to
   record a subset.
4. `... so-demo-record.mts cleanup` removes the cards, group, chats and backgrounds.

Review each clip before committing it: the model's replies are public once merged.
