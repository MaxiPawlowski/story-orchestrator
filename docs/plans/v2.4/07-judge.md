# Plan 07 — Judge

**Status: PART 1 BUILT in a worktree on `4151bc8` (2026-09-24/25): T24, T25 narrowed, dead toggles removed, judge-off control harness. Part 1 live gates RUN 2026-09-25 (bundle `7f1787158bf8`; see Gate record): meter green ×2, J8.5 control column on ×2 / off ×1, limit probe → token guard BUILT (bundle `0ac21d135bc0`; plugin half not installed), `jev-latest` resolved. T22/T23 NOT STARTED (wait on plan 04's T15 decision).** Written 2026-09-23 against the working tree on `fcc33cc` + uncommitted V15b/V25 edits.
T24 and T25 depend only on plan 01 (the T21 and T4 corrections), so they can start early.
Dead toggles need nothing. T22 and T23 come last:
- T22 needs plan 01's T6 generation tracker (the note path) and plan 04's T15 decision (D6: opt-in).
- T23 reuses T22's note composition.

Reconciled with `00-overview.md` §Reconciliation X8, X12, X22 and X23 (2026-09-23).
- The over-steer probe comes from plan 01 (X8).
- This plan builds the harness items listed in X12.
- Keys, removals and house-rule scope are decided (X22).
- The cost meter is an inv-11 exemption that plan 09 reads (X23).

## Goal

1. **Account before adding.** Every judge call records what it cost and which model answered.
   Every readiness number states the model it was measured on.
2. Remove the two toggles that nothing reads.
3. Then try two new uses on the warden's existing off-path, one-turn note path:
   - an agency check (T22);
   - authored house rules (T23).

   Each one ships only past a floor declared before its run. **A use below its floor is recorded
   as not built, and no floor is retuned.**

## Scope / out of scope

**In scope:**
- T24: usage and cost accounting, plus `measuredOn` readiness.
- T25, narrowed (D10): a model-id map, the answering model reconciled, and a token guard that is
  built only once Jev's limit is verified.
- Remove `sceneOoc` and `memoryRerank` (X22).
- The `backgrounds` verdict (X22: kept out of the recommended set, gets `measuredOn`).
- T22 and T23, each with its own Phase A and its own key (X22).
- Harness work (X12):
  - a judge-on journey mode, `setup.judge` / `--judge-uses` (today `so-journey.mts:303-308`
    forces every use off);
  - a cost aggregation verb over the T24 meter;
  - `so-judge calls --use/--chat`;
  - the T22/T23 fixtures;
  - `so-lore-probe diff`, which is the judge-off control column (R8);
  - `so-judge rescore`;
  - a privacy-report row per new use and per host.
- **Reused, not built here (X8):** plan 01's over-steer probe (rule 5, R9). This plan runs it on
  the existing warden as the baseline, then on T22/T23.

**Out of scope:**
- Hosted routes (NanoGPT, OpenRouter) and local Jev-likes: D10, v2.5.
- The T21 fresh-row arms: dropped (D11).
- The T21 doc corrections: plan 01.
- The boundary judge bundle, the judge tension read, the pre-reply Choice, lore contradiction in
  the warden (R14), and the R16 disagreement record: v2.5.
- Refused outright: any reroll or swipe, any judge-written state, per-checkpoint rules (X22:
  story-level only), and a Copilot or wizard op for `house_rules`.
- Building the over-steer probe itself: plan 01 does that (X8).
- No default flips. Every new key is `false`.

## Verified current state

Read on the working tree 2026-09-23. **Drift** marks where SUMMARY, `jeved.md` or the v2.3 docs
disagree with the tree.

**Call record and usage**
- `JudgeResponse.usage` is typed (`src/judge/types.ts:62`), but `{input_tokens, output_tokens}`
  has no `cost` field.
- Neither `JudgeResult` (`types.ts:93-103`) nor `JudgeCallRecord` (`types.ts:80-91`) carries
  usage.
- `askJudge` drops `usage` (`src/judge/client.ts:56`).
- A cache hit returns an old response with `latencyMs: 0` (`client.ts:47-48`). `JudgeRuntime.ask`
  records it anyway (`src/runtime/judge.ts:139-150`), and nothing marks it as `cached`.
- **Drift:** the copy is two hops (client → result → record), not the one SUMMARY implies.

**TypeSafe does return usage.** Our own spike metered 334,328 input tokens for $0.01404
(`docs/spikes/2026-09-19-typesafe-jev/report.md:8-9`), noted "output is free" (`:628`), and has
per-call token means (`:594-630`).
- **Drift:** `recommended-config.md:22-23` says "cost is not measured". A spike measurement
  exists; what is missing is a runtime one.

**The ring rolls back.** `dropJudgeCallsAfter` (`src/judge/settings.ts:97-100`) is called from
`src/runtime/rollback.ts:43`.
- A cost total read from the ring **undercounts spend**: a rolled-back call was still paid for.
- Plan 09's "cost report from T24's ring" therefore cannot come from the ring as it stands.

**The answering model is already recorded:**
- `JudgeResult.model` is the model the response names (`client.ts:56`), and the record stores it
  (`runtime/judge.ts:144`).
- `so-judge` compares it by strict equality: `modelMatched: report.model === requestedModel`
  (`scripts/debug/so-judge.mts:97,128`).
- The plugin `/status` reports its constant `DEFAULT_MODEL`, not the model the install is
  configured to use (`server-plugin/story-orchestrator-judge/index.mjs:132`).
- Availability is cached per `enabled:model` (`runtime/judge.ts:55`).
- **Drift:** T25's "answering model recorded" is half done. Missing: the id map, a verdict that
  tolerates aliases, and readiness keyed by model.

**Readiness has no model.**
- `JudgeReadinessFact` (`src/judge/readiness.ts:15-23`) and `JUDGE_READINESS` (`:25-40`) carry
  no model, while `settings.model` is configurable (`settings.ts:38,55,69`, default
  `JUDGE_DEFAULT_MODEL = "jev-1.13.0"`, `policy.ts:1`).
- The table is keyed by `JudgeUseKey`, so **the warden has no readiness row** even though
  `recommended-config.md:28` rates it at 0.9765. `backgrounds` has no row either.
- **Drift:** the ring's `use` strings do not match the readiness keys:
  `warden`, `lore`, `scene`, `typed`, `stall` and `critic` (`continuity.ts:63`, `loreSelect.ts:70`,
  `sceneCoordinator.ts:93`, `typedRead.ts:14`, `extractionCoordinator.ts:145`,
  `expansionCoordinator.ts:169`), against `loreSelect`, `sceneTrigger`, …

**Plugin:**
- `DEFAULT_MODEL` at `index.mjs:8` and `MAX_REQUEST_CHARS = 140_000` at `:10`, enforced at `:96`.
- `TYPESAFE_BASE_URL` override at `:22`, with the path fixed to `/v1/systemone`.
- Upstream timeout 10 s (`:11`); one retry on 429/529 after 600 ms (`:12-13`).
- The upstream body goes back verbatim (`:141`), so `usage` does reach the page.
- **Drift:** the character cap is enforced on **both** sides; the page side is
  `src/judge/questions.ts:29` via `types.ts:2`. SUMMARY cites only the plugin.

**Dead toggles:**
- `sceneOoc` and `memoryRerank` appear only at `settings.ts:11,15,114,118`,
  `readiness.ts:38-39`, `readiness.test.ts:40-43` and `JudgeSettingsGroup.stories.tsx:127`.
  Nothing reads them.
- They are already missing from `BUILT_JUDGE_USES` (`settings.ts:125`), so the panel renders **no
  toggle** for them (`JudgeSettingsGroup.tsx:72`). They surface only as "on, but nothing has
  measured it" when a stored `true` survives (`readiness.ts:67-71`, `JudgeSettingsGroup.tsx:98-101`).
- **Drift:** `recommended-config.md:55` says the panel "presents them beside the measured ones".
  That is overstated.
- **Drift, larger:** `v2.4-seeds.md:29` says both were "never exercised by … a calibration row".
  **Both had a v2.2 Phase A, and both failed its predeclared floor:**
  - OOC: 88% on 24 cases with 3 of 12 false positives, against floors of ≥ 0.9 and ≤ 1 per 12
    (`docs/plans/v2.2/03-scene-read.md:95,106-108`).
  - Rerank: +9 points recall@budget against a floor of ≥ +10
    (`docs/plans/v2.2/04-lore-relevance.md:181-192`, `scripts/spike/typesafe/experiments/memoryRerank.mts`).

**Warden path:**
- Gated by `stagecraft.wardenEnabled` and `wardenAcceptMode` (`src/runtime/settingsStore.ts:41,85-88`,
  `runtime/types.ts:65`), **not by a `judge.uses.*` key**. The comment says so:
  `continuity.ts:58`.
- Runs as boundary work `continuity-warden`, order 57, fire-and-forget (`src/runtime/boundaryWork.ts:109-117`).
- Request: `buildContinuityRequest`, one Noul per fact, ≤ 40 facts (`src/judge/curators.ts:11-17`,
  `policy.ts:42-45`, `CONTINUITY_P = 0.7`, timeout 4000 ms).
- The note is composed in code (`curators.ts:26-34`).
- **No facts means no call at all** (`continuity.ts:62`, `stagecraftCoordinator.ts:402`).

`stagecraftCoordinator.ts`:
- `runWardenPass`: `:382-438`.
- A hard-coded `reason: "continuity"` and summary: `:418-419`.
- `settleNotes` (lapse/revert): `:441-453`.
- `onGenerationStarted`: `:457-468`. It injects the **first** accepted warden op only (`:460-461`),
  at `INJECTION_REGISTRY.continuityNote` depth 0 (`src/constants/injectionRegistry.ts:22`), and
  skips only `quiet`/`impersonate` (`:459`). Plan 01's T6 rewrites this.
- `clearContinuityNote`: `:470-474`.
- **Drift:** SUMMARY cites `:384-470` and `jeved.md` cites `:417-471`. The file has uncommitted
  V15b edits at `:299-311` and `:374`, so re-read it at build time.
- The coordinator is 475/620 lines and the manager 677/700 (`architecture.test.ts:9-10`).
- `WardenNoteOp` is `{kind:"note", text, facts, replyMessageId, sources?}`
  (`src/stagecraft/types.ts:34`).

**Agency:**
- `DEFAULT_AGENCY` is at `src/engine/agency.ts:6-10` and `PLAYER_ACTION_CLAUSE` at `:20`; the
  clause is added at `:34`. `src/pacing/steering.ts:24` adds a one-line clause to every hint.
- `src/runtime/agencyRecovery.ts:66` detects a **refused route** only; since V13 it counts
  refusals in player turns (`:59-66,85-89`).
- Nothing measures narration of the player's actions: a grep for `puppet|player_attempts|house_rules`
  in `src/` returns 0. Confirmed.

**Schema precedent for `house_rules`:**
- `lore_select` is the existing authored field that sends text to the judge ("Authored, never
  inferred: entry text leaves the machine", `src/engine/schema.ts:240-247`, `StoryV2` at
  `:252-270`).
- `storyDiff` classifies it as `lore-select-changed`, compatible (`src/engine/storyDiff.ts:26,225`).
- Its diagnostic is `lore-select-inactive` (`src/studio/diagnostics.ts:29,56,270-271`).
- Its Studio control is `[data-so="lore-select-field"]` (`src/studio/components/StoryEditor.tsx:134`),
  with the mutation `setLoreSelect` (`src/studio/mutations.ts:177`).

**Calibration harness:**
- `so-judge calibrate --use … --model … --record` (`so-judge.mts:13-16`).
- Fixtures have the shape `{use, floors, labelledAt, source, rows[{…, lang}]}`
  (`test/fixtures/judge/continuity.json`: 28 rows, 5 Spanish, per-family floors
  reply 0.9 / broken 0.85 / consistent 0.966).
- `runContinuityCalibration` is at `src/judge/curatorCalibration.ts:37-55`.
- **Drift:** v2.3 plan 10 §E requires a Spanish slice of ≥ 8. The continuity fixture has 5.

## Design

### 1. T24: usage, meter, `measuredOn` (module: `src/judge/`, `runtime/judge.ts`, `components/settings`)

**Changes:**
- `JudgeResponse.usage` gains an optional `cost?: number` (a host may send it; TypeSafe does not).
- `JudgeResult` gains `usage?`, which `askJudge` copies from the response. A cache hit carries
  **no** usage and sets `cached: true`.
- `JudgeCallRecord` gains `inputTokens?`, `outputTokens?`, `cost?` and `cached?`. This adds two
  to four numbers per row; ring cap 300 is unchanged.

**The meter.** `JudgeRuntimeState` gains `meter: {calls, cachedCalls, inputTokens, outputTokens, cost}`.
- It is monotonic and per chat, and **excluded from rollback**, because spend is not story state.
- Inv 11 (rollback ≡ replay) gains one explicit exemption. The rollback property test asserts
  that the meter is untouched while the ring is cut.
- `sanitizeJudgeRuntime` defaults an absent meter to zeros. **No blob bump** (rule 3 keeps T3
  as the only one).
- `RunToken` (inv 10): the meter is written on the same path as the ring record, so it is covered
  by the ownership check at `runtime/judge.ts:137-138`.
- A discarded call is still metered: a call that outlived its chat was paid for, and the chat
  that asked it gets the charge. Add an ownership census row.

**Readiness:**
- `JudgeReadinessFact` gains `measuredOn: string | null` (`"jev-1.13.0"` for every measured row
  today).
- The table is re-keyed to `JudgeUseKey | "warden"`, adding the warden row
  (0.9765, 720 ms, J8.5/J8.6).
- `RING_USE_TO_READINESS` maps the ring strings (`lore→loreSelect`, `scene→sceneTrigger|sceneTracker`,
  `typed→typedExtraction`, `stall→stallCheck`, `critic→expansionCritic`, `warden→warden`).
- `judgeReadiness(settings, deps, lastAnswered?)` returns verdict `unproven` with
  `modelMismatch: {configured, answered, measuredOn}` when
  `canonical(configured|answered) !== measuredOn`. Inv 7: it is never re-floored, and a mismatch
  only reads unproven.

**UI (author view only, inv 9):**
- `JudgeSettingsGroup` prints "not measured on <model>".
- A new author-view line shows session totals from `snapshot.judgeMeter`: calls, cached calls,
  input and output tokens. Cost is shown only when a host sent it.
- The snapshot carries the meter (inv 18: no manager getter in render).

**Confirm.** `runMemorizeBacklog` confirms "about N judge calls" when `memoryVerify` is active.
The debug-only `so-judge calibrate` prints the call count and needs no confirm.

**Invariants touched:**
- 7: accounting only; no use changes.
- 9: author-only.
- 11: the meter is an explicit exemption (X23), declared and tested. Plan 09's cost report reads
  the meter, never the ring.
- 13: an additive `extras` field in the per-chat home.
- 18: a snapshot slice. The manager has 23 lines of headroom; the meter math goes in
  `src/judge/settings.ts` (`appendJudgeCall` updates both).

### 2. T25 narrowed: model-id map + token guard (module: `src/judge/policy.ts`, plugin, `so-judge`)

**Model-id map.** `JUDGE_MODEL_IDS` in `policy.ts`:
- `canonical: {"jev-1.13.0": "jev-1.13.0"}`;
- `floating: ["jev-latest"]`.

`canonicalModel(id)` and `modelVerdict(requested, answered)` return one of:
- `matched`: canonical ids are equal;
- `resolved`: the request named a floating alias and the answer named a canonical id, which is
  recorded as `resolvedTo`;
- `mismatch`;
- `unknown`: no answer model, which is treated as unmeasured, never as a match.

**Answering model reconciled.**
- `so-judge` replaces strict equality with `modelVerdict`. `resolved` passes and records
  `resolvedTo`, which is **the drift detector**: the day `jev-latest` resolves to something else,
  the report and the readiness both name it.
- The ring already stores `model`.
- The plugin `/status` also echoes nothing new: the configured model lives in page settings. The
  mismatch is computed page-side from the ring's last answered model.
- The hosted-id rows (`typesafe/jev-1.13`) are **not** added (D10). The map shape takes them in
  v2.5.

**Token guard, verify first:**
1. Read TypeSafe's live docs through the `typesafe:typesafe-ai` skill for a stated context limit
   and overflow behaviour.
2. Run one documented probe: synthetic states rising from 20k to 45k estimated tokens, English
   and Spanish, 5 calls, under $0.01. It records whether the API errors, truncates silently or
   answers, and the `usage.input_tokens` it reports.
3. Take the characters-per-token ratio from T24's meter (`stateChars / inputTokens` per call, by
   language), not the ~4 chars/token guess.

