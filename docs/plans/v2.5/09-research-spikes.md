# Plan 09 — Research spikes (the user picks, U3)

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on: per spike (column "Needs" in each section and in the
ranking). No spike runs before the v2.4 entry condition (overview V1) and plan 11. **Verified against master `e7626d7`**
on 2026-09-25; Δ marks drift from the cited research line. **Re-verify every path:line before a spike starts** (v2.4 rule 1).

## Source rows

The overview's §09 table (`00-overview.md:234-247`), one spike each. "Post-processor rewrites" (`v2.4/01-carry-in.md:43`)
is folded into SP2, because recast's rewrite is the reproduction SP2 measures.

## Goal

For each candidate the research proposed, a verdict on predeclared conditions: PASS unlocks a build plan for the user's
approval; FAIL records the measurement and removes the spike code. Nothing here is a build (overview V8). The shape is
T13's (`v2.4/05-world-info.md:151-220`, `v2.4/05-t13-spike-report.md`).

## Rules for every spike

1. **Conditions are predeclared here and never retuned after a run.** Every live or model-dependent condition runs ×2
   consecutive under plan 10's series definition (`10-acceptance.md` §What "×2" means), and its records are archived under
   rule 3. Deterministic jest conditions run once. A relative bar ("today's", a no-release or control arm, e.g. SP4 T2/T3,
   SP6 K3/K5) names its control arm, and that arm runs ×2 in the same series on the same route.
   A condition that measured nothing (T13's S4/S7/S9 deviations) is re-measured with a changed procedure, stated in the
   report; the pass bar never moves.
2. **Spike code sits behind its own install-wide flag, default off, never flipped by this plan.** FAIL → the code is removed
   before plan 10. PASS → `docs/plans/v2.5/09-<id>-build.md` is written for approval, not built here. At plan 10's freeze
   no spike code stays in the prod entry graph, PASS or FAIL, unless its `09-<id>-build.md` was approved and built under its
   own gates in v2.5. A PASS whose build is not done by then keeps its report and records, and its code is removed like a
   FAIL (the build plan carries forward to v2.6 seeds). Measurement-only harness code may stay only as a dev-only dynamic
   import (`__SO_DEV__`). Each spike module is added to plan 12 D3's list so the shared import-graph walker checks it, with a
   negative control: a planted static import of a spike module fails.
3. **Report:** `docs/plans/v2.5/09-<id>-spike-report.md`, one row per condition: measured value, pass/fail, and a note per ST version claimed under plan 12 R5 (overview V10: latest stable at release).
   Records: `test/journeys/records/v2.5-plan09/<id>/live-<bundle12>/`.
4. **Live legs:** real LLM, lane copies (rule 10 for any lorebook write), run-header capture/diff around each batch, `--strict`.
5. **Model route.** A condition whose number depends on a model records the pass role (`extraction/passRole.ts:1`: `read`,
   `synthesis`, `authoring`, `director`, `curator`) and the route it ran on; plan 13 (harness routing) may route those roles
   to a CLI harness (`13-harness-routing.md`; the TypeSafe judge stays outside it). A judge condition records host + model.
   A cross-family run is optional extra evidence, **never a floor change** and never a substitute for the recorded route's run.
6. **Judge-shaped conditions follow v2.4 rule 4:** own use key, off by default, ≥ 20-case fixture with a Spanish slice,
   judge-off column.
7. **Player-facing surface waits for the human sessions** (rule 7). A spike may measure an effect on replies; it may not
   ship a player control.

Cost: **S** ≤ 1 day incl. live legs, **M** 2–4 days, **L** > 4 days or a new seam plus a human-session leg.

---

## SP1 — Swipe-back cache

**Hypothesis.** Returning to an already-read swipe can restore that swipe's committed state from a cache keyed by
`(messageId, text hash, scope hash, story id@version)` with no model call and no lag.

| Verified now | Seen |
|---|---|
| Swipe → rollback, always (only edit/update take the no-op check) | `runtime/turnBridge.ts:66`, `:202-221` (`edited` `:209`) |
| ST emits only `MESSAGE_SWIPED` for an existing swipe; `Generate('swipe')` only for a new one | ST `script.js:10315-10320` |
| Fingerprints ignore `swipe_id` (reindexed on swipe delete) | `runtime/fingerprints.ts:6`; `MESSAGE_SWIPE_DELETED` → identity refresh `turnBridge.ts:65` |
| No read cache exists | grep `cache` over `src/extraction`: 0 |

| # | Condition | Measured by | Pass |
|---|---|---|---|
| S1 | Replay equality | property test: commit swipe A, swipe to B (commit), back to A with the cache | engine + memory + blackboard == state after A's original commit, 100 % over 4 seeds × 200 cuts |
| S2 | No stale hit | mutate each key part (text, scope, story version) | 0 hits; a mutant dropping any key part fails |
| S3 | Saves a call | live, 10 swipe-backs on a lane | 0 `read` calls on hits vs 10 today; state equality as S1 |
| S4 | Worth building | swipe-back events per 100 player turns in the human sessions (U4) | ≥ 3; below it FAIL regardless of S1–S3 |

**Method:** jest first (S1–S2), then S3 on a lane ×2. S4 needs the player session. **Cost L.** **Needs:** U4.
**PASS unlocks:** the cache in `turnBridge` + the extraction commit path. **FAIL leaves:** today's rollback + re-read.

## SP2 — Re-commit after a rewrite of the newest reply (incl. post-processor rewrites)

**Hypothesis.** An edit that changes the newest committed reply (the player's own edit, or recast's `MESSAGE_EDITED`)
leaves the next prompt one boundary behind; re-committing at the same message id, as `continue` does, closes it.

| Verified now | Seen |
|---|---|
| A real edit rolls back from the message; a no-op edit is skipped by fingerprint | `turnBridge.ts:67`, `:209-220`; `runtime/chatSave.ts:117-119` |
| `continue`/`appendFinal` already commit at the same message id | `turnBridge.ts:14` |
| ST emits `MESSAGE_EDITED` from `messageEditDone` | ST `script.js:8405` |
| No re-commit path | grep `recommit|re-commit` in `src/`: 0 |

| # | Condition | Measured by | Pass |
|---|---|---|---|
| R1 | The lag is real | live: edit the newest reply so it satisfies a gate, send the next turn, capture the payload (`st-payload`) | the captured request carries the pre-edit state (confirms the problem); if it carries the edited state, FAIL (nothing to fix) |
| R2 | Re-commit equals replay | jest over the real manager: edit → re-commit vs a fresh replay of the edited chat | identical engine/memory state, 4 seeds × 200 cuts |
| R3 | No double commit | edit an older message; edit twice; recast's per-rewrite events | re-commit only for the newest committed reply; one boundary per settled text |
| R4 | Live | R1's script with the spike on, ×2; plus one recast-style `chat[i].mes =` + `MESSAGE_EDITED` fixture | next request carries the edited state; J6 (rollback journey) green ×2 |
| R5 | Cost | extra `read` calls per edit | ≤ 1 (route recorded, rule 5) |

**Cost M.** **Needs:** plan 02 (turn bridge untouched in parallel). **PASS unlocks:** an edit/update of the newest reply
becomes rollback + boundary. **FAIL leaves:** today's lag, stated in the README troubleshooting (plan 12).

## SP3 — Roster aliases and entity canonicalisation

**Hypothesis.** Characters referred to by nickname, title or first name split memory/epistemic/ledger keys and miss the
director, often enough to matter.

| Verified now | Seen |
|---|---|
| Roster member is `{id, name?, role?}`, no aliases | `engine/schema.ts:182-186` |
| Name → id is exact case-insensitive | `runtime/roster.ts:55-60`; talk `talk/rules.ts:4`, `talk/parse.ts:8` |
| Entity list = roster, bound entities, ledger-seen | `memory/entities.ts:19-26` |

**Phase A (read-only, no code):** re-read the archived audits under `test/journeys/records/v2.4-acceptance/` (J3, J5,
J7, J8, J11 `journal-follow.jsonl`).

| # | Condition | Pass (build only if either holds) |
|---|---|---|
| A1 | Split keys: epistemic subjects, ledger entities and memory `entity=` tokens that name a roster member by a non-canonical form | ≥ 5 % of cast-referencing rows |
| A2 | Director misses: `SPEAKER:` answers that resolve to no roster id although a member was meant | ≥ 1 per 50 decisions |
| A3 | Sample | ≥ 300 cast-referencing rows and ≥ 100 decisions; below it, one more J7 + J11 run each (procedure change stated in the report, rule 1). Still below it: A3 fails, A1/A2 are reported with their n but not decided, and SP3 is recorded not built (FAIL leaves exact matching). Never decide A1/A2 on an undersized sample |

Phase B (only on A1 or A2): `roster[].aliases`, one resolver used by director, epistemic, ledger and memory keys, and a
"same character?" author queue card; `rollback ≡ replay` unchanged; A1/A2 re-measured on two fresh runs, each ≤ half
its Phase A rate. The rows come from the `read` role: route recorded (rule 5). **Cost** Phase A **S**, B **M**.
**Needs:** plan 03 (memory coordinator lines). **FAIL leaves:** exact matching.

## SP4 — Append-only short_term

**Hypothesis.** Per-window summaries rotated by budget give better rollback locality and less summary-of-summary loss than
the single rolling entry.

| Verified now | Seen |
|---|---|
| One rolling entry, rebuilt from the previous text + the new window every 12 messages | `extractionCoordinator.ts:340-366`; `constants/defaults.ts:23` |
| Replace records a `short_term` derived row with inputs and removals | `memoryCoordinator.ts:170-181`; `memory/derived.ts:9` |
| Budgets 10 rows / 300 tokens | `memory/stores.ts:175,182` |
| `rollback ≡ replay` property test | `memory/rollbackReplay.property.test.ts:27` (400 iterations) |

| # | Condition | Pass |
|---|---|---|
| T1 | Invariant | `rollback ≡ replay` green with the append-only shape, same seeds |
| T2 | Locality | over 400 random cuts, `synthesis` calls needed to rebuild short_term after a rollback ≤ today's, and messages left uncovered ≤ today's |
| T3 | Retention | live, 60 turns, 12 planted needle facts in the first 24 messages; share still present in the injected short_term at turn 60 ≥ today's + 0.15 (route recorded) |
| T4 | Budget | injected short_term ≤ 300 tokens at every boundary |

**Cost M.** **Needs:** plan 03 (extraction coordinator 604/620). **PASS unlocks:** the tier rewrite. **FAIL leaves:** the
rolling entry (T2 alone passing is not enough: the claim is locality **and** retention).

## SP5 — Story-owned scenario

**Hypothesis.** A checkpoint `scenario` written to ST's per-chat override replaces competing card scenarios for that chat
only, through the effect ledger, with path replay on hydrate.

| Verified now | Seen |
|---|---|
| Solo: `chat_metadata.scenario \|\| character.scenario`; group: the override replaces every member's | ST `script.js:3445`; `group-chats.js:561-567` |
| Ledger restores cast / AN / background only | `effectsApplier.ts:50`, `withLedger` `:194` |
| No scenario effect exists | `engine/schema.ts:91-98` (`CheckpointEffects`) |

| # | Condition | Measured by | Pass |
|---|---|---|---|
| C1 | Per-chat correctness | chats A (cp3), B (cp1), C (no story); switch A→B→C→A ×3, capture each request | scenario == path replay's, 100 %; none in C |
| C2 | User override kept | a user-set override, then a checkpoint write, then leave | compare-and-set: `externally-changed` recorded, the user's text never clobbered |
| C3 | Rollback | rollback past a scenario-writing checkpoint | the previous scenario restored (a `RESTORABLE` row) |
| C4 | Group | 3-member group | one scenario block in the request, not three |
| C5 | Competing cards | cards whose scenarios compete with a story that sets none | an author-view diagnostic names them; no player copy (rule 7) |

**Cost M.** **Needs:** plan 03 (manager 740/740 if the applier grows the manager). **PASS unlocks:** `effects.scenario`,
Studio editor, the diagnostic. **FAIL leaves:** AN as the only per-chat framing channel.

## SP6 — Complication pool (+ R13 adversity read)

**Hypothesis.** An authored pool of complications, released one at a time as world pressure after N consecutive
escalate boundaries, fixes stories that sit at target tension while nothing ever costs the player (SUMMARY `:222,226`).

| Verified now | Seen |
|---|---|
| Escalation is a hint only, direction from EMA drift | `pacing/steering.ts:47-57`, escalate text `:30-39` |
| Agency clause: world pressure without player compliance | `engine/agency.ts:27-30` |
| Direction is not in the boundary log; tension replays from it | `engine/engine.ts:39-48`; `pacingCoordinator.ts:70-80` |

| # | Condition | Pass |
|---|---|---|
| K1 | Deterministic release | jest: release boundary and spent-ness derived from the log; rollback ≡ replay over 4 seeds |
| K2 | One turn, one block | payload capture: the complication reaches exactly the next loud request, never a quiet/impersonate one |
| K3 | Agency | 20 released turns: the warden agency family (`agencyCheck`, judge on) flags ≤ the no-release control + 1; judge-off column recorded |
| K4 | Over-steer | plan 01's probe on those turns: 0 verbatim restatements of the complication text |
| K5 | It moves the story | on a stalled-tension fixture, committed tension reaches the target band within 6 boundaries of release in ≥ 60 % of releases vs ≤ 30 % control (route recorded) |

R13 (the judge adversity read as the trigger) is **not** in this spike: it is its own Phase A under rule 6, and only after
K1–K5 pass. **Cost M** (R13 +M). **Needs:** plan 01 v2.4 over-steer probe (exists); U4 before any player-visible copy.
**PASS unlocks:** `checkpoint.complications`, Studio editor, Phase A for R13. **FAIL leaves:** drift-only escalation.

## SP7 — Seeded chance gates (and the RNG seam)

**Hypothesis.** A committed-before-the-draw chance (`roll: {sides, target}` on a `source: code` quality), drawn from
`seed = hash(chatId, storyId, boundary, quality)`, gives failure-by-odds while keeping engine purity and replay.

| Verified now | Seen |
|---|---|
| No RNG in `src/engine` | grep `Math.random` in `src/engine`: 0 |
| **Two chance rolls today are unseeded**: NPC reply `probability` (a failed roll records nothing), and the talk rules' weighted pick | `runtime/effectsApplier.ts:381`; `talk/rules.ts:66` falls back to `Math.random`, and its only caller `runtime/talkControl.ts:214` passes no `random` |

| # | Condition | Pass |
|---|---|---|
| D1 | Replay | jest: same chat/story/boundary → same draw; rollback + replay → same draws, 4 seeds × 200 cuts |
| D2 | Distribution | 10 000 seeds: observed rate within ± 1.5 pp of `target/sides` |
| D3 | Engine purity | `architecture.test.ts` green; the seed is a clock-like seam, no host import |
| D4 | NPC reply roll on the seam | a rolled-back and re-entered checkpoint draws the same outcome, ×2 live |
| D4b | Talk weighted pick on the seam | a rolled-back and re-entered boundary picks the same speaker, via `options.random` seeded from `hash(chatId, storyId, boundary, 'talk')`, ×2 live; if not built, recorded as a known non-replayable choice |
| D5 | Authored use: ≥ 1 shipped example story uses a chance gate and the user accepts it (a spec question, multihog research `:55`) | yes |

**Cost** S (seam + D4), M (gates). **Needs:** none. **PASS unlocks:** the seam for D4 even if D5 fails (D1–D4 alone), and
the gate schema only with D5. **FAIL leaves:** the unseeded roll, recorded as a known non-replayable effect.

## SP8 — Curator write tiers, protected spans, category digest

**Hypothesis.** Per-entry tiers (auto-safe vs review) and protected spans in content cut risky curator writes without
losing useful ones; a category digest bounds the prompt for large books.

| Verified now | Seen |
|---|---|
| Scope = `stagecraft.lorebooks` minus gated entries, re-checked at the write edge | `stagecraft/scope.ts:7-8,24-27` |
| One install-wide accept mode `off \| review \| auto` | `stagecraft/types.ts:15` |
| T17 built: shown-in-part refusal, uid addressing, declined-op memory | `stagecraft/prompt.ts:14,17`; `scope.ts:41-53`; `v2.4/06-steering-stagecraft.md:315` |
| Curator calibration on the candidate meets every floor | `test/goldens/live/role-calibration/curator-shared-65733265d301.json` (validity 20/20, opShape 14/14, decision 19/20) |

| # | Condition | Pass |
|---|---|---|
| W1 | Protected spans | jest + mutant: an op touching a protected span is refused at plan time **and** at the write edge |
| W2 | Tier routing | in `auto`, only `auto`-tier entries apply without review; others wait, 100 % |
| W3 | Live safety | ≥ 20 real `curator` proposals over a book with protected spans: 0 span violations applied; share of proposals refused ≤ 0.25 (route recorded, rule 5) |
| W4 | Digest | on an Adolion-sized book (≥ 150 entries): prompt chars ≤ 40 % of the full list, and the role-calibration floors above still met |

Inv 6 is **narrowed, never widened**: tiers and spans only remove writes. **Cost** S (W1–W3), M (W4). **Needs:** v2.4
curator role recommendation (seeds §E). **PASS unlocks:** per-entry tiers/spans; the digest separately on W4.

## SP9 — Witness-filtered transcripts / interceptor trimming

**Hypothesis.** A drafted member's request can omit messages that member did not witness, on the interceptor's copy, without
mutating the chat, which re-decides "no message-level hiding" (SUMMARY open question 9, `:795`).

| Verified now | Seen |
|---|---|
| Our generate interceptor is `talkControlInterceptor` | `manifest.json:13`; `runtime/index.ts:276` |
| ST passes `coreChat`: **shallow** copies (`{...chatItem}`), so `extra` is the live object | ST `script.js:4496-4528`, interceptors `:4564` |
| `IGNORE_SYMBOL` drops a message from the prompt | ST `constants.js:25`, `script.js:5841` |
| No witness source exists; "witness sets" is an unscheduled extraction item | overview §05 (`00-overview.md:199-200`) |

| # | Condition | Pass |
|---|---|---|
| F1 | No chat mutation | chat file and in-memory `chat[i].extra` byte-identical before/after 20 generations (a copy must replace `extra`, not set a key on it) |
| F2 | Filter correct | fixture with authored witness sets: 0 unwitnessed messages in any drafted member's request, 100 % of witnessed kept |
| F3 | Extraction and rollback unaffected | J5 + J6 green ×2 with the filter on |
| F4 | Witness source accuracy | the source chosen (extraction or scene presence) agrees with authored sets on ≥ 0.9 of 40 labelled messages (route recorded) |
| F5 | Cost | interceptor p95 ≤ 5 ms added |

**Cost L.** **Needs:** a witness source (F4 is its own measurement); the user's call on the stance (Q3). **PASS unlocks:**
an opt-in per story. **FAIL leaves:** today's stance: private knowledge by prompt block only.

## SP10 — Tool-call turns

**Hypothesis.** With a mandatory tool, one player turn becomes 2+ boundaries, and per-generation work (warden note, lore
force, private epistemic swap, talk decision) runs per depth.

| Verified now | Seen |
|---|---|
| Nothing in `src/` knows tool turns | grep `tool_invocations\|TOOL_CALLS` in `src/`: 0 |
| ST keeps tool-result system messages in `coreChat`; recursion bumps `depth` | ST `script.js:4496`, `:5433`, `:5556` |
| A dummy tool can be registered from a script | ST `tool-calling.js:1001` (`/tools-register`) |
| The event sequence (render, placeholder delete, recursion) | TV research `tunnelvision-…md:46`; re-verify at step 0 |

| # | Condition | Measured by | Pass (decides fold vs document) |
|---|---|---|---|
| Q1 | Inflation measured | fixture `v25-09-tool-turn.json`, 10 player turns with a mandatory dummy tool | boundaries per player turn and per-depth work counts recorded, ×2 |
| Q2 | Fold needed | Q1's counts | > 1 boundary per player turn **or** any per-generation work twice per turn; neither → FAIL (document only) |
| Q3 | Fold is safe | intermediary + continuation folded into one boundary | rollback ≡ replay (jest, 4 seeds) and J6 green ×2 |

**Cost** S (Q1–Q2), M (Q3). **Needs:** a Chat Completion profile with tools (the Artemis CC profile, gotchas "llama-server …
thinking template"). **PASS unlocks:** the fold. **FAIL leaves:** documented inflation (tension EMA, cadence).

---

## Ranked recommendation

Ranked by evidence of harm today, then cost. The user picks (U3); a lower rank is not a refusal.

| Rank | Spike | Cost | Evidence of need today | Needs | Recommendation |
|---|---|---|---|---|---|
| 1 | SP2 re-commit after a rewrite | M | every player edit of the newest reply; R1 confirms or kills it in one live run | plan 02 | run |
| 2 | SP10 tool-call turns | S (+M) | fixture does not exist; mandatory-tools users hit it every turn | CC profile | run Q1–Q2 |
| 3 | SP3 roster aliases, Phase A | S (+M) | measurable on archived records with no code | — | run Phase A |
| 4 | SP7 RNG seam (D1–D4) | S (+M) | the NPC reply roll is unseeded today (`effectsApplier.ts:381`) | — | run the seam; gates only if the user wants chance (D5) |
| 5 | SP5 story-owned scenario | M | research 4/M; host seam and ledger exist | plan 03 | run if cards with scenarios are common in your stories |
| 6 | SP4 append-only short_term | M | a quality claim, unmeasured | plan 03 | later |
| 7 | SP6 complication pool | M (+M R13) | no stall case recorded yet | U4 for copy | later |
| 8 | SP8 curator tiers/spans/digest | S–M | curator is off by default | curator in use | only if you run the curator |
| 9 | SP1 swipe-back cache | L | value unmeasured until the player session (S4) | U4 | after U4 |
| 10 | SP9 witness filter | L | no witness source; re-decides a stance | Q3 | not recommended for 2.5 |

## Risks
- **A spike that measures nothing** (T13's S4/S7/S9 needed procedure changes). Rule 1 allows a procedure change stated in
  the report, never a bar change.
- **Lane throughput** (seeds §C E1): model-heavy legs (SP2 R4, SP4 T3, SP6 K5, SP8 W3) queue on one backend; run at most two
  model-heavy lanes per backend.
- **Budgets:** manager 740/740, memory 619, extraction 604, stagecraft 601 of 620 (`architecture.test.ts:17-18`, measured
  now). A PASS whose build needs lines is budget-blocked to plan 03 (rule 12).
- **Plan 13 routes a role mid-series:** a condition's run is valid only on the route it recorded; a mixed series re-runs.

## Unresolved questions
- **Q1 (U3)** Which spikes, in what order? The ranking above is the recommendation.
- **Q2** SP7 D5: do you want failure-by-odds in your stories at all? Without it only the seam (D1–D4) is worth running.
- **Q3** SP9: is "no message-level hiding" still the stance? If yes, SP9 is dropped rather than run.
- **Q4** SP1 is not in the 2.5 pick list: S4 needs the plan-10 human sessions, so it runs after 2.5 as a v2.6 seed
  (alternative: if picked, S1–S3 run here, S4 is scored from HU inside plan 10, P09 for SP1 is judged after HU, and plan 10
  entry criterion 1 is satisfied by S1–S3 alone). SP6 stays in the pick list: K1–K5 need no human session; only its player
  copy waits on U4 under rule 7.
