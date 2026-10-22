# Plan 02 — Roster voice prevention

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md`); not built; owner decisions pending.** Implementation
tier **D** (schema, validation, renderer, per-speaker miner, Studio, tools, guide, payload goldens); wizard slice **CL**
(authoring route); acceptance **LT/RP** (real Artemis replies, thinking and inner voice on) + CL/independent rater. Overview
rules: `docs/plans/v2.8/00-overview.md` §Rules.

## What it is

- Characters sound more distinct **before** any rewrite is needed. Prevention only; no model call during play.
- One authored, bounded per-member delivery sheet, `roster[].polish`. **This plan owns its schema, validation, guide topic,
  mutations and tools.** v2.9 03 (per-character reply polish) reads the same block and adds nothing to it; 03 owns only the
  story-root run policy.
- Three readers in this plan:
  1. a delivery line in the **drafted member's own private block** (notes, preferred phrasing, avoid list, rhythm, the
     authored mood variant for the member's current mood);
  2. **per-speaker repetition**: the existing miner run per roster member over that member's own replies, plus the member's
     authored tics, fed back as "say it differently" lines to that member only, and shown per member in Author view;
  3. the wizard (v2.8 09): an ordinary edit card that proposes a sheet from the card's example dialogue.
- Precedence rule (Creative Studio P3): the sheet governs **wording of that member's own speech and delivery only**; it never
  changes facts, knowledge, agency or another member's lines, and never overrides the agency clauses.
- Out: token/logit bans, deterministic substitutions, automatic trait invention, a runtime attribution judge, changes to the
  warden's voice question, any rewrite of a rendered reply (v2.9 03).

## History and evidence

- Triage: `docs/plans/v2.9/01-triage-sol.md` §"02 — 02-roster-voice-prevention.md"; verdicts **V01** (PLAN 02), **V03** (FOLD
  02: per-speaker repetition and authored tics), **V06** (FOLD 02 measurement; runtime classifier v3.0), **V05** (SKIP
  substitutions; inspect/avoid portion taken in V03); audit **A07** (voice judging measures behaviour, not speech identity:
  keep behaviour consistency and speaker distinctness as separate scores); challenges 6 (token ban is not a phrase policy),
  8 (voice score is not a distinctness proxy), 16 (prevention is M, not S); build order step 2 (with v2.9 09, before 03).
- Research (`docs/plans/v2.8/extension-research-2026-10-21/`):
  - `per-character-polish.md` P1(1) (the `roster[].polish` block shape, caps, validation, Studio, wizard, guide), P2 (voice
    line in the drafted member's private block, "build first, measure alone"), P3 (per-speaker tic list, never delete words
    in code).
  - `creative-studio.md` P1 (authored voice field, three readers), P3 (voice beats card speech habits, scoped to speech,
    narration excluded), P4 (card text is reference data).
  - `nemopresetext.md` P1 (voice record: "record only when established, never invent a trait"; swap test as measurement).
  - `dooms-enhancement-suite.md` P4 / §For per-character polish (re-sent anchor through `addPrivateSource`; own note only on
    own lines; story-level "never" list outranks member lexicon).
  - `castward.md` P4 + host fact: `{{banned "…"}}` is a per-token ban on llama.cpp (`logit_bias`), `banned_strings` is not
    forwarded; any avoid list must be prompt-side.
  - `languagetool.md` P2 (`mineRepetitionBy`: per-speaker window, a phrase two members share is not one member's tic).
  - `niches.md` §For per-character polish (Façade tone alternates → mood-keyed notes; Versu per-character verbs; Bicking:
    trait over-indexing is a real LLM failure).
- **Where triage and research disagree, this plan follows the triage:**
  - `niches.md` layer 2 and the scout's NovelAI idea propose per-member `logit_bias` for `avoid`/tics. Triage Out + challenge
    6 + the Castward host fact: a token ban bans every token of the phrase. Prompt-side only.
  - `per-character-polish.md` names the tic field `banned_tics` ("to remove"). Here it is `tics`: watched, counted and steered
    against in the prompt; removal is v2.9 03's job, and "banned" would suggest the token ban this plan rules out.
  - `per-character-polish.md` (5) and `nemopresetext.md` P1 propose adding `polish.notes` to the warden voice input or a
    `voice-swap` judge use. Triage V06/A07: measurement only in 02; runtime classifier v3.0. The calibrated `voice` use's
    input stays unchanged (a changed input would invalidate its calibration row).
  - `per-character-polish.md` P1 puts the story-root `polish` policy and `narration` sheet in the same schema. Triage
    assigns runtime polish to 03; this plan defines the member sheet type once (`DeliverySheet`) so 03's `polish.narration`
    reuses it.
- Prior verdicts: v2.8 `61-harvest-triage-2026-10-14.md` R40 SKIP (per-roster TTS voice, a different feature; the field is
  named `polish`, not `voice`, to avoid that clash, `stHost/voiceStart.ts`, and the `voices` story feature id).

## Current state in code

Verified on `6861d989`.

- **No delivery field.** `RosterMember` (`src/engine/schema.ts:326-338`) has `id`, `name`, `role`, `drive`, `view`,
  `aliases`, `card`, `sprites`, `relationships`, `mood`, `agenda`, `schedule`, `factions`, `commitments`. `readRoster`
  (`src/engine/validate/checkpoints.ts:43-49`) trims `role`/`drive` (`readMemberText`, `:16-24`) and dedupes aliases.
- **Private block assembly.** `MemoryInjector.memberBlock` (`src/runtime/memoryInjector.ts:120-130`) joins the inner-render
  aims block (or the bare epistemic block when the inner chunk is not loaded), life lines, then `sourcedLines`.
  `addPrivateSource` (`:136-138`) registers `(rosterId) => string[]`; `sourcedLines` (`:140-143`) passes every source through
  `withoutSecretLines` (`src/memory/heldSecrets.ts:71`). Existing sources: promises, rumors, carry, narrator sheet
  (`src/runtime/managerWiring.ts:81, 96, 147, 152`). Rendering through this path does not depend on the inner voice switch
  or a life declaration, **but registering a source does not ensure delivery**:
  - `update()` stages private blocks only when `capable || voiced || story.life || story.factions?.length ||
    story.carry_from || hasNarratedSheet(story)` (`src/runtime/memoryInjector.ts:192`); registered sources are not part of
    that predicate, so a plain member with only a sheet gets nothing staged.
  - `onMemberDrafted` returns when nothing is staged (`:274`).
  - On a draft it rebuilds the block only for a beat or an `omniscient` member (`:288-289`); otherwise it reuses the
    block staged at the last `update()`, so a per-draft source (per-speaker repetition) would go stale between members
    of one group round.
  - Precedent for both: the narrator sheet's `hasNarratedSheet` predicate (`src/runtime/narratorSheetPort.ts:9`), lazy
    kit load + refresh (`:49-52`), and the `narrates` rebuild branch (`memoryInjector.ts:288`).
  - `secrets()` returns `[]` when epistemic capability is off (`:223`); `withoutSecretLines` is a content check through
    `keptFrom` (`src/memory/heldSecrets.ts:51, 71`), not a name filter.
- **Own aims.** `renderOwnAims` (`src/memory/innerRender.ts:85-92`) renders drive/motive/beat from `castVoices`
  (`src/memory/innerVoice.ts:49-56`), lazy inner-render chunk. Delivery must not ride this path: a story that switches the
  inner voice off (`features.inner`) would lose it, and vice versa.
- **Mood.** `MoodDecl {values, baseline, lasts}` (`src/engine/lifeSchema.ts:49-53`), rendered "Your mood right now: X"
  (`src/engine/life/lines.ts:60`) through the lazy game layer; `effectiveMood` in `src/engine/life/presence.ts`.
- **Repetition is pooled and author-only.** `mineRepetition` (`src/stagecraft/repetition.ts:65-78`: 3-8-word grams in the
  latest reply seen in ≥2 of the previous 5, ≤4 hot, plus `STOCK_CONSTRUCTIONS` `:26-31`); `replyTexts` (`:80-84`) keeps
  every non-user, non-system row regardless of speaker. Snapshot runs it only in Author view (`src/runtime/snapshotBuilder.ts:348`).
  Warden family `repetition` (`src/stagecraft/warden.ts:52, 77, 103`) is an idea flag.
- **Voice judge measures behaviour.** `voiceProfile` (`src/runtime/continuity.ts:86-92`) sends role, drive, feelings;
  `VOICE_QUESTION` (`src/judge/warden.ts:82-85`) asks about speech or behaviour against them; `VOICE_SCORE` 0.75
  (`src/judge/policy.ts:86`). Nothing measures cadence or interchangeability (A07).
- **Speaker resolution.** `rosterIdForName` (`src/runtime/roster.ts:77-82`) matches card name only (no aliases) and
  returns the **first** match (`.find`, `:80`); it never reports a collision.
- **Authoring seams.** `setRosterDrive` (`src/studio/innerVoiceMutations.ts:9-12`), agent op (`src/copilot/agent/agentOnly.ts:27`),
  tool spec (`src/copilot/agent/tools.ts:123`), member coverage (`src/studio/coverage.ts:64-67`). Card review checks example
  blocks only for a missing `{{char}}:` line (`src/wizard/cardChecks.ts:110-111`).
- **Story diff.** `diffRoster` (`src/engine/storyDiff.ts:315-324`) reports any changed member field as `compatible`
  `roster-member-changed`.
- **Feature ids.** `FEATURE_POLICY_FIELDS` (`src/engine/featurePolicy.ts:15-40`) already uses `voices` (several voices per
  turn) and `inner`; registry `inner-voice` at `src/features/registry.ts:246`. Chat overrides live in `extras.overrides`
  (`src/runtime/settingsControl.ts:45-48`) and feed `resolveFeatures(getGlobalSettings(), story, extras.overrides)`
  (`src/runtime/snapshotBuilder.ts:440`).
- **Game layer detection.** `usesGameLayer` (`src/engine/validate/gameLayer.ts:25-32`) is a closed field list; roster
  `mood` is in `LIFE_FIELDS` (`:21`). `readRoster` runs in main validation, outside the game layer.
- **Story update.** `applyStoryUpdate` swaps the played story with pruned engine state and history only
  (`src/runtime/storyUpdate.ts:175-177`); no extras reconciliation runs.
- **No bans.** `grep banned src/` finds nothing. `src/runtime/playerProjection.ts` references no roster field.
- Guide: `roster` topic `docs/authoring/story-guide.md:97`, `drives-motives` `:107`, `inner-voice` `:117`.

## Options

| Design | Cost | Risk |
|---|---|---|
| A. Delivery line inside `renderOwnAims` | S | dies with the inner voice switch or an unloaded inner chunk; couples two features |
| **B. Own private source via `addPrivateSource` (chosen)** | S–M | one more line per drafted member; prompt-cache shift inside the private block only |
| C. Card-scoped ST regex / sampler `logit_bias` for avoid and tics | M | token ban on llama.cpp (Castward host fact); host-owned config; triage Out |
| D. Delivery in a shared tier or author's note | S | every member reads every sheet; breaks "own note only on own lines" |
| E. Per-speaker repetition from a stored ring | M | new extras slice, rollback detector; nothing gained over deriving from the chat |
| **F. Per-speaker repetition derived from chat at draft time (chosen)** | S | attribution errors on narrator rows; handled by quote exclusion |

## Recommendation

### Schema (this plan is the single owner)

```
type DeliveryRhythm = "clipped" | "plain" | "flowing" | "ornate";
interface DeliverySheet {
  notes?: string;                    // ≤ 300 chars: register, sentence habits, what they never say aloud
  prefer?: string[];                 // ≤ 12 × ≤ 40 chars: words and turns of phrase that are theirs
  avoid?: string[];                  // ≤ 20 × ≤ 40: words they would not use
  tics?: string[];                   // ≤ 12 × ≤ 40: model habits watched in their replies ("smirks", "a mix of")
  rhythm?: DeliveryRhythm;
  by_mood?: Record<string, string>;  // mood value -> ≤ 160 chars of delivery for that mood
}
interface RosterPolish extends DeliverySheet {
  dialogue?: "keep" | "voice";       // read only by v2.9 03; validated here; default keep
  enabled?: boolean;                 // default true when the block exists
}
RosterMember.polish?: RosterPolish
```

- **Single owner.** `engine/deliverySchema.ts` exports exactly `DeliveryRhythm`, `DeliverySheet`, `RosterPolish` and
  `NarrationSheet = Omit<DeliverySheet, "by_mood">`, plus their caps (`DELIVERY_CAPS`) and readers in
  `validate/delivery.ts`: `readDeliverySheet(raw, ctx)` (shared field rules), `readRosterPolish(raw, member, ctx)` (adds
  `dialogue`, `enabled`, `by_mood`) and `readNarrationSheet(raw, ctx)` (refuses `by_mood`, `dialogue`, `enabled`).
  v2.9 03 imports these as they are:
  - `roster[].polish` is `RosterPolish` and nothing else; 03 reads `tics` (not `banned_tics`), `avoid`, `prefer`,
    `notes`, `rhythm`, `dialogue`, `enabled`, and adds no member field;
  - 03's story-root `polish.narration` is `NarrationSheet`, validated by `readNarrationSheet`; 03 owns only the
    story-root `polish.mode` around it;
  - a new member field, a cap change or a renamed field is an amendment to this plan first, then 03 follows.
- No story-root field in this plan. Story feature policy gets `delivery: { enabled: toggle, repetition: toggle }` in
  `FEATURE_POLICY_FIELDS` (`voices`/`inner` are taken).
- **Settings precedence** (09's resolver, no side path): install master `characters.delivery` → authored story
  `features.delivery` → chat override in `extras.overrides.delivery` (written through `SettingsControl.feature`,
  `settingsControl.ts:45`). `extras.ui` holds nothing for this feature. Controls registered through the feature registry
  (`FEATURE_CONTROLS`); this plan extends 09's state mapping and its parity fixtures for `delivery.enabled` and
  `delivery.repetition` when it lands.
- **New-only stories.** `roster[].polish` is read by `readRoster` in main validation, so a story whose only new content is
  sheets needs no game-layer detection change (`gameLayer.ts:25`); `by_mood` requires `mood`, which already triggers the
  game layer (`LIFE_FIELDS`, `:21`). The delivery chunk and its private-block staging are activated by the
  `hasDeliverySheet(story)` predicate (S2), never by life, inner voice or epistemic capability.
- **Story update.** Nothing is stored in extras: the line and the per-speaker readout are derived at draft time from the
  played story, so a hot-swapped sheet takes effect at the next draft and no reconciliation hook is needed. A test pins
  "update a sheet → next drafted block carries the new sheet, no residue of the old".

### Slices

1. **S1 Schema and validation (D).** `engine/deliverySchema.ts`, `validate/delivery.ts` called from `readRoster`:
   - caps above (error past a cap, trimmed strings, empty block dropped);
   - `prefer`/`avoid` overlap (case-folded) = error;
   - a `tics`/`avoid` entry equal to a roster name, alias or codex name = error;
   - `by_mood` on a member without `mood`, or a key outside `mood.values` = error (mood check runs through the game layer
     only when `life` exists; without `life`, any `by_mood` is an error, the rest of the sheet is valid);
   - `notes`/`by_mood` text naming an entity `knownEntities` does not know: warning `delivery-names-unknown-entity`;
     text whose subject is the player (`{{user}}`, player names, "the player"): warning `delivery-directs-player`
     ("A voice note says how this character speaks, never what the player does.");
   - rendered sheet over `DELIVERY_TOKEN_CAP` (120): warning `delivery-over-budget` (what gets cut, see S2);
   - `storyDiff`: unchanged, `roster-member-changed` stays `compatible` (presentation); a test pins it.
   - Guide topic `<!-- topic: roster-polish -->` under `roster`, compact twin in `src/copilot/guideTopics.ts`, coverage via
     `guideCoverage.test.ts`; copy says plainly: "changes how they word things, never what happens or what they know".
2. **S2 Private delivery line (D).** Lazy chunk `delivery` (renderer + per-speaker miner), loaded when a story is loaded and
   `delivery.enabled`. Registered with `memory.injector.addPrivateSource` in `managerWiring.ts` next to the narrator sheet,
   so `withoutSecretLines` applies and nothing reaches the resting block.
   - **Activation and staging.** Registering the source is not enough (`memoryInjector.ts:192, 274`). Add
     `hasDeliverySheet(story)` (a member with an enabled `polish` block, or `delivery.repetition` on with any roster
     member; `runtime/deliveryPort.ts`, the `narratorSheetPort.ts:9` pattern) to the staging predicate at `:192`. The
     port loads the chunk on story load/hydrate when the predicate holds; a draft before the chunk resolves gets no line
     and refreshes on load (the narrator-sheet precedent, `narratorSheetPort.ts:49-52`); the count of such drafts is
     reported.
   - **Fresh per draft.** `onMemberDrafted` rebuilds the drafted member's block synchronously before prompt assembly when
     the member has a delivery source (extend the `beat || narrates` branch at `:288-289` with `delivers`), so per-speaker
     repetition is recomputed for each member of a group round instead of reusing the block staged at `update()`.
     Existing beat, narrator and epistemic paths are unchanged; thinking and inner voice untouched.
   - Fixtures (jest + payload goldens): a story with only `roster[].polish` (no drive/motive/life/factions/carry/narrated
     quality), epistemic capability off, no inner beat → the drafted member's block carries its line; a two-member group
     round where member A's reply adds a hot phrase → member B's block (drafted next) and A's next block each reflect
     their own window.
   - Render (drafted member only, own sheet only):
     `How you speak (wording only; it never changes what you know, want or do): <notes>. Right now (<mood>): <by_mood>.`
     `Rhythm: <rhythm>. Words that are yours: … Say it your own way instead of: …`
   - Budget: estimated tokens (chars/4, as `estimateCardTextTokens`) ≤ 120 incl. S3 lines; drop order last-first: prefer →
     avoid → repetition lines → rhythm; `notes` and the mood line are never cut mid-sentence (whole-sentence trim).
   - `enabled: false`, story `features.delivery` off, or install setting off → no line. Independent of `features.inner`,
     `memory.innerBeat` and life.
   - Install setting `characters.delivery` (`settingsModel.ts`, default true, delta-stored), registry entry
     `character-delivery` (area characters, audience author, `guideTopic: "roster-polish"`, status shipped once built),
     control `#so-feature-delivery-enabled`; `npm run docs:settings`.
   - Payload goldens: new `test/scenarios/payload/delivery-*.json` (drafted A, drafted B, narrator, no sheet); declared hunks.
