**The strongest additions are 64 and 66, supported by 67 and selected items from 69. Plans 62 and 63 need revised decision gates before implementation.** There are also disclosure problems in 62, 64 and 65.

Reviewed read-only against checkout `167892d9`. The plans mostly cite `9e96871d`; some “not built” statements are now stale. No tests or live gates were run. P0 below means a design blocker, not an observed production incident.

**1. Triage audit**

**SKIPs to reopen or correct**

| Row | Finding | Recommendation |
|---|---|---|
| V12: context-horizon scoring | A proposed cut does not replace observing what ST actually sends. Budget estimation, other injections and host trimming can move the real horizon. | **FOLD into 63:** compare intended cut with actual transmitted history. |
| V19: presence-filtered ledger | Witness filtering answers “who knows this”; presence answers “which nearby objects/holders matter now.” They are different filters. The source explicitly discusses holder semantics. | **FOLD into 58/ledger work**, retaining audience checks separately. |
| V33: prompt fingerprint tied to calibration | Payload goldens detect prompt changes; they do not automatically invalidate or qualify measurements made against an older prompt. | **FOLD into 67:** record prompt, scorer, model and configuration fingerprints with results. |
| V58: CC `send_if_empty` | Text Completion being the preferred play route does not cover every supported `/trigger` path or cloud validation route. | **BUNDLE with 69 K10:** one no-model CC fixture establishes whether protection is needed. |
| V61: foreign scan filtering | “SO never removes entries” refutes B19, not the possibility that another extension removes SO entries. | Keep deferred if unused, but correct the reason; fold a suppression fixture into interop coverage when relevant. |
| V13 / V32 | Macro suppression is intended to **prevent** duplicate injection. Library JSON is not an export bundle containing referenced cards/books. | Deferral can stand; the claimed substitutes are not equivalent. |
| V47 | Main-reply thought-leak repair does not establish reasoning-template parity for a separately routed extraction model. | Fold a profile-specific fixture into role calibration; implement only on evidence. |

V1 and V60 also deserve explicit compatibility measurements when their respective extensions/settings are active. A warning is useful, but it does not establish that reads remain correct.

**NEWs that should be folds**

- **64 → 18 + 46:** one game-state narration extension, reusing the existing consequence references.
- **66 → 09 + 34:** shared provisioning checks, authoring guidance and read-back.
- **67 → 24 + 35:** test infrastructure and coverage, not a separate product feature.
- **68 → existing HUD/talk work:** small presentation change.
- Keep **65** separate because it introduces a new permanent player surface.
- Keep **62’s measurement separate from its feature**; do not make the proposed Q1 failure automatically authorize stage 2.
- **63** remains a reasonable separate performance experiment.

**Material omissions from the harvest**

Two deserve **P1** treatment:

- **Creative Studio P4: stale draft proposals.** Plan 66 says this is noted in 69, but 69 contains no such item. Acceptance checks whether an operation is valid against the current draft, not whether its target changed since proposal. A still-valid old proposal can overwrite a manual edit. See [loop.ts:382](src/copilot/agent/loop.ts:382).
- **WorldInfo Workspace P4: stale whole-book writes.** `updateWIEntryByUid` loads the cached book, modifies it, saves the whole book, then checks only the target entry. That can overwrite another tab’s changes to unrelated entries while reporting success. B14’s debounce fix and B15’s target baseline do not close this. See [worldInfo.ts:371](src/services/stHost/worldInfo.ts:371).

Other substantive omissions needing explicit FOLD/SKIP rows:

- Recast P2/P5: exact delayed rewrite fixture; stale reasoning after visible-text rewrites → **69 / 54 / 43**.
- ST Memory Books P3 and RPG Companion P5: generation/expression results bound to the rendered swipe identity → **69**.
- Copilot P4: verify blocks in the **actual outgoing request**, not merely registered injection state → **67/69**.
- Multihog P2/P4: realization of meanwhile notes; blob/library size budgets → **50 / hardening**.
- Nemo Plotlight P3: active-persona ownership during writes → **setup tests**.
- Timeline Memory P4: self-contained recall-query rewrite → **43’s experiment**.
- Filigree P4 / Simulation Blackboard P6: quoted evidence for critic findings and resolutions → **critic coverage**.

