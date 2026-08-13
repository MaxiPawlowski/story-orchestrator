# Plan 04 — Player surface

## Objective

Make the default (player) surface a single narrative view a story's *player* could be handed without spoilers or steering controls, with an honest working/stalled/dead status — and move everything else behind author view. This is D1's visible half: the player experiences the story; only the author inspects the machine.

## Context

- Spec addendum §Personas, §Stall surfacing. Findings U3 U4 U5 U8.
- Current state: Memory tab (player-visible) renders epistemic incl. `hiding from X`, ledger, arcs internals, superseded/folded strikethroughs (`DrawerTabs.tsx:236-320`); DriverPanel appended under every tab when copilot on, its Advance select lists all checkpoints by name (`DrawerTabs.tsx:430`, `DriverPanel.tsx:98`) — only `unmetGates` was author-gated; reconciliationEvents persisted but rendered nowhere; away recap is the only narrative composition (`awayRecap.ts:37`) and fires only after 8h; status strings use checkpoint ids; `/cp` is a positional mini-language exposing debug verbs (`slashCommands.ts`).
- Consumed: plan-03 snapshot (driver/ledger now in-snapshot, easy to gate), plan-02 settings homes, plan-01 J3 spoiler checklist + human rubrics.

## Scope

In: drawer player mode redesign, spoiler audit + gating, stall/dead-pipeline signal, HUD tweak, player-language pass, slash regroup, first-run surfacing.
Non-goals: author-view redesign (only reorganize what moves into it); Studio (plan 05); removing any capability — everything gated, nothing deleted.

## Deliverables