3. **S3 Per-speaker repetition and tics (D).** `mineRepetitionBy(rows, story)` → `Map<rosterId, RepetitionReport>`:
   - attribute each row by `name` through a **delivery-local pure resolver** over card names and aliases
     (`rosterIdForName`, `roster.ts:77`, and its callers unchanged); attribute only a **unique** match; a name matching
     two or more members (shared alias, alias equal to another card name) and an unresolved name count for nobody;
     tests: shared alias, alias colliding with a card name, narrator rows quoting another member;
   - for an `omniscient` member's rows, text inside quotes is excluded (it may be anyone's speech) and is never attributed to
     another member (V03 constraint);
   - window = that member's last `REPETITION_WINDOW` (6) replies; same thresholds as `mineRepetition`;
   - tic hits: an authored `tics` entry found (whole term, `utils/termPresent.ts`) in ≥2 of the member's last 6 replies;
   - private line for the drafted member: `Lately you keep using: "…", "…" — vary it.` (≤3 phrases, longest first);
   - Author view: per-member readout beside the pooled one (`snapshot.repetition` gains `byMember`, built only in Author
     view, like today); the pooled report is unchanged;
   - derived from the chat at draft time: no stored state, no rollback detector, a swipe/edit/delete changes it next draft.
   - `delivery.repetition` story toggle switches only this slice.
