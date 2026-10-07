# Plan 16 — v2.7 test plan

**Status (2026-10-03): written. Runs per plan as each lands, then once at close-out.** Overview: `00-overview.md`.
Model: `v2.6/10-acceptance.md` (phase F, verdict rules) and `v2.6/14-tiered-testing.md` (tiers, ×2, findings), scoped
down: v2.7 accepts **tier D only** (v2.7 rules 5–6). Every real-model row is listed in §What v2.7 does NOT prove with its
owner in `v2.8/01-v27-carry-over.md`; v2.8's final suite (`v2.8/24-test-plan.md`) runs them.
Exception (user, 2026-10-04): image plans 17–21 close through v2.7 24, using local Artemis (LT), local ComfyUI (LI)
and the existing cloud director/rater/judge (CL). Plans 22–23 are separately owned. No pod for plan 24.

## Rules

1. **Deterministic only.** A v2.7 gate makes no model call: `npm run gates`, jest/property tests, Storybook, no-LLM
   scenarios (mocked responses via the `storyOrchestratorDebug*Response` globals, `debugResponse`), scripted messages
   (`/sendas`, `send` without generation), `seed_metadata`, dry-run prompt captures, `so-ui` drives. A check that needs a
   real reply is not run here; it is a v2.8 row.
2. **×2.** Every live check runs twice, consecutive, on one lane (`st-lanes.mts batch --repeat 2 --strict`), with a run
   header captured before and diffed after the batch (`so-run-header.mts capture` / `diff`). A gate is green only after
   both runs pass. Jest/Storybook run once per commit (deterministic).
3. **Payload invariance** (v2.7 rule 6). For a plan that touches injection, extraction input, the opener or effects, a
   dry-run prompt capture (the `test/scenarios/effects-author-note-role.json` mechanism, no backend) of a scripted group
   chat is taken on the step-0 baseline bundle and on the plan's bundle and compared byte-for-byte. Any difference must
   be declared in the plan with its v2.8 owner row, or the gate is red. Goldens: `test/measurements/v2.7/payload/`.
4. **Lanes, not lane 0.** Live checks run on lanes 1+ (`st-lanes.mts`), dev build served (`npm run build:dev && npm run
   stage -- --flavor dev`, then `st-session.mts reload`). Campaign checks start from `adolion-fresh seed <lane>` with the
   step-0b pin. Images and sprites off; no ComfyUI call (a call is a failed run).
5. **Group chats only.** A solo chat appears only as a control (v2.7 03).
6. **Findings** get an id `V27-<plan>-<n>`, severity and class as in v2.6 14 rule 3, a row in the plan's gate record,
   and a deterministic regression check that then runs ×2.
7. **Cleanup is a gate** (v2.6 debug rules): sandbox chats, mirror books, created groups and reap prompts cleaned and
    reported; a leak fails the run.
8. **Image-track exception.** For v2.7 24, rules 1 and 4 permit declared LT/LI/CL calls and media on, on an isolated
   lane. Every new generated sprite and temporary reference is ledgered, baseline-scoped and cleaned. Model weights
   remain at the existing paths. A controller refusal blocks the LI row; it never substitutes a mock.

## Step 0 (code recheck, before any other v2.7 gate)

| Item | Gate | Live (D) ×2 |
|---|---|---|
| Baseline | capture the run header and the payload goldens on master at the start of step 0 (after the v2.6 worktree lands) | — |
| K1 | jest: player-visible output of `transcript-copiers` identical with and without a held secret (HUD chip, drawer row, settings row, Help), each copier; author detail differs only in Author view | lane: group story, Summarize on (main source, interval > 0) and chat vectors on, run with and without a `seed_metadata` held `[hiding]` row: `so-ui.mts assert-player-clean` + a DOM snapshot diff of the player surfaces = identical |
| K2 | `architecture.md` invariant rewritten (docs) | — |
| K3 | registry test (`stories` needs `group-chat`); guide drift | — |
| 07 A3 + A8 | `npm run gates` incl. `typecheck:test`, `test:debug` with the new pin | `adolion-fresh seed` + `check` on one lane; drift accepted with a reason |

## Per plan

