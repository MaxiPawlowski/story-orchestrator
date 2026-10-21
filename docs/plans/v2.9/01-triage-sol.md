# v2.9 triage — additions and current-feature audit

2026-10-21. Read-only review of checkout `6861d989` and its current documentation changes. Proposals only; no implementation, model calls or live checks.

**Recommendation: eight plans, 02–09.** Build per-member voice prevention separately, before reply polish. Keep existing v2.8 correctness work and measurements in their existing plans. Prioritize clearer character reactions, useful suggestions and truthful feature state over additional generated memorabilia.

## Basis and notation

Sources read: repository instructions; v2.8 overview, queue and harvest triage 61; v3.0 overview; all 2026-10-21 research reports; feature registry and feature inventories; relevant source and gate records.

- `R/<name>` means `docs/plans/v2.8/extension-research-2026-10-21/<name>.md`.
- All plan references below are version-qualified.
- **P** = value to the player, 1–5. **Effort** = S/M/L, including authoring, documentation and validation.
- **Risks:** **K** knowledge/disclosure; **R** rollback/replay and boundary order; **A** player agency; **O** stale asynchronous writes; **H** host integration; **T** thinking/inner voice; **B** latency, quota or prompt budget; **D** defaults/settings.
- `PLAN` names a proposed v2.9 plan. `FOLD` extends the named existing plan. Neither verdict claims owner approval or completion.
- Measurements and floors below are proposals to freeze before running. Existing floors remain unchanged. Misses are informational; built features remain on unless the owner switches them off.
- New player surfaces still need the explicit decision required by `docs/plans/v2.8/00-overview.md:23`.

## Verdicts: extension harvest

### Voice and reply quality

- **V01 — Authored per-member voice guidance.** Sources: `R/per-character-polish` P2, `R/creative-studio` P1/P3, `R/dooms-enhancement-suite` P4, voice-record portion of `R/nemopresetext` P1, Versu/Façade notes in `R/niches`. **PLAN v2.9 02.** Roster has no polish field (`src/engine/schema.ts:326`); private aims already have a suitable rendering path (`src/memory/innerRender.ts:85`). P5; M. Risks K/B. Voice precedence applies to delivery, never facts, knowledge or agency.

- **V02 — Per-member, signal-triggered reply polish.** Sources: `R/per-character-polish` P1, `R/simulation-blackboard` P2. **PLAN v2.9 03.** Existing writer changes message/swipe text (`src/services/stHost/chatMessages.ts:18`); TurnBridge has a pending-boundary seam, not a polish pipeline (`src/runtime/turnBridge.ts:163`). P4; L. Risks K/R/A/O/H/T/B. Design remains conditional on proving timing and semantic preservation.

- **V03 — Per-speaker repetition and authored tic detection.** Sources: `R/per-character-polish` P3, `R/languagetool` P2, `R/castward` P4. **FOLD v2.9 02.** Miner currently receives pooled assistant text (`src/stagecraft/repetition.ts:65`, `:80`). P4; M. Risks K/B. Resolve speakers through the roster; ambiguous narrator quotations must not count as a confidently attributed member tic.

- **V04 — Immutable windows and anchors around permitted rewrites.** Source: `R/lattice` P1. **FOLD v2.9 03.** Current reply writer has no semantic or window validation (`src/services/stHost/chatMessages.ts:18`). P4; M. Risks A/K/H. Useful structural guard; not proof that meaning inside a window survived.

- **V05 — Deterministic glossary substitutions in dialogue.** Source: rewrite portion of `R/lattice` P2. **SKIP.** No such pipeline exists (`src/engine/schema.ts:326`); substitutions can change negation, idioms or intentional quotations. P2; M. Risks A/K/H. Take its inspect/avoid portion in V03; leave stored prose unchanged.

- **V06 — “Which character said this?” swap classifier.** Source: classifier portion of `R/nemopresetext` P1. **FOLD v2.9 02 measurement; runtime classifier V3.0.** Existing voice judge checks role, drive and feelings, not speaker attribution (`src/runtime/continuity.ts:86`; `src/judge/warden.ts:82`). P3; M. Risks K/B. Runtime reopening requires useful calibrated discrimination on a held-out set.

- **V07 — LanguageTool before/after rewrite guard.** Source: `R/languagetool` P1. **V3.0.** No prose service exists; current deterministic prose signal is repetition (`src/stagecraft/repetition.ts:65`). P2; M. Risks H/B. Reopen if accepted polish outputs introduce grammatical damage that the existing checks miss. Another service is premature.

- **V08 — Generated lexical ignore list.** Source: `R/languagetool` P3. **FOLD v2.9 03**, using only permitted input names and literals. Roster/codex identity machinery exists (`src/engine/castNames.ts`; `src/engine/codexSchema.ts:34`). P2; S. Risk K. Do not send hidden codex names or lore keys to a spelling service.

- **V09 — Draft, critique and final inside reply thinking.** Source: `R/nemopresetext` P2. **SKIP as a build; retain as a later experiment.** Reply thinking already has its own budget (`src/runtime/replyEffortLive.ts:9`). P2; M to measure. Risks T/B. “Zero extra calls” does not mean zero extra generation cost. Never alter thinking or inner voice to fund it without the owner.

- **V10 — Supplied text is reference data, not instructions.** Sources: `R/creative-studio` P4, `R/scene-archivist` P5. **FOLD v2.8 09/35 for existing prompts; v2.9 03 for polish.** Shared-read transcript rendering is centralized (`src/extraction/contract.ts:58`, `:118`); card checks provide independent validation (`src/wizard/cardChecks.ts:98`). P3; S. Risks K/A. Add adversarial fixtures; a framing sentence alone is not a security boundary.

- **V11 — Varied example-dialogue guidance and monotony warning.** Source: `R/creative-studio` P2. **FOLD v2.8 09 §Harvest phase.** Current example check detects missing character lines (`src/wizard/cardChecks.ts:110`), not repetitive turn shape. P3; S. Risk B. Warn only; short or intentionally uniform examples must remain valid.

- **V12 — Bounded single-field expansion / keep the better answer.** Source: `R/creative-studio` P5. **SKIP.** Existing agent edit/review loop is the authoring seam (`src/copilot/agent/loop.ts`); v2.8 61 R26 already rejects another refinement mechanism. P1; M. Risks O/B.

- **V13 — State and evidence must consume final accepted text.** Source: `R/lattice` P3. **FOLD v2.9 03, extending v2.8 69 K6/K8 fixtures.** Commit fingerprints are captured with the save (`src/runtime/chatSave.ts:83`), while TurnBridge currently awaits after-speak work (`src/runtime/turnBridge.ts:166`). P5; M. Risks R/O/H. Include reads started before a rewrite, not only reads scheduled afterward.

