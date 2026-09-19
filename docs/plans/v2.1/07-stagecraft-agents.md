# Plan 07 — Stagecraft agents

## Objective

Take the audit/control role D1 removed from the player and give it to the system: deterministic presentation effects where rules suffice, background curator agents where judgment is needed (World Info, scenario, background, cast — the user's stated direction). v2.1 ships the **design doc + one deterministic effect + one agentic slice**; the full fleet is design intent for v2.2.

## Context

- Spec addendum §Stagecraft (invariants live there: proposals only, boundary-applied, never write blackboard/memory, journaled, author-reviewable, per-curator capability flag).
- Existing machinery to reuse: checkpoint effects pipeline (`effectsApplier.ts`), WI seam (`stHost/worldInfo.ts` — enable/disable/upsert + one-save disable path), memory-LLM scheduler lanes P3/P4, capability profile, canon/arcs read models, session journal (plan 01), compatible-update path (plan 05), plan-06 provisioning-op review pattern + lorebook write path.
- External patterns (00-overview §External-base learnings): ST-Copilot proposal-card conventions (inline edit-before-apply, history hygiene) and patch "first words || last words" boundary syntax for small-model-safe partial WI edits; Smart-Memory `continuity.js` for the continuity warden.
- Consumed: plans 01–06 all. Journeys J3/J5 as regression floor; new journey J8 (stagecraft) defined here.

## Scope

In: design doc covering the curator fleet; `background` checkpoint effect (deterministic); WI curator slice (agentic) behind a flag; J8 journey.
Non-goals: scene-setter and cast-manager curators (designed, not built); music/ambience (no verified host seam yet); any curator authority over blackboard, memory tiers, or transitions — ever (invariant, not scope).

## Deliverables

- **`docs/plans/v2.1/stagecraft-design.md`** — the fleet: per curator (WI, scene-setter, cast/npc tuning, recap narrator, **continuity warden** — checks the latest reply against established facts [card, canon, facts tier, ledger] and emits a one-turn corrective note injected next generation and auto-cleared; Smart-Memory continuity/repair pattern, run on the P2 lane at cadence or scene break, never blocking) — inputs (canon, open arcs, active checkpoint, roster state), outputs (typed proposals), trigger (scene break / checkpoint activation / cadence), lane (P2–P4), veto rules, author-review surface, failure mode (silent no-op, never blocks play). Explicit "deterministic first" test per candidate: if a checkpoint effect can express it, it is not an agent.
- **Deterministic: `background` effect** — `effects.background?: { name }` in schema/validate/Studio EffectsEditor/copilot ops; applied at boundary via verified ST seam (verify `/bg` slash or background API in ST source per the non-negotiable rule; add `stHost/backgrounds.ts`); idempotent, hydrate-safe, rollback re-applies restored checkpoint's background (existing effect discipline).
- **Agentic slice: WI curator** — off-path P4 pass on scene break/checkpoint activation (coalesced): reads canon + open arcs + active checkpoint + current story-lorebook entries; proposes `{enable[], disable[], rewrite[{comment, text}], patch[{comment, anchor, replace}]}` (patch uses the "first words || last words" boundary syntax — safer than full rewrites on small models) scoped **only** to an explicit authored allowlist — new story field `stagecraft?: { lorebooks: string[] }` (schema + validate + Studio field; the plan-06 wizard prefills it with the story lorebook it creates); an empty/absent allowlist means the curator has nothing to write, full stop — never user lorebooks, never inference; strict parse, schema-validated; proposals applied at next boundary through the effects pipeline; every proposal + application journaled; author-view review ring reusing the plan-06 proposal-card component (last N proposals, editable before apply, accept-mode setting: `auto | review | off`, default `review`); capability-flagged (default off until J8 proves it).
- Tooling: `so-scenario` verbs for background assertion + curator proposal/apply; debug-response global `storyOrchestratorDebugCuratorResponse` (unit determinism only, per policy); **J8 stagecraft journey**: play across 2 checkpoints — background switches deterministically; WI curator proposes a coherent change from real canon, author reviews/applies, next generation payload reflects it.

Exports: proposal/apply contract + review-ring pattern (v2.2 curators reuse), `stHost/backgrounds.ts`.

## Implementation notes

- Curator is a coordinator (plan-03 pattern, rule 3: nothing new in `runtimeManager.ts`) + a pure `src/stagecraft/` module (prompt, parse, proposal diff) — same pure/host split as extraction.
- Adding `stagecraft.lorebooks` to the format means plan-05's "complete story authorable in Studio" claim must be extended here: this plan ships the Studio field, the wizard prefill (plan 06), and updates plan-05's completeness table + J2 checks (rule 8).
- Prompt discipline mirrors the extractor: closed vocabulary (entry comments it may touch), evidence expectation, low temp, strict parse with the v2 tolerance lessons (channel-noise strip).
- Scheduler pressure rules apply (P4 coalesces; reply path never waits).
- Rollback: curator applications are boundary-logged like other effects; mutation rollback reverts WI to the pre-boundary entry state (reuse WI write-on-change record in `extras.memory.wiWrites` or extend).
- `review` default keeps the author in the loop until trust is earned — J8 + one real human-eval session decide whether `auto` is defensible as default (record verdict in Gate record).

## Validation gate

Harness: baseline (incl. structural guards + v2 corpus) + stagecraft pure-module suites + Storybook (review ring UI); `test-plan.md` updated with J8 + curator rubric (rule 8). Live journey gates (fresh-start, real LLM): **J8 green** — real curator pass over real play, proposal quality human-scored on the plan-01 rubric; J3/J5 regression floor (curator off *and* on); payload capture proves WI change reached the prompt. If the real-LLM curator pass can't run, gate is not green (standing policy).

## Delegated decisions

- Review-ring UI placement (author drawer tab vs Scheduler tab section).
- Proposal cadence caps; rewrite length budget.
- Whether `background` also becomes a curator input (scene-setter, v2.2) — design doc decides.

## Resolved decisions (user, 2026-08-11)

- Curator scope = explicit `stagecraft.lorebooks` allowlist in the story JSON (deliverable above). No inference from requirements/effects.

## Gate record — 2026-08-13 (ACCEPTED, human eval outstanding)

### Verified host facts (appended to `../v2/00-implementation-overview.md` §Verified ST host facts)

| Need | API | Source |
|---|---|---|
| Read the active background | `background_settings` from `/scripts/backgrounds.js` (live `export let` carrying `{name, url}`). The context exposes **no** background API. A chat-**locked** background lives in `chat_metadata.custom_background` as a css `url("backgrounds/<encoded name>")` instead of a name | `backgrounds.js:108`, `:380`, `:1407` |
| Switch the background by name | `/bg <name>` — fuzzy-matches the `.bg_example` thumbnails and clicks one, which updates the global setting or the chat lock. The thumbnails are also the only list of installed backgrounds (`bgfile` attribute) | `slash-commands.js:675`, `:6203`; `backgrounds.js:369`, `:187` |
| Which lorebooks are globally active **right now** | `selected_world_info` from `/scripts/world-info.js`. `world_info.globalSelect` is only a mirror of it, assigned inside a **debounced** save — see finding 1 | `world-info.js:66`, `:5799`, `:83` |

### What landed

- **Design doc**: `stagecraft-design.md` — the fleet (WI curator, scene-setter, cast/npc tuning, recap
  narrator, continuity warden), each with inputs, outputs, trigger, lane, veto rules, author-review
  surface, failure mode, and an explicit **deterministic-first test**. The invariants are restated as
  binding on every future curator, and the contracts this plan exports are named so v2.2 reuses them.
- **Deterministic `background` effect**: `effects.background` (`"file.jpg"` **or** `{name}`,
  normalized at parse like every other authored alias), applied by `EffectsApplier` on activate *and*
  hydrate, idempotent (an authored name already active is a no-op), rollback-safe through the existing
  hydrate path. Host seam `stHost/backgrounds.ts`. Authorable in the Studio's Effects editor with a
  datalist of the installed backgrounds; the copilot's effects stage knows the field.
- **`stagecraft.lorebooks`** in format-2 (schema, validate, `storyDiff` as a *compatible* edit), the
  Studio Story tab (`[data-so="stagecraft"]`), the `setStagecraft` copilot op at parity, and the
  plan-06 wizard now prefills it when it creates a story lorebook — closing that plan's deviation.
- **Pure `src/stagecraft/`**: `types.ts` (op union, accept modes, caps), `prompt.ts` (closed
  vocabulary of entry titles, evidence expectation, "NONE is the expected answer"), `parse.ts` (strict
  line parser, channel-noise strip, cap enforcement, unknown titles dropped), `proposal.ts` (the
  `first words || last words` patch application — a missing anchor **fails** instead of overwriting —
  plus per-op preview and the plan that orders text edits before on/off flips), `scope.ts` (the
  allowlist, and the only place it is derived).
- **`StagecraftCoordinator`**: the P4 pass (coalesced — one per 4 boundaries, never concurrent),
  the review ring, the boundary write, and rollback revert. It holds **no** engine, memory, generation
  or pacing dependency, and `architecture.test.ts` now fails the build if one appears — that is what
  makes "a curator can never move the blackboard or a memory tier" a fact rather than a promise.
  Scheduled from the `boundaryWork` registry on a checkpoint change and from `onSceneBreakConfirmed`.
- **Author review ring**: `components/drawer/StagecraftPanel.tsx` in the Scheduler tab — one card per
  change, the replacement text editable **before** it runs, accept/decline per op, dropped lines shown,
  and a last-pass line so a curator that stayed quiet is legible rather than mysterious.
- **Settings** (install-wide, off by default): `#so-curator-enabled` + `#so-curator-accept-mode`
  (`review` / `auto` / `off`), plus a notice when the played story lists no lorebook for it.
- **Manager budget**: `runtimeManager.ts` **676 → 630** lines (rule 3, net −46) while gaining the whole
  stagecraft surface: story import/select/restart/remove moved into `runtime/storySelection.ts`,
  mirroring `storyUpdate.ts` — the manager keeps the engine-facing half (`loadStory`).
- **Tooling**: `stagecraft: {action: "curate"|"accept"|"reject"|"accept-op"|"reject-op"|"apply"|"state"}`,
  `ui: {action: "stagecraft"|"curator-accept"|"curator-reject"}` (+ `so-ui.mts stagecraft |
  curator-accept | curator-reject`), `expect: {background}`, `expect: {stagecraft: {...}}`, `background`
  and `stagecraft` in `so-state current`, `storyOrchestratorDebugCuratorResponse`, and **journey J8**.

### Harness

- `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run debug:typecheck` ✓ · `npm run build` ✓
  (pre-existing bundle-size warnings only)
- `npm test` ✓ **60 suites / 1588 tests** (57/1548 before): new `src/stagecraft/stagecraft.test.ts` (18),
  `src/runtime/stagecraftCoordinator.test.ts` (12), `src/engine/stagecraftFormat.test.ts` (6), plus the
  background cases on `effectsApplier.test.ts`, the `stagecraft-changed` diff row, the wizard
  follow-up-op row, and a new `architecture.test.ts` guard.
- `npm run test-storybook:ci` ✓ **26 suites / 107 tests** (25/98 before): new `StagecraftPanel.stories.tsx`
  (7 stories incl. edit-before-accept and the two "nothing to do" states), plus `ToggleBackground`,
  `CuratorAllowlist` and the curator assertions on the DrawerTabs Scheduler story.

### Live — real LLM (gemma4-mtp @ :1235, headed, no `debugResponse` on the curator path), fresh-start

| Journey | Result | Notes |
|---|---|---|
| **J8 stagecraft** | **3 pass / 0 fail**, 1 human skipped | ran three times end to end, green each time; `SO-J8` cleanup `clean: true` with no leaked book **and no leftover selection** |
| J3 player-session (curator **off**) | 8 pass | regression floor held |
| J3 player-session (curator **on**) | 8 pass | enabling the flag on a story with no allowlist is correctly inert, and disturbs nothing |
| J5 group-direction | 5 pass / 1 blocked | identical to the plan-04 baseline (`epistemic-present` blocked) |

J8 proves, on the real model and against the real install: a checkpoint's `background` switches the ST
background both ways and re-applies on hydrate (J8.1); the curator read the real canon and proposed a
coherent patch, the author **edited the replacement text and accepted it**, the next boundary wrote it
into World Info, and the changed entry appeared in the captured generation payload (J8.2); and every
curator action was journaled while the blackboard, memory tiers, arcs, epistemic map and ledger were
byte-identical across the pass, with a write aimed outside `stagecraft.lorebooks` refused at the write
edge (J8.3). A representative real proposal:

```
[patch] "The washed road" (SO-J8 Lore) || The road to the tavern is flooded and impassable; nobody has crossed it in a week. || nobody has crossed it in a week. || it is now drained, leaving behind mud and driftwood.
[why] The flood has receded, allowing the characters to cross the road and reach the tavern.
```

Note what that response required of the parser: the model appended the lorebook name to the title and
used the *whole sentence* as its head anchor. The prefix-tolerant title match and the
`Math.max(headEnd, tailEnd)` span rule absorbed both — the v2 parser-tolerance lesson paying off again.

### Findings fixed during the live gate

1. **`world_info.globalSelect` is a debounced mirror, not the truth.** `/world state=on` pushes onto
   `selected_world_info` (world-info.js:5799); `globalSelect` is only assigned inside a *debounced*
   save (world-info.js:83). Reading it immediately after activating a book therefore returns the
   previous state — so `activateGlobalLorebook` reported failure for books it had just switched on,
   and a freshly provisioned lorebook intermittently failed to satisfy `requirements.lorebooks`.
   **This was a latent plan-06 bug**, not a plan-07 one: J9 only passed because it re-selected the
   story later, by which time the debounce had fired. Both `activateGlobalLorebook` and
   `listGlobalLorebooks` now read `selected_world_info`.
2. **Deleting a lorebook leaves its name selected**, so `requirements.lorebooks` read as satisfied for
   a book that no longer existed — which made one J8 run pass for the wrong reason.
   `listGlobalLorebooks` now intersects the selection with the books that actually exist, and
   `so-assets.mts remove` deselects what it deletes so a journey leaves no phantom active book.
3. **`runCuratorPass` conflated "declined to run" with "ran and found nothing"** (both `null`). A
   boundary-scheduled P4 pass was in flight, the journey's own call was refused, and the gate reported
   *"the curator proposed nothing"* about a call that was never made. It now returns
   `{ran, skipped?, record}` with a typed skip reason, and the `stagecraft: curate` verb waits for an
   in-flight pass and reports **its** result instead of racing it.
4. **A curator that says nothing was indistinguishable from a broken one.** `extras.stagecraft.lastPass`
   now keeps the prompt, the raw response, the proposal count and the dropped lines of the most recent
   pass — whatever the outcome — surfaced in the review ring and in the debug verbs. This is what
   turned finding 3 from a mystery into a five-minute diagnosis.

### Deviations

- **The review ring does not literally reuse `ProvisioningCard`.** The plan-03 import boundary forbids
  `components/drawer` → `studio` (and `architecture.test.ts` enforces it), and promoting a
  wizard-specific card into the shared `components/studio` primitives to dodge that would have been
  worse. `StagecraftPanel` reuses the *pattern* — one card per op, editable before it runs, applied by
  explicit review — which is the part that matters. Delegated decision "ring placement" resolved to
  the **drawer Scheduler tab** (author view): the author reviews mid-play, where the other off-path
  machinery already reports.
- **Two knobs, not one**: `curatorEnabled` is the capability flag (off by default) and `acceptMode` is
  `review | auto | off`, where `off` means "record and journal what it would do, write nothing". The
  plan named both; keeping them separate makes an observe-only trial run possible without losing the
  capability gate.
- **`storySelection.ts` is a refactor this plan did not ask for**, taken to satisfy rule 3 honestly
  rather than by shaving comments. It mirrors `storyUpdate.ts` exactly and is behaviour-preserving
  (J1/J2/J3/J10-covered paths: import, select, restart, remove).
- **Delegated: cadence caps** → one pass per 4 boundaries (`CURATOR_BOUNDARY_GAP`), max 4 ops per
  proposal, replacement text capped at 600 characters, proposal ring capped at 5.
- **Delegated: `background` as a curator input** → **no** for v2.1. The deterministic effect stays the
  only writer, so there is exactly one authority; the scene-setter (v2.2) inherits the question.
- **J8 ships 3 auto + 1 human**, exactly as the catalog reserved.

### Not done

- **Human eval**: J8.4 ("did the presentation feel handled for you?"), the curator rubric in
  `test-plan.md`, and the standing "what would make you stop using this?" are the user's to score.
- **The `auto`-as-default verdict** therefore stays open. The automated evidence supports it (three
  clean runs, every guard holding, one coherent proposal per pass), but the plan makes the default a
  *trust* decision and trust needs the human session. `review` remains the default and
  `curatorEnabled` remains off until then.
