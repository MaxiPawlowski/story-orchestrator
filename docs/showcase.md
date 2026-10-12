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