### Extraction and measurement

- **E01 — Interval and no-change extraction fixtures.** Source: `R/castward` P1. **FOLD v2.8 35/24.** Live suite normalizes exact `q=v` values; only tension has tolerance (`scripts/debug/so-live-suite.mts:57`). P5; M. Risk measurement validity. Preserve the historical exact metric; add separate interval, non-change and whole-fixture scores.

- **E02 — Real-play-model fixture prose, provenance and holdout split.** Source: `R/castward` P2. **FOLD v2.8 35/24.** Existing live-suite fixtures are loaded and scored through one harness (`scripts/debug/so-live-suite.mts:130`). P4; M. Risk measurement contamination. Freeze generated originals, edits, model/configuration fingerprints and first-use status. No private campaign prose enters this public repo.

- **E03 — Mark previously accounted context separately from fresh evidence.** Source: `R/castward` P3. **FOLD v2.8 35 as an experiment.** Transcript rendering is undifferentiated; running totals already mention previously counted events (`src/extraction/contract.ts:48`, `:58`). P4; M. Risks R/A. Coverage cursor is not proof every old line was successfully applied; test lagged, rejected and overlapping reads.

- **E04 — Actual occurrence versus mention, plan, threat or recollection.** Source: `R/lattice` P6. **FOLD v2.8 35/58.** Commit guard already rejects several unsupported commitment readings (`src/extraction/commitGuard.ts:188`); it is not a universal occurrence classifier. P4; M. Risks A/R/K. Start with counter and keepsake negatives, not a second event-extraction system.

- **E05 — Same occurrence narrated across overlapping windows counts once.** Source: `R/lattice`, example lessons 25/28. **FOLD v2.8 35.** Running-total instruction exists (`src/extraction/contract.ts:48`); relationship beat deduplication is narrower (`src/engine/life/beats.ts:46`). P4; M. Risk R. Test evidence identity and paraphrased retelling separately.

### Chapters, memory and compatibility

- **M01 — Player-safe character diary after a chapter.** Source: `R/scene-archivist` P1. **V3.0.** Chapter sealing exists (`src/runtime/chapterSeal.ts`); private aims are a separate source (`src/memory/innerRender.ts:85`). P3; M. Risks K/A/O/B. Reopen on an explicit request for this surface. A diary built only from public material is an interpretation, not access to the character’s private mind.

- **M02 — Story-time span on chapter cards and away recap.** Source: `R/scene-archivist` P2. **FOLD v2.8 50 B1c.** Canonical formatter exists (`src/engine/life/clock.ts:57`); away recap composes from narrative (`src/runtime/awayRecap.ts:28`). P3; M. Risks R/K. Use recorded endpoints; never infer a missing start time from the ending.

- **M03 — Deterministic chronology on compressed records.** Source: `R/scene-archivist` P3. **FOLD v2.8 50 plus v2.8 69 K1 validation.** Chapter fold consumes covered records (`src/runtime/chapterKit.ts:250`). P2; M. Risks B/K. Prefer structured metadata rendered alongside summaries. Count its tokens before accepting “shorter” output; do not append a redundant prose tail universally.

- **M04 — Explain why lore fired, including proven vector provenance.** Source: `R/scene-archivist` P4. **V3.0.** Evidence records activation; own activation has a host adapter (`src/runtime/worldInfoEvidence.ts:239`; `src/services/stHost/worldInfoActivate.ts:22`). P2; M. Risk H. Reopen on an actual lore-selection debugging failure. Do not wrap global fetch merely to improve labels.

- **M05 — Chapter folding can produce interior ignored rows.** Source: `R/vectfox` P1. **FOLD v2.8 69 correctness work; coordinate v2.8 63.** Each record independently keeps its tail (`src/runtime/chapterKit.ts:324`), permitting separated folded ranges. P5; M. Risks H/K. Source-supported host hazard, not reproduced here. Prefix-only folding must stop at coverage gaps and authored exclusions.

- **M06 — Detect VectFox transcript-copying blocks.** Source: `R/vectfox` P2. **FOLD v2.8 69.** Copier map recognizes only two exact keys (`src/runtime/transcriptCopiers.ts:1`); Repair already owns the warning (`src/runtime/checks.ts:88`). P4; S. Risks K/H. Add verified prefixes and actionable copy; do not switch another extension off.

- **M07 — IGNORE does not remove text from WI scanning.** Source: `R/vectfox` P3. **FOLD v2.8 63 documentation and host fixture.** SO folds by copying `extra` and adding IGNORE, without blanking text (`src/runtime/chapterKit.ts:342`). P3; S. Risks H/K. Preserve that distinction; sent-history and WI horizons are different measurements.

- **M08 — Causal “why / remember when” recall.** Source: `R/vectfox` P4. **FOLD v2.8 43 as a later summary-recall experiment.** Existing archive recall is entity-oriented (`src/memory/archiveRecall.ts:30`); runtime verbatim recall remains unbuilt (`docs/plans/v2.8/43-verbatim-recall.md:316`). P4; M. Risks K/B. Same audience gate; summaries must not be presented as exact quotations or proven causes.

- **M09 — Relative-age labels on recent memory.** Source: `R/vectfox` P5. **FOLD v2.8 35 measurement.** Scoring already measures boundary age (`src/memory/score.ts:54`); rendered relative-age wording is absent from the inspected injection path. P2; S. Risks B/R. Use boundaries, and measure payload churn as well as recall.

- **M10 — Recency scaled to chat length.** Source: `R/vectfox` P6. **FOLD v2.8 21 experimental arm.** Fixed decay currently uses `age/12` (`src/memory/score.ts:55`). P2; S. Risk measurement validity. Do not silently retune weights or infer player value from a different formula.

- **M11 — Use reply reasoning to infer time or place.** Source: `R/vectfox` P7. **SKIP.** Inner reasoning already has a tightly scoped intent-harvest contract (`src/memory/innerRender.ts:11`); story time has a dedicated canonical writer design. P1; M. Risks K/T. Internal speculation must not become shared event evidence.

- **M12 — Stopped partial-reply policy.** Source: `R/st-memory-books` P1. **FOLD v2.8 69 K13 and turn-type checks.** Stop currently requests a flush; receipt/render events remain eligible turns (`src/runtime/turnBridge.ts:83`, `:137`). P5; M. Risks R/H/A. Owner decision needed before changing semantics; see audit A02.

- **M13 — Hidden messages are filtered reads, not visibility writes.** Source: `R/st-memory-books` P2. **SKIP: already the relevant SO rule.** Window hygiene drops hidden rows (`src/extraction/windowHygiene.ts:115`). P1; S. Risk H. Keep an interoperability fixture if another extension changes visibility during a read.