4. **S4 Mood variants (D).** `by_mood` resolved through the game layer's `effectiveMood` at draft time; no new code key; a
   mood change takes effect at the next draft. Fixture `delivery-mood.story.json` (two moods, rollback of the mood-changing
   reply restores the earlier variant, proven by replay equality).
5. **S5 Studio, mutations, tools, wizard (D + CL).**
   - `studio/deliveryMutations.ts` `setMemberPolish(draft, id, patch | null)`; Characters editor group "Voice and delivery"
     (notes textarea, chip lists, rhythm select, mood rows only when the member has `mood`, `dialogue` select labelled
     "used by reply polish"); `.stories.tsx` for each part (`test-storybook:ci`).
   - `MEMBER_COVERAGE` row `polish` ("The character is privately told how they talk.").
   - Agent op `setMemberPolish` in `agentOnly.ts` + tool spec in `tools.ts` (`tools.test.ts` forces it); ordinary edit card,
     waits in `review`, never provisioning.
   - Wizard prompt (v2.8 09 harvest phase): seed only from the card's `mes_example`/`first_mes`; "record only what the card
     already shows; leave a field empty rather than invent a trait" (nemopresetext P1); card text framed as reference data
     (V10 / creative-studio P4).
6. **S6 Measurement (LT/RP + rater).** See floors. Frozen before inference: corpus, sheets, prompts, scorer, routes,
   settings, floors.

