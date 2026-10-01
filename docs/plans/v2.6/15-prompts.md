# Plan 15 Part A item 6 — prompt audit

2026-09-30. No real model calls were made. Every change below needs a real-model check in the plan 14 sessions; those checks are listed in the last column of each section and gathered at the end.

**Models.** Main RP: Artemis 31B (Gemma 4 family), llama-server Text Completion, profile `Artemis RunPod RP`. Every orchestrator pass (read, synthesis, authoring, director, curator, inner): DeepSeek flash, Chat Completion.

**Transport (shared by every pass).** `requestModelReply` (`src/services/stHost/modelReply.ts`) sends the whole prompt as ONE `user` message with `includePreset: true, includeInstruct: true`. Three consequences apply to every row below:

- The profile's system prompt is prepended. Plan 15's model audit found the memory/image profiles carrying the roleplay system prompt `Sphiratrioth - Roleplay - 3rd person`, which invites a pass to continue the story. Fixing that is config work (item 5). This audit makes every pass that lacked one open with an explicit "do NOT continue the roleplay" task line, so each pass survives a profile that still has the wrong system prompt.
- Stop strings are the instruct template's (`stop_sequence`/`input_sequence`, trimmed by `cleanTextCompletionReply`). No pass sets custom stops. Line grammars therefore end on EOS or `max_tokens`; the shared read already refuses a `length` finish whole.
- Reasoning: inline `<think>`/Gemma channel blocks are stripped by `stripReasoningBlocks` for every pass. DeepSeek's out-of-band reasoning is read by `readReasoning`. No prompt asks for reasoning, and none needs to.

**Versioning.** No change touches an output grammar, so no contract version moves. The shared read has no prompt-version constant: `hashContract` is audit-only (`contractHash` on the audit, nothing cached by it), and recorded goldens are model RESPONSES (`test/goldens/*.response.txt`), which still parse identically. `EXPANSION_CONTRACT` (2) versions the generated chain's shape; the generation prompt gained context, not fields, so cached chains stay valid. `hashContract` gained `deltasOnly` (only when set), so a deltas-only audit is distinguishable.

**Bundle.** Main `dist/index.js` 1,218,591 B after this change (limit 1,250,000). Baseline and delta in the Gate record.

## Summary table

| # | Prompt | Lives in | Model / role | Verdict | Δ tokens per call |
|---|---|---|---|---|---|
| 1 | Shared read | `extraction/contract.ts`, `memory/contract.ts` addendum | DeepSeek / read | **changed** (bug fix + context) | +100…160 (4-member roster) |
| 2 | Supersession bridge | `memoryCoordinator.runSupersessionBridge` → shared read | DeepSeek / read | **changed** (waste) | about −550 |
| 3 | Scene summary + reduce | `memory/contract.ts` | DeepSeek / synthesis | changed (guard) | +25 |
| 4 | Short-term (rolling + window) | `memory/contract.ts`, `memory/shortTermAppend.ts` | DeepSeek / synthesis | changed (guard) | +20 |
| 5 | Arc summary | `memory/contract.ts` | DeepSeek / synthesis | changed (guard) | +25 |
| 6 | Canon | `memory/canon.ts` | DeepSeek / synthesis | changed (wording bug) | 0 |
| 7 | Epistemic + ledger scene pass | `memory/contract.ts`, `extraction/sceneArms.ts` | DeepSeek / read | one wording fix | 0 |
| 8 | Consolidation | `memory/consolidate.ts`, `judge/memory.ts` | judge (no LLM prompt) | no change | 0 |
| 9 | Director | `talk/prompt.ts` + `talk/parse.ts` | DeepSeek / director | **changed** (context) | +20 + ~6 per candidate role |
| 10 | WI curator, create, digest | `stagecraft/prompt.ts`, `createCandidate.ts`, `curatorDigest.ts` | DeepSeek / curator | no change | 0 |
| 11 | Continuity warden | `judge/warden.ts`, `judge/curators.ts` | judge | no change (calibrated) | 0 |
| 12 | Wizard stages, driver suggest/report | `copilot/prompts.ts` | DeepSeek / authoring | no change | 0 |
| 13 | Agentic wizard | `copilot/agent/prompt.ts` | DeepSeek / authoring | no change | 0 |
| 14 | Expansion generator | `generation/prompts.ts` | DeepSeek / authoring | **changed** (context) | +120…250 |
| 15 | Expansion critic + LLM pick | `generation/prompts.ts`, `judge/expansion.ts` | DeepSeek / critic | changed (context) | +100…200 |
| 16 | Revalidation | `generation/critic.ts` (code checks) | none | no prompt | 0 |
| 17 | Inner voice beat | `memory/innerBeat.ts` | DeepSeek / inner | changed (role) | +10 |
| 18 | Chapter record, saga, era merge | `memory/chapterRecord.ts`, `memory/chronicle.ts` | DeepSeek / synthesis | saga changed | +30 (saga) |
| 19 | Judge questions (all uses) | `src/judge/*`, `sprites/classify.ts` | TypeSafe / judge | no change (calibrated) | 0 |
| 20 | Image director | `image/prompt.ts` | image profile | changed (ambiguity) | +3 |
| 21 | Sprite expression LLM fallback | `sprites/classify.ts` | image/LLM | no change | 0 |
| 22 | Main-model blocks: memory tiers | `memory/inject.ts`, `runtime/memoryInjector.ts` | Artemis / main | **changed** (labels) | +5…15 per non-empty tier |
| 23 | Main-model blocks: other | `pacing/steering.ts`, `pacing/guidance.ts`, `memory/epistemic.ts`, `memory/ledger.ts`, `memory/innerRender.ts`, `judge/scene.ts`, `stagecraft/warden.ts`, `runtime/chapterKit.ts` | Artemis / main | no change | 0 |