- **M14 — Stepped window and retention ladder.** Source: `R/tokensavingplugin` P1/P3. **FOLD existing v2.8 63; no new scope.** Measurement tooling and runtime-build decision are already recorded (`docs/plans/v2.8/32-queue.md`, M63). P4; M. Risks B/K/H. Its refreshed implementation supplies no new SO acceptance evidence.

- **M15 — Measure overhead from the last real loud request.** Source: `R/tokensavingplugin` P2. **FOLD v2.8 63 budget experiment.** Current cost fallback is estimated (`src/runtime/promptCost.ts:1`); CC bucket accounting is route-specific (`src/runtime/promptBuckets.ts:85`). P3; M. Risks H/B. Previous-request overhead is stale after cast/lore changes; retain a conservative fallback and actual-sent horizon check.

### Mechanics and authoring

- **G01 — Player-declared improvised attempt.** Source: `R/dooms-enhancement-suite` P1. **V3.0.** Checks are authored and now support `when` (`src/engine/gameSchema.ts:118`). P3; L. Risks A/R/H/B. Reopen after sessions show authored checks missing important attempts. A second resolution system needs a world-outcome contract, not merely a roll chip.

- **G02 — Margin wording and whose attempt an outcome resolves.** Source: `R/dooms-enhancement-suite` P2. **FOLD v2.8 18 Q3/Q7.** Outcome prose has degree wording but labels checks rather than explicit actors (`src/runtime/storyCheckDraws.ts:84`, `:94`). P3; S. Risks A/K. Add an actor only where explicitly resolved; do not invent an NPC participant.

- **G03 — Runtime stale-build information.** Source: `R/dooms-enhancement-suite` P3. **FOLD v2.8 69.** Build fingerprints exist in tooling (`scripts/debug/lib/servedBundle.mts`); the check registry is the product seam (`src/runtime/checks.ts`). P2; M. Risks H/B. Compare artifact identity, not symbolic version; one asynchronous informational check, no startup blocker.

- **G04 — Weighted authored outcomes.** Source: `R/lattice` P4; CK3 portion of `R/niches`. **FOLD v2.8 49 G19.** Weighted complication lines are already designed (`docs/plans/v2.8/49-complications-and-twists.md:26`); rumor selection already demonstrates seeded weighting (`src/memory/rumors/spread.ts:70`). P3; M. Risks R/A. Do not bypass SP6’s model-facing build gate by renaming complications “enum rolls.”

- **G05 — Slow-burn relationship caps and cooldowns.** Source: `R/lattice` P5. **FOLD v2.8 51 / character-life follow-up.** Current guard compares recent evidence within four boundaries (`src/engine/life/beats.ts:6`, `:46`); mood expiration exists (`src/engine/life/presence.ts:25`). P4; M. Risks R/A. Author-declared caps only. Automatic relationship decay is V3.0 pending a separate owner decision.

- **G06 — Repeated compliments are not fresh relationship beats.** Source: `R/simulation-blackboard` P3. **FOLD v2.8 51/35 fixtures.** Existing comparison detects normalized equality and containment, not semantic repetition (`src/engine/life/beats.ts:30`). P4; M. Risk R. Avoid claiming the existing guard already catches five differently phrased compliments.

- **G07 — Player authors their feelings, beliefs and conclusions.** Source: `R/simulation-blackboard` P1. **FOLD v2.8 18 agency contract and v2.8 35 fixtures.** Shared clause protects words and decisions but does not explicitly enumerate mental states (`src/engine/agency.ts:24`). P5; M. Risks A/T. Existing greeting lint already mentions feelings (`src/wizard/cardChecks.ts:105`); align the live contract. Preserve NPC inner voice and thinking.

- **G08 — Holder-scoped item reminders.** Source: `R/lattice` P7. **FOLD v2.8 58**, with v2.8 43 audience rules. Current private-life composition already has a member-specific path (`src/engine/life/lines.ts:48`); keepsakes remain separately planned. P3; M. Risk K. Possession is not proof of witnessing an item’s past.

- **G09 — Direction only for the drafted actor.** Source: `R/lattice` P8. **SKIP: already implemented.** Private aims are selected by member (`src/memory/innerRender.ts:230`). P1; S. Risk K. Retain the isolation property in new cue tests.

- **G10 — Interrupt a large time jump at a due event.** Source: `R/lattice`, lessons 23/24. **V3.0.** Story time already has entry writers; elapsed-time proposals are due-tested (`src/runtime/agendaProposals.ts:132`). P2; L. Risk R. Splitting one authored jump into resumable segments changes engine semantics substantially.

- **G11 — Honest empty relationship labels.** Source: `R/bb-visual-novel-engine` P1. **SKIP: built.** Label projection omits absent labels (`src/runtime/labelView.ts:15`). P1; S. No new invariant risk.

- **G12 — Player-set relationship label.** Source: `R/bb-visual-novel-engine` P2. **SKIP.** Labels are authored state (`src/engine/life/labels.ts:42`); a player note would be a different feature. P2; M. Risks A/K. No session asks for that note surface.

- **G13 — Verify uploaded image path/read-back.** Source: `R/bb-visual-novel-engine` P3. **FOLD v2.8 69**, coordinated with v2.8 41. Writer currently trusts a returned string path (`src/services/stHost/image.ts:79`). P3; M. Risks H/O. Derive the sanitize-aware expected path; malformed or missing reads must not persist a broken reference. HEAD alone does not prove byte equality.

- **G14 — Coalesce bursts, flush before prompt consumption.** Source: `R/bb-visual-novel-engine` P4. **SKIP as a new subsystem.** TurnBridge already deduplicates and queues commits (`src/runtime/turnBridge.ts:149`, `:176`). P1; M. Risks R/H. That is not proof every prompt dependency is fresh; add a fixture only for a demonstrated stale read.

- **G15 — Runtime “people met” from extracted ledger rows.** Source: `R/castward` P6. **FOLD existing v2.8 52 option B**, still gated. Authored disclosure is composed before components receive data (`src/runtime/codexView.ts:33`); witness gates remain unpassed. P3; L. Risk K. Entity mention or presence does not establish player discovery.

- **G16 — Portraits/colours inside narrator dialogue.** Source: `R/castward` P5. **SKIP.** Message DOM ownership is guarded (`src/runtime/architecture.test.ts:108`); group members already have host presentation. P2; M. Risks H/B. No new stored-text format or message decorator.

### Compatibility ideas that do not justify new plans

