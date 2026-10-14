# Verification of reviewer claims (2026-10-14)

Adversarial read-only check against master `fa070a6f` and ST at `C:\dev\SillyTavern-MainBranch`. Nothing run.
Verdicts: CONFIRMED (code path real, impact shown), PLAUSIBLE (real path, impact unmeasured/needs a rare condition),
REFUTED.

## B1 self-test max tokens

- Verdict: CONFIRMED (low).
- Evidence: `src/runtime/selfTest.ts:175` asks `maxTokens: 512`; real reads use `MAX_TOKENS_TABLE.sharedRead = 2048`
  (`src/extraction/callBudget.ts:28`, `sharedRead.ts:27`). `runtime/roleSelfTest.ts:176` passes no `model`, so the
  route is `profileRoute(profileId)` (`extraction/modelRoute.ts:83`) with no role effort; `extraction/reply.ts:49-58`
  then sends no reasoning budget. The settings-panel path (`MemoryModelGroup.tsx:119`) passes `createModelCall`, so
  only the token cap differs there. A thinking profile spending >512 tokens in thought ends `reasoning-exhausted`
  (`reply.ts:68`) and the test reports an error while live reads pass. No wrong suggestion: errors return before
  the capability suggestion (`selfTest.ts:177-189`).
- Fix: `maxTokens: maxTokensCap("sharedRead")`, and route through `resolveRoute(settings, "read")` in roleSelfTest.

## B2 substring grading

- Verdict: CONFIRMED mechanism, PLAUSIBLE impact (low, harness/self-test only).
- Evidence: `selfTest.ts:83` `has()` is `includes`; ledger check `has(field=value,"arm") && has(...,"wound")`
  (`:136-138`) passes `harm=wounded`. `scripts/debug/lib/liveSuiteScore.mts:60,64` (path differs from the claim)
  `haystack.includes(needle)`: a short `mustNotContain` fails on a substring ("arm" in "harm"), `mustContain` can pass
  on one.
- Fix: word-boundary match (`\b…\b`, `u` flag) in both.

## B3 settings debounce lost on reload

- Verdict: CONFIRMED (low).
- Evidence: `settingsStore.ts:30-38` ends in `saveSettingsDebounced()`; ST `script.js:470` debounce 1000 ms
  (`constants.js:14`), `utils.js:574-584` plain `setTimeout`; the only `beforeunload` handlers (`script.js:12463`,
  `:12593`) stop streaming / guard chat saves, never flush settings. The `recordSettingsWrite` evidence is in-memory
  and dies with the page, so the loss is silent.
- Fix: write settings through a direct `/api/settings/save` path (as `scripts/debug/lib/settingsSave.mts` observes)
  for owner-initiated toggles, or a `pagehide` flush that calls the host's `saveSettings` when a write is pending.

## B4 harness auth/quota regexes

- Verdict: PLAUSIBLE (low-medium: a wrong status tells the owner to sign in).
- Evidence: `server-plugin/story-orchestrator-harness/errors.mjs:1` `401` and `authenticat` unanchored;
  `:2` `limit reached`. Auth is tested first in `index.mjs:372-376` (claude/codex) and
  `opencodeTransport.mjs:192` (`classifyV2Error`, over message + 2 KB body; status codes win when present).
  An error body naming a 401x token count, or "context limit reached", is misfiled as auth / quota. A retry error
  classified auth/quota becomes fatal (`opencodeTransport.mjs:553`).
- Fix: `\b401\b`, `authentication (failed|required|error)`, `(usage|rate) limit reached`; test context-overflow first.

## B5 echoed model, refusal as ok

- Verdict: CONFIRMED for both, low (claude/codex harness routes only; default authoring route is opencode).
- Evidence: `index.mjs:758` and `:777` return `model: request.model` (opencode outcome's own field is overwritten
  too). claude `stop_reason: "refusal"` maps to `finish: "unknown"` (`index.mjs:316-319`) and text present returns
  `ok: true` (`:366-370`).
- Fix: take the served model from the result (`modelUsage` keys for claude, opencode outcome) and keep
  `request.model` only as `requested`; map `refusal` to `kind: "refused"`.

## B6 cast writes emit no GROUP_UPDATED