## 1. Shared read (the per-turn extraction)

**Where.** `renderSharedReadPrompt` in `src/extraction/contract.ts`; the memory/arc/epistemic/ledger addendum in `src/memory/contract.ts`. Run by `runSharedRead` for cadence reads, P0 re-reads, reconcile, the memorize backlog and the live suite (`fixtureRun.ts`, same path).

**Findings.**
- **Bug — character-tagged memories vanished.** The MEMORY grammar asks for `character="<roster id>"`, but the prompt never listed a roster id. A model can only answer with a name. `inject.ts` filters a facts row whose `characterId` is not the active speaker's roster id (`"other-speaker"`), so a name-tagged fact was hidden from EVERY speaker, including in a solo chat (active speaker null). Nothing failed; the fact just never reached the main model. The tag instruction ("the enabled roster member the memory concerns") also invited tagging any fact that merely mentions a member, which would hide shared facts from everyone else once the ids did match.
- Context: the active checkpoint was a bare id (`cp2`); its name and objective appeared only via canon-lite, and only for VISITED anchors. No cast list, no roles, no player name (player lines are marked only when a world-evidence quality exists).
- No task line. With a roleplay system prompt in the profile (see transport), DeepSeek may answer in character; the epistemic, canon and curator prompts already carried a guard, the shared read did not.
- Format: no rule against prose/headings/code fences (DeepSeek fences line output often; each fence line lands in `rejected` as "unrecognized line" and clutters the audit). `value=<json_literal>` was not illustrated; the evidence quote rule did not say whether the `[index] Speaker:` prefix belongs in it (the parser accepts both; `labelledEvidence.test.ts`).
- The prompt ended on the transcript, with no output cue.

**Changed.**
- `READ_TASK_HEADER` first line ("output structured lines only. Do NOT continue the roleplay or write as any character").
- `Active checkpoint: <name> — <objective>` (falls back to the id when the contract carries no checkpoint).
- `Cast (roster id = name): warden = Arin (the gate warden); …` from the story roster (`readContext`, shared by the live read and `fixtureRun`, so jest and the live suite still send what play sends).
- `Player character: <names>.` from the window's user speakers (no host dependency; absent when the window has no player line, so the T15 "byte-identical without a world quality" guarantee about `(player)` marks still holds).
- One line stating `value` as a JSON literal with examples and the evidence as a verbatim span without the prefix; one line: no prose, headings, numbering or code fences.
- Trailing `Output:`.
- MEMORY tag rule rewritten: `character="<roster id from the Cast line>"` only when the memory is private to that one member, with the consequence stated.
- **Parser-side fix** (the half that does not depend on the model obeying): `runSharedRead` maps each MEMORY `characterId` through `rosterCharacterId` — exact id, then case-insensitive name — and drops a tag naming nobody, so the row becomes shared instead of invisible.

