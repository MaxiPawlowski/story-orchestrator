# Story Orchestrator

SillyTavern extension running format-2 authored stories as deterministic checkpoint graphs over an active chat.

## Sources of truth (read before implementing)

1. Spec: `docs/plans/v2/story-orchestrator-spec-v2.md`
2. `docs/plans/v2/00-implementation-overview.md` — canonical build rules, gate protocol, verified ST host facts, plan sequence
3. Current plan doc + **Gate records** of all prior plans (tail sections — as-built truth and deviations)

**Status: plans 01–10 complete. Plan 10 (epistemic map + state ledger) gate green — harness (23 suites/1224 tests, build) + live: `plan10-epistemic-ledger.json` 11/11 (real ST), `live-plan10-epistemic-ledger.json` 4/4 (real gemma P2), and the previously-flagged per-draft private swap now CLOSED (real `group_member_drafted`→swap captured in a real 2-member group generation payload: each member saw only its own epistemic block). Review-pass fix: F-A `onMemberDrafted` fail-open leak on an unresolved/non-roster draft → now fail-safe clear (see `docs/plans/v2/10-epistemic-ledger.md` Gate record, 2026-07-06 pass). Open finding F1 still deferred.** Update this line when a plan's gate goes green.

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

- Settings panel (`#stepthink_settings`): story import/select, extraction settings. Drawer: checkpoint progress, blackboard. Both currently live in `src/index.tsx`.
- `src/components/studio/` is dead v1 code (zero imports) — do not use; Studio is rebuilt in plan 11.
