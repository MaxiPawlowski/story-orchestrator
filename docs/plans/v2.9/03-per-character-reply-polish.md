# Plan 03 — Per-character reply polish

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md` §03, V02/V04/V08/V10/V13, challenges 1–5 and 16); not built; owner decisions pending.** The owner's lead idea. Implementation tier **D** (spike, pure core, writer, seams, Storybook); acceptance **CL** (independent rater, polish route on the harness) + **RP/LT** (real Artemis replies with thinking and inner voice on, on an authorized lane/GPU window; none is authorized by this plan). Automatic rewriting lands only after the consumer-order spike (S0), the independent-faithfulness evidence (S2 shadow) and isolated-lane S3 integration evidence (triage build order 7), **and only with preserved thought carry with validated provenance or the owner's explicit approval of the carry reduction (P0, §Reasoning)**. Overview: `docs/plans/v2.8/00-overview.md` §Rules.

## What it is

- After a member's reply arrives, and only when code finds a specific wording failure in it (an authored avoid/tic hit or that member's own repetition), one routed model call rewrites **only the sentences that hold the failure**, in that member's authored voice. Everything else in the reply stays byte-identical.
- The rewrite is accepted only if deterministic guards pass; any doubt keeps the original. It lands before any SO consumer and before `fireAfterSpeak`, or not at all.
- Polish edits wording, never what happens: no events, knowledge, agency or mental-state changes; no behaviour repair.
- Per-member config is plan v2.9 02's `roster[].polish` (`RosterPolish extends DeliverySheet`, `engine/deliverySchema.ts`; `02-roster-voice-prevention.md` §Schema). This plan reads it and adds nothing to it; it owns the runtime policy, the route, the guards, the timing contract and the measurement.

## History and evidence

- Triage: `docs/plans/v2.9/01-triage-sol.md` V02 (PLAN 03), V04 (window/anchor guard, FOLD 03), V08 (generated ignore list, FOLD 03), V10 (supplied text is reference data, FOLD 03 for polish), V13 (state consumes final accepted text, FOLD 03 + v2.8 69 K6/K8), N21 (throttle unwanted repetition, not every mannerism, FOLD 02/03), A02 (stopped partials), §03, build order 7, challenges 1–5, 16.
- Research (`docs/plans/v2.8/extension-research-2026-10-21/`):
  - `per-character-polish.md` P1 (design; its config shape P1(1) is superseded by v2.9 02 `RosterPolish`: receipt-to-boundary hold, route, guards, reuse, measurement, prior verdicts), P2 (prevention line, now v2.9 02), P3 (per-speaker tics, now v2.9 02).
  - `lattice.md` P1 (window-and-anchor guard; MIT, adaptable with attribution), P2 (zero-call lexicon; substitution half SKIPped by triage V05), P3 (effects read final text), host facts (new-swipe apply, `syncMesToSwipe`).
  - `simulation-blackboard.md` P2 (presentation vs world split; "no finding, no rewrite"; every edit closes a recorded finding).
  - `languagetool.md` P1 (before/after LT guard, never the rewriter), P3 (generated ignore list).
  - `SUMMARY.md` §1 (design and owner decisions a–e), §4 "Disagreement settled" (a pre-boundary in-place write does not roll back; still to prove with a spike that the commit fingerprint is the polished text).
- Prior verdicts against Recast-style passes: `docs/plans/v2.4/extension-research/recast-st-post-processing-for-better-prose.md` idea 6, `docs/plans/v2.8/extension-research-2026-10-14/recast.md` §Not worth taking, triage 61 R3–R8 (→ v2.8 69 K6/K6b/K8). `per-character-polish.md` P1(7) answers each; this plan keeps those answers.
- **Where sol and the research disagree, this plan follows sol:**
  - "Design ready" (SUMMARY §1) → conditional on S0 timing proof and S2 semantic evidence (triage V02, challenge 1).
  - Research awaits polish before `fireAfterSpeak` and calls group overlap "zero added wall time" → `fireAfterSpeak` itself can generate (challenge 1), later generations can consume the original, and cost is measured as full-round latency, exposure, coverage and wasted calls (challenge 5).
  - Research guards treated as safety → lexical guards do not prove semantics (challenge 2); kept as structural guards plus independent rating and adversarial negatives; editable region shrunk to finding sentences.
  - "Reasoning untouched" treated as agreement → false: K6b hides a polished reply's reasoning from carry and harvest, a functional reduction of thought carry (challenge 3; review P0). Automatic writes need preserved carry with validated provenance or an owner-approved exception.
  - Research LanguageTool guard → deferred to v3.0 (triage V07): reopen only on observed grammatical damage in accepted outputs.
  - Research inputs include card `mes_example`/personality → excluded; bounded style projection only (challenge 4).
  - Research triggers include warden voice flags and a "not polished in 3 replies" cadence, and passes include rhythm/tension → v1 is lexical/repetition signals only; rhythm, tension rhythm and behaviour repair out (triage §03 In/Out).
  - Research floors (refusals ≤20 %, abandon ≤10 %, DeepSeek rater) → sol's floors; refusal and abandonment rates reported, no floor.
  - Research manual "Polish this reply" → out of the first slice (triage §03 Out).
  - Research puts `roster[].polish` in this plan (`per-character-polish.md` P1(1), incl. `banned_tics`) → plan v2.9 02 owns it as `RosterPolish` with `tics` (watched habits; removal targets here), `dialogue`, `enabled` (triage §02 In). Challenge 16 (02 is M) is 02's sizing; it is why 03 waits on 02.

## Current state in code

Verified on `6861d989`.

- **Writer.** `rewriteReplyText` (`src/services/stHost/chatMessages.ts:18-30`) writes `mes`, `swipes[swipe_id]` and **also** `extra.reasoning` and `swipe_info[].extra.reasoning` (`:23`, `:26-27`), then re-renders via ST's `updateMessageBlock` (`:28`); answers `WriteResult`. A polish must not carry a stale reasoning value through it: a new writer is needed.
- **Receipt repair precedent.** Thought-leak repair runs synchronously on `MESSAGE_RECEIVED` (`src/runtime/replyEffortHost.ts:116-125`, wired `src/runtime/replyEffortLive.ts:26-30`, `src/runtime/replyReceived.ts`). It is code-only and lands before render; a polish is a model call and always lands after render.
- **Pending boundary.** `TurnBridge.onRenderedReply` dedupes by turn key (continue gets a stamp, `src/runtime/turnBridge.ts:149-154`) and calls `enqueueBoundary(id, true)` (`:160`). `enqueueBoundary` pushes an unready entry, **awaits `manager.fireAfterSpeak()`** (`:166`), then marks ready (`:171`). `flushPending` stops at the first unready entry (`:180`) and defers while the host generates (`:184-186`; poll cap `FLUSH_POLL_MAX_MS` 60 s, `:12`). Subscriptions: `MESSAGE_RECEIVED`, `CHARACTER_MESSAGE_RENDERED`, `MESSAGE_SENT`, `GENERATION_ENDED/STOPPED`, `MESSAGE_SWIPED` (`:82-88`).
- **`fireAfterSpeak` generates.** `src/runtime/runtimeManager.ts:333-342` → `EffectsApplier.fireActiveReplies` → `fireNpcReplies`; a non-scripted NPC reply is a real generation (`src/runtime/effectsApplier.ts:411-435`). Its prompt reads the reply being polished (challenge 1). Recursion guard: `speaking > 0` (`:471`).
- **Next-generation seam.** The talk interceptor (`src/runtime/wiring/talk.ts:60-70`) runs talk direction, `draftedBeat.settle()`, lore intercept, chapter recall/fold; an existing hold seam `holdForChat` → `spikeSeams.hold` (`:46-49`). Edit re-read hold cap `EDIT_HOLD_CAP_MS` 15 s (`src/runtime/spikes/editReread.ts:9`); its seam only handles the newest row (`:131-142`).
- **Host timing.** ST builds `coreChat = chat.filter(...)` of the same row objects (`SillyTavern-MainBranch/public/script.js:4496`) and runs interceptors before prompt assembly (`:4564`); group rounds hold `is_group_generating` (`scripts/group-chats.js:982`, `:1078`) and await `Generate` per member (`:1063`). Not yet verified: that no prompt text is copied out of rows before the interceptor returns (S0).
- **Fingerprints.** `fingerprintOf` hashes `mes`/`is_user`/`name` (`src/runtime/fingerprints.ts`); captured in the boundary's save (`src/runtime/chatSave.ts:84`); `reconcile` rolls back an eventless change (`:162`). A pre-commit write should be captured as the consumed text; unproved (SUMMARY §4).
- **Revision consumers.** K6b: `observeRenderedReasoning` at `CHARACTER_MESSAGE_RENDERED` (`src/runtime/wiring/generation.ts:154`); `reasoningStale` compares the row's `mes` hash with the rendered one (`src/runtime/reasoningRevision.ts:21-25`) and `withoutStaleReasoning` drops `extra.reasoning` from such rows (`:27-31`); both the reasoning harvest (`src/runtime/coordinators/extractionCoordinator.ts:471`) and the inner-beat carry (`src/runtime/innerBeatHost.ts:36`) consume only that filtered input. A polish therefore **removes that reply's thought from carry and harvest** (P0 below). K13: `messageRevision` (swipe id + text hash, `src/runtime/yourMove.ts:14-17`) keys talk decisions, the your-move chip and warden `noteAppliedTo` re-arm (`src/runtime/noteRevision.ts`). A polish changes that revision.
- **Schema.** `RosterMember` has no polish field (`src/engine/schema.ts:326-339`); plan v2.9 02 adds `RosterMember.polish?: RosterPolish` (`RosterPolish extends DeliverySheet` + `dialogue?: "keep" | "voice"`, `enabled?`; `DeliverySheet` = `notes`, `prefer`, `avoid`, `tics`, `rhythm`, `by_mood`; `engine/deliverySchema.ts`; `02-roster-voice-prevention.md` §Schema). No story-level polish policy. `usesGameLayer` detects lazy fields by a closed list (`src/engine/validate/gameLayer.ts:25-33`); `polish` is not on it.
- **Settings.** Story feature policies are `FEATURE_POLICY_FIELDS` (`src/engine/featurePolicy.ts:15-40`) with controls in `FEATURE_CONTROLS` (`src/runtime/featureControls.ts:21`); chat overrides live in `extras.overrides` (`src/runtime/settingsControl.ts:43-47`) and feed `resolveFeatures` (`src/runtime/snapshotBuilder.ts:440`). No `polish` id.
- **Held secrets.** `knownEntities` tracks entity disclosure (`src/engine/codex.ts:97`); content restating a secret is caught only by `keptFrom` (`src/memory/heldSecrets.ts:51`).
- **Route.** `PASS_ROLES` has no `polish` (`src/extraction/passRole.ts:1`); `AUTHORING_DEFAULT_HARNESS` = opencode `openai/gpt-6.1-sol` (`src/runtime/passProfiles.ts:81`), `roleDefaultFrom` (`:94`) applies it to authoring only; other unset roles fall to the memory model (Artemis, busy streaming the next member).
- **Signals.** `mineRepetition` pools all replies (`src/stagecraft/repetition.ts:65-79`, `replyTexts` `:80`), author view only (`src/runtime/snapshotBuilder.ts:348`); per-speaker mining is v2.9 02.
- **Guard building blocks.** Agency clauses (`src/engine/agency.ts:19-45`, `PLAYER_ACTION_CLAUSE`, `PLAYER_ATTEMPTS_CLAUSE`); `speaksForPlayer` (`src/wizard/cardChecks.ts:49`); `knownEntities` (`src/engine/codex.ts:97`); `stripReasoningBlocks` (`src/extraction/parse.ts:56`); `isThoughtOnlyReply` (`src/runtime/emptyReply.ts:27`).
- **DOM rule.** `architecture.test.ts:98-116` guards `.mes_block`/`.mes_text` writers; `updateMessageBlock` is a host call already used by `rewriteReplyText`.
- **Bundle.** Main budget 1,300,000 B (`webpack.config.js:7`); 2,373 B headroom at the v2.8 69 record (2026-10-17). Re-measure before S3.

## Options

| Design | Cost | Risk |
|---|---|---|
| A. Await in `MESSAGE_RECEIVED` (Recast) | blocks render and the group loop; N × call latency per round | rejected: same class as gotcha "never await model work in a `MESSAGE_SENT` handler" |
| B. Post-commit rewrite + edit re-read recommit | rollback + second read per polish; past-row change in groups replays later boundaries | rejected as default; manual action deferred |
| C. **Receipt-to-boundary hold, in place, abandon on consumption** (recommended) | one call per signalled reply; hold ≤ 45 s; abandon when anything else read the original | visible swap after stream; lower group coverage; **P0: polished replies lose thought carry and harvest** unless preserved with validated provenance or the owner approves |
| C+. C plus bounded next-generation hold | adds up to the hold to the next member's start | raises coverage; adds wall time; needs every interceptor reader proved downstream of the hold |
| D. New swipe (Lattice apply) | swipe recommit = rollback + re-read per accepted polish; original reachable by swipe-left | reasoning stays on the old swipe (54 carry lost), double boundaries; rejected |
| E. Prevention only (v2.9 02) | zero calls | does not fix what slipped through; built first regardless |

## Recommendation

C, behind S0, S2 shadow and S3 isolated-lane evidence; C+ only on owner approval. One sectioned call, signal-gated, editing finding sentences only.

**P0 owner gate (thought carry).** As designed, an accepted polish makes `withoutStaleReasoning` drop that reply's reasoning, so inner-beat carry and the reasoning harvest lose it: a functional reduction of thought carry, not "inner voice untouched". **S3 cannot land with this reduction without explicit owner approval. S0/shadow work may proceed; automatic writes require preserved carry with validated provenance or an approved exception.** Never bypass the stale-reasoning check, and never relabel the old thought as evidence for the changed text.

### Timing contract (answers challenge 1)

- A polish candidate for row `id` is **live** from receipt until it writes or is abandoned. Its record: `{chatId, id, sendDate, swipeId, startHash, findings, startedAt}`.
- **Before every SO consumer, before `fireAfterSpeak`.** `TurnBridge.enqueueBoundary` gets one injected seam, `polish.settle(id)`, awaited before `fireAfterSpeak` (`turnBridge.ts:166`). The entry stays unready; `flushPending` already stops there. The seam is idempotent and decides eligibility itself, so listener order (polish vs TurnBridge vs leak repair) cannot skip it (v2.8 69 K6 four orders).
- **Consumption ledger.** The original counts as consumed, and the candidate is abandoned, on the first of:
  - `GENERATION_STARTED` in that chat after receipt (any type: loud, quiet, impersonate; ours, ST's or a third party's — `generateQuietPrompt` is a full `Generate`, SUMMARY host facts);
  - `MESSAGE_SENT` (the player answered what they saw);
  - `CHAT_CHANGED`, any mutation of that row, `GENERATION_STOPPED` on that row;
  - the hold deadline (45 s absolute from receipt);
  - a write-time mismatch (token, same row object, `swipe_id`, `fingerprintOf` = `startHash`).
  Default (owner may change): **abandon**. A pending-boundary hold alone is not treated as sufficient (triage §03).
- **Bounded next-generation hold (C+, owner decision).** First step of the talk interceptor through the existing `holdForChat` seam, capped, before talk direction, inner beat, lore intercept and chapter recall. `GENERATION_STARTED` listeners (lore select at start, third parties) still run before it; S0 enumerates them, and any that reads row text keeps the abandon rule.
- **Group rounds.** No speculative overlap claim. Member k's polish races member k+1's start; under the default it usually abandons. Coverage is measured (floor: ≥ 50 % of eligible group targets evaluated) and full-round latency, exposure time and wasted calls are reported (challenge 5).
- **Not eligible in v1:** player rows, impersonate, thought-only replies, stopped partials (A02 undecided; v1 never polishes a row ended by `GENERATION_STOPPED`), scripted NPC replies (authored text), rows with `is_system`, a stored-swipe recommit, the already-read prefix of a continue (only the continued suffix is a window; if the prefix changed, skip).
- Speaker resolves from the row `name` through 02's delivery-local pure resolver over card names and aliases (unique match only; collisions and unresolved rows are not eligible), never `characterId` (SUMMARY host fact) and never the first-match `rosterIdForName` (`src/runtime/roster.ts:77`) directly.
- Any candidate live when the played story is swapped (`applyStoryUpdate`) or the chat closes is abandoned (reason `story-updated`); recorded `extras.polish` rows keep their original findings and are never re-derived from the edited sheet.

### Guards (answers challenge 2)

Pure, `src/polish/guards.ts`. Each is structural; none is claimed to prove meaning.

- **Windows and anchors** (Lattice P1, V04): editable windows = the sentences containing a finding span (outside quotes); everything else byte-identical; alignment unique; truncated or reasoning-tagged output refused; one attempt.
- **Every edit closes a finding** (simulation-blackboard P2): each changed window must have held a finding, and that finding's count must go down; a window with no reduction refuses the whole result as "no change".
- **Dialogue frozen in v1** (default; voice rewriting is an owner decision): ordered quoted spans byte-identical.
- Entities and numbers: output proper nouns and numbers ⊆ the window's input.
- Polarity and modality: counts per window of negations (`not`, `never`, `no`, `n't`, `nothing`, `refus*`, `deny*`), modals and second-person subject constructions unchanged.
- Player action: `speaksForPlayer` and `{{user}}`/player-name-subject counts not raised; applies under `never_narrate_player_action`, extended under `player_attempts_only` (`agency.ts`).
- Length band per window 0.7–1.3, whole reply 0.85–1.1; markup counts equal; avoid/tic and repetition hits for this speaker never rise anywhere.
- Held secret: a changed window that `keptFrom` flags against the resting audience when its original did not → refuse.
- No-op after whitespace normalisation → no write.
- **Two fixture sets, both frozen before any inference** (the writer `src/services/stHost/chatMessages.ts:18` supplies no semantic safeguard; the guards are structural only):
  - **Structural refusal fixtures** (jest, 100 % refused, not a floor): explicit structural violations only: negation token dropped/added, modal changed, added name or number, added player-subject act, quote byte change, text outside a window changed, window with no finding reduction, truncated or reasoning-tagged output, length band breach, instruction-injection text copied into output (V10).
  - **Semantic challenge fixtures** (scored, not asserted refused): changes the structural guards cannot see, e.g. accept→refuse with equal polarity counts, tense shift, mental-state swap ("hid her fear" → "showed no fear"), knowledge swap ("knew" → "guessed"). Guard-passing semantic changes are counted and scored independently (independent rater) and reported; the acceptance floor of zero independently identified changes on accepted outputs is unchanged. The plan never claims this set is deterministically refused.