**Token delta.** About +100 tokens fixed plus ~8 per roster member; the MEMORY rule +30.

**Tests.** `src/extraction/promptAudit.test.ts` (header, checkpoint, cast, player, `Output:`; name→id mapping and unknown-tag drop; id fallback). `playerEvidence.test.ts` T15 transcript-slice and `windowHygieneWiring.review.test.ts` expectation updated deliberately for the trailing `Output:` and the checkpoint/cast lines. All 29 extractor goldens re-parse unchanged (they are responses).

**Real-model check (plan 14).** Live suite on DeepSeek (`so-live-suite.mts --expect-count 29`) against the last recorded run: plot-delta accuracy and facts tier must not drop. Read 20 audits from a T1 session: count `rejected` "unrecognized line" (expect fewer), count MEMORY rows with `character=` (expect few, all private), and confirm no tagged row lands as `other-speaker` for its own member.

## 2. Supersession bridge

**Where.** `MemoryCoordinator.runSupersessionBridge` reuses `runSharedRead` over a synthetic window of superseding memory notes (speaker `narration`), and uses ONLY `acceptedDeltas`.

**Findings.** It sent the whole memory addendum (MEMORY grammar, tier taxonomy, scene-break, arcs, and the cast) — about 550 tokens of instructions for outputs the caller throws away, and an invitation for the model to spend its budget on them.

**Changed.** New `deltasOnly` option → contract flag: the prompt keeps the header, checkpoint, canon-lite, DELTA grammar, quality questions and the notes, and drops FACT, the memory addendum and the cast line. The parser is unchanged (it accepts DELTA either way).

**Token delta.** About −550 per bridge call.

**Real-model check.** Trigger a consolidation that supersedes a latching value (plan08 bridge scenario, real model): the bridge delta still lands.

## 3–5. Scene summary, scene reduce, short-term (rolling and window), arc summary

**Where.** `buildSceneSummaryPrompt`, `buildSceneReducePrompt`, `buildShortTermSummaryPrompt`, `buildArcSummaryPrompt` (`src/memory/contract.ts`); `buildShortTermWindowPrompt` (`src/memory/shortTermAppend.ts`).

**Findings.** Clear, short, free-text. None carried the "do not continue the roleplay" line that canon, era merge, chapter record and saga already had; with a roleplay system prompt in the profile these are the passes most likely to answer as a character (they read like "continue from this scene"). No instruction to keep names verbatim (the chapter-record verifier would later flag invented names; scene history feeds it).

**Changed.** `SUMMARY_TASK` first line on all five; `NAMES_RULE` ("Use every name exactly as written. Invent nothing.") on the four that summarise play.

**Token delta.** +20…25 each.

**Real-model check.** Scene summaries from one T1 session: none in first person, none continuing the scene.

## 6. Canon

**Where.** `buildCanonSummaryPrompt`, `src/memory/canon.ts`.

**Findings.** Good structure and guard. One wording bug: "Base everything strictly on the source material **above**" while the material is below the instructions.

**Changed.** "above" → "below". `canonInputHash` is untouched, so no canon goes stale because of this.

## 7. Epistemic and ledger scene pass

**Where.** `buildEpistemicPassPrompt`, `buildLedgerPassPrompt` (`src/memory/contract.ts`), assembled in `extraction/sceneArms.ts`.

**Findings.** The strongest prompts in the set: task header, explicit rules, asymmetry, witness, deception, a retire protocol. The ledger pass contradicted itself when no entity list exists ("infer named entities" under "STRICT RULES: … Never infer").

**Changed.** The placeholder now reads "(no list: use the entities the excerpt names)".

## 8. Consolidation

No LLM prompt: dedup is vectors/Jaccard bands plus the judge pair questions (`judge/memory.ts`). See 19.

## 9. Director

