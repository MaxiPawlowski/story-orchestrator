# Story Orchestrator

SillyTavern extension running format-2 authored stories as deterministic checkpoint graphs over an active chat.

## Sources of truth (read before implementing)

1. Spec: `docs/plans/v2/story-orchestrator-spec-v2.md`
2. `docs/plans/v2/00-implementation-overview.md` — canonical build rules, gate protocol, verified ST host facts, plan sequence
3. Current plan doc + **Gate records** of all prior plans (tail sections — as-built truth and deviations)

**Status: ALL PLANS 01–13 COMPLETE — v2 build ACCEPTED 2026-07-06 (see plan-13 Gate record, the project acceptance record). Real-LLM acceptance run (gemma4-mtp, headed, no mocks): live delta baseline 22/22 = 100% (`so-live-suite --min 0.9 --record`, goldens in `test/goldens/live/`); all 10 real-LLM scenarios green; full sun-ruins play-through cp1→cp-6 with every gate fired by real extraction; spec success-criteria matrix 8/8 PASS. Acceptance run fixed two ship-blockers: (1) instruct template silently bypassed for all memory-LLM calls (string prompt → message array in `stHost/connectionProfiles.ts`) — untemplated Gemma degenerated into token loops; (2) stale-expansion revalidation spliced out the ACTIVE generated checkpoint, freezing boundary commits (skip active-expansion staleing + basis-tracked drift check in `generation/revalidate.ts`). Plus parser tolerance for 2 delta format variants, beat gate/delta string→typed coercion, live-suite tension MAE ≤ 0.3 scoring policy, 3 undecidable fixtures reworded decidable. Same-day final review round (see Gate record §Final review round): short_term rolling compaction implemented (was a dead tier since plan 07 — watermark P2 pass, live-validated incl. injection), stripChannelNoise strengthened + applied to all 6 free-text/line-parsed pass consumers, same-window rolling replace unblocked, bare-word enum tolerance; rollback (spec's 9th criterion) + riddle-fail branch + away-recap popup + /so-mem + memorize backlog + Talk Control counters all validated LIVE. Post-acceptance hardening 2026-07-07 (Gate record §Post-acceptance hardening): ST-integration alignment (macro seam `registerHostMacro` — MacrosParser underneath, dual-engine; context from `globalThis.SillyTavern`; module trim 11→6; WI one-save disable path; eventTypes constant keys; dead preset code deleted; persistence dedup) + host types vendored in `stHost/hostTypes.ts` (**out-of-tree npm ci+typecheck+build+test green**, member ledger in 00-overview) + persisted-noise migration on hydrate + stabilityLag default 0 + authored `tension_target` drives live steering with calibrated extractor rubric and tiered level-naming hints. Live re-validated: suite re-baseline 22/22, lag-0 window, WI flip, recap popup, macros, scenarios. Harness final: 44 suites/1381 jest, Storybook 18/53, typecheck+lint+build+debug:typecheck green. Auto-tune SKIPPED (user decision).** Update this line when a plan's gate goes green.

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

- Settings panel (`#stepthink_settings`): story import/select, extraction settings, **"Open Studio" button (`#so-open-studio`)** — lives in `src/index.tsx`. Drawer (`#drawer-manager`): tabbed debug surface in `src/components/drawer/DrawerTabs.tsx` (Overview/Blackboard/Memory/Scheduler/**Payload** — last-5 injected prompt blocks captured on `generation_started`); drive tabs live with `so-ui.mts drawer-tab <label>`.
- **Checkpoint Studio v2 (plan 11) lives in `src/studio/`** — `StudioModal` (`#so-studio-modal`, opened from the settings panel) over a zustand draft store (`draft.ts`); all edits go through the typed `mutations.ts` (plan 12's copilot contract). Editors: quality/gate/checkpoint/transition/scope-preview/diagnostics. Every UI part has a `.stories.tsx` (interaction + a11y via `test-storybook:ci`).
- `src/components/studio/` = the 6 reused presentational primitives only (`GraphPanel`, `graphPanelUtils`, `MultiSelect`, `Toolbar`, `FeedbackAlert`, `HelpTooltip`); the rest of v1 was deleted. Do not resurrect deleted v1 editor/context/session code.