### Inputs (answers challenge 4)

- **Style projection** only, built per call: the speaker's `RosterPolish` fields from v2.9 02 (`notes`, `prefer`, `avoid`, `tics`, `rhythm`, the `by_mood` line for the current mood; `dialogue` read as policy, not sent), or story `polish.narration` (02's `NarrationSheet`) for an `omniscient` narrator, minus any string naming an entity `knownEntities` does not know at this boundary or a name `withheldNames` holds, **and minus any sentence the resting-audience content filter (`keptFrom` against held secrets, `src/memory/heldSecrets.ts:51`) flags**, applied again at write time if the candidate waited; findings (span, kind, phrase); the reply with windows marked; the last 2 visible non-system messages as context, read-only.
- Never: cards (personality, description, `mes_example`), memory tiers, private/epistemic blocks, inner beat, `extra.reasoning`, blackboard, codex, lore or lore keys, rumors, promises, other members' polish blocks.
- Supplied text is framed as reference data (V10); the guards, not the framing, are the boundary.
- Ignore list for any lexical check (V08): only names present in the input plus known entities; never hidden codex names or lore keys; no external spelling service in v1.
- Validation: plan 02 owns the member-sheet validator (warning `delivery-names-unknown-entity`, `02-roster-voice-prevention.md` S1); 03's `validate/polish.ts` validates `polish.narration` with 02's `readNarrationSheet` (same rule). Authored placement is not treated as proof of safety: the runtime content filter above runs regardless.
- Held-secret fixtures (S1 jest + S2 lane): a secret restated with only known names in a member sheet; an omniscient narrator who privately knows it (narration sheet and narrator replies); a secret introduced after the candidate started (filter re-run at write time refuses).