**Where.** `renderDirectorPrompt` (`src/talk/prompt.ts`), parsed by `parseDirectorResponse` (`src/talk/parse.ts`). Also used by `roleSelfTest` and `roleCalibration`.

**Findings.**
- Candidates carried `role` (from `buildCandidates`) but the prompt listed names only, so "who has the strongest reason to react" had nothing but names to go on. The judge director already uses roles; the LLM director did not.
- The player's name was used only in the hand-back line. The transcript shows the player as one more speaker; nothing said that speaker is not a candidate.
- No task line; a roleplay system prompt can produce a reply in character, which the parser rejects (the rules pick stands, so the cost is a wasted call and a silent fallback).
- Strict output with no tolerance for the likeliest deviation once roles are listed: `SPEAKER: Arin (the gate warden)`.

**Changed.** Task line; `Candidates:` as a bullet list with roles when any candidate has one (names-only form kept otherwise); "`<player>` is the player, not a candidate."; the answer line says "the name only, spelled as listed". Parser: exact match first, then the head before ` (`, `: ` or ` — ` — still never a substring or id match (the reason the id match was removed stands).

**Token delta.** +20 plus ~6 per role.

**Real-model check.** `roleCalibration` director arm on DeepSeek against its recorded floor (the calibration measures whatever prompt ships, so re-measure rather than reuse); T2 group sessions: share of turns where `source: "director"` vs fallback.

## 10. World Info curator (plus create and digest variants)

**Where.** `buildWiCuratorPrompt` (`stagecraft/prompt.ts`); `buildCreateCandidatePrompt` (`createCandidate.ts`) and `buildDigestCuratorPrompt` (`curatorDigest.ts`) derive from it by string replacement.

**Findings.** Rich and strict: task header, story, checkpoint name+objective, canon (truncated 1,200 chars), open threads, closed entry list with numbering, declined ops, explicit rules, `NONE` as the expected answer. Two notes, no change:
- The create and digest variants depend on exact sentences of the base prompt (`NEVER_INVENT`, `OUTPUT_LINE`, `ENTRIES YOU MAY TOUCH …`, `NO_CURATOR_ENTRIES`). Any future edit to those sentences silently disables the variant's insertion. Left alone deliberately; flagged for whoever edits next.
- No example line for `[patch]`. The 2026-09 calibration (v2.4 plan 08) measured this prompt; changing it would invalidate that measurement for no identified defect.

## 11. Continuity warden

Judge questions (`judge/warden.ts`, `judge/curators.ts`), not an LLM prompt. The note it injects (`composeWardenNote`) is covered in 23. No change: see 19.

## 12. Wizard stages and driver

**Where.** `renderStagePrompt`, `renderSuggestPrompt`, `renderReportPrompt` (`src/copilot/prompts.ts`).

**Findings.** Stage prompts are rich (schema summary, op grammar, interview protocol, stage instruction, full draft JSON, environment, history) and end with "Respond with the JSON object only." The driver prompts name the checkpoint by id; they are author-facing, so that is acceptable. The full draft JSON is the largest token cost and is necessary. No change.

## 13. Agentic wizard

**Where.** `renderPlanPrompt` / `renderStepPrompt` (`src/copilot/agent/prompt.ts`; `route.ts` was out of scope, edited by another agent).

**Findings.** Rules, tool schema, goal, draft, coverage, install, notes, plan, last 12 steps truncated to 600 chars; one JSON object per reply. Clear and consistent with `parse.ts`. No change.

## 14–15. Expansion generator, critic and LLM pick

**Where.** `renderGenerationPrompt`, `renderCriticPrompt` (`src/generation/prompts.ts`); `buildPickPrompt` (`src/judge/expansion.ts`).

**Findings.**
- The generator writes the beats the main model will later be steered by, but it saw the source checkpoint, the stub and the TARGET ANCHOR as bare ids. It had no premise, no cast, and no idea what the target anchor is about except through canon-lite (visited anchors only — the target is by definition not visited). The objectives and guidance it wrote were therefore guesses about a situation it was never told.
- The critic had the same gap: it judged beats against an anchor it knew by id only.
- The pick prompt already carries the target's name and objective. Fine.
- Gate grammar, examples, route rules and agency policy are strong and match `parseGeneratedBeats` / `runCodeChecks`.

