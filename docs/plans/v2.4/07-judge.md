# Plan 07 — Judge

**Status: PART 1 BUILT in a worktree on `4151bc8` (2026-09-24/25): T24, T25 narrowed (guard NOT built, see Gate record), dead toggles removed, judge-off control harness. Live gates NOT run. T22/T23 NOT STARTED (wait on plan 04's T15 decision).** Written 2026-09-23 against the working tree on `fcc33cc` + uncommitted V15b/V25 edits.
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