Lower-value report ideas also lack dispositions: mention cards, travel intents, tri-state scene signals, past-delta overrides, suggestion diversity, portrait style references, ambient mood/voice, ending verdicts, targeted authoring repair, batch undo, manifest lifecycle hooks, unchanged-write suppression, in-flight-promise cleanup, render/clone budgets, optional-tier self-tests, model-call progress, location prose and relationship graphs. They need not be built, but the inventory should not imply they were individually triaged.

The older harvest additionally names injection-write telemetry, requirement provenance/import-from-source, and fresh-state isolation without clear standalone dispositions.

**“Already built” and stale claims**

- The blanket statement that B1–B19 “are fixed in plan 60” is false. Its [Not built section](docs/plans/v2.8/60-extension-harvest-fixes.md:85) explicitly leaves B4/B7/B8/B17 open and identifies B18/B19 as refuted. In particular, **69 K4 depends on an unbuilt B8**.
- Swipe-back reuse **is built**, but 62’s “first A→B→A check” is false: [swipeBack.review.test.ts:97](src/runtime/spikes/swipeBack.review.test.ts:97) already exercises four seeds × 200 cuts. Add browser/model coverage rather than another nominal first test.
- Current code already contains the 51 fresh-beat guard, 52 name folding and general range clamping: [beats.ts:52](src/engine/life/beats.ts:52), [nameFold.ts:40](src/memory/nameFold.ts:40), [blackboard.ts:92](src/engine/blackboard.ts:92). Reconcile their addenda with implementation records.
- 64’s display-clamp claim is stale: [gameSheet.ts:23](src/runtime/gameSheet.ts:23) now uses the actual value.
- 65’s “portrait needs a new host module” is overstated. Existing host code already supplies character image URLs: [sprites.ts:77](src/services/stHost/sprites.ts:77). Thumbnail-specific support may still be worthwhile.

**2. Critical review per new plan**

**62 — Prepared facts: P0 privacy; P1 gate and replay design**

- **P0:** “Narrated” is not “publicly disclosed.” Retiring a prepared secret because `evidenceInWindow` finds it can retire protection after a private aside or thought. Require recipient-specific disclosure under 42’s contract. Closed-list checking must also define which private inputs and resulting warden notes each recipient may receive.
- **P1:** `reachableByCheckpoint` is transitive reachability, not distance one. [buildReachability](src/engine/validate/gates.ts:122) recursively traverses successors. Use outgoing edges or an explicit bounded-distance calculation.
- **P1:** An asynchronous boundary job cannot guarantee completion before the next player action. Specify late-result behavior, conflicting narration, cancellation and accepted-output identity. `inputs/range` provides invalidation, not deterministic regeneration of model output; see [derived.ts:18](src/memory/derived.ts:18).
- **P1 — Q1 is not a sound build gate:** independent inventions about an unstated detail may legitimately differ across alternative swipes. High agreement can reflect a stereotyped answer; low agreement does not prove continuity failure. Q4 likewise rewards agreement even when every answer contradicts the prepared fact.
- With four replies, agreement changes in 0.25 increments: Q1 effectively separates 0.5 from 0.75; Q4’s 0.85 effectively requires unanimity in the median case. Scoring only the first container item hides contradictory additions. A cloud-only memory-off control does not isolate memory’s effect on Artemis.

**Cheaper design:** authored facts or seeded choices from authored alternatives, using existing private-source machinery. First measure **contradiction against a committed fact**, persistence across approaches/revisits, and unauthorized disclosure. Keep cross-swipe diversity informational. Predeclare revised experiments before running them.

**63 — Stepped history: P1 coverage, budget and measurement**