### Reasoning and inner voice (answers challenge 3)

- Play reply thinking, budget overlay and the inner-voice pipeline are not switched off; the polish route keeps its own effort default. **Inner voice is not "untouched": see P0.**
- New writer leaves `extra.reasoning` and `swipe_info[].extra.reasoning` bytes in place. Retaining reasoning bytes alone is insufficient: consumers read through `withoutStaleReasoning`, which drops them once `mes` changed.
- **P0 — thought-carry reduction (owner gate).** K6b stays authoritative: after a polish, `withoutStaleReasoning` (`src/runtime/reasoningRevision.ts:27`) drops that reply's reasoning from inner-beat carry (`src/runtime/innerBeatHost.ts:36`) and the reasoning harvest (`src/runtime/coordinators/extractionCoordinator.ts:471`). This is a functional reduction. **S3 cannot land with this reduction without explicit owner approval. S0/shadow work may proceed; automatic writes require preserved carry with validated provenance or an approved exception.**
  - Preserved-carry path (proposal, to be designed and validated before S3): S3 records a provenance edge `{sendDate, swipeId, from: startHash, to: polishedHash, findings}` in `extras.polish`; a consumer may read the original thought through it only when the edge is validated (edge present, `to` = current `mes` hash, `from` = the rendered hash K6b recorded, accepted by guards, no later edit/swipe) and S2/S3 show zero mental-state changes on accepted outputs. The stale-reasoning check is never bypassed for any row without a validated edge, and the old thought is never relabelled as evidence for changed meaning.
  - Without that design validated, the only way S3 lands is an owner-approved exception; S3 records the count of carry/harvest hides per arm either way.