| Plan | Deterministic gates | No-LLM scenarios / journeys | Storybook (interaction + a11y, 390/768/1440) | `assert-player-clean` | Live (D) ×2 |
|---|---|---|---|---|---|
| 01 docs + in-app | registry tests, settings reference fresh, guide drift | J3 player-mode checks that need no reply (`--only`, listed in the record) | Help panel, What's new, Getting started, legend (built) | Help open in player mode (O2) | in-app walk from cleared settings to the first send (no reply); Show me landings; settings-header "?" opens/toggles |
| 02 C1 SP5.b | jest: set, release on jump/leave, held while unmet, rollback ≡ replay | new no-LLM scenario on a group (scenario set, swapped at a transition by `/cp activate` in Author view; the scenario lives in the chat, so leaving writes nothing; removing the story restores the pre-story value) | — | — | payload capture shows the authored scenario block and nothing else (declared diff → v2.8 16) |
| 02 C2-K1 | see step 0 | — | HUD chip with/without secret | yes | step 0 row |
| 02 C11-F1a | jest: cut note for a long source, none for a short one | — | — | journal row author-only | `so-journal.mts show` on a seeded held judge-typed reading |
| 02 C13 | `curatorTiers.test.ts` + spike review test re-homed; write-edge mutant killed (`test:replay`); flag-off control | a mocked curator scenario (`stagecraft: {action: "curate"}` with `storyOrchestratorDebugCuratorResponse`): an op into a protected span refused, an applied op reverted by a swipe | — | — | payload invariance on the curator request (identical prompt bytes) |
| 02 C14 + 14 | jest: unknown model/source, preset precedence, truncation, TC untouched, picker grouping | — | role picker grouped, cloud/local labels | — | picker on a lane with a TC, a DeepSeek CC and a harness route listed in the right groups; no route changed (run header `profiles` diff empty) |
| 03 group-only | no-group refusals, engine-free `story-needs-group`, removal guard (removed modules/definitions absent from `src/`, planted-unused-definition and planted-import controls) | `plan10-epistemic-ledger.json`, `v24-01-macro-group-rest.json` (group blocks unchanged); new `seed_metadata` legacy solo-story scenario | "make a group" card | yes | legacy solo blob: card only, no extraction call, no injection in the dry-run capture, select refused; "make a group" creates + binds a group; cleanup deletes it |
| 04 health center | detect fixtures, registry tests, Repair order regression, `blocks` undismissable, `info` off the HUD | — | HUD chip, Setup section, Before you start (0/1/many, each severity) | yes | complete fixture (no memory profile, Summarize on, missing member, solo control), with and without a seeded secret; order, Show me, one-click fixes, no toast |
| 05 briefing | validator + diagnostics, fallback reads `player_intro` only, once-per-chat under rollback/reopen/restart, activation order per entry path, `storyKind` | J10 restart/selection checks (`--only`, no reply) | modal states, chapter briefing, first-run section | modal swept | new chat in a bound group: once; reopen: no; Restart: yes; `/story intro` and drawer button re-open; setting off suppresses; Before you start first; payload capture of the first activation unchanged (opener untouched) |
| 06 presence UI | index (F14, caps, backfill pause), toggle truth table (story AND install, all four combinations + absent), roll reconstruction, **rollback ≡ replay for the draws ring** with a negative control, badge DOM | `v24-02-chat-delete-reap.json` (row dropped on delete) | badges + hover card, Continue list, chapter card, wand entries, panel frame, Activity panel, author roll chip | badge titles, C1–C3, C6; author roll chip and Activity absent at player L2 | two group chats in two stories (saga + act), list paging, library delete keeps a pinned row, chapter card on a seeded chapter entry, wand targets, per-story off, panel position after reload; payload invariance with all items on/off |
| 07 campaign | `check_all.sh --fast`, `validate-stories`, `check_player_copy.py` on briefings | — | — | — | A6: the nine bound groups show the badge and the right saga/act kind on an adolion-fresh lane |
| 08 thinking | `thinkingSilence.test.ts`, `checks.test.ts` (built) | — | `HudStrip`, `InnerVoiceControls` stories (built) | player copy only in player mode | scripted replies with and without `extra.reasoning` (5 generated replies, `extra.api` set): finding appears/clears; harvest off → none |
| 09 commitment | `commitHoldReason.test.ts`, `heldJournal.test.ts` (built) | — | — | — | `so-journal.mts show` on a seeded held commitment row (mocked read) |
| 10 recommit C | `editCatchUp.test.ts` (built) | `plan03a-edit-rollback.json` with a mocked re-read | — | after the edit | edit the newest reply; `so-ui.mts pipeline` = `catching-up` until the mocked audit lands, then idle; guide line present |
| 11, 12, 12a, 13 | none (docs) | — | — | — | — |
| 15 SP10 | `lazyHarness.guard.test.ts` (was `devOnly.guard.test.ts`) with planted imports for the two removed modules | `v24-01-toolcall-run.json` still green | — | — | — |
| 17 image routes + 24 A | image capability/Repair registry, route/template/provenance contracts, `npm run gates` | no-service and owned-job controls | image settings and empty states | author findings hidden | route A/B, director/template, Test render and clean-host acceptance owned by 24 (LI/CL) |
| 18 sprites + 24 B/C | read-only pack fingerprints, ownership/ref cleanup, base recipe + alpha graph, pixel QA, cancellation | `v27-existing-expression-reference.json` | SpriteBuilder, ReferencePackPicker, BaseSpriteBuilder | author controls hidden | reference adoption ×2; `v27-card-art-base.json` (LI), three-character identity/expression ratings and cleanup |
| 19 talking sprites + 24 D | frame contracts, reduced motion and animator tests | missing-frame controls | sprite stage and mouth settings | — | S28: three characters, both generation arms, blind/preference/performance floors (LI/LT/CL); not closed by Belle alone |
| 20 living cards + 24 E | field scope priority/rotation, snapshot-only author ledger mirror, readiness checks, transactional rollback | `v27-card-rollback.json` | Roster/card editors and sprite settings | author-only provenance/readiness | `v27-local-card-reply.json` ×2 (LT); S32-1 three arms ×30 replies ×2 on local Artemis; S32-2 five looks ×4 expressions (LI/CL) |
| 21 pilot record | docs | — | — | — | historical single-character evidence; later acceptance lives in 24 |