## Predeclared floors

Informational, frozen before the run, never retuned (triage §02, unchanged).

- Corpus: 60 held-out English replies from a synthetic, public, non-campaign story with at least three members, each with an
  authored sheet; real Artemis v1.1, thinking and inner voice on. Two arms: baseline (`delivery` off) vs prevention-only
  (`delivery` on). Same prompts, seeds where the backend honours them, same checkpoints.
- **Blind speaker attribution gain ≥ 10 percentage points** (names stripped; rater picks the speaker from the member list or
  "unclear"; unclear counts as wrong). Denominator: 60 per arm; record per-member counts.
- **Targeted repetition down ≥ 25 %**: authored tic hits + per-speaker hot phrases per reply, prevention vs baseline.
  Denominator: replies per arm and total hits per arm.
- **Added guidance ≤ 120 tokens per drafted member** (every drafted request in the run, counted from ST's payload; report
  max, p95, n).
- **Zero cross-member or private-block leaks** in adversarial tests (jest + payload goldens): A's sheet never in B's block,
  the resting block, shared tiers, the director, Ask's player projection or any player surface; a sheet line restating a held
  secret is dropped by `withoutSecretLines`, including a secret restated with only known names and a secret introduced
  after the sheet was authored. Denominator: number of planted cases.
- Recorded alongside, not floors: behaviour-consistency score (existing warden `voice`) per arm kept separate from
  attribution (A07); abstentions; rater route and its own self-agreement on a 10-reply repeat.

