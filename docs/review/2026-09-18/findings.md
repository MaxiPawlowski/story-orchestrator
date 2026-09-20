# Prioritized findings

All R tests below ran against the preserved snapshot. Source paths are relative to that archive. Reproduce by copying `scripts/review/reviewRegression.test.ts` to isolated `src/runtime/reviewRegression.test.ts` and running `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/runtime/reviewRegression.test.ts`. Expected assertions express the documented/intended contract and deliberately fail on defects. [JSON](evidence/reproductions.json), [console](evidence/reproductions.log), and [source inventory](evidence/inventory.json) preserve the evidence. Earlier invalid harness fixtures were corrected before these results; their errors were not counted as product failures.

P1 means resolve before broad distribution because ordinary supported workflows can corrupt continuity, modify unintended assets, or execute imported markup. P2 means a material integration, accessibility, or contract gap. Confidence refers to the demonstrated behavior, not its frequency in live play.

## R1 — P1: delayed work can write into a different chat

**High confidence; reproduced.** `src/runtime/coordinators/stagecraftCoordinator.ts:88–143` captures story/state before awaiting a curator call, then patches `this.state`, which resolves through the current chat's extras. The regression starts a deferred call in chat A, switches the dependency state to chat B, resolves A's result, and finds one proposal in B instead of zero. A same-chat control successfully applies its rewrite.

This is an ownership failure, not a model-quality failure. The same missing session identity is visible in `src/extraction/scheduler.ts:112–130` and `coordinators/extractionCoordinator.ts:109–126`; those analogous paths were inspected, not separately proven by R1. `runtime/index.ts:113–124` drops its scheduler reference on stop without cancelling outstanding jobs, and keeps manager listener subscriptions installed across starts.

Remedy: give every task an immutable `{chatId, storyId, playedVersion, sessionEpoch, sourceWindowRevision}`; validate it immediately before every state/host write, including error handling. Abort supported network work on selection/stop and discard results when cancellation cannot stop it. Clear queues and cursors and retain/unsubscribe listener disposers. Acceptance: delayed success and failure after switch, restart, disable, edit and stop/start leave both chats correct; no duplicate boundary dispatch after repeated start/stop.

## R2 — P1: Stagecraft rollback restores the wrong text

**High confidence; reproduced.** `coordinators/stagecraftCoordinator.ts:232–251` traverses affected proposal records chronologically, reversing only operations within each record. Two writes at separate boundaries produce `Original → First → Second`. Reverting both produces `First`, not `Original`.

Use reverse application order across records and operations. Record before-images at the actual write edge, not from one stale initial scope read for an entire batch. Check inverse host results before deleting the rollback record; preserve a recoverable error if an inverse fails. Add controls for multiple writes to one entry in one batch, distinct entries, external edits and partial host failure. A compare-and-set check is preferable to overwriting an independently edited user entry during rollback.

## R3 — P2, baseline only: a failed enable/disable was recorded as applied

**High confidence; reproduced on baseline; later source fix observed.** Baseline `coordinators/stagecraftCoordinator.ts:215–216` ignores the boolean result of `enableWIEntry`/`disableWIEntry`. Returning false still increments the applied count and marks the operation applied. R3 expected zero/failed and received one/applied. Current original source at the first drift check explicitly checks `found`; do not report this baseline issue as necessarily open on the latest source. The current-comparison report supplies retest status. Inverse calls and disabled-state restoration still require equivalent result handling.

## R4 / E1 — P1: rollback disappears after reload and silently fails beyond retained history

**High confidence; two independent reproductions.** `src/engine/engine.ts:85–98` clears snapshots and boundary logs during hydration and retains only the current snapshot. R4 creates a transition supported by message 1, verifies rollback is needed, serializes/hydrates, and then finds that the same edit is considered irrelevant. Persisted engine state does not contain the evidence log needed to recover it.

Sol's E1 crosses the 200-snapshot horizon (`engine.ts:145,186,240–245`). A mutation at message 0 is recognized as relevant, but no prior snapshot exists and rollback returns false. `runtime/runtimeManager.ts:287–310` then performs no cleanup or reread and gives no recovery indication. A recent mutation in the same long session succeeds.

Persist enough provenance to replay from a retained base snapshot, or explicitly invalidate/rebuild affected state. When historical reconstruction is impossible, quarantine dependent derived state and offer a clear recovery action; never imply nothing changed. Include generated graph, memory, pacing and applied host effects in the same rollback contract. A persistence migration is needed for a durable journal; old records need an explicit unknown-history recovery policy.

## R5 — P1: extraction can write code-owned qualities

