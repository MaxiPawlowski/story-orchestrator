# Plan 06 — Inner voice: what a character wants, kept private and rolled back

**Status: A–D BUILT 2026-09-30 and on master (`1e6f3f52`; UI leftovers `eba02fc8`), off by default. C0–C5 are
measurements, run in plan 15 Part B; C3's ratings are recorded for the user's review (blind-rating pack). See Gate
record.** Overview: `00-overview.md`. This plan replaces Stepped Thinking with our own design.

## The pattern worth keeping

Stepped Thinking gets its value from two things:
- **a character states what it wants before it speaks** (its default "Plans" prompt, `st-stepped-thinking/settings/settings.js:705`);
- **that want persists across turns** (the last K thought sets are re-injected, `:138`).

Its "Thoughts" prompt is mostly flavour. The price is N blocking main-model calls per reply (`thinking/engine.js:443`).

We already hold half of this. Private knowledge is typed and staged per drafted member:
- tags `knows/suspects/believes/hiding` (`src/memory/epistemic.ts:10`);
- staging at `memoryInjector.ts:146` for the drafted member and `:173` for solo.

We have nothing for **wanting**:
- `RosterMember` is `{id, name?, role?}` (`src/engine/schema.ts:209`);
- a checkpoint's objective is story-level, not per character;
- the per-member block tells a character what it knows, never what it is after.

## Four phases, cheapest first

### A — Authored drive and motives (deterministic, zero calls)

- **Schema:** `RosterMember.drive?: string` (a standing goal) and `Checkpoint.motives?: Record<rosterId, string>` (what that
  member wants at this checkpoint).
  - `validate.ts`: an unknown roster id is a diagnostic with a declared consequence (`DIAGNOSTIC_CONSEQUENCES`).
  - A motive whose subject is the player persona is a warning, not an error: "motives describe the character; the player's
    choices are theirs" (agency).
- **Injection:** into the drafted member's private block, and the solo speaker's, as `What you want: <drive>` and
  `Right now: <motive>`.
  - The group resting block stays empty (the existing design).
  - The next-turn preview (`runtime/nextTurn.ts`) shows it, because it reads the applied block.
- **Authoring:**
  - the Studio Roster editor gains `drive`, and the Checkpoint editor gains per-member motives, both through `mutations.ts`;
  - the wizard's Characters step proposes drives as ordinary ops, reviewed like any proposal.
- **Why first:** Stepped Thinking's per-character prompt sets exist to give each character an aim. An authored line does
  that with no model call and no latency. It also does it with no extraction error.

### B — `intends`: wants the story discovers, as typed private rows

- **Tag:** `intends` joins `EpistemicTag` and `PRIVATE_TAGS` (`epistemic.ts:10`).
  - Phrasing: `You intend:` (`:104-116`).
  - The parser accepts `[intends] Name: …` on the same shared read and P2 pass as the other epistemic tags. It is off-path and
    needs the capability profile, like today.
- **Evidence rule:** an intent must be stated or shown by the character itself, in its own dialogue or action. It is never
  inferred from the player's narration, and never recorded for the player persona. Parse drops a line that fails either test
  (overview rule 10).
- **Lifecycle:**
  - retired by the existing `[retire]` supersession when an intent is fulfilled or abandoned;
  - lapses when it has not been reaffirmed for N scene breaks (N predeclared: 3, see Q1);
  - capped at 3 open intents per member, newest kept (the `capEpistemic` shape).
- **Rollback:** rows carry provenance. `rollbackReplay.property.test.ts` gains intents in its generator, and the
  `rollback ≡ replay` claim must still hold over 4 seeds × 400 cuts.
- **Floors (live suite, predeclared):** a new `intents` tier over ≥ 12 extractor fixtures.
  - precision ≥ 0.80;
  - recall ≥ 0.50 (reticent characters are expected to be low);
  - player-attributed intents = 0;
  - `--expect-count` pinned.
- **B2, a spike: harvest native reasoning.** When the main model reasons, ST keeps it on `message.extra.reasoning`
  (`public/scripts/reasoning.js:1595`). It is that member's own thinking, which is the thing Stepped Thinking generates at a
  cost. We can feed it, for that member only, as private evidence to the P2 pass.
  - Floors: harvested intent precision ≥ 0.80, and meta-commentary rejected ≥ 0.95 ("I should write…", "the user wants…").
  - Otherwise it is recorded not built.
  - Never used for another member's rows.