## Gates by tier

- S1, S3, S4: `npm run typecheck && npm run lint && npm test` + `npm run typecheck:test` (pure modules, tests changed).
- S2, S5: above + `npm run build` (main bundle ≤ 1,300,000 B; delivery code in its lazy chunk, `lazyHarness.guard`-style
  test that the main entry does not import the renderer) + payload golden capture/diff + live gate via `debug` skill on a
  lane (30+): `st-navigation.mts recent-group` → `so-state.mts current` → payload check that the drafted member's block
  holds its own line and no other member's. Chat-path change: real generation (`send_generate`) on a lane, never lane 0.
- S5 wizard: real authoring route (opencode `openai/gpt-6.1-sol`) proposing a sheet as an edit card; no `debugResponse`.
- `npm run gates:quick` per change; `npm run gates` (Storybook included) closes the plan.
- S6: LT (local 3090 in an authorized window) or RP; neither is authorized by this plan. If it cannot run, the acceptance
  row stays NOT green.
- Docs: `docs/authoring/story-guide.md`, `npm run docs:guide`, `npm run docs:settings`.

## Privacy and spoiler notes

- The sheet is authored content of one member and reaches only that member's private block; it is filtered like every other
  private source (`withoutSecretLines`). The resting block, shared tiers, ledger, WI mirror, canon, director and every
  player surface never carry it; player surfaces are byte-identical with and without sheets (test).