- **C01 — Prompt-only preset regex parity.** Source: `R/nemopresetext` P3. **FOLD v2.8 35 G9.** Cleaned extraction explicitly lacks prompt-regex parity (`src/extraction/windowHygiene.ts:11`). P3; M. Risks H/K. Measure the installed preset case before implementing another regex pipeline.

- **C02 — Hidden interiority retained in shared context.** Source: `R/nemopresetext` P4. **SKIP: privacy anti-pattern.** Own aims already have a private member block (`src/memory/innerRender.ts:230`). P1; M. Risk K. Display-hidden text is still shared if the prompt retains it.

- **C03 — Verified bundled preset installer.** Source: `R/nemopresetext` P5. **SKIP.** Existing staging/pin verification is in the harness (`scripts/debug/adolion-fresh.pin.json`; `scripts/debug/lib/servedBundle.mts`). P1; M. Risks H/O. No in-app preset installer requested.

- **C04 — Frozen instruction snapshot for paused passes.** Source: `R/simulation-blackboard` P4. **SKIP.** Existing agent runs use ownership and director ops are checked at apply (`src/copilot/agent/loop.ts`; `src/generation/living/guard.ts`). P1; M. Risk O. Reopen if resumable paused runs become a product feature.

- **C05 — Tavernary kit UX and shared sync promise.** Source: `R/small-updates` §1. **SKIP.** Native dialogs and run ownership already supply the applicable patterns; prior v2.8 61 R53 verdict stands. P1; S. Risks H/O.

- **C06 — Less transparent tab palettes.** Source: `R/small-updates` §2. **SKIP.** Cosmetic change in another extension; SO already has its own component styles. P1; S. No relevant invariant risk.

- **C07 — Updated Unity game binaries.** Source: `R/small-updates` §3. **SKIP.** No changed ST-side integration; v2.8 61 R71–R73 anti-pattern verdicts stand. P1; L. Risks H/A/B.

Previously rejected second databases, model-written shared WI memory, per-reply review chores, global connection swaps, unseeded draws, generic XP economies and direct-provider side calls remain **SKIP**. The refresh supplies no evidence to reopen them.

## Verdicts: ideas outside SillyTavern

These entries distinguish the scout’s separate mechanisms; shared destinations reuse the extension verdicts above.

- **N01 — Storylet/QBN framing and specific overrides.** Source: `R/niches` §1. **FOLD v2.9 04 guide.** Gates already select graph transitions (`src/engine/transitions.ts:5`); reusable in-beat cue selection is absent. P3; S. Risk R. No second story graph.

- **N02 — Per-member reactive remark bank.** Source: §2, Ruskin/Mímir. **PLAN v2.9 04.** Existing NPC replies fire on checkpoint triggers (`src/runtime/effectsApplier.ts:464`), not a reusable ranked bank. P4; M. Risks K/R/A.

- **N03 — Important versus optional cues; once-only delivery.** Source: §3, Hades. **FOLD v2.9 04.** Existing NPC trigger accounting is separate (`src/runtime/npcReplyRewind.ts`). P4; M. Risks R/A. Record offered and realized separately; “injected” does not mean “said.”

- **N04 — Hot-button topic tiers.** Source: §4A, Façade. **FOLD v2.9 04.** Roster has no topic bank (`src/engine/schema.ts:326`). P4; M. Risks K/R/A. Progress requires an eligible addressed occurrence, not repeated keywords anywhere in the transcript.

- **N05 — Reestablish an interrupted conversation.** Source: §4B. **FOLD v2.8 22 guidance experiment.** Existing open-stretch steering already pulls play onward (`src/pacing/steering.ts:63`). P2; S. Risk A. An offer, never a forced return after the player rejects the subject.

- **N06 — Mood and feeling causes.** Source: §5a, Versu. **FOLD v2.8 51 / character life.** Relationship history already has message and beat evidence (`src/engine/life/beats.ts:79`); mood declaration has no cause (`src/engine/lifeSchema.ts:49`). P3; M. Risks K/R. Add author-side mood provenance; no player mind-reading surface.

- **N07 — Social norm violations are noticed.** Source: §5b. **FOLD v2.9 04**, referencing v2.8 56. Private life lines already compose member-specific cues (`src/engine/life/lines.ts:48`). P3; M. Risks A/K. Authored observed-event gate plus reaction cue; no inferred moral score.

- **N08 — Per-character verbs and mood-conditioned delivery.** Source: §5c and §4 tone alternates. **FOLD v2.9 02.** Current voice profile has role/drive/feelings only (`src/runtime/continuity.ts:86`). P4; M. Risk K. Mood influences delivery without disclosing its hidden cause.

- **N09 — Accumulated rumor evidence changes belief.** Source: §6, Talk of the Town/DF. **V3.0.** Current stance derives from receiver-to-teller relationship (`src/memory/rumors/spread.ts:91`). P3; L. Risks K/R. Reopen after existing rumor-voicing measurements; multiple tellings may share one source and must not count as independent corroboration.

- **N10 — Post-story rumor trajectory reveal.** Source: §6. **V3.0.** Rumor occurrences and private landings already exist (`src/memory/rumors/spread.ts:40`); carry deliberately uses public projection. P3; M. Risk K. Ending a story is not authorization to disclose every held secret.

- **N11 — Deterministic microstory pattern recognition.** Source: §7, Felt/Winnow. **PLAN v2.9 05**, narrowly bounded. Typed consequence refs exist (`src/runtime/consequences.ts:175`); arcs use text similarity (`src/memory/arcs.ts:29`). P4; L. Risks K/R/B. No general Datalog engine or complete simulation log.

- **N12 — Suggestions grounded in active and dormant threads.** Source: §8, Loose Ends. **PLAN v2.9 06.** Current grounding is a prompt instruction (`src/runtime/suggestions.ts:9`); no structured candidate ranking. P5; M. Risks A/K/B.

- **N13 — Delayed, revalidated consequences.** Source: §9a, CK3. **PLAN v2.9 07.** Rumors already demonstrate seeded due dates (`src/memory/rumors/spread.ts:54`); meanwhile checks elapsed time (`src/runtime/agendaProposals.ts:132`). P4; M. Risks R/A/K. Reuse concepts, not a second generic scheduler.

- **N14 — Grey unavailable options.** Source: §9b. **FOLD v2.9 06**, authored visible prerequisites only. Current suggestions are plain generated strings (`src/runtime/suggestions.ts:40`). P2; M. Risks K/A. Do not expose a hidden route by greying it out.

- **N15 — Recovery after consequential setbacks.** Source: §10, RimWorld. **FOLD v2.8 22/49 experiment.** Pacing shapes exist (`src/pacing/shapes.ts`); public check refs identify outcomes (`src/runtime/consequences.ts:161`). P3; M. Risk A. A setback may justify a pause, never undoing its cost or penalizing refusal.