### C — The inner beat (spike): a prepared private note, off the reply path

This phase replaces Stepped Thinking's "think before speaking".
- **When:** new boundary work `inner-beat` (`runtime/boundaryWork.ts`, order 58, after `scene-read`). It runs after a
  committed character reply, while the player reads and types.
- **For whom:**
  - solo: the character;
  - group: the likely next speakers from the deterministic candidate weights (`src/talk/rules.ts`), capped at 2 (Q3), or the
    lead only.
  - The director is unchanged.
- **Call:** one per candidate, on role `inner` (Q4), with plan 05 effort `off` recommended and the plan 05 budget. Inputs:
  - the recent window;
  - that member's private rows (knowledge, intents, drive, motive);
  - the checkpoint objective and agency policy;
  - the steering hint.
- **Output:** strict lines, `BEAT: <one sentence: what this character is trying to do next>` and an optional `TONE: <one word>`.
  - The strict line parser in the `talk/parse.ts` shape.
  - One repair pass at most. No length-retry loop (the Stepped Thinking anti-pattern).
- **Stored:** `{chatId, memberId, basedOnMessageId, checkpointId, beat, tone}`.
  - A capped ring in the memory slice, derived with its message range, so a swipe, edit or delete of the reply it read drops
    it (`memory/derived.ts`).
  - A `RunOwnership` token before the write, and a census row.
- **Used:** at `onMemberDrafted` or the solo draft, only when fresh:
  - built on the newest character message before the player's line;
  - same chat;
  - same checkpoint.
  - Then the private block gains `Your intent this turn: <beat>`. Otherwise nothing is added.
  - **The draft never waits** (overview rule 8). Hit, miss, stale and unused are journaled for the author.
- **What this does better than Stepped Thinking:**
  - no added latency: the call runs behind the player's typing;
  - a cheap model with thinking off;
  - grounded in authored motives, private knowledge and the checkpoint rather than a generic "describe thoughts";
  - private and never scanned;
  - typed and rolled back;
  - bounded to ≤ 2 calls per turn.
- **C0, measured before anything is built:** the A/B harness.
  - A fixture corpus of 30 decision-point turns across 3 stories (Adolion, sun-ruins, the J-fixture story).
  - For each turn, one reply with the beat and one without. Same seed and sampler.
  - A blind human rater and a judge rubric (in character / pursues an established aim / never narrates the player).
- **Predeclared floors (build if all pass, else recorded not built with the measurement kept):**

| # | Floor |
|---|---|
| C1 readiness | beat ready at draft start on ≥ 80% of turns at a realistic 20 s player pause (journey with scripted pauses) and in one human session |
| C2 cost | ≤ 2 `inner` calls per player turn (structural jest bound, rule 11) |
| C3 quality | beat arm preferred ≥ 60% of the 30 pairs by the human rater **and** the judge rubric |
| C4 agency | replies that narrate the player's action: beat arm ≤ control |
| C5 no regression | J3, J5 (privacy, block-scoped) and J7 green with the beat on |

- **C6, a sub-spike, only if C passes:** fold the beat into the director's on-path call for groups (`SPEAKER` + `BEAT`,
  `talk/prompt.ts:22`), so the chosen speaker gets a beat even when the prediction missed. Floor: director accuracy not below
  its measured baseline, and p95 director latency ≤ +20%.

### D — Narrator view (the "mind reader", made safe)

- **Schema:** `RosterMember.view?: "own" | "omniscient"` (authored, default `own`).
- **Block:** an omniscient member's private block is the union of the cast's private rows (hiding, intends, knows, beats),
  rendered third person. Examples: "Kael is concealing the theft from Lyria", "Lyria intends to leave before dawn".
  - Budget-capped per subject.
  - Headed by a concealment clause: "use this to foreshadow; reveal nothing a character conceals unless the scene reveals it".