**High confidence; reproduced.** `src/extraction/parse.ts:93–125` looks up any declared quality and stamps its declared source onto the model's delta. Thus `DELTA locked value=true evidence="invented"` for a code-owned bool is accepted with `source: code`. This defeats the blackboard's source-mismatch defense and violates the specification's prohibition on model-written convergence/mechanical state.

The parser must label origin as extractor, reject non-extractor qualities, and validate the operation against the request contract at the application boundary. Test actual built-in progress/counter qualities as well as authored code qualities, both normal and reconciliation passes. Preserve rejection diagnostics without applying values. Model instructions alone cannot enforce write authority.

## R6 — P2: declared extraction scope is only prompt guidance

**High confidence; reproduced independently of R5.** `src/extraction/sharedRead.ts:54–65` parses against the full story and assigns every parsed delta to `acceptedDeltas`. A request scoped only to `crossed` accepts another extractor-owned quality, `outside`. R6 uses two extractor qualities so this is not merely the code-authority issue again.

Filter by the exact requested scope, expected source and window revision. The parser currently requires non-empty evidence rather than proving the quote occurred in the source window. Evidence-span validation and contradiction review should be explicit; do not mistake syntactically present evidence for factual accuracy. Reconciliation must only resolve the matching pending request, not simply the first pending record.

## R7 — P1: imported story text becomes executable popup markup

**High confidence for the unsafe rendering path; no attack against user data performed.** `src/runtime/storyUpdate.ts:35–44` interpolates title and diff messages into HTML without escaping. `src/services/stHost/popup.ts:40–61` passes that string to the host; the reviewed host's `public/scripts/popup.js:528–535` assigns string content to `innerHTML`.

R7 shows an imported title containing an image event handler is retained verbatim. An independent blank-browser check of that returned markup shape executes a harmless `globalThis.reviewMarker=1`; see [interaction evidence](evidence/ui/interaction.json). The exact host popup was traced in source, not exploited in the live host. Trigger: an imported/model-generated story title or identifier reaches an invalidating update dialog. This is not a claim that all React rendering is unsafe.

Construct dialog content with DOM text nodes/React text, or escape every interpolated value consistently. Keep intended fixed markup separate. Acceptance: hostile titles and diff identifiers display literally, normal titles retain punctuation, no handler executes, and custom choice buttons still return the right decision.

## R8 — P1: wizard dependencies are treated as asset ownership

**High confidence; reproduced with a mocked host write.** `coordinators/copilotCoordinator.ts:38–49` sets `storyLorebooks` from `story.requirements.lorebooks`. `src/wizard/provisioning.ts:36–43` treats membership as permission to upsert. Declaring an existing user's book as a dependency therefore allows overwriting its entry, despite the documented create-only rule. R8 returns success and calls the host upsert without any created-asset ownership record. A book absent from requirements is correctly rejected by the control.

Separate requirements from ownership. Persist an explicit creation/ownership record for wizard-created assets, or obtain an explicit per-asset write grant through the proposal workflow. Recheck against the actual host immediately before writing. Existing stories must not receive ownership automatically during migration. The current original provisioning code changed during review; use the comparison report for current status.

## R9 — P1: generated alternative outcomes vanish

**High confidence; reproduced with validated generated input.** `src/generation/merge.ts:35–53` uses only `beat.outcomes[0]`; critic/revalidation arithmetic also privileges the first outcome. A generator response with two valid outcomes becomes one outgoing transition. The single-outcome control retains its one transition. The base specification explicitly says possible outcomes become multiple outgoing gates (`docs/plans/v2/story-orchestrator-spec-v2.md:111`).

A player who follows the omitted alternative can stall or be steered back into the first route. Either implement all declared outcomes with deterministic per-path progress/latch checks, or explicitly constrain the generation contract to a single outcome and revise the feature claim. The first option preserves the promised flexibility but requires outcome IDs, tie rules and all-path validation. Do not automatically force expected narrative deltas into the blackboard merely because a generator predicted them.

## M1–M4 — P1: memory maintenance is not reversible

Lead review accepts Sol's pure-function reproductions: supersession leaves a predecessor retired by a removed winner; completed read coverage blocks the corrected reread; an overwritten ledger field loses its previous value; epistemic retirement remains after the revealing message is removed. See [full evidence and locations](memory-engine-review.md). The runtime composes these functions in its mutation path. These failures can leave the engine and narration describing different histories even when a checkpoint rollback succeeds.

Use a shared provenance/event design covering insertion, update, supersession, retirement, exclusion, summary derivation and read coverage. Reversal should be equivalent to replay without the removed input. Merely deleting rows whose creation message is recent cannot reverse changes to older rows.

## M5/M6 — P2 contract conflict: pinning freezes truth and can retain removed-source knowledge