- K13 revision consumers get explicit, per-consumer rules (S0 census): your-move chip follows the edge (else the chip vanishes after a polish), talk decision and warden `noteAppliedTo` treat the polished revision as the same reply (no re-decision, no re-arm), expression picks may re-pick. Reasoning does not.

### Slices

Merge contract: S0 and S1 each build, gate and merge alone. S2 and S3 build on one branch and merge together, only after S0's census, S2 shadow faithfulness/preference evidence, S3 isolated-lane integration evidence and the P0 owner gate.

- **S0 — timing and ownership spike (D, no model; may start after 02 lands).** Deterministic stand-in polish (debug seam returning a fixed transform after a configurable delay). Prove, as review tests and a no-model lane scenario:
  - written before `fireAfterSpeak` and commit; generated NPC reply prompt reads the polished text;
  - commit fingerprint = polished hash; 0 rollbacks, 0 eventless-change journals (K6 third leg, 4 listener orders);
  - every abandon trigger abandons, including a quiet generation and a third-party `GENERATION_STARTED`;
  - a read scheduled before the write never applies the old quote (V13, Lattice P3, extends K8);
  - group round: consumption ledger marks k consumed at k+1's start; C+ hold variant measured for every reader listed between `GENERATION_STARTED` and prompt assembly;
  - swipe-left/back shows the polished swipe; continue polishes only the suffix; edit wins;
  - K13 census rows, K6b hide (count carry/harvest drops per stand-in polish: the P0 baseline).
  Output: consumer census list in the plan record. No feature ships from S0.
