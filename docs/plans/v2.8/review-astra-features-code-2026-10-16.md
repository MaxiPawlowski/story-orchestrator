# Merged feature code review — 2026-10-16

Reviewed at `4e151382b388c0bfd22e99da59fd1a9626251e31`. Scope: `db9bcbec`, `6eb51188` (48/49),
`6d09ce0a`, `734b34bf`, `de61d185` (18 Q7/65/68), and the Workspace change in `ffd2ec08`.
Read the repository instructions, architecture/privacy invariants, plan 52 SC1–SC4, scoped designs and gate records.
No P0 found. Two P1 and two P2 findings follow. Examples are synthetic; no campaign or credential files were read.

**Addressed 2026-10-16** on `v2.8-features-review-fixes` (not merged): P1 frozen scene text `99931d7d`; P1 cold living
rollback `d03b37ca`; P2 compaction `13faf622`; P2 one-character names `23af055d`. Each has a regression test red on the
old code; records in plan 48 and 49 gate record addenda.

## Findings

### P1 — Frozen scene text bypasses subsequent privacy filtering

- **Location:** `src/runtime/coordinators/livingCoordinator.ts:236`; consumer
  `src/runtime/livingUnit.ts:49`; rendering `src/generation/living/sceneTest.ts:105`.
- **Failure:** At the first plan, an open thread passes the resting filter and is frozen into `focus` and/or
  `expected.thread`. A later knowledge read establishes that the thread contains a held secret; alternatively,
  an authored disclosure update makes a named entity unknown. Regenerate or retry the same frontier. The coordinator
  returns the frozen record before the current unknown-name check, and `directorInput` sends its text verbatim.
  The ordinary `openThreads` can now be empty while the scene-signal line still contains the forbidden text.
  This violates the director's resting-view contract even if a later output guard rejects the generated draft.
- **Evidence:** An in-memory probe of the production `focusCandidates`, `sceneSignal` and `sceneSignalLine` functions
  returned `{currentSafeCandidates:0, signalStillContainsSecret:true}` after changing the resting filter.
  The retry path does not call `inputs.scrub` on the record. Both altered and interrupt signals carry the expected thread.
- **Fix:** Keep the original draw and focus selection immutable, but validate their text against current resting and
  disclosure projections before every model request. If a frozen reference is no longer safe, withhold that signal or
  abstain from the proposal; do not select a new focus or reroll. Test a late held-secret read and a disclosure change
  between the first plan and regenerate, inspecting the actual assembled director prompt.
- **Coverage gap:** The C4 test in `src/runtime/coordinators/livingSceneTest.review.test.ts:335` uses a fixed synthetic
  resting filter and a supplied unknown-name list. S3 deliberately changes arcs but never changes their privacy.
  Neither exercises privacy becoming stricter after freezing.

### P1 — A cold living rollback can mutate the next chat after its import resolves

- **Location:** `src/runtime/livingPort.ts:73`; new scene-record write at
  `src/runtime/coordinators/livingCoordinator.ts:428`; rollback caller `src/runtime/rollback.ts:157`.
- **Failure:** Reopen chat A with persisted scene records while the living chunk is still loading. Swipe a planning
  reply: `movedAfter` now detects scene-only movement, and `restoreAfterRollback(A_boundary)` queues a callback without
  a `RunOwnership`. Switch to chat B before the import completes. The callback uses accessors for B and applies A's
  boundary to B, dropping B's scene records and withdrawing B's waiting proposals. The caller's later ownership checks
  do not protect this detached callback. This is an existing lazy-restore weakness reached by the newly added scene state.
- **Evidence:** A delayed-import probe used the real `LivingPort` and `LivingCoordinator`, started rollback at boundary 2
  in A, switched the accessor to B, then resolved the import. Both chats initially had one scene record at boundary 10.
  Output: `{ARecords:1, BRecords:0, ownershipChecks:0}`.
- **Fix:** Mint ownership before starting the lazy load; check it after loading and before each restore write. Make
  restoration awaitable so rollback finishes restoring living state before rebuilding injections and persisting.
  Carry the original ownership through the coordinator; minting a fresh token after the import would authorize B.
  Add a delayed-import, chat-switch test and a same-chat cold-restore test that checks persistence ordering.