The behaviors are reproduced, but the product semantics require a decision. Existing tests intentionally retain pins across rollback, whereas the written pin contract only promises protection from trim/expiry. Sol's M6 proves knowledge from removed text remains in the intended character's private block. It does **not** demonstrate disclosure to another character or a human data leak.

Recommended contract: pin protects retention; current truth and source validity remain separate. Preserve old pinned records as superseded history, and quarantine source-invalidated extracted knowledge unless the user explicitly converts it to a manual fact. A separate “lock as canon” action could deliberately override this, but must explain its consequences. Test UI wording and provenance as well as pure functions.

## M7 — P2: manual edits bypass cached token budgets

`src/memory/stores.ts:78–80` changes text without invalidating `tokens`; `budget.ts:9–10` trusts the cached count. Sol's test expands one-token content to 80 characters and it still fits a four-token budget; the uncached control is excluded. Clear/recompute token cost on every content change and budget formatted injected blocks, including labels and separators. Pinning must not silently defeat a hard context limit.

## Integration and delivery observations

- **P2, reproduced environment failure:** clean host installation exposes ambient `@types/toastr` conflicts in `src/services/stHost/slashCommands.ts:13–14`. Typecheck/build fail while contained-type review configs pass. Make type boundaries explicit and test installation beneath a clean supported host; ship a reproducible bundle with a matching source/build manifest.
- **P2, source-confirmed baseline limitation:** Author Note role is logged but not sent by `stHost/authorNotes.ts:20–38`; the host exposes `/note-role`. The current original file changed; current status belongs in the comparison report.
- **P2, source-confirmed limitation:** checkpoint presets use the text-completion adapter (`stHost/presets.ts:41–69`). Chat-completion narration such as this Artemis setup needs a distinct adapter or an explicit unsupported-effect diagnostic. A successful generic UI action does not prove its settings reached the active backend.
- **P2, lifecycle risk:** host effects mutate shared WI/settings/cast/background state, while deselection clears prompts/extras without a general ownership-aware restore ledger. Checkpoint reapplication alone cannot undo an effect absent from the older checkpoint. This is a source review risk requiring the fault-injection cases in the roadmap, not an additional counted reproduction.
- **P2, keyboard:** Studio advertises tabs but arrow keys do not move focus; see UX evidence.
- **P2, retention disclosure:** `runtime/persistence.ts:10,43–49` retains five story states per chat. Explain/archive before eviction if users are promised that selecting another story preserves their run.

Live findings, including first-run drawer interaction failures and profile/model behavior, are tracked separately in the [live report](live-review.md). Do not collapse fixture failures, harness failures, missing capabilities and product defects into one pass percentage.

## R10/R11 — P2: reply deduplication uses elapsed time instead of message identity

**High confidence for the deterministic behavior; live frequency unmeasured.** `src/runtime/turnBridge.ts:25–26,49–57` drops reply notifications within 250 ms of the previous notification and ignores the host-supplied message ID. The separate `scripts/review/turn-boundary.test.ts` harness has two passing controls and two failing expectations: distinct idle-host replies 100 ms apart commit only one boundary; two events for the same idle-host reply 300 ms apart commit two. These are timing injections, not claims that Artemis normally produces two replies that quickly.

The actual host supplies message IDs for both events (`public/script.js:3799–3800,6691–6693`; `public/scripts/slash-commands.js:6006–6013`). Scripted replies and slow/coexisting event listeners make time alone an unreliable identity proxy. Deduplicate using chat/session identity, message identity, and reply/swipe revision; retain the generation-state check for deciding when to commit. Tests should distinguish duplicate events, a new swipe of the same message, distinct rapid replies, and slow listeners. [Results](evidence/turn-boundary.json) and [console](evidence/turn-boundary.log) preserve all four observations. This complements R1's lifecycle work rather than requiring a new engine.

## R12 — P2: the model self-test certifies unrelated tier content

**High confidence; reproduced with controlled model responses.** `src/runtime/selfTest.ts:77–118` checks one of two core deltas and the presence of any parsed memory/arc/epistemic/ledger item. In `scripts/review/selftest-grading.test.ts`, a response with the correct `location=tunnel` but invented moon/dragon memory, an unrelated chess arc, and an unknown character's cheese belief/purple costume passes all five tiers. Correct fixture content passes the positive control; empty output fails the negative control. [Results](evidence/selftest-grading.json), [console](evidence/selftest-grading.log).

This does not mean Artemis produced those errors; it proves the readiness grader would miss them. Grade required entities, relations, source-supported content and both required quality changes. Report syntax capability separately from semantic correctness. A model transport error should not be represented as a semantic failure or silently certify a capability. This finding substantiates the source audit in [test-credibility.md](test-credibility.md).