**The guard:**
- `estimateTokens(request)` sits beside the character check at `questions.ts:29` and
  `index.mjs:96`, with the same refusal: `invalid`, **never truncate**.
- The cap is the verified limit minus a margin declared before the probe (10%).
- **If the limit cannot be verified** (no doc and an inconclusive probe), the guard is recorded
  as not built and the 140k-character cap stays. No current use comes near it: a lore chunk is
  ≤ 64 × 600 characters and the warden holds ≤ 40 facts.

Invariants touched: 2 (the plugin stays the only key holder; no browser key), 7.

### 3. Dead toggles: `sceneOoc`, `memoryRerank`

**Decided (X22): remove both keys in this plan.** Each already failed a predeclared v2.2 floor
(see §Verified), and nothing in v2.4 needs either one.

**Removal:**
- Delete them from `JUDGE_USE_KEYS`, `JUDGE_USE_COPY`, `JUDGE_READINESS`, the readiness test and
  the story.
- A stored `true` is dropped by `sanitizeJudgeSettings` (`settings.ts:71`). No migration is needed.
- `so-run-header diff` declares the `judge.uses` shrink as allowed.

**Record:**
- `recommended-config.md` gets a "removed in v2.4" row citing the v2.2 numbers.
- `v2.4-seeds.md:29` is corrected: "measured and failed, not unexercised".
- The spike experiments stay as history.

**Future consumers.** A later consumer comes back under a new key only past a new Phase A:
- OOC, with the addressee list v2.2 asked for, over ≥ 40 rows, at the v2.2 floors;
- rerank, at ≥ +10 points over ≥ 30 windows.

Deterministic OOC exclusion (statsuite) is plan 04 window hygiene, not a judge use.

**`backgrounds`:**
- It is not a `JudgeUseKey` and has no consumer (`runtime/judge.ts:94` is its only call site).
- It stays in the calibration set, **excluded** from the recommended set, and gets
  `measuredOn: "jev-1.13.0"` in the recommended-config row.
- No re-calibration unless the shipping model changes. That is exactly what T24's mismatch
  verdict will surface.

### 4. T22 agency check (`judge.uses.agencyCheck`), through the warden's note path

**What.** One raw Score question joins the warden's request:
"Does `reply` write what only `player` does, says, decides or thinks?"
- The rubric has 5 described levels (after Jeved Puppet):
  0. world, NPCs and perception only;
  1. restates the player's own message;
  2. a small reflexive reaction attributed to the player;
  3. a new player action or new player words;
  4. a player decision, concession or dialogue.
- The answer is read **raw** (the T21 lesson). It flags at `AGENCY_SCORE > 2.5`, declared here
  and not tuned afterwards.
