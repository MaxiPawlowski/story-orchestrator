
# Codex Agent Brief

Purpose
- This extension runs checkpoint-driven stories inside SillyTavern. It orchestrates a DM and Companion alongside the player, watches user messages for win/fail triggers, and applies stage-specific context (Author's Note, World Info, presets, optional automations).

Entry points & key files
- `src/index.tsx` — mounts the extension UI and provides the `StoryProvider` context.
- `src/components/context/StoryContext.tsx` — validates bundled checkpoint JSON and exposes normalized stories to the UI.
- `src/components/drawer/` — UI panes for Requirements, Checkpoints, and the Story Drawer.
- `src/checkpoints/` — bundled story JSON assets (e.g. `1.json`, `2.json`, `manifest.json`).

Runtime architecture
- `src/index.tsx` is the extension entry point and mounts the Settings panel and Story Drawer inside a `StoryProvider` context.
- `src/components/context/StoryContext.tsx` along with `src/hooks/useStoryContext.ts` validate bundled JSON (via the SchemaService) and expose normalized stories and orchestrator state to the UI.
- `src/services/SillyTavernAPI.ts` wraps host globals (event bus, world-info helpers, and textgen slider helpers) so the extension logic stays build-tool agnostic.
- `src/services/StoryService/StoryOrchestrator.ts` is the runtime controller: it advances checkpoints, applies Author's Note / World Info, merges preset overrides via `PresetService`, and emits UI/events.
- `src/services/PresetService/index.ts` manages story-level preset cloning and overrides (it interacts with the host UI when available).
- `src/services/SchemaService/` contains the story schema and validator used at load time (`story-schema.ts`, `story-validator.ts`).

Build & dev
- Install: `npm install`.
- Dev: `npm run dev` — webpack watch + TypeScript typecheck (development workflow).
- Prod: `npm run build` — outputs `dist/index.js` for the host.

Key data model
- Stories use schema version `1.0` and include ordered checkpoints. Each checkpoint typically defines:
  - `id`, `name`, `objective`.
  - `triggers.win` (required) and optional `triggers.fail` (regex string or array).
  - `on_activate` blocks which may set `authors_note`, `world_info`, `preset_overrides`, `cfg_scale`, and `automation_ids`.

Notes for agents
- Prefer exact regex matching and use normalization provided by `story-validator.ts` when evaluating triggers.
- Route preset updates through `PresetService` to keep UI and host in sync where possible.
- Use the bundle/loader logs in the browser console (`json-bundle-loader` / `story-loader`) to debug discovery and validation issues.
