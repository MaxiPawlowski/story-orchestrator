# Story Orchestrator

SillyTavern extension running format-2 authored stories as deterministic checkpoint graphs over an active chat.

## Sources of truth (read before implementing)

1. Spec: `docs/plans/v2/story-orchestrator-spec-v2.md`
2. `docs/plans/v2/00-implementation-overview.md` — canonical build rules, gate protocol, verified ST host facts, plan sequence
3. Current plan doc + **Gate records** of all prior plans (tail sections — as-built truth and deviations)

**Status: plans 01–11 complete. Plan 11 (Checkpoint Studio v2) gate green — harness (32 suites/1272 tests, build `dist/index.js` 909 KiB) + Storybook (14 story suites/36 play-function interaction + a11y tests via `npm run test-storybook:ci`) + live: StudioModal mounts in real ST (`#so-open-studio` → `#so-studio-modal`), authored "Studio Live Test" saved to the real `v2Stories` library and loaded (`activeCheckpointId: start`, `ready: true`); cleanup verified. Carry-in F1 CLOSED (expansion `runCodeChecks` rejects outcome gates contradicting a latched value — `src/generation/latchGuard.test.ts`). See `docs/plans/v2/11-studio.md` Gate record. Next: plan 12 (story copilot).** Update this line when a plan's gate goes green.

## V2 spine

- Stories declare qualities, checkpoints, typed gates, transitions, roster, effects, requirements.
- `StoryEngine`: blackboard, serialized apply queue drained at boundaries, one transition per boundary, boundary logs, snapshots, rollback.
- `RuntimeManager`: ST integration, per-chat persistence in `chat_metadata.story_orchestrator`, effects, macros, slash commands, extraction state, UI snapshots.
- `TurnBridge`: ST events → commits only at rendered reply boundaries; mutations (swipe/edit/delete) → rollback.
- Extraction runs off-path (`ExtractionScheduler` → `runSharedRead`); accepted deltas apply only at the next boundary.

## SillyTavern integration — non-negotiable

- `src/services/STAPI.ts` + `src/services/stHost/*` are the ONLY host import surface (dynamic `import(/* webpackIgnore: true */ …)`). New host access = new `stHost/` module.
- Engine purity: `src/engine/**` never imports STAPI; host effects go through the `EngineHost` seam.
- Never trust an assumed ST shape. Verify in ST host source (`C:\dev\SillyTavern-MainBranch\`), `.claude/sillytavern-docs/`, or `node scripts/debug/st-search.mts`. No blind casts — add a debug log + local type instead.

## Validation before handover — never claim done without gates

| Change touches | Required gates |
|---|---|
| docs only | none |
| pure modules (`engine/`, `extraction/` non-host, `pacing/`) | `npm run typecheck && npm run lint && npm test` |
| runtime / UI / ST-facing / extraction host paths | above + `npm run build` + live gate via `debug` skill: `st-navigation.mts recent-group` → `so-state.mts current` → change-specific checks or `so-scenario.mts`. **Live gate default = real-LLM browser validation, as an end user**: real generation (`send`/`send_generate`) for chat-path changes; real extraction/expansion/memory passes (Connection Manager profile selected, no `debugResponse`) for any LLM-consuming pipeline touched |

`debugResponse` mocks are for unit determinism and scenario plumbing only — never sufficient for sign-off on LLM-consuming paths. If the real-LLM live gate cannot run (ST down, no backend, no extraction profile), say so explicitly at handover and flag the gate as NOT green — do not fall back to mocks silently.

Report exact commands and results at handover. Failing gate = say so plainly; never hedge or sign off around it.

## UI entry points

- Settings panel (`#stepthink_settings`): story import/select, extraction settings, **"Open Studio" button (`#so-open-studio`)**. Drawer: checkpoint progress, blackboard. Both live in `src/index.tsx`.
- **Checkpoint Studio v2 (plan 11) lives in `src/studio/`** — `StudioModal` (`#so-studio-modal`, opened from the settings panel) over a zustand draft store (`draft.ts`); all edits go through the typed `mutations.ts` (plan 12's copilot contract). Editors: quality/gate/checkpoint/transition/scope-preview/diagnostics. Every UI part has a `.stories.tsx` (interaction + a11y via `test-storybook:ci`).
- `src/components/studio/` = the 6 reused presentational primitives only (`GraphPanel`, `graphPanelUtils`, `MultiSelect`, `Toolbar`, `FeedbackAlert`, `HelpTooltip`); the rest of v1 was deleted. Do not resurrect deleted v1 editor/context/session code.
