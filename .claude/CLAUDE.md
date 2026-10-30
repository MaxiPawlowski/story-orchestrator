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
| v2.6 (plans 00–15) | FROZEN 2026-10-03 (absorbs v2.5, closed unreleased); remaining work split into v2.7/v2.8/v3.0 | `docs/plans/v2.6/00-overview.md`, `15-final-review-and-autonomous-testing.md`, `15-review.md` |
| v2.7 | WRAPPED 2026-10-09, symbolic (owner: private plugin, one user); NOT accepted, Phase C INCOMPLETE; every built feature on by default, below its floor too; open rows → v2.8 24 | `docs/plans/v2.7/39-test-from-zero.md` §Wrap record 2026-10-14, `src/runtime/settingsModel.ts` |
| v2.8 | CLOSING (v2.9 13 close-out, 2026-10-25): lean suite on G/H/I; 45 seal PASS (13 C2), GS6.8 promise row = model miss (13 C3), T8 4/4 (13 C4); 42 W4 FAIL → v3.0; 55-59 → v3.0 | `docs/plans/v2.8/70-final-suite.md`, `docs/plans/v2.9/13-close-out.md` |
| v2.9 | CLOSING (plan 13, 2026-10-25): 06 LT F1/F2/F3/F5 pass, F4 miss; C6/C7/C9/C10 done; C8 suite:nomodel 188/188 green once (second run at freeze); owed: owner playtest (C1, 08 O4), image journey rerun, A02 x2 + J6 on GPU, freeze; NOT accepted | `docs/plans/v2.9/13-close-out.md` §Status, `00-overview.md` §Close-out split |
| v3.0 | IN BUILD 2026-10-30: 09 RAM member cache LIVE; 10 (A2), 27, 28 built on branches, unmerged until the GPU window; 29 UI rework in build (owner decisions 2026-10-30); harvest fixes + plans 30+ in the extensions session; GPU queue W0-W4 waits for the owner's "resume" | `docs/plans/v3.0/00-overview.md`, `gpu-queue-2026-10-30.md`, `29-ui-rework.md` |

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

Rule (owner 2026-10-18): in chat = glance or act mid-turn, or needs the chat/input visible; workspace = configure,
library, setup/repair, author/inspect, long reference. A dialog control that targets in-chat UI closes the dialog first
(`SettingsHost.openPanel`, `workspaceNavigation.close()`); feedback from an action inside a dialog renders inside it
(`components/ActionStatus.tsx`), never as a toast behind it.

- **Launchers**: top-bar route icon `#so-drawer .drawer-toggle` (a launcher, not a drawer) and the wand's
  `#so-wand-drawer` open the story window on This story → Play; Extensions settings holds `#so-open-workspace` (Orchestrator)
  and `#so-open-setup` (Play at `#so-setup`). Routes live in `runtime/workspaceRoutes.ts` and `runtime/drawerTab.ts` `storyPageFor`.