- Verdict: PARTIAL. CONFIRMED for ST's own member list; REFUTED for requirementsWatch; REFUTED in effect for sprites.
- Evidence: `stHost/groups.ts:49` `editGroup(id,true,false)` (ST `group-chats.js:1359-1371`) emits nothing; ST's own
  toggle sets `.disabled` and emits `GROUP_UPDATED` (`:1968-2003`). requirementsWatch also listens to
  `onGroupEdited` (`runtime/index.ts:123`, `stHost/persistence.ts:61`, fetch observer on `/api/groups/edit`), which
  our save hits. Sprite stage re-reads `spriteCast()` (reads `disabled_members`) on every manager notify via
  `placeChanged -> castChanged` (`sprites/stage.ts:172,263-280`). ST's group panel keeps a stale `.disabled` class
  until reprint; other extensions listening for `GROUP_UPDATED` miss it. Drafting reads the object, so play is right.
- Fix: after a confirmed save, emit `GROUP_UPDATED` via a new stHost call and toggle
  `#rm_group_members .group_member[data-id]` `.disabled` (or call ST's member reprint if exported).

## B7 Number(messageId)

- Verdict: PLAUSIBLE, negligible.
- Evidence: `replyEffortLive.ts:26` `Number(messageId)`. Every ST emitter passes a number (`script.js:3799,6691…`,
  `slash-commands.js:6006`); only a third-party `null` would read message 0. Repair acts only on a detected thought
  leak in a non-user message of the budgeted chat (`replyEffortHost.ts:116-123`).
- Fix: `hostMessageId(messageId)` and skip `null`.

## B8 sampler overlay listener order

- Verdict: PLAUSIBLE (low; needs another extension writing the same keys).
- Evidence: `stHost/samplerOverlay.ts:31-41` plain `subscribeToHostEvent`; ST emitter has `makeLast`
  (`lib/eventemitter.js:66`), unused by SO. A later `GENERATE_AFTER_DATA` / `CHAT_COMPLETION_SETTINGS_READY` listener
  can overwrite overlay or thinking-budget keys; the overlay's `applied` record would then be wrong.
- Fix: register with `makeLast` (re-placed per generation, as `worldInfoEvidence` does for WI).

## B9 crypto.subtle unguarded

- Verdict: CONFIRMED (low; LAN-over-HTTP only, ST here has `listen: true`).
- Evidence: unguarded `crypto.subtle.digest` at `stHost/media.ts:43`, `stHost/liveHeadAssets.ts:29`,
  `studio/workflowBundle.ts:7`; guarded only in `sprites/builder/recipes.ts:76`. On a non-secure origin
  `crypto.subtle` is undefined and the call throws a TypeError, not a readable message.
- Fix: one `sha256Hex` helper in `utils/` with the recipes guard (or a small pure-JS SHA-256 fallback).

## B10 withhold misses pacing hint and check outcome

- Verdict: CONFIRMED (low-medium: impersonate gets narrator steering / dice outcome).
- Evidence: `managerDelegates.ts:136` withholds private knowledge + `pacing.withholdGuidance()`, which clears only
  `GUIDANCE.key` (`pacingCoordinator.ts:177-184`); `PACING_HINT_EXTENSION_KEY` (`:133`) and
  `checkOutcomeHost.ts:7-10` stay set for quiet/impersonate. Note guide `story-guide.md:222` says plain/`all`
  guidance "reach every generation", yet the whole guidance block is withheld: doc/code drift too.
- Fix: withhold the pacing hint and check-outcome block on impersonate (decide quiet), release with the guidance hold;
  align the guide line.

## B11 suggestion starting with "/"

- Verdict: CONFIRMED (low; the player sees the text before sending).
- Evidence: `stHost/generation.ts:66-73` writes text verbatim; `runtime/suggestions.ts:39-54` filters no leading `/`.
  Sending a box that starts with `/` runs it as STscript.
- Fix: drop lines matching `^\s*/` in `parseSuggestions` (and in widget action text fill).

## B12 tool bridge classifies by wrapper message

- Verdict: CONFIRMED (low: every kind falls back to the text route anyway; status shown is wrong).
- Evidence: `stHost/profileToolBridge.ts:30-33,65-67` reads `error.message`; ST wraps every failure as
  `new Error('API request failed', { cause })` (`extensions/shared.js:490`), so auth/quota read "transport". The text
  route already unwraps `cause` (`stHost/modelReply.ts:89-94`). Unit test feeds bare messages (`profileToolBridge.test.ts:39`).
- Fix: classify `${message} ${cause.message}` (reuse modelReply's unwrap).

## B13 gotchas isFinished doc

- Verdict: CONFIRMED doc error.
- Evidence: `onStopStreaming` sets `isFinished = true` (`script.js:3847-3850`), called by `stopGeneration` (`:5610`),
  swipe (`:10330`), unload (`:12467`). Only an errored stream (`onErrorStreaming`, `:3820-3831`) leaves
  `isFinished` false (sets `isStopped`). `.claude/rules/gotchas.md:53`.
- Fix: reword to "an errored stream leaves `isFinished === false` (`isStopped` true); a user stop sets it true".

## B14 global WI save debounce

- Verdict: CONFIRMED host fact, PLAUSIBLE impact (medium when it hits: silent loss of an author edit on reload).
- Evidence: one `saveWorldDebounced` for all books (`world-info.js:83`); `_save` cancels it (`:4151-4153`);
  debounce keeps only the last call's args (`utils.js:574-584`). SO saves immediately (`stHost/worldInfo.ts:78-85`).
  An author's pending edit to book A in the WI editor is dropped server-side when SO writes book B within 1 s; it
  survives only in the cache until another save of A or a reload.
- Fix: after any SO immediate save, if the WI editor's open book differs from the target and is cached, save it
  immediately too (`saveWorldInfo(open, cached, true)`), or hold SO's write until the debounce window passes.

## B15 stale curator rewrite

- Verdict: CONFIRMED for `rewrite`; REFUTED for `patch` (anchor must still match, `stagecraft/proposal.ts:71-72`).
- Evidence: `runtime/curatorWriter.ts:73-95` reads the live entry and applies `previewCuratorOp`, which for
  `rewrite` checks only length / partial view / no-op (`proposal.ts:65-69`); no hash of the content seen at proposal.
  A review card accepted after the author edited the entry overwrites the edit (rollback restores the pre-write
  state, so it is recoverable).
- Fix: store `seenHash` on the op at proposal; refuse `rewrite` at the write edge when the live content hash differs
  ("the entry changed since this was proposed").

## B16 unclamped quest reward add

- Verdict: CONFIRMED when the int has a `step_rule` with `min`/`max` (low-medium); by design for display-only bounds.
- Evidence: `engine/quests.ts:76-79` adds without bounds; extractor step reads clamp to `step_rule.min/max`
  (`engine/qualityRead.ts:39-42`); the sheet clamps `display.min/max` at display only (`runtime/gameSheet.ts:14`),
  and the guide states display bounds are display-only (`story-guide.md:475`). A reward can push a stepped quality
  past its rule, so gates read -3 while the sheet shows 0.
- Fix: clamp `{add}` results to `step_rule.min/max` when present; optionally a validation warning when a reward can
  leave `display` bounds.

## B17 flush poll gives up after 60 s

- Verdict: PLAUSIBLE (low).
- Evidence: `runtime/turnBridge.ts:211` stops polling at `FLUSH_POLL_MAX_MS` leaving `pending`; re-flush comes
  from `GENERATION_ENDED`/`GENERATION_STOPPED` (`:81-82`) or the next rendered reply. Any `Generate`-based peer
  emits those, so only a peer holding `is_send_press` (`script.js:604`) without them, or a stuck flag, leaves the
  boundary uncommitted until the next reply.
- Fix: after the max, keep a slow poll (e.g. 2 s) instead of returning; also subscribe `GROUP_WRAPPER_FINISHED`.

## B18 roster changedAgo vs plan 53

- Verdict: REFUTED as drift.
- Evidence: plan 53 is DRAFT, not built (`53-reputation-factions.md:3`); its no-recency rule (`:182,203,248`) is
  for faction rows it will add. Today's roster `changedAgo` is built v2.7 36 behaviour, documented in the guide
  (`story-guide.md:475`), and computed over the player label so hidden movement inside a band does not show
  (`runtime/widgets.ts:160-171`). Build requirement for plan 53: faction rows must omit `changedAgo`.

## B19 WI recursion re-entry

- Verdict: REFUTED.
- Evidence: SO never touches `WORLDINFO_SCAN_DONE` or the activated map. Its narrowing runs on
  `WORLDINFO_ENTRIES_LOADED` before ST sorts and clones (`world-info.js:4604-4638`; `stHost/worldInfoScan.ts:18-31`)
  and only sets `disable = true` on the per-call copies (`runtime/scanGatePlan.ts:70-84`, `loreExclusive.ts:84`);
  `lorePlacement.ts:56` only moves depth and skips disabled entries. Nothing is removed mid-scan, so no re-entry.
