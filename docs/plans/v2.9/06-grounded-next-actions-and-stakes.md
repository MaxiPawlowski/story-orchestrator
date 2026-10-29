# Plan 06 — Grounded next actions and stakes

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md` §06); slices 1–4 built 2026-10-21 on branch `v2.9-06-next-actions` (Gate record below); LT acceptance not run (no GPU).** Implementation
tier **D** (pure anchor ranking, schema, validation, Storybook, no-LLM scenarios). Acceptance **LT** (suggestions run on the
memory model, 3090, authorized window only) + independent rater on the authoring route (opencode `openai/gpt-6.1-sol`) +
owner decision for the two new panel elements (00-overview rule 4).

## What it is

- "What could I do?" stops relying on a prompt sentence for relevance. Code picks the **anchors** each suggestion builds on
  (active goal, open quest step, current or dormant thread, the player's open promise, a pending public check's disclosed
  help, an authored offer), ranks them deterministically, rotates ties with a seeded draw and hands them to the same single
  model call. The model only words the offers.
- Every anchor comes from what the player can already see. Nothing new is decided; nothing is sent; nothing is stored.
- **Stakes preview** (Citizen Sleeper): for a public check still waiting for the attempt, the panel lists the help the author
  disclosed ("Could help: a rope, a friend's hand"). Never dice, target, faces, or whether a help would change the outcome.
- **Unavailable options** (CK3 `show_as_unavailable`): optional, authored offers only. An offer whose visible gate holds and
  whose `needs` gate fails is shown greyed with the authored reason. Never derived from transitions, so no route is exposed.
- Works today on goals, quests, arcs and promises. When v2.9 05 lands, eligible **pending** hints from 05's named public
  projection become `pattern` anchors (top weight); a sifter match is never required. Existing memory arcs keep the names
  `thread`/`dormant-thread`.
- Every anchor text, model-free or prompted, passes the resting-audience held-secret content filter, the withheld-name filter
  and the unknown-entity filter before it is prompted, rendered or counted (sol cross-plan P1).

## History and evidence

- Triage: `01-triage-sol.md` §06 (spec), N12 (PLAN 06, P5), N14 (FOLD 06, authored visible prerequisites only), N25 (FOLD 06,
  "a visible quality alone does not make a hidden check or modifier condition public"), audit A09 (suggestions promise
  relevance without structured evidence; "improve current surface before inventing another what-next panel"), build order 4
  (05 → 06).
- Research: `docs/plans/v2.8/extension-research-2026-10-21/niches.md` §8 Loose Ends (score candidates by goals advanced,
  random tie rotation, dormant-thread resurfacing, faded promoted goals), §9 (b) greyed options, §17 Citizen Sleeper (stakes
  preview: "which visible modifiers would help … without the dice"), Top 10 items 3 and 8.
- Disagreements, sol followed:
  - Loose Ends scores *actions*; SO has no action vocabulary, so 06 scores *anchors* and the model writes the action. Sol's
    "model words the offers" says the same.
  - §17 proposes "spoiler rule = modifier hidden if its quality is not shown", i.e. auto-disclose modifiers on public
    qualities. Sol (N25) requires an explicit disclosure field; 06 adds `hint` and shows nothing without it.
  - §8 rates effort S "once §7 exists"; sol requires 06 to work before 05 (existing goals), so 06 carries its own anchor
    sources and is M.
  - §8 promotes partial matches past 33% to faded suggested goals; out here (05's job, and an unplanned surface).
- Prior surface: v2.7 33 W4 built the panel (`docs/plans/v2.7/33-player-loop-fixes.md`); v2.8 04 owns presence panels (owner
  decided the nine panels 2026-10-03, `docs/plans/v2.8/00-overview.md:20`).

## Current state in code

Verified on `6861d989`.

- **Grounding is one prompt rule.** `SUGGESTION_RULES` (`src/runtime/suggestions.ts:9-15`): "at least one should engage the
  current goal or an open thread" (`:13`). Count 4, min 3, 200 chars, 400 tokens (`:4-7`).
- **Parser checks form, not relevance.** `parseSuggestions` (`suggestions.ts:40-55`) strips bullets, drops preambles,
  over-long lines, slash commands, unseen withheld names, the player's last line and duplicates. No anchor, no evidence.
- **One call, lazy.** `askSuggestions` (`src/runtime/suggestionsHost.ts:57-71`): `beginRun` + `RunGuard`, one `askText` on role
  `read`, pass `suggestions`; owns-check after the await (`:67`); withheld filter (`:69`). Fill refuses on chat change, box
  change or lapsed window (`:73-79`, `suggestions.ts:61-65`). Host and panel load lazily (`src/presenceUi.tsx:30-31`, `:144`).
- **Projection.** `projectionFor` routes every narrative line through `restingText` (`suggestionsHost.ts:38-55`).
  `playedProjection` keeps sections `now, about, recently, consequences, threads, quests, chapters, story, end`
  (`src/runtime/playerProjection.ts:8`, `:93-108`). `withheldNames` = unreached checkpoint names, all quest titles, unknown
  codex names, unrevealed secret labels (`playerProjection.ts:80-91`).
- **What the projection lacks:**
  - Quests are titles only (`visibleQuestTitles`, `src/engine/quests.ts:66-67`; `src/runtime/snapshotBuilder.ts:317-321`);
    open visible step texts (`stepStatus`, `quests.ts:21-25`) never reach the prompt.
  - Threads are *current* only: open arcs since checkpoint entry or a recent window (`src/runtime/recapCurrent.ts:19-22`,
    `snapshotBuilder.ts:274-279`). Older open arcs (dormant) are never offered. `ArcEntry` has `openedAt`/`resolvedAt`, no
    last-touched (`src/memory/types.ts:36-50`).
  - Promises are not in the projection. Two readers exist: `openPromiseRefs` (`src/memory/promises/state.ts:49-50`) keeps
    open non-quest rows **including conditional ones**; `playerPromises` (`state.ts:67-72`) excludes conditional rows and is
    the player projection, built by `promisesSlice` (`src/runtime/promiseSnapshot.ts:16-24`, gated on
    `memory.settings.promises !== false`, the Promises remembered switch, `src/features/promiseFeatures.ts:12-13`) into
    `snapshot.promises` (`src/runtime/snapshotBuilder.ts:479`). Neither applies the resting filter or `knownEntities` to the
    quote or promisee; a quest-bound row carries a quest title, which `withheldNames` lists.
- **Filters available.** `restingText` = `withoutSecrets(text, secrets, null)` over the resting audience
  (`src/runtime/memoryInjector.ts:306-309`), the same held-secret content test as `keptFrom` (`src/memory/heldSecrets.ts:50-54`).
  `withheldNames` and `knownEntities` (`src/engine/codex.ts:97`) are name/entity checks only; they do not catch a secret
  restated with known names. `withheldNames` depends on the visited path and current values (`playerProjection.ts:80-91`), so it
  is a runtime test, not an authoring-time one.
- **Game-layer detection is a closed list.** `usesGameLayer` (`src/engine/validate/gameLayer.ts:25-33`) recognises `checks` /
  `check` but no `offers`; a new checkpoint field outside the list loads no game-layer chunk.
  - Authored player lines already exist on clues and pins (`action`, `src/engine/gameSchema.ts:168`, `:184`) and widget
    intents (`:212`); unused by suggestions.
- **Checks.** `CheckModifier {q, v, add, label?}` (`gameSchema.ts:104-109`); `StoryCheck` (`:116-126`); `narrate` defaults
  `hidden` (`src/engine/validate/checks.ts:91`). Dice are seeded per visit (`checkUnits`, `src/runtime/storyCheckDraws.ts:34-35`),
  so faces are fixed before the attempt and modifiers read at the attempt turn (`src/engine/storyChecks.ts:37-46`). Record
  labels fall back to the quality's display label or "A bonus"/"A penalty" (`storyCheckDraws.ts:58`). A widget `check` action
  already shows a pending public transition check as "Climb: d20 vs 12" (`src/runtime/widgets.ts:214-219`). No player surface
  lists what would help.
- **Toggles and registry.** Story toggle `suggestions` (`src/engine/schema.ts:539`), presence toggle
  (`src/runtime/displayToggles.ts:4`, `:35`); feature `suggestions`, status shipped, needs memory profile
  (`src/features/presenceFeatures.ts:64-71`). Guide topics `quests` and `checks` (`docs/authoring/story-guide.md:499`, `:511`).
  Check edits go through `setCheckpointChecks`/`setTransitionCheck` (`src/studio/gameMutations.ts:70-76`) and the game agent
  ops (`src/copilot/agent/gameOps.ts:25-26`), both validating with `readCheck`; Studio editor `src/studio/components/ChecksEditor.tsx`.

## Options

| Option | Design | Cost | Risk |
|---|---|---|---|
| A. Prompt only | add quest steps, dormant arcs, promises to the projection; keep the one rule | S | relevance still unverifiable (A09 unchanged); dormant threads crowd the prompt |
| B. Anchored seeds (recommended) | pure ranker picks ≤3 anchors; prompt asks one tagged line per anchor plus one free line; parser maps tags back and checks term overlap | M | model may ignore an anchor (measured); +prompt tokens |
| C. Authored suggestion lists only | stories author every option; no model | M per story | dead in unauthored stories; turns suggestions into a menu (agency) |
| D. Second model pass to verify relevance | judge each line against anchors | M | violates "no additional model call per request"; latency |
| E. Stakes from public qualities | auto-list modifiers whose quality has `display.public` | S | sol N25 forbids: a public quality does not make a modifier condition public |

## Recommendation

Option B, plus explicit `hint` disclosure for stakes, plus optional authored offers. Four slices, each gated alone.

### Slice 1 — anchors from existing state (no schema change)

- New pure module `src/runtime/suggestionAnchors.ts` (lazy, imported only by `suggestionsHost.ts`).
- `SuggestionAnchor { id, kind, text, weight, evidence }`; `kind` ∈ `objective | quest-step | quest | thread | dormant-thread |
  promise | clue-action | check-help | offer | pattern` (last two: slices 3 and 4).
- One filter pipeline for every anchor kind, authored or extracted: resting-audience content filter (`restingText`, held
  secrets), then drop on an unseen withheld name (`unseenWithheld`), then drop on a name `knownEntities` marks unknown. Run at
  anchor build and again on every model-free rendered line (help line, greyed reason, verbatim offer) at render, since a
  secret can be introduced after the panel opened. Authored or player-own origin alone never proves eligibility.
- Sources:
  - `objective`: active checkpoint `player_text` when the projection shows it (not in open phase).
  - `quest-step`: first open visible step of each active quest (`stepStatus === "open"`); `quest`: active quest title when it
    has no open visible step; offered quests at lower weight (the board already shows them).
  - `thread`: current open arcs (what Open threads shows). `dormant-thread`: open, not excluded, not folded arcs opened before
    the current window.
  - `promise`: rows of the existing player projection `snapshot.promises` (`promisesSlice` → `playerPromises`, conditional
    rows excluded), present only when the effective Promises remembered setting is on ("your promise to X: '…'"). Quote and
    promisee both go through the pipeline above; a row failing either is dropped, never trimmed. Never `openPromiseRefs`.
  - `clue-action`: `action` of a clue or pin that is currently shown.
- Ranking (deterministic, table in code, test-pinned): objective 3, quest-step 3, pattern 3 (slice 4), promise 2,
  thread 2, check-help 2, offer 2, quest 1.5, dormant-thread 1, clue-action 1. **Resurfacing:** a dormant thread gets +1.5
  when any quest, step or arc closed within the last 4 boundaries (Loose Ends "after a subplot closes"). Ties rotate by
  `unitDraw([chat, story, boundary, "suggest:" + anchorId, again])`, `again` = Other ideas presses since the panel opened
  (UI-local, never stored). Never `Math.random`.
- Select ≤3 anchors, at most one per kind except `quest-step`, at most one dormant. Fewer anchors → more free lines.
- Prompt (`buildSuggestionPrompt`): same rules plus "Build on these things the player already knows:" `[1] …` `[2] …`;
  ask for `SUGGESTION_COUNT` lines, lines for numbered ideas start with their tag. Anchor block cap 600 characters (design
  limit, not a floor). `SUGGESTION_RULES` keep "never state how it turns out".
- Parser: strip `[n]`, keep `anchorId` on the line; a tagged line counts as **grounded** only when it shares a content term
  with its anchor (`src/utils/termPresent.ts`), else it stays as an ungrounded line. Panel API changes from `string[]` to
  `{ text, anchorId? }[]`; fill still writes only `text`.
- Unchanged: one model call, role `read`, RunGuard + owns-check, fill refusals, story/presence toggles.
- Author view only: inline level 3 / Activity panel row "suggestions: anchors a,b,c, grounded 2/4". No player change in this
  slice beyond better lines.

### Slice 2 — stakes preview (schema)

- `CheckModifier.hint?: string` (≤60 chars, player words: "a rope") and `StoryCheck.hint_when?: GateNode` (optional, when the
  help list may show). Validation in `validate/checks.ts`: hint only on `narrate: "public"` checks (else refused with reason);
  `hint_when` names declared qualities and does not read what the check writes; hint text naming a name that may be withheld
  is a conservative warning (`check-hint-names-unknown`), not a refusal. Eligibility is enforced at runtime: each hint passes
  the slice 1 pipeline (held-secret content, withheld names, unknown entities) before the help line renders or the
  `check-help` anchor is built; a failing hint is dropped, the others stay.
- Pending = public transition check not yet attempted (`checkAttempted`, same test as `widgets.ts:216-217`), or public
  checkpoint check with `when` not rolled this visit. Hints listed: every `hint` on positive modifiers (owner may add
  negative: "Could make it harder"), in authored order, **independent of current dice and of whether the modifier holds**.
  A modifier whose quality has `display.public` may add "you have it" when it holds; a non-public one never shows its state.
- Surfaces: one line in the panel ("Climb — could help: a rope, a friend's hand"), and a `check-help` anchor so a suggestion
  can try for the help. Never dice, target, faces, totals, or "would succeed".
- Studio: hint field per modifier and `hint_when` in `ChecksEditor`; no new mutation (rides `setCheckpointChecks`/
  `setTransitionCheck`); wizard gets it through `readCheck` in `gameOps`. Guide `checks` topic + compact `guideTopics`
  entry; `copilot/guideCoverage.test.ts`.

### Slice 3 — authored offers with unavailable reasons (owner decision)

- `Checkpoint.offers?: [{ id, text, visible_when?, needs?: { when: GateNode, reason: string } }]`, ≤8 per checkpoint. `text`
  is the player's line (like a clue `action`); `reason` is player copy ("You need a lantern first").
- Shown only while the checkpoint is active and `visible_when` holds; available → `offer` anchor (and listed as-is if the
  model drops it, owner choice); `needs` failing → greyed row with reason, not fillable. Never generated from transitions,
  gates or checkpoint names; never derived from hidden routes; the unavailable reason is always authored.
- Validation is static only: reference and type checks (`visible_when`/`needs.when` name declared qualities, ids unique, caps)
  and refusal of `needs` reading a code key that names a hidden outcome (check quality, latch). Offer text or reason naming
  a checkpoint, quest or codex name that may be withheld is a conservative disclosure warning (`offer-names-unknown`), not a
  refusal, because `visible_when` can disclose it later and `withheldNames` needs a visited path and current values.
- Runtime offer projection (lazy, in `suggestionAnchors.ts`): on the current path and values, drop any offer whose text or
  reason fails the slice 1 pipeline before it is rendered, counted (floors, author row) or prompted. Same offer tested before
  and after its `visible_when`/disclosure gates.
- Load: add `listed(json.checkpoints, "offers")` to `usesGameLayer` (`gameLayer.ts:25-33`), parse and copy `offers` into the
  normalized checkpoint, so an offers-only story loads its chunk and panel rows (sol cross-plan P1). Fixture: story with
  offers and no quests, codex, checks or widgets.
- Typed mutation `setCheckpointOffers` in `studio/mutations.ts` + wizard tool (or a stated reason in
  `MUTATIONS_WITHOUT_A_TOOL`), Studio editor under Flow → checkpoint, guide topic `offers`, `storyDiff` treats offers as
  presentation (compatible). Story update: 06 persists nothing (no extras slice, no compiled key), so the played story swap
  needs no extras reconciliation; the next panel open reads the new offers. Test update → rollback → reopen shows only the
  edited offers.

### Slice 4 — v2.9 05 pattern anchors

- Interface: 05 `## Public projection (consumed by v2.9 06)`, rows of pattern id, pattern revision, phase
  (`pending` | `completed`), authored text, evidence refs.