- **Workspace** `#so-workspace-modal` (lazy native dialog, `components/workspace/`): Story → Play, Features, Review,
  Author; Orchestrator → Library, Defaults, Connections, Interface, Help. `workspaceNavigation.open({context,page,feature,control})`
  owns deep links; Back traverses details before closing. Feature controls are `#so-feature-<id>-<field>` (Story = chat
  overrides, Defaults = install, authored policies in Studio); device display/motion rows in Interface.
  - **Play** (player-safe): Setup `#so-setup`, `PlayerOverview` (`#so-player-overview`, Open story settings → Connections),
    Your character `#so-your-character`, Save this run `#so-living-save`, Beside the chat `#so-chat-side` (labelled
    launchers that close the workspace), Illustrations `#so-image-chat` (pause automatic images in this chat), memory
    `#so-open-memory` (Exclude has an inline Undo `#so-memory-undo`), Restart / Story briefing / Flag (`#so-flag-status`).
  - **Author** (Author view only; nothing the Play page shows): Recent activity, `DrawerTabs` in `#drawer-manager` (Overview
    `#so-author-overview` with engine, requirements, history floor, `#so-author-story-controls`: New story / Edit story / Update to the latest;
    Blackboard, Memory (author), Scheduler, Payload, DriverPanel), Illustrate prepared cast `#so-cast-scene`. An author chip
    under a message opens this page with `#so-inspector` on top (`inspectorIntent`).
  - **Library** (`SettingsPanel` `workspaceSection="library"`): entry points `#so-entry-points` — Start (`#so-new-story-wizard`,
    import `#so-entry-import-toggle`/`#so-entry-import`), Continue (`#so-entry-continue`, Continue list closes the workspace
    before switching chat), Repair (`#so-entry-repair`, `[data-so="repair-step"]`, `#so-entry-fix-with-wizard`), Author (`#so-open-studio`); story select.
  - **Help**: guide, tours, **Help and Ask** (`#so-help-open-panel`) and the guide reader (`#so-help-open-guide`) open as floating panels.
- **HUD** `#so-hud` above the chat input (`HudStrip.tsx`): scene, tension, `#so-hud-turn`, pending chip, `#so-hud-pipeline`,
  `#so-hud-setup` (opens Play at `#so-setup`). The scene button `#so-hud-main` opens the **story card** `#so-hud-card`
  (lazy `HudCard.tsx`, anchored above the HUD, never over the input): scene, status line, journal / What could I do? when
  shown, memory peek (`memoryShown` only), **More…** (Play). Escape, close or an outside click closes it.
- **Floating panels** `#so-panels-root` (`presenceUi.tsx`, `PanelFrame`): Help and Ask, guide reader, journal, stat sheet,
  story panels, What could I do?. Under 768px a panel docks above `#form_sheld` (`dockInset`) and only the last-opened one shows (`shownPanels`).
- **Inline timeline**: chips under each message (`#so-inline-<mesid>` hosts from `stHost/inlineMount.ts`, `components/inline/`), level `#so-inline-level` 0 Off / 1 Story (default) / 2 Behind the scenes / 3 Author / 4 Raw (3–4 need Author view); author chip opens `#so-inspector` on the Author page. The `/comment` transition note is opt-in (`#so-announce-transitions`, default off).
- **Start pane** `#so-briefing` (Before you start + identity + briefing).
- **Checkpoint Studio** (`src/studio/`): `StudioModal` (`#so-studio-modal`, native `<dialog>` in its own `#so-studio-root`), zustand draft (`draft.ts`), all edits through typed `mutations.ts`. The **Wizard** tab (tab id `copilot`): four author steps (`[data-so="wizard-step"]`) over five stages, interview (`#so-wizard-questions`), create-only provisioning cards applied one at a time; modes **Ask** (`#so-studio-ask`) and **Build a character** (`#so-character-tutorial`). "How to write this" disclosure `#so-studio-guide`. Editors are grouped into Story setup, Flow, State and rules, Characters, World, Presentation, Story features, Assistant and Validation; mobile graph sheets and checkpoint/transition drill-down keep editing enabled. Its gate replay jump closes the Studio before scrolling the chat. Saving hands the record back via `onSaved`; the runtime decides whether this chat takes it. Every UI part has a `.stories.tsx` (`test-storybook:ci`).
- **Ask**: Help panel `#so-help-ask`, Studio Ask, `/story ask <question>`; switch `copilot.ask` (`#so-copilot-ask`). Debug: `globalThis.storyOrchestratorAsk.ask(question, persona?)`; live Q&A `node scripts/debug/so-ask-qa.mts run --group <name>`.
- `src/components/studio/` = shared presentational primitives (`GraphPanel`, `MultiSelect`, `Toolbar`, `FeedbackAlert`, `HelpTooltip`, `AskBox`). Do not resurrect the deleted pre-Studio editor/context/session code.