- **Privacy stays checked, block-scoped** (J5.8's lesson). A journey check asserts:
  - the narrator's request carries others' rows inside the narrator block;
  - every non-narrator request still carries only its own.
- **Target:** the Adolion narrator pattern.

## UI

- Author view only.
  - A per-member "Inner voice" row in the Scheduler tab: drive, current motive, open intents, the latest beat and its status
    (fresh / stale / unused).
  - The Payload tab's next-turn preview already shows the applied block.
- Player mode shows nothing. The new selectors join `so-ui assert-player-clean` and the spoiler checklist. The player surface
  is Q6 below.

## Files

- `src/engine/schema.ts`, `validate.ts`: A, D.
- `src/memory/epistemic.ts`, `parse.ts`, `derived.ts`: B.
- `src/runtime/memoryInjector.ts`: A, B, C, D blocks. **Watch the `memoryCoordinator` budget**; a fix blocked by it goes to
  code health (v2.5 rule 12).
- `src/runtime/boundaryWork.ts` + a new `src/runtime/coordinators/innerCoordinator.ts`: C. Constructor-injected; it never
  imports another coordinator.
- `src/extraction/passRole.ts`: `inner`, if Q4 says so.
- `src/studio/*`: A.
- `src/components/drawer/*`: UI.
- `test/findings/ownership-sites.json`, `faultMatrix.json`: new rows.

## Gates

- **Pure:** full jest + `typecheck:test`, `rollbackReplay` with intents, parser cases (player-attributed intent dropped,
  meta-commentary dropped).
- **Runtime:** dev build + `st-session reload`, then real LLM on a lane:
  - A: payload capture shows the motive in the drafted member's block only.
  - B: the live suite `intents` tier at its floors.
  - C: C0–C5.
  - D: the privacy journey check.
- `so-run-header diff` around each batch.
- No per-plan live ×1 (overview rule 13, superseding v2.5 rule 14): the live rows run in plan 14's tiers (T3 for C,
  T2 for D's privacy check), ×2 at the T7 freeze.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Intent lapse: 3 scene breaks, or boundary-based? | **Whichever comes first: 3 scene breaks or K boundaries.** K is fixed before the build from the D1 corpus: 3 × the median boundaries per scene (v2.6 02). | Groups can go long stretches without a scene break (the heuristic needs a location change), so a scene-only rule never lapses there. A boundary-only rule lapses mid-scene in fast chats. |
| B2 reasoning harvest: its own opt-in? | **Yes: its own install-wide switch, off by default** until its spike floor passes. | Every new use gets its own switch (the judge precedent). It reads `message.extra.reasoning`, which some users hide on purpose. Unlike the judge (overview rule 5), no floor has been measured for it. |
| Group beat fan-out: top-2 or lead only? | **Both are arms of the C spike.** Lead-only is the cost control. C1 (readiness at a 20 s pause) and C2 (≤ 2 calls) decide. | `LLM_PARALLEL` is 2 and shared with extraction, so top-2 may queue behind reads. That is exactly what C1 measures. |
| `inner` as its own `PassRole`, or ride `read`? | **Its own role.** | 05 R1 attaches effort per role. The beat needs effort `off` on a cheap profile, while `read` may want thinking. A role costs one entry in `PASS_ROLES` plus a label (`src/extraction/passRole.ts:1`), and it defaults to `read`'s profile. |
| Should players ever see an inner voice? | **No until the sessions have run** (v2.5 rule 7). HU-P1's rubric asks. Author view only, as drafted. | Player surface waits for the sessions. |

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Intent lapse: 3 scene breaks, or boundary-based? | **Whichever comes first: 3 scene breaks or K boundaries.** K is fixed before the build from the D1 corpus: 3 × the median boundaries per scene (v2.6 02). | Groups can go long without a scene break (the heuristic needs a location change), so a scene-only rule would not lapse there. |
| B2 reasoning harvest: its own opt-in? | **Yes: its own install-wide switch, off by default** until its spike floor passes. | Every new use gets its own switch. It reads `message.extra.reasoning`, which some users hide on purpose, and no floor has been measured for it. |
| Group beat fan-out: top-2 or lead only? | **Both are arms of the C spike.** C1 (readiness at a 20 s pause) and C2 (≤ 2 calls) decide. | `LLM_PARALLEL` is 2 and shared with extraction, which is what C1 measures. |
| `inner` as its own `PassRole`, or ride `read`? | **Its own role.** | 05 R1 attaches effort per role. The beat needs effort `off` on a cheap profile. A role costs one `PASS_ROLES` entry plus a label (`src/extraction/passRole.ts:1`). |
| Should players ever see an inner voice? | **Not before the sessions** (v2.5 rule 7, overview W14). Author view only. | — |
| Does the wizard propose motives? | **Yes: the agentic wizard (plan 11) proposes motives per member and checkpoint** among everything else (overview W19). | User: "propose as many things as possible". |

## Unresolved questions

None.

## Gate record

2026-09-30, branch `worktree-agent-a7829fc99319d6b0b`, on master `fb31e640` (merged). Not merged to master. No lanes and no real-LLM runs (out of scope per brief).

### Built

- **A**: `roster[].drive`, `roster[].view` (`own` | `omniscient`) and `checkpoints[].motives` (roster id → text) in `engine/schema.ts`. Validated in `engine/validate/checkpoints.ts` (optional, trimmed, wrong types refused). Diagnostics: `motive-member-unknown` and `motive-for-player`, each with a consequence. Studio: a drive input and a narrator-view box in `RosterEditor`, and a `MotivesEditor` in `CheckpointEditor`. Mutations: `setRosterDrive`, `setRosterView` and `setCheckpointMotive` in `studio/innerVoiceMutations.ts`, a lazy-only file, which stays within the budget. The plan 11 agent tools of the same names are backed by it: `tools.test` counts `mutations.ts` + `innerVoiceMutations.ts` as one surface. Coverage rows for `drive` and `motives`. The proposal grammar carries drive/view/motives through `updateRosterMember` and `updateCheckpoint`.
- **B**: `[intends] Name | …` in both epistemic contracts.
  - Evidence rule: the claim must come from the speaker, or name a character in a character line. It is dropped when it is the player/persona or meta-commentary.
  - A restatement appends `affirmedAt` (cap 32). Rollback trims the affirmations.
  - Lapse happens after `INTENT_LAPSE_SCENES` (3) scene summaries or `INTENT_LAPSE_BOUNDARIES` boundaries, whichever comes first. Pinned or locked intents never lapse.
  - Open-intent cap: 3 per subject.
  - The B2 reasoning harvest (`memory.settings.harvestReasoning`) is off by default.
- **C**: the `inner` PassRole ("Inner voice"), plus `memory/innerBeat.ts` (prompt, the BEAT/TONE parser, one repair).
  - `InnerCoordinator` runs off-path from boundary work `inner-beat` (order 58, fire-and-forget), and only when the newest row is a character reply.
  - Its candidates are the likely next speakers: lead-only, or `top2` via `innerFanOut`. Budget: 2 calls per player turn.
  - It holds a `RunOwnership` token and checks it after each call. Its census row is `checked`.
  - Beat ring cap 6. Beats are used only when fresh (same chat, checkpoint and anchor), and the journal records used, stale or missing beats.
  - `memory.settings.innerBeat` is off by default, with no panel control.
  - The debug global is `storyOrchestratorDebugInnerResponse`.
- **D**: an `omniscient` member gets a narrator block (the cast's aims and intents, plus hiding/knows rows, 6 per subject). Everyone else gets their own aims and the private block. Author view: `InnerVoicePanel` (`#so-inner-voice`) in the lazy Scheduler tab, listed in `PLAYER_FORBIDDEN_SELECTORS` and in the spoiler checklist.
- Chat blob: `memory.innerBeats` and `affirmedAt` are optional on read. Nothing was added to `isCurrentRecord`, and the blob stays v6.

### Bundle

- **Main entry `dist/index.js` = 1,199,987 B**, under the 1,250,000 budget, which was not raised.
- Before master's plan 07 lazy split, this plan alone on `180b01ec` measured 1,249,959–1,250,002 B. That was only after the trims below; the first build was 1,259,799 B.
- The render, beat, intent-admission, harvest, host and wiring code moved into lazy chunks:
  - `memory/innerRender.ts`, loaded by `loadInnerRender()`.
  - `runtime/innerBeatHost.ts` + `innerCoordinator.ts`.
  - `talk/nextSpeakers.ts`.
  - `studio/innerVoiceMutations.ts`.
- Two findings for whoever next fights the budget:
  - **A lazy module that imports a main-entry file directly (not through its barrel) knocks that file out of webpack's module concatenation, and it grows.** This happened to `memory/epistemic.ts` and `talk/rules.ts` here. It cost ~1.3 KB for a single `@engine/validate/checkpoints` import. `p06_concat.py`-style stats diffs (top-level modules in the initial chunk, master vs branch) show it.
  - babel-loader emits helpers **per file** (no transform-runtime). A new file, or one without a prior object spread, gets `_objectSpread`/`_defineProperty`/… inlined, which is ~700 B. Plain assignments in `castVoices` avoided it.
- **Deviation**: when a story has authored voices, the render chunk loads on the first `MemoryInjector.update()`, which then re-runs itself. The epistemic pass loads it too. Until it lands, aims are absent. For intents, `applyEpistemic` drops `[intends]` until then; both extraction paths await the load after `beginRun` (before the ownership check).

### Commands (on `49c16a42`, the merge of `fb31e640`)

| Command | Result |
|---|---|
| `npm run typecheck` | 0 |
| `npm run typecheck:test` | 0 |
| `npm run lint` | 0 |
| `npm test` | 360 suites passed, 1 skipped. 4821 tests passed, 1 skipped |
| `npm run test:debug` | 454/454 (after a build: `so-run-header.test` reads `dist/manifest.json`) |
| `npm run build` | 0, main 1,199,987 B |
| `npm run build:dev` | 0 |
| `npm run build` | 0 |
| `npm run test:release` | 77 pass, 2 skipped, 0 fail |
| `npm run test:replay` | 25 of 25 killed. `empty-private-block-epistemic` was re-anchored on the new `applyEpistemic` line |
| `npx storybook build -o .sb-static-06 --quiet` → `npx test-storybook --url http://127.0.0.1:6106 --index-json` | 47 suites / 312 tests passed. Server stopped, dir deleted |

Plan-local mutants (scratchpad `p06_mutants.py`, each against its named test): all 10 killed.

| Mutant | Target |
|---|---|
| M1 | affirmation rollback |
| M2 | evidence rule |
| M3 | ownership check |
| M4 | per-turn budget |
| M5 | lapse filter |
| M6 | narrator skips itself |
| M7 | motive only for the drafted member |
| M8 | beat rollback |
| M9 | intent cap |
| M10 | player persona excluded |

### Not green / open

- **K is provisional**: `INTENT_LAPSE_BOUNDARIES = 3 × PROVISIONAL_MEDIAN_BOUNDARIES_PER_SCENE (8) = 24`. The D1 corpus median is still pending (02), so K must be re-set from it. Recipe: `test/measurements/v2.6-06/k-intent-lapse.json`.
- **Live legs not run** (brief: no real-LLM runs, no lanes). They are NOT green:
  - C0–C5 inner-beat spike, including the C1 readiness and C2 cost fan-out arms: `c-inner-beat-spike.json`.
  - B intents quality: `b-intents.json`.
  - A payload / D privacy legs: `a-d-live-legs.json`.
  - All four belong to the final suite (overview rules 13–17).
- The live-suite `intents` tier scorer is not built. The B recipe names its floors, but `so-live-suite.mts` does not score that tier yet.
- The B2 harvest and C beat switches are off by default and have no settings-panel control. Each has to be set in `extensionSettings` until its spike floor passes.
- The wizard prompt text does not mention drive or motives. The plan 11 agent has the tools, but its prompt was not updated (W19 is plan 11's).
- Fault matrix: all 10 `inner|*` cells are declared, and `inner|aborted` stays `todo`.
- The intent wire format is the pipe form `[intends] Name | …`, matching the other epistemic tags.

### Addendum 2026-09-30: settings, wizard prompt, `inner|aborted`

Worktree `agent-a1cfad589a9bc715f`, master `bd61f23f` merged, built together with plan 07's UI addendum (same commands and results, recorded there). No lanes, no real-LLM call.

- **Settings controls**: `components/settings/InnerVoiceControls.tsx`, lazy, in the Stagecraft group, **author view only** (like the warden's rows): `#so-inner-harvest` (B2 harvest), `#so-inner-beat` (C inner beat), `#so-inner-fanout` (lead / top2, disabled while the beat is off), `#so-inner-harvest-idle` when harvest is on without knowledge tracking. Both switches stay off by default. Added to `PLAYER_FORBIDDEN_SELECTORS` and the spoiler checklist. Gate: `InnerVoiceControls.stories.tsx` (4 stories, interaction + axe).
- **Wizard prompt**: the agent's rules ask for a drive per cast member (`setRosterDrive`) and per-beat motives (`setCheckpointMotive`), told only to that character; the staged wizard's grammar shows `drive` on roster ops and `motives` on checkpoints, and the EFFECTS/CAST stage asks for them. Gate: `loop.test.ts` "both wizards ask for each character's drive…".
- **Fault matrix**: `inner|aborted` is `covered` — a held inner call under a real `RunOwner` is aborted by a chat switch, rejects, and writes neither beat nor save; control: the same held call unaborted lands (`innerCoordinator.test.ts`). The inner row now has 0 `todo` cells.
- Still open: K from the D1 corpus, the live C/B/A-D legs, the `intents` tier scorer.