**Changed.** Both prompts now carry `Premise:` (story description, capped at 600 chars), `Cast:` (names with roles), and checkpoint lines as `<id> "<name>" — <objective>` (the id stays, because outcomes must reference it in `progress.anchor`). The generator gained one sentence: beats set up a situation for the cast to play, naming only the cast or people the facts establish.

**Versioning.** Output schema unchanged, so `EXPANSION_CONTRACT` stays 2 and cached chains stay valid.

**Token delta.** Generator +120…250, critic +100…200 (premise length dominates).

**Real-model check.** One pre-generation per Adolion hub story (T3): code checks pass rate, critic verdicts, and whether beat objectives now name the target anchor's situation.

## 16. Revalidation

`revalidateExpansion` is code checks over every route (`generation/paths.ts`); no model prompt.

## 17. Inner voice beat

**Where.** `renderInnerBeatPrompt` (`src/memory/innerBeat.ts`), called by `InnerCoordinator.beatFor`.

**Findings.** Good: task header, scene, pacing, agency rules, private aims and knowledge, strict two-line answer with a repair line. Missing the member's authored `role`, which is the one stable line about who the character is in this story.

**Changed.** Adds `<name>'s role in this story: <role>` when the roster member has one.

**Real-model check.** T4 inner-voice sessions: BEAT lines stay in character and never decide the player's act.

## 18. Chapter record, saga, era merge

**Where.** `buildChapterRecordPrompt`, `buildSagaPrompt` (`src/memory/chapterRecord.ts`); `buildEraMergePrompt` (`src/memory/chronicle.ts`).

**Findings.** Chapter record and era merge are strict and verified (`verifyChapterRecord` names and citations). The saga prompt dumps `FINAL STATE` as `- key: <JSON>` (quality keys like `trust_level: 3`) into a player-facing epilogue with nothing telling the model not to quote them; `verifySaga` checks names and length, not leaked keys.

**Changed.** Saga gained one line: FINAL STATE is internal; tell what it means as story, never quote a key, value or number from it.

**Real-model check.** One saga per finished T5 campaign: no quality key or raw number in the epilogue.

## 19. Judge questions

**Where.** `src/judge/{director,scene,lore,loreScore,memory,warden,curators,curatorFilter,extraction,expansion}.ts`, `sprites/classify.ts`.

**Findings.** Short, typed (noul/choice/score) questions over named state slots, each with criteria. They are the calibrated surface: a use routed to a provider with no calibration row for provider × model × use is refused, and the lore relevance golden replays by request key (`loreRelevance.test.ts`). Rewording any question invalidates its calibration and its golden. No defect found that would justify that cost. **No change.**

## 20. Image director

**Where.** `imageMessages` (`src/image/prompt.ts`): system + user messages, JSON reply.

**Findings.** Clear JSON contract, model menu, tag vs prose skill by family. One ambiguity: the JSON key `checkpoint` means an IMAGE model checkpoint, while the user message labelled the story beat `STORY CHECKPOINT:` — the same word for two things in one request.

**Changed.** `STORY BEAT (not an image model): …`.

**Real-model check.** None needed beyond the image sessions (images are off in the autonomous tests; known limit).

## 21. Sprite expression LLM fallback

`expressionPrompt` (`sprites/classify.ts`): system + user, one `number|character|expression` line per passage, with a GBNF grammar on capable backends. Clear. No change.

## 22. Main-model blocks: memory tiers

**Where.** `applyMemoryInjection` (`src/memory/inject.ts`) and the per-member staged facts (`MemoryInjector.setPrivateBlocks`).

**Findings.** Every other block Artemis receives carries a header — `Scene direction:`, `Pacing: …`, `Your private knowledge (…)`, `Current state:`, `[Scene: … ]`, `[The story so far]`, the inner-voice headers — but the four memory tiers were injected as bare lines at depths 2–6, in chat, as system role. On Gemma text completion an unlabelled list in the middle of the transcript reads like narration or stray notes, and nothing told the model these are facts to stay consistent with. ST's own Summarize labels its block (`[Summary: …]`; prior-art §8.1).

