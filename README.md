# Story Driver (SillyTavern Extension)

## Overview
Story Driver turns a SillyTavern group chat into a guided, checkpoint-driven adventure. The plugin runs a Dungeon Master (DM) and Companion alongside the player, watching user messages for win or fail triggers, and applying stage-specific context (Author's Note, World Info, text-generation presets, optional automations).

Key pieces:
- Story Drawer (in the main chat drawer) shows requirements, checkpoint progress, and future milestones.
- Settings Panel (plugin settings) houses toggles and future configuration UI.
- Bundled checkpoints live in `src/checkpoints`; valid stories load automatically at startup.

## Quick Start
1. Create two characters in SillyTavern:
   - DM tagged `dm` (narrator + referee).
   - Companion tagged `companion` (supportive roleplay + soft hints).
2. Start a group chat with Player, DM, and Companion in that order.
3. Load or author checkpoint stories in `src/checkpoints` (files named `0.json`, `1.json`, ...). Run `npm run build` to ship changes into `dist/index.js`.
4. Enable the extension. The drawer populates once a valid story is detected and requirements pass.
5. Play normally. The orchestrator listens to user messages, advances checkpoints on `win` triggers, flags failures, updates prompts, and can fire automation IDs.

## Runtime Architecture
- `src/index.tsx` boots the Settings panel and Story Drawer within a shared `StoryProvider` context.
- `src/components/context/StoryContext.tsx` validates bundled JSON with Zod (`story-validator.ts`) and exposes normalized stories.
- `src/hooks/useStoryOrchestrator.ts` instantiates a `StoryOrchestrator`, wires SillyTavern `eventSource` hooks (user messages, generation lifecycle), and exposes checkpoint state to the UI.
- `src/services/StoryService/orchestrator.ts` is the runtime brain: advances checkpoints, applies author notes/world info, merges preset overrides through `PresetService`, and emits events.
- `src/services/PresetService` manages a dedicated text-generation preset per story, cloning from the current sliders or a named base and pushing overrides back into SillyTavern.
- `src/services/SillyTavernAPI.ts` wraps host globals (event bus, world info helpers, preset sliders) so the extension can remain build-tool agnostic.

## Authoring Checkpoints
Stories use schema version `1.0` (`src/services/SchemaService/story-schema.ts`). Each file must include:
- `title`: Story name.
- `roles`: Optional mapping of role tags (`dm`, `companion`, `chat`) to SillyTavern character names.
- `base_preset`: `{ source: "named" | "current", name? }` describing the starting preset.
- `role_defaults`: Per-role slider overrides merged before any checkpoint-specific overrides.
- `on_start`: Optional block applied before the first checkpoint (`authors_note`, `world_info`, `preset_overrides`, `cfg_scale`, `automation_ids`).
- `checkpoints`: Ordered array where each checkpoint defines:
  - `id`, `name`, `objective`.
  - `triggers.win` (required) and optional `triggers.fail` regex patterns (string or array, `/pattern/flags` supported).
  - `on_activate`: Same shape as `on_start`, applied when the checkpoint becomes active.

Validation tips:
- Run `npm run build` (or `npm run dev`) to rebuild after editing JSON; loader output appears in the browser console.
- `story-validator.ts` normalizes regexes and throws descriptive errors. Check the console for `Validation summary` logs when stories load.
- Use small, precise regexes to prevent accidental triggers.

## Development
1. `npm install`
2. `npm run dev` for webpack + TypeScript watch (outputs to `dist/` and rebuilds checkpoints).
3. `npm run build` for a production bundle.
4. Drop the folder under `SillyTavern/public/scripts/extensions/third-party/` (or link via `data/default-user/extensions/`).

Project uses React 19 + TypeScript + Tailwind (utility classes inline). Follow the coding standards in `.git/copilot-instructions.md` for style, accessibility, and module naming.

## Troubleshooting
- Drawer missing? Ensure the group chat has DM/Companion roles and that checkpoints validated at least one story. See console logs from `useStoryOrchestrator` for load status.
- Preset sliders not moving? `PresetService` falls back to runtime-only updates when the DOM preset select is absent; confirm SillyTavern UI IDs match stock builds.
- Need to inspect world info toggles? Use the Checkpoints panel `debug WI` button (console output) or inspect `SillyTavernAPI.updateWorldInfoEntries` logs.

## License
The extension inherits SillyTavern's upstream license when distributed with the host. See `LICENSE` for details.