- **N16 — Cast authored set-pieces by role.** Source: §11, Wildermyth. **V3.0.** Encounter generation produces optional situations, with no authored role-slot format (`src/generation/encounters.ts:32`). P3; L. Risks K/A/R. Reopen if v2.9 04’s simpler reactive cues prove insufficient.

- **N17 — Legacy across campaigns.** Source: §11. **SKIP: already covered.** Carry is explicitly projected and seeded before the run (`src/runtime/carryUnit.ts`; `src/features/carryFeatures.ts:7`). P1; S. Risk K.

- **N18 — Essentials, story cards and near-tail author notes.** Source: §12, AI Dungeon. **SKIP: already covered.** SO has injection registry and lore placement (`src/constants/injectionRegistry.ts`; `src/runtime/lorePlacement.ts:8`). P1; S. Risks B/H.

- **N19 — Per-member phrase bias and unbias-after-use.** Source: §13, NovelAI. **V3.0.** Existing sampler overlay is request-scoped but not a member phrase-policy engine (`src/runtime/samplerOverlay.ts`). P2; L. Risks H/B. The harvest’s own host finding undermines phrase bans; prevention goes in prompts first.

- **N20 — Codex facts supersede earlier facts.** Source: §14, NovelCrafter. **FOLD v2.8 52 as an owner-decided extension.** Facts have no replacement field (`src/engine/codexSchema.ts:20`); composer lists all disclosed facts (`src/runtime/codexView.ts:38`). P3; M. Risks K/R. A new learned version may change the current view while preserving disclosed history; no hidden successor may hide an old fact early.

- **N21 — Quirk over-indexing throttle.** Source: §15, Hidden Door critique. **FOLD v2.9 02/03.** Existing repetition miner detects pooled phrases, not per-member authored quirk use (`src/stagecraft/repetition.ts:65`). P4; M. Risk B. Throttle unwanted repetition, not every defining mannerism.

- **N22 — Player-side passive observations.** Source: §16, Disco Elysium. **PLAN v2.9 08.** NPC private aims exist (`src/memory/innerRender.ts:85`); checks exist, but no authored player-observation format (`src/engine/gameSchema.ts:118`). P4; M. Risks A/K/R. Start with observations, not imposed beliefs or emotions.

- **N23 — Named player inner voices.** Source: §16. **V3.0.** Current inner voice belongs to NPCs (`src/memory/innerRender.ts:230`). P3; M. Risks A/T. Reopen only if the owner explicitly wants a player-character mind authored this way.

- **N24 — Thought Cabinet progression economy.** Source: §16. **SKIP.** Existing game layer is story-specific rather than a generic perk economy (`src/engine/gameSchema.ts`). P2; L. Risks A/R.

- **N25 — Visible ways to improve a pending check.** Source: §17, Citizen Sleeper. **FOLD v2.9 06.** Check modifiers already have conditions and optional labels (`src/engine/gameSchema.ts:104`). P4; M. Risk K. A visible quality alone does not make a hidden check or modifier condition public.

- **N26 — Per-member typography.** Source: §18, Pentiment. **V3.0.** SO owns stage/panel presentation, while message DOM writes are constrained (`src/runtime/architecture.test.ts:108`). P2; M. Risks H/accessibility. Reopen on an explicit presentation request.

## Current-feature audit

### A01 — Help reports install settings rather than this chat’s effective feature state

**Severity: high confusion; confirmed implementation mismatch.** `HelpHost` calls `feature.isOn(settings)` (`src/components/help/HelpHost.tsx:49`), whereas snapshots already resolve story policy and chat overrides (`src/runtime/snapshotBuilder.ts:440`). The resolver distinguishes install-off, story-off and chat state (`src/runtime/featureResolve.ts:25`).

A feature can therefore read “On” in Help while this story declines it. Separately, an enabled switch does not prove a required route is answering.

**PLAN v2.9 09.** P5; M. Risks D/K. Reuse the existing resolved state and check registry; do not create another resolver.

### A02 — Stopping a reply has no explicit state contract

**Severity: high; policy gap, current path confirmed.** Stop flushes pending work (`src/runtime/turnBridge.ts:83`); receipt/render handling admits ordinary nonempty partials (`:137`). There is no stop-specific distinction in `PendingBoundary` (`:55`).

**FOLD v2.8 69 K13.** P5; M. Risks R/H/A. Owner must choose whether a retained partial counts. If it does not, later extraction windows must also exclude it until accepted/continued; merely suppressing its immediate boundary is insufficient.

### A03 — Chapter folding can request a host history shape it has not proved safe

**Severity: high on affected CC routes; reproduction owed.** Independent per-chapter tail retention creates noncontiguous folded ranges (`src/runtime/chapterKit.ts:324`). The research identifies a CC host hazard; this review confirms the SO range shape, not the resulting crash.

**FOLD v2.8 69 + v2.8 63.** P5; M. Risks H/K. Required fixture: two seals, retained middle rows, a coverage gap and an authored no-fold chapter. Never “fix” it by hiding uncovered text.

### A04 — Witness recording is built, but its player benefit and cost remain unproven

**Severity: high dependency risk.** Registry says nothing consumes the record yet (`src/features/audienceFeatures.ts:10`). Latest witness record still lacks real-read W4 scoring; adjudication exposed dangerous presence-proxy errors (`docs/plans/v2.8/42-witness-filter-v2.md:548`). Queue M42 records +167 input tokens against Wc 120.

**FOLD v2.8 42/35 acceptance.** P5; M. Risks K/B. Measure real reads, false inclusions and mixed spans. Keep the feature on; do not connect consumers around its existing privacy gates.

### A05 — Good retrieval ranking does not establish safe recall

**Severity: critical if bypassed; current runtime gate correctly closed.** E0 ranking improved, but R-Gate2 produced four forbidden nonces and oversized whole-message blocks (`docs/plans/v2.8/43-verbatim-recall.md:308`). No runtime recall was built (`:316`).

**FOLD v2.8 43**, including M08. P5; L. Risks K/B. Preserve eligibility-before-ranking and span budgets. Neither causal recall nor generated People pages may bypass this.

### A06 — Thought carry’s improved result is a contaminated re-score

**Severity: high quality uncertainty.** Original precision/meta/player-line floors failed twice (`docs/plans/v2.8/54-inner-voice-l5.md:82`). Fixed-picker precision 0.906 came from the same corpus and is explicitly informational (`:91`).

**FOLD v2.8 54/35.** P5; M. Risks T/K. Fresh corpus and real next-reply effect remain owed. Preserve thinking and inner voice; no retirement or disabling proposal.