- Eligible: `phase === "pending"` rows only → `pattern` anchors (weight 3, id = pattern id + revision, evidence = 05's refs).
  Completed callbacks are not unresolved goals and never become anchors unless the author separately declares that goal.
- Authored hint text passes the slice 1 pipeline (held-secret content, withheld names, unknown entities); a row failing it is
  dropped. Read-only; 06 adds no pattern code and no second event store. Absent 05 or its chunk → slices 1–3 unchanged.

### Registry, settings, chunk

- Registry: update `suggestions` `what` (anchors, help line, greyed offers); no new feature id; no new setting (the existing
  `display.presence.suggestions` and story toggle cover it, on by default). `npm run docs:guide`, `docs:settings`.
- The `promise` anchor reads the effective Promises remembered state already resolved for `snapshot.promises`, never settings
  again. If the owner adds a control (help line, greyed offers), it registers in `FEATURE_POLICY_FIELDS`/`FEATURE_CONTROLS`
  with chat overrides in `extras.overrides` (install master → authored default → chat), never `extras.ui`, and extends 09's
  state mapping and parity fixtures.
- All new code lazy (`suggestionAnchors.ts` behind `suggestionsHost`; validation inside the game-layer chunk). Main budget
  1,300,000 B unchanged.

## Predeclared floors

Sol's, frozen before inference; informational, never retuned.

- 40 frozen stuck-player situations (synthetic public stories, English; mix of quests, dormant arcs, promises, pending public
  checks with hints, offers, and none of these):
  - ≥3 usable suggestions in ≥90% (≥36/40).
  - ≥1 evidence-grounded goal/thread offer in ≥85% (≥34/40). Grounded = tagged to an anchor, passes the term check, and the
    independent rater agrees it engages that anchor.
  - 0 hidden-prerequisite or predetermined-outcome leaks (0/40, plus the adversarial set below; any leak counts).
  - Blind usefulness ≥ +0.5 on a 1–5 scale over current suggestions, paired on the same 40 situations, rater blind to arm.
  - No additional model call per request: exactly 1 suggestions call per ask in every row (model-call ring).
- Report denominators, abstentions (rows with <3 usable), and anchors offered vs used.

## Gates by tier

- **D (per slice):** `npm run gates:quick` until green, then `npm run gates` (Storybook included).
  - Jest: ranker table, resurfacing, seeded rotation (same inputs → same order; `again` rotates), one-per-kind, withheld and
    resting filtering of every anchor kind, parser tag mapping and grounding check, `typecheck:test`.
  - Property: stakes list identical across all dice faces and all modifier truth values of non-public qualities; hidden
    check → empty list; `rollback ≡ replay` trivially (nothing stored) asserted on the anchor function.
  - Validation fixtures: hint on hidden check refused; offer naming a not-yet-reached checkpoint warns (not refused);
    `needs` on a check latch refused.
  - Privacy fixtures: conditional promise never an anchor (negative); promise quote restating a held secret dropped; hint,
    offer, quest-step and pattern text restating a held secret with no unknown proper noun dropped; secret introduced after
    the panel opened drops the rendered line at render; same offer before/after its visibility and disclosure gates; pending
    vs completed 05 rows (only pending anchored).
  - Feature-only fixture: offers-only story loads the game-layer chunk and shows offer rows.
  - Storybook: `SuggestionsPanel` with grounded lines, help line, greyed offer; phone width.
  - Architecture guards unchanged (no manager getters in components; panel reads the outcome).
- **D live (no-LLM):** `npm run build && npm run stage`, lane reload, `so-scenario` with `debugResponse` mock (plumbing only)
  asserting anchor block in the sent prompt and panel rendering; never sign-off.
- **LT acceptance:** real memory model, thinking and inner voice on, authorized 3090 window, lane from `adolion-fresh` only if
  campaign stories are used (default: synthetic stories). 40 situations × 2 arms (current, anchored). Rater on the authoring
  route: opencode `openai/gpt-6.1-sol` by default, DeepSeek only as fallback when Sol cannot answer (recorded per row).
  Evidence to `so-sessions`. If the backend cannot run: gate NOT green, say so. This plan authorizes no model time, GPU window
  or pod by itself.
- Owner decision recorded for the help line and greyed offers before they ship to the player surface.

## Privacy and spoiler notes

- Anchors read only player-visible state: visible quests and open visible steps, arcs through `restingText` and
  `withoutExcludedThreads`, the player promise projection (`snapshot.promises`, conditional excluded), shown clues/pins,
  disclosed hints, 05 pending rows. Every text, authored or extracted, passes the resting-audience held-secret content filter
  plus withheld-name and unknown-entity filters before the prompt, and the parser filters again after; model-free lines are
  filtered again at render. Authored origin or "the player's own words" alone never makes text public.
- Stakes: no dice, target, faces or outcome; hint list independent of the seeded draw so its presence or order cannot reveal
  it. A non-public quality's truth value is never shown. Authored `hint_when` is an authored disclosure, like a codex latch.
- Offers: authored text only, filtered at runtime on the current path (names and held secrets) before rendering, counting or
  prompting; validation only warns; greying never derives from a transition, so no hidden route.
- Player surface identical with and without a held secret (existing invariant); suggestions write nothing.
- Public repo: synthetic fixtures only; campaign adoption reported as counts.

## Invariants touched

- **One snapshot, one subscription:** anchors computed in the lazy host from the same snapshot and engine state
  `projectionFor` reads; the panel never calls manager getters.
- **Every async writer takes a RunOwnership:** unchanged; anchors computed before the await, owns-check after; fill refusals
  unchanged. No new write.
- **Chance is seeded, never Math.random:** tie rotation uses `unitDraw` over chat, story, boundary, anchor id.
- **Disclosure is not knowledge / knownEntities:** anchors and hints never name an unknown entity; disclosure here writes no
  epistemic row.
- **Held secret never reaches a kept-out member … player surfaces identical:** resting filter on every anchor.
- **Agency policy:** offers are offers; nothing narrated or sent; fill never replaces typed text.
- **Main bundle budget, lazy chunks:** new code lazy.
- **Every authorable field has a guide topic:** `hint`, `hint_when`, `offers`.
- **Wizard writes only through tools / mutations.ts test:** offers mutation gets a tool or a stated reason.
- Boundary order, rollback detectors: untouched (no compiled code key, no state).

## Dependencies and links

- v2.9 05 (`05-evidenced-story-threads.md`): slice 4 only; interface = its `## Public projection (consumed by v2.9 06)`
  (pattern id/revision, pending/completed phase, authored text, evidence refs). 06 consumes pending rows as `pattern` anchors.
- v2.9 09: suggestions state mapping and parity fixtures extend if 06 ever adds a control.
- v2.8 18 (`18-quests-and-game-layer.md`): quests, checks, visible rolls; G02 margin wording stays there.
- v2.8 52 (`52-people-places-codex.md`): `knownEntities`, unknown codex names.
- v2.8 04 (`04-story-presence-panels.md`), v2.7 33 W4: the panel.
- v2.8 47 (`47-promises-remembered.md`) for the `promise` anchor; off with its feature.

## Decisions for the owner

1. Approve the explicit check-help field (`modifiers[].hint`, `hint_when`) and the help line in the panel (rule 4).
2. Unavailable options: approve authored `offers` with greyed reasons inside the existing panel, or drop slice 3.
3. Show the anchor ("for: The cartographer's map") under a suggestion for players, or author view only (default: author only).
4. Include negative modifiers ("could make it harder") in the stakes line?
5. Rater route for blind usefulness: Sol on opencode (default), DeepSeek fallback only; independent of the memory model that
   writes suggestions.
6. Campaign adoption of hints/offers after measurement (counts only; content review by another model).

## Unresolved questions

- Should offered (not yet accepted) quests be anchors at all, or only active ones?
- Dormant window: arcs opened before checkpoint entry, or a fixed boundary age? Ranker constants frozen before the LT run either way.
- When the model drops an available authored offer, list it verbatim as a fifth line or let it go?
- Should the help line also appear on the widget check action button, or only in the panel?

## Review 2026-10-21 (sol)

Source: `10-review-sol.md` §06 and cross-plan findings naming 06. Code re-verified on `6861d989`. Floors unchanged.

- P1, promise source: applied. Slice 1 `promise` reads `snapshot.promises` (`promisesSlice` → `playerPromises`, conditional
  excluded, `state.ts:67-72`, `promiseSnapshot.ts:16-24`) under the effective Promises remembered state; quote and promisee
  filtered (held secrets, withheld names, unknown entities). Current-state claim corrected. Conditional-promise negative and
  secret-bearing quote fixtures added.
- P2, static offer validation: applied. Validation is reference/type checks plus conservative `offer-names-unknown` /
  `check-hint-names-unknown` warnings; runtime offer projection enforces names and held secrets before render, count or
  prompt. Before/after-gate fixture added. Reasons stay authored; no offer from hidden routes.
- P1 cross-plan, held-secret content filter: applied. One pipeline (resting `restingText`, `memoryInjector.ts:306-309`, then
  withheld names, then `knownEntities`) on every anchor kind, and again at render for model-free lines. Authored-placement
  safety claims removed from Privacy. Fixtures: secret with no unknown proper noun, secret introduced after panel open.
- P1 cross-plan, 05/06 projection: applied. Slice 4 retitled "pattern anchors"; kind `story-thread` → `pattern`; consumes
  only `pending` rows of 05 `## Public projection (consumed by v2.9 06)` (pattern id/revision, phase, authored text,
  evidence refs); completed callbacks are not goals. Arcs keep `thread`/`dormant-thread`. Partials question removed. 05's
  section was not on disk when this was written; referenced by name.
- P1 cross-plan, new-only stories: applied. `offers` added to `usesGameLayer` (`gameLayer.ts:25-33`), parsing and normalized
  copy; offers-only fixture.
- P1 cross-plan, settings via `FEATURE_POLICY_FIELDS`: applied as a rule; 06 adds no control. Any later control goes through
  `FEATURE_POLICY_FIELDS`/`extras.overrides` and extends 09's mapping.
- P1 cross-plan, story-update extras: applied as a statement: 06 persists nothing, so no extras reconciliation; update →
  rollback → reopen test added.
- P2 cross-plan, model routing: applied. Rater Sol default, DeepSeek fallback only; no model time, GPU or pod authorized.

## Gate record 2026-10-21 (v2.9 build, branch v2.9-06-next-actions)

Worktree `C:/dev/so-v29-06-next-actions` off master `65aebaa0`. Owner decisions applied (00-overview §Owner decisions 2026-10-21):
check-help field + help line, authored greyed offers, anchors author-view only, no negative-modifier lines.

Built:
- Slice 1, anchors: `src/runtime/suggestionAnchors.ts` (pure, lazy, imported only by `suggestionsHost.ts`). Kinds objective,
  quest-step, quest, thread, dormant-thread, promise (`snapshot.promises`, conditional excluded), clue-action (shown player clue/pin
  actions from `snapshot.game`), check-help, offer, pattern. Weight table and resurfacing (+1.5 when an arc resolved or a quest/step
  closed within 4 boundaries, against the boundary log's `before` values) test-pinned; ties rotate by `unitDraw([chat, story,
  boundary, "suggest:"+id, again])`, `again` = Other ideas presses (panel-local). ≤3 anchors, one per kind except quest-step,
  600-char block. One screen (`makeScreen`): resting held-secret filter (`restingText`, changed text = dropped), unseen withheld
  names, `knownEntities`-unknown names; run on every anchor, on every model line after the answer, and again at render on model-free
  lines (`SuggestionSide.shows`, memoized on the cached snapshot). Prompt adds the numbered block only when anchors exist (no-anchor
  prompt unchanged). Parser `parseSuggestionLines`: `[n]` tag kept as `anchorId` only when the line shares a content term with the
  anchor (`termPresent`, prefix). Panel API `{text, anchorId?, authored?}[]`; fill writes only `text`. One `askText` per ask,
  role `read`, RunGuard + owns-check unchanged. Author view: "for: …" under grounded lines and a row "Suggestions: anchors …,
  grounded n/m" in the panel (not an inline-timeline/Activity row: nothing is stored, so the row lives in the panel).
- Slice 2, stakes: `CheckModifier.hint` (≤60), `StoryCheck.hint_when` (`gameSchema.ts`); `validate/checks.ts` refuses either on a
  hidden check; `checkRefs.ts` checks `hint_when` keys like `when` (declared, not what the check writes). Help line for a waiting
  public transition check (`checkAttempted`) or a public checkpoint check with `when` not rolled this visit; positive modifiers only,
  authored order, independent of dice and modifier truth; "(you have it)" only for a holding modifier on a `display` quality.
  Diagnostic `check-hint-names-unknown` (warning). Studio: ChecksEditor hint text; wizard via `readCheck` (tool doc updated).
- Slice 3, offers: `engine/offerSchema.ts` (`Checkpoint.offers` by augmentation, schema.ts untouched), `validate/offers.ts` in the
  game-layer chunk (`readOffers`/`addOffers`/`checkOffers`: slug ids unique, ≤8, text ≤200, reason ≤120, no macro/slash, gate keys
  declared, `needs` refused on check-written/rolled keys and code latches except quest closed/rewarded). `usesGameLayer` lists
  `checkpoints[].offers`. Runtime `offerRows`: active checkpoint, `visible_when` holds; failing `needs` → greyed row with reason;
  available offers become `offer` anchors and a selected one the model drops is listed verbatim (`authored`). Diagnostic
  `offer-names-unknown` (warning). Typed mutation `setCheckpointOffers` (`studio/gameMutations.ts`) + wizard tool
  `setCheckpointOffers` (gameOps); Studio JSON field under Flow → checkpoint (`data-so="offers-editor"`). storyDiff: offers ride
  `checkpoint-changed` (compatible); nothing persisted.
- Slice 4, pattern anchors: `snapshot.patterns` rows with `phase === "pending"` only (weight 3, id `pattern:<id>@<rev>`, evidence from
  05's refs); completed rows never anchor. 05's contract unchanged.
- Docs: guide `checks` (hint, hint_when, `check-hint-names-unknown`) and new topic `offers`; compact `guideTopicsOffers.ts`;
  `guideTabs` game tab; `guideTopicGroups.json`; `npm run docs:guide`, `npm run docs:settings`. Registry `suggestions` `what` updated;
  no new feature id, setting or control (so no FEATURE_STATE / plan 24 row).
- Tests: `runtime/suggestionAnchors.test.ts` (25: ranker table, resurfacing, rotation + no Math.random, one-per-kind, prompt, tag
  grounding, screen on every kind incl. secret with no unknown noun, conditional promise negative, pending vs completed 05 rows,
  stakes identical across faces and non-public truth values, hidden check empty, hint_when, checkpoint-check pending, validation
  fixtures, offers before/after disclosure, needs on check result refused, offers-only story loads the chunk, wizard tool, update →
  rollback → reopen), `suggestionsHost.test.ts` (+3: anchors in the one call, author-only side, side on failure, secret after open
  drops the line at render), `diagnostics.test.ts` every-code case, arrival golden re-recorded for the new scenario.
  Storybook `SuggestionsPanel`: help line + greyed offer, secret-after-open, grounded author view, 390 px.
- Scenario `test/scenarios/v29-06-anchored-suggestions.json` (no-model, debugResponse plumbing only): schema-checked with
  `validateFixture` (0 problems), every eval parses.

Gates (final tree):
- `npm run gates:quick`: green after fixes (lint max-len, S4 branch budget for `readCheckpoint`/`readGameCall` kept by helpers).
- `npm run gates -- --no-storybook` (full, no `--resume`): `gates: all green in 222.3s` (typecheck, typecheck:test, build,
  debug:typecheck, test:plugin, test:debug, test:replay, lint, test:release, test 858 suites / 9985 passed + 1 skipped).
  test-storybook:ci SKIPPED in that run (wave 2 port rule), run alone:
- `npm run storybook:build` then test-runner on :6206: `Test Suites: 160 passed, 160 total`, `Tests: 970 passed, 970 total`.
- Main bundle `dist/index.js` 1,297,849 B (master 1,297,590; +259 B: checkpoint offers hook, `usesGameLayer`, validate call,
  presenceUi `again`). Budget 1,300,000 not raised.

NOT run:
- Lane live check (scenario above): NOT run: unmerged branch, no staging (wave 2).
- LT acceptance (40 situations × 2 arms, rater, floors): NOT run: no GPU (owner 2026-10-21). Floors unmeasured.

Decisions taken on open questions: offered quests are not anchors (their titles are withheld names, so the screen would drop them);
dormant = open, unexcluded, unfolded arcs outside `currentThreads`; a dropped selected offer is listed verbatim; help line in the
panel only (not on the widget check button).

### GPU run 2026-10-22

- Window 2026-10-22 ~21:23-23:20 local (00:23-02:20Z), local 3090 via the controller (`cli.mjs automatic`, text loaded clean
  after the earlier `crashed` code-1 status). Lanes 41 (master `a082a064`, served bundle `cb12b358`) and 42 (`v2.9-03-polish`
  `639ae53c`, bundle `33506e23`, staged into the ST code copy `C:/dev/st-v29-08`), both `--allow-local --headed`, images and sprites
  off in the lane copies, profile `Artemis RunPod RP` -> :18888, context 32768, thinking and inner voice on. Group
  `Group: Arin, DM Narrator` (the lane copy also drafts two members outside each story's roster).
- Rater: opencode `openai/gpt-6.1-sol` (`opencode run`, frozen prompt in the evidence folder). Evidence
  `C:\dev\so-lanes\41\debug\v29gpu\`, `C:\dev\so-lanes\42\debug\v29gpu\` (+ each lane's `debug/runs/`), archived to so-sessions.
- Pilots are NOT the predeclared corpora: small N, fixed fixtures, no frozen 40/100 denominators. They say whether the path works
  with the real model and which way a floor leans; no floor below is claimed met.
- Two model lanes shared one GPU: memory-model calls queued behind the other lane's replies (inner beat timeouts at 35 s,
  suggestions at 50 s, below). Environment, not a product change; recorded.
- Pilot `test/scenarios/v29-06-model-pilot.json` (the 06 fixture without its debugResponse; first run aborted by a wiped
  lane config, see below), 2 runs, 4 asks on the real read-role model: 2 answered, 2 timed out ("the memory model did not
  answer within 50.6 s", queued behind lane 42's replies). Answered first ask: 5 lines, the selected offer verbatim, help line
  `Climb — could help: a rope`, greyed cellar offer with its reason. Answered Other ideas: author row `anchors objective, offer,
  check-help, grounded 3/4`.
- LT acceptance (40 situations x 2 arms, rater): NOT run (> 1 h). Floors unmeasured.
- Harness note: the master fixture's `ext_setting` step replaces the whole install settings object for the run (fine for the
  no-model lane it targets); on a model lane it removes the memory profile mid-run. A run killed before its `finally` keeps the
  wipe (happened once here; lane 41 settings restored from the owner's install copy before the remaining runs).

### GPU run 2026-10-23

- Window 2026-10-23 ~05:40-09:00Z, local 3090 through the controller (`cli.mjs automatic`), ONE model lane at a time: lane 42
  on branch `v2.9-gpu2-fixes` (base master `1b2beb9e`, fixes `137a359b`, served bundle `c28c0dcf`, staged into the ST code copy
  `C:/dev/st-v29-08`), `--allow-local --headed`, images and sprites off, profile `Artemis RunPod RP` -> :18888, context 32768,
  thinking and inner voice on, group `Group: Arin, DM Narrator` (members Luke, Ponticius, Arin, DM Narrator). Lane 41 (master
  `45e4a83b` bundle) served the diagnosis runs before the fix. Rater opencode `openai/gpt-6.1-sol` (frozen prompts in each
  `rate/` folder). Evidence `C:\dev\so-lanes\41\debug\v29gpu2\`, `C:\dev\so-lanes\42\debug\v29gpu2\` (+ each lane's
  `debug/runs/`), archived to so-sessions.
- Pilot `v29-06-model-pilot.json` x3 on one model lane (lane 42): **12 of 12 asks answered**, 0 timeouts (2026-10-22 on two
  lanes: 2 of 4, 50.6 s timeouts), 12/12 with at least 3 usable lines, author row grounded 2/4 or 3/4 on every Other ideas
  (3/4, 3/4, 3/4; 2/4, 3/4, 2/4; 2/4, 2/4, 2/4). Answered in about 4-8 s each. The round-1 timeouts were GPU sharing.
- Fixture fix `137a359b`: `ext_setting` takes a key path and restores only that leaf (its old value or its absence) and any
  container the write created (`scripts/debug/lib/interopVerbs.mts`, tests in `interopVerbs.test.mts`);
  `v29-06-anchored-suggestions.json` now writes only `settings.image.enabled` and `settings.sprites.enabled`. Same whole-object
  pattern still in seven v2.8 fixtures (`v28-35-*`, `v28-40-*`, `v28-61b-*`), left as they are (no-model lanes).
- LT acceptance (40 synthetic stuck-player situations x 2 arms): NOT run; the 40 situations need 40 authored stories (quests,
  arcs, promises, hinted checks, offers), more than 2 h to write before inference.

### LT freeze 2026-10-23 (before the first inference)

- Corpus frozen as committed in `ddad561a` / `9ddddfbd`, unedited since. Hashes (LF-normalised, as `frozen.json` records them):
  `situations.json` `0fcb41347ba8bb57ce905e82dea4f5536a83163c3546d8b308effe8060041947` (= `corpus.sha256`), `frozen.json`
  `d27f360f75f8c40fddbc20ca62676a97b2301d3657d464c05272540a776d46f8`; all 80 scenario files match `corpus.scenarios.sha256`
  (0 mismatches). `frozen.json` `status` still reads DRAFT; this record is the freeze (its own text allows the Gate record).
  Floors, scoring and rater prompts are the ones in that file; never retuned.