- **Player Overview = the recap composition, always on** (promote `buildAwayRecap`'s shape to the standing view; away popup becomes the same component shown modally after a gap): Now (checkpoint name + objective, narrative voice) · Recently (last transition) · Open threads (arc texts) · Story so far (canon excerpt) · Pending ("N things noted, apply next turn") · Status line. Persona tags: all `player`.
- **Spoiler checklist applied** (the J3 checklist becomes a per-element table in this plan doc, each row `player`/`author`):
  - Author-only: Blackboard/Scheduler/Payload tabs (already), epistemic panel, ledger panel, arc internals (pin/remove/superseded/folded mechanics), boundary numbers, convergence bars (they leak anchor names + distance), DriverPanel entirely (Suggest/Nudge/Probe/Advance/Report are steering — D1), unmet gates, `possible_transitions` surfaces.
  - Player-kept: memory facts curation (pin/edit/exclude — established facts only, no evidence-tier internals beyond the quote tooltip), open-arc *texts*, canon, tension level, flag-moment (plan 01).
- **Stall signal (U5)**: snapshot gains `pipeline: {state: "working" | "reading" | "stalled-rechecking" | "idle" | "not-configured" | "error", detail?}` derived from scheduler + reconciliation events + settings; player renders calm copy ("re-checking recent scenes…"), HUD gets a subtle chip for `stalled-rechecking` / `not-configured` / `error`; author view keeps full reconciliation detail (first render of `reconciliationEvents`).
- **Language pass (U8)**: every player-visible string uses checkpoint *names*, never ids (`Advanced to ${name}`); status strings humanized; transition `/comment` unchanged (already name-based).
- **Slash regroup**: `/cp` keeps full surface but is documented author-only; `extract`/`expand` clearly marked debug in help. New player-safe `/story` (or `/so`) with `recap | threads | flag [note]` — named-arg style via ST's enum providers, outputs the narrative composition. (`/cp memorize` alias dropped in help text, kept functional.)
- **First-run surfacing (U6 residue)**: when `not-configured`, player Overview and HUD deep-link the one missing step (profile pick) — no wizard build, just honest pointing (plan 02 made config global so there is exactly one place).
- Tooling: `so-ui` verbs for pipeline chip + player/author assertion (`assert-player-clean` = runs the spoiler checklist selectors); journeys J3 updated to assert the checklist automatically where DOM-checkable.

Exports: `pipeline` snapshot slice, spoiler checklist (versioned in test-plan.md), `/story` command.

## Build parts

Sequential, harness-green after each; the plan's gate (journeys + human eval) runs once at the end of part 3.

| Part | Scope | Harness gate | Status |
|---|---|---|---|
| 1 — derivation layer | `narrative.ts` (the one composition), `pipeline.ts` (stall/dead signal), snapshot gains `pipeline`+`narrative`, away recap rebuilt on the composition, language pass on manager status strings | typecheck + lint + jest + build | **done** (see part-1 note below) |
| 2 — player surface | `PlayerOverview`, spoiler gating in the drawer (epistemic/ledger/arc internals/convergence/driver/boundary numbers → author view), HUD chip, first-run deep link, tension display toggle, Storybook player+author stories, test-plan spoiler-checklist table | above + Storybook | pending |
| 3 — surfaces & gate | `/story recap\|threads\|flag`, `/cp` help regroup, `so-ui assert-player-clean` + pipeline verbs, J3 checklist automation, live real-LLM journeys + human eval | above + `so-journey` J3/J1/J4 live + human rubric | pending |

### Part 1 note (2026-08-12)

- `src/runtime/narrative.ts` — `buildNarrativeStatus()` composes `where you are / just before this / open threads / the story so far / noted / status`; sections it has nothing to say about are dropped; canon excerpted at 600 chars; `renderNarrativeHtml()` escapes everything and takes an override heading.
- `src/runtime/pipeline.ts` — `derivePipelineStatus(extraction)` → `{state, text, detail, needsSetup}`. Precedence: scheduler error → extraction off → no profile → unresolved reconciliation (`stalled-rechecking`) → in flight (`reading`) → queued (`working`) → `idle`. `text` is player copy (asserted free of machine vocabulary in jest); `detail` is author-grade (raw error).
- Snapshot gains `pipeline` and `narrative`; sources gain `boundaryLog`, `openThreads`, `canon` (last fired transition resolved to names in `snapshot.ts#buildLastTransition`). Manager delegates: `getNarrativeStatus()`.
- Away recap is no longer a second composition: `buildAwayRecap(narrative, gapMs)` renders the standing one under a welcome-back heading.
- Language pass on `RuntimeManager.status`: `Moved into <name>` / `Following <name>` (was `Advanced to <id>` / `Committed boundary <n>`), `Now at <name>`, `Stepped back to <name>`, `Continuing/Started <title>`, `Story tracking paused` (the raw pause message stays in `scheduler.lastError` → `pipeline.detail`).
- Deferred to part 2: the tension display toggle (the composition currently always includes the mood line) and every UI/persona change.

## Implementation notes

- One components rule: player and author views share components where content is identical (canon, arcs list) — author view *adds*, player view never conditionally reveals.
- Convergence: hide entirely from player (progress toward a named future anchor is a spoiler by construction). Tension: level word only, no numbers.
- Copy: calm, diegetic-adjacent, no jargon ("checkpoint" is fine; "boundary"/"extraction"/"scheduler" are not) — the rubric in plan 01 scores this.
- `a11y.js` role rewrite gotcha applies to any new tab/buttons — selectors per gotchas rule.
- Memory curation stays player-visible per addendum; exclude-undo toast pattern kept.

## Validation gate

Harness: baseline + Storybook for new/changed components (player + author mode stories per component). Live journey gates (fresh-start, real LLM): **J3 green including automated spoiler checks**; induced-stall segment shows the player signal and clears; J1 regression (not-configured state now actionable); J4 regression (recap popup = same component). **Human-eval**: one J3 session scored on the plan-01 rubric by the user, journal + rubric filed in the Gate record — this plan's gate is not green on automation alone (D2).

## Resolved decisions (user, 2026-08-11)

- Player sees the tension **level word only** (no numbers), display-toggleable.

## Delegated decisions

- `/story` vs `/so` command name; exact player copy.

## Unresolved questions

- Should "Author view" toggle require confirmation with a spoiler warning when the chat isn't the author's own story? (Cheap; leaning yes.)

## Build parts (execution order)

| Part | Content | Status |
|---|---|---|
| 1 | Pure composition: `runtime/narrative.ts` (sections + html) and `runtime/pipeline.ts` (derived state), unit-tested; `awayRecap.ts` re-based on the composition | DONE |
| 2 | Snapshot slices (`narrative`, `pipeline`, `lastRollback`) via `snapshotBuilder` + `buildLastTransition`; `getNarrativeStatus()`; player-safe canon (`getCanonProse`) | DONE |
| 3 | `components/drawer/PlayerOverview.tsx` + spoiler gating across `DrawerTabs` (memory internals, arcs/epistemic/ledger, convergence, engine panel, DriverPanel), HUD chip, author-view confirm | DONE |
| 4 | Language pass on status strings; `/story recap\|threads\|flag`; `/cp` help marked author/debug | DONE |
| 5 | Tooling (`so-ui pipeline`, `assert-player-clean`, scenario/journey actions), J3/J4/J6 journey updates, docs + test-plan | DONE |

## Persona table

The per-element `player`/`author` table lives in `test-plan.md` §Spoiler checklist (v2) — it is the
list the automated sweep asserts, so it belongs with the checks rather than in two places.

## Gate record — 2026-08-12 (ACCEPTED)

### What landed

- **One composition, three surfaces.** `runtime/narrative.ts` builds `{title, sections[], text}` —
  *Where you are · Recently · Open threads · The story so far · Noted · Status* — from names, thread
  texts and canon **prose**. The drawer Overview (`components/drawer/PlayerOverview.tsx`), the
  away-recap popup (`awayRecap.ts` now only adds the "Welcome back … (away 3d)" heading) and the new
  `/story recap` all render that one object. `buildAwayRecap(narrative, gapMs)` replaced the second
  composition that existed only for the popup.
- **Pipeline slice (U5).** `runtime/pipeline.ts` derives
  `error > not-configured > stalled-rechecking > reading > working > idle` from scheduler state,
  settings and unresolved reconciliation events, with player copy in `text` and author detail in
  `detail`. Player sees `#so-pipeline-status`; the attention states also render `#so-stall-signal`;
  the HUD gets `#so-hud-pipeline` ("catching up…" / "needs setup" / "not keeping up" / "stepped back").
- **First-run surfacing (U6 residue).** `not-configured` and `error` set `needsSetup`, which shows
  "Open story settings" in the drawer and makes the HUD chip open the settings panel directly
  (`openStorySettings()` in `index.tsx`: ST's Extensions drawer → our inline drawer → scroll into view).
- **Spoiler gating (U3/D1).** Author-only now: epistemic map, state ledger, arc bookkeeping,
  superseded/folded entries and per-entry importance/expiration/recall, last-audit id, memory settings
  toggles, scene count, checkpoint id + boundary + raw pending writes, tension numbers, steering hint,
  convergence, and **the whole DriverPanel** (previously player-visible whenever copilot was on — only
  `unmetGates` had been gated). Player keeps memory curation (pin/edit/exclude with the evidence
  tooltip), Memorize chat, open threads, canon, tension level word, ⚑ flag and Restart.
- **Author view now confirms** before revealing internals (the plan's open question, resolved yes).
- **Language pass (U8).** Status strings speak names: `Moved into <name>` / `Now at <name>` /
  `Stepped back to <name>` / `Continuing <title>` / `Started <title>` / `Story tracking paused`.
  Canon shown to a player is `memory.getCanonProse()`; `getCanon()` still falls back to canon-lite
  (`Anchor cp1: …`, `Gate a -> b`) for prompts, which is exactly the leak the smoke test caught.
- **Rollback notice.** Beyond the plan's deliverables but owned by U5 and blocked at baseline:
  `snapshot.lastRollback` (set on mutation rollback, cleared at the next committed boundary) renders
  `#so-rollback-notice` plus a HUD chip. Closes J6.4.
- **Slash regroup.** New `/story recap | threads | flag [note]` with ST enum values; `/cp` keeps its
  full surface but its help now reads "author tools (spoils the story — players want /story)" with
  `extract`/`expand` marked debug.
- **Tooling.** `so-ui.mts pipeline` and `so-ui.mts assert-player-clean` (walks every player tab
  against the checklist, refuses to run in author view, restores the Overview tab), both also
  available as `ui:` steps to scenarios and journeys.

### Harness

- `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run build` ✓ (pre-existing bundle-size warnings only)
  · `npm run debug:typecheck` ✓
- `npm test` ✓ **54 suites / 1490 tests** (52/1477 before; new `narrative.test.ts`, `pipeline.test.ts`,
  rewritten `awayRecap.test.ts`, extended `slashCommands.test.ts`).
- `npm run test-storybook:ci` ✓ **21 suites / 74 tests** (20/65 before; new `PlayerOverview.stories.tsx`
  with playing / catching-up / not-configured / stepped-back / missing-cast, plus `DrawerTabs`
  PlayerMemory · NotConfigured · CatchingUp and HudStrip CatchingUp · NeedsSetup). Story fixtures
  derive `narrative`/`pipeline` from the real builders instead of hand-writing them.
- `runtimeManager.ts` **690 → 687 lines** (budget 700): net **−3**, rule 3 satisfied. New orchestration
  went into the pure modules and the snapshot builder, not the manager.

### Live — real LLM (gemma4-mtp profile, headed, no `debugResponse`), fresh-start journeys

| Journey | This run | Plan-01 baseline | Verdict |
|---|---|---|---|
| J3 player-session | **8 pass / 0 fail / 0 blocked** / 5 human | 5 pass / 1 fail / 2 blocked | U3, U4, U5, U8 closed |
| J1 first-contact | 6 pass / 1 blocked (`first-run-path`, plan 06) | 4 pass / 1 fail / 2 blocked | no regression; better |
| J4 return-and-adopt | 4 pass | 4 pass | recap = the same component |
| J6 mutation-storm | **4 pass** | 3 pass / 1 blocked | J6.4 closed by the rollback notice |
| J5 group-direction | 5 pass / 1 blocked (`epistemic-present`) | 5 pass / 1 blocked | baseline (see flake note) |

Manual live checks beyond the journeys: induced stall → `#so-stall-signal` + HUD "catching up…" →
real reconcile read (~2 min, no mocks) → signal cleared and the event resolved; profile cleared →
"needs setup" chip + "Open story settings" button, profile restored; `/story recap`, `/story threads`
and `/story flag` through ST's parser (the flag landed in the session journal);
`so-ui assert-player-clean` green on a live player-mode drawer.

### Deviations and findings

1. **Canon leak found by the live smoke test**: the player composition first showed canon-lite
   (`Anchor cp1: …`). Fixed with `MemoryCoordinator.getCanonProse()` — prose or nothing. Prompts keep
   `getCanon()`.
2. **Rollback notice added** (J6.4, finding U5) although the plan's deliverable list only named the
   stall signal; it is the same "tell the player what the machine did" seam and no other plan owns it.
3. **J4 was broken before this plan**: J4.2 still poked the pre-plan-02 blob shape
   (`selectedStoryHash` / `stories[hash]`). Fixed to `selectedStoryId` / `stories[id]` — plan 02 should
   have migrated it (overview rule 8).
4. **J5.4 is flaky in this environment, not regressed**: 3 fails then 3 passes on the *same* build
   across six runs. In the failing runs the first group turn was answered by a non-directed member and
   `talkControlInterceptor` never recorded a decision; a page reload made it green again, and a probe
   wrapped around the interceptor also made it pass. Evidence points at a race between the checkpoint's
   `onEnter` npc_reply generation and the first user turn, in ST's group wrapper — plan-14 territory,
   not plan-04 code. Left as a known flake for plan 07/08 to chase.
5. **Journey cleanup ordering fixed**: `/member-enable` inside the sandbox chat is undone by the
   following `/delchat` (J5 left Ponticius and Luke disabled after a "clean" run). `so-journey` now
   restores members after deleting the chat and reports `disabledMembers` — verified `[]`.

### Not done

- The **human-eval session** (D2): J3.9–J3.13 plus "What would make you stop using this?" are the
  user's to score. The plan's gate says it is not green on automation alone — the automated half is
  green and the checklist is emitted in `.debug/journey-J3.md`, awaiting the user's ~15-message
  session and rubric scores.
