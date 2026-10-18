@../AGENTS.md

# Story Orchestrator

SillyTavern extension running authored stories as deterministic checkpoint graphs over an active group chat.

## Sources of truth (read before implementing)

1. Spec: `docs/plans/v2/story-orchestrator-spec-v2.md`
2. `docs/plans/v2/00-implementation-overview.md` — canonical build rules, gate protocol, verified ST host facts
3. Author's guide: `docs/authoring/story-guide.md` (compact twin `src/copilot/guideTopics.ts`, drift-tested; the wizard reads it via `readGuide`; `npm run docs:guide` regenerates `docs/guide/author/`)
4. Current plan doc + **Gate records** of prior plans (tail sections — as-built truth and deviations)

## Status

Status lives in tables, not prose (v2.3 process rule 15). One line per version; open the record before quoting a claim.

| Version | State | Record |
|---|---|---|
| v2 (plans 01–14) | ACCEPTED 2026-07-06; plan 14 (speaker direction) 2026-07-07 | `docs/plans/v2/13-surfacing-polish.md`, `14-speaker-direction.md` Gate records |
| v2.1 (plans 01–08) | automated acceptance green 2026-08-13; human eval outstanding, so NOT green | `docs/plans/v2.1/08-acceptance.md` Gate record |
| v2.2 (plans 01–08) | automated side green; human eval outstanding | `docs/plans/v2.2/00-overview.md` §Live gate status, `08-acceptance.md` |
| v2.3 (plans 01–11) | FROZEN candidate `569b053` 2026-09-24; NOT accepted (J11 judge floors, L1 human playthrough, L7) | `docs/plans/v2.3/11-acceptance.md` §Freeze 2026-09-24 |
| v2.4 (plans 01–09) | plans 01–08 live green ×2 (06 F5 `create` not built; 08 calibration below floor); 09 on FROZEN `4ebe1db`: PARTIAL, not accepted; post-freeze fixes 13/14 rows green ×2 on `e7626d7` | `docs/plans/v2.4/00-overview.md` §Status, `09-acceptance.md` §Gate record, `docs/release/2.4.0/attestation.json` |
| v2.6 (plans 00–15) | FROZEN 2026-10-03 (absorbs v2.5, closed unreleased); remaining work split into v2.7/v2.8/v2.9 | `docs/plans/v2.6/00-overview.md`, `15-final-review-and-autonomous-testing.md`, `15-review.md` |
| v2.7 | WRAPPED 2026-10-09, symbolic (owner: private plugin, one user); NOT accepted, Phase C INCOMPLETE; every built feature on by default, below its floor too; open rows → v2.8 24 | `docs/plans/v2.7/39-test-from-zero.md` §Wrap record 2026-10-14, `src/runtime/settingsModel.ts` |
| v2.8 | IN BUILD (2026-10-14): build-now pass merged, full gates green on `6642dc50`; harness auth + review fixes on branches; model/GPU/laptop acceptance deferred; 12/13/15/21 stay (owner 2026-10-14) | `docs/plans/v2.8/32-queue.md`, `00-overview.md` §Status, `40-build-now-no-gpu.md`, `24-test-plan.md` |

Older status paragraphs: `docs/plans/v2.3/status-history.md` (history only).

## Engine spine

- Stories declare qualities, checkpoints, typed gates, transitions, roster, effects, requirements.
- `StoryEngine`: blackboard, serialized apply queue drained at boundaries, one transition per boundary, boundary logs, snapshots, rollback.
- Stagecraft: deterministic presentation effects first (`effects.background`), then background curators that **propose only** — bounded by the story's `stagecraft.lorebooks`, applied at a boundary, never touching the blackboard or memory.
- `RuntimeManager`: ST integration, per-chat persistence in `chat_metadata.story_orchestrator`, effects, macros, slash commands, extraction state, UI snapshots.
- `TurnBridge`: ST events → commits only at rendered reply boundaries; mutations (swipe/edit/delete) → rollback.
- Extraction runs off-path (`ExtractionScheduler` → `runSharedRead`); accepted deltas apply only at the next boundary.
- Module map and invariants: `.claude/rules/architecture.md`.

## SillyTavern integration — non-negotiable