### A07 — “Voice” judging currently measures behaviour more than speech identity

**Severity: medium; feature expectation gap.** `voiceProfile` supplies role, drive and feelings (`src/runtime/continuity.ts:86`); judge wording checks contrary speech/behaviour (`src/judge/warden.ts:82`). It does not test cadence, preferred language or interchangeability.

**FOLD v2.9 02 measurement.** P4; M. Risks B/K. Keep behaviour consistency and speaker distinctness as separate scores.

### A08 — Relationship repetition protection is lexical and short-lived

**Severity: medium to high in social play.** Equality/containment over the recent beat protects exact or near-exact repeats (`src/engine/life/beats.ts:30`, `:43`). It does not prove semantic novelty or limit one evening’s total movement.

**FOLD v2.8 51/35**, G05/G06. P4; M. Risks R/A. Measure repeated paraphrased gestures and independent meaningful events before adding caps.

### A09 — Suggestions promise relevance without structured evidence

**Severity: medium; player-felt weakness.** Prompt asks for one goal/thread suggestion (`src/runtime/suggestions.ts:13`); parser checks strings, names, duplicates and command safety (`:40`). It does not verify that a suggestion advances a known thread or that its outcome remains unresolved.

**PLAN v2.9 06**, with v2.9 05. P5; M. Risks A/K. Improve current surface before inventing another “what next” panel.

### A10 — Rich history is recorded, but repeated patterns are not recognized

**Severity: medium opportunity, not a correctness defect.** Consequence refs cover five event kinds (`src/runtime/consequences.ts:175`); arc resolution relies on Jaccard text matching (`src/memory/arcs.ts:29`). No inspected subsystem binds a repeated actor/event pattern into a supported callback.

**PLAN v2.9 05.** P4; L. Risks K/R/B. Start with public typed events. Do not promise detection of anything the log never represented.

### A11 — Off-stage-event Help contradicts automatic behaviour

**Severity: medium; confirmed copy defect.** Help says nothing lands before author acceptance (`src/features/lifeFeatures.ts:49`). Code defaults to `auto` (`src/runtime/agendaProposals.ts:11`) and accepts waiting proposals automatically (`src/runtime/meanwhilePort.ts:54`).

**FOLD v2.8 character-life documentation; include parity in v2.9 09.** P4; S. Risk D. Correct the explanation; do not change the approved default.

### A12 — Animation has a real missed floor, without proof that new motion caused it

**Severity: medium, potentially high during visible stalls.** Idle-GPU LM1 fails on candidate and baseline; one candidate stall remains unexplained (`docs/plans/v2.8/74-live-character-motion.md:209`). Full-body trial was NO-GO (`:224`).

**FOLD v2.8 74/36 investigation.** P4; M. Risks H/B. Instrument the unexplained long stall before more animation. Keep the failed record and current defaults; do not reopen full-body work merely because it exists.

### A13 — Codex has no explicit current-versus-historical fact relation

**Severity: low today; authoring limitation.** All disclosed facts are emitted (`src/runtime/codexView.ts:38`). Guide currently calls facts lasting truths (`src/copilot/guideTopicsCodex.ts:6`).

**FOLD v2.8 52**, N20. P3; M. Risks K/R. Owner decision needed on evolving facts versus continued use of lasting/past-tense wording. This is not evidence that existing authored pages are contradictory.

## Proposed v2.9 plan set

01 is this triage. Proposed plans 02–09: eight substantive plans.

### Character delivery

#### 02 — `02-roster-voice-prevention.md`

**Pitch:** characters sound more distinct before a rewrite is needed.

- **In:** one bounded `roster[].polish` configuration shared with plan 03; notes, preferred phrasing, avoid list and tics. Drafted-member private guidance; per-speaker repetition; explicit mood-conditioned delivery where authored. Studio, typed mutation/tools, guide coverage. No model call during play.
- **Out:** token bans, deterministic substitutions, automatic trait invention, runtime attribution judge.
- **Precedent:** private aims (`src/memory/innerRender.ts:85`), repetition miner (`src/stagecraft/repetition.ts:65`).
- **Dependencies:** v2.8 51/54 private-line and revision contracts; v2.8 09 for wizard integration. Voice guidance must not require a life declaration or disable inner voice.
- **Measurement/floors:** baseline versus prevention-only on 60 held-out English replies, at least three members. Blind speaker attribution gain ≥10 percentage points; targeted repetition down ≥25%; added guidance ≤120 tokens per drafted member. Zero cross-member/private-block leaks in adversarial tests. Record all denominators.
- **Owner decisions:** approve authored field and mood variants; decide later campaign adoption from count-only results.

#### 03 — `03-per-character-reply-polish.md`

**Pitch:** repair specific wording failures while preserving the reply’s events and the player’s choices.

- **In:** one lazy, routed call on explicit lexical/repetition signals; per-member policy; immutable-window validation; original retained; revision-bound writes; swipe synchronization; bounded abandonment. Default feature on, signal-triggered. Measurement arms compare baseline, prevention-only and prevention-plus-polish.
- **Out:** four sequential passes, whole-cast context, behaviour repair, stream hiding, send lock, automatic reasoning edits, manual post-commit polish in the first slice.
- **Precedent:** host text writer (`src/services/stHost/chatMessages.ts:18`), pending boundary (`src/runtime/turnBridge.ts:163`), edit re-read hold (`src/runtime/spikes/editReread.ts:144`).
- **Dependencies:** v2.9 02; v2.8 69 K6/K6b/K8/K13; stopped-partial decision.
- **Timing contract:** before SO consumers and before `fireAfterSpeak`. Also track whether a later generation already consumed the original. Default proposal: abandon once that happens; owner may instead approve a bounded next-generation hold. A pending-boundary hold alone does not solve this.
- **Measurement/floors:** 100 eligible replies, including group rounds, swipes and continues. Accepted outputs: zero independently identified event, knowledge, agency or mental-state changes; polish preferred ≥60%; attribution gain ≥10 points versus prevention-only; p50 ≤12 s/p95 ≤30 s; absolute hold deadline 45 s. At least 50% of eligible group targets successfully evaluated, preventing a misleading last-member-only result. Report abandonment and guard refusal rates.
- **Owner decisions:** Sol as the new polish-role default; independent rating route; visible end-of-stream swap; group cancellation versus bounded hold; whether dialogue rewriting starts in v1.

### Responsive characters and useful choices

#### 04 — `04-reactive-character-cues.md`

**Pitch:** characters notice specific events and have conversations that deepen.

