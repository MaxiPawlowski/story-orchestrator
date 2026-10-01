# Plan 14 findings register

One row per finding from the tiered sessions (`14-tiered-testing.md`). Rows start as drafts from
`node scripts/debug/so-session.mts digest <session dir>` (its `findings.md` ends with draft rows); severity
and class are decided in the review, never by the digest.

- **id**: `T<tier>-<n>`, numbered in the order the review accepts them.
- **severity**: blocker | broken | annoying | cosmetic.
- **class**: product | quality | expectation | harness.
- **evidence**: a path under `test/sessions/` with a line (`journal.jsonl:123`, `payloads.jsonl:9`, a flag's line).
- **status**: open | fixing | fixed | deferred (decided in the review) | wont-fix | cosmetic-list.
- **fix commit**: the commit that names the finding id.
- **eval**: the replay fixture, no-LLM scenario or scored eval that now guards it.

| id | tier | severity | class | evidence | status | fix commit | eval |
|---|---|---|---|---|---|---|---|

## Recorded before the sessions (card feasibility check, 2026-09-30)

Found while fixing the cards for the autonomous run; each goes to the review like a session finding. Evidence is source, not a session line, until a card reproduces it.

| what | class (proposed) | evidence | card |
|---|---|---|---|
| A disabled group member still counts as present: the members requirement reads `group.members` and ignores `disabled_members`, so disabling a required member breaks nothing Repair can see. | product | `src/services/stHost/selectors.ts:108` (`listGroupMembers`) via `src/runtime/requirements.ts:11` | T5-4 (removal used instead; the disabled case is recorded there) |
| The mirror-lorebook delete prompt names the deleted chat by its raw chat id, not in player words. | expectation | `src/runtime/mirrorReaperHost.ts:17` | T4-3 |

## T0 fixes: player surfaces (2026-10-01)

Evidence: `test/sessions/T0/` (T0-1-1, T0-2-2, T0-3-1). Each fix has a failing-first test; the recorded T0-2-2 snapshot is read directly by `src/runtime/t0PlayerSurfaces.review.test.ts`.

| # | finding | cause (pre-fix) | fix | test |
|---|---|---|---|---|
| 1 | Overview "Where you are" printed raw enum values ("At aegis_guild_hall.", "At north_road.") | `snapshotBuilder.ts:248` passed the scene tracker's raw `location` value to `narrative.ts:115`; Adolion's `location` enum declares no player words | new optional `player_labels` on enum qualities (validated: keys must be enum values, non-empty text); `playerLocation()` shows the label, else omits an identifier-like value (lowercase, no spaces) and keeps prose | `t0PlayerSurfaces.review.test.ts` §1 (every Adolion location value, label, prose, import refusal, control); Storybook `PlayerOverview` `UnlabelledLocationLeftOut` / `LabelledLocationShown` |
| 1b | `so-ui.mts assert-player-clean` missed it | its needles were fixed words, selectors and attributes only | `rawValueTokens` (checkpoint ids and enum values with `_`/`-`, plus labelled enum values) + `rawValueFindings` (any snake_case token or a declared token as a whole word) over the drawer, HUD and inline texts | `scripts/debug/so-ui.test.mts` "T0 finding 1" |
| 2 | Open threads piled up (8 at the gate, 3 "before sundown"), stale ones stayed ("posting untaken") | player views took `getOpenArcs()` (`snapshotBuilder.ts:107`), the injection list: newest 8 open arcs, deduped only at open time by raw-token Jaccard 0.4 (`arcs.ts:59`) | `playerThreadTexts`: open arcs opened since the current checkpoint was entered (pinned always kept), newest-first near-duplicate drop (content-word overlap >= 0.4 of the shorter), cap 5; Overview, away recap and `/story threads` all read it through the narrative. The prompt injection is unchanged | §2 (recorded T0-2-2 arcs: 40 open -> at most 5, one red-fog thread, nothing from before boundary 36; pinned kept) |
| 3 | Recap story-so-far cut mid-word; recap too long | `excerpt` sliced at 600 chars (`narrative.ts:107`); the recap rendered every section incl. the intro and pending count | `excerpt` ends at the last sentence inside the budget (at least 1/3 of it), else at a word with `…`; the away recap drops `about` and `pending` | §3 |
| 4a | "catching up…" chip stuck ~8+ turns with an empty queue | coalesced reads (d444cd7f) answer two same-key stalls with one read, but `markReconciliation` resolved only the first open event (`extractionCoordinator.ts:136`); `pipeline.ts:116` counted an open event from any checkpoint. Recorded: event `22:reached_walls,first_camp` at `road-to-wendhope`, `resolvedAt: null`, story at `first-night` | a resolving read closes every open event with the same key set (`answered with <id>` evidence); the pipeline only counts open stalls at the active checkpoint | §4 (recorded T0-2-2 extraction state -> idle; control at road-to-wendhope -> stalled), `judgeExtraction.test.ts` "T0 finding 4" |
| 4b | HUD "Current scene" during generated steps | merged beats had no `player_name` (`merge.ts:27`), so `snapshotBuilder.ts:237` fell back | generated beats inherit the replaced stub's `player_name` | `merge.review.test.ts` "T0 finding 4" (+ control) |
| 4c | HUD shows a place, not "The Guild Hall" | by design: the HUD shows `player_name`; `name` is author copy (the inline spoiler property forbids it). Adolion's `player_name`s read as places | not changed in code; authoring note for the campaign | — |
| 5 | Step-back notice always "to match your edit", and fired with no checkpoint change | fixed copy (`narrative.ts:30`); `rollback.ts:141` set the notice on every applied rollback | `RollbackNotice.kind` (`edit`/`delete`/`swipe`, from the TurnBridge mutation kind, `update` = edit) worded per kind, neutral when unknown; notice only when the active checkpoint changed | §5, `rollback.review.test.ts` "T0 finding 5"; Storybook `SteppedBackBySwipe` |
| 6 | Transition chat note blocks swipe/regenerate; generated note prints the objective twice | `/comment` on by default (`settingsModel.ts:159`, `extras.ts:191`); note text `name — objective` (`effectsApplier.ts:201`) and a generated beat's name is its objective | **W11 decided by the T0 sessions: `announceTransitions` defaults OFF** (an install's stored `true` is kept; the inline timeline already shows transitions); `transitionNoteText` = `player_name ?? name` + ` — player_text` when different, never the author objective | §6 |
| 7a | One fact stored six times for the same message across re-reads | `addMemoryEntries` (`stores.ts:20`) deduped only by a covering write range, and overlapping windows are not covered | drop an incoming row whose tier + character + source message + text hash a live row (or an earlier row of the batch) already holds; a row whose source was removed or quarantined does not block | `stores.test.ts` "T0 finding 7" |
| 7b | `party_name` stored as "Ash Lanterns." | `parseSharedReadResponse` kept the quoted string verbatim | a `string` quality value of at most 8 words with no inner sentence punctuation loses one trailing `.`/`,`/`;`/`:`; sentences, ellipses, questions and enums are untouched | `parse.test.ts` "T0 finding 7" |

Not fixed here (other T0 findings): commit-evidence holds (T0-3 HIGH), `[Scene direction: …]` echo (T0-2 HIGH), swipe-to-existing re-commit, stale note on step-back (moot with the note off by default), harness items.

Gates (2026-10-01): `npm run gates -- --no-storybook` all green (typecheck, typecheck:test, lint, test, build, build:dev, test:debug, test:release, test:replay, test:plugin); Storybook built and run on port 6146 (`test-storybook --url http://127.0.0.1:6146 --index-json --maxWorkers 1`): 63 suites, 370 tests passed. Main bundle 1,246,014 B (budget 1,250,000). No live lane or pod run: the live check of these surfaces belongs to the next T0 re-run.
