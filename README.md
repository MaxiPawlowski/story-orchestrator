# Story Driver (SillyTavern Extension)

## Overview
Story Driver turns a SillyTavern group chat into a guided, checkpoint-driven adventure. The plugin runs a Dungeon Master (DM) and Companion alongside the player, watching user messages for win or fail triggers and applying stage-specific context (Author's Note, World Info, text-generation presets, optional automations).

## Key pieces:
- Story Drawer (shown in the chat UI) displays requirements, checkpoint progress, and upcoming milestones.
- Settings panel (plugin settings) contains toggles and configuration UI.
- Bundled checkpoints live in `src/checkpoints/` and are validated and loaded at startup.

## Quick Start
1. Create two characters in SillyTavern:
   - DM tagged `dm` (narrator + referee).
   - Companion tagged `companion` (supportive roleplay + soft hints).
2. Start a group chat with Player, DM, and Companion in that order.
3. Enable the extension. The drawer populates once a valid story is detected and requirements pass.
4. Play normally. The orchestrator listens to user messages, advances checkpoints on `win` triggers, flags failures, updates prompts, and can fire automation IDs.

## Runtime architecture
- `src/index.tsx` is the extension entry point and mounts the Settings panel and Story Drawer inside a `StoryProvider` context.
- `src/components/context/StoryContext.tsx` along with `src/hooks/useStoryContext.ts` validate bundled JSON (via the SchemaService) and expose normalized stories and orchestrator state to the UI.
- `src/services/SillyTavernAPI.ts` wraps host globals (event bus, world-info helpers, and textgen slider helpers) so the extension logic stays build-tool agnostic.
- `src/services/StoryService/StoryOrchestrator.ts` is the runtime controller: it advances checkpoints, applies Author's Note / World Info, merges preset overrides via `PresetService`, and emits UI/events.
- `src/services/PresetService/index.ts` manages story-level preset cloning and overrides (it interacts with the host UI when available).
- `src/services/SchemaService/` contains the story schema and validator used at load time (`story-schema.ts`, `story-validator.ts`).

## Authoring checkpoints
Stories follow schema version `1.0` (see `src/services/SchemaService/story-schema.ts`). Each story JSON should include:
- `title`: Story name.
- `roles`: Optional mapping of role tags (`dm`, `companion`, `chat`) to SillyTavern character names.
- `base_preset`: `{ source: "named" | "current", name? }` describing the starting preset.
- `role_defaults`: Per-role slider overrides merged before any checkpoint-specific overrides.
- `checkpoints`: Ordered array where each checkpoint defines:
  - `id`, `name`, `objective`.
  - `triggers.win` (required) and optional `triggers.fail` regex patterns (string or array, `/pattern/flags` supported).
  - `on_activate`: Same shape as `on_start`, applied when the checkpoint becomes active.

## Development
1. `npm install`
2. `npm run dev` — webpack in watch mode + TypeScript typecheck (development workflow)
3. `npm run build` — production bundle
4. Deploy the built `dist/index.js` alongside SillyTavern (or install the extension directory under `data/default-user/extensions/`).

This project uses React 19 + TypeScript + Tailwind. Follow the repo's coding conventions for accessibility and module naming.