- **P1:** The coverage premise is unsafe. [readCoverageEnd](src/extraction/readCursor.ts:13) returns the greatest audit endpoint, not contiguous durable memory coverage. `compactableEnd` can deliberately return the latest message despite read lag. Neither proves that discarded text is recoverable.
- **P1:** The proposed budget API is for routed side-model calls, not necessarily the active reply model. Use the existing [readPromptBudget](src/services/stHost/contextBudget.ts:19), including response reserve, plus assembled-prompt overhead.
- **P1:** “Derived from rows and the last cut” is stateful hysteresis. Specify reconstruction on reopen, branching, edits anywhere in the covered prefix, settings/model changes and member changes. Identifying only the cut row misses earlier edits.
- **P1:** H6 permits both arms to score zero. Ten cloud probes also cannot establish recall preservation on Artemis’s shorter local context. Add an absolute recall floor, critical-fact strata and a small real Artemis leg.
- **P1 — R2 is useful but insufficient as written:** low prefix reuse does not establish worthwhile latency savings. Compare matched workloads with actual sent-token counts, prefill/first-token latency, warm/cold conditions, same-speaker and alternating-speaker cases, and enough turns to include multiple cuts. Report step costs, not just median reuse.
- **P2:** “Ignoring rows cannot leak anything” is too strong. It cannot add bytes, but altered history can remove secrecy instructions or change downstream scans. Option C also needs actual-request privacy tests; dry-run goldens skip interceptors.

**Cheaper design:** measure first, then reuse chapter coverage and existing summaries where possible. Do not add another summary family until its incremental value is demonstrated.

**64 — Public sheet: P0 audience; P1 outcome semantics**

- **P0:** **Player-visible does not mean known to every character.** The shared block can expose a privately acquired item, permission or quest result. Apply explicit audience rules and held-secret filtering. Existing [checkOutcomeHost.ts:10](src/runtime/checkOutcomeHost.ts:10) already applies a resting filter; a new sheet writer must not bypass it.
- **P1:** “A failure costs something real” invites invented consequences, directly conflicting with “do not invent other outcomes.” Narrate only recorded/authored consequences; failure can simply mean the attempted action failed.
- **P1:** S4 requires narration on a reply whose completed boundary produced the change. That reply already exists. Specify delivery to the next eligible drafted request, including multi-member chains, continue/swipe and no-generation boundaries.
- **P1:** Reuse [deriveRefs](src/runtime/consequences.ts:175) and the existing recap lifecycle rather than introducing a competing boundary-change model.
- **P2:** S7 is impossible when the control produces fewer than four contradictions. Use predeclared absolute accuracy plus paired comparisons. Budget both arms: 20 openings with/without means 40 replies, inconsistent with the stated 25 minutes under 62’s timing assumption.

This is the best immediate player-value feature once audience semantics are fixed.

**65 — Scene card: P0 disclosure; P2 scope**

- **P0:** N2 explicitly shows an unknown member’s card name. That contradicts the disclosure contract. [knownEntities](src/engine/codex.ts:89) deliberately keeps an enabled member unknown when its authored person entry has not disclosed it. Omit that member or use a separately authorized anonymous presentation; names and portraits both count.
- **P2:** `presentRosterIds` means enabled minus away, not universally established physical presence: [whereabouts.ts:7](src/runtime/whereabouts.ts:7). State that limitation or use authored location/presence evidence.
- **P2:** N1 compares outputs to existing projections but does not independently establish their disclosure safety. Add a planted unknown identity and portrait test.
- Start with location/time/known present members and page links. Badges, standing and keepsake counts can follow. Preserve the explicit surface decision; being default-on after approval does not require automatically placing a widget in every story.

**66 — Authoring quality: P1 feedback loop; P2 preview accuracy**

