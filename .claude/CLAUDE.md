# Story Orchestrator

SillyTavern extension running format-2 authored stories as deterministic checkpoint graphs over an active chat.

## Sources of truth (read before implementing)

1. Spec: `docs/plans/v2/story-orchestrator-spec-v2.md`
2. `docs/plans/v2/00-implementation-overview.md` — canonical build rules, gate protocol, verified ST host facts, plan sequence
3. Current plan doc + **Gate records** of all prior plans (tail sections — as-built truth and deviations)

## Status

Status lives in tables, not prose (v2.3 process rule 15). One line per version; open the record before quoting a claim.

| Version | State | Record |
|---|---|---|
| v2 (plans 01–14) | ACCEPTED 2026-07-06; plan 14 (speaker direction) accepted 2026-07-07 | `docs/plans/v2/13-surfacing-polish.md`, `14-speaker-direction.md` Gate records |
| v2.1 (plans 01–08) | automated acceptance green 2026-08-13; human-eval sessions outstanding, so NOT green | `docs/plans/v2.1/08-acceptance.md` Gate record |
| v2.2 (plans 01–08) | automated side green; human eval outstanding | `docs/plans/v2.2/00-overview.md` §Live gate status, `08-acceptance.md` |
| v2.3 (plans 01–11) | FROZEN candidate `569b053` (bundle `1e5c36951d65`) 2026-09-24; NOT accepted: J11 judge floors, L1 human playthrough, L7 (judge-on matrix needs v2.4 X12, fault/cost/stories/human) | `docs/plans/v2.3/11-acceptance.md` §Freeze 2026-09-24 |
| v2.4 (plans 01–09) | on `14402df10a0e`: plan 01 live items all green ×2; plan 02 on master, fixtures + J6/J10 + follow-ups E2–E5 green ×2, downgrade leg NOT built so NOT accepted; plan 03 live gates all green ×2 (`100696d1d4a0`); plans 04 + 05 live green, 07 part 1 live green except the contradiction fix (red, being fixed); 06/07b/08 building | `docs/plans/v2.4/00-overview.md` §Status, `01-carry-in.md` Gate record |

The long status paragraphs this file used to carry are in `docs/plans/v2.3/status-history.md`, kept as history. The v2.3 one was found overstated by the 2026-09-23 audit.

## V2 spine

- Stories declare qualities, checkpoints, typed gates, transitions, roster, effects, requirements.
- `StoryEngine`: blackboard, serialized apply queue drained at boundaries, one transition per boundary, boundary logs, snapshots, rollback.
- Stagecraft (v2.1 plan 07): deterministic presentation effects first (`effects.background`), then background curators that **propose only** — bounded by the story's `stagecraft.lorebooks`, applied at a boundary, never touching the blackboard or memory.
- `RuntimeManager`: ST integration, per-chat persistence in `chat_metadata.story_orchestrator`, effects, macros, slash commands, extraction state, UI snapshots.
- `TurnBridge`: ST events → commits only at rendered reply boundaries; mutations (swipe/edit/delete) → rollback.
- Extraction runs off-path (`ExtractionScheduler` → `runSharedRead`); accepted deltas apply only at the next boundary.

## SillyTavern integration — non-negotiable

