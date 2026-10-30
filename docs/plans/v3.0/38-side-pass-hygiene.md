# v3.0 38 — Side-pass hygiene bundle

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`). Nothing built. Size: S each, M total.
Small, independent items in the v2.8 69 bundle style, landed separately by gate class: privacy tests (H4, H5), checks (H6),
parser (H1), prompt (H2), vector order (H7).

## Problem

- A director or wizard answer with a trailing comma costs a whole retry on the remote route.
- Retry feedback echoes unbounded model text back into the next prompt.
- "Every feature on by default" is only honest if switching one off really removes its data from every prompt.
- Injected blocks can print empty labels (`(, attitude: )`), wasting tokens and churning the prefix when a field flips.
- Two extensions can silently corrupt what SO reads: an in-reply tracker footer, and a `fetch` wrapper that rewrites every
  generation body.
- Vector consolidation re-embeds the same text three times per row.

## Evidence

- Harvest 2026-10-30: `lattice.md` P3 (local JSON syntax repair, `model-json.js`), P4 (closed-vocabulary retry feedback);
  `dooms-enhancement-suite.md` P3 (off means unseen, three leaks after a switch
  went off); `bb-interactive-map.md` P4 (no empty labels); `simply-loreandtracker.md` P1 (footer conflict row);
  SUMMARY §Security (TavernOS HUD wraps `window.fetch`, deserves an info check like `transcript-copiers`); `vectfox.md` P1.
- Ours: `normalizeJsonText` strips fences only (`src/utils/json.ts:1-7`); living parse slices `{…}` and returns `null`
  (`src/generation/living/parse.ts:35-43`); retry echo `src/generation/living/prompt.ts:99`;
  payload goldens have no feature-off cases (`test/scenarios/payload/`); conflicts list
  `src/services/stHost/extensionConflicts.ts:61-65`; consolidation queries 3x per row (`src/runtime/consolidationMatches.ts:28-35`).

## Items

- **H1 JSON repair.** Pure `repairJson` in `src/utils/json.ts`: after a strict parse fails, drop trailing commas, comments
  outside strings, convert single-quoted strings, escape raw control chars; never complete, infer or pick a fragment; size
  bound; then the full validator. Used by `generation/parse.ts`, `living/parse.ts`, `copilot/parse.ts`; the model-call row
  records `repaired: true`. First count parse-stage refusals in recorded runs; build only if >= 1 in 50 director/wizard
  calls. MIT: rewrite, not port.
- **H2 Bounded retry feedback.** Retry issues: at most 16, each <= 160 chars, model-produced strings quoted as data
  (`"…"`), never the rejected answer. Test: a critic issue containing an instruction does not change the next prompt's
  header lines.
- **H3 Naming hint: dropped (Sol review).** Living ops and encounters only use existing cast/canon people
  (`src/generation/living/types.ts:35`, `living/prompt.ts:71`, `generation/encounters.ts:44`); no op creates a person, so
  there is nothing to hint. Reopen with a person-creation path and a measured name-collapse problem.
- **H4 Off means unseen.** Generated payload golden case per **chat-overridable** feature id with a stored slice
  (enumerated from `src/engine/featurePolicy.ts:15`, not a hand list: codex, factions, labels and carry are not switches;
  witness has no prompt consumer yet and is excluded until one exists). Each case first proves, switch on, that the seeded
  slice reaches the tested consumer (positive control); then chat override off -> `expect.payloadAbsent` on every `story_*` block, the
  recap, canon and next-turn preview ("row in store AND no live rows", gotchas). A leak found here is a defect (fix-now).
- **H5 No empty labels.** One assertion over golden blocks: fails on `\(\s*,`, `:\s*[,.)]`, or a label line with nothing
  after the colon.
- **H6 Conflict rows.** `extensionConflicts.ts`: `reply-tracker-footer` (Simply-LoreAndTracker, folder + key + flag from the
  report) as a `degrades` check, feature `memory`; `generation-body-rewriter` (TavernOS HUD folder) as `info`, the
  `transcript-copiers` shape. Firing fixtures. Do not strip footer text from the read window without a measured fixture.
- **H7 Nested vector thresholds.** Every row is in the collection, so raw results always hold the row itself: remove self
  first, then decide. Query same-topic (0.55) first; no other row -> skip the dup queries; then 0.82, skip 0.88 when
  empty. Only when the configured thresholds are ordered (assert; else query all). Same `MatchSets`. Also
  `createNearDups.ts` two bands.

## Invariants touched

- Owner rule 2 (blind rating): H2 changes the director's retry prompt on the authoring route and H1 changes which
  authoring answers are accepted. Neither changes play prose directly, but both change future graph content: gate them on
  replay of recorded director/wizard calls (H1: every accepted document equals the strict parse of the hand-fixed text;
  H2: refusal-after-retry rate on >= 25 recorded retries not worse than control, CL). If the owner counts director output
  as player-facing, add a blind rating before adoption (owner question).
- Held secrets: H4 is a privacy-adjacent proof.
- Prefix (13): H5 reduces churn; no item adds per-turn text to the play prompt.
- One check registry (H6): consequence + player copy + firing fixture.
- Floors untouched (H7 is an order change, thresholds unchanged).
- Thinking and inner voice untouched.

## Floors (predeclared, informational)

- H1: 0 accepted documents that differ from a strict parse of the hand-fixed text over 40 malformed fixtures; 0 repairs
  of truncated documents.
- H2: refusal after retry not worse than control on >= 25 recorded retries (header bytes unchanged is a structural test
  of layout only, not proof that quoted feedback cannot steer the model).
- H4: 0 leaks across all features (any leak is fixed, not recorded).
- H7: identical match sets on 50 groups (self-match fixtures included); query count down (record).

## Tests and gates

- jest per item; payload goldens (H4, H5) via `so-payload-golden capture` + `diff`; `checksRegistry.test.ts` (H6);
  counting fake `VectorHost` (H7).
- `npm run gates` per landing; live gate no-model lane for H4/H6.

## GPU / rating

- None on the play route. H2 CL replays recorded calls on the authoring model (opencode `openai/gpt-6.1-sol`, subscription).

## Unresolved questions

- H6 `generation-body-rewriter`: detect TavernOS by folder only, or also probe `window.fetch !== nativeFetch`? Default
  folder + settings key (a probe would flag our own debug wrappers).