- Mined phrases come from the member's own visible replies (already shared transcript); they still pass the private filter.
- Author view shows sheets and per-member readouts; `so-ui.mts assert-player-clean` stays green.
- A sheet naming a hidden entity is a warning, not a leak: it reaches only the member, but the guide tells authors not to.
- No campaign content in fixtures or this repo; campaign adoption is a separate owner decision, reviewed by another model,
  reported as counts only.

## Invariants touched

- **Layering:** no host access; renderer and miner are pure, called from the runtime layer; engine schema/validation pure.
- **Coordinators:** none added; the source registers in `managerWiring` like the narrator sheet.
- **Held secrets / shared tiers:** private-only path with `withoutSecretLines`; resting block stays empty in groups.
- **Disclosure is not knowledge:** the sheet discloses nothing to the player and writes no epistemic row.
- **Rollback ≡ replay:** nothing stored; repetition and mood variants are derived at draft time; property test over
  swipe/edit/delete cuts.
- **One snapshot:** per-member readout rides `snapshot.repetition`; components read only the snapshot.
- **Every built feature on:** `characters.delivery` and `features.delivery` default on.
- **Thinking and inner voice stay on:** independent of `features.inner`, the reply thinking budget and `extra.reasoning`.
- **Main bundle budget:** lazy chunk; validation caps in main are small.
- **No host bans / sampler keys:** nothing added to `TEXTGEN_BUDGET_KEYS` or the sampler overlay.
- **Wizard create-only / author confirms:** `setMemberPolish` is an edit op, never provisioning.
- **Guide coverage:** `roster-polish` topic required by `guideCoverage.test.ts`.

## Dependencies and links

- v2.8 51 (private line reaches only its holder; secret-label filtering) and v2.8 54 (per-draft rebuild, revision binding) as
  the contracts the private line follows.