**Changed.** `labelMemoryBlock` prefixes a non-empty tier block with:
- facts: `[Established facts — true in this story; stay consistent with them]`
- session details: `[Details from this session]`
- short term: `[Recent events]`
- scene history: `[Earlier scenes]`

Applied where the block is written, not in `buildMemoryInjection`, so the `story_memory_<tier>` macros and `getMemoryInjectionBlocks()` stay unlabelled (an author who places a macro writes their own label). Budget selection counts entries only; the label costs 5–15 tokens per non-empty tier. The scannable tiers (facts, scene history) put the label words into the WI scan buffer when memory scanning is on; the words are generic and match no shipped key.

**Tests.** `memoryInjectorFates.test.ts` now expects the labelled block; `promptAudit.test.ts` covers the label helper.

**Real-model check.** T1/T2 sessions with `st-payload.mts arm --persist`: the labels appear once per tier in the request; Artemis never echoes a label line into a reply.

## 23. Main-model blocks: everything else

Read and left unchanged:
- **Pacing** (`pacing/steering.ts`): one sentence, direction + level, player clause from the agency policy. Good.
- **Checkpoint guidance** (`pacing/guidance.ts`): `Scene direction:`, per-member `Direction for X only:`, objective line with the objective-kind clause. Good.
- **Epistemic** (`memory/epistemic.ts`): private second-person block for a drafted member, attributed block for a solo narrator; both say never to reveal what is concealed. Good.
- **Ledger** (`memory/ledger.ts`): `Current state:` + `Entity: field=value`. Terse; acceptable for a state table.
- **Inner voice** (`memory/innerRender.ts`): own aims / cast aims / narrator block, each with a "never announce" header. Good.
- **Scene tracker** (`judge/scene.ts`): `[Scene: <where>. Present: …]`. Good.
- **Continuity note** (`stagecraft/warden.ts`, `judge/warden.ts`): `Agency:` / `House rule:` / `Lore:` lines, at most 4, depth 0, one generation. Good.
- **Story so far / chapter bridge** (`runtime/chapterKit.ts`): bracketed headers. Good.
- **Agency** (`engine/agency.ts`): one clause set used by steering, objective line, generation, critic and inner beat — consistent everywhere it appears. No ids reach any of these blocks except the ledger's entity names (story names, not ids).

## Real-model checks for plan 14 (gathered)

1. Live suite (DeepSeek, 29 fixtures): plot-delta and facts tiers not below the last recorded run.
2. Shared-read audits from a T1 session: fewer "unrecognized line" rejections; `character=` rows rare and private; no own-member `other-speaker` fates.
3. Supersession bridge delta still lands on a real model.
4. Scene/short-term/arc summaries never written in character.
5. Director: re-run `roleCalibration` on DeepSeek; T2 director-vs-fallback share.
6. Expansion: pre-generation on each Adolion hub story; code-check pass rate and critic verdicts; objectives name the target's situation.
7. Inner beat: in character, never the player's act.
8. Saga: no quality keys or raw numbers.
9. Payload captures: memory labels present, never echoed by Artemis.

## Gate record

2026-09-30, worktree on master `eba02fc8`. No real model, no lanes.

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:test` | clean |
| `npm run lint` | clean |
| `npm test` | 370 suites passed, 1 skipped; 4918 tests passed, 1 skipped |
| `npm run build` | ok, bundle `ee20a9e04a08` |
| `npm run build:dev` | ok |
| `npm run test:debug` | 457 / 457 |
| `npm run test:release` | 77 pass, 2 skipped, 0 fail |
| `npm run test:replay` | 30 of 30 killed |

Bundle `dist/index.js`: 1,214,533 B before (parent src, same toolchain) → 1,218,591 B after, **+4,058 B**; 31,409 B under the 1,250,000 B limit.

Tests changed deliberately: `playerEvidence.test.ts` (T15 transcript slice stops before the new trailing `Output:`), `windowHygieneWiring.review.test.ts` (expected prompt carries the checkpoint/cast context the fixture path now sends), `memoryInjectorFates.test.ts` (facts block is labelled). New: `src/extraction/promptAudit.test.ts`.

Deviation: none of the changes is live-proven; every one is listed under the real-model checks above and is NOT green until plan 14 runs them.
