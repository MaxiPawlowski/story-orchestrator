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
  `#so-wand-drawer` reopen the last workspace page this device had open (`runtime/lastPage.ts`, key `so-workspace-last-page`,
  `workspaceRoutes.ts` `resumeIntent`: Play when nothing is stored or the page is author-only in player view; deep links still win); Extensions settings holds `#so-open-workspace` (Settings)
  and `#so-open-setup` (Play at `#so-setup`). Routes live in `runtime/workspaceRoutes.ts` and `runtime/drawerTab.ts` `storyPageFor`.
- **Workspace** `#so-workspace-modal` (lazy native dialog, kit `Dialog` translucent + blur, `components/workspace/`): contexts
  **This chat** (`story`: Play, Settings = page `features`; Review, Author only in Author view) and **Settings** (`orchestrator`: Library,
  Features, Models, Judge, Images & stage (sub-pages `picture-types`, `model-sources`), World & lore, Display, Authoring, Diagnostics,
  Help), switch `#so-workspace-context-story|orchestrator`, left `NavList` `#so-workspace-nav` (`#so-workspace-page-<id>`), global
  search `#so-settings-search` (lazy `features/settingsIndex.ts`, jumps + highlights). Pages/labels in `runtime/workspaceRoutes.ts`
  (`settingIntent`/`settingsLocationOf` = one home per control). `workspaceNavigation.open({context,page,sub,feature,control})` owns
  deep links; Back traverses details before closing; under 700px Settings is master/detail (`data-view="list|page"`, one back
  `#so-workspace-back`). Features use the shared `components/ui/FeatureList.tsx` (`[data-so="feature-row"][data-feature]`, inline
  switch, `#so-feature-<id>-toggle` expands in place, scope install/story/chat; judge uses are a link to Judge, the one home);
  install values of illustrations/sprites/poses live on Images & stage. Device overrides are a **This device** chip on the row
  (`#so-device-<path-slug>`, Display and Images & stage).
  - **This chat → Story settings** (`ChatSettingsPage`): story for this chat `#story-library-select` + restart/export, group default
    `#so-group-story-select`, per-chat FeatureList, Author view switch `#so-author-view-switch`.
  - **Play** (player-safe, lazy `workspace/PlayPage.tsx`): scene header `#so-player-overview` (`#so-scene-header`, status
    `#so-pipeline-status` = `pipeline.ts` `statusSentence`, shared with the story card; image quick row `#so-image-quick` only when
    images are on), attention banner `#so-setup` (one line `#so-setup-toggle`, rows `[data-so=setup-row]` hidden until opened,
    blocks open; install-scope rows go to Settings via `repair.ts` `playFindings`; Hide `[data-so=setup-dismiss]` + Undo
    `[data-so=setup-undo]`), You card `#so-your-character`, tabs `#so-story-tabs` (`#so-story-tab-now|journal|here|people|stats|widget-<id>`,
    Memory tab `#so-open-memory`; sheet bodies via `sheet/SheetTabBody.tsx`; pop-out `[data-so=play-pop]` ids `#so-open-journal|stat-sheet|widgets`,
    Now tab `#so-open-suggestions`, `#so-living-save`), footer Story briefing `#so-story-briefing` / Flag `#so-flag-moment` / Restart
    `#so-play-restart` → native confirm `#so-restart-confirm`. Deep-link controls pick the tab (`playTabFor`). Per-chat image prefs
    `#so-image-chat` live on Settings → Images & stage.
  - **Author** (Author view only; nothing the Play page shows): run console `DrawerTabs` in `#drawer-manager`
    (`components/drawer/`, `runtime/authorConsole.ts`): sticky Steer column `[data-so="steer"]` (DriverPanel: checkpoint,
    boundary, pipeline, readable unmet gates, Suggest/Probe/Report, Advance, Nudge, `#so-author-story-controls`) and section tabs
    `role=tab` with `data-so-tab` on each body: health (`#so-author-overview`), state (grouped searchable table), memory
    (who-knows-what `#so-who-knows` + kept-out-on-stage alert), prompt, proposals (count badge; Review page opens it),
    activity (`#so-open-activity`), pipeline. `so-ui.mts drawer-tab` aliases Overview/Blackboard/Payload/Scheduler/Review.
    Illustrate prepared cast `#so-cast-scene` below.
  - **Library** (`SettingsPanel` `page="library"`): entry points `#so-entry-points` — Start (`#so-new-story-wizard`,
    import `#so-entry-import-toggle`/`#so-entry-import`), Continue (`#so-entry-continue`, Continue list closes the workspace
    before switching chat), Repair (`#so-entry-repair`, `[data-so="repair-step"]`, `#so-entry-fix-with-wizard`), Author (`#so-open-studio`).
  - **Help**: guide, tours, **Help and Ask** (`#so-help-open-panel`) and the guide reader (`#so-help-open-guide`) open as floating panels.