- **In:** one authored cue bank supporting event reactions, remarks and topic tiers. Explicit priority, stable tie-breaking, bounded cooldowns. Shared mechanism for observed social-norm reactions. Member-private injection; offered and realized records distinct.
- **Out:** mandatory speech, automatic moral scoring, keyword-only secret disclosure, a second dialogue tree, unlimited retries until a line is spoken.
- **Precedent:** NPC trigger accounting and rollback; private life lines (`src/runtime/npcReplyRewind.ts`; `src/engine/life/lines.ts:48`).
- **Dependencies:** v2.8 50/51/52; coordinate permissions with v2.8 56. v2.9 02 supplies delivery. Runtime inference of who heard a topic waits for v2.8 42; authored witnessed-event gates can work first.
- **Measurement/floors:** 40 positive/negative cue opportunities across three members. Correct selection ≥95%; realized relevant reaction ≥80% of eligible offers; zero unauthorized topic progression, held-secret disclosures or player-action narration. Once/cooldown rollback equals replay at every cut.
- **Owner decisions:** authored cue format; whether any topic progression may use extraction rather than explicit state; campaign adoption.

#### 05 — `05-evidenced-story-threads.md`

**Pitch:** recognize supported patterns in what happened and bring them back meaningfully.

- **In:** bounded patterns over public transition, quest, milestone and check occurrences; ordered steps, limited actor bindings, cancellation conditions and evidence refs. Initially at most three steps and 16 active partial matches per pattern. Authored callback labels and hints.
- **Out:** general Datalog, arbitrary transcript pattern mining, inferred motives, private rumor/promise/relationship sources in the first slice, blackboard writes from matches.
- **Precedent:** consequence refs (`src/runtime/consequences.ts:175`), recap rollback contract, existing open arcs.
- **Dependencies:** v2.8 46/52; v2.9 04 only for optional private reaction delivery. Public-only first slice does not depend on unpassed witness consumers.
- **Measurement/floors:** 50 frozen positive/negative sequences; precision ≥95%, recall ≥85%; zero unsupported causal claims or hidden-name disclosures. Replay identical across every edit/delete cut, including retained-history floor. Matcher p95 ≤2 ms per boundary on the frozen stress fixture.
- **Owner decisions:** authored patterns plus a small built-in public library, or authored-only; approve bounded initial event vocabulary.

#### 06 — `06-grounded-next-actions-and-stakes.md`

**Pitch:** “What could I do?” offers relevant possibilities and explains visible ways to improve the odds.

- **In:** seed suggestions from public goals, unresolved threads and disclosed check-help hints. Deterministic ranking and dormant-thread resurfacing. Model words the offers. Optional unavailable reasons only for explicitly disclosed options.
- **Out:** inventing outcomes, displaying hidden dice/targets, enumerating hidden routes, automatic sending, requiring a sifter match before any suggestion is available.
- **Precedent:** existing projection, suggestion parser and safe input fill (`src/runtime/playerProjection.ts:88`; `src/runtime/suggestions.ts:40`; `src/runtime/suggestionsHost.ts`).
- **Dependencies:** v2.8 18/52 and v2.9 05; use existing goals while structured threads are absent.
- **Measurement/floors:** 40 frozen stuck-player situations. At least three usable suggestions in ≥90%; at least one evidence-grounded goal/thread offer in ≥85%; zero hidden-prerequisite or predetermined-outcome leaks. Blind usefulness improves ≥0.5 on a five-point scale over current suggestions. No additional model call per request.
- **Owner decisions:** explicit check-help disclosure field; unavailable-option presentation within the existing panel.

### Consequences and perception

#### 07 — `07-delayed-story-echoes.md`

**Pitch:** earlier choices can return later, when the world still supports their consequence.

- **In:** authored delayed cue scheduled from a typed occurrence; story-part or boundary delay; occurrence identity; due-time gate and audience revalidation; cancel/expire/land records. First slice delivers cues only.
- **Out:** arbitrary host effects, nested boundary commits, advancing story time to force delivery, recursive event chains, resolving the player’s response.
- **Precedent:** rumor due/occurrence design (`src/memory/rumors/spread.ts:40`, `:54`), meanwhile landing, canonical story time.
- **Dependencies:** v2.8 46/50/52; v2.9 04 for member cues. Any later effect expansion must use existing engine writers or EffectsApplier ledger.
- **Measurement/floors:** 40 schedules covering time jumps, invalidated targets, absent recipients and rollback. Exact once-only due/cancel behaviour 100%; zero early or unauthorized delivery; narrator acknowledges ≥80% of eligible visible cues in real play. Same result after reopen and replay.
- **Owner decisions:** cue-only first slice; expiry versus waiting when temporarily invalid; campaign adoption.

#### 08 — `08-player-observations.md`

**Pitch:** the player can notice authored details without the narrator choosing their feelings or actions.

- **In:** authored observations with disclosure gates; optional seeded passive check; one earned record and source citation; presentation in the existing story card/Journal. “You notice…” conveys perception, not a conclusion.
- **Out:** generated private thoughts, named competing inner personalities, forced belief/emotion, Thought Cabinet economy, hidden-data-to-UI filtering.
- **Precedent:** seeded checks and codex disclosure latches (`src/engine/gameSchema.ts:118`; `src/engine/codexSchema.ts:59`).
- **Dependencies:** v2.8 18/52 and the agency clarification G07; v2.8 50 only for time-bound observations. Does not consume NPC inner voice.
- **Measurement/floors:** 40 eligible/ineligible observations; exact deterministic reveal and rollback 100%; zero unknown entities, secrets, imposed feelings or voluntary actions. At least 8/10 synthetic-story tasks: player finds the clue and understands it offers information, not an instruction.
- **Owner decisions:** approve the surface and passive checks; approve perception-only scope; decide whether named player voices are wanted later.

### Current-feature usability

#### 09 — `09-effective-feature-help.md`

**Pitch:** Help accurately explains what this chat has enabled and what is waiting for setup.

- **In:** existing resolved feature state and provenance in Help; story/chat/install distinctions; relevant existing check consequences and effective route readiness. Correct off-stage-event copy. Keep evidence status separate from enabled state.
- **Out:** a new dashboard, second readiness registry, automatic feature disabling, runtime gate enforcement based on informational quality floors.
- **Precedent:** resolver and workspace feature pages (`src/runtime/featureResolve.ts:25`; `src/components/workspace/FeaturePages.tsx:26`).
- **Dependencies:** existing v2.8 feature-policy/workspace work; no model dependency.
- **Measurement/floors:** 24 state combinations covering defaults, story declines, chat overrides, unavailable routes and no-story context. Help/workspace/control agreement 100%; zero author-only disclosures. Browser verification at desktop and phone sizes; all Show me links reach the relevant control.
- **Owner decisions:** none beyond accepting scope; reuse current state vocabulary and surfaces.

