# Story Driver (SillyTavern Extension)

## Overview
Checkpoint‑driven story runner for SillyTavern. It orchestrates DM + Companion roles alongside the player, watches user chat turns for win/fail trigger regexes, advances checkpoints, and applies per‑stage contextual injections (Author's Note, World Info enable/disable, preset overrides). It also tracks requirement readiness (persona, roles, lore presence) before enabling runtime behavior.

## What this extension provides
- A pinned Drawer UI in the chat for requirements, checkpoint progress, and manual controls.
- A Settings panel injected into the host settings area.
- Bundled numeric JSON stories under `src/checkpoints/` that are validated and loaded at runtime.

## Quick Start
1. Create characters in SillyTavern for the configured roles (use names referenced in your story JSON): typically `dm` and `companion`.
2. Open or create a group chat and ensure the group chat is selected in the host UI.
3. Enable the extension. The Drawer will populate after a valid story is detected and requirements are met.
4. Play: user messages increment turn counters. The orchestrator evaluates triggers (regex or interval) and may mark checkpoints complete/failed, apply Author's Notes, toggle World Info entries, and apply preset overrides.

## Runtime architecture (concise)
- `src/index.tsx` — mounts Settings and Drawer; Drawer is wrapped in `StoryProvider`.
- `src/components/context/StoryContext.tsx` — loads checkpoint bundle and exposes normalized story + runtime state to the UI.
- `src/hooks/useStoryOrchestrator.ts` + `src/controllers/orchestratorManager.ts` — ensure a singleton orchestrator instance for the active story and wire runtime hooks into UI.
- `src/services/StoryOrchestrator.ts` — the stateful controller: activation, turn handling, evaluation enqueueing, AN/world info application, and persistence coordination.
- `src/services/PresetService.ts` — clones/apply presets and per‑role overrides.
- `src/services/CheckpointArbiterService.ts` — performs evaluation logic and returns outcomes (continue|win|fail).
- `src/services/SillyTavernAPI.ts` — host API wrapper used across controllers.

## State & persistence
- Runtime state is in `src/store/storySessionStore.ts` (Zustand vanilla store): `runtime.checkpointIndex`, `runtime.checkpointStatuses`, `runtime.turnsSinceEval`, and `turn`.
- Persistence occurs only when a story, chatId, and group chat selection are present. Serialized state is keyed by chat+story.
- On chat/context change the persistence controller attempts to hydrate prior runtime state; otherwise a fresh runtime is created.

## Requirements gating
Before the orchestrator marks itself ready it ensures:
- Persona (user name) present
- Group chat selected
- Required roles exist as characters
- Referenced world info entries exist in the configured lorebook
- Global lorebook name is present in host settings

## Bundling & validation
- `src/utils/json-bundle-loader.ts` — discovers numeric JSON with multiple fallback strategies: Webpack `require.context`, `import.meta.glob`, manifest fetch (`dist/checkpoints/manifest.json`), or runtime sequential fetch of `dist/checkpoints/*`.
- `src/utils/story-loader.ts` — validates each discovered JSON with the Zod schema + normalizes regexes and activation blocks.
