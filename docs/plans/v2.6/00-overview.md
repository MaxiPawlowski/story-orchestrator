# Implementation Overview — Story Orchestrator v2.6: re-baseline on Adolion, finish v2.5, add inner life and saga memory, then play

**Status: APPROVED 2026-09-30 (every question answered, W1–W30); IN BUILD.** Development closes with plan 15 Part A
(final review, every finding fixed); testing is plan 14, executed by Claude in plan 15 Part B and reviewed with the user
on 2026-10-01. Per-plan state is in §Status at the end. This overview merges two drafts written the same day: the v2.5
close-out, and the inner-life slice (reasoning control and inner voice). Plans were renumbered on 2026-09-30. Before
that date, v2.6 plans were cited by file name.

## Why v2.6 absorbs v2.5

User decision 2026-09-30: **no separate 2.5 release.** v2.5 was never accepted. Plan 10 never started, no
`docs/release/2.5.0/attestation.json` exists, and every decisions-sheet cell is empty. Since the batch-2 runs of
2026-09-26, both the code and the test corpus have moved:

- **Plans 14–19 landed after the last live batch.** They cover the Adolion install, the image director, openings, the
  GPU broker, the commit guard, chained voices and the Saga repair. The sprite stage is new and has no plan doc.
- **Seven batch-2 fixes have never run live.**
- **The Adolion campaign changed.** It gained a spike lab (`C:\dev\adolion-campaign\lab\`) built to replace the toy data
  the v2.5 spikes ran on.

Every v2.5 live result is therefore **history**, not release evidence. The v2.5 docs stay as written. Their open rows,
decisions sheet and spike verdicts carry into the plans below.

## Inputs

| Input | What it gives |
|---|---|
| v2.5 plans 01–19 gate records | the open rows (`01-carry-over-proof.md`) |
| `v2.5/09-sp*-spike-report.md` | toy-data verdicts, kept as history (`03-spike-reevaluation.md`) |
| `adolion-campaign/lab/*` | Adolion data per spike; each README says what it cannot measure (`02-data-gaps.md`) |
| `adolion-campaign/docs/FEATURE-COVERAGE.md` | the plugin features the campaign uses, plus findings at `544975fb` |
| `v2.5/decisions-sheet.md` | open decisions A1–A17, B1–B17, C1–C7, D1–D5. They still apply; answers go there |
| Stepped Thinking review, v2.5 plan 13 H7, the model-call seam, ST reasoning host facts | the inner-life slice (§Background below) |

## Rules

v2.5 rules 1–14 and every invariant in `.claude/rules/architecture.md` are inherited. These are added or changed:

1. **One baseline.** Every live result cited in v2.6 runs on a bundle built after this overview is approved, against the
   current Adolion build. The run header captures the campaign commit and the bundle sha. Older results are history.
2. **Adolion is the default corpus.** A measurement runs on Adolion data when the lab or campaign has it, and on the toy
   fixtures otherwise. Toy data stays as the fast regression tier: jest, the mocked scenarios and J0–J12.
3. **A toy-data verdict is not a verdict.** A v2.5 spike that failed or stalled on toy data is re-run on Adolion before
   its code is removed. v2.5 plan 09's rule 2 (FAIL removes the code) applies to the **Adolion** verdict.
4. **Conditions are restated before a re-run.** A changed bar is written into the plan, with its reason, and committed
   **before** the run.
5. **Judge defaults are on** (user 2026-09-30; supersedes v2.2 rule 1's "off, never flipped by a plan").
   - `judge.enabled` and every `judge.uses.*` ship `true`.
   - The judge still never blocks or writes, and every use keeps its fallback. With no key configured, each use takes its
     fallback, and the panel says so once.
   - Each use stays its own switch.
   - Keys are per user when accounts are on (W12). Plan 12 makes the provider pluggable (W13).
   - Plan 10 keeps a judge-off column.
6. **Claude plays, the user reviews** (amended 2026-09-30 by W26; was "the user plays last"). Plan 14's sessions run
   after development is done, played by Claude on the lanes (plan 15 Part B), with everything recorded. The user and
   Claude review it all together on 2026-10-01. The user's own sessions are optional and later: v2.6 development is
   done without them. Anything that needs a human or a blind rating is **recorded for the user's review**, never scored
   green in their place. The user is asked only for decisions and the blind-rating pack (rule 11); no CLI login is
   needed (opencode only, W27).
7. **Every live run is archived outside `.debug`** (`test/journeys/records/v2.6-<plan>/`), in the same commit that
   cites it.
8. **Nothing new on the reply path by default.** Any on-path model call is opt-in, capped by a timeout, and falls back
   to today's path. The inner beat (06) is off-path: a draft never waits for it.
9. **Reasoning effort defaults to `default`**: nothing is sent, which is today's behaviour. Unlike the judge (rule 5),
   effort changes what the user's own backend spends, so a recommendation comes only from a measured floor (05 R3).
10. **Intents and beats are private knowledge.** They are never World Info, never scannable, never on the player surface,
    and never about the player persona. A line that decides or narrates the player's action is dropped at parse.
11. **A claim that generated prose improved is decided by a predeclared blind A/B, never by an impression.**
    - The corpus, pair count, raters and floor are fixed before the first arm runs.
    - Human-rated pairs from every plan are batched into **one blind-rating pack**, built from the arms Claude records in
      plan 14's tiers. It goes to the joint review (2026-10-01), where the user rates it; until then each such floor is
      "recorded, not rated". This covers 05 R4, 06 C3, 07 Q-M, 11 W6 and 03's rater legs.
**Testing strategy (user, 2026-09-30):**

13. **Real-LLM regression runs happen after development, tier by tier** (amended 2026-09-30 by plan 14: playable first, then feature groups, sessions first in each tier (played by Claude, W26), fixes inside the tier; the cumulative set runs ×2 at freeze).
    - Two kinds of LLM run are kept apart:
      - **Measurements** (spike legs, calibrations, the D1 corpus, any floor that decides a build) run when their plan
        needs them, because the build decision waits on them.
      - **Regression and acceptance runs** (journeys, live scenarios, carry-over rows, integration) do **not** run per
        plan. They run as one **final LLM suite** (plan 10 phase F), then ×2.
    - This supersedes v2.5 rule 14's ×1-per-plan live runs and the CLAUDE.md per-change live gate, for v2.6. A plan's own
      gate uses the deterministic tiers and no-LLM scenarios.
    - One exception: a defect that only reproduces with a real model gets one targeted run to prove its fix, recorded as
      such.
14. **Adolion is tested from a fresh import.**
    - `adolion-fresh` is a scripted clean import of the pinned campaign commit into a freshly seeded lane: the campaign's
      installer plus a `so-assets` baseline.
    - An inventory check verifies it: stories, cards, books and groups against the campaign manifest, and requirements
      green on every story.
    - Every Adolion measurement and the final suite start from it. A lane that has played Adolion is re-imported, never
      reused.
15. **Every task has its own gate.** Each plan's task list names the check that proves each task: a jest case, a
    Storybook interaction, a no-LLM scenario, or a measurement. A task without one is not done.
16. **Every plan ends with the overall gates**, run from the main checkout before merge, as one command:
    **`npm run gates`** (`scripts/release/gates.mjs`; stops at the first red step and prints the step it failed on).
    It runs, in order:
    - `typecheck`, `typecheck:test`, `lint`, `test` (which includes the architecture, ownership and fault-matrix
      guards);
    - `build`, `build:dev`, `test:debug`, `debug:typecheck` (the harness scripts type-check), `test:release`;
    - `test:replay` (plan 13's defect-replay set; every mutant must be killed) and `test:plugin`;
    - `test-storybook:ci` (`npm run gates -- --no-storybook` skips it, and the gate record must then say so).

    Passing them is the "done" line of every gate record. CI (`.github/workflows/ci.yml`) runs the same steps.
17. **The suite is reviewed before it grows** (plan 13). New tests follow its budget rules: name what they guard, justify
    the LLM tier, and fail once before they count.
18. **One blob bump for the release.** Plans 07 and 08 both change the persisted shape. They share **one bump, 5→6**,
    with reset and no migration (v2.5 rule 9). Whichever lands second extends the same v6 shape.

## Plan sequence

| # | Plan | Depends on | Doc |
|---|---|---|---|
| 00 | This overview, plus step 0: commit the working tree | — | here |
| 01 | Carry-over live proof (v2.5 01–08, 11–19, the batch-2 fixes) | 00 | `01-carry-over-proof.md` |
| 02 | Data gaps: an audit, then the corpora Adolion lacks (D1 machine-play corpus) | 00 | `02-data-gaps.md` |
| 03 | Spike re-evaluation on Adolion, all ten | 00; 02 for SP10 and SP4 D2 | `03-spike-reevaluation.md` |
| 04 | Remaining builds (harness routing, L7, J3, C1 residual, C3/C4/C12/C13, sprites, `.b` builds) | 03 verdicts for `.b` | `04-remaining-builds.md` |
| 05 | Reasoning control: effort per role, budget, `reasoning-exhausted` | v2.5 13 H7 shape | `05-reasoning-control.md` |
| 06 | Inner voice: drive/motives, `intends`, the off-path inner beat, narrator view | A/B: none; C: 05 R1/R2; D: B | `06-inner-voice.md` |
| 07 | Chapters and saga memory: seal, chronicle, fold | 02 D1 corpus for Q-M | `07-chapters-and-saga-memory.md` |
| 08 | Inline timeline | 00 | `08-inline-timeline.md` |
| 09 | Integration pass: every feature on, long Adolion play, machine-driven | 01–08, 11, 12 | `09-integration.md` |
| 10 | Acceptance: ×2 matrix, the rating pack (recorded for the user's review), the sessions (Claude's, W26) | all | `10-acceptance.md` |
| 11 | Agentic wizard: typed Studio tools, one reviewed step at a time, local or harness route | 04 H for the harness route | `11-agentic-wizard.md` |
| 12 | Open judge: provider seam, public survey, provider calibration, every candidate use spiked | Phase C12: 04 H | `12-open-judge.md` |
| 13 | Test suite review: inventory, mutation score, defect replay, prune, the final LLM suite list | step 0; runs **before** any plan adds tests | `13-test-suite-review.md` |
| 14 | Tiered testing: T0 playable → T1 engine → T2 memory → T3 player surface → T4 mutations → T5 author → T6 model/judge → T7 integration + freeze; sessions first, fix as we go | all development done; `so-session.mts` built first | `14-tiered-testing.md` |
| 15 | Final development review (Part A: two reviews, every finding fixed, model and prompt audits), then Claude runs plan 14 autonomously (Part B, €20 RunPod), joint review with the user 2026-10-01 | 01–14 development | `15-final-review-and-autonomous-testing.md`, `15-review.md` |

**Parallelism:**
- Plan 13 runs first, right after step 0: its budget rules and suite list shape every later plan's tests.
- Plans 01 and 02 start together. 02's audit runs first, because 03's SP10/SP4 and several rows in 01 batch B need its
  data.
- 05 R0 and 06 A need no lane and start at once. 04's harness work needs no login (opencode only, W27).
- 07 and 08 are independent builds. 07's quality runs wait for the D1 corpus.
- Lanes are shared. There is **no per-plan ×1 live run** (rule 13): measurements run when a build waits on them, and
  regression rows run in plan 14's tiers, ×2 at the T7 freeze.

## Step 0: commit what is on disk (before any lane run)

**Done 2026-09-30:** working tree committed (`20379cbf` GPU `/renew`, `4e60c4e9` explainer, `83b8c2bf` plan 19 + sprites + defaults on) under the full gate chain; repo moved to `C:\dev\story-orchestrator` (`7b98f4e0` explicit ST root, stage empties the slot); dev build staged (39 files); SV probe: `dist/index.js` 200, `docs/` `test/` `.debug/` `.claude/` `src/` 404. Lanes not yet re-seeded.

**First, the repo move (W15):** move the repo to `C:\dev\story-orchestrator` and serve a staged copy into ST (v2.5 plan 12 SV; `.debug` goes to `C:\dev\so-lanes\0\debug`). Then re-seed the lanes and capture a run header that shows the new paths. The working tree holds four uncommitted things:
- **plan 19:** `sharedRead`, judge extraction, `talkControl`, image settings/runtime, and the judge default flip;
- **the sprite/VN stage:** `src/sprites/`, `stHost/sprites.ts`, the `global.d.ts` handle, the jest root and style stub,
  and the judge `expressions` block;
- **the GPU plugin's `/renew` lease;**
- **`docs/story-orchestrator-explained.html`.**

Each is committed separately under the full gate chain: `typecheck`, `typecheck:test`, `lint`, `test`, `build`,
`test:release` and `test-storybook:ci`. The judge flip also updates the tests that asserted off-by-default. The
architecture rule is already updated.

## Decisions made 2026-09-30

| # | Question | Decision |
|---|---|---|
| W1 | Separate 2.5 release | **No.** Fold into 2.6 (user) |
| W2 | Judge defaults | **On for every install** (user; rule 5) |
| W3 | Re-evaluate spikes on Adolion | **All ten**, including those that already failed (user) |
| W4 | Build data where Adolion falls short | **Yes**, plan 02 (user) |
| W5 | When the user tests | **After all development** (user; rule 6) |
| W6 | Numbering | Dependency order, as in the table above (review) |
| W7 | Campaign repo: vendor or pin | **Keep it separate, pinned by commit in the run header.** The lab regenerates against `build/`, so a vendored copy would drift (review) |
| W8 | Blob bumps for 07 and 08 | **One bump to 6** (rule 18) (review) |
| W9 | Human-rated A/B legs across plans | **One blind-rating pack**, rated before the sessions (rule 11) (review) |
| W10 | Entry condition "after v2.5 plan 10 closes" (inner-life draft) | **Void.** v2.5 is folded, so the entry condition is step 0 (review) |
| W11 | Answered by the user 2026-09-30 | **A4:** sessions last (= W5). **U1 sprites:** the install switch is off by default; a story that configures sprites (Adolion does) turns them on for its chats unless the user switched them off. **U7:** `aegis` is a chapter. **U8:** keep the `/comment` note as an opt-in, with its default decided by the sessions |
| W12 | Q1a key scope (A5) | **(a)** Per-user keys. The env/file fallbacks are ignored when user accounts are on (user) |
| W13 | Q1b terms (C4) | **A provider-agnostic judge** ("a new decisions standard, many open source alternatives … keep our current featureset working"). Plan 12 builds the seam, surveys every public option (TypeSafe's terms included, which is J4) and calibrates alternatives. The privacy notice is shown once per provider that leaves the machine (user) |
| W14 | Q2 player surface before the sessions (C6) | **Rule 7 holds as "nothing reaches a released build before the sessions"**: no prod release exists yet, so player features get built and the sessions judge them before any release (user: "we have never released a prod version yet, so this is still true") |
| W15 | Q3 repo out of `public/` (A2/A3) | **(a)** Move both in step 0, before any v2.6 live run (user) |
| W16 | Q4 new judge uses (B6, B8, B10) | **A dedicated plan, as complete as possible, including a survey of every public option**: plan 12 Phase C spikes all of J6a–d, J7, J8/B10 and J5/B6, plus new candidates (user) |
| W17 | Q5 chance gates | **(a)** They ship. SP7 goes first in plan 03, then `SP7.b` moves the code into prod. Play Adolion on the dev build until then (user) |
| W18 | Q6 inspector vs timeline | **(a)** The timeline is the in-chat view (player and author levels). The inspector is its author-view click-through into one message's full detail (user) |
| W19 | Q7 wizard | **(a)** Plan 11, the agentic wizard (user) |
| W20 | Q8 hosted model in 05 R3 | **Both, hosted and local** (user). Which hosted source is open (05 §Unresolved) |
| W21 | Q9 chapter summary edits | **(a)** Author view only; a player flags (user) |
| W22 | U2, the rest of the v2.5 decisions sheet | **Every recommendation accepted** (user) |
| W23 | Hosted source for 05 R3 | **OpenRouter** (user) |
| W24 | Testing strategy | LLM regression at the end; fresh Adolion import; a gate per task; the overall gates closing every plan; the suite reviewed and pruned first (user; rules 13–17, plan 13) |
| W25 | Language scope | **English only** (user, 2026-09-30): Spanish test data, fixtures, goldens, lab slices and Spanish floors are removed; gap D4 is dropped; human sessions are English |
| W26 | Who plays plan 14 (plan 15) | **Claude, autonomously** (user, 2026-09-30, plan 15 Part B). The user and Claude review it all together on 2026-10-01. The user's own sessions are optional and later, and v2.6 development is done without them. Rule 6 is amended; plans 10 and 14 point here. Anything needing a human or a blind rating is recorded for the user's review |
| W27 | Harness scope | **opencode only, no CLI logins** (user, 2026-09-30). The Claude Code and Codex arms are dropped, not pending |
| W28 | Models for the autonomous run | **Artemis on RunPod is the main model** (profile `Artemis RunPod RP`); **DeepSeek runs the orchestrator passes** (read, synthesis, authoring, director, curator, inner). Budget: €20 RunPod plus the DeepSeek per-token spend, both recorded (user, 2026-09-30) |
| W29 | Review findings | **Every review finding is fixed immediately** (user, 2026-09-30, plan 15 Part A): no fix-in-testing or defer bucket |
| W30 | A11 wizard premises | **Chosen**, delegated to Claude (user, 2026-09-30): `test/measurements/11/premises.json` |

## Questions for the user

**All answered 2026-09-30, recorded as W12–W22 above.** The blocks below keep the context and the answers as given.

Answer each one on its **Your answer** line. "rec" means you take the recommendation. Every plan's own "Unresolved
questions" section points here. Anything already settled is in the plan's §Resolved 2026-09-30 or in the table above.
The v2.5 decisions sheet rows not listed here stay as recommended (U2 below).

### Q1 — Judge on by default: whose key, and what the user is told (v2.5 A5 + C4)

**Context.**
- The judge is TypeSafe's Jev classifier, reached through our server plugin.
- Each call sends chat excerpts to TypeSafe: the newest reply, facts and lore candidates.
- The plugin looks for a key in three places:
  1. ST secrets (per user);
  2. the server environment variable;
  3. `~/.typesafe/api-key/.env` (server-wide).
- Until W2, every use was off, so nothing left the machine unless someone switched it on. Now any install with a key
  sends by default.

**Q1a, key scope (A5).** On an ST server with user accounts, sources 2 and 3 are shared. A user who never entered a key
would send their chats on the admin's key and quota without knowing it.
- (a) Ignore sources 2 and 3 when accounts are on. Each user needs their own key, and single-user installs keep the
  fallbacks.
- (b) Keep them, and document the key as install-wide.

**Rec: (a).** The security gate PS-J already assumes it: "user B with no key gets refused, never user A's key".

**Your answer:** A

**Q1b, terms (C4).** Nobody has read TypeSafe's terms or data policy yet: retention, training use, region,
sub-processors. That is v2.5 plan 06 J4, a docs read that was never done.
- (a) Do J4 now. Keep on-by-default. The settings panel states once, when a key is first found: "judge on: chat
  excerpts are sent to TypeSafe", with a link to the policy.
- (b) The shipped default stays off. Only your install and the Adolion setup turn it on.

**Rec: (a).** It keeps W2 and costs one docs read plus one notice.

**Your answer:** i think today this is a new desicions standard, there are many open source alternatives. Can we use something general here, but also keep our current featureset working properly?

### Q2 — New player-visible features before your sessions (v2.5 C6, rule 7)

**Context.** v2.5 rule 7 held that nothing new reaches the player until the human sessions have run, and C6 recommended
"no new player text". v2.6 now builds player surface before you play:
- the timeline's player levels (08);
- chapter title cards, the "Previously…" popup and the Overview chapters section (07);
- the SP1 swipe-back and SP5 competing-card notes, if those spikes pass.

With W5 (you test last), the rule becomes "build it, and the sessions judge it".
- (a) Record that. A player surface stays in the release only if your session scores it "works", or "annoying, fix X"
  and the fix is made.
- (b) Keep rule 7 strictly: every new player surface stays behind author view until the sessions. You would then play
  without the features you asked for.

**Rec: (a).**

**Your answer:** we have never released a prod version yet, so this is stil true. 

### Q3 — Move the repo out of ST's `public/` folder, and when (v2.5 A2 + A3)

**Context.** The repo sits at `SillyTavern/public/scripts/extensions/third-party/story-orchestrator`. ST serves everything
under `public/` over HTTP. `docs/`, `test/` (fixtures and recorded chats) and the old 60 MB `.debug/` of the main
checkout were each measured downloadable from the ST port (HTTP 200).
- **A2:** move the repo to `C:\dev\story-orchestrator`. ST gets only a staged copy of the built extension, installed by a
  script.
- **A3:** move `.debug/` to `C:\dev\so-lanes\0\debug`, where the code already writes new output.

**Why the timing matters.** The move changes the paths of the lanes, the served `dist`, the debug dir, every run header,
and where agent worktrees get created. Done after plan 01's runs, it leaves those records pointing at the old layout.
- (a) Move both in step 0, before any v2.6 live run.
- (b) Move them at release.
- (c) Don't move. Sign off that the dev box serves these files.

**Rec: (a).** It is reversible.

**Your answer:** a

### Q4 — Which new judge uses enter v2.6 (v2.5 B6, B8, B10)

None of these is built until it meets its predeclared floor. The question is which ones get a measurement at all.

| Idea | What it does | Cost / caveat | Rec |
|---|---|---|---|
| **J6a player intent** | Before the reply, classify your line as attempt, question, dialogue or meta. It picks the steering text (an attempt gets the "don't narrate the player" clause); a meta line skips forced lore and the warden that turn | cheapest; needs 40 labelled lines, and `lab/judge/player-intent.json` already has 50 English lines (W25 removed the rest) | **measure** |
| **J6b bundle** | merge one boundary's judge calls into one request | only helps if they share context; its Phase 0 checks that first | **Phase 0 only** |
| **J6c tension read** | the judge scores tension instead of the extractor | waits on the extractor's tension fix being proven live; a Reddit report says numeric tension grading "still wasn't good" | **after the tension fix** |
| **J6d shadow record** | the extractor also answers what the judge answered, and the differences are logged author-only | measurement only | v2.7 |
| **J7** (7 ideas) | scene-break confirmation, canon verification, epistemic via the judge, cast tuning, two-hop look-ahead, per-quality floors, canon drafts | each needs a 20-case fixture (English only, W25) | v2.7, unless one matters for Adolion |
| **B6 hosted routes** | reach Jev through NanoGPT, OpenRouter or a local Jev-like model, as a second vendor | useful only if a host serves Jev's probability contract (plain chat completions don't count); each host re-calibrates every recommended use ×2 and adds a privacy row | **docs-only Phase 0** |
| **B10 CLI model as judge** | Claude or Codex through the harness answering judge questions | text, not probabilities, so every threshold needs a new rule; 2–7 s to spawn, so off-path only; needs the harness build | **defer** |

**Your answer** (per row, or "rec"): we should create a dedicated plan to spike and review all these, i want this as complete as possible, and even to invetiate any other pubic option out there

### Q5 — Chance gates ship, because Adolion depends on them (v2.5 B16, updated)

**Context.**
- SP7 added dice: a quality with `roll: {sides, target}`, drawn once at checkpoint entry and repeatable under swipes and
  rollback.
- The machinery lives **only in the dev build** (a spike chunk). Prod carries just the seam.
- B16 used to ask whether to add one d20 gate to sun-ruins so the feature had a real user.

**Found 2026-09-30.**
- Eight Adolion stories already use `roll` qualities: 7 rolls, one per act from II to VIII, each gating a real branch
  (`adolion-campaign/lab/chance/inventory.json`).
- On a **prod build those rolls are never drawn**, so every roll-gated branch takes its fallback.
- A playtest on the prod build (master's prod bundle was served on 2026-09-27) never saw those branches.

Options:
- (a) Chance gates ship. SP7 goes first in plan 03: finish D4/D4b, then `SP7.b` moves the code into prod. Until then,
  play Adolion on the dev build.
- (b) They don't ship. Remove the rolls from Adolion.

**Rec: (a).**

**Your answer:** a

### Q6 — Inspector and timeline (U3)

**Your earlier note:** "both, timeline > inspector. I see timeline more for author playing its story and inspector for a
player?"

**Context.**
- The v2.5 inspector (plan 07 A1) was specified as an **author** tool. It shows the exact prompt blocks injected at a
  message, the gates checked, the extraction deltas and which route answered. That spoils a story by design.
- The timeline (08) has player-safe levels (L1–L2: progress chips, "memory updated", World Info counts) and author levels
  (L3–L4: names, details, raw).
- A player-facing inspector would have to be spoiler-safe, which makes it timeline L2.

Proposal:
- the timeline is the in-chat view, at the player levels for a player and the author levels for you;
- the inspector is a click-through from a timeline chip into the full per-message detail, inside author view.

That gives two surfaces over one data source.
- (a) The proposal.
- (b) Something player-facing deeper than L2: say what the player should see.

**Your answer:** a

### Q7 — The wizard as an agent (U5)

**Your earlier note:** "wizard should propose as many things as possible, and be able to edit the story with tools,
sequentially, like claude code".

**Context.**
- Today the wizard runs five fixed stages (premise, turning points, characters, setup, provisioning). Each stage is one
  LLM call returning proposals that you accept or reject.

**What your note implies:**
- The Studio's typed edit API (`studio/mutations.ts`: add a checkpoint, set a gate, add a roster member …) becomes the
  agent's tools, alongside reading diagnostics and validation and running the gate replay.
- The model is the local one, or Claude Code / Codex through the harness plugin. v2.5 plan 13 built that routing for the
  `authoring` role.
- Every tool call shows as a reviewable diff and is applied one at a time.
- Asset creation (cards, lorebooks) stays create-only with its own review card (the invariant).
- Motives per checkpoint become one of its proposals.
- Cost: a new plan about the size of the Studio work. It needs 04's harness build for the Claude/Codex route, and can
  start on the local model.

Options:
- (a) Add **plan 11 "Agentic wizard"** after 04.
- (b) Seed it for v2.7. Plan 06 A then keeps "drives only".

**Rec: (a).**

**Your answer:** a

### Q8 — A hosted model in the reasoning-effort measurement (U4)

**Your earlier note:** "need more context".

**Context.**
- Plan 05 R3 decides which reasoning-effort level to recommend per background role: reads, summaries, wizard, director
  and curator.
- Each role runs at off/low/medium/high against that role's quality floor, ×2. On Artemis that costs only pod time.
- A hosted Chat Completion source (OpenAI, Anthropic or OpenRouter through ST) adds roughly 300–600 billed calls. That is
  a few dollars on a small model, more on a large one.
- Without a hosted column, a hosted source still gets the right request keys (mapped from ST's docs) but no measured
  recommendation.

So the question is whether you will run the background passes on a hosted API.
- (a) No hosted column.
- (b) Yes: name the source and model.

**Rec: (a)**, unless you plan to use one.

**Your answer:** both, hosted and local

### Q9 — Who can edit a chapter summary (U6)

**Your earlier note:** "player only plays, but, do we have a proper role distinction? i think it was more conceptual".

**Context.** It is conceptual. "Author view" is a per-chat toggle behind a confirm popup, not access control: anyone can
flip it. Steering, internals and Studio edits all live behind it already.
- (a) Summary edits are available in author view only. In player mode you can only flag (⚑). No new permission system.
- (b) A real permission split (for shared or multi-user ST). This would be a new plan, related to Q1a.

**Rec: (a).**

**Your answer:** a

### U2 — The rest of the v2.5 decisions sheet

`docs/plans/v2.5/decisions-sheet.md`. Rows not covered by Q1–Q5 or by W11 are A1, A6–A17, B1–B5, B7, B9, B11–B15, B17,
C1–C3, C5, C7 and D1–D5. Each has a recommendation and a reason there. B1–B5 (harness) needed a `claude`/`codex`
login refresh when this was asked; W27 since made the harness opencode only, with no login.

**Your answer** ("rec", or "rec except …"): rec

## Out of scope

- **Refused, carried from v2.5:**
  - auto-reroll;
  - judge-driven rewrites;
  - rules that run STscript;
  - a browser-held key;
  - a judge probability deciding a story-state write;
  - multiplayer POV.
- **Player-facing surface still waits for the sessions** (v2.5 rule 7). Plan 08's player levels are the exception the
  user asked for, and they ship behind the level setting.
- **v2.7 seeds**, collected in `v2.7-seeds.md` when plan 10 writes it:
  - new game plus (07);
  - SP-defers (03);
  - D6/T22 revisits.

## Background: the inner-life slice (plans 05, 06)

From the two user requests of 2026-09-30: a reasoning effort toggle, and "grab the pattern that matters" from Stepped Thinking and reinvent it for this plugin.


### Inputs

1. **Stepped Thinking review**, `docs/plans/v2.4/extension-research/stepped-thinking.md` (upstream `9b58956`), plus
   `SUMMARY.md` §4 and §5. Re-read against the installed v3.2.0 on 2026-09-30:
   - the thought call is `generateQuietPrompt` (`st-stepped-thinking/thinking/engine.js:443`);
   - the forced reply is `Generate(null, {force_chid})` (`:293`);
   - the default prompts are "Thoughts" and "Plans" (`settings/settings.js:686-718`);
   - thoughts are re-injected as the last K sets (`max_thoughts_in_prompt: 2`, `:138`).
2. **v2.5 plan 13 H7**: `routes[role].route.options.effort` already exists, but for harness routes only
   (`docs/plans/v2.5/13-harness-routing.md:291`).
3. **Our model-call seam**:
   - `requestModelReply` sends only temperature/top_p and the budget (`src/services/stHost/modelReply.ts:117-135`).
   - Five `PassRole`s route to per-role profiles (`src/extraction/passRole.ts:1`, `src/runtime/passProfiles.ts`).
   - `src/` has no `reasoning_effort` / `enable_thinking` / `include_reasoning` anywhere (grep, 2026-09-30).
4. **ST host, read 2026-09-30, verified in 05 R0**:
   - `reasoning_effort_types` (`public/scripts/openai.js:239`), the per-source mapping (`:2567-2655`), the payload (`:2821`);
   - a custom source forwards `reasoning_effort` only with `include_reasoning` (`src/endpoints/backends/chat-completions.js:1122`)
     and merges `custom_include_body` (`:2409`);
   - `sendRequest` spreads `overridePayload` over the profile fields (`public/scripts/extensions/shared.js:423-483`), and the
     preset is merged after that (`public/scripts/custom-request.js:549-556`);
   - native reasoning is stored on `message.extra.reasoning` (`public/scripts/reasoning.js:1595`).
5. **Measured trap** (`.claude/rules/gotchas.md`, 2026-09-25): with thinking on, a Chat Completion call to llama-server spent the
   whole `max_tokens` on `reasoning_content` and returned an empty `content`.

### What Stepped Thinking gets right, and what we build instead

| Their pattern | Why it works | Their cost | Our version | Plan |
|---|---|---|---|---|
| Think before speaking: N quiet main-model calls before the reply | The model plans, then writes | N blocking calls on the reply path; the input is locked | (a) Native reasoning with **effort per role**, and a checkpoint-scoped effort for the reply (spike). (b) An **off-path inner beat**: built on the cheap profile right after the previous reply, while the player is typing, and staged for the drafted member | 05, 06 C |
| "Plans" re-injected for K turns | Characters keep pursuing goals | A sliding window of untyped text | A typed private `intends` row with a lifecycle (open → retired/lapsed), provenance and rollback | 06 B |
| Per-character prompt sets | Per-character voice and aims | Hand-tuned prompts, main-model calls | **Authored** drive per member and motives per checkpoint. Deterministic, zero calls (the "deterministic stagecraft first" invariant) | 06 A |
| Own-speaker visibility in groups | No mind-leaking | Hidden flags recomputed per run | Already ours: per-member private staging (`memoryInjector.ts:146`), which survives nested generations since v2.4 T6 (`generationLifecycle.ts`). Intents join it | 06 B |
| "Mind reader" flag | A GM/narrator stays coherent | Raw thoughts of everyone | An authored `roster[].view: "omniscient"`: third-person union of the cast's private rows, with a concealment clause | 06 D |
| Thoughts in a spoiler above the message | Players like inner monologue | A spoiler in the chat | Author view only. The player surface waits for the sessions (06 §Resolved) | 06 UI |

**Rejected**, with evidence in the v2.4 review:
- blocking the reply with N calls;
- the unbounded min-length retry loop (`engine.js:452-471`);
- toggling `is_system` on later messages to regenerate (`mode.js:1177-1206`);
- content-equality prompt rewrites padded with `۞` (`prompt_adjustment.js:23,37`);
- global `setCharacterId` aiming (`index.js:44-58`);
- Separated mode posting thoughts as chat messages.

**Already taken from it**:
- T6: one-turn blocks survive nested quiet generations (v2.4 plan 01);
- per-tier `scannable` (v2.5 plan 08). `epistemic` stays `NEVER_SCANNABLE` (`src/constants/injectionRegistry.ts:34`), and so will intents.

## Status

| Plan | Status |
|---|---|
| 00 | APPROVED 2026-09-30, W1–W30 answered; step 0 done |
| 01 | no-LLM half built and on master (`e7af4081`); the LLM rows run in plan 14 (plan 15 Part B) |
| 02 | steps 0–1 on master (`adolion-fresh`, `02-audit.md`); D1 corpus is a measurement, run when 07's Q-M needs it |
| 03 | approved, nothing run; SP7 first; the spike legs run in plan 15 Part B |
| 04 | H (+ opencode agent bridge), S, B17, G, A1, C1r, C3/C4/C12/C13 built and on master; L7, J3, A4/A5, `.b` builds wait on measurements; T4 blocked |
| 05 | R0–R2 built and on master; R3/R4 are measurements (R4's ratings recorded for the user's review) |
| 06 | A–D built and on master, off by default; C3 is a measurement (ratings recorded for the user's review) |
| 07 | code built and on master (UI leftovers `eba02fc8`), features off until the Q-M floors; Q-M runs in T2 |
| 08 | built and on master; live rows in plan 14 |
| 09 | approved, not run; I1–I6 in plan 14 T7 before the freeze |
| 10 | approved; reordered by plan 14, executed via plan 15 Part B (W26) |
| 11 | built (tasks 1–4, local and harness routes); W1–W6 in plan 15 Part B, W6 recorded for the user's review |
| 12 | Phase 0 + A built and on master; Phases B/C not started |
| 13 | wave 1 + W25 on master; defect replay 30/30; the final suite runs inside plan 15 Part B |
| 14 | approved; session tooling + 36 cards on master; executed by Claude in plan 15 Part B (W26) |
| 15 | Part A in progress (reviews, model/prompt audits, review fixes); Part B after Part A closes |