- **P1:** Returning warnings on a pending provisioning card does not let the agent revise before the author sees it. Pending steps put the loop into `awaiting-author`: [loop.ts:226](src/copilot/agent/loop.ts:226), [loop.ts:342](src/copilot/agent/loop.ts:342). Define a bounded proposal-review/replacement step while retaining confirmation for actual asset creation.
- **P1:** `unconfirmed`/`mismatch` must mean “the asset may already exist.” Record the returned avatar identity, support read-back retry, and suppress duplicate creation. Current provisioning resolution only accepts a boolean outcome: [loop.ts:399](src/copilot/agent/loop.ts:399).
- **P2:** “Fires on” overclaims keyword matching. Actual activation includes gates, scan sources/depth, secondary logic, probability, recursion and budgets. Even [keywordWillActivate](src/runtime/loreKeyMatch.ts:50) deliberately excludes uncertain cases. Label this **“key matches these draft texts”**; test actual activation separately.
- **P2:** “Synonym-like” lint needs an operational definition. A7 needs a rating scale, aggregation rule and blind rubric.
- Preserve warning severity: tutorial agency/adjective checks are warnings, not hard refusals. Prioritize shared checks, behavior guidance and read-back; preview sophistication can wait.

**67 — Grader hygiene: P1 oracle validity; P2 isolation**

- **P1:** B2 currently implements **word-start** matching, not a shared whole-term helper. [liveSuiteScore.mts:46](scripts/debug/lib/liveSuiteScore.mts:46) still accepts `bel` in `below`; the self-test has a separate implementation. Inventory prefix needles before changing semantics.
- **P1:** G3 must distinguish an asserted event from an attributed claim containing the same words. `mustNotContain` can reject the very “player says…” representation the plan permits. Assert structured assertion/attribution semantics and include legitimate player actions as negative controls.
- **P1:** G4’s scripted reply cannot demonstrate resistance to persona pressure in generated replies. It tests the reader/warden only. Add a real reply leg to the final suite if reply behavior is claimed.
- **P2:** `mes + swipe_id` omits speaker, user/system flags, reasoning and alternate-swipe mutations. Define which state must remain unchanged. Conversely, legitimate audit bookkeeping should not automatically fail the entire SO-blob hash.
- Preserve old results and attach scorer versions to re-scores. Two repetitions justify “observed stable/flaky,” not strong statistical regression claims.

**68 — Your move: P1 stale identity and contradictory rules**

- **P1:** `chatId:checkpointId:lastMessageId` does not change when a reply is edited or swiped in place. Existing decision records have no text revision: [talkStagecraftTypes.ts:5](src/runtime/talkStagecraftTypes.ts:5). A derived view over stale records is still stale. Bind decisions to message revision and invalidate them on mutation.
- **P1:** Source 2 remains true after the player writes; changing the decision key does not suppress it. Y4 also conflicts with source 2: a silence decision plus a player-action checkpoint would still show the chip.
- Define precedence: active generation, last-message author, explicit hand-back, objective fallback, silence. `stopOnPlayer` enables a choice; it does not itself record that a hand-back occurred.
- **Cheapest v1:** explicit, revision-bound hand-backs only. Add objective cues later if sessions show a gap.

**69 — Hardening: P1 recovery and serialization; P2 acceptance**

- **P1 K3:** An index containing only ids/hashes cannot implement **Restore**. It also misses lost edits to surviving ids and wizard-session loss. Specify recoverable snapshots, deliberate-deletion handling and protection against stale writers overwriting the backup itself—or narrow this to detection.
- **P1 K4:** B8 is still open. A `toJSON` wrapper is not automatically the final serialization authority: later listeners can replace/copy the body or install their own wrapper. Test the actual host send path; prefer ordinary event ordering if sufficient.
- **P1 K9:** Registry declarations alone do not prove withholding. Include nested quiet generations, restoration, early returns and raw-generation paths without normal lifecycle events.
- **P2 K1:** Retrying unchanged rejected compactions every boundary risks repeated cost. Deduplicate attempts by input identity and bound retries. Refusal rate alone does not measure retained information.
- **P2 K10:** `castNames` resolves names, not host character indexes. Reuse the existing host member-resolution/start machinery in [voiceStart.ts:15](src/services/stHost/voiceStart.ts:15); add missing, duplicate and reordered-member cases.
- K5/K6/K8 are worthwhile, but distinguish receipt normalization before consumption from a genuine later rewrite that **should** roll back. K8 needs explicit expected outcomes, not “behavior as specified.”
- K7 should test token-boundary preservation and dedup false positives, not just punctuation-equivalent names.

