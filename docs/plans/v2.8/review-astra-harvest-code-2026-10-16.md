# Harvest code review — 2026-10-16

Scope: `git diff 5df346bb~13 5df346bb`, plus explicitly requested follow-ups `b6ca763f` and `cb586d36` (outside that diff). Read AGENTS.md, architecture and working rules, plans 69 and 35. Verified host behavior in `C:/dev/SillyTavern-MainBranch`. No live ST, browser, model or campaign access. Review only; no implementation changes or commit.

## Findings

No P0 found. Three P1 and three P2 findings.

### 1. P1 — Conflict detection itself overwrites the conflicting server book

Location: `src/services/stHost/worldInfo.ts:111`; `src/services/stHost/worldInfoPending.ts:18`, `:41`.

On a mismatch, `staleBookRefusal` flushes the cached book. The pending tracker marks **every cache set**, including ordinary loads: ST `public/scripts/world-info.js:2036-2055` caches fetched data with `worldInfoCache.set`. A recent load is therefore treated as an unsaved author edit.

Scenario: A loads a book; B edits another entry; within 1,500 ms A writes. Preflight sees B's change, flushes A's stale whole book, and destroys B's edit before deciding whether to refuse. A genuine pending local edit concurrent with a remote edit has the same problem: its existence does not establish that the server difference is exclusively local.

Reproduced in memory with the actual transpiled worldInfo and worldInfoPending modules and ST's reference-returning cache semantics. B's `OTHER PAGE EDIT` became `old`; one save occurred; A returned `ok:false` claiming “nothing was written.”

Suggested fix: distinguish reads from dirty writes and retain the server baseline of pending edits. Never flush a cached book merely because it differs from the server. Reconcile dirty changes against their baseline before saving. Test recent-load conflicts and simultaneous local/remote edits with the real tracker.

### 2. P1 — Awaited preflight does not recheck run ownership before writing

Location: `src/services/stHost/worldInfo.ts:177-180`, `:417-422`, `:461-470`, `:485-491`; `src/services/stHost/worldInfoPending.ts:41`.

For example, `src/runtime/effectSteps.ts:51-52` checks `run.stillOwns()` before calling `setWIEntriesState`, but passes no guard. The helper awaits a load and now a server comparison, then saves without checking ownership. Preflight can itself perform another write through the pending-save helper.

Scenario: chat A starts file-mode replay; its server GET pauses; the player switches to B or rolls back A; the GET completes with an equal book. A's obsolete flags still land in the shared lorebook. Checking after the helper returns cannot prevent this. Accepted curator updates/creates/deletes have the same suspended-preflight exposure.

Suggested fix: thread the originating RunGuard/RunOwnership through host writers and pending flushes; check after awaits and immediately before each mutation/save, including loop iterations. Use detached candidate data so cancellation cannot mutate the shared cache. Test invalidation while GET is suspended and require zero writes. This violates architecture.md's check-before-EACH-write invariant; the new preflight widens an existing host-seam gap.

### 3. P1 — GET-then-save still permits stale whole-book overwrites

Location: `src/services/stHost/worldInfo.ts:108-114`, `:417-422` (also the other four writers).

Even after fixing the flush defects, comparison and commit are separate requests. Scenario: A's preflight reads the original book; B saves another entry after that read; A posts the original copy plus its patch. B's edit disappears. A's confirmation checks its own target, so it can still report success.

Verified ST `public/scripts/world-info.js:4151-4160` posts the whole book and `src/endpoints/worldinfo.js:134-156` unconditionally replaces the file. Atomic file replacement is not a conditional update; there is no revision/hash precondition. This is a remaining limitation of plan 69's selected client-side fallback, not proof of its stated “never overwrites” guarantee. An unreadable preflight also deliberately proceeds unprotected.

Suggested fix: a server-side conditional patch/commit with an expected revision and shared writer serialization. The protocol must cover competing writers, including the ordinary ST editor; another GET or a client-only mutex cannot close this race. Add a test placing B's write between A's GET and POST. Until then, describe this as best-effort detection, not overwrite prevention.

### 4. P2 — Same-page edits falsely refuse after the requested flag was saved

Location: `src/services/stHost/worldInfo.ts:173-177`; masking test at `src/services/stHost/worldInfo.test.ts:26`, `:686-700`.

ST returns the cached object itself (`world-info.js:2041-2042`), whereas the test returns a clone. `setWIEntriesState` snapshots its baseline, then mutates that shared object before checking staleness.

Scenario: the author edits entry B; its save is debounced. A checkpoint switches entry A off. Preflight sees unsaved B and flushes the cache, now containing both B's edit and SO's A flag. The second read differs from the baseline on A, so the code reports “another page changed” and “nothing was written,” although both changes landed. No second page is required.

The in-memory reproduction returned `ok:false`, saved once, retained `LOCAL EDIT`, and changed A's flag. The added B14 test passes because its cloned load prevents the flush from seeing SO's mutation.

Suggested fix: reconcile genuine pending edits before snapshotting and modifying a detached candidate. Make the fake return the cache reference and exercise the real tracker. Assert server/cache state on refusal as well as the returned result.

### 5. P2 — Nested quiet runs still carry blocks declared withhold

Location: `src/constants/injectionRegistry.ts:46-47`; `src/runtime/wiring/generation.ts:50-59`.

Scenario: a loud generation opens with an away notice or “Previously” block, then another extension starts a nested quiet generation. The outer opened handler injects these blocks. The nested handler only calls `runtimeManager.onGenerationStarted`; that method handles memory, pacing, chapter bridge and stagecraft, but never clears these wiring-owned notices. They remain available to the quiet prompt despite the new declarations. The stale-hold cap does not address this live nested case.