## Build order and common acceptance

1. **Finish the relevant v2.8 foundation work:** stopped-partial contract, fold compatibility, transcript-copier warning and measurement hygiene. Preserve the existing v2.8 queue; this document does not reorder it.
2. **v2.9 09 and 02:** trustworthy Help and voice prevention. Measure prevention alone.
3. **v2.9 04:** reactive character cues.
4. **v2.9 05 → 06:** bounded thread recognition, then grounded suggestions.
5. **v2.9 07:** delayed cues after their recipient/delivery contracts exist.
6. **v2.9 08:** player observations after the surface and agency decisions.
7. **v2.9 03:** timing/ownership spike can start after 02; automatic rewriting lands only after its consumer-order and independent-faithfulness evidence.

For every feature plan:

- Register it; update `docs/authoring/story-guide.md`, compact guide coverage, `npm run docs:guide` and `npm run docs:settings`.
- Lazy-load substantial code; preserve the 1,300,000-byte main budget.
- Run quick gates until green, then full gates including Storybook where applicable. Record exact outputs.
- Model-consuming acceptance uses real Artemis replies with thinking and inner voice on, on an authorized lane/GPU window. Model-produced outputs need independent evaluation.
- Archive private session evidence in `so-sessions`; public plans retain counts and artifact fingerprints.
- Decide campaign adoption explicitly. Any later campaign review goes to another model; owner-facing reports contain counts only.
- Freeze corpus, prompts, scorer, routes, settings and floors before inference. Report abstentions, cancellations and denominators.
- No v2.9 model-time or pod budget is authorized by this triage.

## Challenges to the harvest

1. **“Design ready” overstates reply polish.** The pending-boundary seam is real, but later group generation can already consume raw text. `fireAfterSpeak` itself can generate replies (`src/runtime/runtimeManager.ts:333`). Holding only the boundary does not make every consumer read the polished version.

2. **Lexical guards do not prove semantic equivalence.** “She accepts” → “She refuses” needs no new name, number, quote count or player mention. Anchor guards protect immutable regions; they do not protect propositions within editable regions. Keep independent semantic evaluation and adversarial negatives.

3. **Preserving reasoning bytes does not prove thought/reply agreement.** v2.8 69 K6b exists precisely because text revisions matter. Never relabel old reasoning as evidence for a materially changed reply. Keep reasoning and inner voice on, while recording revision provenance.

4. **The proposed polish inputs are not automatically public.** Card personality/examples can contain author-only information. A style field can itself mention a hidden entity. “No memory tiers” is insufficient. Use a bounded style projection; do not feed complete cards, lore keys or undisclosed names to the rewriter.

5. **Group overlap is not “zero added wall time.”** A 30-second polish can outlast the group round, hold downstream SO work and be canceled by the player’s next message. Measure full-round latency, exposure, coverage and wasted calls.

6. **A phrase token ban cannot be treated as a phrase policy.** The Castward host finding directly weakens the scout’s NovelAI recommendation. Prompt prevention is the first implementation; backend-specific bias remains deferred.

7. **The fold repair must respect coverage.** Collapsing everything through the latest covered endpoint can discard an uncovered chapter or authored exclusion. Compute a verified leading covered span, not merely `max(range.to)`. This review has not reproduced the CC failure.

8. **The existing voice score is not a distinctness proxy without validation.** Its question largely concerns consistency with role, drive and feelings (`src/judge/warden.ts:82`). Two interchangeable speakers can both score well.

9. **“Most predicates wins” is unsafe as a generic specificity rule.** Boolean `any` and `not` make raw predicate counts misleading. v2.9 04 should use explicit priority and stable tie-breaking; report overlapping rules to the author.

10. **Pattern recognition deserves a narrower value claim than V5.** SO’s consequence refs are selected state changes, not a complete event database. They cannot establish every social microstory or a causal chain. Start with supported public patterns and measure whether callbacks help.

11. **Codex replacement is not merely a projection tweak.** It needs schema/validation, guide/tool coverage, valid replacement chains, story-update semantics and tests proving hidden successors do not affect visible output (`src/engine/validate/codex.ts:14`; `src/runtime/codexView.ts:38`).

12. **Finishing a story does not revoke privacy.** Post-story rumor paths may expose never-disclosed secrets or alternative future material. A reveal needs authored permission or an explicit owner decision; the final record alone is insufficient.

13. **Slow burn is not automatic forgetting.** Per-day caps and semantic-repeat protection address rapid drift. Decay toward baseline is a different authored world rule; do not bundle it into a quality fix.

14. **New surface value is less certain than the summary implies.** Diaries, player voices and typography lack session evidence here. Keep diaries/voices deferred; request a decision for the bounded observation surface.

15. **Old status prose and budgets are stale.** Queue entries and plan headers sometimes still say unmerged/unbuilt despite newer source and records. The old 12-hour rationale is also superseded by the lean-suite revision and owner arrangement (`docs/plans/v2.8/70-final-suite.md:396`; `docs/plans/v2.8/71-gpu-plan.md:275`). Do not allocate v2.9 from an obsolete remainder.

16. **Prevention is not an S-sized completed feature.** Rendering one line is small. Its authored schema, validation, Studio, tools, guide, pin/update handling and real-model measurement make plan 02 M-sized.

## Review record

- Read-only source/document review completed on 2026-10-21.
- No files edited; existing working-tree changes left untouched.
- No campaign repository, secrets, owner ST instance or GPU accessed.
- No tests, builds, browser checks or model measurements run. Documentation-only triage requires none; no implementation or acceptance gate claimed green.

## Unresolved owner questions

1. Accept the eight-plan set and prevention-before-polish order?
2. For polish, authorize Sol as the default route, signal-triggered operation and a visible final-text swap? Which independent rating route should evaluate Sol-written rewrites?
3. In group rounds, prefer abandoning polish once another generation consumes the original, or a bounded hold before the next generation? The former may sharply reduce coverage.
4. Should retained stopped partials count as story turns? If not, what explicitly accepts one, and how should later reads treat it?
5. Approve perception-only observations on the existing story card/Journal? Named player inner voices remain deferred.
6. For reactive topics, start with authored event gates only, or permit extraction-based addressed-topic evidence after witness acceptance?
7. Keep codex facts lasting/past-tense, or add explicit disclosed replacement history?
8. Confirm feelings and conclusions belong to the player, while NPC thinking and inner voice remain on; any authored rules-imposed mental conditions need a separate bounded exception.
9. After prevention and cue measurements, which features should the private campaign adopt? Review remains delegated away from the owner, with counts-only reporting.
10. What model-time allocation should v2.9 receive after the current v2.8 arrangement? No new pod creation is authorized here.