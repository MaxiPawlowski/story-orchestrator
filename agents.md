# Codex Agent Brief

**Purpose**
- SillyTavern plugin that runs checkpoint-driven stories with a DM and Companion, auto-adjusting Author's Note, World Info, and generation presets per stage.

**Entry Points**
- `src/index.tsx` boots the settings panel and Story Drawer under `StoryProvider`.
- `src/components/drawer` contains the Requirements and Checkpoints panes that surface orchestrator state.
- `src/components/context/StoryContext.tsx` validates and exposes bundled checkpoint stories.

**Runtime Flow**
- `useStoryOrchestrator` loads the first valid story, instantiates `StoryOrchestrator`, and hooks SillyTavern `eventSource` events for user text and generation lifecycle.
- `StoryOrchestrator` updates stage state, applies authors notes/world info toggles, merges preset overrides via `PresetService`, and optionally fires automation IDs.
- `SillyTavernAPI.ts` wraps host globals (event bus, textgen sliders, WI helpers) that the orchestrator and presets rely on.

**Build & Dev**
- Install deps with `npm install`; run `npm run dev` for webpack + tsc watch or `npm run build` to emit `dist/index.js` consumed by SillyTavern.
- Checkpoint JSON lives in `src/checkpoints`; `story-loader.ts` pulls from bundled assets or runtime fetch and `story-validator.ts` (Zod) normalizes to `NormalizedStory`.

**Key Data Model**
- Stories follow schema version 1.0 with ordered checkpoints: each needs id, name, objective, `triggers.win` regex (optional `triggers.fail`), and `on_activate` blocks that may set `authors_note`, `world_info`, `preset_overrides`, `cfg_scale`, and `automation_ids`.