- **HUD** `#so-hud` above the chat input (`HudStrip.tsx`, font follows `--mainFontSize`): left the scene button `#so-hud-main`
  (headline + tension dots `[data-so=hud-tension]`), right `#so-hud-turn`, at most one status chip (`#so-hud-pipeline`, `data-waiting-on`
  when a read waits on the inner beat; retryable states open the card) or `#so-hud-setup` (Play at `#so-setup`), pending chip, sheet
  button `#so-hud-sheet`. The scene opens the **story card** `#so-hud-card` (lazy `HudCard.tsx`, anchored left above the HUD): status
  with `#so-hud-card-retry` / `#so-hud-card-settings`, notices, `[data-so=hud-card-tab][data-tab]` (aliases `#so-hud-card-journal|suggestions|memory`),
  Story window `#so-hud-card-more`, Author view only the notes level `#so-hud-card-level`. Escape, close or an outside click closes it.
- **Story sheet** `#so-sheet` (lazy `components/sheet/StorySheet.tsx` in `#so-panels-root`, state in `presenceUi.tsx` `openSheet`): tabs
  `[data-so=sheet-tab][data-tab=journal|here|people|stats|widget-<id>|ideas|memory]` from `runtime/storySheet.ts` `sheetTabs`, panel
  `#so-sheet-<tab>`; bodies `components/sheet/tabs/*` (shared with Play). Docks right of `#sheld` (`data-mode=dock`, width remembered,
  pop-out `[data-so=sheet-pop]` → `#so-panel-sheet`); under 768px a bottom sheet above `#form_sheld` (`data-snap` peek/half/full, half
  capped to keep the last reply visible). Launchers (`#so-open-*`, card tabs, `#so-wand-sheet`) all call `openSheet(tab)`.
- **Floating panels** `#so-panels-root` (`PanelFrame`): Help and Ask (`#so-wand-help`), the guide reader and, in Author view, the message
  inspector `inspector` (`#so-inspector`: ‹ › stepping, What changed / Why / Prompt / Health, raw at level 4; opened by Inspect under a message). Under 768px a panel docks
  above `#form_sheld` and opening it closes the sheet (and the other way round).
- **Inline timeline**: one quiet line of words under each message (`[data-so=inline-line]`, parts `[data-so=inline-part][data-category]`, click expands `[data-so=inline-expanded]`; hosts `#so-inline-<mesid>` from `stHost/inlineMount.ts`, `components/inline/`), level `#so-inline-level` 0 Off / 1 Story (default) / 2 Behind the scenes / 3 Author / 4 Raw (3–4 need Author view; legend `#so-inline-legend` beside it and in Help); the Inspect link opens `#so-inspector` on the Author page. The `/comment` transition note is opt-in (`#so-announce-transitions`, default off).
- **Start pane** `#so-briefing` (opaque, sticky footer; Before you start, briefing, then identity: `[data-so=player-setup-mode]`
  keep/pick/create, and the story's start button `#so-briefing-start` commits that choice; the close button `[data-so=briefing-close]` skips).
- **Checkpoint Studio** (`src/studio/`): `StudioModal` (`#so-studio-modal`, native `<dialog>` in its own `#so-studio-root`), zustand draft (`draft.ts`), all edits through typed `mutations.ts`. Left sidebar (`studio/studioNav.ts`, `components/StudioNav.tsx`): `role=tab` links `#so-studio-tab-<tab>` grouped Story · Flow · State · Characters (Roster overview + one `#so-studio-tab-character-<id>` per member + Sprites) · World · Presentation · Story features · Wizard · Diagnostics (count); under 1000px the section select `#so-studio-section` + back `#so-studio-back`; `so-ui.mts studio-tab` takes the old labels as aliases. Header: title input (`aria-label="Story title"`), issues `#so-studio-issues` (→ Diagnostics), `#so-studio-undo|redo`, "How to write this" menu `#so-studio-guide` (topics open the guide reader), Save `#so-studio-save`, overflow `#so-studio-more` (`#so-studio-save-as|export|import|mermaid|reset`). Graph page = graph + checkpoint/transition editor side by side ≥1000px, half/full sheet below. Checkpoint editor: sticky section index (`data-so-section`), Add effect list, Offers rows (`OffersEditor`, JSON escape). Diagnostics rows carry Go to (`studio/diagnosticTarget.ts`). The **Wizard** page (tab id `copilot`): mode segmented `[data-so="wizard-mode"]`, numbered steps `[data-so="wizard-step"]` over five stages, interview (`#so-wizard-questions`), create-only provisioning cards applied one at a time; modes **Ask** (`#so-studio-ask`) and **Build a character** (`#so-character-tutorial`). Its gate replay jump closes the Studio before scrolling the chat. Saving hands the record back via `onSaved`; the runtime decides whether this chat takes it. Every UI part has a `.stories.tsx` (`test-storybook:ci`).
- **Ask**: Help panel `#so-help-ask`, Studio Ask, `/story ask <question>`; switch `copilot.ask` (`#so-copilot-ask`). Debug: `globalThis.storyOrchestratorAsk.ask(question, persona?)`; live Q&A `node scripts/debug/so-ask-qa.mts run --group <name>`.
- `src/components/studio/` and the kit `src/components/ui/` = shared presentational primitives the Studio may import (`GraphPanel`, `MultiSelect`, `FeedbackAlert`, `HelpTooltip`, `AskBox`). Do not resurrect the deleted pre-Studio editor/context/session code.
