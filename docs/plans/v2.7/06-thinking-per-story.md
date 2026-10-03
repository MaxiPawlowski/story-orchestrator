# Plan 06 — Thinking per story

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "Thinking per story". Overview: `00-overview.md`.

## What it is

A story (or one checkpoint) says how hard the main model should think before a reply: off, low, medium, high. For
example, off for a fast slice-of-life story, high at a climax. Plus one honesty fix: when the inner-voice harvest is on
but the model never thinks (for example because the instruct template prefills a closed thought), Repair says so
instead of the harvest silently doing nothing.

## History and evidence

| Date | What happened | Citation |
|---|---|---|
| 2026-10-01 | The fix for Artemis word-dropping and loops prefills an **empty, closed** thought channel (`<|channel>thought\n<channel|>`) at the end of every prompt. That turns thinking off | `docs/plans/v2.6/15-model-config.md` §Server-flag A/B, Reading 2; `14-review-pack.md` item 2 |
| 2026-10-02, T3-3 | Seed found. With the fix, 82/82 replies carry `reasoning: ""`, so the harvest (`memory.harvestReasoning`) can never fire. Without the fix, group prompts end on ST's speaker prefix and Gemma never opens a thought either | `test/sessions/T3/SUMMARY.md:124-125`; `14-review-pack.md` item 10 Evidence |
| 2026-10-02 | Seed written as: let a story or checkpoint ask for thinking on, with a Repair warning when harvest is on and the prefill disables thinking | `v2.7-seeds.md:23` |
| 2026-10-02 | **Thinking-on measured clean** with the opener after the name (`stga`): 0/20 damage, 0 loops, a thought opened 20/20. The September garbage was the prompt shape, not thinking | `15-model-config.md` §Thinking and model A/B, Reading 1 |
| 2026-10-02 | **Thinking applied install-wide**: to your install through ST's UI, and as the lanes' default overlay. Harvest on in the lanes | `14-review-pack.md` item 10 "Applied to your install"; commit `e29821df` |
| 2026-10-02 | Reasoning-effort A/B: budget 128 breaks group form 4/40; **400 is the sweet spot** (as clean as unlimited, p90 655 → 400, first token ~8 s sooner); "off" per request = budget 1 (0 is broken) | `15-model-config.md` §Reasoning effort A/B §2 |
| 2026-10-02 | **Reply thinking shipped**, install-wide `extraction.replyEffort` (default medium = 400), llama.cpp only (TC five keys, CC `thinking_budget_tokens`). Checkpoint `effects.reasoning` stays a dev-only spike (R4) | `05-reasoning-control.md` §2026-10-02 Reply reasoning effort built; `.claude/rules/architecture.md` invariant "The reply thinking budget…"; commit `cf4badef` |
| 2026-10-02, T5-5-1 | First session with thinking on: harvest fed 2 epistemic passes that stored `[intends]` rows. Cost: thinking took 77–91 % of each reply's time, replies 46–102 s | `test/sessions/T5/SUMMARY.md:73,75` |
| Astra (delegated) | blind `model-blind-20-think`: thinking ranked above the control; `model-blind-20-effort`: budget 400 first | `14-review-pack.md:26-32` |
| Open | R4 (checkpoint level) blind pairs: **4 of 20** exist, 0 rated. Harvest B2 floors (intent precision ≥ 0.80, meta-commentary rejected ≥ 0.95) and the live `intents` tier: **no measurement found** (not in any session summary or plan 15 doc) | `test/sessions/rating-pack/R4/status.json`; `06-inner-voice.md:63-67,271,290` |

**What changed since the seed was written:** its premise (thinking is off, so a story must switch it on) no longer holds
on your install or the lanes. Thinking is on everywhere by preset. What is left is (1) a per-story or per-checkpoint
*level*, and (2) the warning for installs that still run a non-thinking setup (the `fix` overlay, ST's stock `Gemma 4`
instruct, or another model).

## Why it was deferred

Found at T3-3, mid-run; the review answered item 10 with option (b) (measure thinking on) and left (c) "per-story
thinking" as this seed (`14-review-pack.md` item 10 Options). The checkpoint half already exists as the R4 spike, and a
spike is decided by its floor, which is unmeasured.

## Current state in code

| Piece | File | State |
|---|---|---|
| Install level `extraction.replyEffort` (off/low/medium/high, absent = medium), control `#so-reply-effort` | `src/runtime/settingsModel.ts:205-229`; `src/utils/replyEffort.ts`; `components/settings/ReplyThinkingField.tsx` | shipped, on |
| Budgets off 1 / low 128 / medium 400 / high none | `src/runtime/replyEffort.ts:9` | shipped |
| Checkpoint `effects.reasoning` (schema + validation) | `src/engine/schema.ts:116-128`; `engine/validate/checkpoints.ts:79-84` | parsed always |
| Checkpoint override applied | `replyEffort.ts:80-84` `armFor`; gated `__SO_DEV__ && spikes.reasoningEffect` in `replyEffortLive.ts:9` | **dev only, off**; a prod build ignores the authored level |
| Story-level default | none | not built |
| TC: never turns thinking on. With no thought opener at the prompt's end the overlay is `idle` ("the prompt does not open a thought") | `replyEffort.ts:99-102` | by design |
| CC: a profile that sets `enable_thinking: false` is left alone (`idle`); otherwise level ≠ off sets `enable_thinking: true` | `replyEffort.ts:121-134` | by design |
| Harvest switch `#so-inner-harvest` (author view), idle note only for "knowledge tracking is off" | `components/settings/InnerVoiceControls.tsx:24`; `memoryCoordinator.ts:148` | off by default; **no warning for "the model does not think"** |
| Effort shot ring (idle/unsupported reasons) | `src/runtime/replyEffortHost.ts` | dev debug only (`publishSpikeDebug`) |