- v2.8 09 §Harvest phase for the wizard slice (S5 prompt lines, card-quality notes).
- v2.9 03 consumes `RosterPolish` (`tics` as removal targets, `dialogue`, `rhythm`, `notes`), `NarrationSheet` +
  `readNarrationSheet` for its story-root `polish.narration`, and the per-speaker miner (with its unique-match resolver) as
  its signal; 03 must not extend the member block or the narration sheet without amending this plan. 03 was aligned on 2026-10-21 (`tics`, `NarrationSheet`, `readNarrationSheet`).
- v2.9 04 (reactive cues) uses the sheet for delivery only.
- v2.9 09 runs in the same build step (Help must list `character-delivery`).
- Triage V06/A07: runtime attribution classifier deferred to v3.0; reopen only on calibrated held-out discrimination.

## Decisions for the owner

1. Approve the authored field `roster[].polish` (name shared with v2.9 03) and the Studio "Voice and delivery" group.
2. Approve mood variants (`by_mood`) keyed to authored life moods, or ship the base sheet only.
3. Mined repetition lines for every story by default (on by default rule), or only for members with an authored sheet.
4. Rater route for attribution: default opencode `openai/gpt-6.1-sol` (AGENTS.md rating default; Artemis wrote the
   replies, so it is independent), DeepSeek only as fallback when sol cannot answer, recorded per row. Approving the
   route authorizes no model time, GPU window or pod; the S6 window is a separate decision (none authorized here).
5. Campaign adoption after S6, from count-only results, reviewed by another model.

## Unresolved questions

- "Say it your own way instead of: …" may prime the listed words (negative-instruction effect); measure avoid-on vs
  avoid-off inside S6, or render authored `avoid` only?
- Should the per-member readout feed the warden `repetition` idea with the member's name, or stay a readout?
- Cap `notes` at 300 chars (prompt budget) while v2.9 03's polish prompt might want more: one cap for both, or a longer
  author-only field later?

## Review 2026-10-21 (sol)

- **P1 — private source registration does not ensure delivery: applied.** Current state now cites the staging predicate
  (`memoryInjector.ts:192`), the empty-stage return (`:274`) and block reuse on draft (`:288-289`). S2 adds
  `hasDeliverySheet` to the staging predicate, a lazy port on the narrator-sheet pattern, and a synchronous rebuild of the
  drafted member's block (`delivers` beside `beat || narrates`); fixtures with only `roster[].polish`, epistemic off, no
  drive/motive/life, no inner beat, and per-member repetition refresh within one group round. Thinking and inner voice
  unchanged.
- **P2 — attribution must reject ambiguity: applied.** S3 uses a delivery-local pure resolver over card names and aliases,
  unique match only; collisions and unresolved rows count for nobody (first-match lookup at `roster.ts:80` unchanged).
  Tests for shared aliases and narrator quotations. The all-callers alternative is removed from Unresolved questions.
- **P2 cross-plan — model routing: applied.** Decision 4: sol default rater, DeepSeek fallback only, recorded per row;
  approval authorizes no model time, GPU window or pod.
- **P1 cross-plan — settings through `FEATURE_POLICY_FIELDS` / `extras.overrides`: applied.** Precedence install
  `characters.delivery` → story `features.delivery` → `extras.overrides.delivery`; nothing in `extras.ui`; this plan
  extends 09's state mapping and parity fixtures.
- **P1 cross-plan — new-only stories activate their chunk: applied.** Sheets are read in main validation (no game-layer
  detection change needed, `gameLayer.ts:25`); `by_mood` needs `mood`, already in `LIFE_FIELDS` (`:21`); the delivery
  chunk and staging hang on `hasDeliverySheet`. The sheet-only fixture is the feature-only fixture.
- **P1 cross-plan — held-secret content filter: already covered, test added.** The sheet is private, per recipient,
  through `withoutSecretLines` (content check via `keptFrom`, `heldSecrets.ts:51, 71`); no public projection carries it.
  Leak floor cases now include a secret restated with known names only and one introduced after authoring.
- **P1 cross-plan — story-update reconciliation of extras: not applicable.** This plan stores nothing in extras; lines and
  readouts derive at draft time from the played story (`storyUpdate.ts:175-177` swaps the story); a test pins that an
  updated sheet leaves no residue.
- **Schema ownership (caller request): applied.** `deliverySchema.ts` exports `DeliverySheet`, `RosterPolish`,
  `NarrationSheet` and readers; 03 reuses them exactly and adds no member field. 03 aligned the same day.