### P2 — History compaction permits a live frontier to reroll and forgets interrupt spacing

- **Location:** `src/runtime/coordinators/livingCoordinator.ts:416`;
  `src/generation/living/sceneTest.ts:132` and `src/generation/living/sceneTest.ts:77`.
- **Failure:** A frontier gets a scene record, but its proposed continuation remains pending, rejected or repeatedly
  fails while play continues. Once its planning boundary falls below the engine's 200-snapshot floor, `compact()`
  deletes the record although the frontier can still be planned or regenerated. The next call finds no frozen record
  and draws with the current boundary, tension and arcs. No rollback occurred. Separately, deleting the previous
  interrupt because it is old in boundaries loses spacing history even when fewer than `min_gap` frontiers intervened.
- **Evidence:** Production pure-function probe, same chat/story/frontier and peak tension: boundary 1 drew `expected`;
  retaining at floor 3 removed that record; replanning at boundary 202 drew `altered`. The coordinator uses exactly this
  retention predicate followed by the missing-record planning path. `engine.ts:522` bounds snapshots by count, whereas
  `spacedOutcome` measures the last frontiers, not elapsed boundaries.
- **Fix:** Retain records for any frontier that can still be regenerated/retried, independently of the rollback floor.
  Preserve the minimal previous-frontier spacing state across compaction as well. Remove a record only when it is
  unnecessary for both future planning and rollback. Test more than 200 boundaries on one unresolved frontier and
  widely spaced frontiers with `min_gap:2`.
- **Coverage gap:** S1's coordinator harness runs 14 steps; S12 tests spacing without applying production compaction.
  Neither can expose this retention interaction. The plan's recorded retention deviation does not satisfy its no-reroll
  or frontier-spacing promises.

### P2 — One-character undisclosed names are explicitly exempted from focus filtering

- **Location:** `src/pacing/focus.ts:18`; allowed input at `src/engine/validate/codex.ts:15`.
- **Failure:** An undisclosed person or alias is named `Q`, a valid nonempty authored name. An open arc says
  `Q waits at the gate`. `unknownEntityNames` can correctly supply `Q`, but `namesAny` discards every name of length one.
  The arc survives and can become the interrupt focus or the altered signal's expected thread, despite SC3.
- **Evidence:** Calling production `focusCandidates({arcs:["Q waits at the gate"], unknownNames:["Q"]})` returned
  that arc. The codex validator imposes a maximum length and nonempty text, not a two-character minimum.
- **Fix:** Match every nonempty declared name/alias using the existing Unicode word boundaries. If one-character names
  need different product semantics, enforce those explicitly at authoring rather than silently bypassing disclosure.
  Add both a whole-token forbidden case and a control showing `Q` does not suppress an unrelated longer word.

## Checked and found fine

- **48/49 ordinary deterministic behavior:** Draws use chat, story, frontier and planning boundary; no wall-clock or
  `Math.random` draw. Existing records survive normal retry/regenerate and `sanitizeLivingState` reload. Expected outcomes
  omit the new signal, preserving the prompt golden. Altered drafts must name exactly one allowed change; interrupts
  must name an existing thread. Scene-only movement participates in rollback through `LivingPort.movedAfter`, without
  inventing a compiled code key. The compaction and cold-load exceptions are above.
- **Author-only scene surfaces:** Inline scene items are level 3; player levels remain capped. The player living slice
  excludes the author view, and draw records are non-narrated. Focus selection is read-only and writes no epistemic rows,
  blackboard qualities or memory. Plan 49's broader complication feature is still deferred.
- **18 Q7 audience and visibility:** The private source returns sheet lines only for roster members with
  `view:"omniscient"`. `narrate:false` and nonpublic qualities are excluded; quest/milestone rows use recorded boundary
  effects and visibility, with secret milestones excluded. The final private-source block passes through
  `withoutSecretLines`. Quiet/impersonate withholding uses the existing private-block lifecycle. No additional leak
  was established in this path. The outcome header now prohibits unlisted consequences; model compliance is still owed.