## Options

**A. Drop the per-story level; build only the Repair warning.** Thinking is install-wide already, and the install level
covers most needs. Warning: author-only Repair row (and a line under the harvest switch) when harvest is on and the
playing chat's last K rendered replies carry no reasoning. The evidence rule is the harness's (`T3/SUMMARY.md:118`):
backend-agnostic, it does not trust a preset name. Cost: low (pure rule in `runtime/repair.ts` + a snapshot field).
Risk: low.

**B. A + promote the level per checkpoint and per story, after R4.** Story `reasoning` default → checkpoint
`effects.reasoning` → install level, through the existing `armFor`. It only sets a level **within** a setup that thinks:
on TC it budgets or closes a thought, never opens one. Cost: low code (lift the `__SO_DEV__` gate, add one story field,
Studio control, guide topic), plus the R4 measurement. Risk: an authored `low` at a group checkpoint breaks form
(4/40), so Studio should warn on `low` where `talk_control` drafts a group.

**C. A story can turn thinking on from a non-thinking setup.** On TC that means writing the prompt's end (appending the
opener, and removing the `fix` overlay's closing tag) per request. It breaks X20's "a preset is a per-request overlay
over keys the request carries" and the five-keys exception, and the measured clean shape also needs the instruct's
brief-plan line, names-as-stop off and a 1400-token response (`15-model-config.md` Recommendation 2a–g), which no
per-request write can supply. Cost: high. Risk: high (the September garbage came from a half-thinking shape).

**D. Status quo.** Install level only, checkpoint override dev-only, no warning. A user on a non-thinking setup who turns
harvest on gets nothing and is not told.

## Recommendation

**A now, B when R4 passes, never C.** The warning is cheap and closes a silent failure regardless of what else ships.
The per-story level is the R4 mechanism with one more field; let its floor decide, as the spike rule requires. C asks a
request overlay to fix a preset, which the measurements say it cannot.

**How this divides with plan 18 L5.** L5 owns *whether the inner voice graduates*: the harvest (B2) and inner beat (C)
switches, their floors and defaults. Plan 06 owns *the thinking controls*: the install/story/checkpoint level and the
"the model does not think" warning. L5 needs plan 06's warning before harvest can default on (an install without a
thinking preset would otherwise harvest nothing silently); plan 06 does not need L5. Plan 18's L5 text mentions this
seed; this doc replaces that bullet.

## Decisions for the user

1. Keep the seed, reduced to the warning + the R4 promotion path? **Recommended: yes.** yes
2. Allow a story to turn thinking *on* from a non-thinking setup (option C)? **Recommended: no.** no, lets have a warning
3. A story-level default as well as the checkpoint level? **Recommended: yes, behind the same R4 floor.** yes
4. Where does the warning show? **Recommended: an author-only Repair row plus a line under the harvest switch;** never
   in player mode (the harvest switch is author-view only). Why? if someone downloads a story from the internet, they dont see the author ui and need to be alerted. Lets use a general kind of alert or something?
5. Warning evidence: (a) recent replies carry no reasoning; (b) the overlay reported "the prompt does not open a
   thought". **Recommended: (a)**, with (b) as the detail line when it is available. a
6. Who rates the R4 pairs (Adolion content)? **Recommended: Astra, delegated, as for the other packs.** ofc astra

## Floor and measurement before building

- Warning (A): deterministic. Predeclared: the row appears when harvest is on and the last 5 rendered non-user replies of
  the playing chat have empty `extra.reasoning`; it never appears with harvest off, in player mode, or once a reply
  carries reasoning. Live: one lane with the `fix` overlay + harvest on shows the row; the `thinking` overlay does not.
- Level (B): R4's predeclared floor, unchanged: blind A/B on 20 climax turns across 2 stories, the arm preferred
  ≥ 60 %, p95 reply latency ≤ 2× the control (`05-reasoning-control.md` §R4). Arm = checkpoint `high`, control = install
  `medium` (`05-reasoning-control.md:323`). Data needed: 16 more pairs (4 of 20 exist).
- Not a floor but owed: the reply-effort ST live gate (off/low/medium/high × n ≥ 3 group turns, memory requests carry no
  budget key, a CC arm) is still NOT green (`05-reasoning-control.md` §Live).

## Gates

- Repair rule, story schema field, validation: `npm run typecheck && npm run lint && npm test`.
- Snapshot field, Repair row, Studio control, lifted gate: + `npm run build` + live gate via the `debug` skill
  (`st-payload.mts arm --persist`; real generation on a thinking lane and on a `fix` lane; `so-ui assert-player-clean`).
- Plan close: `npm run gates`; spoiler checklist row for the new Repair row (author-only).

## Links

- 18 character life, L5: inner voice graduation; depends on this plan's warning (division above).
- 10 model choice: thinking per story only matters on a model that thinks; Artemis v1.2 closes the thought at once
  09/16.
- 04 story presence (C8 onboarding could explain the thinking cost), 19 quests, 25 new game plus, 08 SP2, 22 SP9,
  16 spike defers (R4 is a v2.6 spike, not a v2.6 plan 03 one), 20 J6d, 14 J7, 13 B10, 12 curator create op, 11 warden-lore,
  21 cue+scene merge, 09 C4 option b, 07 commitment double negatives, 23 D6/T22, 15 open-source Jev alternative: no
  direct dependency.