The registry test validates declarations. `runtimeManager.test.ts:384-397` checks only blocks already present in its manager fixture and requires only checkpoint guidance; it cannot detect this wiring-level leak.

Suggested fix: withhold these notices on nested withholding entry and restore their outer-run values on reapply. Test actual event wiring with nonempty away/previously blocks: absent during quiet, restored afterward. Seed every declared block when claiming registry-wide coverage.

### 6. P2 — Refused NPC replies consume their trigger allowance

Location: `src/runtime/effectsApplier.ts:410-411`, `:481-487`.

K10 adds explicit missing/ambiguous-member refusals, but `speak` only journals the result. `fireNpcReplies` has already recorded a fire, then increments `spoken` and sets `lastSelfInjectionMessageId` regardless of whether a reply was triggered.

Scenario: an afterSpeak effect with `maxTriggers: 1` encounters duplicate matching names and refuses. The author resolves the ambiguity; the next qualifying turn cannot trigger because the allowance was consumed. The current message is also marked as a self-injection despite no new message, potentially suppressing another eligible effect.

Suggested fix: propagate WriteResult through speak/settlement. Reserve while pending to prevent reentrancy, but commit counts/self-injection state only on success; release the reservation on refusal. Add refusal-then-correction coverage. Also propagate `executeSlashCommands`' boolean result from `fireReply` instead of always returning `wrote()`.

## Checked and found fine

- **K11:** bases are captured at proposal time; touched changes and newly overwritten author fields are separately checked. Unrelated scalar/entity edits remain acceptable. Decided steps discard their bases. Selected tests passed; no concrete K11 defect found.
- **K5:** production inline mounting is outside message text; the architecture census and planted DOM sweep have useful controls. Storybook uses a supplied sibling host, so its assertion is narrower than validating the production host adapter.
- **K6/K8:** receipt tests cover both listener orders, delayed rendering, swipe restoration, and a genuine later-rewrite control. The production repair updates the selected swipe as well as visible text. K8 scenarios assert distinct outcomes for all four planted mutations. Browser scenarios were inspected, not rerun.
- **K9 follow-up:** the next loud start/interceptor entry clears an abandoned outer hold; same-type group nesting is retained; timer disposal is present. Reducer tests passed. This does not resolve finding 5 or prove safety for arbitrarily long foreign-extension calls.
- **K10 host semantics:** ST `group-chats.js:353-417` interprets numeric arguments as group-member positions, then resolves avatars to character indexes. Tests correctly distinguish these indexes and cover numeric names and pre-call reordering. Exact missing/duplicate-name refusals are useful. ST resolves /trigger after an asynchronous wait (`slash-commands.js:4985-5017`); these tests do not prove identity stability during a concurrent reorder.
- **K10 filler follow-up:** `openai.js:930-931` adds send_if_empty to the prompt when its last chat message is assistant and budget permits, without inserting a stored user turn. The CC-only, NPC-effect-scoped informational check matches this behavior and does not block play.
- **K17:** null, blank, nonnumeric and nonfinite IDs no longer coerce to message zero; numeric zero and numeric strings work. Selected tests passed.
- **K1:** empty, nonshortening and over-answer-budget candidates are rejected before replacement; the same refused input is admitted twice, then suppressed. A valid-summary control exercises replacement. This is deterministic plumbing evidence, not a model-quality assessment.
- **Matcher:** all three scorers and self-test use termPresent. Term/prefix behavior, quote/dash folding, old scorer semantics, unrecorded inventory rows and changed-verdict reporting have meaningful controls. Rescore refuses to overwrite an existing record.
- No new direct ST imports outside the host surface or engine-to-host dependency found in scope. Ownership exceptions are reported above.

## Validation record

- `node node_modules/jest/bin/jest.js --runInBand --no-cache src/services/stHost/worldInfo.test.ts src/services/stHost/worldInfoPending.test.ts src/copilot/agent/staleProposal.review.test.ts src/runtime/generationLifecycle.test.ts src/runtime/coordinators/compactionRefusal.review.test.ts src/runtime/replyReceived.test.ts src/utils/termPresent.test.ts src/services/stHost/groupMemberPosition.test.ts`: **8 suites, 129 tests passed**, 34.333 s.
- `node --test scripts/debug/liveSuiteScore.test.mts scripts/debug/needleInventory.test.mts`: **25 passed, 0 failed**. Node emitted a module-type warning.
- Two in-memory source reproductions, no files written: recent-load/remote-edit overwrite and same-page pending-edit false refusal. Both reproduced despite the selected suites passing.
- Full gates and live/browser runs not run. Documentation-only review, not a build or live acceptance attestation. Only this review file intentionally added; pre-existing `.claude/launch.json` left untouched.

## Addressed 2026-10-16/17

All six findings fixed on `v2.8-harvest-review-fixes` (unmerged); details, tests and gates in plan 69 §Gate record
addendum 2026-10-16/17. #1 `2d569834`, #4 `bef63587` (correction: the reference is returned on a cache miss,
world-info.js:2054-2055; :2041-2042 clones), #2 `851dff9f`, #3 `5c086027` (new `story-orchestrator-lore` plugin,
conditional commit; K12 claim reworded to "our writers never overwrite each other or a change the server already
has; ST's editor saving in the same instant remains best-effort detection"), #5 `e33f6bbd` (also the continuity note
and chapter bridge, found by seeding every declared block), #6 `dccdd24e`.