- `src/services/STAPI.ts` + `src/services/stHost/*` are the ONLY host import surface (dynamic `import(/* webpackIgnore: true */ …)`). New host access = new `stHost/` module.
- Engine purity: `src/engine/**` never imports STAPI. `EngineHost` is a clock seam (`{ now }`) — host effects run in the runtime layer: `EffectsApplier` (AN/WI/preset/cast/NPC replies) and the `runtime/coordinators/*` (memory injection, WI mirroring, LLM passes), all reachable only through `STAPI`.
- Never trust an assumed ST shape. Verify in ST host source (`C:\dev\SillyTavern-MainBranch\`), `.claude/sillytavern-docs/`, or `node scripts/debug/st-search.mts`. No blind casts — add a debug log + local type instead.
- General ST know-how (source-verified, 2026-09-18) lives in skills: `st-character-authoring` (cards, test characters, wizard card prompts), `st-lorebook-authoring` (WI entries/activation, test lorebooks, curator/wizard WI), `st-scripting` (STscript, Quick Replies, regex scripts, macros), `st-image-generation` (`/sd`, prose-to-prompt, backgrounds, sprites). Reference docs: `.claude/sillytavern-docs/community/ui-dom-selectors.md` (ST DOM + CSS cascade vs our UI) and `community/prompting-memory-prior-art.md` (narrator templates, community memory approaches vs our tiers). Raw community guide dumps with metadata: `docs/tutorials/`.

## Validation before handover — never claim done without gates

| Change touches | Required gates |
|---|---|
| docs only | none |
| pure modules (`engine/`, `extraction/` non-host, `pacing/`) | `npm run typecheck && npm run lint && npm test` |
| build / release tooling / `tsconfig` / `scripts/release` | above + `npm run build` + `npm run test:release` (the build manifest against the bytes it describes) |
| runtime / UI / ST-facing / extraction host paths | above + `npm run build` + live gate via `debug` skill: `st-navigation.mts recent-group` → `so-state.mts current` → change-specific checks or `so-scenario.mts`. **Live gate default = real-LLM browser validation, as an end user**: real generation (`send`/`send_generate`) for chat-path changes; real extraction/expansion/memory passes (Connection Manager profile selected, no `debugResponse`) for any LLM-consuming pipeline touched |

`debugResponse` mocks are for unit determinism and scenario plumbing only — never sufficient for sign-off on LLM-consuming paths. If the real-LLM live gate cannot run (ST down, no backend, no extraction profile), say so explicitly at handover and flag the gate as NOT green — do not fall back to mocks silently.

Report exact commands and results at handover. Failing gate = say so plainly; never hedge or sign off around it.

## UI entry points

- Settings panel (`#story-orchestrator-settings`): **four named entry points (`EntryPoints.tsx`, `#so-entry-points`)** — Start (`#so-new-story-wizard`, `#so-entry-import-toggle` opening `#so-entry-import`), Continue (`#so-entry-continue`, reveals the library select), Repair (`#so-entry-repair` `[data-so="repair-step"]` from `runtime/repair.ts` + `[data-so="repair-reveal"]`/`#so-entry-fix-with-wizard`) and Author (`#so-open-studio`) — then story import/select, extraction settings, Display toggles (transition announcements, HUD), Group chat "Speaker direction" toggle (per-chat `extras.talk.enabled`), **Stagecraft** group (`#so-curator-enabled` off by default, `#so-curator-accept-mode`), **"Open Studio" button (`#so-open-studio`)** and **"New story (wizard)" (`#so-new-story-wizard`)** — lives in `src/index.tsx`. Drawer: **ST top-bar drawer** (`#so-drawer` in `#top-settings-holder`, content `#drawer-manager`, fa-route icon; toggle via ST's `doNavbarIconClick` bound in `stHost/drawers.ts`); tabs in `src/components/drawer/DrawerTabs.tsx` — **player mode (default): Overview (the narrative composition from `PlayerOverview.tsx`) + Memory (established facts, curation only; find + tier filter, `#so-memory-search`/`#so-memory-count`, appear past 50 rows); "Author view" toggle (per-chat `extras.ui`, confirms first) adds Blackboard/Scheduler/Payload, the engine panel, convergence, epistemic/ledger/arc panels, the World Info curator review ring (`StagecraftPanel`, `#so-stagecraft`, in the Scheduler tab), the **next-turn preview** (`#so-next-turn`, `[data-so="next-turn-row"]`, its `previewActions` controls in the Payload tab) and the DriverPanel**. The Overview footer carries **Restart story** (both personas) plus author-only **Edit story** and **Update to v*N*** when the library has moved on; the author-view requirements panel carries **Fix with wizard** (`#so-fix-with-wizard`) whenever a cast member or lorebook is missing. HUD strip (`#so-hud` above the chat input, `HudStrip.tsx`): checkpoint + tension + pending-delta chip + a `#so-hud-pipeline` chip for catching-up / needs-setup / stepped-back (needs-setup opens the settings panel), click opens the drawer. Checkpoint transitions post a compact `/comment` system note at the boundary (opt-out in settings). Drive live: `so-ui.mts open-drawer` / `drawer-tab <label>`.
- **Checkpoint Studio v2 (plan 11) lives in `src/studio/`** — `StudioModal` (`#so-studio-modal`, a native `<dialog>`+`showModal()` portaled to body — top layer, immune to ST's transformed `<html>`; opened from the settings panel **or the drawer's author view "Edit story"**, and mounted once in its own `#so-studio-root` React root) over a zustand draft store (`draft.ts`); all edits go through the typed `mutations.ts` (plan 12's copilot contract). Editors: story/roster/quality/gate/checkpoint/transition/scope-preview/diagnostics. The **Wizard** tab (v2.1 plan 06, tab id still `copilot`) is the setup wizard: **four author-facing steps** (Premise / Turning points / Characters / Setup, `[data-so="wizard-step"]`) over the five unchanged stages, with the stage chips behind `<details data-so="wizard-stage-details">` and `[data-so="wizard-stage"]` as the only reporter of the running stage; staged proposals, an in-protocol interview (`#so-wizard-questions`, "You decide" always proceeds) and **create-only provisioning cards** that make the character cards, story lorebook and group a story requires — reviewed and applied one at a time, never by "Accept all". Saving hands the record back through `onSaved` — the runtime, not the Studio, decides whether this chat takes it (v2.1 plan 05). Every UI part has a `.stories.tsx` (interaction + a11y via `test-storybook:ci`).
- `src/components/studio/` = the 6 reused presentational primitives only (`GraphPanel`, `graphPanelUtils`, `MultiSelect`, `Toolbar`, `FeedbackAlert`, `HelpTooltip`); the rest of v1 was deleted. Do not resurrect deleted v1 editor/context/session code.