- **65 member disclosure:** Present roster membership is intersected with `knownEntities`; unknown members contribute
  no name, portrait, initials or link, and narrator members are excluded. Player scene projection comes from player-audience
  widgets. Time requires the option and a story clock. Adding an authored scene widget is sufficient for the game layer.
  Presence remains enabled-minus-away, the documented v1 limitation. Location reuses the existing Overview projection;
  the scene-card tests establish member safety, not an independent held-secret proof for every upstream location value.
- **68 revision binding:** Hand-backs distinguish player from silence, capture the reply revision before the asynchronous
  decision, and require ownership before recording its result. The chip requires matching checkpoint, message index,
  content hash and swipe id; generation, a new player line, edit, swipe or deletion suppresses it. The player tooltip
  excludes the decision source. Toggling the display setting does not change decision recording.
- **Workspace fix:** `useCallback(...,[manager])` removes the request-identity/render feedback loop with the stable
  runtime manager. `askSuggestions` rejects stale model answers, and `fillSuggestion` rechecks chat/run ownership and
  input-box state before filling. No additional defect established in the scoped callback change.
- **Async review:** The narrator chunk-load callback recomputes the current injection rather than writing captured
  old story data. Living model results check ownership and graph epoch before recording. The concrete unowned
  lazy rollback remains a finding above; these checks are not a claim that every pre-existing runtime writer is safe.

## ST host verification

Read the installed source in `C:\dev\SillyTavern-MainBranch`; no server, user data or model was touched.

- `public/scripts/group-chats.js:1047–1070`: wrapper start precedes drafting; `GROUP_MEMBER_DRAFTED` carries numeric
  `chId`; each member goes through `Generate`, including quiet/impersonate/continue. Wrapper finish follows cleanup.
- `public/script.js:4299`: `GENERATION_STARTED` carries type, parameter object and dry-run flag before command handling.
  The runtime's lifecycle reducer, rather than an assumed one-start/one-end pairing, owns withholding and the new chip flag.
- `public/script.js:9387` and `public/script.js:10400`: the host changes `swipe_id` in place; checking only message index
  would be insufficient. The new revision includes both text and swipe id.
- `src/users.js:1214`: `/characters/*` serves the user's character directory, supporting the encoded avatar URL used
  by the scene card. This review did not request any actual portrait.

## Validation and limits

Executed, with the default-only reporter and cache disabled to avoid repository evidence writes:

```text
node node_modules/jest/bin/jest.js --runInBand --cache=false --reporters=default --runTestsByPath src/generation/living/sceneTest.test.ts src/runtime/coordinators/livingSceneTest.review.test.ts src/pacing/focus.test.ts src/runtime/narratorSheet.test.ts src/runtime/sceneCard.test.ts src/runtime/yourMove.test.ts src/runtime/talkControl.test.ts
7 suites passed; 107 tests passed; 38.416 s.

node node_modules/jest/bin/jest.js --runInBand --cache=false --reporters=default --runTestsByPath src/runtime/generationLifecycle.test.ts src/runtime/suggestions.test.ts src/runtime/suggestionsHost.test.ts src/runtime/memoryInjectorSecrets.recorded.test.ts
4 suites passed; 44 tests passed; 11.454 s.
```

Additional Node stdin probes transpiled production TypeScript in memory, without editing source/tests: frozen-signal
privacy, compaction redraw, single-character name filtering, and delayed-import rollback. Outputs are recorded with
the findings. The delayed-import probe used the real coordinator with injected state accessors, not a browser session.

Test claims were checked against their bodies. Besides the specific gaps above, Q7 S4 reads the same port three times
to represent a chain; it does not drive three ST requests. Q7 S5 creates new ports on both sides, so it does not compare
surviving delivery-window state. Y3 proves pure derivation on frozen input, not the planned ten-turn persisted-extras
comparison. These are coverage limits, not proof of an additional production defect. The expected-prompt test also
creates its golden if missing; CI should fail on a missing golden instead of blessing its current output automatically.

No full gates, Storybook, browser or real-model run was performed for this documentation-only review. Prior gate records
were read, not independently reproduced. Plans 48 S7–S11 and Q7 model-behavior measurements remain owed as those records
state. Only this report was added; no commit was made.