**Addenda requiring correction**

- **42 — P1:** The Summarize hold is explicitly opt-in, contrary to the default-on rule. Separate approval to implement host interposition from its eventual default. Holding future summarization also leaves existing summaries and Vector Storage untouched.
- **11 — P1:** Idempotency needs a durable operation identity across lost acknowledgements and rollback/replay; detecting duplicates afterwards is insufficient. Decline keys need **book + uid**, target revision and a declared expiry; uid alone is not global.
- **18 — P1:** Keep omission distinct from an explicit false reading. Define what transfer/use evidence qualifies, including negation, quoted claims and world-versus-player evidence. `loss_when` is currently an unexplained new schema mechanism.
- **50 — P1:** “Time advanced **or** boundary gap” does not prevent frequent same-evening news. Define whether event-triggered fallback remains intentional and make its floor exact.
- **51 — P1:** A four-boundary duplicate-beat window cannot guarantee “at most once across six turns.” The current [guard](src/engine/life/beats.ts:46) can expire while the same evidence remains. Source-event identity and temporary repetition suppression are different contracts.
- **41 — P2:** More than 20% unknown tags does not establish image improvement from deleting them. Canonicalize known aliases first; gate dropping unknowns on a blinded image-quality measurement.
- **43/47/55 — P2:** Good provenance additions, but message ids need revisions; time labels must describe the source event, not recall time.
- **52/53 — P2:** Reconcile with built implementations. Keep explicit range precedence and initialization tests; “lasting identity” should not prohibit durable historical facts.
- **09/22:** The conditional quota probe and director pointer are reasonable; retain the no-login-file and private-input restrictions.

**3. Brainstorm and build order**

| Combination | Player-felt value | Effort/value judgment |
|---|---|---|
| **64 + 46 + 56/58** | Characters acknowledge earned access and meaningful possessions correctly. | Highest near-term return, provided knowledge is recipient-scoped. |
| **66 + 55/57** | Better behavioral cards, believable assurances and recognizable recurring interactions. | High return with little runtime complexity. |
| **42 + 43 + 47 + 59** | Characters remember exact promises and respond to repair without omniscience. | High value, larger provenance investment. |
| **65 + 50/51/52/53** | Immediate orientation and accessible relationship context. | Useful modest feature; keep the first version small. |
| **63** | Faster long conversations. | Potentially high, conditional on actual latency and recall results. |
| **62 stage 2** | Stable hidden world details. | Highest complexity and weakest current evidence; authored facts first. |
| **68** | Clearer turn hand-off. | Cheap but comparatively small benefit. |

Recommended order across 60–69:

1. **Reconcile 61 with current code and gate records.** Close or explicitly carry 60’s remaining findings; add stale-proposal and stale-book-write coverage.
2. **67’s matcher/oracle work**, then **69 K5/K6/K8/K9/K10** and bounded compaction checks. These make subsequent evidence trustworthy.
3. **66**, starting with shared card checks, guidance and safe read-back.
4. **64**, after its audience contract is fixed; reuse 46 and combine acceptance with authored permissions/keepsakes.
5. **65**, after the surface decision; **68** as a small independent explicit-hand-back feature.
6. **63’s R2 measurement**, then the window only if latency gains justify recall risk. Defer the extra recap.
7. **62’s redesigned continuity probe**; authored prepared facts before model-filled facts. Stage 2 remains a separate decision.

The 12-hour cap needs an actual allocation: plan 24’s first three informational items already total **166 minutes against 150 available**. Adding 62’s 50 minutes and 64’s paired run therefore means displacement or deferral. Calling R2 “outside the cap” identifies deferred work; it does not fund another run. No floor should be changed after observing results.