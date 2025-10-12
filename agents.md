# Codex Agent Brief — Story Driver

## Purpose
Story Driver is a checkpoint-driven story runner for SillyTavern. It ensures the DM + Companion roles stay synchronized with the player by watching chat turns, evaluating win/fail triggers, advancing checkpoints, and applying contextual runtime effects (Author’s Notes, World Info toggles, preset overrides). Runtime automation only activates once persona, group chat, role, and lore requirements are satisfied.

## Lifecycle & Flow
1. Extension mounts; Drawer + Settings roots are injected after a short delay.
2. `StoryProvider` loads bundled checkpoint JSON (numeric filenames) through `json-bundle-loader` → `story-loader` → `story-validator`, yielding a `NormalizedStory`.
3. `orchestratorManager.ensureStory` spins up a singleton `StoryOrchestrator` when a valid story and group chat context are detected.
4. `StoryOrchestrator` hydrates persisted runtime, primes role presets, registers slash commands, and subscribes to SillyTavern host events.
5. Each player message increments `turn` and `turnsSinceEval`; interval thresholds or regex matches queue evaluations in `CheckpointArbiterService`.
6. Arbiter outcomes (`continue`, `win`, `fail`) update checkpoint status, optionally follow win/fail transitions, reset evaluation counters, and request persistence snapshots.
7. Activating a checkpoint applies world info toggles, per-role Author’s Notes, preset overrides, and updates the Zustand store so UI reflects the new state.

## Key React Surfaces
- `src/index.tsx` wraps the Drawer/Settings shells with `ExtensionSettingsProvider` and `StoryProvider`.
- `StoryContext` exposes story metadata, checkpoint summaries, requirement flags, runtime counters, and story library operations. It also handles chat-change event subscriptions.
- `ExtensionSettingsContext` persists arbiter prompt/frequency in the extension settings namespace with sanitization.
- Drawer components in `src/components/drawer/` present requirement badges, checkpoint progression, turn counters, and manual activation controls.
- Settings modules surface arbiter controls plus the Checkpoint Studio editor hosted in `src/components/studio/`.

## Controllers & Services
- `StoryOrchestrator` (services) coordinates activation, trigger evaluation, preset/world info application, requirement polling, chat context changes, and persistence reconciliation.
- `orchestratorManager` ensures a single orchestrator instance, clamps interval/prompt settings, forwards runtime hooks to React, and manages the `turnController`.
- `requirementsController` normalizes role names, checks persona + group chat selection, verifies world info entries/global lorebook, and emits requirement readiness flags.
- `persistenceController` stores runtime snapshots keyed by `(chatId + story title)` via helpers in `story-state`, only hydrating when group chat context exists.
- `CheckpointArbiterService` compiles win/fail regexes, renders the LLM-style evaluation prompt, handles interval checks, and selects outgoing transitions.
- `PresetService` clones the current or named base preset and applies per-role overrides during checkpoint activation.
- `SillyTavernAPI` wraps host globals (event bus, world info, Author’s Notes, presets, settings persistence) to keep build tooling agnostic of runtime globals.

## Zustand Store
- `storySessionStore` tracks: active story, story key, chat context, runtime (`checkpointIndex`, `activeCheckpointKey`, `checkpointStatusMap`, `turnsSinceEval`), current turn, hydration flag, requirement state, and orchestrator readiness.
- Actions sanitize inputs (`sanitizeRuntime`, `sanitizeTurnsSinceEval`), derive status maps, update checkpoint statuses, and persist requirement snapshots.
- Requirement state helpers live in `src/store/requirementsState.ts`; they provide diffing, cloning, and equality checks used by the controller.

## Checkpoint Studio & Story Library
- Studio components (`src/components/studio/*`) implement story metadata editing, checkpoint CRUD, diagnostics, and Cytoscape/dagre graph visualization.
- `utils/checkpoint-studio.ts` defines draft models, regex/string helpers, Mermaid graph output, and cleanup utilities for producing schema-compliant stories.
- `storyLibrary.ts` merges bundled stories with saved drafts stored under the extension settings `studio` key, normalizes entries, and exposes CRUD helpers to the UI.

## Persistence & Host Integration
- Runtime persistence only executes when a story, chatId, and group chat selection exist. Hydration avoids reapplying activation side effects unless the checkpoint index changes.
- Requirements polling reacts to SillyTavern events (`CHAT_CHANGED`, persona updates, lorebook loads) via `subscribeToEventSource`.
- Slash commands are registered in `src/utils/slashCommands.ts` during orchestrator initialization for manual checkpoint control or diagnostics.

## Assets, Styling & Build
- Bundled stories reside under `src/checkpoints/`; build output mirrors them into `dist/checkpoints/`.
- Styling uses Tailwind (`tailwind.config.js`) plus `src/styles.css`, processed through the webpack pipeline.
- Toolchain: React 19, TypeScript 5, Zustand 5, Cytoscape + dagre for graph layouts.
- Scripts: `npm run dev` (watch + typecheck), `npm run typecheck`, `npm run build`.