- Floors unchanged.

## Gate record 2026-10-21 (v2.9 build, branch v2.9-02-voice)

Scope: owner decisions 2026-10-21 (`00-overview.md`): field, Studio group, `by_mood`, mined repetition for every story, rater
route recorded only. S1-S5 built; S6 not run.

- **S1** `engine/deliverySchema.ts` (`DeliveryRhythm`, `DeliverySheet`, `RosterPolish`, `NarrationSheet`, `DELIVERY_CAPS`,
  `DELIVERY_TOKEN_CAP`, `polishOn`), `engine/validate/delivery.ts` (`readDeliverySheet`, `readRosterPolish`,
  `readNarrationSheet`, `deliveryNames`), called from `readRoster` with roster + codex names. Errors: caps, prefer/avoid overlap,
  name in tics/avoid, `by_mood` without mood or outside its values (default mood values honoured), unknown keys. Warnings in
  `studio/deliveryDiagnostics.ts`: `delivery-names-unknown-entity`, `delivery-directs-player`, `delivery-over-budget`.
  `storyDiff` unchanged (`roster-member-changed` compatible, pinned). Guide topic `roster-polish` + compact twin.
- **S2** lazy chunk `runtime/delivery/{kit,render,mine}.ts`; main-side `runtime/deliveryPort.ts` (`hasDeliverySheet`,
  `memberDelivers`, lazy load + refresh, early-draft count). `MemoryInjector.addPrivateSource(source, staging)` adds the
  staging predicate and per-draft rebuild (`delivers` beside `beat || narrates`); wired in `managerWiring.wireDelivery`.
  Feature `delivery {enabled, repetition}` in `FEATURE_POLICY_FIELDS`/`FEATURE_CONTROLS`; install `characters.delivery`,
  `characters.deliveryRepetition` (new `characters` settings section, default on); registry `character-delivery`.
  Budget 120 tokens, cut order prefer, avoid, repetition, rhythm, note sentences, mood line.
- **S3** `mineRepetitionBy`: unique-match resolver over card names + aliases, omniscient quotes excluded, own last 6 replies,
  tics in >= 2; private line; `snapshot.repetition.byMember` (Author view, `StagecraftPanel` rows).
- **S4** `by_mood` through `gameLayer().life.effectiveMood` (added to the game layer's `life`); rollback = replay test.
- **S5** `studio/deliveryMutations.ts` `setMemberPolish`; `VoiceDeliveryEditor` (Characters › Roster, "Voice and delivery")
  + stories; coverage row `polish`; agent op/tool `setMemberPolish` (edit family, validated by `readRosterPolish` in
  `agentOnlyProblem`); wizard prompt line (seed from card example/first message only, card text is reference data, never
  invent a trait).
- Payload case `test/scenarios/payload/group-delivery.json` written (schema-valid), **not captured**.

Commands (final tree):
- `npm run gates -- --jobs=3`: **all green in 409.6s** (test:replay, test 849 suites / 9821 tests, build, typecheck,
  test:debug, lint, typecheck:test, debug:typecheck, test:release, test:plugin, test-storybook:ci 157 suites / 947 tests).
  Earlier full runs on this branch went red on real gaps fixed here (guide bundle, arrival golden, error-copy inventory,
  plan 24 matrix row) and on environment collisions: port 6006 held by a parallel builder's Storybook (EADDRINUSE),
  `childTree` and OpenCode boot timing tests under load, `SettingsPanel` ConnectionsHoldTheInstallServices under load
  (passes alone on the same static build).
- Main bundle 1,298,414 B (budget 1,300,000): delivery renderer/miner stay out of the entry (`lazyHarness.guard` rows + planted control).

NOT run:
- S6 measurement (attribution, repetition, token floors): NOT run: no GPU (owner 2026-10-21).
- S5 wizard real-route check (opencode sol): NOT run (no model time authorized in this pass).
- No-model lane 42 live check and payload golden capture: NOT run. A lane serves the one staged `dist/` in the owner's ST
  extension slot; staging this branch would replace the owner's served build and collide with the other v2.9 builders.

Deviations: payload goldens and the live payload check are fixture-only; the per-draft early-draft count is exposed by the
port (`earlyDrafts`) but not surfaced in the UI; 09's resolver mapping/parity fixtures not extended (09 is not on this branch's base).