Every plan closes with `npm run gates` (full, with Storybook, from the main checkout, not a `.claude` worktree path:
the Storybook runner finds no stories there, as both 2026-10-03 gate records found).

## Regression across v2.7

- The mocked scenario corpus (`test/scenarios/*.json` except `live-*`) ×1 per merge, with a run-header diff around the
  batch (S11 lesson: config leaks show only across a batch).
- At close-out: the corpus ×2 and every plan's live (D) rows ×2 on one lane series, on the frozen v2.7 candidate.

## Live smoke (once per v2.7 candidate; not a gate, not acceptance)

What it does, exactly:
1. `adolion-fresh seed <lane>` with the step-0b pin; dev build served; `so-run-header capture`.
2. Open one bound Adolion group (headed browser); start a new chat: the activation modal shows Before you start (if any)
   and the briefing; dismiss it; the group badge and hover card show; the HUD shows no setup chip.
3. Play **5 player turns** with real replies on the **DeepSeek CC profile** (`deepseek 4.1 flash`) for the main reply
   and the roles, as recorded in the header. **No pod** (user, 2026-10-03, as recommended): the small DeepSeek spend is
   accepted and written by `so-session stop` / `budget`.
4. Assert only plumbing: every reply rendered, a boundary committed per reply, no console error, no stall or error
   pipeline state, save health ok, `assert-player-clean` green, the Activity panel lists the turn's work in Author view,
   the plays index row updated, no ComfyUI call.
5. `so-run-header diff`, `so-session`-style evidence to the private `so-sessions` repo (`npm run sessions:archive`).

It proves the build runs end to end on a real install: a plumbing check only (user, 2026-10-03). **It is not
acceptance of model behaviour**: reply quality,
extraction accuracy, judge verdicts and any floor are v2.8 rows. A defect it finds becomes a deterministic check (rule 6).

## What v2.7 does NOT prove