- **S1 — pure core (D).** `src/polish/` lazy chunk: windows/anchors (Lattice algorithm adapted, MIT attribution), guards, style projection (reads 02's `RosterPolish`/`DeliverySheet` types, held-secret content filter), prompt builder (one sectioned prompt: avoid/tic section, repetition section; strict output contract, `stripReasoningBlocks`), `maxTokens` = input window tokens × 1.2 rounded to 64. Structural refusal set and semantic challenge set, both frozen. No host imports.
- **S2 — route + shadow (D build, CL/RP acceptance; branch, merged only with S3).**
  - Pass role `polish` ("Reply polish") in `PASS_ROLES`; default route per owner decision (proposal: harness sol via `roleDefaultFrom`; never Artemis by default; DeepSeek fallback only, on auth/quota/transport failure, never an ordinary choice). Held or outage route = keep original, silently for the player; existing `model-role-outage` names it for the author.
  - Story root `polish?: { mode?: "auto" | "shadow" | "off"; narration?: NarrationSheet }` (03 owns this policy; `DeliverySheet` and member `RosterPolish` stay 02's, `engine/deliverySchema.ts`). `validate/polish.ts` in the game layer (lazy); `polish` added to `usesGameLayer` detection (`src/engine/validate/gameLayer.ts:25`), parsing and normalized copying, so a story whose only new content is `polish` loads the chunk; fixture `polish-only.story.json` (no codex, quests, life or checks). `storyDiff` compatible.
  - Settings through the resolver 09 reuses: register story feature `polish: { enabled: toggle, mode: choice("auto", "shadow", "off") }` in `FEATURE_POLICY_FIELDS` (`src/engine/featurePolicy.ts:15`) and its controls in `FEATURE_CONTROLS` (`src/runtime/featureControls.ts:21`; install paths `polish.enabled`, `polish.mode`; install-only tuning `polish.holdCapMs` 45000, `polish.maxPerHour` 40, `polish.chip` true as a settings delta). Precedence: install master → authored story `polish.mode` default → chat override in `extras.overrides` (`settingsControl.feature`). `extras.ui` holds display state only. Feature registry entry, controls `#so-feature-polish-<field>`, `npm run docs:settings`; extend 09's state mapping and parity fixtures with `polish`.
  - Triggers (signals only): a hit on 02's `avoid` or `tics` for this speaker, or this speaker's per-speaker repetition readout non-empty (02's `mineRepetitionBy`), honouring 02's over-use thresholds so defining mannerisms are not throttled (N21). `RosterPolish.enabled: false` → no polish for that member (02's `delivery` feature switches only the private line, not polish). `every` not offered in v1.
  - `extras.polish` ring (author-only, cap 200): candidate, findings, guard verdict, abandon reason, latency, provenance; rolled back by message (`quarantine`), like other rings.
  - `shadow` mode: runs and records, never writes. **Shadow evidence covers faithfulness and preference only** (zero-change rating, pairwise preference, attribution gain, guard refusals, call latency); it cannot show accepted-write latency, downstream consumer behaviour, full-round latency or next-speaker use of revised text, because the transcript never changes.
  - Check `two-polishers` (`degrades`, Recast autorun on) with player copy and firing fixture.
  - Studio: story Presentation group "Reply polish" (mode, narration voice); typed `setStoryPolish(patch)` in `mutations.ts` + wizard tool (`tools.test.ts`). Member fields are 02's Studio group.
  - Guide `<!-- topic: story-polish -->` (copy: "polish edits wording, never what happens"), compact twin in `guideTopics.ts`, `npm run docs:guide`.
- **S3 — auto write (D build, RP acceptance; merges with S2 only after S0 census, S2 shadow evidence, its own isolated-lane integration evidence and the P0 owner gate).**
  - **Isolated-lane integration measurement** (lane 30+, `mode: "auto"`, before merge): accepted-write latency (receipt → write p50/p95, 45 s deadline), downstream consumer behaviour (fingerprint = polished hash, no eventless rollback, reads apply polished text), full-round latency delta, exposure time, next-speaker use of revised text, carry/harvest hides. Same 100-reply denominator, ≥ 50 % group coverage and latency floors.
  - `stHost/chatMessages.ts` `polishReplyText(id, mes)`: writes `mes` + `swipes[swipe_id]`, no reasoning, no `MESSAGE_EDITED`, `updateMessageBlock`, `WriteResult` (`typedResults.test.ts`).
  - `TurnBridge` `polish.settle` seam; consumption ledger; `RunToken` per candidate, re-checked before the write; ownership census rows.
  - Inline chip under the message (`components/inline/`, level 1 Story): `Polishing…` → `Polished · show original` (popover from `extras.polish`, never touching message DOM). New player surface: owner decision (00-overview rule 4). Storybook story.
  - Revision provenance edge and the per-consumer K13 rules from S0.
- **Optional, outside v1 acceptance, each dependent on its own owner decision.** C+ bounded next-generation hold; `dialogue: "voice"` windows (02's `RosterPolish.dialogue`; attributed quotes in a member's own reply only); rhythm/tension sections; `polishFaithful` judge use (refused `uncalibrated` until a calibration row passes); manual "Polish this reply" on the newest row via edit re-read. None is a v1 slice.
- **Deferred to v3.0.** LanguageTool before/after guard (server plugin, reserved port, tray entry; per-member rule profile, generated ignore list; triage V07). Reopen only if accepted polish outputs introduce grammatical damage the existing guards miss.

## Predeclared floors

Informational; frozen before inference; never retuned. Denominator: **100 eligible replies**, including group rounds, swipes and continues; real Artemis replies with thinking and inner voice on. Arms: baseline, prevention-only (v2.9 02), prevention + polish.

- Accepted outputs: **zero** independently identified event, knowledge, agency or mental-state changes (independent rater, not the polish model).
- Polish preferred **≥ 60 %** in blind pairwise rating.
- Blind speaker attribution gain **≥ 10 points** versus prevention-only.
- Latency receipt → write **p50 ≤ 12 s, p95 ≤ 30 s**; absolute hold deadline **45 s**.
- **≥ 50 %** of eligible group targets successfully evaluated (not a last-member-only result).
- Reported, no floor: guard refusal rate, abandonment rate by reason, wasted calls, full-round latency delta per arm, exposure time (raw text on screen before swap), k+1 quoting a changed k phrase, thought-carry hides, calls/hour vs `maxPerHour`, quota-hold incidents.
- Evidence split: rating floors (zero changes, preference, attribution) from S2 shadow; latency, coverage and consumer properties from S3 isolated-lane auto runs. Both required before S2+S3 merge.
- Deterministic (jest, not floors): structural refusal set 100 % refused; semantic challenge set scored and reported (guard-passing changes counted), never asserted refused; S0 order/abandon/fingerprint cases all green.

## Gates by tier

- **S0, S1 (pure + review tests):** `npm run gates:quick` per change, `npm run typecheck:test`; plan close `npm run gates` (Storybook included). S0 also a no-model lane scenario ×2 (`st-lanes.mts`, lanes 30+), cleanup clean.
- **S2, S3 (runtime / UI / ST-facing):** above + `npm run build`, `npm run stage`, `npm run test:release` where tooling changes; live gate via the `debug` skill on a lane: `st-navigation.mts recent-group` → `so-state.mts current` → polish scenario; real generation (`send_generate`) and a real polish route (no `debugResponse`) for sign-off. If the route or backend cannot run: say so, gate NOT green.
- **Acceptance (CL + RP/LT):** frozen corpus, prompts, scorer, routes and settings; independent rater; Artemis replies on an authorized window; evidence archived to `so-sessions` (`so-evidence.mts archive`, `npm run sessions:archive`); public record counts and fingerprints only.

## Privacy and spoiler notes

- Inputs are already-visible transcript text plus a style projection filtered by name (`knownEntities`, `withheldNames`) **and by content** (resting-audience `keptFrom` against held secrets, re-run at write time); authored or private placement alone is not treated as proof of safety. Nothing private, held or epistemic reaches the call, so no shared-tier route for a held secret is added; a polished window that newly restates a held secret is refused.
- Reply text goes to the polish route (cloud harness by default): same class as Ask and wizard traffic; owner decision with the route.
- `extras.polish` holds original and candidate text: author-only, never in player projection; "show original" shows only text the player already saw.
- Shadow candidates never reach a player surface. Player surfaces identical with and without a held secret.
- Measurement on campaign material: rater is another model; owner-facing reports carry counts only.

## Invariants touched

- **STAPI only:** one new `stHost/chatMessages.ts` writer answering `WriteResult`.
- **Engine purity:** polish core in `src/polish/` (pure, lazy), not `engine/`; no blackboard or memory writes.
- **Message DOM:** host re-render via `updateMessageBlock`; chip through `inlineMount.ts`; re-check `architecture.test.ts` counts.
- **RunOwnership:** a `RunToken` per candidate, checked before the write; ownership census rows classified.
- **Boundary order / one transition / rollback ≡ replay:** the write precedes the boundary or never happens; consumers read one text; the ring rolls back by message. Not a boundary work entry (it precedes the boundary).
- **Thought-only reply is not a turn; thinking overlay; thought-leak repair:** untouched; polish chained after repair.
- **K6b / K13 revision binding:** kept, with explicit provenance and per-consumer rules; the stale-reasoning check is never bypassed. Reasoning follows the edge only once validated provenance is designed and accepted; otherwise S3 needs the owner's approved exception (P0).
- **One check registry:** `two-polishers`; `model-role-outage` reused.
- **Model routes:** new role through `resolveRoute`; context-limit refusal before sending.
- **Main bundle budget:** only the seam and writer in main; everything else lazy.
- **Every feature on by default:** `mode: "auto"` once S2+S3 land together (S2 is not merged alone: avoids silent shadow quota spend). On by default does not override the P0 gate: S3 does not land without preserved carry or owner approval.
- **Feature policy / overrides:** `polish` in `FEATURE_POLICY_FIELDS`/`FEATURE_CONTROLS`, chat override in `extras.overrides`, resolved by `resolveFeatures`; nothing in `extras.ui` but display.
- **Story update:** live candidates abandon on swap; recorded rows keep their original findings (no regeneration from the edited schema).

## Dependencies and links

- v2.9 02 (`02-roster-voice-prevention.md` §Schema): owns `DeliverySheet` and `RosterPolish` (`engine/deliverySchema.ts`; `notes`, `prefer`, `avoid`, `tics`, `rhythm`, `by_mood`, `dialogue`, `enabled`), the delivery-local speaker resolver, `mineRepetitionBy`, the member validator, Studio group and `setMemberPolish` tool. 03 reads `avoid`/`tics` as removal targets, `dialogue`, `rhythm`, `notes`, `enabled`; it never extends the member block without amending 02. Supersedes `per-character-polish.md` P1(1).
- v2.9 09: `polish` joins 09's state mapping and parity fixtures when it lands.
- v2.8 69 K6/K6b/K8/K13 (receipt vs genuine rewrite, reasoning revision, interop fixtures, revision binding); v2.8 54 (thought carry), 43 (recall); A02 stopped-partial decision (K13 fold).
- v2.8 31 / 33 records on sol latency and quota holds; v2.8 24 test plan conventions; triage common acceptance list.

## Decisions for the owner

0. **P0 — thought carry (gate for S3).** Automatic polish removes a polished reply's thought from inner-beat carry and the reasoning harvest. S3 cannot land with this reduction without explicit owner approval. S0/shadow work may proceed; automatic writes require preserved carry with validated provenance (design above, accepted on S2/S3 evidence) or an approved exception. Retaining reasoning bytes alone is insufficient.
1. Sol (opencode `openai/gpt-6.1-sol`) as the polish-role default; DeepSeek fallback only (auth/quota/transport failure), never Artemis. AGENTS.md lists Sol for authoring, wizard, Ask and rating.
2. Independent rating route for Sol-written rewrites (proposal: TypeSafe or DeepSeek, not Sol): an exception to Sol-as-rating-default, pending owner decision. Approving it does not authorize model time, a GPU window or a pod.
3. Visible end-of-stream swap and the inline chip (new player surface).
4. Group: abandon once consumed (default) or bounded next-generation hold (C+).
5. Whether dialogue rewriting starts in v1 (proposal: no; quotes frozen).
6. Whether reasoning consumers may read through the validated provenance edge (the preserved-carry path of P0; proposal: only after zero mental-state changes are shown on accepted outputs).

## Unresolved questions

- Does any ST step copy row text between `GENERATION_STARTED` and interceptor return (S0 must answer before C+ is offered)?
- Is `maxPerHour` 40 right for a quota-limited subscription route, and does a quota hold need its own author line beyond `model-role-outage`?
- Which K13 consumers besides the your-move chip need to follow the edge?
- Campaign adoption: after the prevention-only arm is measured (02), then polish counts.
- Can validated provenance preserve carry without weakening K6b for any other edit path, or is an owner exception the only realistic route to S3?

## Review 2026-10-21 (sol)

- P0 — thought carry: applied. Labelled P0 in Status, Current state, Options C, Recommendation (owner gate paragraph), Reasoning, S3, Invariants, Decisions 0. Text: "S3 cannot land with this reduction without explicit owner approval. S0/shadow work may proceed; automatic writes require preserved carry with validated provenance or an approved exception." Stale-reasoning check never bypassed; old thoughts never relabelled. Code re-verified: `reasoningRevision.ts:21-31`, `innerBeatHost.ts:36`, `extractionCoordinator.ts:471`.
- P1 — adversarial gate contradiction: applied. Split into frozen structural refusal fixtures (100 % refused) and semantic challenge fixtures (scored independently, never asserted refused); zero-change acceptance floor unchanged; writer has no semantic safeguard (`chatMessages.ts:18-30`).
- P1 — S2 cannot measure all properties: applied. Shadow = faithfulness/preference; S3 isolated-lane integration measurement for write latency, consumers, full-round latency, next-speaker use; same 100-reply denominator, 50 % group coverage, latency floors. "Each builds and gates alone" replaced by S0/S1 independent, S2+S3 joint merge contract.
- P2 — LanguageTool as a slice: applied. Moved to "Deferred to v3.0" (V07 reopening condition); C+, dialogue voice, judge use, manual polish marked optional, outside v1 acceptance, each its own decision.
- Cross P1 — held-secret content filter: applied. Style projection filtered by `keptFrom` (`heldSecrets.ts:51`) besides names, re-run at write time; guard refuses a window that newly restates a secret; fixtures for known-names secret, privately knowing narrator, secret introduced after start. Placement-as-safety claim removed.
- Cross P1 — settings via resolver: applied. `polish` in `FEATURE_POLICY_FIELDS` (`featurePolicy.ts:15`)/`FEATURE_CONTROLS` (`featureControls.ts:21`), chat override in `extras.overrides` (`settingsControl.ts:43-47`, `snapshotBuilder.ts:440`), precedence install → authored → chat; `extras.ui` display only; 09 mapping extended.
- Cross P1 — new-only stories: applied. `polish` added to `usesGameLayer` (`gameLayer.ts:25`), parsing, normalized copy; `polish-only` fixture.
- Cross P1 — story-update reconciliation: applied (03 has no authored-definition-bound pending work beyond live candidates): candidates abandon on swap; recorded rows keep original findings.
- Cross P2 — model routing: applied. Sol default, DeepSeek fallback only; rater exception pending owner, no model time/GPU/pod authorized.
- Brief — schema reference: `per-character-polish.md` P1(1) replaced by 02's `RosterPolish`/`DeliverySheet` (`engine/deliverySchema.ts`); `banned_tics` → `tics`; `narration` = `Omit<DeliverySheet, "by_mood">`; speaker via 02's delivery-local unique-match resolver, not first-match `rosterIdForName` (`roster.ts:77`).

## Gate record 2026-10-21 (v2.9 build, branch v2.9-03-polish)

Built on master `65aebaa0` in `C:/dev/so-v29-03-polish`. No GPU, no model call, no lane, not staged. Scope per owner decisions 2026-10-21: S0, S1, S2. **S3 not built** (automatic write + chip; P0 thought-carry gate).

Built:
- **S1 pure core** (`src/polish/`, lazy): `text.ts` (quotes, sentences never split inside a quote, word-edge phrase spans), `windows.ts` (findings outside quotes: avoid, tics past 02's threshold, this speaker's repeats; finding sentences = windows, neighbours merged; anchor alignment, unique, idea from Lattice credited in THIRD-PARTY-NOTICES, no code copied), `guards.ts` (finding reduced, quotes frozen, added name/number, negation, modal, second person, player action, length bands 0.7-1.3 / 0.85-1.1, markup, target rise, held secret via resting filter, copied reference text, no-op = unchanged), `projection.ts` (02's sheet minus withheld names and resting-filtered sentences), `prompt.ts` (one sectioned prompt, 2 context lines, `[n]` output contract, `stripReasoningBlocks`, maxTokens = window tokens x 1.2 rounded to 64), `plan.ts`, `ledger.ts` (eligibility, consumption ledger, write-time mismatch).
- Frozen fixtures (sha256 pinned in `guards.test.ts`): `test/fixtures/polish/structural-refusals.json` 21 cases, 21 refused with their code (+ accepted and unchanged controls); `semantic-challenges.json` 8 cases, scored only: 5 pass the guards (mental-state, knowledge x2, event dropped, relation swap), 3 refused by length band. The guards do not prove meaning; the zero-change floor needs the independent rater.
- **S0 spike** (debug only, no feature ships): `TurnBridge.setReplySettle` seam awaited before `fireAfterSpeak`; stand-in polish `runtime/polish/standIn.ts` behind `globalThis.storyOrchestratorDebugPolishStandIn` (find/replace after a delay) with lazy writer `stHost/polishWrite.ts` (`mes` + `swipes[swipe_id]`, reasoning bytes untouched, `WriteResult`); review test `polishStandIn.review.test.ts`; no-model scenario `test/scenarios/v29-03-polish-standin.json` (schema-checked, evals parse).
- **S2**: pass role `polish` "Reply polish" (default sol harness when offered; DeepSeek only as the failure fallback; never the play model: an unrouted polish role resolves to the memory model as `fallback`, which shadow treats as no route and sends nothing, and `defaultFallbackRoute` never returns the memory model for it); self-test run; story root `polish {mode, narration}` (`engine/polishSchema.ts` augmentation, `validate/polish.ts` in the game layer, `usesGameLayer`, `polish-only.story.json`); feature `polish {enabled, mode}` with story `polish.mode` as authored default in `resolveFeatures`; shadow runner `runtime/polish/shadow.ts` (records `extras.polish`, cap 200, rolled back by message, never writes, `consumedBy` from the ledger, hourly cap); check `two-polishers` (Recast auto-run); Studio Presentation `ReplyPolishEditor` + `setStoryPolish` mutation + agent tool; feature `reply-polish`, `FEATURE_STATE` row, settings copy, guide topic `story-polish` (+ compact twin), `npm run docs:guide`, `npm run docs:settings`, plan 24 matrix row, ownership census and error-copy rows.

S0 consumer census (jest, real RuntimeManager + TurnBridge, four listener orders):
- Written before `fireAfterSpeak` and the commit; the NPC-reply pass reads the polished text; commit fingerprint = polished text; 0 rollbacks, 0 eventless-change journals at the next boundary.
- Abandon: quiet generation, third-party `GENERATION_STARTED`, next group member's start (k consumed at k+1's start), `MESSAGE_SENT`, edit (edit wins), `GENERATION_STOPPED` on the row, row replaced without an event, hold deadline. A dry run does not consume.
- Swipe left and back shows the polished swipe; continue polishes only the suffix.
- A read of the row runs at or after its boundary, which waits for settle: covered by order, not separately exercised.
- K6b: every stand-in write on a reply with reasoning hides that reasoning from carry and harvest (`carryHides` 1 per write, `withoutStaleReasoning` drops it): the P0 baseline.
- K13: a polish is a new `messageRevision` (same swipe id, new hash): your-move chip, talk decision and warden `noteAppliedTo` would treat it as a new reply. Per-consumer rules are S3 work.
- SO `GENERATION_STARTED` listeners before prompt assembly: lore select at start (`loreSelectTiming.ts`), generation wiring `onStarted`, `requirementsWatch`; third parties unknown. Default kept: abandon once consumed. C+ not built.

Gates on `e7515aaa`:
- `npm run gates -- --no-storybook` (no `--resume`): `gates: all green in 216.3s` (typecheck, build, typecheck:test, debug:typecheck, test:debug, test:release, test:replay 32 of 32 killed, test 864 suites / 10061 passed + 1 skipped, test:plugin, lint).
- Storybook alone on :6203 (`npm run storybook:build`, then http-server + test-runner `--maxWorkers 2`): 161 suites / 970 passed.
- `npm run gates:quick` green before commit.
- Main bundle `dist/index.js` 1,298,198 B (master 1,297,590; +608). Headroom made by loading the extension-conflict scan lazily (`wiring/lore.ts`; `vectorsWorldInfoOn` moved to `stHost/vectorsWorldInfo.ts`); polish host loads with the spikes chunk.

NOT run:
- No-model lane scenario v29-03-polish-standin x2: unmerged branch, no staging (wave 2).
- S2 shadow faithfulness/preference/attribution (100 Artemis replies, independent rater), any real polish route call: no GPU (owner 2026-10-21).
- S3 isolated-lane measurements: S3 not built.

Deviations:
- `mode` is `shadow | off`; `auto` waits for S3. On by default means shadow is on: with sol offered every reply with a finding makes one call (cap 40 an hour). The plan said S2 must not merge alone to avoid silent shadow quota spend: integrator/owner decision.
- Install settings are `characters.polish`, `characters.polishMode`, `characters.polishMaxPerHour` (not `polish.*`); hold cap is a constant 45000 ms; no `polish.chip` (S3).
- No Studio coverage row for `polish` (optional policy; a gap would make the wizard propose it).
- Stand-in accepts `includeScripted` so a no-model lane's `/sendas` rows count; shadow never holds the boundary.
- Test mocks in `generationWiring` / `loreForceWiring` review tests now keep the generation wiring's subscriber (polish adds a second `GENERATION_STARTED` subscriber).

### GPU run 2026-10-22

- Window 2026-10-22 ~21:23-23:20 local (00:23-02:20Z), local 3090 via the controller (`cli.mjs automatic`, text loaded clean
  after the earlier `crashed` code-1 status). Lanes 41 (master `a082a064`, served bundle `cb12b358`) and 42 (`v2.9-03-polish`
  `639ae53c`, bundle `33506e23`, staged into the ST code copy `C:/dev/st-v29-08`), both `--allow-local --headed`, images and sprites
  off in the lane copies, profile `Artemis RunPod RP` -> :18888, context 32768, thinking and inner voice on. Group
  `Group: Arin, DM Narrator` (the lane copy also drafts two members outside each story's roster).
- Rater: opencode `openai/gpt-6.1-sol` (`opencode run`, frozen prompt in the evidence folder). Evidence
  `C:\dev\so-lanes\41\debug\v29gpu\`, `C:\dev\so-lanes\42\debug\v29gpu\` (+ each lane's `debug/runs/`), archived to so-sessions.
- Pilots are NOT the predeclared corpora: small N, fixed fixtures, no frozen 40/100 denominators. They say whether the path works
  with the real model and which way a floor leans; no floor below is claimed met.
- Two model lanes shared one GPU: memory-model calls queued behind the other lane's replies (inner beat timeouts at 35 s,
  suggestions at 50 s, below). Environment, not a product change; recorded.
- Merge: master merged into `v2.9-03-polish` (`639ae53c`: cues/echoes unions in feature policy, controls, settings, copy,
  game layer, coverage test, wiring; generated guide/settings regenerated; arrival golden re-recorded; `runtimeManager.ts` one line
  packed for the 700 budget; polish agent tool specs moved to `copilot/agent/polishTools.ts` for the S3 600-line file budget).
  `npm run gates -- --serial` on `6524a1ba` (no `--resume`, Storybook included): `gates: all green in 532.7s` (test 881 suites /
  10307 passed + 1 skipped, test-storybook:ci 165 suites / 993, test:debug 1490/0, test:plugin 342/0, replay 32 of 32 killed).
- Shadow run 1 `test/scenarios/v29-03-polish-shadow.json` (free play, 12 `send_generate` turns, prevention on): 22 replies, 1 eligible
  (narrator, 2 avoid findings), 1 sol call accepted in 5.5 s, consumed by the next member's start. 02's line removed every Arin
  finding, so polish had almost nothing to do. Cap step vacuous (no eligible reply after it).
- Shadow run 2 `test/scenarios/v29-03-polish-shadow-forced.json` (prevention off in the chat, each turn one forced Arin and one
  narrator reply): 25 replies, 13 sol calls, 15 records: **5 accepted, 6 refused** (`markup-changed` 7, `added-name` 2,
  `added-number` 1), **4 rate-limited**; call latency n 11, p50 7.1 s, p95 12.9 s, max 12.9 s; consumed before the answer by
  `player-sent` 6, `generation-started` 4 (under S3's abandon-once-consumed default 10 of 11 would have been abandoned).
- Sanity (merge condition): no crash, no page error; **chat untouched: `mes` changed 0 of 24, `extra.reasoning` changed 0 of 24**
  (23 with reasoning; hashes at `MESSAGE_RECEIVED` vs the end); **cap honoured**: `polishMaxPerHour` set to the 13 calls made, two
  more turns gave 4 `rate-limited` records and 0 calls, restored to 40 after. Calls/hour: 13 in 14 min of forced play (about 55 an
  hour before the cap); free play 1 in 17 min.
- Finding: 2 of the 13 calls left no record (calls 13, records with a verdict 11): the shadow runner returns without recording when
  its run token no longer owns the row or the story changed after the answer. Spent quota without a ring row; not fixed here.
- Floors NOT run: zero-change, preference >= 60 %, attribution gain >= 10 points (need an independent rater that is not the polish
  model: sol is both here, DeepSeek is pay-per-token), 100-reply denominator. Latency/coverage floors are S3 (not built).
- Thought carry: untouched by construction in shadow (no write); verified by the reasoning hashes above. S3 stays unbuilt (P0).
- Merged to master on this evidence (owner 2026-10-22 "validate these plans and merge them"); deviation from the plan's
  S2+S3 joint-merge contract recorded: on by default means shadow sol calls (cap 40/h) on every story with polish sheets or a
  narration sheet once a reply has a finding.

### GPU run 2026-10-23

- Window 2026-10-23 ~05:40-09:00Z, local 3090 through the controller (`cli.mjs automatic`), ONE model lane at a time: lane 42
  on branch `v2.9-gpu2-fixes` (base master `1b2beb9e`, fixes `137a359b`, served bundle `c28c0dcf`, staged into the ST code copy
  `C:/dev/st-v29-08`), `--allow-local --headed`, images and sprites off, profile `Artemis RunPod RP` -> :18888, context 32768,
  thinking and inner voice on, group `Group: Arin, DM Narrator` (members Luke, Ponticius, Arin, DM Narrator). Lane 41 (master
  `45e4a83b` bundle) served the diagnosis runs before the fix. Rater opencode `openai/gpt-6.1-sol` (frozen prompts in each
  `rate/` folder). Evidence `C:\dev\so-lanes\41\debug\v29gpu2\`, `C:\dev\so-lanes\42\debug\v29gpu2\` (+ each lane's
  `debug/runs/`), archived to so-sessions.
- S2 shadow at plan size (100 eligible replies): NOT run. At the default cap of 40 calls/h and about 1 eligible reply per 2 in
  forced play, 100 eligible is more than 2.5 h of sol calls alone; the independent rater (not sol) stays unauthorized (DeepSeek is
  pay-per-token, judge use uncalibrated).
- Test flake fixed in `137a359b`: `polishStandIn.review.test.ts` waited a fixed 60 ms for a 25 ms stand-in polish and failed
  under full-gates load; it now waits for the stand-in to finish (`untilPolished`). No behaviour change.

## Folds from v2.9 triage (applied 2026-10-25, owner)

- V04 immutable windows/anchors; V08 lexical ignore list; V10 (polish prompt); V13 final accepted text; N21.
- Source: `docs/plans/v2.9/01-triage-sol.md`.

## Owner decision 2026-10-25

- S2 rater: Sol (opencode `openai/gpt-6.1-sol`) instead of DeepSeek; recorded caveat when Sol also wrote the rated text (self-rating). S3 moves to v3.0.