- `src/services/STAPI.ts` + `src/services/stHost/*` are the ONLY host import surface (dynamic `import(/* webpackIgnore: true */ …)`). New host access = new `stHost/` module.
- Engine purity: `src/engine/**` never imports STAPI. Host effects run in the runtime layer (`EffectsApplier`, `runtime/coordinators/*`), reachable only through `STAPI`.
- Never trust an assumed ST shape. Verify in ST host source (`C:\dev\SillyTavern-MainBranch\`), `.claude/sillytavern-docs/`, or `node scripts/debug/st-search.mts`. No blind casts — add a debug log + local type instead.
- ST know-how lives in skills: `st-character-authoring`, `st-lorebook-authoring`, `st-scripting`, `st-image-generation`. Reference docs: `.claude/sillytavern-docs/community/ui-dom-selectors.md`, `.claude/sillytavern-docs/community/prompting-memory-prior-art.md`; raw community guide dumps: `docs/tutorials/`.

## Validation before handover — never claim done without gates

| Change touches | Required gates |
|---|---|
| docs only | none |
| pure modules (`engine/`, `extraction/` non-host, `pacing/`) | `npm run typecheck && npm run lint && npm test` (+ `npm run typecheck:test` when a test changed) |
| build / release tooling / `tsconfig` / `scripts/release` | above + `npm run build` + `npm run test:release` |
| runtime / UI / ST-facing / extraction host paths | above + `npm run build` + live gate via `debug` skill: `st-navigation.mts recent-group` → `so-state.mts current` → change-specific checks or `so-scenario.mts`. **Live gate default = real-LLM browser validation, as an end user**: real generation (`send_generate`) for chat-path changes; real LLM passes (profile selected, no `debugResponse`) for any LLM-consuming pipeline touched |

Per change: `npm run gates:quick` (changed files only). Every plan closes with `npm run gates` (one command; `-- --no-storybook` skips Storybook and the record must say so); plans and releases never close on `gates:quick`. Real-LLM regression runs are batched into one final suite; per-change gates use the deterministic tiers + no-LLM scenarios, and measurements run when a build decision needs them. Adolion runs start from `adolion-fresh`.

`debugResponse` mocks are for unit determinism and scenario plumbing only — never sufficient for sign-off on LLM-consuming paths. If the real-LLM live gate cannot run (ST down, no backend, no profile), say so explicitly and flag the gate NOT green — never fall back to mocks silently.

Report exact commands and results at handover. Failing gate = say so plainly.

## UI entry points

Current workspace routing: Extensions launcher `#so-open-workspace` and navbar drawer open lazy native dialog
`#so-workspace-modal`. Story: Play, Features, Review, Author; Orchestrator: Library, Defaults, Connections,
Interface, Help. `workspaceNavigation.open({context,page,feature,control})` owns deep links. Feature controls are
`#so-feature-<id>-<field>`; changes in Story are chat overrides. Install defaults live in Defaults, authored
policies in Studio. Device display/motion rows live in Interface. Browser Back traverses details before closing.
The panels below are reused inside the workspace; the old Extensions settings body is replaced by its launcher.
Studio groups its editors into Story setup, Flow, State and rules, Characters, World, Presentation,
Story features, Assistant and Validation. Mobile graph sheets and checkpoint/transition drill-down keep editing enabled.

- **Settings panel** (`#story-orchestrator-settings`): four entry points in `components/settings/EntryPoints.tsx` (`#so-entry-points`) — Start (`#so-new-story-wizard`, import `#so-entry-import-toggle`/`#so-entry-import`), Continue (`#so-entry-continue`), Repair (`#so-entry-repair`, `[data-so="repair-step"]`, `#so-entry-fix-with-wizard`), Author (`#so-open-studio`); then story select, extraction, display toggles, speaker direction, Stagecraft (`#so-curator-enabled` on by default, `#so-curator-accept-mode` default `review`).
- **Drawer**: ST top-bar drawer `#so-drawer` (content `#drawer-manager`, toggled via `stHost/drawers.ts`); tabs in `components/drawer/DrawerTabs.tsx`. Player mode: Overview (`PlayerOverview.tsx`, `#so-setup`) + Memory (`#so-memory-search`). "Author view" (per-chat `extras.ui`, confirms first) adds Blackboard/Scheduler/Payload, engine panels, curator review (`#so-stagecraft`), next-turn preview (`#so-next-turn`), DriverPanel, "Fix with wizard" (`#so-fix-with-wizard`). Overview footer: Restart story; author-only Edit story / Update to the latest.
- **HUD** `#so-hud` above the chat input (`HudStrip.tsx`): checkpoint, tension, pending-delta chip, `#so-hud-pipeline`, `#so-hud-setup` count chip.
- **Inline timeline**: chips under each message (`#so-inline-<mesid>` hosts from `stHost/inlineMount.ts`, `components/inline/`), level `#so-inline-level` 0 Off / 1 Story (default) / 2 Behind the scenes / 3 Author / 4 Raw (3–4 need Author view); author chip opens `#so-inspector`. The `/comment` transition note is opt-in (`#so-announce-transitions`, default off).
- **Start pane** `#so-briefing` (Before you start + identity + briefing).
- **Checkpoint Studio** (`src/studio/`): `StudioModal` (`#so-studio-modal`, native `<dialog>` in its own `#so-studio-root`), zustand draft (`draft.ts`), all edits through typed `mutations.ts`. The **Wizard** tab (tab id `copilot`): four author steps (`[data-so="wizard-step"]`) over five stages, interview (`#so-wizard-questions`), create-only provisioning cards applied one at a time; modes **Ask** (`#so-studio-ask`) and **Build a character** (`#so-character-tutorial`). "How to write this" disclosure `#so-studio-guide`. Saving hands the record back via `onSaved`; the runtime decides whether this chat takes it. Every UI part has a `.stories.tsx` (`test-storybook:ci`).
- **Ask**: Help panel `#so-help-ask`, Studio Ask, `/story ask <question>`; switch `copilot.ask` (`#so-copilot-ask`). Debug: `globalThis.storyOrchestratorAsk.ask(question, persona?)`; live Q&A `node scripts/debug/so-ask-qa.mts run --group <name>`.
- `src/components/studio/` = shared presentational primitives (`GraphPanel`, `MultiSelect`, `Toolbar`, `FeedbackAlert`, `HelpTooltip`, `AskBox`). Do not resurrect the deleted pre-Studio editor/context/session code.