| Not proved here | Built in | Owner |
|---|---|---|
| a fresh install reaches a first real reply with in-app guidance only | v2.7 01 | v2.8 01 O1 |
| real image cue without internal names; fired vs unfired `Appearance:`; `illustrate: false` and chapter look; narrator look | v2.7 02 C6–C9 | v2.8 01 O3–O6 |
| a real curator pass respects `stagecraft.exclude` | v2.7 02 C10 | v2.8 01 O7 |
| the thinking warning after real replies (`fix` vs `thinking` overlay) | v2.7 08 | v2.8 01 O9 |
| `catching-up` until a real re-read lands | v2.7 10 | v2.8 01 O10 |
| a held commitment from real play in the journal | v2.7 09 | v2.8 01 O11 |
| the story scenario block in real replies (SP5 live legs) | v2.7 02 C1 | v2.8 01 O13 (real replies, RP); v2.8 16 owns the dry-run plumbing (D) |
| wizard/agent prompt changes from C1 (guide topics, tool doc) | v2.7 02 C1 | v2.8 01 O13b (CL) |
| wizard prompt: every story needs its group (D5) | v2.7 03 | v2.8 01 O16 (CL) |
| promoted SP8 tiers/spans under a real curator | v2.7 02 C13 | v2.8 01 O14 (promotion under a real curator, CL); C13-b covers digest/prompt changes only |
| extraction quality on inputs the context table enlarges | v2.7 02 C14 / 14 | v2.8 01 C14-b |
| real group play unchanged after the solo removal and with the activation modal | v2.7 03, 05 | v2.8 01 O12 (final suite) |
| judge-typed evidence on the whole message (guard semantics) | — | v2.8 01 C11-F1 |
| warden/lore timeouts, separate-arm checks | — | v2.8 01 C3, C4 |
| independent-model content review of the A7 briefings | v2.7 07 A7 | v2.8 01 O15 |
| any human or blind rating outside the image track | — | v2.8 01 §F, v2.8 24 |
| S28 talking-sprite visual/performance acceptance, S32-2 changed-look identity | v2.7 18–20 | v2.7 24; LI rows remain open while the local controller refuses admission/reclamation |

## Archive locations

| What | Where |
|---|---|
| gate records (commands, results, deviations) | each plan's `## Gate record` |
| journey and scenario runs that green a gate | `test/journeys/records/v2.7/<plan>/` (`.debug` rotates) |
| payload goldens and diffs | `test/measurements/v2.7/payload/` |
| run headers around each ×2 batch | beside the run record |
| live smoke evidence (holds chat text) | private `so-sessions` (`npm run sessions:archive`); a summary in the close-out gate record |
| findings | the plan's gate record, `V27-<plan>-<n>` |

## Close-out checklist (step Z)

- [ ] Step 0 done: K1 fixed and green ×2, K2 invariant rewritten, K3 fixed; pin moved with A8.
- [ ] Every v2.7 plan's gate record lists its commands, results and its live (D) rows green ×2, or names the row moved
      to v2.8 01 with the user's agreement.
- [ ] `npm run gates` green with Storybook from the main checkout on the frozen candidate.
- [ ] Mocked scenario corpus ×2 and every live (D) row ×2 on the candidate; run-header diffs clean.
- [ ] Payload invariance: every capture identical to the baseline except the declared diffs, each with its owner row.
- [ ] Live smoke run once; summary recorded; evidence archived privately.
- [ ] Settings reference and README feature table regenerated; guide pages checked against the shipped UI; "What's new"
      for 2.7 written; second feature triage reviewed with the user (v2.7 01).
- [ ] Internal records moved to `so-sessions` (v2.7 01 decision 3).
- [ ] Every gate record walked into `v2.8/01-v27-carry-over.md` §A: each "Live: NOT run" real-model line has an O-row;
      O13 (C1) and O14 (C13 promotion) are in §A already; check they still match the gate records.
- [ ] `test:release` green on the prod build; v2.7 overview Status table updated.

## Review 2026-10-03

New file. Applied: F15 (tiers), Sol split items 2 (owed real rows → v2.8 01), 6 (03 + 04 scripted gates), K1/F34 (the
privacy leg with and without held secrets), B10 (registry gates).

Round 3 (Sol): R3-01, R3-02, R3-16, R3-17 applied.

2026-10-03 (user: as recommended): the live smoke runs 5 real turns on the DeepSeek CC profile, no pod; plumbing only,
not acceptance; small spend accepted.