- State: `reply`, `player_message` (the player's latest line) and `player` (the persona name).

**Gating:**
- `JUDGE_USE_KEYS += "agencyCheck"`, off by default (rule 4, inv 7).
- Skipped for a checkpoint whose `agencyFor(...).never_narrate_player_action` is `false`: the
  author allowed it. The coordinator gets this through an injected accessor, because the
  stagecraft coordinator imports no engine (inv 6, `architecture.test.ts`).

**Warden pass changes:**
- It runs when **any** of continuity (`wardenEnabled`), `agencyCheck` or `houseRules` is active.
- It asks only the enabled families' questions (v2.2 overview rule 4, `00-overview.md:145`).
- **No facts no longer skips the call** when another family is on (`continuity.ts:62` changes).
- Delivery and accept mode reuse `wardenAcceptMode`, default `review` (X22). The warden itself
  stays a `stagecraft` switch, not a `judge.uses` key.

**Note:**
- One record per reply (`warden-<boundary>-<replyId>`). `WardenNoteOp` gains
  `family: "continuity" | "agency" | "house-rule"`.
- `reason`/`summary` are derived per family instead of hard-coded (`:418-419`).
- The agency text is composed in code: `"Agency: " + PLAYER_ACTION_CLAUSE` with the persona name
  substituted. This is one wording, shared with `agency.ts:20` (D6: the plan 04 steering clause
  lands first, and this reuses it).
- `onGenerationStarted` composes **all** accepted ops of the newest noted reply into the one
  `continuityNote` block, in the order continuity, agency, house rules, and at most 4 lines. It no
  longer takes only the first (`:460-461`).
- Lapse, revert and "the nudge wins" are unchanged (`:441-453,459`).
- Never a reroll or swipe (refused, `00-overview` §Out of scope).

**Calibration.** The combined-request risk: new `state` fields change what the continuity
questions see (`jeved.md` F5). Phase A therefore also re-runs the continuity fixture **inside the
combined shape**.
- If any continuity family drops below its floor, the families ship as **separate parallel
  calls** (arm B, predeclared).
- Arm B costs one more call per reply and keeps continuity's calibration intact.

**Invariants touched:**
- 5: off-path (boundary work order 57, 4000 ms).
- 6: the warden's non-boundary note is the one stagecraft exception, not widened.
- 7: its own key, floor and fallback.
- 9: the card and record are author-only.
- 10: the existing hold and token (`:396-405`).
- 11: revert on rollback, unchanged.
- 16: the note is set and cleared on the generation (no store write).
- 18: the coordinator stays ≤ 620 lines.

Also C4: the note never narrates player compliance. It tells the narrator to leave the player's
acts alone.

### 5. T23 authored `house_rules` (`judge.uses.houseRules`)

**Schema** (rule 6: additive and optional; absent means today's behaviour, i.e. no rules):
- `StoryV2.house_rules?: string[]`, story-level only (X22).
- `validate.ts` enforces:
  - an array of non-empty trimmed strings;
  - `HOUSE_RULES_MAX = 8`;
  - each rule ≤ 240 characters;
  - duplicates are an error.
- The rules live in the pinned story copy (inv 12), never in chat state.

**`storyDiff` row:**
- `house-rules-changed`, **compatible**, with the message "What the narrator is held to changed."
- On a hot-swap, a `pending` or `accepted` house-rule note whose rule text is no longer in the new
  list is withdrawn (`rejected`, message `rule removed`).
- A jest fixture row covers the change.

**`DIAGNOSTIC_CONSEQUENCES` entry:**
- `house-rule-compound`, a warning. It fires when a rule joins two demands with "and"/"y" or ";".
- Consequence: "The check asks one question per rule, so a rule that demands two things is judged
  on whichever one the model reads."
- The code-has-consequence jest guard covers it.

**Studio control:**
- Story tab `[data-so="house-rules"]`: a list editor with add, edit, remove and an `n/8` count,
  through `setHouseRules(draft, rules)` in `mutations.ts`.
- Help text: "Sent to the judgment model with each character reply, only when House rules is on."
- `StoryEditor.stories.tsx` gains interaction and a11y cases.
- **The schema, diff row, diagnostic and control ship only if the use clears Phase A.** A field
  nothing reads is the dead-toggle mistake of item 3.

**Question:**
- One Noul per rule in the warden request: "Does `reply` break `house_rules.rule_i`?"
- `HOUSE_RULE_CRITERIA` mirrors `CONTINUITY_CRITERIA`: false = "follows it **or does not touch
  it**".
- It flags at `HOUSE_RULE_P = 0.7`. The note names at most 2 rules verbatim
  (`House rule: "<rule>" — keep the next reply within it.`).
- Each question's state is the reply and the rules only: no preset and no card (C13, the Jeved
  0.4 isolation).
- Cap per call: 40 facts + 8 rules + 1 agency question.

Invariants touched: as T22, plus 12 (pinned copy) and the rule 6 trio.

### 6. Phase A protocol (T22 `agencyCheck`, T23 `houseRules`)

Each Phase A runs **before** any runtime code. Each is a jest-replayed golden plus
`so-judge calibrate --use <use> --record`.

| | T22 `agencyCheck` | T23 `houseRules` |
|---|---|---|
| Fixture | `test/fixtures/judge/agency.json`, ≥ 40 rows (≥ 20 required), `labelledAt` before any answer is read; replies taken from archived real-model journey records first, authored fill after | `test/fixtures/judge/house-rules.json`, ≥ 40 (reply, rule) rows over ≥ 12 objective rules (content, format, world constraints; no taste rules, per C13) |
| Spanish slice | ≥ 8 rows | ≥ 8 rows |
| Families (per-family floor, predeclared) | `writes` (reply writes the player's act or words, incl. dialogue, decisions, second-person "you agree") recall **≥ 0.85**; `clean` (world or NPC only, perception, restating the player's own line, small reflex) specificity **≥ 0.95**; group-chat replies included in both | `broken` recall **≥ 0.85**; `kept` specificity **≥ 0.95**; `untouched` (the reply never touches the rule; the T23 failure mode) specificity **≥ 0.966** (≤ 1 false alarm per 30, the warden's own bar) |
| Regression family | continuity fixture re-run in the combined request: every continuity family at its existing floor, else arm B (separate calls) | same, with rules + agency present |
| Latency | p50 ≤ 1500 ms, p90 recorded; off-path budget 4000 ms | same |
| Key / default | `judge.uses.agencyCheck`, `false`, never flipped | `judge.uses.houseRules`, `false` |
| Fallback | disabled, unavailable, timeout, cancelled, error, invalid → no note (today) | same |
| Below floor | recorded as **not built**; no floor retuned; fixture + golden kept | same; the schema field does not ship |
| Judge-off control column | live, through the X12 judge-on journey mode: the same scripted player turns with the use off vs on, consecutive runs, compared by `so-lore-probe diff`; per arm: calls, tokens (T24 meter via the cost verb), flagged replies, notes applied, next-reply defect rate (the same calibrated question re-asked over both arms' captured replies via `so-judge rescore`, plus a blind human sample) | same |
| Over-steer probe (rule 5, plan 01's probe per X8) | reply N+1 after an applied note, both arms. Plan 01 supplies the restate/swing checks. This plan supplies the family inputs: meta tokens `Agency:`, `House rule`, `OOC`, `the rules`; swing inputs: N+1 length vs the control arm's and N+1's own agency score ≤ 2.5; human rubric row recorded | family inputs: the rule's text and content words; swing = the rule is kept on N+1 and does not become its subject vs control; human rubric row |
| Privacy-report row | new crossing: `player_message` and the persona name now go to T2 with the reply. The warden sent only reply + facts before (`privacy-report.md:15,36`) | new crossing: authored rule text (same class as `lore_select`'s authored content) + reply |

**Probe harness.** The over-steer probe comes from plan 01 (X8). This plan adds the X12 verbs:
- the judge-on journey mode (`setup.judge` / `--judge-uses`);
- the cost aggregation verb;
- `so-judge calls --use/--chat`;
- `so-judge rescore --use <use> --records <dir>`;
- `so-lore-probe diff`.

It runs plan 01's probe on the **existing** warden (continuity) first, as the baseline. The warden
has never been measured for over-steer.

**Privacy per host:** one row, TypeSafe, with its terms cited if published (Q16 in SUMMARY). With
D10 there are no other hosts.

## Order of work

1. **T24.**
   - Usage copy, cached flag and meter (jest: the meter survives rollback, a cache hit adds no
     tokens, a discarded call is metered).
   - `measuredOn`, the warden row, the ring→readiness map and the mismatch verdict.
   - Author-view totals (snapshot slice + story), then the backlog confirm.
2. **T25.**
   - The id map + `modelVerdict` (jest + `so-judge` node tests).
   - The limit verification (docs, then the probe), then the guard, or a "not built" record.
3. **Dead toggles removed.** Record the backgrounds verdict; edit `recommended-config.md` and
   `v2.4-seeds.md`.
4. **Harness (X12).**
   - Build the judge-on journey mode, the cost verb, `so-judge calls --use/--chat`,
     `so-judge rescore` and `so-lore-probe diff`.
   - Run plan 01's over-steer probe (X8) on the existing warden (J8.5) as the baseline.
5. **T22 Phase A.** Fixture labelled → calibrate `--record` → verdict.
   - Past the floor: the build (warden pass generalised, family ops, composed note, key, copy,
     `sends`), J8 new checks, live.
   - Below the floor: a not-built record.
6. **T23 Phase A** (same shape).
   - Past the floor: schema + diff row + diagnostic + Studio control + build + live.
   - Below the floor: a not-built record.
7. The gate record, `recommended-config.md` rows for the built uses, and the privacy rows.

## Tests and gates

**Machine:**
```
npm run typecheck && npm run lint && npm test && npm run typecheck:test && npm run build
npm run test:release && npm run test:plugin && npm run test:debug && npm run debug:typecheck
npm run test-storybook:ci
```
All must be green. After a build, run `node scripts/debug/st-session.mts reload`.

**Jest:**
- meter vs rollback property;
- cache-hit accounting;
- `modelVerdict` table;
- readiness mismatch;
- token estimator refusal (both sides);
- `storyDiff` `house-rules-changed` row;
- validation caps;
- diagnostic consequence guard;
- composed-note ordering and the 4-line cap;
- a lapse or revert per family;
- "no facts but houseRules on" still asks.

Every new review test is **mutation-checked** (`npm run mutate`).

**Golden replay.** `test/goldens/judge/agency.calibration.json` and `house-rules.calibration.json`
replay in jest with no judge, including the combined-request continuity regression.

**Calibration:**
- `so-judge calibrate --use agency --record`, `--use house-rules --record` and
  `--use continuity --fixture continuity-combined --record`.
- Each report carries `modelVerdict`, `measuredOn` and the Spanish count.
- A floor miss exits 1 and is recorded, not retried into a pass.

**Live** (real LLM + real judge, headed, `--strict`; inv 20):
- J8, extended with J8.10–J8.13:
  - agency auto;
  - agency review lapse;
  - house-rule note in the captured `GENERATE_AFTER_DATA` prompt;
  - no call when every family is off.
- J8.5/J8.6 must stay green with the pass generalised.
- **×2 consecutive** judge-on runs through the X12 judge-on journey mode, plus **×1 judge-off
  control arm** on the same scripted turns, compared with `so-lore-probe diff`, with the
  over-steer columns filled.
- Run-header capture/diff around the batch.
- T24 is checked live: `so-judge calls --use/--chat` totals and the cost verb, against the meter,
  after a rollback. The meter must not shrink (X23).

**Records:** everything under `test/journeys/records/v2.4-plan07/`: matrices, calibration
reports, the limit-probe report, control-column tables, run headers.

## Risks

- **The combined request shifts continuity's calibration.** Mitigation: the predeclared arm B
  (separate calls).
- **Second-person narration** ("you draw your sword") is the norm for RP narrators. The agency
  question may flag legitimate restating. The `clean` family's specificity floor is what catches
  this, and it must be dense in the fixture.
- **Over-steer from a loud depth-0 note** (Reddit C3). The restate/swing gates and the human row
  exist for this. The warden itself has no baseline yet (step 4).
- **The meter exemption dilutes inv 11.** Mitigation: exactly one named field, and the property
  test asserts it.
- **The limit probe may show silent truncation.** In that case the guard must sit well below the
  point where truncation starts, and the finding goes into `privacy-report.md` §4.
- **T6 rewrites `onGenerationStarted`.** Plan 01 must land first, or the composed note is built
  on a path that is about to move.
- **Reply-path creep.** Neither new use may move onto the reply path. Both stay at boundary order 57.

## Unresolved questions

None open. Accept mode, house-rule scope and the cap, and the dead toggles were decided in X22.

## Gate record

_(placeholder: date, commands and outputs, calibration verdicts per use with floor vs measured,
limit-probe result, control-column table, over-steer results, deviations, records path.)_

### Build part 1: accounting (worktree, 2026-09-24/25)

Scope: everything that depends only on plan 01 — T24, T25 narrowed (D10), the dead toggles, and the
judge-off control column's harness (X12 items minus the T22/T23 fixtures). **T22 (agency check) and
T23 (house rules) are not started**: both wait on plan 04's T15 decision (D6) and T22's note path, per
§Order of work steps 5-6. Built on `4151bc8` in a worktree; no live gate was run (none of this half is
signed off live — see "Live, written not run").

**As built**
- T24 usage: `JudgeUsage {input_tokens?, output_tokens?, cost?}` (`src/judge/types.ts`); `askJudge`
  copies it through `readUsage` (finite, non-negative numbers only; kept on an `error` answer too, since
  it was paid for); a cache hit carries none and says `cached: true`. `JudgeCallRecord` gains
  `inputTokens`, `outputTokens`, `cost`, `cached` and `discarded` (a charge-only row).
- T24 meter: `JudgeRuntimeState.meter {calls, cachedCalls, inputTokens, outputTokens, cost}`
  (`src/judge/settings.ts`). `appendJudgeCall` updates ring and meter together; a cache hit counts
  in `cachedCalls` only; a fallback that never left (`unavailable|invalid|disabled|no-roles|no-seam`)
  charges nothing; a `discarded` row is metered and never ringed. `dropJudgeCallsAfter` keeps the
  meter (the X23 inv-11 exemption); `sanitizeJudgeRuntime` reads an absent or damaged meter as zeros.
  No blob bump. The manager did not grow (737/740 effective): `recordJudgeCall` is unchanged.
- T24 discarded calls: `JudgeRuntime.ask` charges the chat that asked — through `deps.record` now when
  that chat is still open (story/version/epoch discards), otherwise parked in an in-memory map keyed by
  the asking chat and settled on that chat's next recorded call in the page session. Census row
  `JudgeRuntime.ask` note updated; fault-matrix `judgeRing|worldSwitched` gained the case.
- T24 readiness: `JudgeReadinessFact.measuredOn` (`jev-1.13.0` on every measured row); the table is
  keyed `JudgeUseKey | "warden"` with the warden row (0.9765, 720 ms, J8.5/J8.6); `RING_USE_TO_READINESS`
  maps the ring strings (incl. `memoryVerify`, `memoryPairs`, `curatorFilter`, `director`, and `scene` →
  `lookahead` too, which the plan's list left out); `judgeReadiness(settings, deps, lastAnswered, {warden})`
  returns `unproven` + `modelMismatch {configured, answered, measuredOn}` when a pinned configured id or
  the last answered id is not `measuredOn`, or when neither names a version (an unanswered alias). The
  `not-built` verdict is gone with the toggles it described.
- T24 UI (author view only): the panel's concern line reads "on, but not measured on <model> (measured
  on jev-1.13.0)"; the measured summary ends "— measured on jev-1.13.0"; `#so-judge-meter` shows this
  chat's calls, cached calls and tokens (cost only when a host sent one) from `snapshot.judgeMeter`
  (`judgeMeterView`: the meter plus the ring's last answered model). The warden row joins when its
  stagecraft switch is on and its mode is not `off`.
- T24 confirm: the memorize-backlog preflight names "about N judge calls to TypeSafe" when
  `memoryVerify` is active (`withJudgeCalls`, one per read, since each read that stores lines asks at least
  once). Two lines in `extractionCoordinator.ts` (plan 04's file, kept minimal).
- T25: `JUDGE_MODEL_IDS {canonical: {jev-1.13.0}, floating: [jev-latest, jev-preview]}`, `canonicalModel`,
  `modelVerdict` → `matched | resolved (+resolvedTo) | mismatch | unknown` (`src/judge/policy.ts`), exposed
  as `storyOrchestratorJudge.modelVerdict`. `so-judge calibrate` (both shapes) reports `modelVerdict` /
  `resolvedTo` instead of `modelMatched`; `mismatch` and `unknown` exit 1 (`calibrationOk`).
- Dead toggles: `sceneOoc` and `memoryRerank` deleted from `JUDGE_USE_KEYS`, `JUDGE_USE_COPY`,
  `JUDGE_READINESS`, the readiness test and the story. `recommended-config.md` has the "removed in v2.4"
  rows with the v2.2 numbers, `backgrounds` gets "measured on `jev-1.13.0`", and `v2.4-seeds.md:29` reads
  "measured and failed, not unexercised". The spike experiments stay.
- Harness (X12): `scripts/debug/lib/judgeHarness.mts` + node tests.
  - judge-on journey mode: `so-journey run <id> --judge-uses <a,b|off> [--warden-mode auto|review]` or
    `setup.judge {uses, wardenMode}`. `warden` is the stagecraft switch; an unknown use is refused;
    captured before setup, restored and read back at cleanup (`cleanup.judgeRestore`), refused with
    `--no-config`. Replaces `resetJudge`'s one-way write for these runs (J11 keeps `resetJudge`).
  - the record keeps, before the chat is deleted: `cleanup.judgeMode`, `cleanup.judgeMeter`,
    `cleanup.warden {flagged, applied, lapsed, rejected, pending}` and `cleanup.rescore.rows` (every
    character reply with the live facts-tier/pinned rows at cleanup; ledger-bound rows are not in the
    snapshot and are said to be missing).
  - `so-judge calls [--use] [--chat]` (refuses a `--chat` that is not the open chat), `so-judge cost`
    (meter beside ring totals per use, `notInRing`, an estimate at the documented $0.042/Mtok input),
    `so-judge rescore --use continuity --records <dir|files>` (in-page `runContinuityRescore`: the
    calibrated continuity question over both arms' replies; an unanswered reply counts neither way),
    `so-judge limit-probe [--send]` (see T25 guard).
  - `so-lore-probe diff <off.json> <on.json> [--rescore <file>]`: offline table of meter, fallbacks,
    warden flags/notes applied, replies and the rescore defect rate; refuses mismatched journeys or arms.
  - `so-scenario --sandbox` now also captures and restores the judge settings (`cleanup.judge`), so a live
    judge scenario cannot leak its opt-in (S11 shape).

**T25 token guard: NOT BUILT (recorded, per §2).** Step 1 (docs) verified the limit —
`docs.typesafe.ai/models.md`: 64k tokens per request, 32k for `state` + the longest question (host-facts
07-H1) — but no doc states the overflow behaviour, and steps 2-3 (the probe, and the chars/token ratio
from T24's meter) are live calls this half does not run. The 140,000-character caps stay on both sides
(`questions.ts:29`, `index.mjs:96`). The probe is written: `so-judge limit-probe --send`, six calls through
the plugin (EN 20k/30k, ES 30k, a token-dense 10k/40k/50k pair so the over-limit cases fit under the
plugin cap; ~180k input tokens ≈ $0.0076), classified `refuses | truncates | answers | mixed |
not-reached` with chars/token per language measured only on cases clearly under the limit. Worth
knowing for the next half: 140k characters at the ~4 chars/token guess is ~35k tokens, already above the
documented 32k state budget, so the guard is not academic once the ratio is measured.

**Decisions made on evidence (small, stated)**
- Removing the toggles is not a user-owned stop: X22 decided it, the live install stores both `false`
  (`data/default-user/settings.json`, read-only check), and nothing read either key, so an install that
  had `true` stored loses a flag that did nothing; `sanitizeJudgeSettings` drops it on the next read.
  `so-run-header diff` around the first run on this build needs
  `--allow judge.uses.sceneOoc,judge.uses.memoryRerank`.
- `jev-preview` joins the floating list (docs name it; the plan named only `jev-latest`).
- A discarded call whose chat is gone is parked in memory, not written into another chat's blob: a page
  reload before the asking chat's next call loses the charge. Accepted as a deviation from "the chat
  that asked gets the charge" rather than writing cross-chat metadata.
- Cost stays `cost` only when a host sends one (TypeSafe does not, 07-H3); the dollar figure in
  `so-judge cost` is an estimate labelled with its price source, never stored.
- `unknown` (no answering model) fails a calibration, like `mismatch`: an unmeasured model is never a match.

**Deviations from the plan text**
- Red-first held for everything except `policy.ts`'s map, written minutes before its table test; the
  table ran green on first run, and M16/M17 show it is not vacuous.
- The rollback property is a pure property (`dropJudgeCallsAfter`, 4 seeds × 60 cuts) plus a
  `runRollback` case with the real helper (`judgeMeterRollback.review.test.ts`); the existing
  `rollback.review.test.ts` mocks `@judge/index` to identity and could not carry it.
- `so-judge rescore` scores `continuity` only; `agency`/`house-rules` arrive with T22/T23.

**Line corrections (Rule 1, re-verified on `4151bc8`)**: `dropJudgeCallsAfter` is called from
`runtime/rollback.ts:69` (not :43); `so-judge.mts` strict equality was at `:99,:130` (now replaced);
`so-journey.mts` forces uses off at `:341-350` (`setup.resetJudge`, J11 only — not every run); the ring
`use` strings are at `sceneCoordinator.ts:96`, `extractionCoordinator.ts:172`, `expansionCoordinator.ts:187`
(plus `memoryVerify` at `extractionCoordinator.ts:242`, `memoryPairs` at `consolidationMatches.ts:56`,
`curatorFilter` at `curatorFilter.ts:20`, `director` at `runtime/judge.ts`); `JudgeCallRecord`/`JudgeResult`
were `types.ts:81-92`/`:94-104`; the manager is 737/740 effective lines and the stagecraft coordinator
562/620 (the plan's 677/700 and 475/620 are pre-V22b/V26 counts).

**Gates (worktree, exact)**
- `npm run typecheck` OK · `npm run typecheck:test` OK · `npm run lint` OK · `npm run debug:typecheck` OK
- `npm test`: 217 suites, **3247 passed** (incl. `architecture.test.ts`, `ownership.guard.test.ts`,
  `faultMatrix.guard.test.ts`)
- `npm run test:debug`: 243 tests, 242 pass, 1 skipped, 0 fail (needs a built `dist/`)
- `npm run test:plugin`: 8 tests, 7 pass, 1 skipped (`JUDGE_LIVE=1`), 0 fail — plugin unchanged
- `npm run build` OK (2 pre-existing size warnings); `ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public npm run
  build && npm run test:release`: 21/21. Without `ST_PUBLIC` the worktree sits three levels deeper than the
  extension, so the manifest reads "ST unknown" and the host-version test fails — a worktree artifact.
- Storybook: `storybook:build`, served on 6419, `test-storybook --index-json`: 32 suites, **207 passed**.
- Mutations: `test/findings/mutations/v24-07-accounting.txt`, **34/34 killed** (32 jest/node, 2 Storybook).

**Live, written not run** (real LLM + real judge, `--strict`, ×2, run-header capture/diff around):
- `test/scenarios/live-v24-07-meter.json` (T24 live: warden auto on a seeded fact, one real call, the ring
  row's tokens equal the meter's step, a rollback cuts the ring row and the meter does not shrink, ring <
  meter afterwards): `node scripts/debug/so-scenario.mts run test/scenarios/live-v24-07-meter.json --sandbox
  --group 1759606632088`; then with `--keep`, `so-judge.mts calls --use warden --chat <id>` and
  `so-judge.mts cost --chat <id>` against the logged meter.
- Control-column baseline (step 4, X8): `so-journey.mts run J8 --only J8.5 --judge-uses warden --warden-mode
  auto` ×2 and `--judge-uses off` ×1 on the same turns, then `so-judge.mts rescore --use continuity --records
  <dir>` and `so-lore-probe.mts diff <off> <on> --rescore <file>`, with plan 01's over-steer probe on J8.5.
  Note J8.5's own eval writes the judge settings directly; the mode's capture/restore brackets it.
- `so-judge.mts limit-probe --send` (< $0.01), then the guard or its not-built record.
- `so-judge.mts calibrate --use continuity --model jev-latest` once, to see `resolved → jev-1.13.0` live.

**Remains for part 2**: T22 and T23 (Phase A each, fixtures, calibration, build or not-built record),
J8.10-J8.13, the live runs above, the privacy-report rows, plan 09's cost report reading the meter.

### Part 1 live gates (2026-09-25, bundle 7f1787158bf8)

Main checkout on `59c34b4` (+ this record's edits), lane 2 only (`st-lanes run 2`, group `1759606632088`, profile
`Artemis RunPod RP`, real judge through the plugin, key source `dotenv`). Served `dist/index.js` sha verified against
`dist/manifest.json` before every run (`7f1787158bf8…`). The token guard (item 3) rebuilt the bundle to
**`0ac21d135bc0`** after every other live record was taken; only the guard's own live check ran on it.
Records: `test/journeys/records/v2.4-plan07/part1-live-7f1787158bf8/` and `…/part1-live-0ac21d135bc0/`.

| Item | Result | Record |
|---|---|---|
| 1. `live-v24-07-meter.json` ×2 | **green ×2** after a fixture fix (first batch: run 1 green, run 2 red) | `batch-meter-green.json`, `meter-green-run{1,2}.log`; red: `batch-meter-red.json`, `meter-red-run{1,2}.log` |
| 1b. `so-judge calls` / `cost` vs meter | **match** | `meter-keep-run.log`, `so-judge-calls-warden.log`, `so-judge-cost.log` |
| 2. J8.5 warden baseline, on ×2 + off ×1 | **PASS ×3, first try** (after a harness fix); rescore, diff and over-steer below | `J8.5-{on-run1,on-run2,off-run1}.journey.json` + `.log`, `rescore-continuity-*.json`, `lore-probe-diff-on-run{1,2}.json` |
| 3. `limit-probe --send` | **refuses** past the limit (HTTP 400 `max_tokens_exceeded`); guard **BUILT** | `limit-probe.json`/`.log`; guard live check in `…0ac21d135bc0/token-guard-live-check.log` |
| 4. `calibrate --use continuity --model jev-latest` | **`resolved` → `jev-1.13.0`**, 83/85 = 0.9765, every family floor met | `calibrate-continuity-jev-latest.json`/`.log` |
| Run header | `diff` vs `run-header-pre.json`: **0 differences** before the rebuild; after it, only the 7 `build.*`/`bundle.*` paths | `run-header-diff-end.json`, `…0ac21d135bc0/run-header-diff-after-build.json` |

Every journey run exits 1 only because `--strict` counts the five checks `--only J8.5` skips; `automated: 1 pass,
0 fail`, `cleanup: clean`, `judgeRestore {restored: true, ok: true}` in all three.

**1. Meter.** First batch run 2 failed at step 4, "the ring row carries no input tokens", on a row reading
`latencyMs: 0, cached: true`. That is correct product behaviour: `JudgeRuntime` caches by request for the page
session, and run 2 sent byte-identical text. Fixture fix: the Courier reply now carries a per-run errand number.
The failed run also left the install with `stagecraft.curatorEnabled: false`: the fixture turns the WI curator off, and
the runner's judge restore only covered the warden fields. Harness fix: `readJudgeConfig`/`restoreJudgeConfig` now
capture and restore `curator {curatorEnabled, acceptMode}` too (node tests + mutations H1/H2). Lane 2 was put back by
hand (`curatorEnabled: true`) before the rerun. Green runs: row `447 in / 22 out`, meter step identical; after the
rollback the ring holds 0 warden rows, the meter still holds `{calls 1, 447, 22}`, and `notInRing 1`. `--keep` run on
chat `2026-09-24@21h18m57s889ms`: `calls --use warden --chat` → 0 rows; `cost --chat` → meter `{1, 447, 22}`, ring 0,
`notInRing {calls 1, inputTokens 447}`, `estimatedUsd 0.000019`. That equals the scenario's logged meter. The kept
chat was deleted (`/delchat`), then `so-library remove "SO-J8 Stagecraft"`. The group's chat list read back as
before.

**2. J8.5 control column.** As built, `--judge-uses off` could not be a control. J8.5's first eval switches the judge
and the warden on itself, so the off arm would have run the on arm. Harness fix:
- the runner marks the page with the arm (`markJudgeMode` → `globalThis.__soJudgeMode`), and `restoreJudgeConfig`
  always clears it;
- J8.5 leaves the judge settings to the mode when one is set;
- in the off arm, J8.5 asserts the control: no warden call, no warden record, and no `Continuity: established` in any
  captured prompt;
- the fixture guard allowlists the one runner-set global (`RUNNER_SET_GLOBALS`, H8).

Each run started on a reloaded page (`st-session reload`, `open-group`, `/profile`). Otherwise on-run 2 would have been
a cache hit on on-run 1's warden request.

| | off | on run 1 | on run 2 |
|---|---|---|---|
| judge calls (meter) | 0 | 4 | 2 |
| input / output tokens | 0 / 0 | 3,266 / 196 | 1,452 / 80 |
| warden flagged / applied / lapsed | 0 / 0 / 0 | 2 / 1 / 1 | 2 / 1 / 1 |
| replies captured | 5 | 8 | 7 |

Read by eye, the note works. In both on runs, the replies after the note portray the bridge as gone. In the off run,
Arin says "it's back to that bridge".

**Rescore.** The live-facts rescore reads off 1/5 = 0.2 and on 8/15 = 0.533. **This is confounded, and it is not
evidence that the warden hurts.** In every arm, extraction stored two facts-tier rows from the Courier's scripted
claim: "The old stone bridge over the river is still standing and intact." and "…is intact and usable.". Both
contradict the seeded permanent fact, and nothing marked them `contradicted`. The rescore's fact set is therefore
self-contradictory, and it flags the on-arm replies for obeying the seed.

`so-judge rescore` gained `--facts <file.json>`, which holds every arm to one declared set (`withEstablished`, H9).
Rescored against the seed fact only (`rescore-facts-seed.json`):
- off: 2/5 = 0.4 (m1, the scripted Courier; m4, Arin);
- on: 2/15 = 0.133 (m1 ×2 only).

Without m1, which is identical in every arm and a defect by construction: **off 1/4, on 0/13**. The diff's rescore
row pools both on runs, because one rescore file scored all three records.

**Over-steer (plan 01's probe, warden baseline).** A new `continuity` family, whose meta tokens are `Continuity:` and
`Keep the next reply consistent`. `so-lore-probe diff` now carries `overSteer` columns: reply N+1 after each applied
note, against the control arm's reply to the same turn (`overSteerColumns`, H5-H7, H10, H11).

| | N+1 | span | meta | restate | control span | swing (words, ratio) |
|---|---|---|---|---|---|---|
| on run 1 | m3 | 2 | — | ok | 2 | 174 vs 89, 1.955 |
| on run 2 | m3 | 3 | — | ok | 2 | 269 vs 89, 3.022 |

The swing is speaker-confounded: Arin answered N+1 in both on runs and Ponticius in the control. It is recorded, not
gated. The human rubric row is **not scored**: no human session was run.

**Defect found, not fixed (product, beyond "small and obvious").** Extraction takes a character's in-fiction claim
that contradicts a permanent seeded fact and stores it as new facts-tier rows. The warden then enforces the wrong side.
At message 6 in both on runs, the warden call reads `{facts: 3, flagged: 2}`: the two extracted "intact" rows,
flagged against a reply consistent with the seed. That note lapsed in both runs only because a newer reply committed
first. The ring rows are in `cleanup.judgeCalls` of both on records. The warden reads facts-tier rows with no check
against permanent or pinned contradictions. That belongs to the memory contradiction path (plan 02/04 territory), not
to this plan's accounting.

**3. Token limit.** Six calls:

| case | input tokens | answer |
|---|---|---|
| en-20k | 17,740 | answered |
| en-30k | 26,510 | answered |
| es-30k | 30,132 | answered |
| dense-10k | 16,876 | answered |
| dense-40k | — | HTTP 400 `{"detail":{"error_type":"max_tokens_exceeded"}}` |
| dense-50k | — | HTTP 400 `{"detail":{"error_type":"max_tokens_exceeded"}}` |

Total 91,258 input tokens, **$0.003833**. Past the limit the API **refuses; no silent truncation**. The verdict says
`conclusive: false` only because es-30k (30,132 tokens) fell inside the classifier's 10% exclusion band. Its raw
ratio is 105,115 / 30,132 = 3.488 chars per token, and English measured 4.525. The refusal point lies between 30.1k
tokens (answered) and about 67k (dense-40k at 1.488): the probe does not say whether 32k or 64k is enforced.

**Decision: BUILT.** §2's not-built condition is "no doc *and* an inconclusive probe". The doc states 32k for state plus
the longest question (07-H1), and the probe settles the over-limit behaviour.
- `estimateJudgeTokens` = ⌈(state chars + longest question chars) / 3.488⌉.
- The cap is ⌊32,768 × 0.9⌋ = **29,491** estimated tokens, refused as `invalid` and never truncated.
- It sits in `src/judge/questions.ts` beside the 140k character check. The plugin's `validateRequest` mirrors it
  (`estimateTokens`, same constants, same refusal). The character caps stay.

This is conservative by design. English requests above about 103k chars are now refused, although the API answered
120k chars of English. No current use comes near: a lore chunk is ≤ 64 × 600 chars and the warden holds ≤ 40 facts.

Tests: red first (3 jest, 1 plugin), then green. Mutations are in `test/findings/mutations/v24-07-live-guard.txt`:
**21/21 killed** (G1-G6 page, P1-P4 plugin, H1-H11 harness).

Live check on `0ac21d135bc0`: `storyOrchestratorJudge.probe` on a 111,811-char state (under the character cap) →
`fallback: invalid`, 0 plugin requests. A small request → answered (p 0.98, 291 input tokens, 1 request).

**The plugin half is not installed.** `npm run plugin:install` and an ST restart would touch every server on this box
(port 8000 and both lanes). Once it is installed, `limit-probe --send`'s dense-40k/50k are refused by the plugin
before TypeSafe, so a re-probe of the API past the cap needs the guard bypassed.

**4. Calibration.** `modelVerdict: resolved`, `resolvedTo: jev-1.13.0`. Overall 0.9765 (83/85):
- reply 27/28 (floor 0.9);
- broken 14/15 (floor 0.85);
- consistent 42/42 (floor 0.966).

Spanish 18/18, p50 1,015 ms. The one miss is CX06.

**Gates (main checkout, after the edits):**
- OK: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run debug:typecheck`.
- `npm test`: 224 suites, **3314 passed**.
- `npm run test:debug`: 254/254.
- `npm run test:plugin`: 8 pass, 1 skip (`JUDGE_LIVE`).
- `npm run build` OK (the 2 known size warnings), then `npm run test:release`: 21/21.
- Storybook was not re-run: no UI file changed.

**Cost on the TypeSafe key.**

| what | tokens | cost |
|---|---|---|
| limit probe | 91,258 | $0.00383 |
| meter runs + J8.5 + guard check (metered) | 6,788 input | about $0.0003 |
| 40 rescore calls + 28 calibration requests (not metered) | about 40-50k, estimated | about $0.002 |
| **total** | | **about $0.006** |

**Bundle change:** `.debug/bundle-change.txt` gained a line at 2026-09-25T00:47:50Z, before `npm run build`
(`7f1787158bf8` → `0ac21d135bc0`). Lane 1 must reload before trusting a new record.

**Still open (part 1):**
- the human over-steer rubric row;
- a warden baseline with a non-contradictory fact set (the rescore needs `--facts` until the extraction contradiction
  above is handled);
- installing the plugin guard.

### Contradicted seeded fact (worktree build, 2026-09-25)

Worktree branch `worktree-agent-a6f2bab29efef9f15`, on master `4997718` plus the plan 04 merge (`0f3904d`, the one
`host-facts.md` conflict resolved by keeping both sections). **No backend and no browser here: no live gate ran, none is
claimed green.** Fixes the defect written up in §Part 1 live gates ("Defect found, not fixed").

**Decision (main session, 2026-09-25): a PIN is retention, not truth (v2.3 M5).** Only three kinds of row hold a
contradicting claim: locked as canon, decided by the author (a provenance override: reconciled, reconfirm,
store-anyway, lock) and written by the author (`source: "author"`). A pinned extracted fact keeps today's behaviour,
change-worded updates included. The first build of this section also counted a pin. The revision drops it, and it
is recorded below as "Revision". Hiding conflicted rows from the player Memory tab was accepted as built.

**Root cause (cited on `4997718`).** Nothing compares a NEW fact with an established one. Three layers, each blind:
1. The write path stores a read's facts unconditionally. `extractionCoordinator.ts:200` builds each FACT line as a live
   `facts` row, `:215` calls `memory.applyEntries`, and `memoryCoordinator.ts:145-152` hands it to `addMemoryEntries`
   (`stores.ts:26-54`), which drops only excluded hashes and re-read windows.
2. The reconciliation queue never looks at fact against fact. `detectConflicts` (`conflicts.ts:132`) has three loops:
   ledger against blackboard (`:148`), fact against a LEDGER row (`:163-166`), scene against ledger/blackboard (`:180`).
   `detectMemoryConflicts` (`memoryQueue.ts:73`) is its only caller.
3. Consolidation is the only fact-vs-fact walk, and it could not have helped:
   - It runs every 10th boundary (`boundaryWork.ts:6,139`), only for tier groups of 8 or more
     (`consolidate.ts:22`, `memoryCoordinator.ts:484`). J8.5 held 3 facts and never reached boundary 10.
   - Had it run, the Courier pair (Jaccard 0.533 and 0.571, same-topic band 0.4) carries no state-change marker, so
     it is `uncertain` (`consolidate.ts:93`).
   - `runConsolidation` then calls `markContradicted` (`memoryCoordinator.ts:507`), which flags the EXISTING row
     (`supersede.ts:9`, `existingId`): the seed.
   - `establishedFacts` drops a `contradicted` row (`continuity.ts:35`), so the warden would have held replies to the
     Courier's claim ALONE.
   - `MemoryEntry.locked` promises that "a later contradicting candidate goes to the reconciliation queue instead"
     (`types.ts:159`). Nothing queued it: the `uncertain` pair only ever reached `markContradicted`.

Neither of the other two leads catches it:
- The prompt already carries the seed. Canon-lite includes the top facts (`canonLite.ts:9`), and the model still
  wrote the Courier's speech as a FACT.
- Plan 04's T15 `evidence_from` screens DELTA lines only (`sharedRead.ts:65`), and it separates the player from
  everyone else. The Courier is not the player.

**Where an NPC's claim belongs.** It is evidence of what the NPC SAID. The epistemic tier already names this case:
`[believes] Character | something they hold as true that is actually false`, and the DECEPTION rule writes `[hiding]` for
a liar (`memory/contract.ts`). That section rides the shared read only when `epistemicLedgerCapable` is on, and its lines
never reach the facts tier or the warden. Tiers were not redesigned. The fix is the guard below: a claim that lands on
a settled fact is held for the author, whatever the read called it.

**As built.**
- **Established** (`isEstablished`, `memory/conflicts.ts`) means locked, carrying an author override (reconciled,
  reconfirm, store-anyway, lock), or `source: "author"`. A pin does not count. `standsEstablished` adds live, not
  superseded, not folded. An extractor row nobody locked or decided is NOT established, however "permanent",
  important or pinned it is.
- **The detector is the consolidation bands, reused.** `findHeldContradictions` (`memoryQueue.ts`) builds `MatchSets`
  over `[established…, candidates…]`. It uses the injected `matchSets`, which is the coordinator's `buildMatchSets`:
  ST vectors, else Jaccard. `heldContradictions` then holds a candidate when all three hold:
  - it is in an established row's dup or same-topic band;
  - it is not the same text;
  - it is not an update below a lock. A candidate with a state-change marker passes against an author-decided or
    authored row that is not locked, because consolidation may still supersede such a row. A LOCK holds every
    candidate in its band.
  - `heldGroup` gives every row one type first. The same-topic band pairs only same-typed rows, and whether a claim
    contradicts a settled fact does not depend on the read calling it `fact` or `event`.
- **Held, not live.** `MemoryCoordinator.applyEntries` reads the bands before its ownership check, which was already
  there, and holds right after the tier write, synchronously. `holdMemoryContradictions` then:
  - queues `held:<established>><candidate>` with the established side marked `standing: true`;
  - marks only the candidate `conflicted`.
  `detectMemoryConflicts` never re-marks a standing side. `conflictWindow` reads the claim's message, never the seed's.
  Keep / Lock as canon / Dismiss / Re-read are the existing queue decisions, unchanged: Lock keeps the seed and
  supersedes the claim; Dismiss puts the claim back in play.
- **Consolidation.** `settleUncertain` replaces the bare `markContradicted`.
  - An undecided pair whose older row is established holds the newer claim.
  - The established row is never marked `contradicted`.
  - Every other pair keeps today's soft mark.
- **Warden.** No change was needed. `establishedFacts` already reads only live, non-contradicted rows. The defect was
  that the claim rows WERE live.
- **Player.** The player Memory tab no longer lists a `conflicted` row (`DrawerTabs.tsx` `visible`). This covers the
  ledger-conflict rows too, which were visible before. The queue card says the standing side still steers
  (`[data-so="conflict-standing"]`).
- **J8.5 fixture.**
  - The seed step now locks the seed as canon, through the product path
    (`rt.memoryActions.setMemoryLocked(id, true)`), and asserts `locked`. Pinned or plain, it is an ordinary
    extractor row, and two control tests prove those stay unguarded.
  - The last on-arm step fails if any warden note enforced a bridge fact other than the seed, and returns `held` and
    `liveClaims`.
- **Size.** The coordinator is 619/620 effective lines, and the manager is unchanged at 737/740. The census row for
  `applyEntries` stays `checked`, with its note updated for the new await.

**Red first.** `contradictedSeed.review.test.ts` drives the real `ExtractionCoordinator.applyAudit` into a real
`MemoryCoordinator`:
- J8.5's own seed line;
- the Courier read parsed by `parseSharedReadResponse`, both stored texts from the record, as a FACT line and a MEMORY
  `event` line (the record does not keep the line kinds).

Before the fix: **4 failed, 3 passed** (the three controls). The warden read
`[seed, "…still standing and intact.", "…intact and usable."]`, which is the live `{facts: 3, flagged: 2}` shape.
That red run pinned the seed, as the first build did. The revision locks it instead.
The consolidation case and the `memoryQueueHeld.test.ts` cases were written with the code. Their red is evidenced by
the mutants. The revision added two controls:
- "a pinned (not locked) extracted fact does not hold a contradicting claim" (coordinator);
- "treats a pinned extracted row as today: soft mark, nothing held" (`settleUncertain`).

**Mutations.** `test/findings/mutations/v24-07-contradiction.txt`. First build **25/25 killed**; revision (whole sweep
re-run, P8 now "a pin counts again", P11 added) **24/24 killed**. P8 is killed by 3 cases, including the new
coordinator control. First-build mutants:
- C1-C4: coordinator wiring;
- Q1-Q9: the queue;
- P1-P10: the detector;
- U1-U2: the player filter and the standing label (Storybook).

**Gates (worktree, after the revision; the first build's figures in brackets):**
- OK: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run debug:typecheck`.
- `npm test`: 231 suites, **3421 passed** [3418] (fault matrix 75 covered / 10 partial / 25 na / 0 todo).
- `npm run build`: OK (the 2 known size warnings).
- `npm run test:debug`: 257 pass, 1 skip, 0 fail. In the first build, the first run (before `npm run build`) failed 1:
  the run-header manifest test reads `dist/manifest.json`, which a fresh worktree does not have.
- Storybook: rebuilt, and the test-runner ran over `index.json`, **216/216** both times.

**Live check owed (main session).** J8.5 on-arm ×2 on a reloaded page, same recipe as §Part 1 item 2
(`--only J8.5 --judge-uses warden --warden-mode auto`, lane 2). Green means:
- the step-8 assertion holds: no warden note enforces a bridge fact other than the seed;
- `cleanup.judgeCalls` never shows `{facts: 3, flagged: 2}`;
- `cleanup.rescore` established facts hold the seed only, so the live-facts rescore no longer needs `--facts`;
- `held` names the Courier claim, if the read extracted one.

Also run one off-arm, to prove the control is unchanged. Record the `held` / `liveClaims` returns: the live install has
ST vectors, so the cosine bands (0.82 / 0.55), not Jaccard, decide the pair. The pair's cosine is **not measured**. If
it falls under 0.55, the claim is stored live again and the step-8 assertion fails. That is the live gate doing its job.

**Limits (stated, not hidden).**
- The detector is lexical/embedding overlap. It cannot tell a contradiction from an agreeing paraphrase, so both are
  held. An agreeing paraphrase loses nothing: the established row already says it.
- A contradiction worded far enough from the seed (below 0.4 Jaccard / 0.55 cosine, e.g. "the crossing is fine") is
  **not seen**. No negation or polarity detector was added.
- Only locked, author-decided or authored rows are guarded. A pinned extracted row and two ordinary extractor rows that
  disagree still go through consolidation's cadence, the ≥8 group and the soft mark, as before. The consolidation
  soft mark still lands on the OLDER row. For a pinned seed it removes the seed from the warden, as it did before.
- Consolidation's own walk stays type-bound. A consolidation-found claim of another type is not held there; the write
  path covers it.
- One vectors round-trip (insert, 3 queries per row, purge) per extraction write, and only while at least one
  established row exists.
- A rollback that removes the claim's message leaves its held pair in the queue with a missing row. This is the
  existing behaviour for every memory-side pair (`reverseMemoryState` does not touch `conflicts`).

**Unresolved questions.**
- Should `isEstablished` also count a story-authored seed? No authored fact seed exists in the schema today.
- Should the held pair's copy say "a character claimed" when the evidence quotes a non-player speaker?


### Contradiction fix live (2026-09-25, bundle 9b2f890a5987)

Main checkout on `e4d69db`, bundle `9b2f890a5987` (not rebuilt), lane 2 only, group `1759606632088`, profile
`Artemis RunPod RP`, real judge through the plugin. Each run started on a reloaded page (`st-session reload`,
`open-group`, `/profile`), with the served bundle sha checked. Recipe as in §Part 1 item 2:
`so-journey run J8 --only J8.5 --strict --judge-uses warden --warden-mode auto`, and `--judge-uses off` for the control.
Records: `test/journeys/records/v2.4-plan07/contradiction-live-9b2f890a5987/`.

**Verdict: RED ×2, cause measured.** The claim is stored live again, because on this install the vectors band decides
the pair and the pair's cosine is under 0.55. The threshold was not retuned.

| | on run 1 | on run 2 | off run 1 |
|---|---|---|---|
| journey | PASS (`automated 1 pass`; exit 1 only for the 5 `--only` skips), cleanup clean, `judgeRestore ok` | same | PASS, no warden call, no note, cleanup clean |
| warden calls (`p`) | `{1,1}`, `{2,0}` (fallback: timeout, 4,007 ms), `{2,0}` | `{1,1}`, `{1,0}` | none |
| warden flagged / applied / lapsed | 1 / 1 / 0 | 1 / 1 / 0 | 0 / 0 / 0 |
| meter (calls, in / out tokens) | 3, 1,553 / 62 | 2, 1,037 / 44 | 0 |
| `held` | `[]` | `[]` | (not reported by the off arm) |
| `liveClaims` (bridge rows) | "…is still standing and intact." | "…is still standing and intact.", "…is intact and usable." | the same two in `rescore.established` |

Green criteria from §Contradicted seeded fact, applied exactly:

| Criterion | run 1 | run 2 |
|---|---|---|
| no warden note enforces a bridge fact other than the seed (last step) | holds | holds |
| `cleanup.judgeCalls` never `{facts: 3, flagged: 2}` | holds | holds |
| `cleanup.rescore` established facts = the seed only | **fails**: seed + "still standing and intact" | **fails**: seed + both "intact" rows |
| `held` names the Courier claim when the read extracted one | **fails**: extracted, `held: []` | **fails**: same |

**Cause, measured.** `buildMatchSets` asks ST vectors (`transformers`) when the capability is present, and it is
present on lane 2: insert and query both answered. The server drops the score (`src/endpoints/vectors.js:390`,
`score >= threshold`), so the score was bracketed by bisecting the threshold: 14 steps, a two-row collection per pair,
purged after. Probe: `pair-cosine-probe.js`, output `pair-cosine-probe.json`.

| claim vs seed ("…collapsed in the flood and is gone.") | cosine | ≥ 0.82 dup | ≥ 0.55 same-topic |
|---|---|---|---|
| "The old stone bridge over the river is still standing and intact." | **0.410** | no | no |
| "The old stone bridge over the river is intact and usable." | **0.359** | no | no |
| the Courier's line itself | 0.302 | no | no |
| "Luke is uncertain … the old stone bridge is missing." (agrees with the seed) | 0.306 | no | no |

Both extracted claims fall below the same-topic band, so `heldContradictions` never sees the pair and the write path
stores them live. This is the risk the build record named. Jest is green because it runs the Jaccard fallback, where
the same pair scores 0.533 / 0.571 against a 0.4 band. With this embedding model, the vectors bands are too coarse to
tell "the bridge is gone" from "the bridge is intact": the two texts share their subject and differ in polarity, and
polarity barely moves a sentence embedding. The off arm stored the same two rows, as expected: the write path does not
depend on the judge.

**What held.** The seed stayed established and uncontradicted, and every applied note enforced the seed. Neither run
reproduced the Part 1 shape `{facts: 3, flagged: 2}`. In run 1 the claim row reached the warden's fact set
(`{facts: 2}`) and no reply was flagged against it. That is luck, not the guard. Run 1's second warden call fell back on
a 4 s timeout. This was observed and not investigated here.

**Not fixed: product, beyond "small and obvious".** Candidate directions, none built:
- a polarity or negation check;
- asking the judge's `memoryPairs` relation on a same-subject pair below the band;
- for the established-row guard only, taking the union of the vectors and Jaccard bands.

Each changes the detector's contract and needs its own measurement, so it is a decision for the main session.

**Run header.** Lane 2 `diff` vs `run-header-pre-lane2.json`: 0 differences, covering these three runs and plan 04's
live suite A/B (`run-header-diff-lane2.log`). No `--allow` was needed. Lane 2 was left with the judge off, no use on,
curator on (`auto`) and warden off, as it started.

### Contradiction detector: vectors or Jaccard for established facts (worktree build, 2026-09-25)

Worktree branch `worktree-agent-a237f2c1f02e4f585`, on master `9afa763`. **No backend and no browser here: no live gate
ran, none is claimed green.** Built bundle `adf3b0a7f9da` (worktree `dist/`, not served anywhere).

**Decision (main session, made).** For an ESTABLISHED row only (locked as canon, author-decided, author-written, as
built above), a new extracted row is held when EITHER the vectors bands OR the Jaccard bands pair it with the row.
Ordinary fact-vs-fact consolidation keeps its single source (vectors when present, else Jaccard).

**As built.**
- `memory/conflicts.ts`: `unionMatchSets(left, right)` (per row, per band) and `establishedBands(group, vectors)`, which
  is Jaccard's bands over the same group, unioned with the vectors bands when there are any.
- `runtime/memoryQueue.ts` `findHeldContradictions`: `establishedBands(group, deps.matchSets ? await deps.matchSets(group) : null)`
  replaces the vectors-else-Jaccard pick. `heldContradictions` and everything downstream are unchanged: same-text,
  update-below-a-lock and the one-type `heldGroup` rules still apply to the union.
- `buildMatchSets` (`consolidationMatches.ts`) and `runConsolidation` are untouched, so `settleUncertain`'s established
  guard in consolidation still sees one source. The write path is where J8.5's claims arrive.
- `memoryCoordinator.ts` is untouched (619/620 effective lines). Census row `applyEntries` unchanged (no new await).
- **`judge.uses.memoryPairs` release: NOT built.** It exists (default off) and is today wired only into consolidation
  (`judgePairRelations`). Wiring it into the write-path hold needs a `judge` dep on `MemoryQueueDeps`, which is a
  coordinator line (`queueDeps()`), and the coordinator has none to spare. With the use off (the default) the decision
  says nothing changes, so the as-built behaviour equals the decided default.

**Red first.** `contradictedSeed.review.test.ts` gained a vectors stub in its `@services/STAPI` mock: `capabilityState`
answers `present`, and `vectorQuery` keeps a stored row only when its cosine reaches the threshold, from the cosines
measured in `test/journeys/records/v2.4-plan07/contradiction-live-9b2f890a5987/pair-cosine-probe.json` (seed<->STANDING
0.4102, seed<->USABLE 0.3587; unmeasured pairs 0). The live texts, the locked seed and the Courier read as before.
Before the fix: **1 failed, 13 passed**. The failure is the live shape: the STANDING row stored live.
New cases, vectors present unless noted:
- "holds both Courier rows against the locked seed when the vectors query misses the pair" (the red one);
- controls: the same claims next to a pinned and next to a plain extractor seed are stored live (`it.each`); an
  unrelated claim next to the locked seed is stored live;
- "consolidation between two ordinary rows still reads the vectors band alone": 8 rows, `runConsolidation`, no soft
  mark, no queued pair;
- `memoryQueueHeld.test.ts`: `unionMatchSets`; held through Jaccard when the injected bands miss; held through the
  injected bands when Jaccard misses ("The crossing is fine."); nothing held when neither band pairs.

**Mutations.** `test/findings/mutations/v24-07-contradiction.txt` §Union revision, script
`.debug/v24-07-union-mutants.py`: **6/6 killed** (B1 vectors alone = the pre-fix code, B2 Jaccard alone, B3 union drops
a band, B4 union leaks into consolidation, B5 hold without a band, B6 a pin counts). Each new test kills at least one.

**Gates (worktree):**
- `npm run typecheck && npm run typecheck:test && npm run lint && npm run debug:typecheck`: exit 0.
- `npm test`: 232 suites, **3439 passed**, 0 failed (fault matrix 75 covered / 10 partial / 25 na / 0 todo).
- `npm run build`: exit 0 (the 2 known size warnings).
- `npm run test:debug`: 258 tests, 257 pass, 1 skip, 0 fail.

**Live check owed (main session).** J8.5 on-arm ×2 on lane 2, same recipe as §Contradiction fix live, on a rebuilt and
reloaded bundle (check the served sha). Green = the four criteria there, in particular `held` names the Courier claim
and `cleanup.rescore` established facts are the seed only. The live pair should now be caught by Jaccard (0.533 /
0.571 ≥ 0.4) whatever the cosine.

**Limits (stated, not hidden).**
- A contradiction with low word overlap AND low cosine is still missed: below Jaccard 0.4 and below cosine 0.55
  ("the crossing is fine" against "the bridge collapsed"). No polarity or negation check exists.
- The union widens the hold, so more agreeing paraphrases of an established row are held too (harmless: the
  established row already says it; the author dismisses the pair). No judge release is built to cut that down.
- Jaccard runs over every established row plus the candidates on every extraction write while an established row
  exists: O(n²) token-set comparisons, cheap at today's sizes, no host call.
- Pinned and plain extractor rows keep today's single-source consolidation, so the live miss (cosine under the band)
  still applies to two ordinary rows that disagree.

### Contradiction fix live, union bands (2026-09-25, bundle `9a28415066c3`, master `fd5e33e`)

**Green.** J8.5 ran judge-on ×2 with a page reload before each run, then judge-off ×1, all on lane 2 with `--only J8.5`.

| Run | Held for the author | Other facts that stayed live | Result |
|---|---|---|---|
| judge on, 1 | "…still standing and intact." and "…is intact.", plus an agreeing paraphrase ("…has collapsed, leaving only pieces…") | "Arin and Max are at the riverbank, facing the collapsed bridge." | pass |
| judge on, 2 | "…still standing and intact." and "…intact and usable.", plus an agreeing paraphrase ("…destroyed by the flood.") | none | pass |
| judge off | not applicable: no warden call, no note | not applicable | pass |

In the two judge-on runs:
- the continuity note was carried into exactly one generation;
- no warden note enforced a claim;
- the `{facts: 3, flagged: 2}` shape never appeared.

**Records:** `test/journeys/records/v2.4-plan07/contradiction-live-9a28415066c3/`. The run-header diff around the batch shows 0 differences.

**What the wider net costs.** It holds agreeing paraphrases as well as the contradiction, 1 per run here. The author dismisses them; the established fact already states them.

**Limit, unchanged.** A contradiction with both low word overlap and low cosine is still missed. There is no polarity or negation check.

**Harness note.** Plan 04's 5 ms wall-clock check (`windowHygiene.test.ts`, "cheap enough for the reply path") failed once in a full jest run while three agent builds loaded the machine. Run alone it passed 3/3. A wall-clock floor flakes under load. It is noted for plan 09 hardening and was not retuned.

### Build part 2: new uses (worktree, 2026-09-25)

Worktree branch `worktree-agent-ada3cc3683bdf6057`, on master `e4d69db` (plan 04 merge + the contradiction fix). **No
backend, no browser, no TypeSafe key here: no calibration and no live gate ran, none is claimed green.** Scope: T22,
T23, the over-steer families, J8.10-J8.13, the privacy rows and plan 09's cost report reading the meter.

**Verdict state: Phase A NOT RUN for either use.** Both are built behind their own default-off keys, with the fixtures
labelled and the floors predeclared (commit 1, before any runtime code). What ships is decided by the calibration
runs below, never by this build: a use below any family floor is recorded as **not built** and its commits are dropped
(T23's schema, diff row, diagnostic and Studio control with it); no floor is retuned.

**Predeclared floors (unchanged from §6, in the fixtures):**

| use | fixture | rows | Spanish | families (floor) | flag |
|---|---|---|---|---|---|
| T22 `agencyCheck` | `test/fixtures/judge/agency.json` | 51 (23 writes / 28 clean; 14 group-chat, both families; 6 real Artemis replies from the part-1 J8.5 records, the rest authored) | 10 | writes recall ≥ 0.85, clean specificity ≥ 0.95 | raw Score `> 2.5` (`AGENCY_SCORE`) |
| T23 `houseRules` | `test/fixtures/judge/house-rules.json` | 24 cases, 96 (reply, rule) rows over 18 rules (13 EN + 5 ES); 3 cases are real replies (H01 is Arin's real "Fuck") | 16 rows | broken recall ≥ 0.85, kept specificity ≥ 0.95, untouched specificity ≥ 0.966 | Noul `≥ 0.7` (`HOUSE_RULE_P`) |
| regression | `test/fixtures/judge/continuity-combined.json` | the 28 continuity rows verbatim, inside the combined request (agency + 2 untouched rules) | 5 cases | continuity's own: reply 0.9, broken 0.85, consistent 0.966 | else arm B: `WARDEN_ARM = "separate"` |

`labelledAt: 2026-09-25`, before any answer was read. p50 ≤ 1500 ms is the latency bar; the warden's off-path budget
stays 4000 ms.

**As built**
- Judge core (`src/judge/warden.ts`, pure): `buildWardenRequests(input, arm)` asks every family that is on in one request
  (`WARDEN_ARM = "combined"`): `fact:<i>` Nouls (today's continuity request byte for byte when only continuity is on),
  one `agency` Score over 5 described levels (after Jeved Puppet; state `player`, `player_message`), one
  `rule:<i>` Noul per house rule (≤ 8, criteria "follows it or does not touch it"). Arm B (`"separate"`) asks each
  family as its own call; the continuity call is unchanged. `readWarden` reads the Score raw, names ≤ 2 rules verbatim,
  most certain first, and composes `Agency: <PLAYER_ACTION_CLAUSE with the persona name>` (one wording with
  `agency.ts:21`). `wardenRecordP` extends the ring summary (`agency`, `rules`, `broken`); the ring `use` stays `warden`.
- Calibration (`src/judge/wardenCalibration.ts`): `runAgencyCalibration` (`<case>.writes|clean`),
  `runHouseRuleCalibration` (`<case>.broken|kept|untouched:<i>`), `runCombinedContinuityCalibration`, and
  `runWardenRescore` for `continuity | agency | house-rules`. Wired into `JudgeRuntime.calibrate/rescore`, `so-judge
  calibrate` family scoring, and `calibrate-node.mts` (which records the replayable golden). Jest replays each golden
  once recorded (3 `todo` until then).
- Keys: `judge.uses.agencyCheck`, `judge.uses.houseRules`, both `false`, both author-view only (`AUTHOR_JUDGE_USES`, rule
  7: no player surface), copy says "Not measured yet" and what each sends. Readiness rows carry `calibration: null`,
  `measuredOn: null` (`PHASE_A_PENDING`), so turning one on reads `unproven`.
- Runtime: `runtime/continuity.ts` `createWarden` builds the warden deps (`createWardenCheck`, `wardenFamilies`): the
  agency family needs its key and stands down where `agencyFor(...).never_narrate_player_action` is false; the rule
  family needs its key and the pinned story's `house_rules`. The stagecraft coordinator still imports no `@judge` /
  `@memory`: it gets both through the injected accessor. `runWardenPass` runs when any family is on (continuity =
  `wardenEnabled`) and the shared `wardenAcceptMode` is not `off`; no facts no longer skips the call. It sends facts only
  while continuity is on, and the agency block only when a player line precedes the reply (cleaned by the plan 04
  window hygiene, persona **name** from `getPlayerName()`). One record per reply (`warden-<boundary>-<replyId>`), one
  op per family (`family`, `rules`, `score` on `WardenNoteOp`), `reason`/`summary` derived per family.
  `onGenerationStarted` composes every accepted op of the NEWEST noted reply whose family is still on into the one
  `continuityNote` block, continuity → agency → house rules, ≤ 4 lines (`composeWardenNote`); `commitNote` spends them
  together. Lapse, revert and "the nudge wins" are unchanged. A house-rule note whose rule left the story is withdrawn
  (`rejected`, `rule removed`) at the next warden pass or generation start.
- T23 schema: `StoryV2.house_rules?: string[]`; `validate` trims, refuses a non-list, an empty rule, > 240 chars, a
  duplicate (case-insensitive) and > 8 rules; `storyDiff` `house-rules-changed`, compatible, "What the narrator is held to
  changed."; diagnostic `house-rule-compound` (warning, `;` or ` and `/` y `) with its consequence line; Studio Story tab
  `[data-so="house-rules"]` list editor with an `n/8` count and a disabled add at 8, via `setHouseRules`.
- Author UI: `StagecraftPanel` labels `agency note (score x.xx)` / `house-rule note`, lists `house rule: …`, and heads a
  non-continuity record "Warden:". Stories `WardenFamiliesAwaitingReview`, `HouseRules`.
- Harness (X12): over-steer families `agency` (meta `Agency:`, `House rule`, `OOC`, `the rules`) and `house-rule`
  (meta `House rule`, `keep the next reply within`, `OOC`, `the rules`; the rule text rides the restate span);
  `wardenNotes` carry the family and `overSteerColumns` reads only the asked family, with the N+1 agency score from a
  rescore file (`replyScore`). The judge-on mode (`--judge-uses agencyCheck,houseRules --warden-mode auto`) sets the
  shared accept mode without switching the continuity warden on. The control-column rows now carry the player line
  before each reply, the persona name and the played story's rules, so `so-judge rescore --use agency|house-rules`
  works on archived records; the record keeps `cleanup.boundaries`.
- Plan 09 cost report: `so-judge cost-report --records <dir|files>` (offline): meter totals summed across records,
  `$` and `$ per 1000 boundaries` from the meters, `notInRing`, and per use from the archived ring: calls, calls per
  boundary, latency p50/p90/max (cache hits and never-sent fallbacks excluded), fallback rate by reason, the answering
  model, and `director`/`lore` against the 1500 ms budget. Run over the part-1 records it reproduces the recorded
  meters exactly: 6 calls, 4,718 / 276 tokens, $0.000198, `notInRing` 0.
- J8.10-J8.13 (`test/journeys/j8-stagecraft.journey.json`, capability `warden-families`), story
  `test/journeys/j8-house-rules.story.json`, catalog rows in `docs/plans/v2.1/test-plan.md`.

**Tests.** `src/judge/warden.test.ts` (17 + 3 golden todos), `src/runtime/coordinators/wardenFamilies.review.test.ts`
(16), `src/engine/houseRules.test.ts` (3), plus rows in `storyDiff.test`, `diagnostics.test` (seeded story fires
`house-rule-compound` once), `readiness.test`, `judgeHarness.test.mts` (3), `overSteer.test.mts` (1).

**Mutations** (`test/findings/mutations/v24-07-part2.txt`): **42/42 killed** (40 jest/node, 2 Storybook). The first
sweep left K1 alive (no case with a family on but nothing to send); the added case kills it.

**Gates (worktree, exact)**
- OK: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run debug:typecheck`.
- `npm test`: 235 suites, **3468 passed, 3 todo** (the golden replays); fault matrix 75/10/25/0 of 110; findings ledger 2
  open / 48 settled; `architecture.test.ts`, `ownership.guard.test.ts`, `faultMatrix.guard.test.ts` green.
- `npm run test:debug`: 262 tests, 261 pass, 1 skipped, 0 fail. `npm run test:plugin`: 9, 8 pass, 1 skipped (`JUDGE_LIVE`).
- `npm run build`: OK (2 known size warnings), bundle `69e4fca6e234`, `ST unknown` (worktree path).
- Storybook: `storybook:build` (`ST_PUBLIC` set), served on 6451, `test-storybook --index-json`: 32 suites, **218/218**;
  the server was stopped afterwards.
- Not run: `test:release` (rewrites `dist/manifest.json`; no release tooling changed).
- Budgets: manager **736/740** (−1: the warden deps moved into `createWarden`); `stagecraftCoordinator` **594/620**;
  `memoryCoordinator` 619/620 (untouched). Census row `runWardenPass` stays `checked`, note updated.

**Decisions made on evidence (small, stated)**
- **Order.** Phase A's inputs (fixtures, floors, runners) were committed before any runtime code, but the runs need the
  live judge, so the runtime was built behind default-off keys rather than waiting. The ship verdict stays the
  calibration's: nothing merges on this build alone, and a miss is a not-built record plus dropped commits.
- **T22 inherits T15 (D6).** A reply that decides, from the world, the outcome of an attempt the player's line stated is
  `clean` (level 1), whether or not `player_attempts_only` is on; the attempts clause is not a T22 input. T22 is opt-in
  and off, like T15's pieces; D6's "revisit after a player session, together with T22" stands.
- **Only live families inject.** An accepted note whose family was switched off afterwards stays out of the prompt and
  accepted (it lapses with the next reply), so turning a use off takes effect on the next generation.
- **Newest noted reply.** The composed block takes the newest reply with accepted ops; the old path took the first.
- **Rule removal is withdrawn lazily** (next warden pass or generation start), not in the story-swap path: the manager
  has 4 lines of budget and the result for the prompt is the same (a withdrawn note never injects).
- **Agency needs a player line.** No player message before the reply means no agency question (nothing to compare with).
- **Ring use.** The combined call records `use: "warden"` for every family, so readiness keeps one mapping and the cost
  report attributes the warden's spend to the warden; the `p` summary says which families were asked.
- **Cost report per use from the ring, totals from the meter.** The meter was not split per use: X23's exemption stays
  one named field, and per-use tokens are reported as ring readings with `notInRing` beside them.
- **Compound rule detection** is `/;|\s(and|y)\s/i`: it will also warn on a rule like "salt and pepper are rare", which
  is a warning, never a refusal.

**Deviations from the plan text**
- Red-first held only for the coordinator's `wardenFamilies` wiring case (red on a story whose `house_rules` the parser
  dropped, before `validate` read the field) and K1's added case; the rest was written beside its code, and the mutants
  are the evidence. Existing tests moved to the new check API (`createContinuityCheck` → `createWardenCheck`).
- `recommended-config.md` gained the two rows as "Not measured: Phase A pending", not as built uses.
- The plan's "on a hot-swap" withdrawal happens at the next pass/generation (above).

**Line corrections (Rule 1, re-verified on `e4d69db`)**: `PLAYER_ACTION_CLAUSE` is `agency.ts:21` (not :20); the
warden's boundary work is order 57 at `boundaryWork.ts:112-113` ✓; the no-facts skip at `continuity.ts:62` and the
hard-coded `reason`/`summary` and first-op-only injection in `stagecraftCoordinator.ts` are gone (now
`buildWardenRequests` returns no request, `wardenReason`/`wardenSummary`, `newestCarriedNote` + `composeWardenNote`).

**Live and calibration, written not run** (real judge through the plugin; lane 2; reload the page between arms, since
`JudgeRuntime` caches by request):
1. Phase A, off-page then in-page, each `--record`:
   `node --no-warnings --experimental-transform-types scripts/spike/typesafe/calibrate-node.mts agency --record`,
   `… house-rules --record`, `… continuity --fixture continuity-combined --record` (goldens `test/goldens/judge/<name>.json`,
   which un-todo the jest replays); then `node scripts/debug/so-judge.mts calibrate --use agency --record`,
   `--use house-rules --record`, `--use continuity --fixture continuity-combined --record`. A family miss exits 1 and
   is recorded as not built. If only the combined regression misses, set `WARDEN_ARM = "separate"` (arm B) and re-run
   the regression (it is then the plain continuity request).
2. J8 on arms ×2 and off ×1: `so-journey.mts run J8 --only J8.10 --judge-uses agencyCheck --warden-mode auto` ×2,
   `--judge-uses off` ×1; the same for `J8.12` with `--judge-uses houseRules`; `J8.11`, `J8.13` ×2 as written; J8.5/J8.6
   ×1 each to prove the generalised pass kept them green.
3. Control column: `so-judge.mts rescore --use agency --records <dir>` (and `--use house-rules`), then
   `so-lore-probe.mts diff <off> <on> --rescore <file> --family agency` (`house-rule`), which fills the over-steer
   columns (restate, meta, swing vs control, N+1 agency score ≤ 2.5); the human rubric row stays owed.
4. `so-judge.mts cost-report --records test/journeys/records/v2.4-plan07/<dir>` over the archived batch (plan 09 CL).
5. Run-header capture/diff around the batch; `--allow judge.uses.agencyCheck,judge.uses.houseRules` is NOT needed
   (both stay `false`), but the first header on this build lists two new keys under `judge.uses`.

**Remains:** the Phase A runs and their verdicts (the only thing that decides whether T22/T23 ship), the live J8 rows and
the control column, the over-steer human row, the TypeSafe terms citation for the privacy row, and the merge.
